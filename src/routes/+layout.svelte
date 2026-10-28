<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/arc/button';
	import '../app.css';

	let { children }: { children: Snippet } = $props();

	const STORAGE_KEY = 'arc-svelte-mode';
	const PAGES = [
		{ href: '/', label: 'Components' },
		{ href: '/gallery', label: 'Buttons' },
		{ href: '/gallery/actions', label: 'Actions' },
		{ href: '/gallery/controls', label: 'Controls' },
		{ href: '/gallery/fields', label: 'Fields' },
		{ href: '/gallery/pickers', label: 'Pickers' },
		{ href: '/gallery/data', label: 'Data' },
		{ href: '/gallery/charts', label: 'Charts' },
		{ href: '/gallery/charts-more', label: 'More charts' },
		{ href: '/gallery/feedback', label: 'Feedback' },
		{ href: '/gallery/editors', label: 'Editors' },
		{ href: '/gallery/overlays', label: 'Overlays' },
		{ href: '/gallery/interactive', label: 'Interactive' }
	];

	let dark = $state(true);

	// Follows the class on <html>, which the theme switch demos change too.
	$effect(() => {
		const root = document.documentElement;
		const read = () => (dark = root.classList.contains('dark'));
		read();
		const observer = new MutationObserver(read);
		observer.observe(root, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	function toggleMode() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
	}
</script>

<header class="site-header">
	<a class="brand" href="/">Arc for Svelte</a>
	<nav aria-label="Pages">
		{#each PAGES as link (link.href)}
			<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}
				>{link.label}</a
			>
		{/each}
	</nav>
	<Button variant="secondary" size="sm" onclick={toggleMode}>{dark ? 'Light' : 'Dark'}</Button>
</header>

{@render children()}

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--arc-space-4);
		padding: var(--arc-space-3) var(--arc-space-6);
		border-bottom: 1px solid var(--arc-border-subtle);
		background: color-mix(in oklch, var(--arc-background) 88%, transparent);
		backdrop-filter: blur(12px);
	}
	.brand {
		font-family: var(--arc-font-display);
		font-weight: 600;
		text-decoration: none;
	}
	nav {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: var(--arc-space-3);
		font-size: var(--arc-text-sm);
	}
	nav a {
		color: var(--arc-text-muted);
		text-decoration: none;
	}
	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--arc-foreground);
	}
</style>
