<script lang="ts">
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/arc/tabs';
	import Demo from '../../Demo.svelte';

	const SETTINGS_TABS = [
		{ value: 'general', label: 'General', body: 'Workspace name, logo and default language.' },
		{ value: 'members', label: 'Members', body: '8 members and 2 pending invites.' },
		{ value: 'billing', label: 'Billing', body: 'Team plan, renews on 1 December.' }
	];
	const PROJECT_TABS = [
		{ value: 'overview', label: 'Overview', body: 'Open tasks, recent activity and owners.' },
		{ value: 'tasks', label: 'Tasks', body: '12 open, 5 in review, 31 done.' },
		{ value: 'files', label: 'Files', body: '24 files, 1.2 GB used.' },
		{ value: 'insights', label: 'Insights', body: '', disabled: true }
	];

	let settingsTab = $state('general');
	let projectTab = $state('overview');
</script>

<Demo title="Tabs · pill">
	<div class="stack">
		<Tabs bind:value={settingsTab}>
			<TabsList aria-label="Settings">
				{#each SETTINGS_TABS as tab (tab.value)}
					<TabsTrigger value={tab.value}>{tab.label}</TabsTrigger>
				{/each}
			</TabsList>
			{#each SETTINGS_TABS as tab (tab.value)}
				<TabsContent value={tab.value}><p class="panel">{tab.body}</p></TabsContent>
			{/each}
		</Tabs>
		<p class="output">Tab: {settingsTab}</p>
	</div>
</Demo>

<Demo title="Tabs · line, disabled tab">
	<div class="stack">
		<Tabs bind:value={projectTab}>
			<TabsList variant="line" aria-label="Project">
				{#each PROJECT_TABS as tab (tab.value)}
					<TabsTrigger value={tab.value} disabled={tab.disabled}>{tab.label}</TabsTrigger>
				{/each}
			</TabsList>
			{#each PROJECT_TABS as tab (tab.value)}
				<TabsContent value={tab.value}><p class="panel">{tab.body}</p></TabsContent>
			{/each}
		</Tabs>
		<p class="output">Tab: {projectTab}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 24rem;
		gap: var(--arc-space-3);
	}
	.panel {
		padding: var(--arc-space-4) var(--arc-space-1);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
