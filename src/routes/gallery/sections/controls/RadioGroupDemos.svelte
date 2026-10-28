<script lang="ts">
	import { RadioGroup, type RadioGroupOption } from '$lib/components/arc/radio-group';
	import Demo from '../../Demo.svelte';

	const ROLES: RadioGroupOption[] = [
		{ value: 'viewer', label: 'Viewer', description: 'Can view and comment.' },
		{ value: 'editor', label: 'Editor', description: 'Can edit projects and invite guests.' },
		{ value: 'admin', label: 'Admin', description: 'Full access, including billing.' }
	];
	const FREQUENCIES: RadioGroupOption[] = [
		{ value: 'instant', label: 'Instantly' },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' }
	];

	let role = $state('editor');
</script>

<Demo title="Radio group · team role">
	<div class="stack">
		<RadioGroup label="Role" options={ROLES} bind:value={role} />
		<p class="output">Role: {role}</p>
	</div>
</Demo>

<Demo title="Radio group · disabled">
	<div class="stack">
		<RadioGroup label="Email frequency" options={FREQUENCIES} value="daily" disabled />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-3);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
