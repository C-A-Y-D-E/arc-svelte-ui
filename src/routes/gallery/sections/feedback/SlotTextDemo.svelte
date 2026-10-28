<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { SlotText } from '$lib/components/arc/slot-text';
	import Demo from '../../Demo.svelte';

	const STARTING_REVENUE = 12480;
	const SALE = 1250;
	const REFUND = 980;
	const formatDollars = (value: number) => `$${value.toLocaleString('en-US')}`;
	let revenue = $state(STARTING_REVENUE);

	let live = $state(false);

	const COUNTDOWN_START = 998;
	let counter = $state(COUNTDOWN_START);
</script>

<Demo title="Slot text · price">
	<div class="stack">
		<span class="figure"><SlotText value={revenue} format={formatDollars} announce /></span>
		<div class="controls">
			<Button variant="secondary" size="sm" onclick={() => (revenue += SALE)}
				>+ ${SALE.toLocaleString('en-US')}</Button
			>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => (revenue = Math.max(0, revenue - REFUND))}
			>
				− ${REFUND}
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (revenue = STARTING_REVENUE)}>Reset</Button>
		</div>
	</div>
</Demo>

<Demo title="Slot text · status">
	<div class="stack">
		<span class="status"><SlotText value={live ? 'Live now' : 'Soon'} spins={2} /></span>
		<div class="controls">
			<Button variant="secondary" size="sm" onclick={() => (live = !live)}>
				{live ? 'Mark as soon' : 'Go live'}
			</Button>
		</div>
	</div>
</Demo>

<Demo title="Slot text · growing number">
	<div class="stack">
		<span class="figure"><SlotText value={counter} spins={0} /></span>
		<div class="controls">
			<Button variant="secondary" size="sm" onclick={() => counter--}>− 1</Button>
			<Button variant="secondary" size="sm" onclick={() => counter++}>+ 1</Button>
			<Button variant="ghost" size="sm" onclick={() => (counter = COUNTDOWN_START)}>Reset</Button>
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-5);
	}
	.figure {
		color: var(--arc-foreground);
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-4xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
	}
	.status {
		color: var(--arc-foreground);
		font-size: var(--arc-text-2xl);
		font-weight: 500;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--arc-space-2);
	}
</style>
