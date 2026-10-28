<script lang="ts">
	import { page } from '$app/state';
	import { CopyButton } from '$lib/components/arc/copy-button';

	const components = Object.keys(import.meta.glob('$lib/components/arc/*/index.ts'))
		.map((path) => path.split('/').at(-2) ?? '')
		.sort();

	const installOf = (name: string) =>
		`npx shadcn-svelte@latest add ${page.url.origin}/r/${name}.json`;
</script>

<svelte:head><title>Arc for Svelte</title></svelte:head>

<main class="page">
	<h1>Arc for Svelte</h1>
	<p class="lead">
		{components.length} components from <a href="https://uiarc.dev">Arc</a>, ported to Svelte 5.
		Unofficial.
	</p>

	<ol class="steps">
		<li>
			<span>Add the shared foundation, theme and motion helpers once:</span>
			<code>{installOf('core')}</code>
			<CopyButton value={installOf('core')} />
		</li>
		<li>
			<span>Import the CSS in your root stylesheet:</span>
			<code
				>@import '$lib/components/arc/theme.css'; @import '$lib/components/arc/foundation.css';</code
			>
		</li>
		<li>
			<span>Add any component:</span>
			<code>{installOf('button')}</code>
			<CopyButton value={installOf('button')} />
		</li>
	</ol>

	<ul class="components">
		{#each components as name (name)}
			<li>
				<span class="name">{name}</span>
				<CopyButton value={installOf(name)} />
			</li>
		{/each}
	</ul>
</main>

<style>
	.page {
		max-width: 64rem;
		margin: 0 auto;
		padding: var(--arc-space-10) var(--arc-space-6);
	}
	h1 {
		margin: 0;
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		letter-spacing: var(--arc-tracking-display);
	}
	.lead {
		color: var(--arc-text-secondary);
	}
	.steps {
		display: grid;
		gap: var(--arc-space-3);
		margin: var(--arc-space-8) 0;
		padding-left: var(--arc-space-5);
	}
	.steps li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--arc-space-2);
	}
	code {
		padding: var(--arc-space-1) var(--arc-space-2);
		border: 1px solid var(--arc-border-subtle);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface-muted);
		font-size: var(--arc-text-sm);
		overflow-wrap: anywhere;
	}
	.components {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--arc-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.components li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--arc-space-2) var(--arc-space-3);
		border: 1px solid var(--arc-border-subtle);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
	}
	.name {
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
</style>
