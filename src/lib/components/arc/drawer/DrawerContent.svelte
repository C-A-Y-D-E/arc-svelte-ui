<script module lang="ts">
	export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';
</script>

<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog, type DialogContentProps } from 'bits-ui';
	import { animate, motionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import { strings } from '../strings';
	import { isReducedMotion, motionTokens } from '../motion';
	import { getDrawerContext } from './context';
	import SwapText from './SwapText.svelte';

	type Props = Omit<DialogContentProps, 'child' | 'children' | 'forceMount' | 'title'> & {
		title: string;
		description?: string;
		side?: DrawerSide;
		/** Renders the drawer inside this element instead of the page body, anchored to its edges. The element needs position: relative and overflow: hidden. */
		container?: HTMLElement | null;
		children: Snippet;
	};

	let {
		title,
		description,
		side = 'right',
		container,
		class: className,
		ref = $bindable(null),
		children,
		...rest
	}: Props = $props();

	type PanSample = { time: number; position: number };
	type Pan = {
		pointerId: number;
		startX: number;
		startY: number;
		origin: number | null;
		samples: PanSample[];
	};

	const FALLBACK_PANEL_PX = 480;
	const PAN_THRESHOLD_PX = 3;
	const VELOCITY_WINDOW_MS = 100;
	const FLICK_PX_PER_SECOND = 500;
	const DISMISS_FRACTION = 1 / 3;
	const INTERACTIVE = "button, a, input, select, textarea, [role='button']";

	const { duration, spring } = motionTokens;
	const reducedFade = { duration: duration.instant };
	/* A click or Escape returns the panel quickly; a flick keeps its velocity in a spring of the same length. The shadow fades over the last stretch so it leaves with the panel instead of popping away at unmount. */
	const SHADOW_OUT_KEYFRAMES = [1, 1, 0];
	const shadowOut = { duration: duration.standard, times: [0, 0.65, 1], ease: 'linear' as const };
	const closeTween = { duration: duration.standard, ease: motionTokens.ease.standard };
	const flingSpring = { ...spring.smooth, visualDuration: duration.standard };
	const overlayIn = { duration: duration.standard, ease: motionTokens.ease.enter };
	const overlayOut = { duration: duration.fast, ease: motionTokens.ease.standard };

	const drawer = getDrawerContext();
	const reduced = $derived(isReducedMotion());
	const axis = $derived(side === 'left' || side === 'right' ? 'x' : 'y');
	const sign = $derived(side === 'right' || side === 'bottom' ? 1 : -1);
	const draggable = $derived(drawer !== undefined && !reduced);
	const contained = $derived(container ? '' : undefined);

	let panel = $state<HTMLDivElement | null>(null);
	let overlay = $state<HTMLDivElement | null>(null);
	let mounted = $state(drawer?.open ?? false);
	let hasEntered = false;
	let exitRun = 0;
	let pan: Pan | null = null;
	const offset = motionValue(0);
	const opacity = motionValue(1);

	$effect.pre(() => {
		if (drawer?.open) mounted = true;
	});

	$effect(() => {
		if (!panel) return;
		const node = panel;
		const translate = axis === 'x' ? 'translateX' : 'translateY';
		const render = () => {
			const distance = offset.get();
			node.style.transform = distance ? `${translate}(${distance}px)` : 'none';
			node.style.opacity = String(opacity.get());
		};
		render();
		const unsubscribers = [offset.on('change', render), opacity.on('change', render)];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	});

	$effect(() => {
		if (!panel || !overlay || !drawer) {
			hasEntered = false;
			return;
		}
		const open = drawer.open;
		untrack(() => (open ? playEnter() : playExit()));
	});

	function panelSize() {
		if (!panel) return FALLBACK_PANEL_PX;
		return axis === 'x' ? panel.offsetWidth : panel.offsetHeight;
	}

	// The panel springs fully opaque from its own edge and returns to it faster than it arrived, from wherever it is.
	function playEnter() {
		exitRun++;
		const firstFrame = !hasEntered;
		hasEntered = true;
		if (overlay)
			animate(overlay, { opacity: firstFrame ? [0, 1] : 1 }, reduced ? reducedFade : overlayIn);
		if (reduced) {
			offset.jump(0);
			if (firstFrame) opacity.jump(0);
			animate(opacity, 1, reducedFade);
			return;
		}
		if (firstFrame) {
			offset.jump(sign * panelSize());
			opacity.jump(1);
		}
		animate(offset, 0, spring.smooth);
		animate(opacity, 1, spring.smooth);
	}

	async function playExit() {
		const run = ++exitRun;
		const exits = reduced
			? [animate(opacity, 0, reducedFade)]
			: [
					animate(offset, sign * panelSize(), drawer?.flung ? flingSpring : closeTween),
					animate(opacity, SHADOW_OUT_KEYFRAMES, shadowOut)
				];
		if (overlay) exits.push(animate(overlay, { opacity: 0 }, reduced ? reducedFade : overlayOut));
		await Promise.all(exits);
		if (run === exitRun && !drawer?.open) mounted = false;
	}

	function positionOnAxis(event: PointerEvent) {
		return axis === 'x' ? event.clientX : event.clientY;
	}

	function releaseVelocity(samples: PanSample[]) {
		const last = samples[samples.length - 1];
		const first = samples.find((sample) => last.time - sample.time <= VELOCITY_WINDOW_MS);
		if (!first || first === last) return 0;
		return (last.position - first.position) / ((last.time - first.time) / 1000);
	}

	// The header is the grab handle. It follows the pointer toward the edge and rubber-bands the other way.
	function panStart(event: PointerEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (!draggable || event.button !== 0 || target?.closest(INTERACTIVE)) return;
		pan = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: null,
			samples: []
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function panMove(event: PointerEvent) {
		if (!pan || event.pointerId !== pan.pointerId) return;
		if (pan.origin === null) {
			if (Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) < PAN_THRESHOLD_PX)
				return;
			// A grab mid-flight catches the panel where it is.
			offset.stop();
			pan.origin = offset.get();
		}
		const start = axis === 'x' ? pan.startX : pan.startY;
		const toward = (pan.origin + positionOnAxis(event) - start) * sign;
		offset.set(sign * (toward >= 0 ? toward : -Math.sqrt(-toward)));
		pan.samples.push({ time: event.timeStamp, position: positionOnAxis(event) });
	}

	// Past a third of the panel, or on a quick flick toward the edge, the drawer closes and keeps its velocity; otherwise it springs back.
	function panEnd(event: PointerEvent) {
		if (!pan || event.pointerId !== pan.pointerId) return;
		const { origin, samples } = pan;
		pan = null;
		if (origin === null) return;
		samples.push({ time: event.timeStamp, position: positionOnAxis(event) });
		const toward = offset.get() * sign;
		const flicked = toward > 0 && releaseVelocity(samples) * sign > FLICK_PX_PER_SECOND;
		if (toward > panelSize() * DISMISS_FRACTION || flicked) drawer?.fling();
		else animate(offset, 0, spring.snappy);
	}
</script>

{#snippet panelInner()}
	<!-- svelte-ignore a11y_no_static_element_interactions (dragging is optional; the close button and Escape dismiss too) -->
	<div
		class={['header', draggable && 'handle']}
		onpointerdown={panStart}
		onpointermove={panMove}
		onpointerup={panEnd}
		onpointercancel={panEnd}
	>
		<div>
			<Dialog.Title>
				{#snippet child({ props })}
					<h2 {...props} class="title"><SwapText text={title} /></h2>
				{/snippet}
			</Dialog.Title>
			{#if description}
				<Dialog.Description>
					{#snippet child({ props })}
						<p {...props} class="description"><SwapText text={description ?? ''} /></p>
					{/snippet}
				</Dialog.Description>
			{/if}
		</div>
		<Dialog.Close>
			{#snippet child({ props })}
				<button {...props} type="button" class="close" aria-label={strings.drawerClose()}>
					<XIcon size={18} strokeWidth={1.8} aria-hidden="true" />
				</button>
			{/snippet}
		</Dialog.Close>
	</div>
	<div class="body">{@render children()}</div>
{/snippet}

{#if drawer}
	{#if mounted}
		<Dialog.Portal to={container ?? undefined}>
			<Dialog.Overlay forceMount>
				{#snippet child({ props })}
					<div {...props} bind:this={overlay} class="overlay" data-contained={contained}></div>
				{/snippet}
			</Dialog.Overlay>
			<Dialog.Content {...rest} bind:ref forceMount>
				{#snippet child({ props })}
					<div
						{...props}
						bind:this={panel}
						tabindex="-1"
						class={['content', className]}
						data-side={side}
						data-contained={contained}
					>
						{@render panelInner()}
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	{/if}
{:else}
	<!-- Under a bare bits-ui Dialog root the open state is unknown here, so CSS keyframes keyed off data-state animate the layers instead. -->
	<Dialog.Portal to={container ?? undefined}>
		<Dialog.Overlay>
			{#snippet child({ props })}
				<div {...props} class="overlay keyframes" data-contained={contained}></div>
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content {...rest} bind:ref>
			{#snippet child({ props })}
				<div
					{...props}
					tabindex="-1"
					class={['content', 'keyframes', className]}
					data-side={side}
					data-contained={contained}
				>
					{@render panelInner()}
				</div>
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		/* A plain dim, no blur, like the dialog's. */
		background: oklch(10% 0 0 / 0.32);
	}

	.content {
		--drawer-size: min(30rem, calc(100vw - var(--arc-space-4)));
		/* Critically damped, like a sheet spring: it never overshoots past the edge it is anchored to. */
		--drawer-ease: cubic-bezier(0.32, 0.72, 0, 1);
		--drawer-from: translateX(100%);
		position: fixed;
		z-index: 51;
		display: flex;
		flex-direction: column;
		width: var(--drawer-size);
		max-width: 100vw;
		max-height: 100dvh;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
	}
	/* While a layer leaves it lets clicks through, so pressing the trigger again during the close reopens the drawer from wherever it is. */
	/* bits-ui writes pointer-events inline on the layers, so the closing state has to win over it. */
	.overlay[data-state='closed'],
	.content[data-state='closed'] {
		pointer-events: none !important;
	}

	.content[data-side='right'] {
		inset: 0 0 0 auto;
		border-width: 1px 0 1px 1px;
		border-radius: 22px 0 0 22px;
	}
	.content[data-side='left'] {
		inset: 0 auto 0 0;
		border-width: 1px 1px 1px 0;
		border-radius: 0 22px 22px 0;
	}
	.content[data-side='top'] {
		inset: 0 0 auto;
		width: 100%;
		max-width: none;
		max-height: min(32rem, 100dvh);
		border-width: 0 0 1px;
		border-radius: 0 0 22px 22px;
	}
	.content[data-side='bottom'] {
		inset: auto 0 0;
		width: 100%;
		max-width: none;
		max-height: min(32rem, 100dvh);
		border-width: 1px 0 0;
		border-radius: 22px 22px 0 0;
	}
	.content[data-side='bottom']::before {
		position: absolute;
		top: 9px;
		left: 50%;
		width: 2.25rem;
		height: 4px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border-strong);
		content: '';
		opacity: 0.75;
		transform: translateX(-50%);
	}

	/* Motion springs the panel from its edge. Keyframes only run when DrawerContent sits under a bare bits-ui root. */
	.content[data-side='left'] {
		--drawer-from: translateX(-100%);
	}
	.content[data-side='top'] {
		--drawer-from: translateY(-100%);
	}
	.content[data-side='bottom'] {
		--drawer-from: translateY(100%);
	}
	.keyframes.overlay[data-state='open'] {
		animation: overlay-in var(--arc-duration-standard) var(--arc-ease-enter) both;
	}
	.keyframes.overlay[data-state='closed'] {
		animation: overlay-out var(--arc-duration-fast) var(--arc-ease-standard) both;
	}
	.keyframes.content[data-state='open'] {
		animation: drawer-in var(--arc-duration-considered) var(--drawer-ease) both;
	}
	.keyframes.content[data-state='closed'] {
		animation: drawer-out var(--arc-duration-standard) var(--arc-ease-standard) both;
	}
	.content:focus {
		outline: none;
	}
	/* Inside a container the layers anchor to that element instead of the viewport. */
	.overlay[data-contained],
	.content[data-contained] {
		position: absolute;
	}
	.overlay[data-contained] {
		z-index: 1;
		background: oklch(10% 0 0 / 0.16);
	}
	.content[data-contained] {
		--drawer-size: min(22rem, calc(100% - var(--arc-space-8)));
		z-index: 2;
		max-height: 100%;
		box-shadow: none;
	}
	.content[data-contained][data-side='top'],
	.content[data-contained][data-side='bottom'] {
		max-height: min(32rem, calc(100% - var(--arc-space-8)));
	}
	/* The container already draws the outer edges, so only the inner edge keeps a border. */
	.content[data-contained][data-side] {
		border-width: 0;
	}
	.content[data-contained][data-side='right'] {
		border-left-width: 1px;
	}
	.content[data-contained][data-side='left'] {
		border-right-width: 1px;
	}
	.content[data-contained][data-side='top'] {
		border-bottom-width: 1px;
	}
	.content[data-contained][data-side='bottom'] {
		border-top-width: 1px;
	}

	.header {
		display: flex;
		flex: 0 0 auto;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--arc-space-5);
		padding: var(--arc-space-6);
		border-bottom: 1px solid var(--arc-border);
	}
	/* The header doubles as the drag handle, so touch drags move the panel instead of the page. */
	.handle {
		touch-action: none;
		user-select: none;
	}
	.content[data-side='bottom'] .handle,
	.content[data-side='top'] .handle {
		cursor: grab;
	}
	.title,
	.description {
		position: relative;
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
		max-width: 32rem;
		margin: var(--arc-space-2) 0 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.close {
		display: grid;
		flex: 0 0 auto;
		width: var(--arc-space-8);
		height: var(--arc-space-8);
		place-items: center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: color-mix(in oklch, var(--arc-surface-muted) 65%, transparent);
		color: var(--arc-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.close:active {
		transform: scale(0.96);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 100ms var(--arc-ease-standard);
	}
	.body {
		min-height: 0;
		overflow: auto;
		padding: var(--arc-space-6);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	@media (max-width: 40rem) {
		.content {
			--drawer-size: calc(100vw - var(--arc-space-3));
		}
		.content[data-side='right'] {
			border-radius: 18px 0 0 18px;
		}
		.content[data-side='left'] {
			border-radius: 0 18px 18px 0;
		}
		.content[data-side='top'] {
			border-radius: 0 0 18px 18px;
		}
		.content[data-side='bottom'] {
			border-radius: 18px 18px 0 0;
		}
		.header,
		.body {
			padding: var(--arc-space-5);
		}
	}

	@keyframes overlay-in {
		from {
			opacity: 0;
		}
	}
	@keyframes overlay-out {
		to {
			opacity: 0;
		}
	}
	@keyframes drawer-in {
		from {
			transform: var(--drawer-from);
		}
	}
	/* The late fade lets the floating shadow leave with the panel instead of popping away at unmount. */
	@keyframes drawer-out {
		65% {
			opacity: 1;
		}
		to {
			opacity: 0;
			transform: var(--drawer-from);
		}
	}
	@keyframes drawer-fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes drawer-fade-out {
		to {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.keyframes.overlay[data-state='open'] {
			animation: overlay-in var(--arc-duration-instant) linear both;
		}
		.keyframes.overlay[data-state='closed'] {
			animation: overlay-out 100ms linear both;
		}
		.keyframes.content[data-state='open'] {
			animation: drawer-fade-in var(--arc-duration-instant) linear both;
		}
		.keyframes.content[data-state='closed'] {
			animation: drawer-fade-out 100ms linear both;
		}
		.close,
		.close:active {
			transition: none;
		}
		.close:active {
			transform: none;
		}
	}
</style>
