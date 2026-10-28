<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Badge, type BadgeTone } from '$lib/components/arc/badge';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';

	const ICON_SIZE = 12;
	const TONES: { tone: BadgeTone; label: string }[] = [
		{ tone: 'neutral', label: 'Draft' },
		{ tone: 'info', label: 'In review' },
		{ tone: 'success', label: 'Paid' },
		{ tone: 'warning', label: 'Due soon' },
		{ tone: 'danger', label: 'Overdue' }
	];
	const REVIEW_FLOW = [
		{ tone: 'neutral', label: 'Draft', icon: PencilIcon },
		{ tone: 'info', label: 'Waiting for review', icon: ClockIcon },
		{ tone: 'success', label: 'Published', icon: CheckIcon }
	] as const;

	let flowIndex = $state(0);
	const flow = $derived(REVIEW_FLOW[flowIndex]);
</script>

<Demo title="Badge · tones">
	{#each TONES as { tone, label } (tone)}
		<Badge {tone}>{label}</Badge>
	{/each}
</Demo>

<Demo title="Badge · sizes and icons">
	<div class="rows">
		{#each ['sm', 'md'] as const as size (size)}
			<div class="row">
				<Badge {size}>Beta</Badge>
				<Badge {size} tone="success">
					{#snippet icon()}<CheckIcon size={ICON_SIZE} />{/snippet}
					Deployed
				</Badge>
				<Badge {size} tone="warning">
					{#snippet icon()}<ClockIcon size={ICON_SIZE} />{/snippet}
					Trial ends in 3 days
				</Badge>
			</div>
		{/each}
	</div>
</Demo>

<Demo title="Badge · status swap">
	<div class="rows">
		<Badge tone={flow.tone}>
			{#snippet icon()}<flow.icon size={ICON_SIZE} />{/snippet}
			{flow.label}
		</Badge>
		<Button
			variant="secondary"
			size="sm"
			onclick={() => (flowIndex = (flowIndex + 1) % REVIEW_FLOW.length)}
		>
			Next status
		</Button>
	</div>
</Demo>

<style>
	.rows {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-4);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
	}
</style>
