<script lang="ts">
	import {
		FilterToolbar,
		type AddFilterConfig,
		type FilterChip
	} from '$lib/components/arc/filter-toolbar';
	import Demo from '../../Demo.svelte';

	const fields: AddFilterConfig['fields'] = [
		{ id: 'status', label: 'Status', options: ['Active', 'Paused', 'Archived'] },
		{ id: 'owner', label: 'Owner', options: ['Maya Chen', 'Theo Park', 'Ines Duarte'] }
	];

	let filters = $state<FilterChip[]>([
		{ id: 'status', label: 'Status', value: 'Active' },
		{ id: 'owner', label: 'Owner', value: 'Maya Chen' }
	]);

	function addFilter(chip: FilterChip) {
		const index = filters.findIndex((entry) => entry.id === chip.id);
		filters =
			index === -1
				? [...filters, chip]
				: filters.map((entry) => (entry.id === chip.id ? chip : entry));
	}
</script>

<Demo title="Filter toolbar · add filter menu">
	<FilterToolbar
		{filters}
		onRemove={(id) => (filters = filters.filter((entry) => entry.id !== id))}
		onClearAll={() => (filters = [])}
		addFilter={{ fields, onAdd: addFilter }}
	/>
</Demo>

<Demo title="Filter toolbar · chips only">
	<FilterToolbar
		filters={[{ id: 'range', label: 'Last 7 days' }]}
		onRemove={() => {}}
		onClearAll={() => {}}
	/>
</Demo>
