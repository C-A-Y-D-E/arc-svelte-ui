<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type DropdownItem = {
		label: string;
		onSelect?: () => void;
		disabled?: boolean;
		icon?: Snippet;
		destructive?: boolean;
		separatorBefore?: boolean;
	};
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { DropdownMenu } from 'bits-ui';
	import { animate } from 'motion';
	import type { Attachment } from 'svelte/attachments';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { measureRow, moveHighlight, type Highlight } from './highlight';

	type Props = {
		/** Trigger text. A new label rises in while the trigger width springs. */
		label: string;
		/** Labels double as keys, so keep them unique. */
		items: DropdownItem[];
		icon?: Snippet;
		/** Icon-only trigger; the label becomes its accessible name. Not in Arc. */
		hideLabel?: boolean;
		/** Borderless, chevron-less trigger for rows that already sit on a flat surface (the sidebar). Not in Arc. */
		quiet?: boolean;
		/** Where the menu opens relative to the trigger; it still flips when there is no room. Not in Arc. */
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
	};

	let {
		label,
		items,
		icon,
		hideLabel = false,
		quiet = false,
		side = 'bottom',
		align = 'end'
	}: Props = $props();

	/** A short grace period keeps the highlight gliding across separators and item gaps. */
	const HIGHLIGHT_GRACE_MS = 70;
	const LABEL_TRAVEL_PX = 4;
	const { blur } = motionTokens;

	let highlight = $state<Highlight | null>(null);
	let highlightNode = $state<HTMLSpanElement>();
	let pointer = false;
	let clearTimer = 0;

	$effect(() => () => clearTimeout(clearTimer));

	$effect(() => {
		if (highlightNode) moveHighlight(highlightNode, highlight);
	});

	/** The trigger width springs to the measured text instead of snapping; the first measure and font swaps settle instantly. */
	const followLabelWidth: Attachment<HTMLSpanElement> = (measure) => {
		const frame = measure.parentElement;
		if (!frame) return;
		let measuredText: string | null = null;
		let sizing: ReturnType<typeof animate> | undefined;
		const observer = new ResizeObserver(([entry]) => {
			const text = measure.textContent;
			const morph = measuredText !== null && measuredText !== text && !isReducedMotion();
			measuredText = text;
			const width = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? measure.offsetWidth);
			sizing?.stop();
			if (morph) sizing = animate(frame, { width }, motionTokens.spring.morph);
			else frame.style.width = `${width}px`;
		});
		observer.observe(measure);
		return () => {
			observer.disconnect();
			sizing?.stop();
		};
	};

	function onOpenChange(open: boolean) {
		if (!open) return;
		clearTimeout(clearTimer);
		highlight = null;
	}

	// The menu focuses the highlighted item (pointer or keyboard), and the content when the pointer leaves an item.
	function onMenuFocus(event: FocusEvent) {
		const item =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLElement>('[role="menuitem"]')
				: null;
		clearTimeout(clearTimer);
		if (!item) {
			clearTimer = window.setTimeout(() => (highlight = null), pointer ? HIGHLIGHT_GRACE_MS : 0);
			return;
		}
		highlight = measureRow(item, pointer && highlight !== null);
	}
</script>

<DropdownMenu.Root {onOpenChange}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class={['trigger', hideLabel && 'icon-only', quiet && 'quiet']}
				type="button"
				aria-label={hideLabel ? label : undefined}
			>
				{#if icon}<span class="trigger-icon" aria-hidden="true">{@render icon()}</span>{/if}
				{#if !hideLabel}
					<span class="label">
						<span class="label-measure" aria-hidden="true" {@attach followLabelWidth}>{label}</span>
						{#key label}
							<span
								class="label-text"
								in:presence={{ y: LABEL_TRAVEL_PX, blur: blur.soft, duration: 0.24 }}
								out:presence={{
									y: -LABEL_TRAVEL_PX,
									blur: blur.subtle,
									duration: 0.15,
									easing: ease.standard,
									pop: true
								}}>{label}</span
							>
						{/key}
					</span>
					{#if !quiet}
						<ChevronDownIcon class="chevron" size={15} strokeWidth={1.8} aria-hidden="true" />
					{/if}
				{/if}
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content {side} sideOffset={6} {align} collisionPadding={12} loop>
			{#snippet child({ wrapperProps, props })}
				<div {...wrapperProps}>
					<div
						{...props}
						class="menu"
						onfocusin={onMenuFocus}
						onpointermovecapture={() => (pointer = true)}
						onkeydowncapture={() => (pointer = false)}
					>
						<!-- One highlight glides between items for the pointer and jumps instantly for the keyboard. -->
						<span
							bind:this={highlightNode}
							class="highlight"
							data-tone={highlight?.tone}
							aria-hidden="true"
						></span>
						{#each items as item, index (item.label)}
							{#if item.separatorBefore}
								<DropdownMenu.Separator>
									{#snippet child({ props: separatorProps })}
										<div {...separatorProps} class="separator"></div>
									{/snippet}
								</DropdownMenu.Separator>
							{/if}
							<DropdownMenu.Item disabled={item.disabled} onSelect={item.onSelect}>
								{#snippet child({ props: itemProps })}
									<div
										{...itemProps}
										class={['item', item.destructive && 'destructive']}
										data-tone={item.destructive ? 'danger' : undefined}
										style:--i={index}
									>
										{#if item.icon}<span class="icon" aria-hidden="true">{@render item.icon()}</span
											>{/if}
										{item.label}
									</div>
								{/snippet}
							</DropdownMenu.Item>
						{/each}
					</div>
				</div>
			{/snippet}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	.trigger {
		display: inline-flex;
		max-width: 100%;
		min-height: var(--arc-control-height-sm);
		align-items: center;
		gap: var(--arc-space-2);
		padding: 0 var(--arc-space-3);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--arc-duration-instant) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
			box-shadow: var(--arc-shadow-resting);
		}
	}
	/* Square whatever height the row gives it, so it sits as a circle beside icon buttons. */
	.icon-only {
		min-width: var(--arc-control-height-sm);
		aspect-ratio: 1;
		justify-content: center;
		padding: 0;
	}
	/* The trigger anchors the menu, so press feedback stays in color. A scaled rect would be measured on pointerdown and shift the menu. */
	.trigger[data-state='open'] {
		border-color: var(--arc-border-strong);
		background: var(--arc-surface-muted);
		box-shadow: none;
	}
	.trigger:active {
		border-color: var(--arc-border-strong);
		background: color-mix(in oklch, var(--arc-surface-muted), var(--arc-border) 55%);
		box-shadow: none;
	}
	/* Sits flat on the surface like a sidebar row: no border or fill until hovered or open. */
	.trigger.quiet {
		padding: 0 10px;
		border-color: transparent;
		background: transparent;
		color: var(--arc-text-secondary);
		font-weight: 400;
	}
	.trigger.quiet.icon-only {
		padding: 0;
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger.quiet:hover {
			border-color: transparent;
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
			box-shadow: none;
		}
	}
	.trigger.quiet[data-state='open'],
	.trigger.quiet:active {
		border-color: transparent;
		color: var(--arc-foreground);
	}
	.trigger:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.item:focus-visible {
		outline: none;
	}
	.trigger-icon {
		display: inline-flex;
		flex: none;
		color: var(--arc-text-secondary);
	}
	.label {
		position: relative;
		display: inline-flex;
		min-width: 0;
		flex: 0 1 auto;
		overflow-x: clip;
	}
	.label-measure {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}
	.label-text {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.trigger :global(.chevron) {
		flex: none;
		color: var(--arc-text-muted);
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.trigger[data-state='open'] :global(.chevron) {
		transform: rotate(180deg);
	}
	/* The menu grows from the trigger edge: offset toward the trigger, scale from the anchor origin, fade quickly.
	   Transitions instead of keyframes, so a close that interrupts the open (or a reopen during the close) reverses from where it is. */
	.menu {
		--dropdown-menu-x: 0px;
		--dropdown-menu-y: -5px;
		position: relative;
		z-index: 60;
		min-width: min(12rem, var(--bits-dropdown-menu-content-available-width));
		max-width: var(--bits-dropdown-menu-content-available-width);
		padding: 5px;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-enter),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.menu[data-side='top'] {
		--dropdown-menu-y: 5px;
	}
	.menu[data-side='left'] {
		--dropdown-menu-x: 5px;
		--dropdown-menu-y: 0px;
	}
	.menu[data-side='right'] {
		--dropdown-menu-x: -5px;
		--dropdown-menu-y: 0px;
	}
	@starting-style {
		.menu[data-state='open'] {
			opacity: 0;
			transform: translate(var(--dropdown-menu-x), var(--dropdown-menu-y)) scale(0.97);
		}
		.menu[data-state='open'] .item {
			opacity: 0;
			transform: translate(calc(var(--dropdown-menu-x) * 0.4), calc(var(--dropdown-menu-y) * 0.4));
		}
	}
	/* The menu unmounts once its running animations end, so a no-op keyframe times the exit while the transition does the visual work. */
	.menu[data-state='closed'] {
		opacity: 0;
		transform: translate(calc(var(--dropdown-menu-x) * 0.5), calc(var(--dropdown-menu-y) * 0.5))
			scale(0.985);
		transition:
			opacity 130ms var(--arc-ease-standard),
			transform 130ms var(--arc-ease-standard);
		animation: dropdown-menu-exit 130ms linear both;
		pointer-events: none;
	}
	.highlight {
		position: absolute;
		top: 0;
		right: 5px;
		left: 5px;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		background: var(--arc-surface-muted);
		opacity: 0;
		pointer-events: none;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.highlight[data-tone='danger'] {
		background: color-mix(in oklch, var(--arc-danger) 8%, var(--arc-surface));
	}
	.item {
		position: relative;
		display: flex;
		min-height: 36px;
		align-items: center;
		gap: 10px;
		padding: 0 11px;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		cursor: pointer;
		outline: none;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-standard) var(--arc-ease-enter) calc(min(var(--i, 0), 4) * 35ms),
			transform var(--arc-duration-standard) var(--arc-ease-enter) calc(min(var(--i, 0), 4) * 35ms);
	}
	.icon {
		display: inline-flex;
		width: 17px;
		color: var(--arc-text-secondary);
	}
	.separator {
		height: 1px;
		margin: var(--arc-space-1) calc(var(--arc-space-1) * -1);
		background: var(--arc-border-subtle);
	}
	.destructive {
		color: var(--arc-danger);
	}
	.destructive .icon {
		color: var(--arc-danger);
	}
	.item[data-disabled] {
		opacity: 0.45;
		cursor: default;
	}
	@keyframes dropdown-menu-exit {
		to {
			--dropdown-menu-exit: 1;
		}
	}
	@media (prefers-reduced-transparency: reduce) {
		.menu {
			background: var(--arc-surface-raised);
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.trigger :global(.chevron),
		.item,
		.highlight {
			transition: none;
		}
		.menu,
		.menu[data-state='closed'] {
			transform: none;
			transition: opacity var(--arc-duration-instant) linear;
		}
	}
</style>
