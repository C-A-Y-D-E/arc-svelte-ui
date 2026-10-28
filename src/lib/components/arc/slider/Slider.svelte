<script module lang="ts">
	export type SliderValue = number | [number, number];
	export type SliderMark = { value: number; label?: string };
</script>

<script lang="ts">
	import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import { isReducedMotion, motionTokens, presence } from '../motion';
	import RollingNumber from './RollingNumber.svelte';
	import { kickSpring, thumbSpring } from './spring';

	type Props = {
		/** Visible label. Range thumbs are named from it unless `thumbLabels` says otherwise. */
		label: string;
		/** Keeps the label for screen readers only, for when the surrounding layout already names the slider. */
		hideLabel?: boolean;
		/** `sm` is a slim track and thumb for dense panels. */
		size?: 'sm' | 'md';
		/** A number for one thumb, a pair for a range. */
		value?: SliderValue;
		defaultValue?: SliderValue;
		onValueChange?: (value: SliderValue) => void;
		/** Runs once a drag is released or a key changes the value, for work too heavy for every step. */
		onValueCommit?: (value: SliderValue) => void;
		min?: number;
		max?: number;
		step?: number;
		/** PageUp, PageDown, and Shift with an arrow move this far. Defaults to a tenth of the range. */
		largeStep?: number;
		/** Ticks on the track. A labelled mark also prints under the track, and clicking it moves there. */
		marks?: (number | SliderMark)[];
		/** The closest two range thumbs may sit, in steps. */
		minStepsBetweenThumbs?: number;
		/** Formats the readout, the bubble, and the spoken value. */
		format?: (value: number) => string;
		/** Show the value beside the label. The bubble over the thumb still appears while dragging or focused. */
		showValue?: boolean;
		thumbLabels?: [string, string];
		start?: Snippet;
		end?: Snippet;
		/** Submits the value with a form, one hidden input per thumb. */
		name?: string;
		disabled?: boolean;
		class?: string;
	};

	let {
		label,
		hideLabel = false,
		size = 'md',
		defaultValue,
		value = $bindable(defaultValue),
		onValueChange,
		onValueCommit,
		min = 0,
		max = 100,
		step: stepProp = 1,
		largeStep,
		marks,
		minStepsBetweenThumbs = 0,
		format,
		showValue = true,
		thumbLabels,
		start,
		end,
		name,
		disabled,
		class: className
	}: Props = $props();

	type Drag = {
		pointer: number;
		index: number | null;
		grab: number;
		x: number;
		raw: number;
		samples: { t: number; p: number }[];
	};

	/** Pixels of rubber-band travel past a limit, the velocity of a key press at a limit, and the pixel size of a step that release momentum may choose. */
	const STRETCH = 9;
	const BUMP_PX = 150;
	const SNAP_PX = 12;
	const BUBBLE_LINGER_MS = 700;
	const MAX_SAMPLES = 6;
	const MIN_DRAG_PX = 2;
	const { blur, duration } = motionTokens;

	/** iOS style resistance: travel past a limit gives less and less, and never more than `limit` pixels. */
	const rubber = (distance: number, limit = STRETCH) =>
		Math.sign(distance) * (1 - 1 / ((Math.abs(distance) * 0.55) / limit + 1)) * limit;
	/** Where a release is heading, from a scroll-like deceleration, in the same units as the velocity. */
	const project = (velocity: number) => velocity * 0.099;
	const decimalsOf = (input: number) => (String(input).split('.')[1] ?? '').length;
	const clamp = (input: number, low: number, high: number) => Math.min(high, Math.max(low, input));

	const labelId = $props.id();
	const step = $derived(stepProp > 0 ? stepProp : 1);
	const span = $derived(max - min || 1);
	const isRange = $derived(Array.isArray(value ?? defaultValue));
	const values = $derived(
		value === undefined
			? [min, max].slice(0, isRange ? 2 : 1)
			: Array.isArray(value)
				? [value[0], value[1]]
				: [value]
	);
	const decimals = $derived(Math.max(decimalsOf(step), decimalsOf(min)));
	const gap = $derived(isRange ? minStepsBetweenThumbs * step : 0);

	function formatValue(input: number) {
		return format
			? format(input)
			: input.toLocaleString('en-US', {
					minimumFractionDigits: decimals,
					maximumFractionDigits: decimals
				});
	}
	const pct = (input: number) => ((input - min) / span) * 100;
	const valueAt = (percent: number) => min + (percent / 100) * span;
	const snap = (input: number) =>
		Number((min + Math.round((input - min) / step) * step).toFixed(decimals));
	const lowOf = (index: number, current: number[]) => (index === 1 ? current[0] + gap : min);
	const highOf = (index: number, current: number[]) =>
		index === 0 && isRange ? current[1] - gap : max;
	const settle = (index: number, input: number, current: number[]) =>
		clamp(snap(clamp(input, min, max)), lowOf(index, current), highOf(index, current));

	// Each thumb is a committed position plus a catch-up offset: a pressed track springs the offset to zero while the pointer moves
	// the position 1:1, so the thumb glides to the finger and never lags behind it.
	type Thumb = {
		pos: MotionValue<number>;
		lag: MotionValue<number>;
		motion?: AnimationPlaybackControls;
	};
	const thumbs: Thumb[] = [0, 1].map((index) => ({
		pos: motionValue(pct(values[index] ?? values[0])),
		lag: motionValue(0)
	}));
	let shown = $state(thumbs.map((thumb) => thumb.pos.get()));

	$effect(() => {
		const stops = thumbs.flatMap((thumb, index) => {
			const sync = () => (shown[index] = thumb.pos.get() + thumb.lag.get());
			return [thumb.pos.on('change', sync), thumb.lag.on('change', sync)];
		});
		return () => stops.forEach((stop) => stop());
	});

	const clipPath = $derived.by(() => {
		const from = isRange ? clamp(shown[0], 0, 100) : 0;
		const to = clamp(isRange ? shown[1] : shown[0], 0, 100);
		return `inset(0 ${(100 - to).toFixed(3)}% 0 ${from.toFixed(3)}% round 999px)`;
	});

	let track: HTMLDivElement;
	let thumbsLayer: HTMLDivElement;
	// Seeded once; the effect below keeps both in step with later values.
	let latest = untrack(() => values);
	const goal = untrack(() => values.map(pct));
	let drag: Drag | null = null;
	let pointerFocus = false;
	let lingerTimer = 0;
	let dragging = $state<number | null>(null);
	let keyFocus = $state<number | null>(null);
	let linger = $state<number | null>(null);
	let lastActive = $state(0);
	let quiet = $state<number | null>(null);

	function springTo(thumb: Thumb, target: number, velocity = 0) {
		thumb.motion?.stop();
		if (isReducedMotion()) thumb.pos.jump(target);
		else thumb.motion = animate(thumb.pos, target, { ...thumbSpring, velocity });
	}

	function emit(next: number[]): SliderValue {
		return isRange ? [next[0], next[1]] : next[0];
	}

	function commit(index: number, next: number) {
		if (latest[index] === next) return;
		const updated = latest.map((item, at) => (at === index ? next : item));
		latest = updated;
		value = emit(updated);
		onValueChange?.(value);
	}

	// Values that arrive from outside a drag (keys, props, a clicked mark) spring the thumb to their place.
	$effect(() => {
		latest = values;
		values.forEach((item, index) => {
			const target = pct(item);
			const thumb = thumbs[index];
			if (drag?.index === index || goal[index] === target) return;
			goal[index] = target;
			const from = thumb.pos.get() + thumb.lag.get();
			thumb.lag.jump(0);
			thumb.pos.jump(from);
			springTo(thumb, target);
		});
	});
	$effect(() => () => window.clearTimeout(lingerTimer));

	const thumbNode = (index: number) =>
		thumbsLayer?.querySelector<HTMLElement>(`[data-index="${index}"]`);

	/** Focus that follows a pointer keeps the thumb quiet: no ring and no bubble until a key is pressed. */
	function focusFromPointer(index: number) {
		const node = thumbNode(index);
		if (!node || document.activeElement === node) return;
		quiet = index;
		pointerFocus = true;
		node.focus({ preventScroll: true });
		pointerFocus = false;
	}
	const trackWidth = () => track?.getBoundingClientRect().width || 1;
	function nearest(at: number, current: number[]) {
		if (!isRange) return 0;
		const low = Math.abs(at - pct(current[0]));
		const high = Math.abs(at - pct(current[1]));
		if (low === high) return at < pct(current[0]) ? 0 : 1;
		return low < high ? 0 : 1;
	}
	function holdBubble(index: number) {
		window.clearTimeout(lingerTimer);
		linger = index;
		lingerTimer = window.setTimeout(() => (linger = null), BUBBLE_LINGER_MS);
	}

	/** Starts tracking one thumb. A press on the track springs the thumb over from where it was; a grabbed thumb keeps its grab offset. */
	function begin(state: Drag, index: number, at: number, press: boolean) {
		const thumb = thumbs[index];
		const from = thumb.pos.get() + thumb.lag.get();
		thumb.motion?.stop();
		state.index = index;
		state.grab = press ? 0 : at - from;
		thumb.lag.jump(0);
		thumb.pos.jump(from);
		dragging = index;
		lastActive = index;
		window.clearTimeout(lingerTimer);
		linger = null;
		focusFromPointer(index);
		if (press) follow(state, at, 0, true);
	}

	/** Places the dragged thumb under the pointer, with resistance past its limits, and commits the stepped value beneath it. */
	function follow(state: Drag, at: number, time: number, press = false) {
		const index = state.index;
		if (index === null) return;
		const thumb = thumbs[index];
		const width = trackWidth();
		const raw = at - state.grab;
		const low = pct(lowOf(index, latest));
		const high = pct(highOf(index, latest));
		const edge = clamp(raw, low, high);
		const placed = isReducedMotion()
			? edge
			: edge + (rubber(((raw - edge) / 100) * width) / width) * 100;
		if (press && !isReducedMotion()) {
			const from = thumb.pos.get();
			thumb.pos.jump(placed);
			thumb.lag.jump(from - placed);
			animate(thumb.lag, 0, thumbSpring);
		} else thumb.pos.set(placed);
		state.raw = raw;
		state.samples.push({ t: time, p: placed });
		if (state.samples.length > MAX_SAMPLES) state.samples.shift();
		commit(index, settle(index, valueAt(raw), latest));
	}

	function pointerPercent(event: PointerEvent) {
		const rect = track.getBoundingClientRect();
		return ((event.clientX - rect.left) / (rect.width || 1)) * 100;
	}

	function onPointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (disabled || event.button !== 0 || !event.isPrimary) return;
		const at = pointerPercent(event);
		const grabbed = (event.target as HTMLElement).closest<HTMLElement>('[data-thumb]');
		event.currentTarget.setPointerCapture(event.pointerId);
		const state: Drag = {
			pointer: event.pointerId,
			index: null,
			grab: 0,
			x: event.clientX,
			raw: at,
			samples: []
		};
		drag = state;
		// Stacked range thumbs wait for the first movement to decide which one the pointer means.
		if (grabbed && isRange && latest[0] === latest[1]) {
			focusFromPointer(Number(grabbed.dataset.index));
			return;
		}
		begin(state, grabbed ? Number(grabbed.dataset.index) : nearest(at, latest), at, !grabbed);
		state.samples = [{ t: event.timeStamp, p: thumbs[state.index ?? 0].pos.get() }];
	}

	function onPointerMove(event: PointerEvent) {
		const state = drag;
		if (!state || state.pointer !== event.pointerId) return;
		const at = pointerPercent(event);
		if (state.index === null) {
			const dx = event.clientX - state.x;
			if (Math.abs(dx) < MIN_DRAG_PX) return;
			begin(state, dx < 0 ? 0 : 1, at - (dx / trackWidth()) * 100, false);
		}
		follow(state, at, event.timeStamp);
	}

	function onPointerEnd(event: PointerEvent) {
		const state = drag;
		if (!state || state.pointer !== event.pointerId) return;
		drag = null;
		const index = state.index;
		if (index === null) return;
		const thumb = thumbs[index];
		const width = trackWidth();
		// Velocity from the last few frames, in percent per second; a pointer that paused before letting go carries none.
		const first = state.samples[0];
		const last = state.samples[state.samples.length - 1];
		const elapsed = last && first ? (last.t - first.t) / 1000 : 0;
		const fresh = last && event.timeStamp - last.t < 60;
		// A release during the catch-up spring keeps that spring's speed too.
		const velocity =
			(elapsed > 0.008 && fresh ? (last.p - first.p) / elapsed : 0) + thumb.lag.getVelocity();
		// On a coarse grid the release momentum may carry the thumb one step further, never more.
		const stepPct = (step / span) * 100;
		const carry =
			event.type === 'pointerup' && (stepPct / 100) * width >= SNAP_PX
				? clamp(project(velocity), -stepPct, stepPct)
				: 0;
		const next = settle(index, valueAt(state.raw + carry), latest);
		const from = thumb.pos.get() + thumb.lag.get();
		const target = pct(next);
		thumb.lag.jump(0);
		thumb.pos.jump(from);
		goal[index] = target;
		springTo(thumb, target, velocity);
		commit(index, next);
		dragging = null;
		holdBubble(index);
		onValueCommit?.(emit(latest));
	}

	function onKeyDown(index: number, event: KeyboardEvent) {
		if (disabled) return;
		const now = latest[index];
		const large = largeStep ?? Math.max(step, snap(min + span / 10) - min);
		const moves: Record<string, number> = {
			ArrowRight: step,
			ArrowUp: step,
			ArrowLeft: -step,
			ArrowDown: -step,
			PageUp: large,
			PageDown: -large
		};
		let wanted: number;
		if (event.key === 'Home') wanted = lowOf(index, latest);
		else if (event.key === 'End') wanted = highOf(index, latest);
		else if (event.key in moves)
			wanted =
				now +
				(event.shiftKey && /^Arrow/.test(event.key)
					? Math.sign(moves[event.key]) * large
					: moves[event.key]);
		else return;
		event.preventDefault();
		keyFocus = index;
		quiet = null;
		lastActive = index;
		const next = settle(index, wanted, latest);
		// At a limit the thumb strains toward the press and springs home, so the key still answers.
		if (next === now) {
			const toward = Math.sign(wanted - now);
			if (toward && !isReducedMotion()) {
				animate(thumbs[index].pos, goal[index], {
					...kickSpring,
					velocity: ((toward * BUMP_PX) / trackWidth()) * 100
				});
			}
			return;
		}
		commit(index, next);
		onValueCommit?.(emit(latest));
	}

	function jumpTo(target: number) {
		if (disabled) return;
		const index = nearest(pct(target), latest);
		const next = settle(index, target, latest);
		lastActive = index;
		focusFromPointer(index);
		if (next === latest[index]) return;
		commit(index, next);
		onValueCommit?.(emit(latest));
	}

	const markList = $derived(
		(marks ?? [])
			.map((mark) => (typeof mark === 'number' ? { value: mark } : mark))
			.filter((mark) => mark.value >= min && mark.value <= max)
	);
	const ticks = $derived(markList.filter((mark) => mark.value > min && mark.value < max));
	const labelled = $derived(markList.filter((mark) => mark.label));
	const inRange = (mark: number) =>
		isRange ? mark >= values[0] && mark <= values[1] : mark <= values[0];
	const names = $derived(thumbLabels ?? [`${label}, minimum`, `${label}, maximum`]);
	/** Marks computed apart from min and max can miss them by a float rounding, so compare with slack. */
	const EDGE_SLACK = 1e-9;
	const isAt = (mark: number, edge: number) => Math.abs(mark - edge) <= (max - min) * EDGE_SLACK;
	const markEdge = (mark: number) =>
		isAt(mark, min) ? 'start' : isAt(mark, max) ? 'end' : undefined;
</script>

<div
	class={['root', className]}
	data-size={size}
	data-disabled={disabled || undefined}
	data-dragging={dragging !== null || undefined}
>
	<div class="header">
		<span id={labelId} class={['label', hideLabel && 'sr-only']}>{label}</span>
		{#if showValue}
			<span class="readout" aria-hidden="true">
				<RollingNumber value={values[0]} text={formatValue(values[0])} />
				{#if isRange}
					<span class="dash">–</span>
					<RollingNumber value={values[1]} text={formatValue(values[1])} />
				{/if}
			</span>
		{/if}
	</div>
	<div class="body">
		{#if start}<div class="start">{@render start()}</div>{/if}
		<!-- The pointer handlers live on the row so a press anywhere on the track works; thumbs keep the keyboard. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="control"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerEnd}
			onpointercancel={onPointerEnd}
			onlostpointercapture={onPointerEnd}
			onmousedown={(event) => event.preventDefault()}
		>
			<div bind:this={track} class="track">
				{#each ticks as mark (mark.value)}
					<span class="tick" style:left="{pct(mark.value)}%"></span>
				{/each}
				<div class="fill" style:clip-path={clipPath}>
					{#each ticks as mark (mark.value)}
						<span class="tick" style:left="{pct(mark.value)}%"></span>
					{/each}
				</div>
			</div>
			<div bind:this={thumbsLayer} class="thumbs">
				{#each values as item, index (index)}
					{@const text = formatValue(item)}
					<!-- The thumb rides a layer as wide as the track, so a percentage transform places it with no measuring. -->
					<div
						class="thumb-layer"
						style:transform="translateX({shown[index] - 100}%)"
						style:z-index={lastActive === index ? 2 : 1}
					>
						<div
							role="slider"
							data-thumb=""
							data-index={index}
							data-active={dragging === index || undefined}
							data-quiet={quiet === index || undefined}
							class="thumb"
							tabindex={disabled ? -1 : 0}
							aria-label={isRange ? names[index] : undefined}
							aria-labelledby={isRange ? undefined : labelId}
							aria-valuemin={lowOf(index, values)}
							aria-valuemax={highOf(index, values)}
							aria-valuenow={item}
							aria-valuetext={text}
							aria-orientation="horizontal"
							aria-disabled={disabled || undefined}
							onkeydown={(event) => onKeyDown(index, event)}
							onfocus={(event) => {
								if (!pointerFocus && event.currentTarget.matches(':focus-visible'))
									keyFocus = index;
							}}
							onblur={() => {
								if (keyFocus === index) keyFocus = null;
								if (quiet === index) quiet = null;
							}}
						></div>
						<span class="bubble-anchor" style:--at={shown[index]}>
							{#if dragging === index || keyFocus === index || linger === index}
								<span
									class="bubble"
									aria-hidden="true"
									in:presence={{ scale: 0.6, y: 6, blur: blur.subtle, duration: duration.fast }}
									out:presence={{ scale: 0.8, y: 4, blur: blur.subtle, duration: duration.instant }}
								>
									<RollingNumber value={item} {text} />
								</span>
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
		{#if end}<div class="end">{@render end()}</div>{/if}
		{#if labelled.length > 0}
			<div class="marks" aria-hidden="true">
				{#each labelled as mark (mark.value)}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<span
						class="mark-label"
						data-on={inRange(mark.value) || undefined}
						data-edge={markEdge(mark.value)}
						style:left="{pct(mark.value)}%"
						onclick={() => jumpTo(mark.value)}>{mark.label}</span
					>
				{/each}
			</div>
		{/if}
	</div>
	{#if name}
		{#each values as item, index (index)}
			<input type="hidden" {name} value={item} {disabled} />
		{/each}
	{/if}
</div>

<style>
	/* Set --slider-thumb and --slider-track to resize. The track is inset by half a thumb, so a thumb at either limit stays inside the box. */
	.root {
		--slider-thumb: 22px;
		--slider-track: 6px;
		display: grid;
		width: 100%;
		min-width: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		user-select: none;
		-webkit-user-select: none;
	}
	.root[data-size='sm'] {
		--slider-thumb: 16px;
		--slider-track: 4px;
	}
	.root[data-size='sm'] .control {
		height: var(--arc-control-height-sm);
	}
	.header {
		display: flex;
		min-width: 0;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--arc-space-4);
	}
	.label {
		min-width: 0;
		font-weight: 500;
	}
	.readout {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.3em;
		color: var(--arc-text-secondary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.dash {
		color: var(--arc-text-muted);
	}
	/* Adornments carry their own space, so an empty column costs nothing. */
	.body {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
	}
	.start {
		display: flex;
		grid-area: 1 / 1;
		margin-right: var(--arc-space-3);
	}
	.end {
		display: flex;
		grid-area: 1 / 3;
		margin-left: var(--arc-space-3);
	}
	/* The whole row takes the press; vertical pans still scroll the page on touch. */
	.control {
		position: relative;
		grid-area: 1 / 2;
		height: var(--arc-control-height-md);
		cursor: pointer;
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
	}
	.track {
		position: absolute;
		top: 50%;
		right: calc(var(--slider-thumb) / 2);
		left: calc(var(--slider-thumb) / 2);
		height: var(--slider-track);
		margin-top: calc(var(--slider-track) / -2);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-control-track);
	}
	/* The fill spans the track and is revealed by a clip that follows the thumbs on the same frame. Ticks inside it are the "on" set. */
	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--arc-control-fill);
	}
	.tick {
		position: absolute;
		top: 50%;
		width: 4px;
		height: 4px;
		margin: -2px 0 0 -2px;
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-foreground) 30%, transparent);
	}
	.fill .tick {
		background: color-mix(in oklch, var(--arc-control-glyph) 60%, transparent);
	}
	.thumbs {
		position: absolute;
		inset: 0 calc(var(--slider-thumb) / 2);
		container-type: inline-size;
		pointer-events: none;
	}
	/* Each layer is as wide as the track and slides by a percentage of itself; it only ever overflows to the left, which never scrolls. */
	.thumb-layer {
		position: absolute;
		inset: 0;
	}
	/* Centering uses the translate property, so the lift scale composes with it. */
	.thumb {
		position: absolute;
		top: 50%;
		right: 0;
		box-sizing: border-box;
		width: var(--slider-thumb);
		height: var(--slider-thumb);
		translate: 50% -50%;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-control-thumb);
		box-shadow: var(--arc-control-thumb-shadow);
		pointer-events: auto;
		cursor: grab;
		outline: 0 solid transparent;
		transition:
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard),
			scale var(--arc-duration-standard) var(--arc-ease-spring);
	}
	.thumb[data-active] {
		scale: 1.16;
	}
	.thumb::after {
		content: '';
		position: absolute;
		inset: -11px;
		border-radius: inherit;
	}
	/* A thumb focused by a press stays quiet until the keyboard takes over. */
	.thumb:focus-visible:not([data-quiet]) {
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.root[data-dragging],
	.root[data-dragging] .control,
	.root[data-dragging] .thumb {
		cursor: grabbing;
	}
	/* The bubble centers on the thumb until it would pass the component's edge, then holds there. --at is the thumb position in percent
	   of the track and cqw measures the track, so the clamp needs no measuring. It floats higher on touch so a fingertip never hides it. */
	.bubble-anchor {
		--edge: calc(var(--slider-thumb) / 2);
		--x: calc(var(--at, 0) * 1cqw);
		position: absolute;
		right: 0;
		bottom: calc(50% + var(--slider-thumb) / 2 + 8px);
		display: flex;
		translate: clamp(
				calc(100% - var(--edge) - var(--x)),
				50%,
				calc(100cqw + var(--edge) - var(--x))
			)
			0;
		pointer-events: none;
	}
	@media (pointer: coarse) {
		.bubble-anchor {
			bottom: calc(50% + var(--slider-thumb) / 2 + 18px);
		}
	}
	.bubble {
		display: inline-flex;
		min-height: 1.75rem;
		align-items: center;
		padding: 0 var(--arc-space-3);
		border: 1px solid color-mix(in oklch, var(--arc-background) 14%, var(--arc-foreground));
		border-radius: var(--arc-radius-pill);
		background: var(--arc-foreground);
		color: var(--arc-background);
		box-shadow: var(--arc-shadow-raised);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		white-space: nowrap;
		transform-origin: 50% 100%;
	}
	/* Mark labels sit on their ticks; one at a limit keeps its outer edge inside the component. */
	.marks {
		position: relative;
		grid-area: 2 / 2;
		height: 1.25rem;
		margin: calc(var(--arc-space-1) * -1) calc(var(--slider-thumb) / 2) 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.mark-label {
		position: absolute;
		top: 0;
		translate: -50% 0;
		white-space: nowrap;
		cursor: pointer;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.mark-label[data-edge='start'] {
		translate: max(-50%, calc(var(--slider-thumb) / -2)) 0;
	}
	.mark-label[data-edge='end'] {
		translate: min(-50%, calc(-100% + var(--slider-thumb) / 2)) 0;
	}
	.mark-label[data-on] {
		color: var(--arc-text-secondary);
	}
	@media (hover: hover) and (pointer: fine) {
		.mark-label:hover {
			color: var(--arc-foreground);
		}
	}
	.root[data-disabled] {
		opacity: 0.5;
	}
	.root[data-disabled] .control,
	.root[data-disabled] .thumb,
	.root[data-disabled] .mark-label {
		cursor: not-allowed;
	}
	@media (prefers-reduced-motion: reduce) {
		.thumb,
		.mark-label {
			transition: none;
		}
	}
</style>
