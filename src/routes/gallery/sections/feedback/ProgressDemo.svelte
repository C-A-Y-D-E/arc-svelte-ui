<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Progress } from '$lib/components/arc/progress';
	import Demo from '../../Demo.svelte';

	const UPLOAD_STEP = 25;
	const FILES_TOTAL = 8;

	let uploaded = $state(0);
	let filesSynced = $state(3);
</script>

<Demo title="Progress · values">
	<div class="stack">
		<Progress value={0} label="Queued" showValue />
		<Progress value={64} label="Importing contacts" showValue />
		<Progress value={100} label="Backup complete" showValue />
		<Progress value={40} />
	</div>
</Demo>

<Demo title="Progress · upload">
	<div class="stack">
		<Progress
			value={uploaded}
			label={uploaded >= 100 ? 'Upload complete' : 'Uploading report.pdf'}
			showValue
		/>
		<div class="controls">
			<Button
				variant="secondary"
				size="sm"
				disabled={uploaded >= 100}
				onclick={() => (uploaded += UPLOAD_STEP)}
			>
				Add {UPLOAD_STEP}%
			</Button>
			<Button variant="ghost" size="sm" disabled={uploaded === 0} onclick={() => (uploaded = 0)}
				>Reset</Button
			>
		</div>
	</div>
</Demo>

<Demo title="Progress · custom max">
	<div class="stack">
		<Progress
			value={filesSynced}
			max={FILES_TOTAL}
			label="{filesSynced} of {FILES_TOTAL} files synced"
			showValue
		/>
		<div class="controls">
			<Button
				variant="secondary"
				size="sm"
				disabled={filesSynced >= FILES_TOTAL}
				onclick={() => (filesSynced += 1)}
			>
				Sync one
			</Button>
			<Button variant="ghost" size="sm" onclick={() => (filesSynced = 0)}>Reset</Button>
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 420px);
		gap: var(--arc-space-5);
	}
	.controls {
		display: flex;
		gap: var(--arc-space-2);
	}
</style>
