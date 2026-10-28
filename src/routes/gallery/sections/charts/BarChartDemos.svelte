<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { BarChart, type BarChartDatum } from '$lib/components/arc/bar-chart';
	import Demo from '../../Demo.svelte';

	const LAST_DAY = Date.UTC(2026, 8, 20);
	const DAY_MS = 86_400_000;
	const RANGES = { '7D': 7, '14D': 14, '30D': 30 } as const;
	type Range = keyof typeof RANGES;

	const longDate = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const shortDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
	const periodDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

	/** Deterministic, so the server and the browser draw the same bars. */
	const minutesOn = (dayIndex: number) =>
		Math.round(38 + 18 * Math.sin(dayIndex * 1.3) + 9 * Math.cos(dayIndex * 0.45));

	function daysFor(range: Range): BarChartDatum[] {
		const days = RANGES[range];
		return Array.from({ length: days }, (_, offset) => {
			const time = LAST_DAY - (days - 1 - offset) * DAY_MS;
			const dayIndex = time / DAY_MS;
			const date = new Date(time);
			return {
				key: date.toISOString().slice(0, 10),
				label: longDate.format(date),
				axisLabel: days <= 7 ? weekday.format(date) : shortDate.format(date),
				value: minutesOn(dayIndex)
			};
		});
	}

	let range = $state<Range>('7D');
	const data = $derived(daysFor(range));
	const period = $derived(
		`${periodDate.format(LAST_DAY - (RANGES[range] - 1) * DAY_MS)} – ${periodDate.format(LAST_DAY)}`
	);
</script>

<Demo title="Bar chart · ranges" wide>
	<div class="stack">
		<div class="switch">
			{#each Object.keys(RANGES) as name (name)}
				<Button
					size="sm"
					variant={range === name ? 'secondary' : 'ghost'}
					onclick={() => (range = name as Range)}>{name}</Button
				>
			{/each}
		</div>
		<BarChart {data} label="Active minutes" {period} unit="min" />
	</div>
</Demo>

<Demo title="Bar chart · without average">
	<div class="stack">
		<BarChart
			data={daysFor('7D')}
			label="Deploys"
			period="This week"
			averageLabel="Per day"
			valueLabel="Deploys"
			showAverage={false}
			height={140}
		/>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		gap: var(--arc-space-5);
	}
	.switch {
		display: flex;
		gap: var(--arc-space-1);
	}
</style>
