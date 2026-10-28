<script lang="ts">
	import { ResizablePanel, ResizablePanels } from '$lib/components/arc/resizable-panels';
	import Demo from '../../Demo.svelte';

	const folders = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam', 'Trash'];
	const messages = [
		{ from: 'Mara Ellis', subject: 'Launch checklist for Friday' },
		{ from: 'Devon Park', subject: 'Re: Treasury account rotation' },
		{ from: 'Ops bot', subject: 'Nightly settlement finished' },
		{ from: 'Ivy Chen', subject: 'Design review notes' },
		{ from: 'Sam Ortiz', subject: 'Fee tier proposal' }
	];
	const files = ['routes', 'components', 'motion.ts', 'foundation.css', 'README.md'];
	const sourceCode = 'export function settle(batch) {\n\treturn batch.filter(isConfirmed);\n}';

	let mailShares = $state<number[] | null>(null);
	const mailLayout = $derived(
		mailShares?.map((share) => `${Math.round(share)}%`).join(' / ') ?? 'default'
	);
</script>

<Demo title="Resizable panels · mail layout" wide>
	<div class="frame">
		<ResizablePanels label="Mail" onLayoutChange={(sizes) => (mailShares = sizes)}>
			<ResizablePanel id="demo-folders" label="Folders" defaultSize={22} minSize={160} collapsible>
				<ul class="list">
					{#each folders as folder (folder)}
						<li class="row">{folder}</li>
					{/each}
				</ul>
			</ResizablePanel>
			<ResizablePanel id="demo-messages" label="Messages" defaultSize={78}>
				<ul class="list">
					{#each messages as message (message.subject)}
						<li class="row message">
							<span class="from">{message.from}</span>
							<span class="subject">{message.subject}</span>
						</li>
					{/each}
				</ul>
			</ResizablePanel>
		</ResizablePanels>
	</div>
	<p class="caption" data-testid="mail-layout">Layout: {mailLayout}</p>
</Demo>

<Demo title="Resizable panels · three panes, collapsed preview" wide>
	<div class="frame">
		<ResizablePanels label="Editor">
			<ResizablePanel
				id="demo-explorer"
				label="Explorer"
				defaultSize={20}
				minSize={140}
				collapsible
			>
				<ul class="list">
					{#each files as file (file)}
						<li class="row">{file}</li>
					{/each}
				</ul>
			</ResizablePanel>
			<ResizablePanel id="demo-editor" label="Editor" defaultSize={50} minSize={200}>
				<pre class="code">{sourceCode}</pre>
			</ResizablePanel>
			<ResizablePanel
				id="demo-preview"
				label="Preview"
				defaultSize={30}
				minSize={160}
				maxSize={420}
				collapsible
				defaultCollapsed
			>
				<p class="note">
					Preview renders here. Drag the divider on the right, or focus it and press Enter.
				</p>
			</ResizablePanel>
		</ResizablePanels>
	</div>
</Demo>

<style>
	.frame {
		width: 100%;
		height: 320px;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-background);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: var(--arc-space-1);
		padding: var(--arc-space-3);
		list-style: none;
	}
	.row {
		overflow: hidden;
		padding: var(--arc-space-2) var(--arc-space-3);
		border-radius: var(--arc-radius-control);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.message {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.from {
		color: var(--arc-foreground);
		font-weight: 500;
	}
	.subject {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.code {
		padding: var(--arc-space-4);
		color: var(--arc-text-secondary);
		font-family: ui-monospace, monospace;
		font-size: var(--arc-text-xs);
		white-space: pre;
	}
	.note {
		padding: var(--arc-space-4);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
	}
	.caption {
		width: 100%;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		text-align: center;
	}
</style>
