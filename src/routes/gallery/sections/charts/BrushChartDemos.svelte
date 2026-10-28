<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import {
		BrushChart,
		type BrushChartAnnotation,
		type BrushChartDatum
	} from '$lib/components/arc/brush-chart';
	import Demo from '../../Demo.svelte';

	const DAY_MS = 86_400_000;
	const HISTORY_DAYS = 540;
	const FIRST_DAY = Date.UTC(2025, 3, 1);
	const LAST_DAY = FIRST_DAY + (HISTORY_DAYS - 1) * DAY_MS;
	const WEEKEND_DIP = 0.78;
	const LAUNCH_DAY = 310;

	const rangeDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

	/** Seeded waves instead of Math.random, so the server and the browser render the same points. */
	function activeUsersOn(day: number) {
		const weekday = new Date(FIRST_DAY + day * DAY_MS).getUTCDay();
		const weekend = weekday === 0 || weekday === 6 ? WEEKEND_DIP : 1;
		const trend = 8200 + day * 14;
		const season = 900 * Math.sin(day / 58) + 320 * Math.cos(day / 9.3);
		const launch = day > LAUNCH_DAY ? 2600 * (1 - Math.exp(-(day - LAUNCH_DAY) / 20)) : 0;
		return Math.round((trend + season + launch) * weekend);
	}

	function p95LatencyOn(day: number) {
		const incident = 420 * Math.exp(-(((day - 212) / 3) ** 2));
		return Math.round(180 + 24 * Math.sin(day / 11) + 12 * Math.cos(day / 2.7) + incident);
	}

	const activeUsers: BrushChartDatum[] = Array.from({ length: HISTORY_DAYS }, (_, day) => ({
		date: FIRST_DAY + day * DAY_MS,
		value: activeUsersOn(day)
	}));

	const latency: BrushChartDatum[] = Array.from({ length: HISTORY_DAYS }, (_, day) => ({
		date: FIRST_DAY + day * DAY_MS,
		value: p95LatencyOn(day)
	}));

	const releases: BrushChartAnnotation[] = [
		{
			date: FIRST_DAY + 96 * DAY_MS,
			label: 'New editor',
			description: 'Rich text editor shipped to all plans'
		},
		{
			date: FIRST_DAY + LAUNCH_DAY * DAY_MS,
			label: 'v2 launch',
			description: 'Redesigned workspace and mobile apps'
		},
		{
			date: FIRST_DAY + 455 * DAY_MS,
			label: 'EU region',
			description: 'Data residency in Frankfurt'
		}
	];

	const incidents: BrushChartAnnotation[] = [
		{
			date: FIRST_DAY + 212 * DAY_MS,
			label: 'DB failover',
			description: 'Primary database failover in us-east'
		}
	];

	let usersRange = $state<[number, number]>([LAST_DAY - 120 * DAY_MS, LAST_DAY]);
	const usersInRange = $derived(
		activeUsers.filter((point) => {
			const t = point.date as number;
			return t >= usersRange[0] && t <= usersRange[1];
		})
	);
	const averageInRange = $derived(
		Math.round(
			usersInRange.reduce((sum, point) => sum + point.value, 0) / Math.max(1, usersInRange.length)
		)
	);

	const PRESETS = [
		{ label: '30D', days: 30 },
		{ label: '90D', days: 90 },
		{ label: '1Y', days: 365 },
		{ label: 'All', days: HISTORY_DAYS - 1 }
	];
	let latencyDays = $state(90);
	let latencyRange = $state<[number, number]>([LAST_DAY - 90 * DAY_MS, LAST_DAY]);

	function showLastDays(days: number) {
		latencyDays = days;
		latencyRange = [LAST_DAY - days * DAY_MS, LAST_DAY];
	}
</script>

<Demo title="Brush chart · Drag the strip to pick a window" wide>
	<div class="stack">
		<output class="readout" aria-live="polite">
			<span class="readout-label">
				{rangeDate.format(usersRange[0])} – {rangeDate.format(usersRange[1])}
			</span>
			<span class="readout-value">{averageInRange.toLocaleString('en-US')}</span>
			<span class="readout-label">average daily active users</span>
		</output>
		<BrushChart
			data={activeUsers}
			label="Daily active users"
			unit="users"
			annotations={releases}
			bind:range={usersRange}
		/>
	</div>
</Demo>

<Demo title="Brush chart · Preset windows" wide>
	<div class="stack">
		<div class="controls" role="group" aria-label="Window">
			{#each PRESETS as preset (preset.label)}
				<Button
					size="sm"
					variant={latencyDays === preset.days ? 'secondary' : 'ghost'}
					aria-pressed={latencyDays === preset.days}
					onclick={() => showLastDays(preset.days)}>{preset.label}</Button
				>
			{/each}
		</div>
		<BrushChart
			data={latency}
			label="p95 response time"
			formatValue={(value) => `${Math.round(value)} ms`}
			formatTick={(value) => `${value} ms`}
			annotations={incidents}
			range={latencyRange}
			onRangeChange={() => (latencyDays = 0)}
			height={200}
			overviewHeight={44}
		/>
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
	.readout {
		display: grid;
		gap: var(--arc-space-1);
	}
	.readout-label {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.readout-value {
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--arc-tracking-display);
	}
</style>
