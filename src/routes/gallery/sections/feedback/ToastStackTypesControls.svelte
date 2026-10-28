<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { useToastStack, type ToastOptions } from '$lib/components/arc/toast-stack';

	const stack = useToastStack();

	const examples: ToastOptions[] = [
		{ type: 'success', title: 'Changes saved', description: 'Your profile is up to date.' },
		{
			type: 'info',
			title: 'New version available',
			description: 'Reload to get the latest build.'
		},
		{ type: 'warning', title: 'Storage almost full', description: '92% of your plan is in use.' },
		{ type: 'error', title: 'Upload failed', description: 'The file is larger than 25 MB.' }
	];
</script>

<div class="controls">
	{#each examples as example (example.type)}
		<Button variant="secondary" size="sm" onclick={() => stack.toast(example)}
			>{example.type}</Button
		>
	{/each}
	<Button variant="ghost" size="sm" disabled={stack.count === 0} onclick={() => stack.dismiss()}>
		Dismiss all ({stack.count})
	</Button>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--arc-space-2);
		padding-top: var(--arc-space-2);
		text-transform: capitalize;
	}
</style>
