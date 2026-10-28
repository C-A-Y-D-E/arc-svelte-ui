<script module lang="ts">
	export type ImageCompareOrientation = 'horizontal' | 'vertical';
</script>

<!--
	Before and after, split by a divider. Drag anywhere to move it: the handle follows 1:1, rubber-bands past the edges, and stays where it
	is released. A press on the image springs the divider there; on touch the press waits to see a sideways drag so the page still scrolls.
	Arrow keys step 1% (Shift for 10%), Home and End reveal one side fully, and a double-click on the handle springs it back to the middle.
-->
<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { animate, motionValue, styleEffect, transformValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';
	import {
		clamp,
		fade,
		halfPlane,
		lerp,
		physicalSpring,
		rubber,
		soften,
		type FrameMetrics,
		type Point
	} from './image-compare-geometry';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The original, shown on the left (or top). Pass an image with its own alt text; it is sized to cover the frame. */
		before: Snippet;
		/** The result, shown on the right (or bottom). */
		after: Snippet;
		/** Where the divider sits, in percent from the left (or top). */
		position?: number;
		defaultPosition?: number;
		onPositionChange?: (position: number) => void;
		/** Vertical stacks the images top and bottom. Changing it swings the divider a quarter turn instead of swapping layouts. */
		orientation?: ImageCompareOrientation;
		/** Captions over each side. They fade as the divider reaches them. Pass false to hide them. */
		labels?: [string, string] | false;
		/** Accessible name of the divider. */
		label?: string;
		/** Frame proportions, as a CSS aspect-ratio. */
		aspectRatio?: string;
	};

	type DragState = {
		pointer: number;
		grab: number;
		press: boolean;
		started: boolean;
		x: number;
		y: number;
		raw: number;
	};

	let {
		before,
		after,
		defaultPosition = 50,
		position = $bindable(defaultPosition),
		onPositionChange,
		orientation = 'horizontal',
		labels = ['Before', 'After'],
		label = 'Before and after',
		aspectRatio = '3 / 2',
		class: className,
		...rest
	}: Props = $props();

	const { spring } = motionTokens;
	const MOVE_SPRING = physicalSpring(spring.snappy);
	const TURN_SPRING = physicalSpring(spring.morph);
	const KICK_SPRING = physicalSpring(spring.morph);
	const INSTANT = { duration: 0 };

	const QUARTER_TURN_DEG = 90;
	const DEG_TO_RAD = Math.PI / 180;
	const CENTER_PERCENT = 50;
	const FINE_STEP = 1;
	const COARSE_STEP = 10;
	/** Speed of the bump a key press gives at a limit, in px/s. */
	const BUMP_PX_PER_S = 150;
	/** Movement before a touch on the photo is read as a sideways drag or a scroll. */
	const SLOP_PX = 6;
	/** Caption chips sit this far inside the frame, and fade when the divider comes within this gap of them. */
	const CHIP_INSET_PX = 12;
	const CHIP_GAP_PX = 8;
	/** Captions hand over in the outer thirds of a turn. */
	const CAPTION_HANDOVER = 3;
	const HANDLE_REST = { width: 40, height: 40 };
	const CAPSULE_WIDE = { width: 56, height: 36 };
	const CAPSULE_TALL = { width: 36, height: 56 };
	const CHEVRON_SPREAD_PX = 4;
	const EMPTY_METRICS: FrameMetrics = {
		width: 0,
		height: 0,
		beforeChipWidth: 0,
		beforeChipHeight: 0,
		afterChipWidth: 0,
		afterChipHeight: 0
	};

	const reduced = $derived(isReducedMotion());
	const vertical = $derived(orientation === 'vertical');
	const current = $derived(clamp(position, 0, 100));
	const afterShare = $derived(Math.round(100 - current));

	let root: HTMLDivElement;
	let beforeLayer: HTMLDivElement;
	let pivot: HTMLDivElement;
	let rotor: HTMLSpanElement;
	let handleSlot: HTMLSpanElement;
	let handle: HTMLDivElement;
	let chevrons: HTMLSpanElement;
	let chevronBack: HTMLSpanElement;
	let chevronForward: HTMLSpanElement;
	let beforeChip = $state<HTMLSpanElement>();
	let afterChip = $state<HTMLSpanElement>();
	let afterChipBottom = $state<HTMLSpanElement>();

	let latest = untrack(() => current);
	let goal = latest;
	let drag: DragState | null = null;
	let pressedHandle = false;
	let dragging = $state(false);
	let quiet = $state(false);

	// The divider is a committed position plus a catch-up offset: a press springs the offset to zero while the pointer moves the position
	// 1:1, so the divider glides to the finger and never trails it.
	const pos = motionValue(latest);
	const lag = motionValue(0);
	const theta = motionValue(untrack(() => (vertical ? QUARTER_TURN_DEG : 0)));
	const metrics = motionValue<FrameMetrics>(EMPTY_METRICS);
	const shown = transformValue(() => pos.get() + lag.get());
	const turn = transformValue(() => clamp(theta.get() / QUARTER_TURN_DEG, 0, 1));

	/** Motion only tracks the values a transform reads on its first run, so every transform reads all of them before branching. */
	function readDivider() {
		return { angle: theta.get(), shown: shown.get(), frame: metrics.get(), turn: turn.get() };
	}
	type Divider = ReturnType<typeof readDivider>;

	const isAtRest = ({ angle, frame }: Divider) =>
		angle === 0 || angle === QUARTER_TURN_DEG || !frame.width;
	const isTurnedPastHalf = ({ angle }: Divider) => angle >= QUARTER_TURN_DEG / 2;

	/** The divider's pivot in pixels, blending from the horizontal to the vertical layout as it turns. */
	function pivotPoint({ shown, frame, turn }: Divider): Point {
		return [
			lerp((shown / 100) * frame.width, frame.width / 2, turn),
			lerp(frame.height / 2, (shown / 100) * frame.height, turn)
		];
	}

	// At rest every style is a percentage, so the server renders it and a resize never lags; only a turn in progress uses pixels.
	const clipPath = transformValue(() => {
		const divider = readDivider();
		const hidden = (100 - clamp(divider.shown, 0, 100)).toFixed(3);
		if (isAtRest(divider)) {
			return isTurnedPastHalf(divider) ? `inset(0 0 ${hidden}% 0)` : `inset(0 ${hidden}% 0 0)`;
		}
		const clamped = { ...divider, shown: clamp(divider.shown, 0, 100) };
		return halfPlane(
			divider.frame.width,
			divider.frame.height,
			pivotPoint(clamped),
			divider.angle * DEG_TO_RAD
		);
	});
	const pivotX = transformValue(() => {
		const divider = readDivider();
		if (!isAtRest(divider)) return `${pivotPoint(divider)[0]}px`;
		return isTurnedPastHalf(divider) ? '50%' : `${divider.shown}%`;
	});
	const pivotY = transformValue(() => {
		const divider = readDivider();
		if (!isAtRest(divider)) return `${pivotPoint(divider)[1]}px`;
		return isTurnedPastHalf(divider) ? `${divider.shown}%` : '50%';
	});

	/** How far the handle sits from the line along the drag axis, so it stays whole near an edge. */
	function handleOffset({ shown, frame, turn }: Divider) {
		if (!frame.width) return 0;
		const x = (shown / 100) * frame.width;
		const y = (shown / 100) * frame.height;
		return lerp(soften(x, frame.width) - x, soften(y, frame.height) - y, turn);
	}
	const handleX = transformValue(() => {
		const divider = readDivider();
		return handleOffset(divider) * Math.cos(divider.angle * DEG_TO_RAD);
	});
	const handleY = transformValue(() => {
		const divider = readDivider();
		return handleOffset(divider) * Math.sin(divider.angle * DEG_TO_RAD);
	});

	const acrossShare = (turnAmount: number) => clamp(1 - turnAmount * CAPTION_HANDOVER, 0, 1);
	const downShare = (turnAmount: number) =>
		clamp(turnAmount * CAPTION_HANDOVER - (CAPTION_HANDOVER - 1), 0, 1);

	// Captions fade as the divider reaches them, and hand over mid-turn when the after caption changes corner.
	const beforeOpacity = transformValue(() => {
		const { frame, turn, shown } = readDivider();
		const across = acrossShare(turn);
		const down = downShare(turn);
		if (!frame.width) return across + down;
		const reach = clamp(shown, 0, 100) / 100;
		const roomAcross = reach * frame.width - (CHIP_INSET_PX + frame.beforeChipWidth + CHIP_GAP_PX);
		const roomDown = reach * frame.height - (CHIP_INSET_PX + frame.beforeChipHeight + CHIP_GAP_PX);
		return across * fade(roomAcross) + down * fade(roomDown);
	});
	const afterAcrossOpacity = transformValue(() => {
		const { frame, turn, shown } = readDivider();
		const across = acrossShare(turn);
		if (!frame.width) return across;
		const divider = (clamp(shown, 0, 100) / 100) * frame.width;
		return (
			across * fade(frame.width - CHIP_INSET_PX - frame.afterChipWidth - CHIP_GAP_PX - divider)
		);
	});
	const afterDownOpacity = transformValue(() => {
		const { frame, turn, shown } = readDivider();
		const down = downShare(turn);
		if (!frame.width) return down;
		const divider = (clamp(shown, 0, 100) / 100) * frame.height;
		return (
			down * fade(frame.height - CHIP_INSET_PX - frame.afterChipHeight - CHIP_GAP_PX - divider)
		);
	});

	/** Server-rendered resting look, before the motion values take over. */
	const resting = {
		clipPath: clipPath.get(),
		pivot: `translateX(${pivotX.get()}) translateY(${pivotY.get()})`,
		rotate: `rotate(${theta.get()}deg)`,
		beforeOpacity: beforeOpacity.get(),
		afterAcrossOpacity: afterAcrossOpacity.get(),
		afterDownOpacity: afterDownOpacity.get()
	};

	$effect(() => {
		const measure = () =>
			metrics.set({
				width: root.clientWidth,
				height: root.clientHeight,
				beforeChipWidth: beforeChip?.offsetWidth ?? 0,
				beforeChipHeight: beforeChip?.offsetHeight ?? 0,
				afterChipWidth: afterChip?.offsetWidth ?? 0,
				afterChipHeight: afterChip?.offsetHeight ?? 0
			});
		const observer = new ResizeObserver(measure);
		[root, beforeChip, afterChip].forEach((node) => node && observer.observe(node));
		measure();
		return () => observer.disconnect();
	});

	$effect(() => {
		const stops = [
			styleEffect(beforeLayer, { clipPath }),
			styleEffect(pivot, { x: pivotX, y: pivotY }),
			styleEffect(rotor, { rotate: theta }),
			styleEffect(handleSlot, { x: handleX, y: handleY }),
			styleEffect(chevrons, { rotate: theta })
		];
		return () => stops.forEach((stop) => stop());
	});

	$effect(() => {
		if (!beforeChip || !afterChip || !afterChipBottom) return;
		const stops = [
			styleEffect(beforeChip, { opacity: beforeOpacity }),
			styleEffect(afterChip, { opacity: afterAcrossOpacity }),
			styleEffect(afterChipBottom, { opacity: afterDownOpacity })
		];
		return () => stops.forEach((stop) => stop());
	});

	// A new orientation swings the divider a quarter turn about its pivot while the clip follows it.
	$effect(() => {
		const target = vertical ? QUARTER_TURN_DEG : 0;
		if (theta.get() === target) return;
		if (reduced) theta.jump(target);
		else animate(theta, target, TURN_SPRING);
	});

	// Positions that arrive from outside a drag (props, keys, a double-click) spring the divider there.
	$effect(() => {
		const next = current;
		untrack(() => springTo(next));
	});

	$effect(() => {
		const transition = reduced ? INSTANT : spring.morph;
		const capsule = vertical ? CAPSULE_TALL : CAPSULE_WIDE;
		const spread = dragging ? CHEVRON_SPREAD_PX : 0;
		animate(handle, dragging ? capsule : HANDLE_REST, transition);
		animate(chevronBack, { x: -spread }, transition);
		animate(chevronForward, { x: spread }, transition);
	});

	function springTo(next: number) {
		latest = next;
		if (drag?.started || goal === next) return;
		goal = next;
		const from = pos.get() + lag.get();
		lag.jump(0);
		pos.jump(from);
		if (reduced) pos.jump(next);
		else animate(pos, next, MOVE_SPRING);
	}

	function commit(next: number, live = false) {
		if (live && Math.round(next) === Math.round(latest)) return;
		const value = Number(next.toFixed(2));
		if (value === latest) return;
		latest = value;
		position = value;
		onPositionChange?.(value);
	}

	function percentAt(event: PointerEvent) {
		const rect = root.getBoundingClientRect();
		if (vertical) return ((event.clientY - rect.top) / (rect.height || 1)) * 100;
		return ((event.clientX - rect.left) / (rect.width || 1)) * 100;
	}

	function axisSize() {
		const rect = root.getBoundingClientRect();
		return (vertical ? rect.height : rect.width) || 1;
	}

	/** Focus that follows a pointer keeps the handle quiet: no ring until a key is pressed. */
	function focusQuietly() {
		if (document.activeElement === handle) return;
		quiet = true;
		handle.focus({ preventScroll: true });
	}

	function start(state: DragState, at: number) {
		const from = pos.get() + lag.get();
		state.started = true;
		state.grab = state.press ? 0 : at - from;
		lag.jump(0);
		pos.jump(from);
		dragging = true;
		focusQuietly();
		follow(state, at, true);
	}

	/** Puts the line under the pointer, with resistance past the edges, and commits the position once per whole percent. */
	function follow(state: DragState, at: number, first = false) {
		const raw = at - state.grab;
		const size = axisSize();
		const edge = clamp(raw, 0, 100);
		const placed = reduced ? edge : edge + (rubber(((raw - edge) / 100) * size) / size) * 100;
		state.raw = raw;
		if (first && state.press && !reduced) {
			const from = pos.get();
			pos.jump(placed);
			lag.jump(from - placed);
			animate(lag, 0, MOVE_SPRING);
		} else {
			pos.set(placed);
		}
		commit(edge, true);
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !event.isPrimary) return;
		const onHandle = !!(event.target as HTMLElement).closest('[data-handle]');
		pressedHandle = onHandle;
		root.setPointerCapture(event.pointerId);
		const state: DragState = {
			pointer: event.pointerId,
			grab: 0,
			press: !onHandle,
			started: false,
			x: event.clientX,
			y: event.clientY,
			raw: 0
		};
		drag = state;
		// A finger on the photo might be scrolling the page, so it waits for a sideways drag; a mouse or the handle answers at once.
		if (event.pointerType !== 'touch' || onHandle) start(state, percentAt(event));
	}

	function onPointerMove(event: PointerEvent) {
		const state = drag;
		if (!state || state.pointer !== event.pointerId) return;
		if (state.started) {
			follow(state, percentAt(event));
			return;
		}
		const dx = Math.abs(event.clientX - state.x);
		const dy = Math.abs(event.clientY - state.y);
		const along = vertical ? dy : dx;
		const across = vertical ? dx : dy;
		if (along < SLOP_PX && across < SLOP_PX) return;
		if (across > along) {
			drag = null;
			return;
		}
		start(state, percentAt(event));
	}

	function onPointerEnd(event: PointerEvent) {
		const state = drag;
		if (!state || state.pointer !== event.pointerId) return;
		drag = null;
		// A tap on the photo moves the divider there.
		if (!state.started) {
			if (event.type === 'pointerup') {
				focusQuietly();
				commit(clamp(percentAt(event), 0, 100));
			}
			return;
		}
		// The divider stays where it was let go. Past an edge, or still catching up to a press, it springs on with the speed it had.
		const from = pos.get() + lag.get();
		const pastEdge = from > 100 || from < 0;
		const velocity = lag.getVelocity() + (pastEdge ? pos.getVelocity() : 0);
		const target = clamp(lag.get() !== 0 ? state.raw : from, 0, 100);
		lag.jump(0);
		pos.jump(from);
		goal = Number(target.toFixed(2));
		if (from !== target) {
			if (reduced) pos.jump(target);
			else animate(pos, target, { ...MOVE_SPRING, velocity });
		}
		commit(target);
		dragging = false;
	}

	/** Keys move the divider the way they point along its axis; the other two follow the value, where up and right mean more of the after image. */
	function keyStep(key: string, step: number): number | undefined {
		const toward: Record<string, number> = vertical
			? { ArrowUp: -step, ArrowDown: step, ArrowRight: -step, ArrowLeft: step }
			: { ArrowLeft: -step, ArrowRight: step, ArrowUp: -step, ArrowDown: step };
		const page: Record<string, number> = { PageUp: -COARSE_STEP, PageDown: COARSE_STEP };
		return toward[key] ?? page[key];
	}

	function keyTarget(event: KeyboardEvent) {
		if (event.key === 'Home') return 100;
		if (event.key === 'End') return 0;
		const step = keyStep(event.key, event.shiftKey ? COARSE_STEP : FINE_STEP);
		return step === undefined ? null : Math.round(latest) + step;
	}

	function onKeyDown(event: KeyboardEvent) {
		const next = keyTarget(event);
		if (next === null) return;
		event.preventDefault();
		quiet = false;
		const clamped = clamp(next, 0, 100);
		if (clamped === latest) {
			if (!reduced && next !== clamped) bumpAtLimit(Math.sign(next - clamped));
			return;
		}
		commit(clamped);
	}

	function bumpAtLimit(direction: number) {
		const velocity = ((direction * BUMP_PX_PER_S) / axisSize()) * 100;
		animate(pos, goal, { ...KICK_SPRING, velocity });
	}

	// Pointer capture sends the double-click to the frame, so it checks where the presses began.
	function recenterFromHandle() {
		if (pressedHandle && latest !== CENTER_PERCENT) commit(CENTER_PERCENT);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={root}
	{...rest}
	class={['root', className]}
	data-orientation={orientation}
	data-dragging={dragging || undefined}
	style:aspect-ratio={aspectRatio}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerEnd}
	onpointercancel={onPointerEnd}
	onlostpointercapture={onPointerEnd}
	onmousedown={(event) => event.preventDefault()}
	ondragstart={(event) => event.preventDefault()}
	ondblclick={recenterFromHandle}
>
	<div class="layer">{@render after()}</div>
	<div bind:this={beforeLayer} class="layer" style:clip-path={resting.clipPath}>
		{@render before()}
	</div>
	{#if labels}
		<span
			bind:this={beforeChip}
			class="chip"
			style:opacity={resting.beforeOpacity}
			aria-hidden="true"
		>
			{labels[0]}
		</span>
		<span
			bind:this={afterChip}
			class="chip"
			data-place="end"
			style:opacity={resting.afterAcrossOpacity}
			aria-hidden="true"
		>
			{labels[1]}
		</span>
		<span
			bind:this={afterChipBottom}
			class="chip"
			data-place="bottom"
			style:opacity={resting.afterDownOpacity}
			aria-hidden="true"
		>
			{labels[1]}
		</span>
	{/if}
	<div bind:this={pivot} class="pivot" style:transform={resting.pivot}>
		<span bind:this={rotor} class="rotor" style:transform={resting.rotate}
			><span class="line"></span></span
		>
		<span bind:this={handleSlot} class="handle-slot">
			<div
				bind:this={handle}
				data-handle=""
				data-quiet={quiet || undefined}
				class="handle"
				role="slider"
				tabindex="0"
				aria-label={label}
				aria-orientation={orientation}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={afterShare}
				aria-valuetext="{afterShare}% after"
				onkeydown={onKeyDown}
				onblur={() => (quiet = false)}
			>
				<span
					bind:this={chevrons}
					class="chevrons"
					style:transform={resting.rotate}
					aria-hidden="true"
				>
					<span bind:this={chevronBack} class="chevron"
						><ChevronLeftIcon size={16} strokeWidth={2} /></span
					>
					<span bind:this={chevronForward} class="chevron"
						><ChevronRightIcon size={16} strokeWidth={2} /></span
					>
				</span>
			</div>
		</span>
	</div>
</div>

<style>
	/* The frame is a size container, so the divider's line can span any angle with container units. Vertical pans still scroll the page on touch. */
	.root {
		position: relative;
		display: block;
		width: 100%;
		overflow: clip;
		container-type: size;
		isolation: isolate;
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-muted);
		cursor: ew-resize;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.root[data-orientation='vertical'] {
		cursor: ns-resize;
		touch-action: pan-x;
	}
	/* A hairline keeps light photos from bleeding into the page. */
	.root::after {
		content: '';
		position: absolute;
		z-index: 3;
		inset: 0;
		border-radius: inherit;
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--arc-foreground) 8%, transparent);
		pointer-events: none;
	}
	.layer {
		position: absolute;
		inset: 0;
	}
	.layer :global(:where(img, picture, video)) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
		-webkit-user-drag: none;
	}
	/* Captions sit on a frosted chip so they read over any photo, below the divider. */
	.chip {
		position: absolute;
		z-index: 1;
		top: var(--arc-space-3);
		left: var(--arc-space-3);
		padding: 3px 10px;
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-background) 74%, transparent);
		color: var(--arc-foreground);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		pointer-events: none;
		-webkit-backdrop-filter: blur(12px) saturate(1.4);
		backdrop-filter: blur(12px) saturate(1.4);
	}
	.chip[data-place='end'] {
		right: var(--arc-space-3);
		left: auto;
	}
	.chip[data-place='bottom'] {
		top: auto;
		bottom: var(--arc-space-3);
	}
	/* The pivot is a frame-sized layer moved by a percentage of itself; its top-left corner is the divider's center. */
	.pivot {
		position: absolute;
		z-index: 2;
		inset: 0;
		pointer-events: none;
	}
	.rotor {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
	}
	.line {
		position: absolute;
		top: calc((100cqw + 100cqh) * -1);
		left: -1px;
		width: 2px;
		height: calc((100cqw + 100cqh) * 2);
		background: var(--arc-surface-raised);
		box-shadow: 0 0 0 0.5px oklch(0% 0 0 / 0.14);
	}
	/* The line sits on photography, not on the theme, so it stays light in dark mode too. */
	:global(.dark) .line {
		background: var(--arc-foreground);
	}
	.handle-slot {
		position: absolute;
		top: 0;
		left: 0;
	}
	/* Centered with the translate property; Motion only animates its width and height, so the shape morphs without scaling the icons. */
	.handle {
		position: absolute;
		top: 0;
		left: 0;
		display: grid;
		box-sizing: border-box;
		width: 40px;
		height: 40px;
		place-items: center;
		translate: -50% -50%;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-raised);
		color: var(--arc-foreground);
		pointer-events: auto;
		outline: 0 solid transparent;
		transition: border-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.handle::after {
		content: '';
		position: absolute;
		inset: -8px;
		border-radius: inherit;
	}
	@media (hover: hover) and (pointer: fine) {
		.root:hover .handle {
			border-color: var(--arc-border-strong);
		}
	}
	/* Two rings, light inside dark, so focus reads over any photo. A handle focused by a press stays quiet until a key is used. */
	.handle:focus-visible:not([data-quiet]) {
		outline: 2px solid var(--arc-foreground);
		outline-offset: 2px;
		box-shadow:
			var(--arc-shadow-raised),
			0 0 0 2px var(--arc-background);
	}
	.chevrons {
		display: flex;
		align-items: center;
	}
	.chevron {
		display: grid;
		margin-inline: -2.5px;
		place-items: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.handle {
			transition: none;
		}
	}
</style>
