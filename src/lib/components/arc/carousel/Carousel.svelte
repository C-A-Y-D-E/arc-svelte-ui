<script module lang="ts">
	export type SlideLabel = (index: number, count: number) => string;
</script>

<!--
	A row of slides people browse by dragging, flicking, a trackpad swipe, the arrow keys, or the controls below it. Use it for a short,
	ordered set of peers such as products or case studies, where the neighbours stay in view as a hint that there is more.
	The active slide sits in the center, its neighbours shrink and dim with distance, and the page indicator stretches into a pill that
	travels with the slides frame by frame.
-->
<script lang="ts" generics="Item">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { animate, motionValue, styleEffect, type AnimationPlaybackControls } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import CarouselDot from './CarouselDot.svelte';
	import CarouselSlide from './CarouselSlide.svelte';
	import {
		band,
		clamp,
		projectMomentum,
		unband,
		velocityOf,
		type PointerSample,
		type TrackBounds
	} from './carousel-physics';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** Names the carousel for assistive technology, for example "From the Harbour suites". */
		label: string;
		items: Item[];
		/** Renders one slide. */
		slide: Snippet<[Item, number]>;
		/** Stable identity per item, so slides keep their DOM when the list changes. */
		getKey?: (item: Item, index: number) => unknown;
		index?: number;
		defaultIndex?: number;
		onIndexChange?: (index: number) => void;
		/** Width of one slide as a CSS length. Use `cqw` for a share of the carousel width. */
		slideSize?: string;
		/** Names each slide and its indicator. Defaults to "2 of 5". */
		slideLabel?: SlideLabel;
		/** Milliseconds per slide. Adds a play control that rotates through the slides; rotation pauses on hover, keyboard focus, and drag, and is unavailable with reduced motion. */
		interval?: number;
		/** Starts rotating on mount. Off by default, so motion begins with the viewer. */
		autoplay?: boolean;
	};

	type DragState = {
		pointer: number;
		startX: number;
		startY: number;
		origin: number;
		from: number;
		locked: 'x' | 'y' | null;
		caught: boolean;
		samples: PointerSample[];
	};

	const defaultSlideLabel: SlideLabel = (slideIndex, count) => `${slideIndex + 1} of ${count}`;

	let {
		label,
		items,
		slide,
		getKey = (_item, slideIndex) => slideIndex,
		defaultIndex = 0,
		index = $bindable(defaultIndex),
		onIndexChange,
		slideSize = 'min(80cqw, 340px)',
		slideLabel = defaultSlideLabel,
		interval,
		autoplay = false,
		class: className,
		...rest
	}: Props = $props();

	/** Movement before a press is read as a drag or handed to the page as a vertical scroll. */
	const SLOP_PX = 6;
	/** Release speed in px/s that always moves at least one slide. */
	const FLICK_PX_PER_S = 360;
	/** A track further than this from its slide is visibly moving, so a touch catches it. */
	const CATCH_DISTANCE_PX = 12;
	const MAX_POINTER_SAMPLES = 16;
	/** Quiet time after the last wheel event before a trackpad swipe, momentum included, counts as ended. */
	const WHEEL_SETTLE_MS = 120;
	const WHEEL_LINE_PX = 16;
	const MS_PER_SECOND = 1000;

	const { blur, duration } = motionTokens;
	const ICON_HIDDEN = { opacity: 0, scale: 0.6, blur: blur.subtle, duration: duration.fast };
	const ICON_ENTER = { ...ICON_HIDDEN, duration: motionTokens.spring.snappy.visualDuration };
	const ICON_EXIT = { ...ICON_HIDDEN, easing: ease.standard };

	const uid = $props.id();
	const count = $derived(items.length);
	const last = $derived(Math.max(0, count - 1));
	const activeIndex = $derived(clamp(index, 0, last));
	const startIndex = untrack(() => activeIndex);
	const reduced = $derived(isReducedMotion());

	let playing = $state(untrack(() => autoplay));
	let hovered = $state(false);
	let focusPaused = $state(false);
	let dragging = $state(false);
	let inView = $state(true);
	let pageVisible = $state(true);
	let announcement = $state('');

	const canRotate = $derived(Boolean(interval) && count > 1 && !reduced);
	const rotating = $derived(
		canRotate && playing && !hovered && !focusPaused && !dragging && inView && pageVisible
	);

	const trackX = motionValue(0);
	/** The continuous slide position that the scale, dim, and indicator read every frame. */
	const progress = motionValue(startIndex);
	// One drain per indicator, so a pill that just ran out keeps its state while it shrinks away.
	const drains = $derived(Array.from({ length: count }, () => motionValue(0)));

	let root: HTMLElement;
	let viewport: HTMLDivElement;
	let track: HTMLDivElement;
	let playButton = $state<HTMLButtonElement | null>(null);
	let tabButtons = $state<(HTMLButtonElement | null)[]>([]);

	let metrics = { step: 0, width: 0 };
	let targetIndex = startIndex;
	let travel: AnimationPlaybackControls | null = null;
	let drag: DragState | null = null;
	const wheel = { active: false, raw: 0, timer: 0 };
	let swallowClick = false;

	const bounds = (): TrackBounds => ({ min: -last * metrics.step, max: 0 });
	const bandTrack = (raw: number) => band(raw, bounds(), metrics.width || 1);
	const unbandTrack = (shown: number) => unband(shown, bounds(), metrics.width || 1);

	function stopTravel() {
		travel?.stop();
		travel = null;
	}

	/** Springs the track to a slide from wherever it is, carrying any velocity it already has. */
	function glide(to: number, velocity = 0) {
		stopTravel();
		if (!metrics.step) return;
		if (reduced) {
			trackX.jump(-to * metrics.step);
			return;
		}
		travel = animate(trackX, -to * metrics.step, { ...motionTokens.spring.smooth, velocity });
	}

	function select(to: number, { velocity = 0, announce = true } = {}) {
		const next = clamp(to, 0, last);
		targetIndex = next;
		glide(next, velocity);
		if (next === activeIndex) return;
		index = next;
		onIndexChange?.(next);
		if (announce) announcement = slideLabel(next, count);
	}

	function measure() {
		const [first, second] = Array.from(track.children) as HTMLElement[];
		if (!first) return;
		// Centers are unaffected by each slide's scale, and rects keep the sub-pixel step that offsetLeft would round away.
		const center = (node: HTMLElement) => {
			const rect = node.getBoundingClientRect();
			return rect.left + rect.width / 2;
		};
		const step = second ? center(second) - center(first) : first.offsetWidth;
		const changed = step !== metrics.step;
		metrics = { step, width: viewport.clientWidth };
		// The server positions the start slide with CSS; from here on the motion value owns the track.
		track.dataset.measured = '';
		if (changed && !drag) {
			stopTravel();
			trackX.jump(-targetIndex * step);
			progress.set(targetIndex);
		}
	}

	$effect(() => {
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		return () => observer.disconnect();
	});

	$effect(() => styleEffect(track, { x: trackX }));

	$effect(() =>
		trackX.on('change', (value) => {
			if (!metrics.step) return;
			const position = -value / metrics.step;
			progress.set(position);
			drains.forEach((drain, drainIndex) => {
				const leftBehind = drainIndex !== targetIndex && Math.abs(position - drainIndex) >= 1;
				if (leftBehind && drain.get() !== 0) drain.jump(0);
			});
		})
	);

	$effect(() => {
		const next = activeIndex;
		untrack(() => {
			if (targetIndex === next) return;
			targetIndex = next;
			glide(next);
		});
	});

	function advance() {
		select(activeIndex >= last ? 0 : activeIndex + 1, { announce: false });
	}

	$effect(() => {
		if (!rotating || !interval) return;
		const drain = drains[activeIndex];
		if (!drain) return;
		const remainingMs = (1 - drain.get()) * interval;
		const controls = animate(drain, 1, {
			duration: remainingMs / MS_PER_SECOND,
			ease: 'linear',
			onComplete: advance
		});
		return () => controls.stop();
	});

	$effect(() => {
		if (!interval) return;
		const observer = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
		observer.observe(root);
		const onVisibility = () => (pageVisible = document.visibilityState !== 'hidden');
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			observer.disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});

	// A horizontal trackpad swipe moves the track 1:1 and settles on the nearest slide once the swipe, including its momentum, ends.
	function onWheel(event: WheelEvent) {
		if (count < 2 || drag || !metrics.step) return;
		if (!wheel.active && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
		event.preventDefault();
		if (!wheel.active) {
			wheel.active = true;
			stopTravel();
			wheel.raw = unbandTrack(trackX.get());
		}
		wheel.raw -= event.deltaX * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : 1);
		trackX.set(bandTrack(wheel.raw));
		window.clearTimeout(wheel.timer);
		wheel.timer = window.setTimeout(settleWheel, WHEEL_SETTLE_MS);
	}

	function settleWheel() {
		wheel.active = false;
		select(Math.round(-trackX.get() / metrics.step), { velocity: trackX.getVelocity() });
	}

	$effect(() => {
		viewport.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			viewport.removeEventListener('wheel', onWheel);
			window.clearTimeout(wheel.timer);
		};
	});

	function slideAt(clientX: number) {
		const hit = Array.from(track.children).findIndex((node) => {
			const rect = node.getBoundingClientRect();
			return clientX >= rect.left && clientX <= rect.right;
		});
		return hit < 0 ? null : hit;
	}

	function onPointerDown(event: PointerEvent) {
		const secondaryButton = event.pointerType === 'mouse' && event.button !== 0;
		if (count < 2 || drag || !metrics.step || secondaryButton) return;
		swallowClick = false;
		// Touching a visibly moving track catches it where it is, the way a hand stops a spinning wheel. A settling tail is left alone so a tap still selects.
		const caught =
			travel !== null &&
			trackX.isAnimating() &&
			Math.abs(trackX.get() + targetIndex * metrics.step) > CATCH_DISTANCE_PX;
		if (caught) stopTravel();
		drag = {
			pointer: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: 0,
			from: targetIndex,
			locked: null,
			caught,
			samples: []
		};
	}

	function lockAxis(current: DragState, event: PointerEvent) {
		const dx = event.clientX - current.startX;
		const dy = event.clientY - current.startY;
		if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
		if (Math.abs(dy) > Math.abs(dx)) {
			current.locked = 'y';
			return;
		}
		// The slop is consumed rather than applied, so the track starts moving from the finger without a jump.
		current.locked = 'x';
		stopTravel();
		current.startX = event.clientX;
		current.origin = unbandTrack(trackX.get());
		viewport.setPointerCapture(event.pointerId);
		dragging = true;
	}

	function onPointerMove(event: PointerEvent) {
		const current = drag;
		if (!current || current.pointer !== event.pointerId) return;
		if (!current.locked) lockAxis(current, event);
		if (current.locked !== 'x') return;
		trackX.set(bandTrack(current.origin + event.clientX - current.startX));
		current.samples.push([event.timeStamp, event.clientX]);
		if (current.samples.length > MAX_POINTER_SAMPLES) current.samples.shift();
	}

	function releaseDrag(current: DragState, event: PointerEvent, cancelled: boolean) {
		swallowClick = true;
		dragging = false;
		const velocity = cancelled ? 0 : velocityOf(current.samples, event.timeStamp);
		// The landing slide comes from where the flick would carry the track, not from where the finger let go.
		let to = Math.round(-(trackX.get() + projectMomentum(velocity)) / metrics.step);
		if (Math.abs(velocity) > FLICK_PX_PER_S) {
			const direction = velocity < 0 ? 1 : -1;
			if ((to - current.from) * direction < 1) to = current.from + direction;
		}
		// Inside the bounds the track moves 1:1 with the pointer, so the sampled release speed carries into the spring even when the
		// last move landed a frame early (the value's own velocity reads zero after 30ms). Past an edge, the banded value speed is the true one.
		const { min, max } = bounds();
		const shown = trackX.get();
		select(to, { velocity: shown >= min && shown <= max ? velocity : trackX.getVelocity() });
	}

	function finish(event: PointerEvent, cancelled: boolean) {
		const current = drag;
		if (!current || current.pointer !== event.pointerId) return;
		drag = null;
		if (current.locked === 'x') {
			releaseDrag(current, event, cancelled);
		} else if (current.caught) {
			swallowClick = true;
			select(Math.round(-trackX.get() / metrics.step));
		} else if (!cancelled && current.locked === null) {
			const hit = slideAt(event.clientX);
			if (hit !== null && hit !== targetIndex) {
				swallowClick = true;
				select(hit);
			}
		} else if (cancelled) {
			select(targetIndex);
		}
	}

	function onClickCapture(event: MouseEvent) {
		if (!swallowClick) return;
		event.preventDefault();
		event.stopPropagation();
		swallowClick = false;
	}

	function keyTarget(key: string, from: number) {
		if (key === 'ArrowLeft') return from - 1;
		if (key === 'ArrowRight') return from + 1;
		if (key === 'Home') return 0;
		if (key === 'End') return last;
		return null;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || count < 2) return;
		const node = event.target as HTMLElement;
		if (node.closest('input, textarea, select, [contenteditable]')) return;
		const to = keyTarget(event.key, targetIndex);
		if (to === null) return;
		event.preventDefault();
		const next = clamp(to, 0, last);
		select(next);
		if (node.getAttribute('role') === 'tab') tabButtons[next]?.focus({ preventScroll: true });
		else if (track.contains(node)) viewport.focus({ preventScroll: true });
	}

	function toggleRotation() {
		if (!playing) {
			playing = true;
			return;
		}
		playing = false;
		// Pausing refills the pill: this slide stays until the viewer moves on.
		const drain = drains[activeIndex];
		if (!drain) return;
		if (reduced) drain.jump(0);
		else animate(drain, 0, { duration: duration.standard, ease: motionTokens.ease.standard });
	}

	function pauseForKeyboardFocus(event: FocusEvent) {
		const target = event.target as HTMLElement;
		focusPaused = target !== playButton && target.matches(':focus-visible');
	}

	function resumeWhenFocusLeaves(event: FocusEvent) {
		if (!root.contains(event.relatedTarget as Node | null)) focusPaused = false;
	}
</script>

<section
	bind:this={root}
	{...rest}
	class={['root', className]}
	style:--carousel-slide={slideSize}
	style:--carousel-start={startIndex}
	aria-roledescription="carousel"
	aria-label={label}
	onkeydown={onKeyDown}
	onfocusin={pauseForKeyboardFocus}
	onfocusout={resumeWhenFocusLeaves}
>
	<!-- The slide area is a focus stop of its own, so arrow keys work without reaching for the controls. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={viewport}
		class="viewport"
		role="group"
		aria-label="Slides"
		tabindex="0"
		data-dragging={dragging || undefined}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={(event) => finish(event, false)}
		onpointercancel={(event) => finish(event, true)}
		onpointerenter={(event) => {
			if (event.pointerType === 'mouse') hovered = true;
		}}
		onpointerleave={() => (hovered = false)}
		onclickcapture={onClickCapture}
		ondragstart={(event) => event.preventDefault()}
	>
		<div bind:this={track} class="track">
			{#each items as item, slideIndex (getKey(item, slideIndex))}
				<CarouselSlide
					id="{uid}-slide-{slideIndex}"
					index={slideIndex}
					{progress}
					active={slideIndex === activeIndex}
					label={slideLabel(slideIndex, count)}
				>
					{@render slide(item, slideIndex)}
				</CarouselSlide>
			{/each}
		</div>
	</div>
	{#if count > 1}
		<div class="controls">
			{#if canRotate}
				<button
					bind:this={playButton}
					type="button"
					class="control"
					aria-label={playing ? 'Pause slide rotation' : 'Start slide rotation'}
					onclick={toggleRotation}
				>
					<span class="icon-slot">
						{#key playing}
							<span class="icon" in:presence={ICON_ENTER} out:presence={ICON_EXIT}>
								{#if playing}
									<PauseIcon size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
								{:else}
									<PlayIcon size={15} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
								{/if}
							</span>
						{/key}
					</span>
				</button>
			{/if}
			<div class="tabs" role="tablist" aria-label="Choose a slide">
				{#each drains as drain, dotIndex (drain)}
					<CarouselDot
						bind:ref={tabButtons[dotIndex]}
						index={dotIndex}
						{last}
						{progress}
						{drain}
						selected={dotIndex === activeIndex}
						label={slideLabel(dotIndex, count)}
						controls="{uid}-slide-{dotIndex}"
						onselect={() => select(dotIndex)}
					/>
				{/each}
			</div>
			<div class="arrows">
				<button
					type="button"
					class="control"
					aria-label="Previous slide"
					aria-disabled={activeIndex === 0}
					onclick={() => {
						if (targetIndex > 0) select(targetIndex - 1);
					}}
				>
					<ChevronLeftIcon size={18} strokeWidth={1.75} aria-hidden="true" />
				</button>
				<button
					type="button"
					class="control"
					aria-label="Next slide"
					aria-disabled={activeIndex === last}
					onclick={() => {
						if (targetIndex < last) select(targetIndex + 1);
					}}
				>
					<ChevronRightIcon size={18} strokeWidth={1.75} aria-hidden="true" />
				</button>
			</div>
		</div>
	{/if}
	<span class="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</span>
</section>

<style>
	/* The root is the size container, so slide widths, centering padding, and the control row all share one measure. It needs a definite width. */
	.root {
		--carousel-gap: var(--arc-space-4);
		display: grid;
		width: 100%;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
		gap: var(--arc-space-4);
		container-type: inline-size;
	}
	/* Only the horizontal axis clips, so focus rings inside the active slide are never cut off at the top or bottom. */
	.viewport {
		position: relative;
		min-width: 0;
		overflow-x: clip;
		overflow-y: visible;
		border-radius: var(--arc-radius-panel);
		cursor: grab;
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
	}
	.viewport[data-dragging] {
		cursor: grabbing;
	}
	.viewport:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 4px;
	}
	/* Side padding centers the first and last slides; before hydration the start slide is placed with CSS so nothing moves on first paint. */
	.track {
		display: flex;
		gap: var(--carousel-gap);
		padding-inline: calc((100cqw - var(--carousel-slide)) / 2);
		user-select: none;
		-webkit-user-select: none;
	}
	.track:not([data-measured]) {
		translate: calc(var(--carousel-start) * -1 * (var(--carousel-slide) + var(--carousel-gap))) 0;
	}

	/* Controls line up with the edges of the centered slide. */
	.controls {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--arc-space-2);
		padding-inline: calc((100cqw - var(--carousel-slide)) / 2);
	}
	.tabs {
		display: flex;
		min-width: 0;
		align-items: center;
	}
	/* On phone widths the row tightens so play, indicators, and arrows still fit the width of a narrow slide. */
	@container (max-width: 340px) {
		.controls {
			gap: var(--arc-space-1);
		}
	}

	.arrows {
		display: flex;
		flex: none;
		gap: var(--arc-space-2);
		margin-left: auto;
	}
	.control {
		display: grid;
		width: var(--arc-control-height-sm);
		height: var(--arc-control-height-sm);
		flex: none;
		place-items: center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		padding: 0;
		background: var(--arc-surface);
		color: var(--arc-foreground);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.control:hover:not([aria-disabled='true']) {
			background: var(--arc-surface-muted);
		}
	}
	.control:active:not([aria-disabled='true']) {
		transform: scale(0.97);
		transition: transform 100ms var(--arc-ease-standard);
	}
	.control[aria-disabled='true'] {
		color: var(--arc-text-muted);
		cursor: default;
		opacity: 0.5;
	}
	.control:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.icon-slot {
		display: grid;
		width: 16px;
		height: 16px;
		place-items: center;
	}
	.icon {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.control,
		.control:active:not([aria-disabled='true']) {
			transition: none;
			transform: none;
		}
	}
</style>
