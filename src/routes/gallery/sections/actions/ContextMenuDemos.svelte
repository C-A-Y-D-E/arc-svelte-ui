<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PinIcon from '@lucide/svelte/icons/pin';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { ContextMenu, type ContextMenuItem } from '$lib/components/arc/context-menu';
	import Demo from '../../Demo.svelte';

	let pinned = $state(false);
	let starred = $state(true);
	let trashed = $state(false);
	let downloads = $state(0);

	const fileItems: ContextMenuItem[] = $derived(
		trashed
			? [{ id: 'restore', label: 'Restore', icon: restoreIcon, onSelect: () => (trashed = false) }]
			: [
					{
						id: 'download',
						label: 'Download',
						icon: downloadIcon,
						onSelect: () => (downloads += 1)
					},
					{
						id: 'pin',
						label: pinned ? 'Unpin' : 'Pin to top',
						icon: pinIcon,
						onSelect: () => (pinned = !pinned)
					},
					{ id: 'star', label: 'Starred', checked: starred, onSelect: () => (starred = !starred) },
					{ id: 'share', label: 'Share link', disabled: true },
					{
						id: 'trash',
						label: 'Move to trash',
						icon: trashIcon,
						destructive: true,
						onSelect: () => (trashed = true)
					}
				]
	);
</script>

{#snippet downloadIcon()}<DownloadIcon size={15} />{/snippet}
{#snippet pinIcon()}<PinIcon size={15} />{/snippet}
{#snippet trashIcon()}<Trash2Icon size={15} />{/snippet}
{#snippet restoreIcon()}<RotateCcwIcon size={15} />{/snippet}

<Demo title="Context menu · right-click a file" wide>
	<ContextMenu label="File actions" items={fileItems}>
		<div class="file" data-trashed={trashed || undefined}>
			<FileTextIcon size={20} aria-hidden="true" />
			<span class="name">Invoice-1042.pdf</span>
			{#if pinned}<PinIcon size={14} aria-label="Pinned" />{/if}
			<span class="meta">{trashed ? 'In trash' : `${downloads} downloads`}</span>
		</div>
	</ContextMenu>
</Demo>

<style>
	.file {
		display: flex;
		width: 28rem;
		max-width: 100%;
		align-items: center;
		gap: var(--arc-space-3);
		padding: var(--arc-space-4) var(--arc-space-5);
		border: 1px dashed var(--arc-border);
		border-radius: var(--arc-radius-control);
		color: var(--arc-foreground);
		cursor: context-menu;
		user-select: none;
	}
	.file[data-trashed] {
		color: var(--arc-text-muted);
	}
	.file[data-trashed] .name {
		text-decoration: line-through;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
