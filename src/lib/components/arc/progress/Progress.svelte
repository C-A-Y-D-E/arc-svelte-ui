<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { springTiming, swapOnChange } from '../alert/swap';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		value?: number;
		max?: number;
		label?: string;
		showValue?: boolean;
	};

	let {
		value = 0,
		max = 100,
		label,
		showValue = false,
		class: className,
		...rest
	}: Props = $props();

	const FULL = 100;
	const DEFAULT_MAX = 100;
	const CHECK_SCALE = 0.6;
	/** Completion lands as the fill arrives: the check settles in a beat after the count. */
	const CHECK_DELAY = 0.24;
	const { blur, duration, spring } = motionTokens;
	const checkEnter = springTiming(spring.snappy);

	const safeMax = $derived(max > 0 ? max : DEFAULT_MAX);
	const safeValue = $derived(Math.min(Math.max(value, 0), safeMax));
	const percentage = $derived(Math.round((safeValue / safeMax) * FULL));
	const complete = $derived(percentage >= FULL);

	// One spring drives both the fill and the counted label, so the number always matches the bar.
	let progress = $state(untrack(() => percentage));
	const shown = $derived(Math.min(Math.max(progress, 0), FULL));

	$effect(() => {
		const target = percentage;
		if (isReducedMotion()) {
			progress = target;
			return;
		}
		const from = untrack(() => progress);
		const controls = animate(from, target, {
			...spring.smooth,
			onUpdate: (latest) => (progress = latest)
		});
		return () => controls.stop();
	});
</script>

<div
	{...rest}
	class={['progress', className]}
	data-complete={complete ? '' : undefined}
	role="progressbar"
	aria-label={label ?? 'Progress'}
	aria-valuemin={0}
	aria-valuemax={safeMax}
	aria-valuenow={safeValue}
	aria-valuetext={`${percentage}%`}
>
	{#if label || showValue}
		<div class="meta">
			{#if label}
				<span class="label"><span class="line" {@attach swapOnChange()}>{label}</span></span>
			{:else}
				<span></span>
			{/if}
			{#if showValue}
				<span class="value">
					{#if complete}
						<span
							class="done"
							in:presence={{
								scale: CHECK_SCALE,
								blur: blur.subtle,
								delay: CHECK_DELAY,
								...checkEnter
							}}
							out:presence={{
								scale: CHECK_SCALE,
								blur: blur.subtle,
								duration: duration.fast,
								easing: ease.standard
							}}
						>
							<CheckIcon size={14} strokeWidth={2} aria-hidden="true" />
						</span>
					{/if}
					<span class="count">{Math.round(shown)}%</span>
				</span>
			{/if}
		</div>
	{/if}
	<!-- The fill slides in from the left instead of scaling, so its rounded end keeps its shape at every value. -->
	<div class="track">
		<span class="fill" style:transform={`translateX(${shown - FULL}%)`}></span>
	</div>
</div>

<style>
	.progress {
		width: 100%;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 8px;
		line-height: var(--arc-leading-body);
	}
	.label {
		position: relative;
		min-width: 0;
	}
	.line {
		display: block;
	}
	.value {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 4px;
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.count {
		display: inline-grid;
		justify-items: end;
	}
	/* A hidden "100%" row reserves the widest count, so the check never shifts as the number gains a digit. */
	.count::before {
		content: '100%';
		height: 0;
		overflow: hidden;
		visibility: hidden;
	}
	.done {
		display: grid;
		place-items: center;
		color: var(--arc-success);
	}
	.track {
		height: 7px;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: 99px;
		background: var(--arc-surface-muted);
	}
	.fill {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: inherit;
		background: var(--arc-accent);
		transition: background-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.progress[data-complete] .fill {
		background: var(--arc-success);
		transition-delay: 200ms;
	}
	@media (prefers-reduced-motion: reduce) {
		.fill,
		.progress[data-complete] .fill {
			transition: none;
		}
	}
</style>
