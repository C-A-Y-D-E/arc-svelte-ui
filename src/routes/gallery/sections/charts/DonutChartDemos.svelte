<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { DonutChart, type DonutChartDatum } from '$lib/components/arc/donut-chart';
	import Demo from '../../Demo.svelte';

	const trafficSources: DonutChartDatum[] = [
		{ key: 'search', label: 'Search', value: 4210 },
		{ key: 'direct', label: 'Direct', value: 2380 },
		{ key: 'social', label: 'Social', value: 1190 },
		{ key: 'email', label: 'Email', value: 640 },
		{ key: 'ads', label: 'Ads', value: 120 },
		{ key: 'other', label: 'Referral', value: 90 }
	];

	const spendByMonth: Record<string, DonutChartDatum[]> = {
		'This month': [
			{ key: 'compute', label: 'Compute', value: 4820 },
			{ key: 'storage', label: 'Storage', value: 1930 },
			{ key: 'network', label: 'Network', value: 1240 },
			{ key: 'support', label: 'Support', value: 610 }
		],
		'Last month': [
			{ key: 'compute', label: 'Compute', value: 3150 },
			{ key: 'storage', label: 'Storage', value: 2480 },
			{ key: 'network', label: 'Network', value: 560 },
			{ key: 'support', label: 'Support', value: 1320 }
		]
	};
	const months = Object.keys(spendByMonth);
	const usd = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const storage: DonutChartDatum[] = [
		{ key: 'photos', label: 'Photos', value: 48.2 },
		{ key: 'video', label: 'Video', value: 31.5 },
		{ key: 'documents', label: 'Documents', value: 12.8 },
		{ key: 'apps', label: 'Apps', value: 6.1 }
	];

	let month = $state(months[0]);
</script>

<Demo title="Donut chart · traffic sources" wide>
	<div class="fill">
		<DonutChart label="Visits by source" unit="visits" data={trafficSources} />
	</div>
</Demo>

<Demo title="Donut chart · dataset switch" wide>
	<div class="fill stack">
		<div class="switch">
			{#each months as option (option)}
				<Button
					size="sm"
					variant={month === option ? 'secondary' : 'ghost'}
					onclick={() => (month = option)}>{option}</Button
				>
			{/each}
		</div>
		<DonutChart
			label="Spend by category"
			data={spendByMonth[month]}
			formatValue={(value) => usd.format(value)}
		/>
	</div>
</Demo>

<Demo title="Donut chart · select legend">
	<div class="fill">
		<DonutChart
			label="Storage by type"
			unit="GB"
			data={storage}
			legendAction="select"
			defaultActiveKey="photos"
		/>
	</div>
</Demo>

<Demo title="Donut chart · no legend">
	<div class="fill">
		<DonutChart
			label="Storage by type"
			unit="GB"
			data={storage}
			legend={false}
			size={180}
			thickness={20}
		/>
	</div>
</Demo>

<style>
	/* The chart lays its legend beside the ring once its container is 460px wide, so the wrapper is that container. */
	.fill {
		width: 100%;
		max-width: 640px;
		container-type: inline-size;
	}
	.stack {
		display: grid;
		gap: var(--arc-space-4);
	}
	.switch {
		display: flex;
		gap: var(--arc-space-1);
	}
</style>
