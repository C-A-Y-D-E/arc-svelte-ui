<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { isReducedMotion, motionTokens } from '../motion';
	import { sizeMorph, swapIn, swapOnChange, swapOut } from '../alert/swap';

	type Props = {
		title: string;
		description?: string;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Milliseconds before auto-dismiss. 0 or less disables it. Only runs with onOpenChange. */
		duration?: number;
	};

	let { title, description, open = true, onOpenChange, duration = 4500 }: Props = $props();

	type Pose = { x: number; y: number; scale: number; opacity: number };
	type Controls = ReturnType<typeof animate>;

	/** A swipe past this distance (px) or speed (px/s) dismisses the toast in the direction it was thrown. */
	const SWIPE = { distance: 80, velocity: 480 };
	/** Pointer travel before a press becomes a drag, like Motion's pan threshold. */
	const DRAG_SLOP_PX = 3;
	const THROW_CLEARANCE_PX = 48;
	const FALLBACK_WIDTH_PX = 320;
	/** Pointer samples older than this no longer count toward the release velocity. */
	const VELOCITY_WINDOW_MS = 100;
	const HIDDEN: Pose = { x: 0, y: 16, scale: 0.96, opacity: 0 };
	const SINK = { y: 8, scale: 0.97 };
	const CHECK_DRAW_DELAY = 0.12;
	const { duration: durations, ease, spring } = motionTokens;
	const enter = { duration: durations.standard, ease: ease.enter };
	const home = { type: 'spring', stiffness: 420, damping: 34 };

	let dismissed = $state(false);
	/** Where a thrown toast flies to; 0 means it was closed and sinks back toward its edge. */
	let throwX = 0;
	let releaseVelocity = 0;
	let rendered = $state(false);
	let surface: HTMLDivElement | undefined;

	const visible = $derived(open && !dismissed);

	// Stack geometry lives outside Svelte state, so following a finger never re-renders per frame.
	const pose: Pose = { ...HIDDEN };
	const running: Partial<Record<keyof Pose, Controls>> = {};
	let exitToken = 0;

	function paint() {
		if (!surface) return;
		surface.style.transform = `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale})`;
		surface.style.opacity = String(pose.opacity);
	}

	function jump(values: Partial<Pose>) {
		for (const key of Object.keys(values) as (keyof Pose)[]) {
			running[key]?.stop();
			pose[key] = values[key]!;
		}
		paint();
	}

	function tween(key: keyof Pose, to: number, transition: object) {
		running[key]?.stop();
		const controls = animate(pose[key], to, {
			...transition,
			onUpdate: (latest: number) => {
				pose[key] = latest;
				paint();
			}
		});
		running[key] = controls;
		return controls;
	}

	// Setting open true again after a dismiss re-raises the toast.
	$effect.pre(() => {
		if (!open) return;
		untrack(() => {
			dismissed = false;
			throwX = 0;
		});
	});

	$effect(() => {
		if (visible) untrack(raise);
		else untrack(lower);
	});

	$effect(() => {
		if (!visible || !onOpenChange || duration <= 0) return;
		const close = onOpenChange;
		const timer = setTimeout(() => dismiss(0, close), duration);
		return () => clearTimeout(timer);
	});

	/** A toast raised mid-exit simply turns back from where it is. */
	function raise() {
		exitToken++;
		if (!rendered) {
			rendered = true;
			return;
		}
		settleIn();
	}

	function mountSurface(node: HTMLDivElement) {
		surface = node;
		untrack(() => {
			jump(isReducedMotion() ? { x: 0, y: 0, scale: 1, opacity: 0 } : HIDDEN);
			settleIn();
		});
		return () => (surface = undefined);
	}

	function settleIn() {
		if (isReducedMotion()) {
			jump({ x: 0, y: 0, scale: 1 });
			tween('opacity', 1, { duration: durations.instant });
			return;
		}
		// x returns to center too, in case the toast is raised again while a throw is still leaving.
		tween('x', 0, spring.morph);
		tween('y', 0, spring.morph);
		tween('scale', 1, spring.morph);
		tween('opacity', 1, enter);
	}

	/** A thrown toast keeps its release velocity; a closed one sinks back toward the edge it came from. */
	async function lower() {
		if (!rendered) return;
		const token = ++exitToken;
		const leaving: Controls[] = [];
		if (isReducedMotion()) {
			leaving.push(tween('opacity', 0, { duration: durations.instant }));
		} else if (throwX) {
			// The throw settles loosely: it is invisible once the fade ends, so no long unseen tail keeps it mounted.
			const throwSpring = {
				type: 'spring',
				visualDuration: 0.3,
				bounce: 0,
				restDelta: 2,
				restSpeed: 40
			};
			leaving.push(tween('x', throwX, { ...throwSpring, velocity: releaseVelocity }));
			leaving.push(tween('opacity', 0, { duration: durations.exit }));
		} else {
			const sink = { duration: durations.exit, ease: ease.standard };
			leaving.push(
				tween('y', SINK.y, sink),
				tween('scale', SINK.scale, sink),
				tween('opacity', 0, sink)
			);
		}
		await Promise.all(leaving);
		if (token === exitToken && !visible) rendered = false;
	}

	/** Closing tells the parent at once, while the exit plays out here, so a new toast can be raised mid-exit and simply turns back. */
	function dismiss(to: number, notify = onOpenChange) {
		throwX = to;
		dismissed = true;
		notify?.(false);
	}

	/** The check draws itself a beat after the toast lands. */
	function drawCheck(path: SVGPathElement) {
		if (untrack(isReducedMotion)) return;
		animate(path, { strokeDashoffset: [1, 0] }, { ...enter, delay: CHECK_DRAW_DELAY });
	}

	type Gesture = {
		pointerId: number;
		startX: number;
		origin: number;
		dragging: boolean;
		samples: { t: number; x: number }[];
	};
	let gesture: Gesture | null = null;

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || isReducedMotion() || !visible) return;
		running.x?.stop();
		gesture = {
			pointerId: event.pointerId,
			startX: event.clientX,
			origin: pose.x,
			dragging: false,
			samples: []
		};
	}

	function onPointerMove(event: PointerEvent) {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const offset = event.clientX - gesture.startX;
		if (!gesture.dragging) {
			if (Math.abs(offset) < DRAG_SLOP_PX) return;
			gesture.dragging = true;
			const card = event.currentTarget as HTMLElement;
			card.setPointerCapture(event.pointerId);
			card.dataset.dragging = '';
			window.getSelection()?.removeAllRanges();
		}
		jump({ x: gesture.origin + offset });
		gesture.samples.push({ t: event.timeStamp, x: pose.x });
		while (
			gesture.samples.length > 2 &&
			event.timeStamp - gesture.samples[0].t > VELOCITY_WINDOW_MS
		)
			gesture.samples.shift();
	}

	function releaseSpeed({ samples }: Gesture) {
		const first = samples[0];
		const last = samples[samples.length - 1];
		if (!first || !last || last.t === first.t) return 0;
		return ((last.x - first.x) / (last.t - first.t)) * 1000;
	}

	function onPointerUp(event: PointerEvent) {
		const current = gesture;
		if (!current || current.pointerId !== event.pointerId) return;
		gesture = null;
		if (!current.dragging) return;
		delete (event.currentTarget as HTMLElement).dataset.dragging;
		const velocity = releaseSpeed(current);
		const offset = pose.x - current.origin;
		// A short swipe springs back with its release velocity and a slight settle instead of drifting home.
		if (Math.abs(offset) < SWIPE.distance && Math.abs(velocity) < SWIPE.velocity) {
			tween('x', 0, { ...home, velocity });
			return;
		}
		releaseVelocity = velocity;
		const direction = Math.sign(offset || velocity);
		dismiss(direction * ((surface?.offsetWidth ?? FALLBACK_WIDTH_PX) + THROW_CLEARANCE_PX));
	}
</script>

{#if rendered}
	<div
		{@attach mountSurface}
		class="toast"
		role="status"
		aria-live="polite"
		aria-atomic="true"
		inert={!visible || undefined}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
	>
		<span class="icon" aria-hidden="true">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.25"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path {@attach drawCheck} d="M4 12.5l5 5L20 6.5" pathLength="1" stroke-dasharray="1" />
			</svg>
		</span>
		<!-- The copy column follows its content height, so a longer message grows the toast instead of snapping it. -->
		<div class="frame" {@attach sizeMorph()}>
			<div class="copy">
				<strong class="title"><span class="line" {@attach swapOnChange()}>{title}</span></strong>
				{#if description}
					<span class="description" in:swapIn out:swapOut>
						<span class="description-text" {@attach swapOnChange()}>{description}</span>
					</span>
				{/if}
			</div>
		</div>
		<button
			class="close"
			type="button"
			aria-label="Dismiss notification"
			onclick={() => dismiss(0)}
		>
			<XIcon width={16} height={16} strokeWidth={2} aria-hidden="true" />
		</button>
	</div>
{/if}

<style>
	.toast {
		display: flex;
		width: min(100%, 26rem);
		min-width: 0;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem 0.875rem 0.875rem 1rem;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: color-mix(in oklch, var(--arc-surface) 94%, var(--arc-background));
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		touch-action: pan-y;
	}
	.toast[data-dragging] {
		cursor: grabbing;
		user-select: none;
	}
	.icon {
		display: grid;
		width: 1.875rem;
		height: 1.875rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid color-mix(in oklch, var(--arc-success) 24%, var(--arc-border));
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-success) 10%, var(--arc-surface));
		color: var(--arc-success);
	}
	.frame {
		display: block;
		min-width: 0;
		flex: 1;
	}
	.copy {
		position: relative;
		display: grid;
		min-width: 0;
		gap: 0.25rem;
		padding-top: 0.125rem;
	}
	.title {
		position: relative;
		display: block;
		min-width: 0;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: 1.35;
	}
	.line {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.description {
		display: block;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.description-text {
		display: block;
	}
	.close {
		display: grid;
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
		place-items: center;
		margin: -0.125rem -0.125rem 0 0;
		border: 0;
		border-radius: var(--arc-radius-control); /* boxy, like the other controls */
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	/* Quick press, spring release. */
	.close:active {
		transform: scale(0.96);
		transition-duration: var(--arc-duration-instant);
		transition-timing-function: var(--arc-ease-standard);
	}
	.close:focus-visible {
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.close {
			transition: none;
		}
		.close:active {
			transform: none;
		}
	}
</style>
