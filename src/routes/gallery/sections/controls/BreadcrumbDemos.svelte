<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Breadcrumb, type BreadcrumbItem } from '$lib/components/arc/breadcrumb';
	import Demo from '../../Demo.svelte';

	const ROOT = 'Workspace';
	const SUBFOLDERS = ['Marketing', 'Campaigns', 'Spring launch', 'Assets'];
	const LINK_TRAIL: BreadcrumbItem[] = [
		{ label: 'Settings', href: '#settings' },
		{ label: 'Team', href: '#team' },
		{ label: 'Roles' }
	];

	let path = $state<string[]>([ROOT, ...SUBFOLDERS.slice(0, 2)]);

	const nextFolder = $derived(SUBFOLDERS[path.length - 1]);
	const items = $derived<BreadcrumbItem[]>(
		path.map((label, index) => ({ label, onclick: () => (path = path.slice(0, index + 1)) }))
	);

	function openNext() {
		if (nextFolder) path = [...path, nextFolder];
	}
</script>

<Demo title="Breadcrumb · folder path">
	<div class="stack">
		<Breadcrumb {items} ariaLabel="Folder path" />
		<div class="row">
			<Button size="sm" variant="secondary" onclick={openNext} disabled={!nextFolder}>
				{nextFolder ? `Open ${nextFolder}` : 'Deepest folder'}
			</Button>
		</div>
		<p class="output">Current: {path.at(-1)}</p>
	</div>
</Demo>

<Demo title="Breadcrumb · links">
	<Breadcrumb items={LINK_TRAIL} />
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-4);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
