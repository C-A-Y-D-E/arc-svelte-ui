<script module lang="ts">
	export type BreadcrumbItem = {
		label: string;
		href?: string;
		/** Runs when the crumb is chosen. Without an href the crumb renders as a button, for paths that live in local state. */
		onclick?: (event: MouseEvent) => void;
	};
</script>

<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { flip } from 'svelte/animate';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';

	type Props = { items: BreadcrumbItem[]; ariaLabel?: string };

	let { items, ariaLabel = 'Breadcrumb' }: Props = $props();

	const { blur, duration } = motionTokens;
	const MS_PER_SECOND = 1000;
	/** Remaining crumbs glide on roughly the smooth spring's visual duration. */
	const LAYOUT_SECONDS = motionTokens.spring.smooth.visualDuration;
	const layoutDuration = $derived(isReducedMotion() ? 0 : LAYOUT_SECONDS * MS_PER_SECOND);
</script>

<!-- Crumbs present on first render stay still; crumbs added later slide in from the path before them. -->
<nav aria-label={ariaLabel}>
	<ol class="list">
		{#each items as item, index (`${item.label}-${index}`)}
			{@const current = index === items.length - 1}
			<li
				animate:flip={{ duration: layoutDuration, easing: ease.standard }}
				in:presence={{ x: -8, blur: blur.subtle, duration: duration.standard }}
				out:presence={{
					x: -4,
					blur: blur.subtle,
					duration: duration.instant,
					easing: ease.standard
				}}
			>
				{#if index > 0}<ChevronRightIcon size={14} aria-hidden="true" />{/if}
				{#if !current && item.href}
					<a href={item.href} data-label={item.label} onclick={item.onclick}>{item.label}</a>
				{:else if !current && item.onclick}
					<button type="button" data-label={item.label} onclick={item.onclick}>{item.label}</button>
				{:else}
					<span aria-current={current ? 'page' : undefined} data-label={item.label}
						>{item.label}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	/* The gap between crumbs matches the gap inside one, so every chevron sits centered between its two labels. */
	.list {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		white-space: nowrap;
	}
	.list li > :global(svg) {
		width: 16px;
		height: 16px;
		flex: 0 0 auto;
		color: var(--arc-border-strong);
		stroke-width: 1.75;
	}
	/* Each crumb reserves the width of its medium weight label, so becoming the current page never shifts the path. */
	.list a,
	.list li > span,
	.list li > button {
		display: inline-flex;
		flex-direction: column;
		border-radius: 7px;
		padding: 4px 2px;
	}
	.list a::after,
	.list li > span::after,
	.list li > button::after {
		height: 0;
		overflow: hidden;
		content: attr(data-label);
		font-weight: 500;
		visibility: hidden;
		user-select: none;
		pointer-events: none;
	}
	.list li > button {
		border: 0;
		margin: 0;
		background: none;
		font: inherit;
		line-height: inherit;
		text-align: start;
		cursor: pointer;
	}
	.list a,
	.list li > button {
		color: var(--arc-text-secondary);
		text-decoration: underline 1px;
		text-decoration-color: transparent;
		text-underline-offset: 4px;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			text-decoration-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.list a:focus-visible,
	.list li > button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.list [aria-current='page'] {
		color: var(--arc-highlight-strong);
		font-weight: 500;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.list a:hover,
		.list li > button:hover {
			color: var(--arc-highlight-strong);
			text-decoration-color: color-mix(in oklch, currentColor 45%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.list a,
		.list li > button,
		.list [aria-current='page'] {
			transition: none;
		}
	}
</style>
