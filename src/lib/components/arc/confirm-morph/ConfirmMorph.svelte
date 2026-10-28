<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** Where the control is in its life: resting, asking, working, finished, or failed. */
	export type ConfirmMorphState = 'idle' | 'confirming' | 'pending' | 'done' | 'error';
	export type ConfirmMorphTone = 'danger' | 'neutral';
	export type ConfirmMorphContent = string | Snippet;

	/** Duration springs restated as stiffness and damping so a retarget keeps the velocity already in flight. */
	function physical(visualDuration: number, bounce: number) {
		const root = (2 * Math.PI) / (visualDuration * 1.2);
		return {
			type: 'spring',
			stiffness: root * root,
			damping: 2 * (1 - bounce) * root,
			mass: 1
		} as const;
	}
</script>

<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { TransitionConfig } from 'svelte/transition';
	import {
		motionTransition,
		type MotionTransitionParams
	} from '../action-button/motion-transition';
	import { isReducedMotion, motionTokens } from '../motion';

	/**
	 * A button for destructive or important actions that asks in place. Pressing it morphs the same surface into an inline
	 * question with Cancel and Confirm, then into a spinner, then into a result with Undo. The width springs to each face, so
	 * nothing around it jumps. Escape, an outside press, or the timeout all return it to rest.
	 * Use it where a modal dialog would be heavy: deleting a selection, revoking access, discarding a draft.
	 */
	type Props = {
		/** The resting label, such as "Delete". */
		label: ConfirmMorphContent;
		/** A plain icon before the resting label. */
		icon?: Snippet;
		/** The question shown while confirming, such as "Delete 3 files?". Defaults to the label with a question mark. */
		prompt?: ConfirmMorphContent;
		confirmLabel?: string;
		cancelLabel?: string;
		/** Shown beside the spinner while `onConfirm` resolves. */
		pendingLabel?: string;
		doneLabel?: string;
		errorLabel?: string;
		retryLabel?: string;
		undoLabel?: string;
		/** Shown beside the spinner while `onUndo` resolves. */
		undoingLabel?: string;
		/** `danger` colours the resting label and the confirm button red. `neutral` uses the foreground for important, reversible actions. */
		tone?: ConfirmMorphTone;
		/** Runs on confirm. Return a promise to show the pending face; a rejection shows the error face with Retry. */
		onConfirm?: () => void | Promise<unknown>;
		/** Offering it adds Undo to the result. Return a promise to show a pending face while it runs. */
		onUndo?: () => void | Promise<unknown>;
		onCancel?: () => void;
		/** Bindable. Leave it unbound to let the control keep its own state. */
		state?: ConfirmMorphState;
		/** Starting state when uncontrolled. */
		defaultState?: ConfirmMorphState;
		onStateChange?: (state: ConfirmMorphState) => void;
		/** Milliseconds before an unanswered question returns to rest. Resting the pointer on the control pauses it. 0 turns it off. */
		confirmTimeout?: number;
		/** Milliseconds a result stays before returning to rest. Resting the pointer on the control pauses it. 0 turns it off. */
		resultTimeout?: number;
		/** A press outside the control cancels an open question. Defaults to true. */
		cancelOnOutsidePress?: boolean;
		disabled?: boolean;
		class?: string;
		/** The root element, which also takes focus while the action is pending. */
		ref?: HTMLDivElement | null;
	};

	let {
		label,
		icon,
		prompt,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		pendingLabel = 'Deleting',
		doneLabel = 'Deleted',
		errorLabel = 'Couldn’t finish',
		retryLabel = 'Retry',
		undoLabel = 'Undo',
		undoingLabel = 'Restoring',
		tone = 'danger',
		onConfirm,
		onUndo,
		onCancel,
		defaultState = 'idle',
		state: current = $bindable(defaultState),
		onStateChange,
		confirmTimeout = 6000,
		resultTimeout = 5000,
		cancelOnOutsidePress = true,
		disabled = false,
		class: className,
		ref = $bindable(null)
	}: Props = $props();

	const uid = $props.id();
	const promptId = `${uid}-prompt`;
	const TRAVEL = 12;
	const GONE_TRAVEL_RATIO = 0.6;
	const MS_PER_SECOND = 1000;
	const SIZE_EPSILON_PX = 0.5;
	const GROW = physical(0.44, 0.18);
	const SHRINK = physical(0.34, 0);
	const SLIDE = physical(0.36, 0.06);
	const CHECK_POP = physical(0.34, 0.3);
	const enter = motionTokens.ease.enter;
	const standard = motionTokens.ease.standard;
	const softBlur = `blur(${motionTokens.blur.soft}px)`;

	let direction = $state(1);
	let working = $state<'confirm' | 'undo'>('confirm');
	let announcement = $state('');
	let surfaceNode: HTMLDivElement;
	let pendingFocus = false;
	let run = 0;
	let targetWidth = 0;
	let flight = 0;
	const holds = { hover: false, hidden: false };
	let clock: ReturnType<typeof animate> | null = null;

	const shownPrompt = $derived(prompt ?? (typeof label === 'string' ? `${label}?` : label));
	const timeout = $derived(
		current === 'confirming'
			? confirmTimeout
			: current === 'done' || current === 'error'
				? resultTimeout
				: 0
	);

	function go(next: ConfirmMorphState) {
		if (next === current) return;
		// Focus follows the control between faces, but only when it was already inside; a timeout never steals focus from elsewhere.
		pendingFocus =
			!!ref && (ref.contains(document.activeElement) || document.activeElement === document.body);
		// Every step moves forward except the return to rest, which comes back from the left.
		direction = next === 'idle' ? -1 : 1;
		current = next;
		onStateChange?.(next);
	}

	function isThenable(value: unknown): value is PromiseLike<unknown> {
		return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
	}

	function toIdle() {
		run++;
		go('idle');
	}

	function fail() {
		go('error');
		announcement = errorLabel;
	}

	async function perform(kind: 'confirm' | 'undo') {
		const handler = kind === 'confirm' ? onConfirm : onUndo;
		const token = ++run;
		working = kind;
		let result: unknown;
		try {
			result = handler?.();
		} catch {
			fail();
			return;
		}
		if (isThenable(result)) {
			go('pending');
			announcement = kind === 'confirm' ? pendingLabel : undoingLabel;
			try {
				await result;
			} catch {
				if (token === run) fail();
				return;
			}
			if (token !== run) return;
		}
		if (kind === 'undo') {
			go('idle');
			announcement = 'Undone';
			return;
		}
		go('done');
		announcement = onUndo ? `${doneLabel}. ${undoLabel} is available.` : doneLabel;
	}

	function cancel() {
		onCancel?.();
		toIdle();
		announcement = 'Cancelled';
	}

	function ask() {
		announcement = typeof shownPrompt === 'string' ? shownPrompt : '';
		go('confirming');
	}

	/* The shape: one surface whose width springs to whichever face is current. At rest it is auto. */
	function onFaceSize(id: ConfirmMorphState, width: number) {
		if (id !== current || Math.abs(width - targetWidth) < SIZE_EPSILON_PX) return;
		const from = targetWidth;
		targetWidth = width;
		// The first measure can arrive before the surface is bound: there is nothing to size yet.
		if (!surfaceNode) return;
		if (!from || isReducedMotion()) {
			surfaceNode.style.width = '';
			return;
		}
		const resting = !surfaceNode.style.width;
		const token = ++flight;
		animate(
			surfaceNode,
			{ width: resting ? [from, width] : width },
			width > from ? GROW : SHRINK
		).then(() => {
			if (token === flight) surfaceNode.style.width = '';
		});
	}

	/** Measures the natural width, not the width a tight container squeezes the face to, so squeezing never feeds back into the spring. */
	function reportSize(id: ConfirmMorphState): Attachment<HTMLElement> {
		return (face) => {
			const report = () => {
				if (face.inert) return;
				const flex = face.style.flex;
				face.style.flex = 'none';
				const width = face.offsetWidth;
				face.style.flex = flex;
				onFaceSize(id, width);
			};
			untrack(report);
			const observer = new ResizeObserver(report);
			observer.observe(face);
			return () => observer.disconnect();
		};
	}

	/** Forward steps arrive from the right, backward steps from the left; the old face leaves the other way, blurred, so the eye reads one morph. */
	function faceIn(): MotionTransitionParams {
		if (isReducedMotion())
			return { keyframes: { opacity: [0, 1] }, transition: { duration: 0.14 } };
		return {
			keyframes: { opacity: [0, 1], x: [direction * TRAVEL, 0], filter: [softBlur, 'blur(0px)'] },
			transition: {
				x: SLIDE,
				opacity: { duration: 0.2, ease: enter, delay: 0.04 },
				filter: { duration: 0.22, ease: enter, delay: 0.04 }
			}
		};
	}

	/** A leaving face turns inert, which also steps it out of the flow (see `.face[inert]`). */
	function faceOut(node: Element): TransitionConfig {
		(node as HTMLElement).inert = true;
		if (isReducedMotion())
			return motionTransition(node, { keyframes: { opacity: 0 }, transition: { duration: 0.1 } });
		return motionTransition(node, {
			keyframes: { opacity: 0, x: direction * -TRAVEL * GONE_TRAVEL_RATIO, filter: softBlur },
			transition: {
				x: SLIDE,
				opacity: { duration: 0.12, ease: standard },
				filter: { duration: 0.12, ease: standard }
			}
		});
	}

	/** A success disc that pops in with a tick drawing across it, the moment the action lands. */
	const popDisc: Attachment<SVGCircleElement> = (disc) => {
		if (isReducedMotion()) return;
		animate(
			disc,
			{ scale: [0.4, 1], opacity: [0, 1] },
			{ scale: CHECK_POP, opacity: { duration: 0.12 } }
		);
	};

	/* The timeout runs as an invisible clock. A pointer resting on the control holds it, and so does a hidden tab. */
	function syncClock() {
		if (!clock) return;
		if (holds.hover || holds.hidden) clock.pause();
		else clock.play();
	}

	function holdClock(hover: boolean) {
		holds.hover = hover;
		syncClock();
	}

	$effect(() => {
		void current;
		if (!timeout) return;
		const control = animate(0, 1, { duration: timeout / MS_PER_SECOND, ease: 'linear' });
		clock = control;
		control.then(() => {
			if (clock !== control) return;
			clock = null;
			if (current === 'confirming') cancel();
			else toIdle();
		});
		syncClock();
		return () => {
			if (clock === control) clock = null;
			control.stop();
		};
	});

	$effect(() => {
		const onVisibility = () => {
			holds.hidden = document.hidden;
			syncClock();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	// An outside press answers the question with no.
	$effect(() => {
		if (current !== 'confirming' || !cancelOnOutsidePress) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!ref?.contains(event.target as Node)) cancel();
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});

	// Focus lands on the safe choice: Cancel while asking, Undo or Retry on a result, the root while working, the trigger at rest.
	$effect(() => {
		const face = ref?.querySelector<HTMLElement>(`[data-face="${current}"]:not([inert])`);
		if (!pendingFocus || !ref) return;
		pendingFocus = false;
		const autofocus = face?.querySelector<HTMLElement>('[data-autofocus]:not(:disabled)');
		(autofocus ?? ref).focus({ preventScroll: true });
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (current === 'confirming') {
			event.preventDefault();
			event.stopPropagation();
			cancel();
		} else if (current === 'done' || current === 'error') {
			event.preventDefault();
			event.stopPropagation();
			toIdle();
		}
	}
</script>

{#snippet content(value: ConfirmMorphContent)}
	{#if typeof value === 'string'}{value}{:else}{@render value()}{/if}
{/snippet}

<div
	bind:this={ref}
	class={['root', className]}
	data-state={current}
	data-tone={tone}
	data-disabled={disabled || undefined}
	tabindex="-1"
	role="group"
	aria-busy={current === 'pending' || undefined}
	{onkeydown}
	onpointerenter={() => holdClock(true)}
	onpointerleave={() => holdClock(false)}
	onpointercancel={() => holdClock(false)}
>
	<div bind:this={surfaceNode} class="surface">
		{#each [current] as faceState (faceState)}
			<div
				class="face"
				data-face={faceState}
				role={faceState === 'confirming' ? 'group' : undefined}
				aria-labelledby={faceState === 'confirming' ? promptId : undefined}
				{@attach reportSize(faceState)}
				in:motionTransition={faceIn()}
				out:faceOut
			>
				{#if faceState === 'confirming'}
					<span id={promptId} class="prompt">{@render content(shownPrompt)}</span>
					<button type="button" class="secondary" data-autofocus onclick={cancel}
						>{cancelLabel}</button
					>
					<button type="button" class="primary" onclick={() => perform('confirm')}
						>{confirmLabel}</button
					>
				{:else if faceState === 'pending'}
					<span class="status">
						<LoaderCircleIcon class="spinner" size={16} strokeWidth={1.75} aria-hidden="true" />
						<span>{working === 'undo' ? undoingLabel : pendingLabel}</span>
					</span>
				{:else if faceState === 'done'}
					<span class="status" data-tone="success">
						<svg class="check" viewBox="0 0 18 18" fill="none" aria-hidden="true">
							<circle class="check-disc" cx="9" cy="9" r="8" {@attach popDisc} />
							<path
								class="check-tick"
								pathLength="1"
								d="M5.6 9.3 7.8 11.4 12.4 6.7"
								stroke-width="1.9"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="status-text">{doneLabel}</span>
					</span>
					{#if onUndo}
						<button type="button" class="secondary" data-autofocus onclick={() => perform('undo')}
							>{undoLabel}</button
						>
					{/if}
				{:else if faceState === 'error'}
					<span class="status" data-tone="danger">
						<CircleAlertIcon size={16} strokeWidth={1.75} aria-hidden="true" />
						<span class="status-text">{errorLabel}</span>
					</span>
					<button type="button" class="secondary" data-autofocus onclick={() => perform(working)}
						>{retryLabel}</button
					>
				{:else}
					<button type="button" class="trigger" data-autofocus {disabled} onclick={ask}>
						{#if icon}<span class="icon" aria-hidden="true">{@render icon()}</span>{/if}
						<span>{@render content(label)}</span>
					</button>
				{/if}
			</div>
		{/each}
	</div>
	<span class="sr-only" role="status" aria-live="polite">{announcement}</span>
</div>

<style>
	/* The root holds the control in the flow of the page; the surface inside it springs between faces. */
	.root {
		position: relative;
		display: inline-flex;
		min-width: 0;
		max-width: 100%;
		vertical-align: middle;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-sm);
		letter-spacing: -0.005em;
		line-height: 1;
		-webkit-tap-highlight-color: transparent;
	}
	.root:focus {
		outline: none;
	}

	/* One pill for every state. The current face sits in the flow and centres itself; the border is an overlay so it never changes a measurement. */
	.surface {
		position: relative;
		display: flex;
		height: var(--arc-control-height-sm);
		max-width: 100%;
		justify-content: center;
		overflow: clip;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-resting);
		/* Release springs back; the press itself is quick (below). */
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.surface::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--arc-border);
		border-radius: inherit;
		pointer-events: none;
		transition: border-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* Danger: a quiet red tint at rest that deepens while asking. */
	.root[data-tone='danger'] .surface {
		background: color-mix(in oklch, var(--arc-danger) 5%, var(--arc-surface-raised));
		box-shadow: none;
	}
	.root[data-tone='danger'] .surface::after {
		border-color: color-mix(in oklch, var(--arc-danger) 18%, var(--arc-border));
	}
	.root[data-tone='danger'][data-state='confirming'] .surface {
		background: color-mix(in oklch, var(--arc-danger) 10%, var(--arc-surface-raised));
		box-shadow: 0 4px 14px color-mix(in oklch, var(--arc-danger) 12%, transparent);
	}
	.root[data-tone='danger'][data-state='confirming'] .surface::after {
		border-color: color-mix(in oklch, var(--arc-danger) 34%, var(--arc-border));
	}
	.root[data-tone='danger']:is([data-state='pending'], [data-state='done']) .surface {
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-resting);
	}
	.root[data-tone='danger']:is([data-state='pending'], [data-state='done']) .surface::after {
		border-color: var(--arc-border);
	}
	.root[data-disabled][data-state='idle'] .surface {
		background: var(--arc-surface-raised);
		box-shadow: none;
	}
	.root[data-disabled][data-state='idle'] .surface::after {
		border-color: var(--arc-border-subtle);
	}
	.root:has(.trigger:active:not(:disabled)) .surface {
		transform: scale(0.96);
		transition-duration: var(--arc-duration-standard), var(--arc-duration-standard), 90ms;
		transition-timing-function: var(--arc-ease-standard), var(--arc-ease-standard), ease-out;
	}

	.face {
		display: flex;
		min-width: 0;
		height: 100%;
		flex: 0 1 auto;
		align-items: center;
		gap: 2px;
		padding: 0 4px;
		white-space: nowrap;
		will-change: transform, filter;
	}
	.face[data-face='idle'] {
		padding: 0;
		border-radius: var(--arc-radius-pill);
	}
	/* A leaving face steps out of the flow and stays centred while the surface springs to the next one. */
	.face:global([inert]) {
		position: absolute;
		top: 0;
		left: 50%;
		translate: -50% 0;
		pointer-events: none;
	}

	.trigger {
		display: inline-flex;
		height: 100%;
		align-items: center;
		gap: 8px;
		padding: 0 15px 0 13px;
		border: 0;
		border-radius: inherit;
		background: transparent;
		color: var(--arc-foreground);
		cursor: pointer;
		font: inherit;
		font-weight: 500;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.root[data-tone='danger'] .trigger {
		color: var(--arc-danger);
	}
	.trigger:disabled {
		color: var(--arc-text-muted) !important;
		cursor: not-allowed;
	}
	.trigger:disabled .icon {
		opacity: 0.7;
	}
	.icon {
		display: grid;
		width: 16px;
		height: 16px;
		place-items: center;
	}
	.icon > :global(svg) {
		width: 16px;
		height: 16px;
	}

	.prompt {
		min-width: 3ch;
		flex: 0 1 auto;
		max-width: 16rem;
		overflow: hidden;
		padding: 0 6px 0 11px;
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1.3;
		text-overflow: ellipsis;
	}

	.secondary,
	.primary {
		display: inline-flex;
		flex: none;
		height: calc(var(--arc-control-height-sm) - 8px);
		align-items: center;
		padding: 0 11px;
		border: 0;
		border-radius: var(--arc-radius-pill);
		cursor: pointer;
		font: inherit;
		font-weight: 500;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.secondary {
		background: transparent;
		color: var(--arc-text-secondary);
	}
	.root[data-tone='danger'][data-state='confirming'] .secondary {
		color: color-mix(in oklch, var(--arc-danger) 30%, var(--arc-text-secondary));
	}
	.face:is([data-face='done'], [data-face='error']) .secondary {
		color: var(--arc-foreground);
	}
	.primary {
		background: var(--arc-primary-fill);
		color: var(--arc-primary-ink);
	}
	.root[data-tone='danger'] .primary {
		background: var(--arc-danger);
		box-shadow:
			inset 0 1px 0 color-mix(in oklch, white 18%, transparent),
			0 1px 2px color-mix(in oklch, var(--arc-danger) 30%, transparent);
	}
	.secondary:active,
	.primary:active {
		transform: scale(0.95);
		transition-duration: var(--arc-duration-fast), var(--arc-duration-fast), 90ms;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 0 8px 0 10px;
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.status > :global(svg) {
		flex: none;
	}
	.status[data-tone='danger'] > :global(svg) {
		color: var(--arc-danger);
	}
	.face[data-face='done']:not(:has(.secondary)) .status {
		padding-right: 12px;
	}
	.status-text {
		line-height: 1.3;
	}
	.face[data-face='pending'] .status {
		padding-inline: 14px 16px;
		color: var(--arc-text-secondary);
	}
	.check {
		width: 18px;
		height: 18px;
	}
	.check-disc {
		fill: var(--arc-success);
		transform-box: fill-box;
		transform-origin: center;
	}
	.check-tick {
		stroke: var(--arc-background);
		stroke-dasharray: 1;
		animation: draw 0.28s var(--arc-ease-enter) 0.12s both;
	}
	.status :global(.spinner) {
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	@media (hover: hover) and (pointer: fine) {
		.trigger:hover:not(:disabled) {
			background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
		}
		.root[data-tone='danger'] .trigger:hover:not(:disabled) {
			background: color-mix(in oklch, var(--arc-danger) 8%, transparent);
		}
		.secondary:hover {
			background: color-mix(in oklch, var(--arc-foreground) 7%, transparent);
			color: var(--arc-foreground);
		}
		.primary:hover {
			background: color-mix(in oklch, var(--arc-foreground) 86%, var(--arc-background));
		}
		.root[data-tone='danger'] .primary:hover {
			background: color-mix(in oklch, var(--arc-danger) 88%, var(--arc-foreground));
		}
	}
	/* Keyboard focus reads through fill, never a ring. */
	.trigger:focus-visible {
		outline: none;
		background: color-mix(in oklch, var(--arc-foreground) 6%, transparent);
	}
	.root[data-tone='danger'] .trigger:focus-visible {
		background: color-mix(in oklch, var(--arc-danger) 9%, transparent);
	}
	.secondary:focus-visible {
		outline: none;
		background: color-mix(in oklch, var(--arc-foreground) 8%, transparent);
		color: var(--arc-foreground);
	}
	.primary:focus-visible {
		outline: none;
		background: color-mix(in oklch, var(--arc-foreground) 86%, var(--arc-background));
	}
	.root[data-tone='danger'] .primary:focus-visible {
		background: color-mix(in oklch, var(--arc-danger) 86%, var(--arc-foreground));
	}

	@media (prefers-reduced-motion: reduce) {
		.surface,
		.trigger,
		.secondary,
		.primary {
			transition-duration: 0ms;
		}
		.status :global(.spinner) {
			animation-duration: 1.6s;
		}
		.check-tick {
			animation: none;
		}
		.root:has(.trigger:active) .surface,
		.secondary:active,
		.primary:active {
			transform: none;
		}
	}

	@media (prefers-contrast: more) {
		.surface::after {
			border-color: var(--arc-border-strong);
		}
	}
</style>
