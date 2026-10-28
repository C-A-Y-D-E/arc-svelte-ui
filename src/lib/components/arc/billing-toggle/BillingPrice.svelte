<script lang="ts">
	import { animate } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { AnimatedCounter } from '../animated-counter';
	import { presenceEm, springEasing, widthPresence } from '../animated-counter/motion-extras';
	import { isReducedMotion } from '../motion';
	import { swapIn, swapOut } from './StableSwap.svelte';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		amount: number;
		currency?: string;
		/** Period after the price, e.g. "per month". Swaps in place when it changes. */
		period?: string;
		/** Previous price, shown struck through when it is higher than `amount`. */
		was?: number;
		decimals?: number;
	};

	let {
		amount,
		currency = '$',
		period,
		was,
		decimals = 0,
		class: className,
		...rest
	}: Props = $props();

	const CLIP = { type: 'spring', visualDuration: 0.36, bounce: 0 } as const;
	const clip = springEasing(CLIP);

	let periodNode = $state<HTMLSpanElement>();
	let periodSizer = $state<HTMLSpanElement>();
	let sizedNode: HTMLSpanElement | undefined;
	const showWas = $derived(was !== undefined && was > amount);

	/** The period eases to the width of its new text, so nothing beside it jumps. */
	$effect(() => {
		void period;
		if (!periodNode || !periodSizer) return;
		const width = periodSizer.offsetWidth;
		if (sizedNode !== periodNode || isReducedMotion()) {
			sizedNode = periodNode;
			periodNode.style.width = `${width}px`;
			return;
		}
		animate(periodNode, { width }, CLIP);
	});

	/** The first measure can come before the web font has loaded; measure again once it has. */
	$effect(() => {
		let current = true;
		void document.fonts.ready.then(() => {
			if (current && periodNode && periodSizer) {
				periodNode.style.width = `${periodSizer.offsetWidth}px`;
			}
		});
		return () => {
			current = false;
		};
	});
</script>

<!-- A price that rolls to its new amount. The old price and the period ease their width, so nothing beside them jumps. -->
<span class={['price', className]} {...rest}>
	<span class="amount">
		<span class="currency">{currency}</span>
		<span class="counter"><AnimatedCounter value={amount} {decimals} /></span>
	</span>
	<span class="aside">
		{#if showWas && was !== undefined}
			<span class="was-slot" transition:widthPresence={clip}>
				<del class="was">{currency}{was.toFixed(decimals)}</del>
			</span>
		{/if}
		{#if period}
			<span bind:this={periodNode} class="period">
				<span bind:this={periodSizer} class="period-sizer" aria-hidden="true">{period}</span>
				{#key period}
					<span class="period-text" in:presenceEm={swapIn} out:presenceEm={swapOut}>{period}</span>
				{/key}
			</span>
		{/if}
	</span>
</span>

<style>
	.price {
		display: inline-flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 4px 10px;
	}
	.amount {
		display: inline-flex;
		align-items: flex-start;
		color: var(--arc-foreground);
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		font-weight: 400;
		letter-spacing: var(--arc-tracking-display);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.currency {
		margin-top: 0.12em;
		margin-right: 0.04em;
		color: var(--arc-text-secondary);
		font-size: 0.55em;
	}
	.counter {
		display: inline-flex;
	}
	.counter > :global(span) {
		font: inherit !important;
		letter-spacing: inherit !important;
	}
	.aside {
		display: inline-flex;
		align-items: baseline;
		padding-bottom: 0.3em;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		white-space: nowrap;
	}
	.was-slot {
		display: inline-block;
		overflow-x: clip;
	}
	.was {
		display: inline-block;
		padding-right: 6px;
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
		text-decoration-thickness: 1px;
	}
	.period {
		position: relative;
		display: inline-block;
		overflow-x: clip;
		overflow-clip-margin: 2px;
	}
	.period-sizer {
		display: inline-block;
		visibility: hidden;
	}
	.period-text {
		position: absolute;
		top: 0;
		left: 0;
		display: inline-block;
	}
</style>
