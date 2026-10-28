<script lang="ts">
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import { Button } from '$lib/components/arc/button';
	import { EmptyState } from '$lib/components/arc/empty-state';
	import Demo from '../../Demo.svelte';

	const ICON_SIZE = 24;
	const ICON_STROKE = 1.5;

	let filtered = $state(true);
</script>

<Demo title="Empty state · default icon">
	<EmptyState
		title="No projects yet"
		description="Create a project to start tracking work with your team."
	>
		{#snippet action()}<Button size="sm">New project</Button>{/snippet}
	</EmptyState>
</Demo>

<Demo title="Empty state · result swap">
	<EmptyState
		label="Invoices"
		title={filtered ? 'No matching invoices' : 'All invoices paid'}
		description={filtered
			? 'Nothing is overdue for Northwind.'
			: 'No client owes you anything this month.'}
	>
		{#snippet icon()}
			{#if filtered}
				<SearchXIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
			{:else}
				<InboxIcon size={ICON_SIZE} strokeWidth={ICON_STROKE} />
			{/if}
		{/snippet}
		{#snippet action()}
			<Button variant="secondary" size="sm" onclick={() => (filtered = !filtered)}>
				{filtered ? 'Clear filters' : 'Filter by client'}
			</Button>
		{/snippet}
	</EmptyState>
</Demo>
