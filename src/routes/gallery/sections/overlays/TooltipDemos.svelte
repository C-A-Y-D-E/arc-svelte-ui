<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/arc/button';
	import { Tooltip } from '$lib/components/arc/tooltip';
	import Demo from '../../Demo.svelte';

	const COPIED_RESET_MS = 1600;
	const TOOLBAR = [
		{ label: 'Edit', icon: PencilIcon },
		{ label: 'Archive', icon: ArchiveIcon },
		{ label: 'Delete', icon: TrashIcon }
	];

	let copied = $state(false);

	function copy() {
		copied = true;
		setTimeout(() => (copied = false), COPIED_RESET_MS);
	}
</script>

<Demo title="Tooltip · toolbar, warm skip between neighbours">
	{#each TOOLBAR as action (action.label)}
		<Tooltip content={action.label}>
			{#snippet children({ props })}
				<Button variant="secondary" size="sm" aria-label={action.label} {...props}>
					<action.icon size={16} />
				</Button>
			{/snippet}
		</Tooltip>
	{/each}
</Demo>

<Demo title="Tooltip · text that changes while open">
	<Tooltip content={copied ? 'Copied to clipboard' : 'Copy link'} side="bottom">
		{#snippet children({ props })}
			<Button variant="secondary" aria-label="Copy link" {...props} onclick={copy}>
				<CopyIcon size={16} /> Copy
			</Button>
		{/snippet}
	</Tooltip>
</Demo>
