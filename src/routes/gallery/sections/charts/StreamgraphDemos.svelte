<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';
	import {
		Streamgraph,
		type StreamgraphDatum,
		type StreamgraphOffset,
		type StreamgraphSeries
	} from '$lib/components/arc/streamgraph';

	const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
	const DAY_MS = 86_400_000;
	const FIRST_WEEK = Date.UTC(2025, 9, 6);
	const WEEKS_IN_YEAR = 52;
	const DAYS_IN_WEEK = 7;
	const LAUNCH_WEEK = 40;
	const HALF_YEAR_WEEKS = 26;

	const topics: StreamgraphSeries[] = [
		{ key: 'bugs', label: 'Bugs' },
		{ key: 'billing', label: 'Billing' },
		{ key: 'onboarding', label: 'Onboarding' },
		{ key: 'integrations', label: 'Integrations' },
		{ key: 'account', label: 'Account' }
	];

	/** Deterministic weekly volumes: a seasonal swing per topic plus a spike in onboarding around a launch. */
	const volumeFor: Record<string, (week: number) => number> = {
		bugs: (week) => 120 + 38 * Math.sin(week / 5.1) + 14 * Math.cos(week / 1.7),
		billing: (week) =>
			78 + 26 * Math.sin(week / 7.3 + 1.2) + 18 * Math.cos((week * 2 * Math.PI) / 4.33),
		onboarding: (week) =>
			46 +
			week * 0.9 +
			90 * Math.exp(-(((week - LAUNCH_WEEK) / 2.4) ** 2)) +
			10 * Math.sin(week / 3),
		integrations: (week) => 44 + 22 * Math.sin(week / 9 + 2.5) + 8 * Math.cos(week / 2.3),
		account: (week) => 34 + 12 * Math.sin(week / 6 + 4) + 6 * Math.cos(week / 1.9)
	};

	function weekOf(week: number): StreamgraphDatum {
		const date = new Date(FIRST_WEEK + week * DAYS_IN_WEEK * DAY_MS);
		const month = MONTHS[date.getUTCMonth()];
		const day = date.getUTCDate();
		const values = Object.fromEntries(
			topics.map(({ key }) => [key, Math.max(0, Math.round(volumeFor[key](week)))])
		);
		return {
			key: date.toISOString().slice(0, 10),
			label: `Week of ${month} ${day}`,
			axisLabel: day <= DAYS_IN_WEEK ? month : undefined,
			values
		};
	}

	const year = Array.from({ length: WEEKS_IN_YEAR }, (_, week) => weekOf(week));
	const halfYear = year.slice(-HALF_YEAR_WEEKS);

	const ranges = [
		{ key: '12w', label: '12 weeks', weeks: 12 },
		{ key: '6m', label: '6 months', weeks: HALF_YEAR_WEEKS },
		{ key: '1y', label: 'Year', weeks: WEEKS_IN_YEAR }
	];
	let rangeKey = $state('6m');
	const rangeWeeks = $derived(
		ranges.find((range) => range.key === rangeKey)?.weeks ?? WEEKS_IN_YEAR
	);
	const rangeData = $derived(year.slice(-rangeWeeks));

	const offsets: StreamgraphOffset[] = ['wiggle', 'silhouette', 'zero'];
	let offset = $state<StreamgraphOffset>('wiggle');
</script>

<Demo title="Streamgraph · Support tickets by topic" wide>
	<div class="stream-demo">
		<Streamgraph
			data={halfYear}
			series={topics}
			label="Support tickets by topic"
			unit="tickets"
			categoryLabel="Week"
		/>
	</div>
</Demo>

<Demo title="Streamgraph · Range switch" wide>
	<div class="stream-demo">
		<div class="controls" role="group" aria-label="Range">
			{#each ranges as range (range.key)}
				<Button
					size="sm"
					variant={rangeKey === range.key ? 'secondary' : 'ghost'}
					aria-pressed={rangeKey === range.key}
					onclick={() => (rangeKey = range.key)}>{range.label}</Button
				>
			{/each}
		</div>
		<Streamgraph
			data={rangeData}
			series={topics}
			label="Support tickets by topic"
			unit="tickets"
			categoryLabel="Week"
		/>
	</div>
</Demo>

<Demo title="Streamgraph · Offset" wide>
	<div class="stream-demo">
		<div class="controls" role="group" aria-label="Offset">
			{#each offsets as mode (mode)}
				<Button
					size="sm"
					variant={offset === mode ? 'secondary' : 'ghost'}
					aria-pressed={offset === mode}
					onclick={() => (offset = mode)}>{mode}</Button
				>
			{/each}
		</div>
		<Streamgraph
			data={halfYear}
			series={topics.slice(0, 4)}
			label="Support tickets by topic"
			unit="tickets"
			categoryLabel="Week"
			{offset}
			height={220}
		/>
	</div>
</Demo>

<style>
	.stream-demo {
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
