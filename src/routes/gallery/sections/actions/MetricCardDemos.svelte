<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { MetricCard } from '$lib/components/arc/metric-card';
	import Demo from '../../Demo.svelte';

	type Metric = { label: string; value: number; suffix?: string; change?: string };
	type Period = { context: string; metrics: Metric[] };

	const PERIODS: Period[] = [
		{
			context: 'vs last week',
			metrics: [
				{ label: 'Active seats', value: 1284, change: '+12%' },
				{ label: 'Failed deploys', value: 7, change: '-3' },
				{ label: 'Median response', value: 240, suffix: ' ms', change: '0%' }
			]
		},
		{
			context: 'vs last month',
			metrics: [
				{ label: 'Active seats', value: 1197, change: '-4%' },
				{ label: 'Failed deploys', value: 12, change: '+5' },
				{ label: 'Median response', value: 212, suffix: ' ms' }
			]
		}
	];

	let periodIndex = $state(0);
	const period = $derived(PERIODS[periodIndex]);

	function switchPeriod() {
		periodIndex = (periodIndex + 1) % PERIODS.length;
	}
</script>

<Demo title="Metric card · up, down and flat" wide>
	<div class="stack">
		<Button variant="secondary" size="sm" onclick={switchPeriod}>
			{periodIndex === 0 ? 'Show month' : 'Show week'}
		</Button>
		<div class="cards">
			{#each period.metrics as metric (metric.label)}
				<MetricCard
					label={metric.label}
					value={metric.value}
					suffix={metric.suffix}
					change={metric.change}
					context={period.context}
				/>
			{/each}
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		justify-items: start;
		gap: var(--arc-space-4);
	}
	.cards {
		display: grid;
		width: 100%;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: var(--arc-space-3);
	}
</style>
