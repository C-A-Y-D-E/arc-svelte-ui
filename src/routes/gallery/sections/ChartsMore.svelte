<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { SlopeChart, type SlopeItem } from '$lib/components/arc/slope-chart';
	import Demo from '../Demo.svelte';
	import BrushChartDemos from './charts/BrushChartDemos.svelte';
	import RidgelineDemos from './charts/RidgelineDemos.svelte';
	import TreemapDemos from './charts/TreemapDemos.svelte';
	import WaffleChartDemos from './charts/WaffleChartDemos.svelte';

	const conversionByQuarter: Record<string, SlopeItem[]> = {
		'Q1 to Q2': [
			{ key: 'email', label: 'Email', start: 3.1, end: 4.6 },
			{ key: 'search', label: 'Organic search', start: 3.4, end: 3.6 },
			{ key: 'referral', label: 'Referral', start: 2.6, end: 2.9 },
			{ key: 'direct', label: 'Direct', start: 2.2, end: 2.0 },
			{ key: 'social', label: 'Paid social', start: 1.9, end: 1.3 }
		],
		'Q2 to Q3': [
			{ key: 'email', label: 'Email', start: 4.6, end: 4.1 },
			{ key: 'search', label: 'Organic search', start: 3.6, end: 4.4 },
			{ key: 'referral', label: 'Referral', start: 2.9, end: 3.3 },
			{ key: 'direct', label: 'Direct', start: 2.0, end: 2.4 },
			{ key: 'social', label: 'Paid social', start: 1.3, end: 1.6 }
		]
	};
	let slopePeriod = $state('Q1 to Q2');
	const [slopeStart, slopeEnd] = $derived(slopePeriod.split(' to '));
</script>

<Demo title="Slope chart · switch periods" wide>
	<div class="stack">
		<div class="switch">
			{#each Object.keys(conversionByQuarter) as period (period)}
				<Button
					size="sm"
					variant={period === slopePeriod ? 'secondary' : 'ghost'}
					aria-pressed={period === slopePeriod}
					onclick={() => (slopePeriod = period)}>{period}</Button
				>
			{/each}
		</div>
		<SlopeChart
			data={conversionByQuarter[slopePeriod]}
			label="Conversion by channel"
			startLabel={slopeStart}
			endLabel={slopeEnd}
			highlightKey="email"
			formatValue={(value) => `${value.toFixed(1)}%`}
			formatChange={(value) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} pts`}
		/>
	</div>
</Demo>

<BrushChartDemos />
<RidgelineDemos />
<TreemapDemos />
<WaffleChartDemos />

<style>
	.stack {
		display: grid;
		width: 100%;
		gap: var(--arc-space-4);
	}
	.switch {
		display: flex;
		flex-wrap: wrap;
		gap: var(--arc-space-1);
	}
</style>
