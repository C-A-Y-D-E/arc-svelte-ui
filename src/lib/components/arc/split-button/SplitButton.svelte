<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type SplitButtonAction = {
		label: string;
		onSelect?: () => void;
		disabled?: boolean;
		destructive?: boolean;
		icon?: Snippet;
	};
	export type SplitButtonVariant = 'primary' | 'secondary';
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { DropdownMenu } from 'bits-ui';
	import GlyphMorph from '../action-button/GlyphMorph.svelte';
	import { morphWidth } from '../action-button/morph-width.svelte';
	import { motionTransition } from '../action-button/motion-transition';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = {
		label: string;
		actions: SplitButtonAction[];
		onClick?: () => void;
		disabled?: boolean;
		/** Leading icon on the main half. Passing a different snippet crossfades the icon. */
		icon?: Snippet;
		variant?: SplitButtonVariant;
	};

	let { label, actions, onClick, disabled, icon, variant = 'primary' }: Props = $props();

	const { blur, duration, spring } = motionTokens;
	const blurSubtle = `blur(${blur.subtle}px)`;
	/** Scale rides the spring; opacity and blur tween so blur never overshoots below zero. */
	const iconEnter = {
		...spring.snappy,
		opacity: { duration: duration.fast, ease: motionTokens.ease.enter },
		filter: { duration: duration.fast, ease: motionTokens.ease.enter }
	};
	const instant = { duration: duration.instant };

	function iconIn() {
		if (isReducedMotion()) return { keyframes: { opacity: [0, 1] }, transition: instant };
		return {
			keyframes: { opacity: [0, 1], scale: [0.6, 1], filter: [blurSubtle, 'blur(0px)'] },
			transition: iconEnter
		};
	}

	function iconOut() {
		if (isReducedMotion()) return { keyframes: { opacity: 0 }, transition: instant };
		return {
			keyframes: { opacity: 0, scale: 0.6, filter: blurSubtle },
			transition: { duration: duration.fast, ease: motionTokens.ease.standard }
		};
	}
</script>

<!-- The main action morphs its icon and label in place while its width follows on a spring; the menu half never scales, so the menu opens from a still anchor. -->
<DropdownMenu.Root>
	<div class={['group', variant === 'secondary' && 'secondary']}>
		<button class="primary" type="button" onclick={onClick} {disabled}>
			<span class="primary-slot" aria-hidden="true">
				<span class="primary-content" {@attach morphWidth(() => [icon, label])}>
					{#if icon}
						<span class="main-icon">
							{#key icon}
								<span
									class="icon-phase"
									in:motionTransition={iconIn()}
									out:motionTransition={iconOut()}
								>
									{@render icon()}
								</span>
							{/key}
						</span>
					{/if}
					<GlyphMorph text={label} />
				</span>
			</span>
			<span class="sr-only" aria-live="polite">{label}</span>
		</button>
		<DropdownMenu.Trigger {disabled}>
			{#snippet child({ props })}
				<button {...props} class="trigger" type="button" aria-label={`${label} more actions`}>
					<ChevronDownIcon class="chevron" size={15} strokeWidth={1.8} aria-hidden="true" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
	</div>
	<DropdownMenu.Portal>
		<DropdownMenu.Content sideOffset={4} align="end" collisionPadding={12} loop>
			{#snippet child({ wrapperProps, props })}
				<div {...wrapperProps}>
					<div {...props} class="menu">
						{#each actions as action, index (action.label)}
							<DropdownMenu.Item disabled={action.disabled} onSelect={action.onSelect}>
								{#snippet child({ props: itemProps })}
									<div
										{...itemProps}
										class={['item', action.destructive && 'destructive']}
										style:--i={index}
									>
										{#if action.icon}
											<span class="icon" aria-hidden="true">{@render action.icon()}</span>
										{/if}
										{action.label}
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
	/* One pill, two actions. The whole pill presses in for the main action; the menu half answers in color only, because the menu measures it on pointerdown to place itself. */
	.group {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--arc-primary-fill);
		border-radius: var(--arc-radius-control);
		background: var(--arc-primary-fill);
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.group:has(> .primary:active:not(:disabled)) {
		transform: scale(0.97);
		transition-duration: var(--arc-duration-instant);
		transition-timing-function: var(--arc-ease-standard);
	}
	.primary,
	.trigger {
		border: 0;
		background: var(--arc-primary-fill);
		color: var(--arc-primary-ink);
		font: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.primary {
		position: relative;
		display: inline-grid;
		min-height: var(--arc-control-height-md);
		place-items: center;
		padding: 0 var(--arc-space-4);
		border-radius: calc(var(--arc-radius-control) - 1px) 0 0 calc(var(--arc-radius-control) - 1px);
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	/* The slot springs to the width of the next label; the content leads from the start edge and is clipped only while it morphs. */
	.primary-slot {
		display: inline-flex;
		min-width: 0;
		align-items: center;
	}
	.primary-slot:global([data-morphing]) {
		clip-path: inset(-50% calc(var(--arc-space-2) * -1));
	}
	.primary-content {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: var(--arc-space-2);
		white-space: nowrap;
	}
	.main-icon {
		display: inline-grid;
		flex: none;
		place-items: center;
	}
	.icon-phase {
		grid-area: 1 / 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.trigger {
		display: grid;
		width: 38px;
		min-height: var(--arc-control-height-md);
		place-items: center;
		border-left: 1px solid color-mix(in oklch, var(--arc-background) 18%, var(--arc-foreground));
		border-radius: 0 calc(var(--arc-radius-control) - 1px) calc(var(--arc-radius-control) - 1px) 0;
	}
	.trigger :global(.chevron) {
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.trigger[data-state='open'] :global(.chevron) {
		transform: rotate(180deg);
	}
	@media (hover: hover) and (pointer: fine) {
		.primary:hover:not(:disabled),
		.trigger:hover:not(:disabled) {
			background: color-mix(in oklch, var(--arc-foreground) 88%, var(--arc-background));
		}
		.secondary .primary:hover:not(:disabled),
		.secondary .trigger:hover:not(:disabled) {
			background: var(--arc-surface-muted);
		}
	}
	.primary:active:not(:disabled),
	.trigger:active:not(:disabled),
	.trigger[data-state='open'] {
		background: color-mix(in oklch, var(--arc-foreground) 80%, var(--arc-background));
	}
	.primary:focus-visible,
	.trigger:focus-visible,
	.item:focus-visible {
		z-index: 1;
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.primary:disabled,
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}
	.secondary {
		border-color: var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface);
	}
	.secondary .primary,
	.secondary .trigger {
		min-height: 36px;
		background: var(--arc-surface);
		color: var(--arc-foreground);
	}
	.secondary .primary {
		min-width: 142px;
		border-radius: var(--arc-radius-pill) 0 0 var(--arc-radius-pill);
		padding-inline: 12px;
		font-size: 12px;
	}
	.secondary .trigger {
		width: 32px;
		border-left-color: var(--arc-border-subtle);
		border-radius: 0 var(--arc-radius-pill) var(--arc-radius-pill) 0;
	}
	.secondary .primary:active:not(:disabled),
	.secondary .trigger:active:not(:disabled),
	.secondary .trigger[data-state='open'] {
		background: color-mix(in oklch, var(--arc-surface-muted), var(--arc-border) 55%);
	}
	.icon {
		display: inline-flex;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* The menu grows from the trigger edge: offset toward the trigger, scale from the anchor origin, fade quickly; it leaves faster than it arrives.
	   Transitions instead of keyframes, so a close that interrupts the open reverses from where the menu is instead of snapping to rest first. */
	.menu {
		--split-menu-x: 0px;
		--split-menu-y: -5px;
		z-index: 60;
		min-width: min(12rem, var(--bits-dropdown-menu-content-available-width));
		max-width: var(--bits-dropdown-menu-content-available-width);
		padding: 5px;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-enter),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.menu[data-side='top'] {
		--split-menu-y: 5px;
	}
	.menu[data-side='left'] {
		--split-menu-x: 5px;
		--split-menu-y: 0px;
	}
	.menu[data-side='right'] {
		--split-menu-x: -5px;
		--split-menu-y: 0px;
	}
	@starting-style {
		.menu[data-state='open'] {
			opacity: 0;
			transform: translate(var(--split-menu-x), var(--split-menu-y)) scale(0.97);
		}
		.menu[data-state='open'] .item {
			opacity: 0;
			transform: translate(calc(var(--split-menu-x) * 0.4), calc(var(--split-menu-y) * 0.4));
		}
	}
	/* The menu unmounts once its running animations end, so a no-op keyframe times the exit while the transition does the visual work. */
	.menu[data-state='closed'] {
		opacity: 0;
		transform: translate(calc(var(--split-menu-x) * 0.5), calc(var(--split-menu-y) * 0.5))
			scale(0.985);
		transition:
			opacity 130ms var(--arc-ease-standard),
			transform 130ms var(--arc-ease-standard);
		animation: split-menu-exit 130ms linear both;
		pointer-events: none;
	}
	/* Highlight follows the pointer and arrow keys instantly, like a native menu. */
	.item {
		display: flex;
		min-height: 36px;
		align-items: center;
		gap: 10px;
		padding: 0 11px;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		font-size: var(--arc-text-sm);
		cursor: pointer;
		outline: none;
		transition:
			opacity var(--arc-duration-standard) var(--arc-ease-enter) calc(min(var(--i, 0), 4) * 35ms),
			transform var(--arc-duration-standard) var(--arc-ease-enter) calc(min(var(--i, 0), 4) * 35ms);
	}
	.item[data-highlighted] {
		background: var(--arc-surface-muted);
	}
	.item[data-disabled] {
		cursor: default;
		opacity: 0.45;
	}
	.destructive {
		color: var(--arc-danger);
	}
	.destructive[data-highlighted] {
		background: color-mix(in oklch, var(--arc-danger) 8%, var(--arc-surface));
	}
	@keyframes split-menu-exit {
		to {
			--split-menu-exit: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.group,
		.primary,
		.trigger,
		.trigger :global(.chevron) {
			transition: none;
		}
		.group:has(> .primary:active:not(:disabled)) {
			transform: none;
		}
		.item {
			transition: none;
		}
		.menu,
		.menu[data-state='closed'] {
			transform: none;
			transition: opacity var(--arc-duration-instant) linear;
		}
	}
</style>
