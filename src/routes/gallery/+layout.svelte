<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head><title>Gallery · Arc for Svelte</title></svelte:head>

<main class="page">
	<header class="page-header">
		<h1>Gallery</h1>
	</header>
	<div class="grid">{@render children()}</div>
</main>

<style>
	.page {
		min-height: 100vh;
		padding: var(--arc-space-6);
		background: var(--arc-background);
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--arc-space-6);
	}
	h1 {
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-2xl);
		font-weight: 600;
		letter-spacing: var(--arc-tracking-display);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
		gap: var(--arc-space-4);
	}
</style>
