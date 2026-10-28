<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { WaffleChart, type WaffleCategory } from '$lib/components/arc/waffle-chart';
	import Demo from '../../Demo.svelte';

	const planMixByQuarter: Record<string, WaffleCategory[]> = {
		Q1: [
			{ key: 'team', label: 'Team', value: 3120 },
			{ key: 'free', label: 'Free', value: 5480 },
			{ key: 'starter', label: 'Starter', value: 2210 },
			{ key: 'enterprise', label: 'Enterprise', value: 640 }
		],
		Q2: [
			{ key: 'team', label: 'Team', value: 3890 },
			{ key: 'free', label: 'Free', value: 5120 },
			{ key: 'starter', label: 'Starter', value: 2470 },
			{ key: 'enterprise', label: 'Enterprise', value: 810 }
		],
		Q3: [
			{ key: 'team', label: 'Team', value: 4760 },
			{ key: 'free', label: 'Free', value: 4630 },
			{ key: 'starter', label: 'Starter', value: 2390 },
			{ key: 'enterprise', label: 'Enterprise', value: 1050 }
		]
	};
	let quarter = $state('Q3');

	const trafficSources: WaffleCategory[] = [
		{ key: 'search', label: 'Organic search', value: 41.2 },
		{ key: 'direct', label: 'Direct', value: 22.6 },
		{ key: 'referral', label: 'Referral', value: 14.1 },
		{ key: 'email', label: 'Email', value: 9.8 },
		{ key: 'social', label: 'Social', value: 7.4 },
		{ key: 'other', label: 'Other', value: 4.9 }
	];

	const regions: WaffleCategory[] = [
		{ key: 'na', label: 'North America', value: 48 },
		{ key: 'eu', label: 'Europe', value: 31 },
		{ key: 'apac', label: 'Asia Pacific', value: 15 },
		{ key: 'latam', label: 'Latin America', value: 6 }
	];
</script>

<Demo title="Waffle chart · Plan mix by quarter">
	<div class="stack">
		<div class="controls" role="group" aria-label="Quarter">
			{#each Object.keys(planMixByQuarter) as key (key)}
				<Button
					size="sm"
					variant={quarter === key ? 'secondary' : 'ghost'}
					aria-pressed={quarter === key}
					onclick={() => (quarter = key)}>{key}</Button
				>
			{/each}
		</div>
		<WaffleChart
			data={planMixByQuarter[quarter]}
			label="Paying and free workspaces, {quarter}"
			unit="workspaces"
			accentKey="team"
		/>
	</div>
</Demo>

<Demo title="Waffle chart · Traffic sources, one decimal">
	<div class="stack">
		<WaffleChart
			data={trafficSources}
			label="Sessions by traffic source"
			formatValue={(value) => `${value.toFixed(1)}%`}
			decimals={1}
			rows={20}
			columns={20}
		/>
	</div>
</Demo>

<Demo title="Waffle chart · No accent, no legend">
	<div class="stack">
		<WaffleChart data={regions} label="Customers by region" accentKey={null} legend={false} />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		min-width: 0;
		gap: var(--arc-space-4);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--arc-space-1);
	}
</style>
