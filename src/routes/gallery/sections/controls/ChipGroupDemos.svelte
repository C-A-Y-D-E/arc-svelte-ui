<script lang="ts">
	import { ChipGroup, type Chip } from '$lib/components/arc/chip-group';
	import Demo from '../../Demo.svelte';

	const STATUS_FILTERS: Chip[] = [
		{ value: 'all', label: 'All', count: 48 },
		{ value: 'open', label: 'Open', count: 12 },
		{ value: 'in-review', label: 'In review', count: 5 },
		{ value: 'done', label: 'Done', count: 31 }
	];

	let status = $state('open');
	const shown = $derived(STATUS_FILTERS.find((chip) => chip.value === status));
</script>

<Demo title="Chip group · status filter">
	<div class="stack">
		<ChipGroup label="Filter by status" chips={STATUS_FILTERS} bind:value={status} />
		<p class="output">Showing {shown?.count ?? 0} {shown?.label.toLowerCase()} tasks</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-3);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
