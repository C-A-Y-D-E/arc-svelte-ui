<script lang="ts">
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ArrowDownUpIcon from '@lucide/svelte/icons/arrow-down-up';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { DropdownMenu, type DropdownItem } from '$lib/components/arc/dropdown-menu';
	import Demo from '../../Demo.svelte';

	const SORT_ORDERS = ['Newest', 'Oldest', 'Amount', 'Due date'];

	let lastAction = $state('None');
	let sortOrder = $state(SORT_ORDERS[0]);

	const record = (action: string) => () => (lastAction = action);

	const invoiceItems: DropdownItem[] = [
		{ label: 'Edit', icon: pencilIcon, onSelect: record('Edit') },
		{ label: 'Duplicate', icon: copyIcon, onSelect: record('Duplicate') },
		{ label: 'Share', icon: shareIcon, onSelect: record('Share') },
		{ label: 'Archive', icon: archiveIcon, disabled: true },
		{
			label: 'Delete',
			icon: trashIcon,
			destructive: true,
			separatorBefore: true,
			onSelect: record('Delete')
		}
	];

	const sortItems: DropdownItem[] = $derived(
		SORT_ORDERS.map((order) => ({ label: order, onSelect: () => (sortOrder = order) }))
	);

	const memberItems: DropdownItem[] = [
		{ label: 'Invite member', icon: userPlusIcon, onSelect: record('Invite member') },
		{ label: 'Copy invite link', icon: copyIcon, onSelect: record('Copy invite link') },
		{
			label: 'Remove from team',
			icon: trashIcon,
			destructive: true,
			separatorBefore: true,
			onSelect: record('Remove from team')
		}
	];
</script>

{#snippet pencilIcon()}<PencilIcon size={15} />{/snippet}
{#snippet copyIcon()}<CopyIcon size={15} />{/snippet}
{#snippet shareIcon()}<Share2Icon size={15} />{/snippet}
{#snippet archiveIcon()}<ArchiveIcon size={15} />{/snippet}
{#snippet trashIcon()}<Trash2Icon size={15} />{/snippet}
{#snippet userPlusIcon()}<UserPlusIcon size={15} />{/snippet}
{#snippet sortIcon()}<ArrowDownUpIcon size={15} />{/snippet}
{#snippet moreIcon()}<EllipsisIcon size={15} />{/snippet}

<Demo title="Dropdown menu · icons, separator, disabled">
	<div class="stack">
		<DropdownMenu label="Invoice" items={invoiceItems} align="start" />
		<output class="readout">Last: {lastAction}</output>
	</div>
</Demo>

<Demo title="Dropdown menu · label follows the choice">
	<DropdownMenu label={sortOrder} icon={sortIcon} items={sortItems} />
</Demo>

<Demo title="Dropdown menu · icon only">
	<DropdownMenu label="Team actions" icon={moreIcon} hideLabel items={memberItems} />
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
