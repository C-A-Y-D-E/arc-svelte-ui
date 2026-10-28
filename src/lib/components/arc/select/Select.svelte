<script module lang="ts">
	export type SelectOption = { value: string; label: string; disabled?: boolean };
</script>

<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import { strings } from '../strings';
	import { changeDirection } from '../animated-counter/direction.svelte';
	import { presenceEm } from '../animated-counter/motion-extras';
	import { ease, motionTokens } from '../motion';

	type Props = {
		label: string;
		/** Keeps the label for assistive tech only, for a select whose purpose shows beside it. */
		hideLabel?: boolean;
		/** `sm` matches compact toolbars and table footers. */
		size?: 'sm' | 'md';
		options: SelectOption[];
		description?: string;
		placeholder?: string;
		/** Trigger id. Generated when omitted. */
		id?: string;
		/** Added to the trigger. */
		class?: string;
		value?: string;
		defaultValue?: string;
		onValueChange?: (value: string) => void;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		name?: string;
		required?: boolean;
		disabled?: boolean;
		ref?: HTMLButtonElement | null;
	};

	let {
		label,
		hideLabel = false,
		size = 'md',
		options,
		description,
		placeholder,
		id,
		class: className,
		defaultValue = '',
		value = $bindable(defaultValue),
		onValueChange,
		open = $bindable(false),
		onOpenChange,
		name,
		required,
		disabled,
		ref = $bindable(null)
	}: Props = $props();

	const CONTENT_OFFSET_PX = 4;
	const COLLISION_PADDING_PX = 12;
	const { blur, duration } = motionTokens;

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const hintId = $derived(description ? `${controlId}-description` : undefined);
	const selectedIndex = $derived(options.findIndex((option) => option.value === value));
	const shown = $derived(
		value ? (options[selectedIndex]?.label ?? '') : (placeholder ?? strings.selectPlaceholder())
	);
	/** The shown value rolls in the direction of the list: a later option rises from below, an earlier one drops from above. */
	const direction = changeDirection(() => selectedIndex);

	function change(next: string) {
		value = next;
		onValueChange?.(next);
	}
</script>

<div class="field">
	<label class={[hideLabel && 'sr-only']} for={controlId}>{label}</label>
	<SelectPrimitive.Root
		type="single"
		bind:value={() => value, change}
		bind:open
		{onOpenChange}
		{name}
		{required}
		{disabled}
		items={options}
	>
		<SelectPrimitive.Trigger bind:ref id={controlId} aria-describedby={hintId}>
			{#snippet child({ props })}
				<button {...props} class={['trigger', className]} data-size={size}>
					<!-- The real value stays readable for assistive tech; the visible copy below animates between values. -->
					<span class="sr-only">{shown}</span>
					<span class="value-text" aria-hidden="true">
						{#key value}
							<span
								data-placeholder={value ? undefined : ''}
								in:presenceEm={{ y: 0.35 * direction.current, blur: blur.soft }}
								out:presenceEm={{
									y: -0.3 * direction.current,
									blur: blur.subtle,
									duration: duration.fast,
									easing: ease.standard
								}}>{shown}</span
							>
						{/key}
					</span>
					<span class="chevron"
						><ChevronDownIcon size={16} strokeWidth={1.8} aria-hidden="true" /></span
					>
				</button>
			{/snippet}
		</SelectPrimitive.Trigger>
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				sideOffset={CONTENT_OFFSET_PX}
				collisionPadding={COLLISION_PADDING_PX}
			>
				{#snippet child({ props, wrapperProps })}
					<div {...wrapperProps}>
						<div {...props} class="content">
							<SelectPrimitive.ScrollUpButton>
								{#snippet child({ props: buttonProps })}
									<div {...buttonProps} class="scroll-button">
										<ChevronUpIcon size={15} strokeWidth={1.8} aria-hidden="true" />
									</div>
								{/snippet}
							</SelectPrimitive.ScrollUpButton>
							<SelectPrimitive.Viewport>
								{#snippet child({ props: viewportProps })}
									<div {...viewportProps} class="viewport">
										{#each options as option (option.value)}
											<SelectPrimitive.Item
												value={option.value}
												label={option.label}
												disabled={option.disabled}
											>
												{#snippet child({ props: itemProps, selected })}
													<div {...itemProps} class="item">
														{option.label}
														{#if selected}
															<span class="indicator"
																><CheckIcon size={16} strokeWidth={2} aria-hidden="true" /></span
															>
														{/if}
													</div>
												{/snippet}
											</SelectPrimitive.Item>
										{/each}
									</div>
								{/snippet}
							</SelectPrimitive.Viewport>
							<SelectPrimitive.ScrollDownButton>
								{#snippet child({ props: buttonProps })}
									<div {...buttonProps} class="scroll-button">
										<ChevronDownIcon size={15} strokeWidth={1.8} aria-hidden="true" />
									</div>
								{/snippet}
							</SelectPrimitive.ScrollDownButton>
						</div>
					</div>
				{/snippet}
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	</SelectPrimitive.Root>
	{#if description}<span id={hintId} class="hint">{description}</span>{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--arc-space-2);
		min-width: 0;
	}
	.field label {
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	/* The trigger anchors the floating menu and is measured by it, so it never scales: press feedback is color only. */
	.trigger {
		position: relative;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
		width: 100%;
		min-height: var(--arc-control-height-md);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-3);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover:not([data-disabled]) {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
		}
	}
	.trigger:active:not([data-disabled]),
	.trigger[data-state='open'] {
		border-color: var(--arc-border-strong);
		background: var(--arc-surface-muted);
	}
	.trigger:focus-visible {
		border-color: var(--arc-border-strong);
	}
	.trigger[data-size='sm'] {
		gap: var(--arc-space-2);
		min-height: var(--arc-control-height-sm);
		padding: 0 var(--arc-space-2) 0 var(--arc-space-3);
		font-size: var(--arc-text-xs);
	}
	.trigger[data-disabled] {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.value-text {
		display: grid;
		flex: 1;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
	}
	.value-text > span {
		grid-area: 1 / 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value-text > [data-placeholder] {
		color: var(--arc-text-muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.chevron {
		display: inline-flex;
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.trigger[data-state='open'] .chevron {
		transform: rotate(180deg);
	}
	.hint {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	/* The menu waits until it is positioned, so it always grows from the trigger edge. */
	.content {
		--menu-x: 0px;
		--menu-y: -6px;
		box-sizing: border-box;
		z-index: 1000;
		width: var(--bits-select-anchor-width);
		min-width: var(--bits-select-anchor-width);
		max-width: min(24rem, calc(100vw - 20px));
		max-height: min(320px, var(--bits-select-content-available-height));
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: calc(var(--arc-radius-control) + 2px);
		padding: 6px;
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: var(--bits-select-content-transform-origin);
		animation: select-in 220ms var(--arc-ease-enter) both;
	}
	.content[data-side='top'] {
		--menu-y: 6px;
	}
	.content[data-side='left'] {
		--menu-x: 6px;
		--menu-y: 0px;
	}
	.content[data-side='right'] {
		--menu-x: -6px;
		--menu-y: 0px;
	}
	.content[data-state='closed'] {
		animation: select-out 130ms var(--arc-ease-standard) both;
	}
	.viewport {
		padding: 2px 0;
	}
	.item {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 36px;
		border-radius: calc(var(--arc-radius-control) - 8px);
		padding: 0 34px 0 11px;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		cursor: default;
		outline: none;
		user-select: none;
		transition:
			background-color 80ms var(--arc-ease-standard),
			color 80ms var(--arc-ease-standard);
	}
	.item[data-highlighted] {
		background: var(--arc-surface-muted);
	}
	.item[data-disabled] {
		opacity: 0.45;
	}
	.indicator {
		position: absolute;
		right: 10px;
		display: inline-flex;
		align-items: center;
		color: var(--arc-foreground);
		animation: indicator-in var(--arc-duration-standard) var(--arc-ease-enter) 40ms both;
	}
	.scroll-button {
		display: grid;
		height: 28px;
		place-items: center;
		color: var(--arc-text-muted);
	}
	@keyframes select-in {
		from {
			opacity: 0;
			transform: translate(var(--menu-x), var(--menu-y)) scale(0.97);
		}
	}
	@keyframes select-out {
		to {
			opacity: 0;
			transform: translate(calc(var(--menu-x) / 2), calc(var(--menu-y) / 2)) scale(0.98);
		}
	}
	@keyframes indicator-in {
		from {
			opacity: 0;
			transform: scale(0.6);
			filter: blur(2px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.chevron,
		.item {
			transition: none;
		}
		.content {
			animation: select-fade var(--arc-duration-instant) linear both;
		}
		.content[data-state='closed'] {
			animation: select-fade-out var(--arc-duration-instant) linear both;
		}
		.indicator {
			animation: none;
		}
	}
	@keyframes select-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes select-fade-out {
		to {
			opacity: 0;
		}
	}
</style>
