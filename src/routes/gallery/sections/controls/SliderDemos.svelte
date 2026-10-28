<script lang="ts">
	import Volume1Icon from '@lucide/svelte/icons/volume-1';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import { Slider, type SliderValue } from '$lib/components/arc/slider';
	import Demo from '../../Demo.svelte';

	const STORAGE_MARKS = [
		{ value: 10, label: '10 GB' },
		{ value: 50, label: '50 GB' },
		{ value: 100, label: '100 GB' }
	];
	const PRICE_STEP = 5;

	let storage = $state<SliderValue>(50);
	let priceRange = $state<SliderValue>([20, 80]);
	let volume = $state<SliderValue>(60);
	let committedVolume = $state(60);

	const formatGb = (value: number) => `${value} GB`;
	const formatUsd = (value: number) => `$${value}`;
	const rangeText = $derived(
		Array.isArray(priceRange) ? `${formatUsd(priceRange[0])} to ${formatUsd(priceRange[1])}` : ''
	);
</script>

{#snippet quiet()}<Volume1Icon size={16} />{/snippet}
{#snippet loud()}<Volume2Icon size={16} />{/snippet}

<Demo title="Slider · marks and formatted value">
	<div class="stack">
		<Slider
			label="Storage"
			bind:value={storage}
			min={10}
			max={100}
			step={10}
			marks={STORAGE_MARKS}
			format={formatGb}
		/>
		<p class="output">Storage: {storage}</p>
	</div>
</Demo>

<Demo title="Slider · range">
	<div class="stack">
		<Slider
			label="Price"
			bind:value={priceRange}
			step={PRICE_STEP}
			minStepsBetweenThumbs={2}
			format={formatUsd}
			thumbLabels={['Minimum price', 'Maximum price']}
		/>
		<p class="output">Price: {rangeText}</p>
	</div>
</Demo>

<Demo title="Slider · small, icons, commit, disabled">
	<div class="stack">
		<Slider
			label="Alert volume"
			size="sm"
			bind:value={volume}
			start={quiet}
			end={loud}
			onValueCommit={(next) => (committedVolume = next as number)}
		/>
		<Slider label="Locked" size="sm" defaultValue={30} disabled />
		<p class="output">Saved volume: {committedVolume}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-5);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
