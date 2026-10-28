<script lang="ts">
	import { SegmentedControl, type Segment } from '$lib/components/arc/segmented-control';
	import Demo from '../../Demo.svelte';

	const RANGES: Segment[] = [
		{ value: 'day', label: 'Day' },
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: 'year', label: 'Year' }
	];
	const INBOX: Segment[] = [
		{ value: 'all', label: 'All' },
		{ value: 'unread', label: 'Unread', accessory: unreadCount },
		{ value: 'archived', label: 'Archived', disabled: true }
	];

	let range = $state('week');
	let inbox = $state('all');
</script>

{#snippet unreadCount()}<span class="count">4</span>{/snippet}

<Demo title="Segmented control · date range">
	<div class="stack">
		<SegmentedControl label="Date range" options={RANGES} bind:value={range} />
		<p class="output">Range: {range}</p>
	</div>
</Demo>

<Demo title="Segmented control · fill, accessory, disabled option">
	<div class="stack">
		<SegmentedControl label="Inbox" options={INBOX} bind:value={inbox} fill />
		<p class="output">Showing: {inbox}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		justify-items: center;
		gap: var(--arc-space-3);
	}
	.stack > :global(:first-child) {
		max-width: 100%;
	}
	.count {
		margin-left: var(--arc-space-2);
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
