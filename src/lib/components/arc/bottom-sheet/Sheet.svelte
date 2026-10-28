<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type SheetProps = {
		title: string;
		description?: string;
		/** Resting heights as fractions of the viewport height. The sheet opens at `initialDetent` and never grows past the largest. */
		detents?: number[];
		/** Index into the sorted detents the sheet opens at. Defaults to the smallest. */
		initialDetent?: number;
		onDetentChange?: (index: number) => void;
		closeLabel?: string;
		class?: string;
		children: Snippet;
	};
</script>

<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';
	import { strings } from '../strings';
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import { isReducedMotion, motionTokens } from '../motion';
	import { clamp, rubber, unrubber, velocityOf, type DragSample } from './physics';

	type Props = SheetProps & {
		present: boolean;
		onDismiss: () => void;
		onExitComplete: () => void;
	};

	let {
		title,
		description,
		detents = [0.45, 0.92],
		initialDetent = 0,
		onDetentChange,
		closeLabel,
		class: className,
		children,
		present,
		onDismiss,
		onExitComplete
	}: Props = $props();

	type Stop = number | 'closed';
	type Drag = {
		startY: number;
		origin: number;
		from: number;
		moved: boolean;
		samples: DragSample[];
	};
	type HeaderPointerEvent = PointerEvent & { currentTarget: HTMLDivElement };

	/** Extra surface below the viewport, so an upward stretch never shows a gap under the sheet. */
	const EXTENSION = 160;
	/** Enough travel below the edge to hide the floating shadow as well as the sheet. */
	const CLOSED_GAP = 40;
	/** How far a release coasts, in seconds of its velocity, before the nearest detent is chosen. */
	const PROJECTION = 0.2;
	/** A release faster than this (px/s) always moves at least one detent in its direction. */
	const FLICK = 320;
	/** How much of the full dim remains at the smallest detent. */
	const LOW_DIM = 0.78;
	/** Starts far below the fold so the first frame never flashes. */
	const OFFSCREEN_START = 4000;
	const DRAG_THRESHOLD = 3;
	const TOUCH_SLOP = 4;
	const MAX_SAMPLES = 12;
	const ARROW_SCROLL_STEP = 48;
	const PAGE_SCROLL_FRACTION = 0.85;
	const WHEEL_EXPAND_DELTA = 4;
	const FOLD_MARGIN = 8;
	const EXIT_VISUAL_DURATION = 0.3;
	const INTERACTIVE = "button, a, input, select, textarea, [role='button']";

	const settle = motionTokens.spring.smooth;
	/** Leaving is shorter than arriving; a flick keeps its velocity through the same spring. */
	const leave = { ...motionTokens.spring.smooth, visualDuration: EXIT_VISUAL_DURATION };
	const fade = { duration: motionTokens.duration.fast, ease: 'linear' } as const;

	const reduced = $derived(isReducedMotion());
	const stops = $derived(detents.filter((stop) => stop > 0).sort((a, b) => a - b));
	const top = $derived(stops.length - 1);

	let detent = $state(untrack(() => clamp(Math.round(initialDetent), 0, top)));
	let announcement = $state('');
	let sheet = $state<HTMLDivElement | null>(null);
	let body = $state<HTMLDivElement | null>(null);
	let overlay = $state<HTMLDivElement | null>(null);
	const expanded = $derived(detent === top);

	/** Offset of the sheet below its tallest detent, in px. */
	const y = motionValue(OFFSCREEN_START);
	const height = motionValue(0);
	const shown = motionValue(1);
	let aim: Stop = untrack(() => detent);
	let drag: Drag | null = null;
	let arrive: (() => void) | undefined;
	let suppressClick = false;
	let mounted = false;

	function offset(stop: Stop) {
		const full = height.get();
		return stop === 'closed' ? full + CLOSED_GAP : full * (1 - stops[stop] / stops[top]);
	}

	// The backdrop is a function of where the sheet is, so it darkens and clears with a drag instead of on a timer.
	function backdrop() {
		const full = height.get();
		if (!full) return 0;
		const offsetY = y.get();
		const low = full * (1 - stops[0] / stops[top]);
		const closed = full + CLOSED_GAP;
		const dim =
			offsetY <= low
				? 1 - (1 - LOW_DIM) * (low ? offsetY / low : 0)
				: LOW_DIM * (1 - (offsetY - low) / (closed - low));
		return clamp(dim, 0, 1) * shown.get();
	}

	$effect(() => {
		if (!sheet) return;
		const node = sheet;
		const render = () => {
			const offsetY = y.get();
			node.style.transform = offsetY ? `translateY(${offsetY}px)` : 'none';
			node.style.opacity = String(shown.get());
		};
		render();
		const unsubscribers = [y.on('change', render), shown.on('change', render)];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	});

	$effect(() => {
		if (!overlay) return;
		const node = overlay;
		stops;
		const render = () => (node.style.opacity = String(backdrop()));
		render();
		const unsubscribers = [
			y.on('change', render),
			height.on('change', render),
			shown.on('change', render)
		];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	});

	// Every move retargets the one motion value from wherever it is. A new target drops the previous arrival callback.
	function go(stop: Stop, velocity?: number, onArrive?: () => void) {
		aim = stop;
		arrive = onArrive;
		const target = offset(stop);
		const done = () => {
			const callback = arrive;
			arrive = undefined;
			callback?.();
		};
		if (reduced) {
			y.jump(target);
			done();
			return;
		}
		const transition = stop === 'closed' ? leave : settle;
		animate(y, target, {
			...transition,
			...(velocity === undefined ? {} : { velocity }),
			onComplete: done
		});
	}

	function describeDetent(stop: number) {
		if (stop === top) return strings.sheetExpanded();
		if (stop === 0) return strings.sheetCollapsed();
		return strings.sheetPercent({ percent: Math.round(stops[stop] * 100) });
	}

	function rest(stop: number, velocity?: number) {
		if (stop !== detent) {
			detent = stop;
			onDetentChange?.(stop);
			announcement = describeDetent(stop);
		}
		// Collapsing takes the content back to its start, so the peek always shows the top of it.
		if (stop !== top && body && body.scrollTop > 0)
			body.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
		go(stop, velocity);
	}

	function placeClosed() {
		if (!sheet) return;
		mounted = true;
		height.set(sheet.offsetHeight - EXTENSION);
		y.jump(offset('closed'));
		if (reduced) {
			y.jump(offset(detent));
			shown.jump(0);
		}
	}

	function enter() {
		if (reduced) {
			y.jump(offset(detent));
			animate(shown, 1, fade);
			return;
		}
		shown.jump(1);
		go(detent);
	}

	function exit() {
		if (reduced) {
			animate(shown, 0, { ...fade, onComplete: onExitComplete });
			return;
		}
		// A flick has already started the exit with its own velocity; only the unmount waits for it.
		if (aim === 'closed' && y.isAnimating()) arrive = onExitComplete;
		else go('closed', undefined, onExitComplete);
	}

	// Enter, leave, and a reopen caught mid-exit all retarget the same motion value from wherever it is.
	$effect(() => {
		const isPresent = present;
		if (!sheet) return;
		reduced;
		stops;
		untrack(() => {
			if (!mounted) placeClosed();
			if (isPresent) enter();
			else exit();
		});
	});

	// A viewport change (rotation, the mobile toolbar) moves every detent. Keep the sheet on its detent, retargeting any flight.
	$effect(() => {
		if (!sheet) return;
		const node = sheet;
		const observer = new ResizeObserver(() => {
			const next = node.offsetHeight - EXTENSION;
			if (next === height.get()) return;
			height.set(next);
			if (drag || aim === 'closed') return;
			if (y.isAnimating()) go(aim);
			else y.jump(offset(aim));
		});
		observer.observe(node);
		return () => observer.disconnect();
	});

	function beginDrag(clientY: number, time: number) {
		// Catch the sheet where it is, even mid-flight; an overstretched sheet converts back to finger distance so nothing jumps.
		y.stop();
		const current = y.get();
		const origin = current < 0 ? -unrubber(-current) : current;
		drag = { startY: clientY, origin, from: detent, moved: false, samples: [{ time, y: clientY }] };
	}

	function moveDrag(clientY: number, time: number) {
		if (!drag) return;
		const delta = clientY - drag.startY;
		if (!drag.moved) {
			if (Math.abs(delta) < DRAG_THRESHOLD) return;
			drag.moved = true;
			sheet?.setAttribute('data-dragging', '');
		}
		const raw = drag.origin + delta;
		// Down follows the finger 1:1 so it can dismiss; up past the tallest detent resists like a rubber band.
		y.set(raw < 0 ? -rubber(-raw) : raw);
		drag.samples.push({ time, y: clientY });
		if (drag.samples.length > MAX_SAMPLES) drag.samples.shift();
	}

	function nearestStop(projected: number) {
		const candidates: Stop[] = [...stops.map((_, index) => index), 'closed'];
		return candidates.reduce((best, stop) =>
			Math.abs(offset(stop) - projected) < Math.abs(offset(best) - projected) ? stop : best
		);
	}

	function endDrag(time: number) {
		const state = drag;
		drag = null;
		sheet?.removeAttribute('data-dragging');
		if (!state) return;
		if (!state.moved) {
			if (aim !== 'closed') go(aim);
			return;
		}
		suppressClick = true;
		const current = y.get();
		// A stretched sheet springs back without the finger's speed, so it never launches past the stretch.
		const velocity = current < 0 ? 0 : velocityOf(state.samples, time);
		let target = nearestStop(current + velocity * PROJECTION);
		// A quick flick always travels at least one detent, and a flick down from the smallest one closes the sheet.
		if (Math.abs(velocity) > FLICK && target === state.from) {
			if (velocity < 0) target = Math.min(state.from + 1, top);
			else target = state.from === 0 ? 'closed' : state.from - 1;
		}
		// The exit starts in this frame with the finger's velocity; closing the dialog only waits for it to land.
		if (target === 'closed') {
			if (!reduced) go('closed', velocity);
			onDismiss();
			return;
		}
		rest(target, velocity);
	}

	// Touch drags on the content move the sheet until it is fully open; once open, the content scrolls and a pull down from its top moves the sheet again.
	$effect(() => {
		if (!body) return;
		const node = body;
		let gesture: { x: number; y: number; mode: 'pending' | 'sheet' | 'native' } | null = null;

		function claimGesture(dx: number, dy: number) {
			const vertical = Math.abs(dy) >= Math.abs(dx);
			if (detent !== top) return vertical ? 'sheet' : 'native';
			const scrollable = node.scrollHeight > node.clientHeight + 1;
			return vertical && (!scrollable || (node.scrollTop <= 0 && dy > 0)) ? 'sheet' : 'native';
		}
		const start = (event: TouchEvent) => {
			const touch = event.touches[0];
			gesture =
				event.touches.length === 1 && touch
					? { x: touch.clientX, y: touch.clientY, mode: 'pending' }
					: null;
		};
		const move = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!gesture || !touch || event.touches.length !== 1) return;
			if (gesture.mode === 'pending') {
				const dx = touch.clientX - gesture.x;
				const dy = touch.clientY - gesture.y;
				if (detent !== top && Math.hypot(dx, dy) < TOUCH_SLOP) return;
				gesture.mode = claimGesture(dx, dy);
				if (gesture.mode === 'sheet') beginDrag(touch.clientY, event.timeStamp);
			}
			if (gesture.mode !== 'sheet') return;
			if (event.cancelable) event.preventDefault();
			moveDrag(touch.clientY, event.timeStamp);
		};
		const end = (event: TouchEvent) => {
			if (gesture?.mode === 'sheet') endDrag(event.timeStamp);
			gesture = null;
		};
		const listeners = [
			on(node, 'touchstart', start, { passive: true }),
			on(node, 'touchmove', move, { passive: false }),
			on(node, 'touchend', end),
			on(node, 'touchcancel', end)
		];
		return () => listeners.forEach((remove) => remove());
	});

	// The scroll hairline under the header is toggled on the element directly, so scrolling never re-renders.
	$effect(() => {
		if (!body || !sheet) return;
		const scroller = body;
		const surface = sheet;
		return on(
			scroller,
			'scroll',
			() => surface.toggleAttribute('data-scrolled', scroller.scrollTop > 1),
			{
				passive: true
			}
		);
	});

	function headerDown(event: HeaderPointerEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (event.button !== 0 || !event.isPrimary) return;
		if (target?.closest(INTERACTIVE) && !target.closest('[data-grabber]')) return;
		suppressClick = false;
		beginDrag(event.clientY, event.timeStamp);
		// Moves arrive once per frame, so a fast flick can leave the header before its first move lands.
		// Until the header captures the pointer, the window follows it; once captured, the header's own handlers take over.
		const header = event.currentTarget;
		const id = event.pointerId;
		const outside = (next: PointerEvent) =>
			next.pointerId === id && !(next.target instanceof Node && header.contains(next.target));
		const move = (next: PointerEvent) => {
			if (!outside(next) || !drag) return;
			moveDrag(next.clientY, next.timeStamp);
			if (!drag?.moved || header.hasPointerCapture(id)) return;
			try {
				header.setPointerCapture(id);
			} catch {
				/* The pointer is already gone. */
			}
		};
		const up = (next: PointerEvent) => {
			if (next.pointerId !== id) return;
			stopFollowing.forEach((remove) => remove());
			if (outside(next)) endDrag(next.timeStamp);
		};
		const stopFollowing = [
			on(window, 'pointermove', move),
			on(window, 'pointerup', up),
			on(window, 'pointercancel', up)
		];
	}

	// Capture only once the pointer has really moved, so a plain click still lands on the grabber button.
	function headerMove(event: HeaderPointerEvent) {
		if (!drag) return;
		if (event.pointerType === 'mouse' && event.buttons === 0) {
			endDrag(event.timeStamp);
			return;
		}
		moveDrag(event.clientY, event.timeStamp);
		if (drag.moved && !event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.setPointerCapture(event.pointerId);
		}
	}

	function headerUp(event: HeaderPointerEvent) {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		endDrag(event.timeStamp);
	}

	// A drag that ends over the grabber must not also toggle it; keyboard clicks (detail 0) never follow a drag.
	function grabberClick(event: MouseEvent) {
		if (suppressClick && event.detail > 0) {
			suppressClick = false;
			return;
		}
		rest(detent === top ? 0 : top);
	}

	function grabberTarget(key: string) {
		if (key === 'ArrowUp') return Math.min(detent + 1, top);
		if (key === 'ArrowDown') return Math.max(detent - 1, 0);
		if (key === 'Home') return top;
		if (key === 'End') return 0;
		return null;
	}

	function grabberKey(event: KeyboardEvent) {
		const next = grabberTarget(event.key);
		if (next === null) return;
		event.preventDefault();
		rest(next);
	}

	// Scrolling or tabbing into content that is still below the fold opens the sheet the rest of the way.
	function bodyWheel(event: WheelEvent) {
		if (detent !== top && event.deltaY > WHEEL_EXPAND_DELTA && !drag) rest(top);
	}

	function bodyFocus(event: FocusEvent) {
		if (detent === top || !(event.target instanceof Element)) return;
		if (event.target.getBoundingClientRect().bottom > window.innerHeight - FOLD_MARGIN) rest(top);
	}

	// With focus on the sheet or its content, reading keys open the sheet first and then scroll the content.
	function sheetKey(event: KeyboardEvent) {
		if (!body || (event.target !== event.currentTarget && event.target !== body)) return;
		const down =
			event.key === 'ArrowDown' ||
			event.key === 'PageDown' ||
			(event.key === ' ' && !event.shiftKey);
		const up =
			event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey);
		if (!down && !up) return;
		event.preventDefault();
		if (down && detent !== top) {
			rest(top);
			return;
		}
		const step = event.key.startsWith('Arrow')
			? ARROW_SCROLL_STEP
			: body.clientHeight * PAGE_SCROLL_FRACTION;
		body.scrollBy({ top: down ? step : -step, behavior: reduced ? 'auto' : 'smooth' });
	}

	// Listening directly keeps bits-ui's own keydown handler (the focus trap) in place.
	const readingKeys: Attachment<HTMLElement> = (node) => on(node, 'keydown', sheetKey);

	function focusSheet(event: Event) {
		event.preventDefault();
		sheet?.focus({ preventScroll: true });
	}
</script>

<Dialog.Overlay forceMount>
	{#snippet child({ props })}
		<div {...props} bind:this={overlay} class="overlay"></div>
	{/snippet}
</Dialog.Overlay>
<Dialog.Content forceMount onOpenAutoFocus={focusSheet}>
	{#snippet child({ props })}
		<div
			{...props}
			bind:this={sheet}
			tabindex="-1"
			class={['sheet', className]}
			style:--sheet-max={stops[top]}
			style:--sheet-extension="{EXTENSION}px"
			data-expanded={expanded ? '' : undefined}
			{@attach readingKeys}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions (the grabber button is the keyboard route to every detent) -->
			<div
				class="header"
				onpointerdown={headerDown}
				onpointermove={headerMove}
				onpointerup={headerUp}
				onpointercancel={headerUp}
			>
				<button
					type="button"
					class="grabber"
					data-grabber=""
					aria-label={expanded ? strings.sheetCollapse() : strings.sheetExpand()}
					aria-expanded={expanded}
					onclick={grabberClick}
					onkeydown={grabberKey}
				>
					<span class="grabber-bar" aria-hidden="true"></span>
				</button>
				<div class="head-row">
					<div class="head-text">
						<Dialog.Title>
							{#snippet child({ props })}
								<h2 {...props} class="title">{title}</h2>
							{/snippet}
						</Dialog.Title>
						{#if description}
							<Dialog.Description>
								{#snippet child({ props })}
									<p {...props} class="description">{description}</p>
								{/snippet}
							</Dialog.Description>
						{/if}
					</div>
					<Dialog.Close>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="close"
								aria-label={closeLabel ?? strings.close()}
							>
								<XIcon size={16} strokeWidth={1.75} aria-hidden="true" />
							</button>
						{/snippet}
					</Dialog.Close>
				</div>
			</div>
			<div bind:this={body} class="body" onwheel={bodyWheel} onfocusin={bodyFocus}>
				{@render children()}
			</div>
			<span class="sr-only" role="status" aria-live="polite">{announcement}</span>
		</div>
	{/snippet}
</Dialog.Content>

<style>
	/* The dim follows the sheet's position in JS; only its color lives here. */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: oklch(16% 0 0 / 0.34);
	}
	:global(.dark) .overlay {
		background: oklch(0% 0 0 / 0.52);
	}
	/* While it leaves, nothing underneath is blocked and the sheet cannot be grabbed again.
	   bits-ui sets pointer-events: auto inline on the layers, so only !important lets a click reach the trigger and reverse the exit. */
	.overlay[data-state='closed'],
	.sheet[data-state='closed'] {
		pointer-events: none !important;
	}

	/* The sheet is as tall as its largest detent plus a hidden extension below the fold; detents are translateY offsets from there. */
	.sheet {
		position: fixed;
		z-index: 51;
		right: 0;
		bottom: calc(var(--sheet-extension) * -1);
		left: 0;
		display: flex;
		flex-direction: column;
		width: min(100%, 36rem);
		height: calc(var(--sheet-max) * 100vh + var(--sheet-extension));
		height: calc(var(--sheet-max) * 100dvh + var(--sheet-extension));
		margin-inline: auto;
		overflow: hidden;
		padding-bottom: calc(var(--sheet-extension) + env(safe-area-inset-bottom, 0px));
		border: 1px solid var(--arc-border);
		border-bottom: 0;
		border-radius: var(--arc-radius-surface) var(--arc-radius-surface) 0 0;
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
		outline: none;
		will-change: transform;
	}

	/* The whole header is the handle, so a drag can start anywhere above the content. */
	.header {
		position: relative;
		flex: none;
		padding: var(--arc-space-2) var(--arc-space-5) var(--arc-space-4);
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}
	.sheet:global([data-dragging]) .header {
		cursor: grabbing;
	}
	/* A hairline appears only once the content scrolls under the header. */
	.header::after {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 1px;
		background: var(--arc-border);
		content: '';
		opacity: 0;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.sheet:global([data-scrolled]) .header::after {
		opacity: 1;
	}

	.grabber {
		display: flex;
		width: 3.5rem;
		height: 1.25rem;
		align-items: center;
		justify-content: center;
		margin: 0 auto var(--arc-space-1);
		padding: 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		cursor: inherit;
		-webkit-tap-highlight-color: transparent;
	}
	.grabber-bar {
		width: 2.25rem;
		height: 5px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border-strong);
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.grabber:hover .grabber-bar {
			background: var(--arc-text-muted);
		}
	}
	.sheet:global([data-dragging]) .grabber-bar {
		background: var(--arc-text-muted);
	}
	.grabber:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}

	.head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--arc-space-4);
	}
	.head-text {
		min-width: 0;
	}
	.title {
		margin: 0;
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-lg);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	.description {
		margin: 2px 0 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}

	.close {
		display: grid;
		flex: none;
		width: 2rem;
		height: 2rem;
		place-items: center;
		margin-top: -2px;
		padding: 0;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			color: var(--arc-foreground);
			border-color: var(--arc-border-strong);
		}
	}
	.close:active {
		color: var(--arc-foreground);
	}
	.close:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}

	/* The content scrolls only at the tallest detent; below it, a drag or scroll opens the sheet first. */
	.body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: var(--arc-space-1) var(--arc-space-5) var(--arc-space-6);
		overscroll-behavior: contain;
		scrollbar-width: thin;
		touch-action: pan-y;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.sheet:not([data-expanded]) .body {
		overflow: hidden;
		touch-action: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 40rem) {
		.header {
			padding-inline: var(--arc-space-4);
		}
		.body {
			padding-inline: var(--arc-space-4);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.header::after,
		.grabber-bar,
		.close {
			transition: none;
		}
	}
</style>
