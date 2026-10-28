<script module lang="ts">
	export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

	const DELAY_MS = 250;
	const SKIP_WINDOW_MS = 300;

	/* Every Tooltip brings its own provider, so the skip window is shared here: while any tooltip is open,
	   and briefly after the last one closes, the next opens without delay or travel. */
	const warmth = $state({ warm: false });
	let openCount = 0;
	let coolTimer = 0;

	function tooltipOpened() {
		openCount += 1;
		window.clearTimeout(coolTimer);
		warmth.warm = true;
	}

	function tooltipClosed() {
		openCount = Math.max(0, openCount - 1);
		if (openCount) return;
		window.clearTimeout(coolTimer);
		coolTimer = window.setTimeout(() => (warmth.warm = false), SKIP_WINDOW_MS);
	}
</script>

<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import TooltipText from './TooltipText.svelte';

	type Props = {
		content: string | number | Snippet;
		/** The trigger. Spread `props` onto a focusable element. */
		children: Snippet<[{ props: Record<string, unknown> }]>;
		side?: TooltipSide;
		/** Suppresses the tooltip, e.g. while the trigger already shows its label. */
		disabled?: boolean;
	};

	let { content, children, side = 'top', disabled = false }: Props = $props();

	const SIDE_OFFSET = 8;
	const COLLISION_PADDING = 12;

	// Controlled so the instant flag lands in the same update that mounts the content.
	let open = $state(false);
	let instant = $state(false);

	$effect(() => {
		if (!open) return;
		tooltipOpened();
		return tooltipClosed;
	});

	function changeOpen(next: boolean) {
		if (next) instant = warmth.warm;
		open = next;
	}
</script>

<TooltipPrimitive.Provider delayDuration={DELAY_MS} skipDelayDuration={0}>
	<TooltipPrimitive.Root
		bind:open={() => open, changeOpen}
		delayDuration={warmth.warm ? 0 : DELAY_MS}
		{disabled}
	>
		<TooltipPrimitive.Trigger>
			{#snippet child({ props })}{@render children({ props })}{/snippet}
		</TooltipPrimitive.Trigger>
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				{side}
				sideOffset={SIDE_OFFSET}
				collisionPadding={COLLISION_PADDING}
			>
				{#snippet child({ wrapperProps, props })}
					<div {...wrapperProps}>
						<div {...props} class="tooltip" data-instant={instant || undefined}>
							{#if typeof content === 'function'}
								{@render content()}
							{:else}
								<TooltipText text={String(content)} />
							{/if}
						</div>
					</div>
				{/snippet}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	</TooltipPrimitive.Root>
</TooltipPrimitive.Provider>

<style>
	.tooltip {
		--tooltip-y: 3px;
		z-index: 90;
		max-width: 15rem;
		padding: var(--arc-space-3) var(--arc-space-4);
		border: 1px solid color-mix(in oklch, var(--arc-background) 14%, var(--arc-foreground));
		border-radius: var(--arc-radius-control);
		background: var(--arc-foreground);
		color: var(--arc-background);
		box-shadow: var(--arc-shadow-raised);
		font-size: var(--arc-text-sm);
		font-weight: 400;
		line-height: var(--arc-leading-body);
		transform-origin: var(--bits-tooltip-content-transform-origin);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-enter),
			transform var(--arc-duration-fast) var(--arc-ease-enter);
	}
	.tooltip[data-side='bottom'] {
		--tooltip-y: -3px;
	}
	.tooltip:is([data-side='left'], [data-side='right']) {
		--tooltip-y: 0px;
	}
	.tooltip[data-side='left'] {
		--tooltip-x: 3px;
	}
	.tooltip[data-side='right'] {
		--tooltip-x: -3px;
	}
	/* The first tooltip waits, then rises a few pixels from its trigger. Within the skip window the next one only fades.
	   Transitions instead of keyframes, so returning to the trigger while it fades out reverses the fade instead of restarting it. */
	@starting-style {
		.tooltip[data-state$='-open'] {
			opacity: 0;
			transform: translate(var(--tooltip-x, 0px), var(--tooltip-y)) scale(0.97);
		}
		.tooltip[data-instant][data-state$='-open'] {
			transform: none;
		}
	}
	.tooltip[data-instant][data-state$='-open'] {
		transition:
			opacity 90ms var(--arc-ease-standard),
			transform 90ms var(--arc-ease-standard);
	}
	/* bits-ui unmounts once the running transitions finish, so the exit needs no keyframe of its own. */
	.tooltip[data-state='closed'] {
		opacity: 0;
		transform: scale(0.98);
		transition:
			opacity 110ms var(--arc-ease-standard),
			transform 110ms var(--arc-ease-standard);
	}
	@media (prefers-reduced-motion: reduce) {
		.tooltip,
		.tooltip[data-state='closed'],
		.tooltip[data-instant][data-state$='-open'] {
			transform: none;
			transition: opacity 90ms linear;
		}
	}
</style>
