<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { FieldMessage } from '../input';

	type Props = HTMLTextareaAttributes & {
		label: string;
		description?: string;
		error?: string;
		/** Keeps the label for screen readers only, for rows that show their own label beside the field. Not in Arc. */
		hideLabel?: boolean;
		ref?: HTMLTextAreaElement | null;
	};

	let {
		label,
		description,
		error,
		hideLabel = false,
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
	const describedBy = $derived(
		[rest['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<label class={hideLabel ? 'sr-only' : undefined} for={controlId}>{label}</label>
	<textarea
		{...rest}
		bind:this={ref}
		bind:value
		id={controlId}
		class={['control', className]}
		aria-invalid={error ? true : rest['aria-invalid']}
		aria-describedby={describedBy}></textarea>
	<FieldMessage id={hintId} text={description} />
	<FieldMessage id={errorId} text={error} tone="error" alert />
</div>

<style>
	/* No row gap: grid tracks clamp a negative margin at zero, so a closed message row would still pay the gap. Each row carries its own space instead. */
	.field {
		display: grid;
		min-width: 0;
	}
	.field label {
		margin-bottom: var(--arc-space-2);
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	/* Same focus language as Input: the ring contracts onto the border while it fades in, and the box never changes size. */
	.control {
		width: 100%;
		min-height: 110px;
		resize: vertical;
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		padding: var(--arc-space-3);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		outline: none;
		box-shadow: 0 0 0 6px transparent;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.control::placeholder {
		color: var(--arc-text-muted);
	}
	@media (hover: hover) and (pointer: fine) {
		.control:hover:not(:disabled, [aria-invalid='true']) {
			border-color: var(--arc-border-strong);
		}
	}
	.control:focus-visible {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.control[aria-invalid='true'] {
		border-color: var(--arc-danger);
	}
	.control[aria-invalid='true']:focus-visible {
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-danger) 24%, transparent);
	}
	.control:disabled {
		cursor: not-allowed;
		background: var(--arc-surface-muted);
		opacity: 0.6;
	}
	@media (prefers-reduced-motion: reduce) {
		.control {
			transition: none;
		}
	}
</style>
