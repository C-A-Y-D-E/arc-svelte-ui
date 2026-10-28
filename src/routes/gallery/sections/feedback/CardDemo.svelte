<script lang="ts">
	import { Avatar } from '$lib/components/arc/avatar';
	import { Badge } from '$lib/components/arc/badge';
	import { Button } from '$lib/components/arc/button';
	import { Card } from '$lib/components/arc/card';
	import Demo from '../../Demo.svelte';
	import { PORTRAITS } from './portraits';

	const SYNC_STATUSES = ['Updated 2 hours ago', 'Syncing changes', 'Updated just now'];

	let statusIndex = $state(0);
</script>

{#snippet cover(tint: string)}
	<svg class="cover" viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<rect width="320" height="120" fill={tint} />
		<rect x="24" y="24" width="120" height="72" rx="8" fill="white" fill-opacity="0.7" />
		<rect x="160" y="24" width="136" height="32" rx="8" fill="white" fill-opacity="0.5" />
		<rect x="160" y="64" width="96" height="32" rx="8" fill="white" fill-opacity="0.5" />
	</svg>
{/snippet}

<Demo title="Card · basic">
	<div class="slot">
		<Card
			title="Quarterly report"
			description="Revenue, churn and seat growth for Q3, ready for the board."
		/>
	</div>
</Demo>

<Demo title="Card · media, owner and live status">
	<div class="slot">
		<Card
			title="Website redesign"
			description="New marketing site with the refreshed brand and pricing page."
			meta="Maya Ortiz"
			status={SYNC_STATUSES[statusIndex]}
		>
			{#snippet media()}{@render cover('#c7d7f5')}{/snippet}
			{#snippet avatar()}<Avatar name="Maya Ortiz" src={PORTRAITS.maya} size="sm" />{/snippet}
			{#snippet action()}
				<Button
					variant="secondary"
					size="sm"
					onclick={() => (statusIndex = (statusIndex + 1) % SYNC_STATUSES.length)}
				>
					Sync
				</Button>
			{/snippet}
		</Card>
	</div>
</Demo>

<Demo title="Card · quick look">
	<div class="slot">
		<Card
			title="Billing migration"
			description="Move every workspace to the new invoice engine before renewal."
			meta="Jonas Weber"
			status="Due Friday"
		>
			{#snippet media()}{@render cover('#d5ecd4')}{/snippet}
			{#snippet avatar()}<Avatar name="Jonas Weber" src={PORTRAITS.jonas} size="sm" />{/snippet}
			{#snippet details()}
				<ul class="checklist">
					<li><Badge tone="success" size="sm">Done</Badge> Export open invoices</li>
					<li><Badge tone="info" size="sm">In progress</Badge> Map tax rules</li>
					<li><Badge size="sm">Next</Badge> Notify account owners</li>
				</ul>
			{/snippet}
		</Card>
	</div>
</Demo>

<style>
	.slot {
		width: min(100%, 320px);
	}
	.cover {
		display: block;
		width: 100%;
		height: 120px;
	}
	.checklist {
		display: grid;
		gap: var(--arc-space-3);
		margin: var(--arc-space-4) 0 0;
		padding: 0;
		list-style: none;
		font-size: var(--arc-text-sm);
	}
	.checklist li {
		display: flex;
		align-items: center;
		gap: var(--arc-space-2);
	}
</style>
