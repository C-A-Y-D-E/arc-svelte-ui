<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Ridgeline, type RidgelineSeries } from '$lib/components/arc/ridgeline';
	import Demo from '../../Demo.svelte';

	const SAMPLES_PER_SERIES = 400;
	const MINUTES_PER_HOUR = 60;

	/** Seeded generator instead of Math.random, so the server and the browser draw the same ridges. */
	function seeded(seed: number) {
		let state = seed;
		return () => {
			state = (state + 0x6d2b79f5) | 0;
			let t = Math.imul(state ^ (state >>> 15), 1 | state);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function normalSamples(seed: number, mean: number, spread: number, count = SAMPLES_PER_SERIES) {
		const next = seeded(seed);
		return Array.from({ length: count }, () => {
			const radius = Math.sqrt(-2 * Math.log(1 - next()));
			return mean + spread * radius * Math.cos(2 * Math.PI * next());
		});
	}

	/** Most requests are fast; a slower tail comes from cache misses. */
	function latencySamples(seed: number, fast: number, slow: number, slowShare: number) {
		const fastCount = Math.round(SAMPLES_PER_SERIES * (1 - slowShare));
		return [
			...normalSamples(seed, fast, 14 + fast * 0.16, fastCount),
			...normalSamples(seed + 1, slow, 20 + slow * 0.14, SAMPLES_PER_SERIES - fastCount)
		].map((value) => Math.max(1, Math.round(value)));
	}

	const endpoints: RidgelineSeries[] = [
		{ id: 'health', label: 'Health', values: latencySamples(11, 40, 90, 0.08) },
		{ id: 'auth', label: 'Auth', values: latencySamples(23, 95, 180, 0.15) },
		{ id: 'feed', label: 'Feed', values: latencySamples(41, 150, 260, 0.2) },
		{ id: 'search', label: 'Search', values: latencySamples(37, 210, 380, 0.3) },
		{ id: 'upload', label: 'Upload', values: latencySamples(53, 300, 470, 0.25) },
		{ id: 'export', label: 'Export', values: latencySamples(67, 390, 560, 0.35) }
	];

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const sessionMinutes: RidgelineSeries[] = WEEKDAYS.map((day, index) => {
		const weekend = index >= 5;
		const mean = weekend ? 26 : 14 + index * 1.5;
		return {
			id: day.toLowerCase(),
			label: day,
			values: normalSamples(100 + index, mean, weekend ? 9 : 5).map((value) => Math.max(0.5, value))
		};
	});

	let activeDay = $state<string | null>('sat');
	const activeSeries = $derived(sessionMinutes.find((entry) => entry.id === activeDay));
	const allSessions = sessionMinutes.flatMap((entry) => entry.values);
	const activeMedian = $derived.by(() => {
		const sorted = [...(activeSeries?.values ?? allSessions)].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	});

	let tint = $state(true);

	function formatMinutes(minutes: number) {
		const whole = Math.round(minutes);
		if (whole < MINUTES_PER_HOUR) return `${whole} min`;
		const rest = whole % MINUTES_PER_HOUR;
		return `${Math.floor(whole / MINUTES_PER_HOUR)} h${rest ? ` ${rest} min` : ''}`;
	}
</script>

<Demo title="Ridgeline · Response time by endpoint" wide>
	<div class="stack">
		<div class="controls" role="group" aria-label="Shading">
			<Button
				size="sm"
				variant={tint ? 'secondary' : 'ghost'}
				aria-pressed={tint}
				onclick={() => (tint = true)}>Shade by median</Button
			>
			<Button
				size="sm"
				variant={tint ? 'ghost' : 'secondary'}
				aria-pressed={!tint}
				onclick={() => (tint = false)}>Flat</Button
			>
		</div>
		<Ridgeline
			series={endpoints}
			label="Response time by endpoint"
			unit=" ms"
			domain={[0, 750]}
			{tint}
		/>
	</div>
</Demo>

<Demo title="Ridgeline · Session length by weekday" wide>
	<div class="stack">
		<output class="readout" aria-live="polite">
			<span class="readout-label">Median · {activeSeries?.label ?? 'All days'}</span>
			<span class="readout-value">{formatMinutes(activeMedian)}</span>
		</output>
		<Ridgeline
			series={sessionMinutes}
			label="Session length by weekday"
			formatValue={formatMinutes}
			domain={[0, 75]}
			rowHeight={26}
			overlap={2}
			bind:active={activeDay}
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
	}
	.readout-value {
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		letter-spacing: var(--arc-tracking-display);
	}
</style>
