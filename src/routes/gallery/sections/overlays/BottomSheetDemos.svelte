<script lang="ts">
	import { BottomSheet, BottomSheetClose } from '$lib/components/arc/bottom-sheet';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';

	const BOOKINGS = [
		'Flight TP 1351, Oct 12, 09:40',
		'Hotel Memmo Alfama, 3 nights',
		'Tram 28 day pass',
		'Dinner at Taberna, Oct 13',
		'Belém tower tickets, Oct 14',
		'Flight TP 1356, Oct 15, 18:05'
	];

	let filtersOpen = $state(false);
	let lastDetent = $state<number | null>(null);
</script>

<Demo title="Bottom sheet · trip details">
	<BottomSheet title="Lisbon, 3 nights" description="Oct 12 to Oct 15" detents={[0.4, 0.9]}>
		{#snippet trigger({ props })}
			<Button {...props}>Trip details</Button>
		{/snippet}
		<p>Flights, hotel, and bookings.</p>
		<ul class="bookings">
			{#each BOOKINGS as booking (booking)}
				<li>{booking}</li>
			{/each}
		</ul>
		<BottomSheetClose>
			{#snippet child({ props })}
				<Button variant="secondary" {...props}>Done</Button>
			{/snippet}
		</BottomSheetClose>
	</BottomSheet>
</Demo>

<Demo title="Bottom sheet · controlled with detent tracking">
	<Button variant="secondary" onclick={() => (filtersOpen = true)}>Filters</Button>
	<span class="status"
		>{filtersOpen ? 'Open' : 'Closed'}{lastDetent === null ? '' : `, detent ${lastDetent}`}</span
	>
	<BottomSheet
		bind:open={filtersOpen}
		title="Filters"
		detents={[0.5]}
		onDetentChange={(index) => (lastDetent = index)}
	>
		<p>Only one detent, so the sheet keeps a fixed height and drags down to dismiss.</p>
	</BottomSheet>
</Demo>

<style>
	.bookings {
		display: grid;
		gap: var(--arc-space-3);
		margin: var(--arc-space-4) 0 var(--arc-space-6);
		padding: 0;
		list-style: none;
	}
	.bookings li {
		padding: var(--arc-space-3) var(--arc-space-4);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
	}
	.status {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
	}
</style>
