<script lang="ts">
	import { TreeView, type TreeNode } from '$lib/components/arc/tree-view';
	import Demo from '../../Demo.svelte';

	const FILES: TreeNode[] = [
		{
			id: 'app',
			label: 'app',
			children: [
				{ id: 'page', label: 'page.tsx' },
				{ id: 'layout', label: 'layout.tsx' },
				{ id: 'globals', label: 'globals.css' },
				{
					id: 'settings',
					label: 'settings',
					children: [
						{ id: 'settings-page', label: 'page.tsx' },
						{ id: 'settings-form', label: 'settings-form.tsx' }
					]
				}
			]
		},
		{
			id: 'components',
			label: 'components',
			children: [
				{ id: 'button', label: 'button.tsx' },
				{ id: 'dialog', label: 'dialog.tsx' },
				{ id: 'tree-view', label: 'tree-view.tsx' },
				{ id: 'tokens', label: 'tokens.json' }
			]
		},
		{ id: 'package', label: 'package.json' },
		{ id: 'readme', label: 'README.md' }
	];

	let expandedIds = $state(['app']);
	let selected = $state('Nothing selected');
</script>

<Demo title="Tree view · files">
	<div class="stack">
		<TreeView
			nodes={FILES}
			bind:expandedIds
			onSelect={(node) => (selected = node.label)}
			aria-label="Project files"
		/>
		<p class="note">{selected} · {expandedIds.length} open</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 20rem);
		gap: var(--arc-space-3);
	}
	.note {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
