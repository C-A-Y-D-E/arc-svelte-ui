<script lang="ts">
	import { Alert, type AlertTone } from '$lib/components/arc/alert';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';

	type AlertExample = { tone: AlertTone; title: string; description: string };

	const TONES: AlertExample[] = [
		{
			tone: 'info',
			title: 'Maintenance on Sunday',
			description: 'Billing is read-only from 02:00 to 03:00 UTC.'
		},
		{ tone: 'success', title: 'Invoice paid', description: 'INV-2041 was settled by Northwind.' },
		{
			tone: 'warning',
			title: 'Seat limit almost reached',
			description: '23 of 25 seats are in use.'
		},
		{ tone: 'danger', title: 'Deploy failed', description: 'The build step exited with code 1.' }
	];

	const DEPLOY_STAGES: AlertExample[] = [
		{ tone: 'info', title: 'Deploying to production', description: 'Building 14 pages.' },
		{ tone: 'success', title: 'Deploy finished', description: 'Live in 48 seconds.' },
		{
			tone: 'danger',
			title: 'Deploy rolled back',
			description: 'Health checks failed in 2 of 3 regions.'
		}
	];

	let reminderOpen = $state(true);
	let stageIndex = $state(0);
	const stage = $derived(DEPLOY_STAGES[stageIndex]);
</script>

<Demo title="Alert · tones" wide>
	<div class="stack">
		{#each TONES as example (example.tone)}
			<Alert tone={example.tone} title={example.title}>{example.description}</Alert>
		{/each}
	</div>
</Demo>

<Demo title="Alert · dismiss">
	<div class="stack">
		<Alert
			tone="warning"
			title="Card expires next month"
			open={reminderOpen}
			onDismiss={() => (reminderOpen = false)}
		>
			Update it to keep your plan active.
		</Alert>
		<div>
			<Button
				variant="secondary"
				size="sm"
				disabled={reminderOpen}
				onclick={() => (reminderOpen = true)}
			>
				Show again
			</Button>
		</div>
	</div>
</Demo>

<Demo title="Alert · tone and copy swap">
	<div class="stack">
		<Alert tone={stage.tone} title={stage.title}>{stage.description}</Alert>
		<div>
			<Button
				variant="secondary"
				size="sm"
				onclick={() => (stageIndex = (stageIndex + 1) % DEPLOY_STAGES.length)}
			>
				Next state
			</Button>
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 480px);
		gap: var(--arc-space-3);
	}
</style>
