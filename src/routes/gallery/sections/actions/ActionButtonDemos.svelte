<script lang="ts">
	import { ActionButton } from '$lib/components/arc/action-button';
	import Demo from '../../Demo.svelte';

	const PUBLISH_DELAY_MS = 1400;
	const SYNC_DELAY_MS = 1000;

	let syncError = $state('');

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function publishReport() {
		await wait(PUBLISH_DELAY_MS);
	}

	async function syncInvoices() {
		syncError = '';
		await wait(SYNC_DELAY_MS);
		throw new Error('Billing service timed out');
	}

	function showSyncError(error: unknown) {
		syncError = error instanceof Error ? error.message : 'Sync failed';
	}
</script>

<Demo title="Action button · pending and success">
	<ActionButton
		label="Publish report"
		pendingLabel="Publishing"
		successLabel="Published"
		onAction={publishReport}
	/>
</Demo>

<Demo title="Action button · failure">
	<div class="stack">
		<ActionButton
			label="Sync invoices"
			pendingLabel="Syncing"
			successLabel="Synced"
			onAction={syncInvoices}
			onActionError={showSyncError}
		/>
		{#if syncError}<p class="error" role="alert">{syncError}</p>{/if}
	</div>
</Demo>

<Demo title="Action button · disabled">
	<ActionButton label="Invite team" onAction={() => {}} disabled />
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-2);
	}
	.error {
		margin: 0;
		color: var(--arc-danger);
		font-size: var(--arc-text-xs);
	}
</style>
