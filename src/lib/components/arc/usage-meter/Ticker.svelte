<script lang="ts">
	import { untrack } from 'svelte';
	import DigitWheel from './DigitWheel.svelte';
	import { openColumn } from './meter-motion';
	import { createTrend, partsFor } from './number-parts';

	/** A number that rolls to each new value. It is decoration over text that screen readers get elsewhere. */
	let { value, decimals }: { value: number; decimals: number } = $props();

	const followTrend = createTrend(untrack(() => value));
	const direction = $derived(followTrend(value));
	const parts = $derived(partsFor(value, decimals));
</script>

<span class="ticker" aria-hidden="true">
	{#each parts as part (part.key)}
		<span class={part.kind === 'digit' ? 'column' : 'symbol'} transition:openColumn>
			{#if part.kind === 'digit'}
				<DigitWheel digit={part.digit} {direction} />
			{:else}
				{part.text}
			{/if}
		</span>
	{/each}
</span>

<style>
	/* A rolling number: each digit is a clipped wheel that feathers at its edges, and new columns open from zero width. */
	.ticker {
		position: relative;
		display: inline-flex;
		align-items: flex-start;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		user-select: none;
	}
	.column {
		--usage-meter-feather: 0.16em;
		position: relative;
		display: inline-block;
		overflow: hidden;
		margin-block: calc(var(--usage-meter-feather) * -1);
		padding-block: var(--usage-meter-feather);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 calc(var(--usage-meter-feather) * 1.5),
			#000 calc(100% - var(--usage-meter-feather) * 1.5),
			transparent
		);
	}
	.symbol {
		display: inline-block;
		overflow-x: clip;
	}
</style>
