<script lang="ts">
	import { Switch } from '$lib/components/arc/switch';
	import Demo from '../../Demo.svelte';

	let settings = $state({ mentions: true, comments: false, weeklySummary: true });

	const enabled = $derived(
		[
			settings.mentions && 'mentions',
			settings.comments && 'comments',
			settings.weeklySummary && 'weekly summary'
		].filter(Boolean)
	);
</script>

<Demo title="Switch · notification settings">
	<div class="stack">
		<Switch label="Mentions" bind:checked={settings.mentions} />
		<Switch label="Comments" bind:checked={settings.comments} />
		<Switch label="Weekly summary" bind:checked={settings.weeklySummary} />
		<p class="output">On: {enabled.length ? enabled.join(', ') : 'nothing'}</p>
	</div>
</Demo>

<Demo title="Switch · disabled">
	<div class="stack">
		<Switch label="Single sign-on (Enterprise)" defaultChecked disabled />
		<Switch label="Audit log export" disabled />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: start;
		gap: var(--arc-space-4);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
