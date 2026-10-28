<script lang="ts">
	import type { Snippet } from 'svelte';
	import { strings } from '../strings';
	import { ease, motionTokens, presence } from '../motion';
	import { sizeMorph } from '../alert/swap';

	type Props = {
		label?: string;
		lines?: number;
		avatar?: boolean;
		class?: string;
		/** Content to reveal once loading finishes. With children, the placeholder crossfades into them. */
		children?: Snippet;
		/** Keeps the placeholder visible while true. Only used together with children. */
		loading?: boolean;
	};

	let {
		label,
		lines = 3,
		avatar = false,
		class: className,
		children,
		loading = true
	}: Props = $props();

	const MIN_LINES = 1;
	const MAX_LINES = 6;
	const CONTENT_RISE_PX = 4;

	const count = $derived(Math.min(Math.max(Math.floor(lines), MIN_LINES), MAX_LINES));
</script>

<!-- Each block pulses a beat after the one above it, so the wait reads as one calm wave. -->
{#snippet placeholder(extraClass?: string)}
	<div
		class={['root', extraClass]}
		role="status"
		aria-label={label ?? strings.loadingContent()}
		aria-busy="true"
	>
		{#if avatar}
			<span class="avatar" aria-hidden="true"></span>
		{/if}
		<span class="lines" aria-hidden="true">
			{#each { length: count }, index (index)}
				<span class="line" style:--index={index + (avatar ? 1 : 0)}></span>
			{/each}
		</span>
	</div>
{/snippet}

{#if children === undefined}
	{@render placeholder(className)}
{:else}
	<div class={className} aria-busy={loading} {@attach sizeMorph()}>
		<div class="frame">
			{#if loading}
				<div
					out:presence={{ pop: true, duration: motionTokens.duration.fast, easing: ease.standard }}
				>
					{@render placeholder()}
				</div>
			{:else}
				<div in:presence={{ y: CONTENT_RISE_PX }}>{@render children()}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.root {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: flex-start;
		gap: var(--arc-space-4);
	}
	/* A calm, finite pulse: each block dims a beat after the one above it, then rests after about 20 seconds. */
	.avatar,
	.line {
		display: block;
		flex: 0 0 auto;
		border-radius: var(--arc-radius-control);
		background: color-mix(in oklch, var(--arc-border-strong) 38%, var(--arc-surface));
		animation: skeleton-pulse 1.8s var(--arc-ease-in-out) calc(var(--index, 0) * 90ms) 11 both;
	}
	.avatar {
		width: var(--arc-control-height-md);
		height: var(--arc-control-height-md);
		border-radius: var(--arc-radius-pill);
	}
	.lines {
		display: grid;
		flex: 1;
		gap: var(--arc-space-3);
		padding-top: var(--arc-space-1);
	}
	.line {
		width: 100%;
		height: var(--arc-space-3);
	}
	.line:first-child {
		width: 48%;
		height: var(--arc-space-4);
	}
	.line:last-child {
		width: 72%;
	}
	.frame {
		position: relative;
		display: flow-root;
	}
	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.52;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.avatar,
		.line {
			animation: none;
		}
	}
</style>
