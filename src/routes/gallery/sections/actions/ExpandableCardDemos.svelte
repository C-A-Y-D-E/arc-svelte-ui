<script lang="ts">
	import { ExpandableCard } from '$lib/components/arc/expandable-card';
	import Demo from '../../Demo.svelte';

	const DEPLOY_STEPS = [
		{ name: 'Install', time: '18s' },
		{ name: 'Build', time: '1m 42s' },
		{ name: 'Test', time: '2m 05s' },
		{ name: 'Upload', time: '9s' }
	];

	const INVOICE_LINES = [
		{ name: 'Team plan · 12 seats', amount: '$288.00' },
		{ name: 'Extra storage', amount: '$24.00' },
		{ name: 'Tax', amount: '$31.20' }
	];
</script>

<Demo title="Expandable card · grows wider when open">
	<ExpandableCard
		title="Deploy #1289"
		description="Production · 4 min ago"
		width={260}
		expandedWidth={360}
	>
		<dl class="rows">
			{#each DEPLOY_STEPS as step (step.name)}
				<div class="row">
					<dt>{step.name}</dt>
					<dd>{step.time}</dd>
				</div>
			{/each}
		</dl>
	</ExpandableCard>
</Demo>

<Demo title="Expandable card · open by default">
	<ExpandableCard title="Invoice INV-2041" description="Due Nov 12" width={320} defaultExpanded>
		<dl class="rows">
			{#each INVOICE_LINES as line (line.name)}
				<div class="row">
					<dt>{line.name}</dt>
					<dd>{line.amount}</dd>
				</div>
			{/each}
		</dl>
	</ExpandableCard>
</Demo>

<style>
	.rows {
		display: grid;
		gap: var(--arc-space-2);
		margin: 0;
		font-size: var(--arc-text-sm);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: var(--arc-space-4);
	}
	dt {
		color: var(--arc-text-muted);
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
</style>
