<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		wide = false,
		children
	}: { title: string; wide?: boolean; children: Snippet } = $props();
</script>

<section class={['demo', wide && 'wide']} data-demo={title}>
	<h3 class="demo-title">{title}</h3>
	<div class="demo-stage">{@render children()}</div>
</section>

<style>
	.demo {
		display: flex;
		min-width: 0;
		flex-direction: column;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface);
	}
	.wide {
		grid-column: 1 / -1;
	}
	.demo-title {
		padding: var(--arc-space-3) var(--arc-space-5);
		border-bottom: 1px solid var(--arc-border-subtle);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-weight: 500;
	}
	.demo-stage {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-3);
		padding: var(--arc-space-8) var(--arc-space-5);
	}
</style>
