<script module lang="ts">
	export type ActionButtonState = 'idle' | 'pending' | 'success';
</script>

<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens, pressScale } from '../motion';
	import GlyphMorph from './GlyphMorph.svelte';
	import { morphWidth } from './morph-width.svelte';
	import { motionTransition } from './motion-transition';

	type Props = Omit<HTMLButtonAttributes, 'onclick'> & {
		label: string;
		successLabel?: string;
		pendingLabel?: string;
		onAction: () => void | Promise<void>;
		resetAfterMs?: number;
		onActionError?: (error: unknown) => void;
		ref?: HTMLButtonElement | null;
	};

	let {
		label,
		successLabel = 'Saved',
		pendingLabel = 'Saving',
		onAction,
		resetAfterMs = 2400,
		onActionError,
		class: className,
		disabled,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const WIDE_BUTTON_PX = 220;
	const ICON_PX = 17;
	const { blur, duration, spring } = motionTokens;
	const blurSubtle = `blur(${blur.subtle}px)`;
	const settle = { duration: duration.fast, ease: motionTokens.ease.standard };
	/** Scale rides the spring; opacity and blur tween so blur never overshoots below zero. */
	const iconEnter = {
		...spring.snappy,
		opacity: { duration: duration.fast, ease: motionTokens.ease.enter },
		filter: { duration: duration.fast, ease: motionTokens.ease.enter }
	};
	const instant = { duration: duration.instant };

	let phase = $state<ActionButtonState>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	const pending = $derived(phase === 'pending');
	const text = $derived(pending ? pendingLabel : phase === 'success' ? successLabel : label);

	$effect(() => () => clearTimeout(resetTimer));

	async function run() {
		if (pending) return;
		clearTimeout(resetTimer);
		phase = 'pending';
		try {
			await onAction();
			phase = 'success';
			if (resetAfterMs > 0) resetTimer = setTimeout(() => (phase = 'idle'), resetAfterMs);
		} catch (error) {
			phase = 'idle';
			onActionError?.(error);
		}
	}

	function pressDepth(node: HTMLElement) {
		if (disabled || pending) return 1;
		return node.offsetWidth > WIDE_BUTTON_PX ? 0.985 : 0.97;
	}

	/** The arrow leaves in the direction of the action and returns from behind once the button resets. */
	function phaseIn(isArrow: boolean) {
		if (isReducedMotion()) return { keyframes: { opacity: [0, 1] }, transition: instant };
		const offset = isArrow ? { x: [-6, 0] } : { scale: [0.6, 1] };
		return {
			keyframes: { opacity: [0, 1], filter: [blurSubtle, 'blur(0px)'], ...offset },
			transition: iconEnter
		};
	}

	function phaseOut(isArrow: boolean) {
		if (isReducedMotion()) return { keyframes: { opacity: 0 }, transition: instant };
		const offset = isArrow ? { x: 8 } : { scale: 0.6 };
		return { keyframes: { opacity: 0, filter: blurSubtle, ...offset }, transition: settle };
	}
</script>

<!-- Pending stays focusable (aria-disabled instead of disabled), so a keyboard user keeps focus through the whole save. -->
<button
	bind:this={ref}
	{@attach pressScale(pressDepth)}
	tabindex={0}
	type="button"
	{...rest}
	class={['button', className]}
	{disabled}
	aria-disabled={pending ? true : rest['aria-disabled']}
	aria-busy={pending}
	data-state={phase}
	onclick={run}
>
	<span class="content" aria-hidden="true">
		<span class="morph">
			<GlyphMorph {text} {@attach morphWidth(() => text)} />
		</span>
		<span class="icon-slot">
			{#each [phase] as shown (shown)}
				<span
					class="phase"
					in:motionTransition={phaseIn(shown === 'idle')}
					out:motionTransition={phaseOut(shown === 'idle')}
				>
					{#if shown === 'pending'}
						<span class="spinner"></span>
					{:else if shown === 'success'}
						<!-- The success tick draws itself from its short stroke, the way a hand would write it. -->
						<svg
							class="status-icon"
							width={ICON_PX}
							height={ICON_PX}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path class="drawn" pathLength="1" d="M4 12l5 5L20 6" />
						</svg>
					{:else}
						<ArrowRightIcon class="arrow" size={ICON_PX} />
					{/if}
				</span>
			{/each}
		</span>
	</span>
	<span class="visually-hidden">{label}</span>
	<span class="visually-hidden" role="status"
		>{pending ? pendingLabel : phase === 'success' ? successLabel : ''}</span
	>
</button>

<style>
	/* The button hugs its label: text morphs in place and the width follows on a spring, so no state ever snaps the layout. */
	.button {
		position: relative;
		display: inline-flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 0 var(--arc-space-5);
		border: 1px solid var(--arc-primary-fill);
		border-radius: var(--arc-radius-control);
		background: var(--arc-primary-fill);
		color: var(--arc-primary-ink);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.button:hover:not(:disabled) {
			box-shadow: var(--arc-shadow-resting);
		}
	}
	.button:focus-visible {
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.button:disabled {
		cursor: not-allowed;
	}
	.button:disabled:not([data-state='pending']) {
		opacity: 0.7;
	}
	.button[data-state='pending'] {
		cursor: progress;
	}
	.content {
		display: inline-flex;
		min-height: 1.25rem;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
		white-space: nowrap;
	}
	.morph {
		display: inline-flex;
		min-width: 0;
	}
	.morph:global([data-morphing]) {
		clip-path: inset(-0.6em 0 -0.6em -0.3em);
	}
	.icon-slot {
		display: grid;
		width: 17px;
		height: 17px;
		flex: 0 0 17px;
		place-items: center;
	}
	.phase {
		grid-area: 1 / 1;
		display: grid;
		width: 17px;
		height: 17px;
		place-items: center;
	}
	.phase :global(.arrow) {
		flex: none;
	}
	.status-icon {
		color: currentColor;
	}
	.drawn {
		stroke-dasharray: 1;
		animation: draw var(--arc-duration-standard) var(--arc-ease-enter) 0.05s both;
	}
	.spinner {
		display: inline-block;
		width: var(--arc-space-4);
		height: var(--arc-space-4);
		border: 1.5px solid currentColor;
		border-right-color: transparent;
		border-radius: var(--arc-radius-pill);
		animation: spin 0.7s linear infinite;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
		.spinner,
		.drawn {
			animation: none;
		}
	}
</style>
