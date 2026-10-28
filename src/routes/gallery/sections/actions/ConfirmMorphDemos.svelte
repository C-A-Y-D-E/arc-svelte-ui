<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { ConfirmMorph, type ConfirmMorphState } from '$lib/components/arc/confirm-morph';
	import Demo from '../../Demo.svelte';

	const WORK_DELAY_MS = 1100;

	let removeState = $state<ConfirmMorphState>('idle');
	let revokeAttempts = 0;

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	/** Fails on the first try so the demo shows the error face and Retry. */
	async function revokeKey() {
		revokeAttempts += 1;
		await wait(WORK_DELAY_MS);
		if (revokeAttempts % 2 === 1) throw new Error('Network error');
	}
</script>

{#snippet trashIcon()}<Trash2Icon size={15} />{/snippet}
{#snippet archiveIcon()}<ArchiveIcon size={15} />{/snippet}

<Demo title="Confirm morph · delete with undo">
	<div class="stack">
		<ConfirmMorph
			label="Delete report"
			icon={trashIcon}
			prompt="Delete Q3 report?"
			bind:state={removeState}
			onConfirm={() => wait(WORK_DELAY_MS)}
			onUndo={() => wait(WORK_DELAY_MS)}
		/>
		<output class="readout">{removeState}</output>
	</div>
</Demo>

<Demo title="Confirm morph · neutral">
	<ConfirmMorph
		label="Archive project"
		icon={archiveIcon}
		tone="neutral"
		confirmLabel="Archive"
		pendingLabel="Archiving"
		doneLabel="Archived"
		onConfirm={() => wait(WORK_DELAY_MS)}
	/>
</Demo>

<Demo title="Confirm morph · error and retry">
	<ConfirmMorph
		label="Revoke API key"
		confirmLabel="Revoke"
		pendingLabel="Revoking"
		doneLabel="Revoked"
		errorLabel="Couldn’t revoke"
		onConfirm={revokeKey}
	/>
</Demo>

<Demo title="Confirm morph · disabled">
	<ConfirmMorph label="Remove member" icon={trashIcon} disabled />
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-2);
	}
	.readout {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
