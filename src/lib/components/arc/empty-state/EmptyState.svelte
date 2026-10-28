<script lang="ts">
	import type { Snippet } from 'svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import { sizeMorph, swapOnChange } from '../alert/swap';

	type Props = {
		title: string;
		description: string;
		action?: Snippet;
		icon?: Snippet;
		class?: string;
		/** Optional accessible label for the state region. */
		label?: string;
	};

	let { title, description, action, icon, class: className, label }: Props = $props();

	const DEFAULT_ICON_SIZE = 24;
</script>

<!-- The result of an action morphs in place: the icon crossfades and the copy rises in while the old copy leaves. -->
<section class={['root', className]} aria-label={label}>
	<div class="icon" aria-hidden="true">
		<span class="glyph" {@attach swapOnChange({ kind: 'icon' })}>
			{#if icon}
				{@render icon()}
			{:else}
				<FolderIcon width={DEFAULT_ICON_SIZE} height={DEFAULT_ICON_SIZE} strokeWidth={1.5} />
			{/if}
		</span>
	</div>
	<div class="frame" {@attach sizeMorph()}>
		<div class="copy">
			<h3><span class="line" {@attach swapOnChange()}>{title}</span></h3>
			<p><span class="line" {@attach swapOnChange()}>{description}</span></p>
		</div>
	</div>
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</section>

<style>
	.root {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		padding: clamp(var(--arc-space-8), 8vw, var(--arc-space-12)) var(--arc-space-5);
		text-align: center;
	}
	.icon {
		position: relative;
		display: grid;
		width: var(--arc-space-12);
		height: var(--arc-space-12);
		place-items: center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		animation: empty-state-icon var(--arc-duration-considered) var(--arc-ease-enter) both;
	}
	.glyph {
		display: grid;
		place-items: center;
	}
	.frame {
		width: 100%;
		max-width: 100%;
	}
	.copy {
		display: flow-root;
	}
	.root h3 {
		position: relative;
		margin: var(--arc-space-5) 0 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.root p {
		position: relative;
		max-width: 18rem;
		margin: var(--arc-space-2) auto 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	/* Centered copy wraps into even lines, so a new description never leaves a single word hanging. */
	.line {
		display: block;
		text-wrap: balance;
	}
	.action {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--arc-space-3);
		margin-top: var(--arc-space-5);
	}
	/* The icon settles in once when the state first appears; later changes crossfade in place. */
	@keyframes empty-state-icon {
		from {
			opacity: 0;
			transform: scale(0.92);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.icon {
			animation: none;
		}
	}
</style>
