<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import XIcon from '@lucide/svelte/icons/x';
	import { animate } from 'motion';
	import type { Snippet } from 'svelte';
	import { strings } from '../strings';
	import type { Attachment } from 'svelte/attachments';
	import type { TransitionConfig } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens, presence, type PresenceParams } from '../motion';
	import { textSwapIn, textSwapOut } from './text-swap';

	type Props = Omit<DialogPrimitive.ContentProps, 'child' | 'children' | 'title'> & {
		title: string;
		description?: string;
		/** Hide the close button for dialogs that must not be dismissed (e.g. a payment in flight). */
		showClose?: boolean;
		/** Not in Arc: sits above any dialog already open, for a prompt opened from inside one. */
		stacked?: boolean;
		children?: Snippet;
		/** Not in Arc: an action row pinned under the body in a compact band, instead of a 24px-padded body. */
		footer?: Snippet;
	};

	let {
		title,
		description,
		showClose = true,
		stacked = false,
		children,
		footer,
		class: className,
		...rest
	}: Props = $props();

	const { duration, spring } = motionTokens;
	const SWAP_IN_SECONDS = 0.24;
	const SWAP_OUT_SECONDS = 0.15;
	const RISE_PX = 8;
	const RISE_SCALE = 0.96;
	const leaveFast = { duration: duration.fast, easing: ease.standard };

	/** While the layers leave, clicks pass through, so the trigger can reopen the dialog mid-exit. */
	function leave(node: Element, params: PresenceParams): TransitionConfig {
		const config = presence(node, params);
		const css = config.css!;
		return { ...config, css: (t, u) => `${css(t, u)}pointer-events:none;` };
	}

	/** The dialog rises 8px and scales up on a spring while it fades in quickly. */
	const rise: Attachment<HTMLElement> = (node) => {
		if (isReducedMotion()) {
			animate(node, { opacity: [0, 1] }, { duration: duration.instant });
			return;
		}
		animate(
			node,
			{ opacity: [0, 1], y: [RISE_PX, 0], scale: [RISE_SCALE, 1] },
			{
				default: spring.smooth,
				opacity: { duration: duration.fast, ease: motionTokens.ease.enter }
			}
		);
	};
</script>

{#snippet swapText(text: string)}
	{#key text}
		<span
			class="swap"
			in:textSwapIn={{ duration: SWAP_IN_SECONDS }}
			out:textSwapOut={{ duration: SWAP_OUT_SECONDS }}>{text}</span
		>
	{/key}
{/snippet}

<DialogPrimitive.Portal>
	<DialogPrimitive.Overlay forceMount>
		{#snippet child({ props, open })}
			{#if open}
				<div
					{...props}
					class="overlay"
					class:stacked
					in:presence={{ duration: duration.standard }}
					out:leave={leaveFast}
				></div>
			{/if}
		{/snippet}
	</DialogPrimitive.Overlay>
	<DialogPrimitive.Content forceMount {...rest}>
		{#snippet child({ props, open })}
			{#if open}
				<div
					{...props}
					class={['content', className]}
					class:stacked
					{@attach rise}
					out:leave={{ ...leaveFast, y: 4, scale: 0.98 }}
				>
					<div class="header">
						<div>
							<DialogPrimitive.Title>
								{#snippet child({ props })}
									<h2 {...props} class="title">{@render swapText(title)}</h2>
								{/snippet}
							</DialogPrimitive.Title>
							{#if description}
								<DialogPrimitive.Description>
									{#snippet child({ props })}
										<p {...props} class="description">{@render swapText(description)}</p>
									{/snippet}
								</DialogPrimitive.Description>
							{/if}
						</div>
						{#if showClose}
							<DialogPrimitive.Close>
								{#snippet child({ props })}
									<button {...props} class="close" aria-label={strings.dialogClose()}>
										<XIcon size={18} aria-hidden="true" />
									</button>
								{/snippet}
							</DialogPrimitive.Close>
						{/if}
					</div>
					{#if children}<div class="body">{@render children()}</div>{/if}
					{#if footer}<div class="footer">{@render footer()}</div>{/if}
				</div>
			{/if}
		{/snippet}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>

<style>
	/* A plain dim, no blur, so the page stays readable behind; the panel's floating shadow sets it apart. */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: oklch(10% 0 0 / 0.36);
	}
	.overlay.stacked {
		z-index: 60;
	}
	.content.stacked {
		z-index: 61;
	}
	/* Centered with auto margins (like a native modal dialog) so transform stays free for the entrance spring. */
	.content {
		position: fixed;
		z-index: 51;
		inset: 0;
		width: min(calc(100vw - var(--arc-space-8)), 440px);
		height: fit-content;
		max-height: calc(100vh - var(--arc-space-8));
		max-height: calc(100dvh - var(--arc-space-8));
		margin: auto;
		overflow: auto;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-surface);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
	}
	.content:focus {
		outline: none;
	}
	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--arc-space-5);
		padding: var(--arc-space-6);
		border-bottom: 1px solid var(--arc-border);
	}
	.title {
		margin: 0;
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-lg);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	.description {
		margin: var(--arc-space-2) 0 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.title,
	.description {
		position: relative;
		overflow-wrap: anywhere;
	}
	.swap {
		display: block;
	}
	/* A compact icon button: quick press, spring release. */
	.close {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: var(--arc-space-8);
		height: var(--arc-space-8);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: color-mix(in oklch, var(--arc-surface-muted) 50%, transparent);
		color: var(--arc-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.close:active {
		transform: scale(0.96);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 100ms var(--arc-ease-standard);
	}
	.close:focus-visible {
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.body {
		padding: var(--arc-space-6);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	/* A body that renders nothing (an optional note) leaves no band behind. */
	.body:empty {
		display: none;
	}
	/* Sticks to the bottom while a tall body scrolls, so the actions stay in reach. */
	.footer {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--arc-space-2);
		padding: var(--arc-space-3) var(--arc-space-6);
		background: var(--arc-surface-raised);
	}
	.body:not(:empty) + .footer {
		border-top: 1px solid var(--arc-border);
	}
	@media (prefers-reduced-motion: reduce) {
		.close,
		.close:active {
			transition: none;
		}
		.close:active {
			transform: none;
		}
	}
</style>
