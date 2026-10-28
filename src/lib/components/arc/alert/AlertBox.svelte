<script module lang="ts">
	export type AlertTone = 'info' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import XIcon from '@lucide/svelte/icons/x';
	import { isReducedMotion, motionTokens } from '../motion';
	import { sizeMorph, swapIn, swapOnChange, swapOut } from './swap';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		tone?: AlertTone;
		title: string;
		children?: Snippet;
		onDismiss?: () => void;
		/** A newly shown alert gives its icon a small settle. */
		animateIcon?: boolean;
	};

	let {
		tone = 'info',
		title,
		children,
		class: className,
		onDismiss,
		animateIcon = false,
		...rest
	}: Props = $props();

	const ICON_SIZE = 18;
	const icons = {
		info: InfoIcon,
		success: CheckIcon,
		warning: TriangleAlertIcon,
		danger: CircleXIcon
	};
	const { blur, spring } = motionTokens;

	const Icon = $derived(icons[tone]);

	function settleIcon(node: HTMLElement) {
		if (!untrack(() => animateIcon) || untrack(isReducedMotion)) return;
		animate(
			node,
			{ opacity: [0, 1], scale: [0.6, 1], filter: [`blur(${blur.subtle}px)`, 'blur(0px)'] },
			spring.snappy
		);
	}
</script>

<div {...rest} class={['alert', tone, className]} role={tone === 'danger' ? 'alert' : 'status'}>
	<!-- A new tone morphs its icon in place; a newly shown alert gives the icon a small settle. -->
	<span class="icon" {@attach settleIcon}>
		<span class="glyph" {@attach swapOnChange({ kind: 'icon' })}>
			<Icon width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
		</span>
	</span>
	<!-- The copy column follows its content height, so longer or shorter messages never snap the alert. -->
	<div class="copy" {@attach sizeMorph()}>
		<div class="content">
			<strong class="title"><span class="line" {@attach swapOnChange()}>{title}</span></strong>
			{#if children}
				<p class="description" in:swapIn out:swapOut>
					<span class="line" {@attach swapOnChange()}>{@render children()}</span>
				</p>
			{/if}
		</div>
	</div>
	{#if onDismiss}
		<button type="button" class="dismiss" aria-label={`Dismiss: ${title}`} onclick={onDismiss}>
			<XIcon width={16} height={16} strokeWidth={1.75} aria-hidden="true" />
		</button>
	{/if}
</div>

<style>
	.alert {
		display: flex;
		align-items: start;
		gap: var(--arc-space-3);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: var(--arc-space-4);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
	}
	.icon,
	.glyph {
		position: relative;
		display: grid;
		flex: 0 0 auto;
		place-items: center;
	}
	.icon {
		width: 18px;
		height: 18px;
		margin-top: 1px;
	}
	.icon :global(svg) {
		display: block;
	}
	.copy {
		flex: 1;
		min-width: 0;
	}
	.content {
		position: relative;
	}
	.title {
		position: relative;
		display: block;
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.line {
		display: block;
	}
	.description {
		position: relative;
		margin: var(--arc-space-1) 0 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
	}
	.info .icon {
		color: var(--arc-accent);
	}
	.success .icon {
		color: var(--arc-success);
	}
	.warning .icon {
		color: var(--arc-warning);
	}
	.danger .icon {
		color: var(--arc-danger);
	}
	.dismiss {
		display: grid;
		width: 28px;
		height: 28px;
		flex: 0 0 auto;
		place-items: center;
		margin: -5px -6px -5px 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.dismiss:active {
		transform: scale(0.96);
		transition-duration: var(--arc-duration-instant);
		transition-timing-function: var(--arc-ease-standard);
	}
	.dismiss:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	@media (hover: hover) and (pointer: fine) {
		.dismiss:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dismiss {
			transition: none;
		}
		.dismiss:active {
			transform: none;
		}
	}
</style>
