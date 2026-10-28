<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import {
		LineChart,
		type LineChartDatum,
		type LineChartSeries
	} from '$lib/components/arc/line-chart';
	import Demo from '../../Demo.svelte';

	const DAY_MS = 86_400_000;
	const HISTORY_DAYS = 90;
	const LAST_DAY_UTC = Date.UTC(2026, 8, 30);
	const RANGES = [
		{ label: '7D', days: 7 },
		{ label: '30D', days: 30 },
		{ label: '90D', days: 90 }
	];

	const fullDate = new Intl.DateTimeFormat('en-US', {
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

	/** Seeded waves instead of Math.random, so the server and the browser render the same points. */
	function signupsOn(day: number) {
		return Math.round(140 + day * 0.9 + 26 * Math.sin(day / 4.2) + 11 * Math.cos(day / 1.7));
	}

	function previousOn(day: number) {
		return Math.round(118 + day * 0.7 + 18 * Math.sin(day / 5.1 + 1.3) + 9 * Math.cos(day / 2.3));
	}

	const history: LineChartDatum[] = Array.from({ length: HISTORY_DAYS }, (_, day) => {
		const date = new Date(LAST_DAY_UTC - (HISTORY_DAYS - 1 - day) * DAY_MS);
		return {
			key: date.toISOString().slice(0, 10),
			label: fullDate.format(date),
			axisLabel: shortDate.format(date),
			values: { signups: signupsOn(day), previous: previousOn(day) }
		};
	});

	const comparison: LineChartSeries[] = [
		{ key: 'signups', label: 'This period' },
		{ key: 'previous', label: 'Previous period', dashed: true }
	];
	const signupsOnly: LineChartSeries[] = [{ key: 'signups', label: 'Signups' }];

	let rangeDays = $state(30);
	const rangeData = $derived(history.slice(-rangeDays));

	const readoutData = history.slice(-30);
	let readout = $state<LineChartDatum | null>(null);
	const readoutDatum = $derived(readout ?? readoutData[readoutData.length - 1]);

	const twoWeeks = history.slice(-14);
	let loading = $state(false);
	let emptyRange = $state(false);
</script>

<Demo title="Line chart · Ranges" wide>
	<div class="stack">
		<div class="controls" role="group" aria-label="Range">
			{#each RANGES as range (range.label)}
				<Button
					size="sm"
					variant={rangeDays === range.days ? 'secondary' : 'ghost'}
					aria-pressed={rangeDays === range.days}
					onclick={() => (rangeDays = range.days)}
				>
					{range.label}
				</Button>
			{/each}
		</div>
		<LineChart label="Signups" data={rangeData} series={comparison} />
	</div>
</Demo>

<Demo title="Line chart · Headline readout" wide>
	<div class="stack">
		<div class="readout">
			<span class="readout-label">{readoutDatum.label}</span>
			<span class="readout-value">{readoutDatum.values.signups}</span>
		</div>
		<LineChart
			label="Signups"
			data={readoutData}
			series={signupsOnly}
			onActiveChange={(_, datum) => (readout = datum)}
		/>
	</div>
</Demo>

<Demo title="Line chart · Loading and empty" wide>
	<div class="stack">
		<div class="controls">
			<Button
				size="sm"
				variant={loading ? 'secondary' : 'ghost'}
				aria-pressed={loading}
				onclick={() => (loading = !loading)}
			>
				Loading
			</Button>
			<Button
				size="sm"
				variant={emptyRange ? 'secondary' : 'ghost'}
				aria-pressed={emptyRange}
				onclick={() => (emptyRange = !emptyRange)}
			>
				No data
			</Button>
		</div>
		<LineChart label="Signups" data={emptyRange ? [] : twoWeeks} series={comparison} {loading} />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		gap: var(--arc-space-4);
	}
	.controls {
		display: flex;
		gap: var(--arc-space-1);
	}
	.readout {
		display: grid;
		gap: var(--arc-space-1);
	}
	.readout-label {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.readout-value {
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--arc-tracking-display);
	}
</style>
