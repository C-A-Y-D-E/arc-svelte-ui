<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { useToastStack } from '$lib/components/arc/toast-stack';

	const PUBLISH_DELAY_MS = 1600;

	const { toast, update } = useToastStack();

	function publish() {
		const id = toast({ type: 'loading', title: 'Publishing', description: 'Uploading 12 pages.' });
		setTimeout(() => {
			update(id, {
				type: 'success',
				title: 'Published',
				description: 'Your site is live.',
				action: { label: 'View', onClick: () => {} }
			});
		}, PUBLISH_DELAY_MS);
	}

	function archive() {
		toast({
			type: 'info',
			title: 'Message archived',
			action: {
				label: 'Undo',
				onClick: (id) =>
					update(id, { type: 'success', title: 'Message restored', action: undefined })
			}
		});
	}
</script>

<div class="controls">
	<Button size="sm" onclick={publish}>Publish</Button>
	<Button variant="secondary" size="sm" onclick={archive}>Archive message</Button>
</div>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--arc-space-2);
		padding-top: var(--arc-space-2);
	}
</style>
