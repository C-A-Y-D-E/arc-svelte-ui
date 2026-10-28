<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { animate, mapValue, motionValue, styleEffect, type MotionValue } from 'motion';
	import { untrack } from 'svelte';
	import { strings } from '../strings';
	import type { Attachment } from 'svelte/attachments';
	import type { TransitionConfig } from 'svelte/transition';
	import { swapIn, swapOnChange, swapOut, type SwapOptions } from '../alert/swap';
	import { isReducedMotion, motionTokens } from '../motion';
	import { focusVisible } from './focus';
	import type { Target } from './layout';
	import { swipeToDismiss } from './swipe';
	import type { ToastRecord, ToastStore, ToastType } from './toast-store.svelte';

	type Props = {
		toast: ToastRecord;
		/** Undefined while leaving: a leaving toast keeps the place it had. */
		target: Target | undefined;
		present: boolean;
		expanded: boolean;
		front: boolean;
		hidden: boolean;
		paused: boolean;
		store: ToastStore;
		onMeasure: (id: string, height: number) => void;
		onDragChange: (dragging: boolean) => void;
		onTap: () => void;
		onHandOff: (leaving: HTMLElement, keyboard: boolean) => void;
		onExitComplete: (id: string) => void;
		/** Hung from the top (`top-center`): enters from above, leaves upward, peeks below. */
		fromTop?: boolean;
	};

	let {
		toast,
		target,
		present,
		expanded,
		front,
		hidden,
		paused,
		store,
		onMeasure,
		onDragChange,
		onTap,
		onHandOff,
		onExitComplete,
		fromTop = false
	}: Props = $props();

	/** The card's top and bottom borders, added to the measured content height. */
	const BORDER = 2;
	/** A swipe this far right has faded most of the way out. */
	const SWIPE_FADE = 280;
	const SWIPE_FADE_DEPTH = 0.75;
	/** A closed toast sinks this far toward its edge while it fades. */
	const EXIT_DROP_PX = 10;
	const EXIT_SCALE = 0.96;
	const SWIPED_EXIT_S = 0.22;
	const REDUCED_FADE_S = 0.15;
	const TEXT_SWAP_S = 0.22;
	const MS_PER_SECOND = 1000;

	const { duration, spring } = motionTokens;
	const fade = { duration: duration.fast, ease: motionTokens.ease.standard };
	const enterFade = { duration: duration.standard, ease: motionTokens.ease.enter };
	const reducedFade = { duration: REDUCED_FADE_S, ease: motionTokens.ease.standard };
	const textSwap: SwapOptions = { enter: { duration: TEXT_SWAP_S, ease: motionTokens.ease.enter } };
	/** Scale rides the spring; opacity and blur tween so the blur never overshoots below zero. */
	const iconSwap: SwapOptions = {
		kind: 'icon',
		enter: { ...spring.snappy, opacity: fade, filter: fade }
	};

	const typeLabels: Record<ToastType, string> = $derived({
		success: strings.toastSuccess(),
		info: strings.toastInfo(),
		warning: strings.toastWarning(),
		error: strings.toastError(),
		loading: strings.toastLoading()
	});
	const icons = {
		success: CircleCheckIcon,
		info: InfoIcon,
		warning: TriangleAlertIcon,
		error: CircleXIcon
	};

	// Stack geometry lives in motion values, so following the stack, a finger, or a timer never re-renders per frame.
	const y = motionValue(0);
	const scale = motionValue(1);
	const height = motionValue(0);
	const opacity = motionValue(0);
	const contentOpacity = motionValue(1);
	const x = motionValue(0);
	const swipeFade = mapValue(x, [0, SWIPE_FADE], [1, 1 - SWIPE_FADE_DEPTH]);

	const id = $derived(toast.id);
	const reduce = $derived(isReducedMotion());
	const Icon = $derived(toast.type === 'loading' ? null : icons[toast.type]);
	const goalY = $derived(target?.y ?? 0);
	const goalScale = $derived(target?.scale ?? 1);
	const goalHeight = $derived(target?.height ?? 0);
	const goalOpacity = $derived(target?.opacity ?? 0);
	const goalContent = $derived(target?.content ?? 0);

	let item: HTMLLIElement;
	let content: HTMLDivElement;
	let closeButton: HTMLButtonElement;
	/** The expanded state the last target was applied under; null until the toast has entered. */
	let appliedExpanded: boolean | null = null;
	let swiped = false;
	let remaining = untrack(() => toast.duration);
	let clockVersion = untrack(() => toast.version);

	function bindStyles(values: Record<string, MotionValue>): Attachment<HTMLElement> {
		return (node) => styleEffect(node, values);
	}

	// Measure before the first paint, so the toast enters from exactly its own height below the edge.
	$effect(() => {
		const node = content;
		const toastId = id;
		const report = () => onMeasure(toastId, node.offsetHeight + BORDER);
		report();
		const observer = new ResizeObserver(report);
		observer.observe(node);
		return () => observer.disconnect();
	});

	function moveTo(goal: Target, isExpanded: boolean, reduced: boolean) {
		const entering = appliedExpanded === null;
		const morph = !entering && appliedExpanded !== isExpanded;
		appliedExpanded = isExpanded;
		if (reduced) {
			y.jump(goal.y);
			scale.jump(goal.scale);
			height.jump(goal.height);
			animate(opacity, goal.opacity, reducedFade);
			animate(contentOpacity, goal.content, reducedFade);
			return;
		}
		if (entering) {
			y.jump(fromTop ? goal.y - goal.height : goal.y + goal.height);
			scale.jump(goal.scale);
			height.jump(goal.height);
			contentOpacity.jump(goal.content);
			opacity.jump(0);
		}
		const settle = morph ? spring.morph : spring.smooth;
		animate(y, goal.y, settle);
		animate(scale, goal.scale, settle);
		if (!entering) animate(height, goal.height, settle);
		animate(opacity, goal.opacity, entering ? enterFade : fade);
		animate(contentOpacity, goal.content, fade);
	}

	// Every stack change retargets the running springs from wherever they are, so rapid toasts and hover changes never queue.
	$effect(() => {
		if (!present || goalHeight <= 0) return;
		const goal = {
			y: goalY,
			scale: goalScale,
			height: goalHeight,
			opacity: goalOpacity,
			content: goalContent
		};
		const args = [goal, expanded, reduce] as const;
		untrack(() => moveTo(...args));
	});

	// An update restarts the clock; pausing keeps whatever time is left.
	$effect(() => {
		if (toast.version !== clockVersion) {
			clockVersion = toast.version;
			remaining = toast.duration;
		}
		if (!present || paused || !Number.isFinite(remaining) || toast.duration <= 0) return;
		const toastId = id;
		const started = performance.now();
		const timer = window.setTimeout(() => store.dismiss(toastId), Math.max(remaining, 0));
		return () => {
			window.clearTimeout(timer);
			remaining -= performance.now() - started;
		};
	});

	function finishExit() {
		if (!present) onExitComplete(id);
	}

	// Leaving: hand focus on before the toast turns inert, then fade out quickly. A closed toast sinks toward its edge; a thrown one keeps flying.
	function leave() {
		const active = document.activeElement;
		if (active instanceof HTMLElement && item.contains(active))
			onHandOff(item, focusVisible(active));
		if (reduce) {
			animate(opacity, 0, reducedFade).then(finishExit);
			return;
		}
		if (!swiped) {
			animate(y, y.get() + (fromTop ? -EXIT_DROP_PX : EXIT_DROP_PX), spring.smooth);
			animate(scale, scale.get() * EXIT_SCALE, spring.smooth);
		}
		animate(opacity, 0, {
			duration: swiped ? SWIPED_EXIT_S : duration.exit,
			ease: motionTokens.ease.standard
		}).then(finishExit);
	}

	// Pre-effect: runs before the template marks the item inert, so focus can still be handed on.
	$effect.pre(() => {
		if (!present) untrack(leave);
	});

	function swipeAway() {
		swiped = true;
		store.dismiss(id);
	}

	// An action that updates its toast usually folds itself away; keyboard focus lands on the close button instead of the page.
	function runAction(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		const keyboard = focusVisible(event.currentTarget);
		store.runAction(id);
		if (keyboard && !store.find(id)?.action) closeButton.focus();
	}

	function dismissOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.stopPropagation();
		store.dismiss(id);
	}

	const actionMorph = { width: spring.smooth, opacity: fade };
	const actionMorphMs = spring.smooth.visualDuration * MS_PER_SECOND;

	function markMoving(node: HTMLElement, moving: boolean) {
		node.dataset.moving = moving ? 'true' : 'false';
	}

	function unfoldAction(node: HTMLElement): TransitionConfig {
		if (reduce) {
			animate(node, { opacity: [0, 1] }, reducedFade);
			return { duration: REDUCED_FADE_S * MS_PER_SECOND };
		}
		const width = node.offsetWidth;
		markMoving(node, true);
		animate(node, { width: [0, width], opacity: [0, 1] }, actionMorph).then(() => {
			node.style.width = '';
			markMoving(node, false);
		});
		return { duration: actionMorphMs };
	}

	// The action folds its width away when an update removes it, so the copy widens instead of snapping.
	function foldAction(node: HTMLElement): TransitionConfig {
		if (reduce) {
			animate(node, { opacity: 0 }, reducedFade);
			return { duration: REDUCED_FADE_S * MS_PER_SECOND };
		}
		markMoving(node, true);
		animate(node, { width: 0, opacity: 0 }, actionMorph);
		return { duration: actionMorphMs };
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li
	bind:this={item}
	class={['item', fromTop && 'from-top']}
	style:z-index={toast.seq}
	data-front={front}
	data-expanded={expanded}
	inert={hidden || !present}
	onkeydown={dismissOnEscape}
	{@attach bindStyles({ y, scale, height, opacity })}
>
	<div
		class="card"
		{@attach bindStyles({ x, opacity: swipeFade })}
		{@attach swipeToDismiss({
			x,
			canStart: () => present,
			onDragChange: (dragging) => onDragChange(dragging),
			onSwipeAway: swipeAway,
			onTap: () => onTap()
		})}
	>
		<div bind:this={content} class="content" {@attach bindStyles({ opacity: contentOpacity })}>
			<!-- A new type morphs its icon in place: the old glyph shrinks into a blur while the new one grows out of it. -->
			<span class="icon" data-type={toast.type} aria-hidden="true">
				<span class="glyph" {@attach swapOnChange(iconSwap)}>
					{#if Icon}
						<Icon size={18} strokeWidth={1.75} />
					{:else}
						<span class="spinner"></span>
					{/if}
				</span>
			</span>
			<div class="copy">
				<span class="sr-only">{typeLabels[toast.type]}: </span>
				<span class="title"
					><span class="line" {@attach swapOnChange(textSwap)}>{toast.title}</span></span
				>
				{#if toast.description}
					<span
						class="description"
						in:swapIn={textSwap}
						out:swapOut={textSwap}
						{@attach swapOnChange(textSwap)}>{toast.description}</span
					>
				{/if}
			</div>
			{#if toast.action}
				<div class="action-slot" in:unfoldAction out:foldAction>
					<button type="button" class="action" onclick={runAction}>{toast.action.label}</button>
				</div>
			{/if}
			<button
				bind:this={closeButton}
				type="button"
				class="close"
				aria-label={strings.toastDismiss()}
				onclick={() => store.dismiss(id)}
			>
				<XIcon size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>
	</div>
</li>

<style>
	/* Tucked toasts scale from their top edge, so exactly the peek shows above the toast in front. Hidden until the first target lands. */
	.item {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		opacity: 0;
		transform-origin: 50% 0;
	}
	.item.from-top {
		top: 0;
		bottom: auto;
		transform-origin: 50% 100%;
	}
	.card {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-raised);
		container-type: inline-size;
		touch-action: pan-y;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			border-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.item[data-front='true'] .card,
	.item[data-expanded='true'] .card {
		box-shadow: var(--arc-shadow-floating);
	}
	/* Tucked toasts sit a step back in tone as well as scale. */
	.item[data-front='false'][data-expanded='false'] .card {
		background: var(--arc-surface-muted);
	}
	.card:global([data-dragging]) {
		cursor: grabbing;
		user-select: none;
	}

	.content {
		display: flex;
		align-items: flex-start;
		gap: var(--arc-space-3);
		padding: var(--arc-space-3) var(--arc-space-3) var(--arc-space-3) var(--arc-space-4);
	}
	.icon {
		position: relative;
		display: grid;
		width: 18px;
		height: 20px;
		flex: none;
		place-items: center;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.icon[data-type='success'] {
		color: var(--arc-success);
	}
	.icon[data-type='info'] {
		color: var(--arc-accent);
	}
	.icon[data-type='warning'] {
		color: var(--arc-warning);
	}
	.icon[data-type='error'] {
		color: var(--arc-danger);
	}
	.glyph {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
	}
	.glyph :global(svg) {
		display: block;
	}
	/* The spinner turns only while something is loading; the icon swap is its stop. */
	.spinner {
		display: block;
		width: 15px;
		height: 15px;
		border: 1.75px solid currentColor;
		border-right-color: transparent;
		border-radius: var(--arc-radius-pill);
		animation: spin 0.8s linear infinite;
	}

	.copy {
		position: relative;
		min-width: 0;
		flex: 1;
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		line-height: 20px;
	}
	.title {
		position: relative;
		display: block;
		font-weight: 500;
	}
	.line {
		display: block;
	}
	.description {
		display: block;
		margin-top: 2px;
		color: var(--arc-text-secondary);
	}

	/* Clips only while its width folds, so the focus ring stays whole at rest. */
	.action-slot {
		display: flex;
		flex: none;
		justify-content: flex-end;
		margin-top: -4px;
	}
	.action-slot:global([data-moving='true']) {
		overflow: hidden;
	}
	.action,
	.close {
		flex: none;
		border: 1px solid transparent;
		font: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			scale var(--arc-duration-spring) var(--arc-ease-spring),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.action {
		height: 28px;
		padding: 0 var(--arc-space-3);
		border-color: var(--arc-border);
		border-radius: var(--arc-radius-control); /* boxy, like the other controls */
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		white-space: nowrap;
	}
	.close {
		display: grid;
		width: 28px;
		height: 28px;
		margin: -4px -2px 0 0;
		place-items: center;
		border-radius: var(--arc-radius-control); /* boxy, like the other controls */
		background: transparent;
		color: var(--arc-text-muted);
	}
	@media (hover: hover) and (pointer: fine) {
		.action:hover {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
		}
		.close:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	/* Quick press, spring release. */
	.action:active,
	.close:active {
		scale: 0.96;
		transition-duration: var(--arc-duration-instant);
		transition-timing-function: var(--arc-ease-standard);
	}
	.action:focus-visible,
	.close:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	/* A narrow toast keeps its copy wide: the action drops under the copy instead of squeezing it. */
	@container (max-width: 21rem) {
		.content {
			flex-wrap: wrap;
			row-gap: var(--arc-space-2);
		}
		.action-slot {
			order: 1;
			flex-basis: 100%;
			justify-content: flex-start;
			margin-top: 0;
			padding-left: calc(18px + var(--arc-space-3));
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card,
		.icon,
		.action,
		.close {
			transition: none;
		}
		.action:active,
		.close:active {
			scale: none;
		}
		.spinner {
			animation: none;
		}
	}
</style>
