<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { AnimatedCounter } from '../animated-counter';
	import { springEasing } from '../animated-counter/motion-extras';
	import { motionTokens, presence } from '../motion';
	import TextSwap from './TextSwap.svelte';

	type Props = HTMLAttributes<HTMLElement> & {
		label: string;
		value: number;
		suffix?: string;
		context: string;
		change?: string;
	};

	let { label, value, suffix, context, change, class: className, ...rest }: Props = $props();

	const CHIP_SCALE = 0.96;
	const snappy = springEasing(motionTokens.spring.snappy);

	function trendOf(copy: string) {
		if (/^[+]/.test(copy)) return 'up';
		if (/^[-−]/.test(copy)) return 'down';
		return undefined;
	}
</script>

<article class={['card', className]} {...rest}>
	<div class="top">
		<span><TextSwap text={label} block /></span>
		{#if change}
			<small
				data-trend={trendOf(change)}
				in:presence={{ scale: CHIP_SCALE, ...snappy }}
				out:presence={{ scale: CHIP_SCALE, duration: motionTokens.duration.fast }}
			>
				<TextSwap text={change} morph />
			</small>
		{/if}
	</div>
	<AnimatedCounter {value} {suffix} animateOnView />
	<p><TextSwap text={context} block /></p>
</article>

<style>
	.card {
		min-width: 0;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-surface);
		padding: var(--arc-space-6);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
		margin-bottom: var(--arc-space-8);
	}
	.top span {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.top small {
		display: inline-flex;
		flex: 0 0 auto;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		padding: 3px 8px;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		font-variant-numeric: tabular-nums;
	}
	.card p {
		margin: var(--arc-space-4) 0 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	@media (max-width: 380px) {
		.card {
			padding: var(--arc-space-4);
		}
		.top {
			align-items: flex-start;
			flex-wrap: wrap;
			margin-bottom: var(--arc-space-6);
		}
	}
	/* A signed change reads its direction in color as well as sign: a faint tint behind, the color on the text. */
	.top small[data-trend] {
		border-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.top small[data-trend='up'] {
		background: color-mix(in oklch, var(--arc-success) 11%, transparent);
		color: var(--arc-success);
	}
	.top small[data-trend='down'] {
		background: color-mix(in oklch, var(--arc-danger) 11%, transparent);
		color: var(--arc-danger);
	}
</style>
