<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import FieldMessage from './FieldMessage.svelte';

	type Props = Omit<HTMLInputAttributes, 'size'> & {
		label: string;
		description?: string;
		error?: string;
		/** Units shown inside the field's start and end, e.g. "$" and "SOL". Not in Arc. */
		prefix?: string;
		suffix?: string;
		/** Keeps the label for screen readers only, for grids of cells that share a visible heading. */
		hideLabel?: boolean;
		/** `sm` is Arc's small control height with a quieter label, for dense settings. Not in Arc. */
		size?: 'md' | 'sm';
		ref?: HTMLInputElement | null;
	};

	let {
		label,
		description,
		error,
		prefix,
		suffix,
		hideLabel = false,
		size = 'md',
		id,
		value = $bindable(),
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const hintId = $derived(description ? `${controlId}-description` : undefined);
	const errorId = $derived(error ? `${controlId}-error` : undefined);
	const prefixId = $derived(prefix ? `${controlId}-prefix` : undefined);
	const suffixId = $derived(suffix ? `${controlId}-suffix` : undefined);
	const describedBy = $derived(
		[rest['aria-describedby'], prefixId, suffixId, hintId, errorId].filter(Boolean).join(' ') ||
			undefined
	);
</script>

<div class={['field', size]}>
	<label class={['label', hideLabel && 'sr-only']} for={controlId}>{label}</label>
	<div class="control">
		<input
			{...rest}
			bind:this={ref}
			bind:value
			id={controlId}
			class={['input', prefix && 'has-prefix', suffix && 'has-suffix', className]}
			style:--suffix-length={suffix?.length}
			aria-invalid={error ? true : rest['aria-invalid']}
			aria-describedby={describedBy}
		/>
		{#if prefix}<span id={prefixId} class="affix prefix">{prefix}</span>{/if}
		{#if suffix}<span id={suffixId} class="affix suffix">{suffix}</span>{/if}
	</div>
	<FieldMessage id={hintId} text={description} />
	<FieldMessage id={errorId} text={error} tone="error" alert />
</div>

<style>
	/* No row gap: grid tracks clamp a negative margin at zero, so a closed message row would still pay the gap. Each row carries its own space instead. */
	.field {
		display: grid;
		min-width: 0;
	}
	.label {
		margin-bottom: var(--arc-space-2);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	/* The focus ring contracts onto the border while it fades in; the field itself never changes size. */
	.input {
		width: 100%;
		min-height: var(--arc-control-height-md);
		padding: 0 var(--arc-space-3);
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		outline: none;
		box-shadow: 0 0 0 6px transparent;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.control {
		position: relative;
		display: grid;
	}
	.sm .label {
		margin-bottom: var(--arc-space-1);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		font-weight: 400;
	}
	.sm .input {
		min-height: var(--arc-control-height-sm);
	}
	.has-prefix {
		padding-left: var(--arc-space-8);
	}
	/* Room for the suffix itself plus its inset: a three-letter unit keeps Arc's 48px, longer ones grow. */
	.has-suffix {
		padding-right: calc(var(--arc-space-3) * 2 + var(--suffix-length) * 1ch);
	}
	.prefix {
		left: var(--arc-space-3);
	}
	.suffix {
		right: var(--arc-space-3);
	}
	.affix {
		position: absolute;
		inset-block: 0;
		display: flex;
		align-items: center;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		pointer-events: none;
	}
	.input::placeholder {
		color: var(--arc-text-muted);
	}
	@media (hover: hover) and (pointer: fine) {
		.input:hover:not(:disabled, [aria-invalid='true']) {
			border-color: var(--arc-border-strong);
		}
	}
	.input:focus-visible {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.input[aria-invalid='true'] {
		border-color: var(--arc-danger);
	}
	.input[aria-invalid='true']:focus-visible {
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-danger) 24%, transparent);
	}
	.input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
		background: var(--arc-surface-muted);
	}
	@media (prefers-reduced-motion: reduce) {
		.input {
			transition-duration: 0.01ms;
		}
	}
</style>
