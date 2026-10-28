<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { FieldMessage } from '../input';
	import { strings } from '../strings';
	import EyeMorph from './EyeMorph.svelte';

	type Props = Omit<HTMLInputAttributes, 'type'> & {
		label: string;
		description?: string;
		ref?: HTMLInputElement | null;
	};

	let {
		label,
		description,
		id,
		value = $bindable(),
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const hintId = $derived(description ? `${controlId}-description` : undefined);
	const describedBy = $derived(
		[rest['aria-describedby'], hintId].filter(Boolean).join(' ') || undefined
	);

	let visible = $state(false);
	let toggled = $state(false);

	function toggleVisible() {
		visible = !visible;
		toggled = true;
	}
</script>

<div class="field">
	<label for={controlId}>{label}</label>
	<div class="shell">
		<!-- data-reveal only appears after the first toggle, so the value resolves on each change but never on mount. -->
		<input
			{...rest}
			bind:this={ref}
			bind:value
			id={controlId}
			type={visible ? 'text' : 'password'}
			data-reveal={toggled ? (visible ? 'shown' : 'hidden') : undefined}
			aria-describedby={describedBy}
			class={['input', className]}
		/>
		<button
			type="button"
			onclick={toggleVisible}
			aria-label={visible ? strings.passwordHide() : strings.passwordShow()}
			aria-pressed={visible}
		>
			<EyeMorph slashed={visible} />
		</button>
	</div>
	<FieldMessage id={hintId} text={description} rollNumbers={false} />
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
	/* The focus ring contracts onto the border while it fades in; the shell never changes size. */
	.shell {
		display: flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-2) 0 var(--arc-space-3);
		background: var(--arc-surface);
		box-shadow: 0 0 0 6px transparent;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.shell:hover:not(:focus-within) {
			border-color: var(--arc-border-strong);
		}
	}
	.shell:focus-within {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
		outline: 2px solid transparent;
		outline-offset: 2px;
	}
	.shell:has(.input[aria-invalid='true']) {
		border-color: var(--arc-danger);
	}
	.shell:has(.input[aria-invalid='true']):focus-within {
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-danger) 24%, transparent);
	}
	.input {
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		outline: 0;
	}
	.input:focus-visible {
		outline: 0;
	}
	.input::placeholder {
		color: var(--arc-text-muted);
	}
	/* Switching between dots and characters resolves in place instead of snapping. Swapping the keyframe name restarts it. */
	.input[data-reveal='shown'] {
		animation: resolve-shown var(--arc-duration-standard) var(--arc-ease-enter);
	}
	.input[data-reveal='hidden'] {
		animation: resolve-hidden var(--arc-duration-standard) var(--arc-ease-enter);
	}
	@keyframes resolve-shown {
		from {
			opacity: 0.35;
			filter: blur(2px);
		}
	}
	@keyframes resolve-hidden {
		from {
			opacity: 0.35;
			filter: blur(2px);
		}
	}
	.shell button {
		display: grid;
		width: 30px;
		height: 30px;
		flex: 0 0 auto;
		place-items: center;
		border: 0;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-text-muted);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.shell button:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.shell button:active {
		transform: scale(0.96);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 100ms var(--arc-ease-standard);
	}
	.shell button[aria-pressed='true'] {
		color: var(--arc-foreground);
	}
	.shell button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.shell,
		.shell button {
			transition: none;
		}
		.shell button:active {
			transform: none;
		}
		.input[data-reveal] {
			animation: none;
		}
	}
</style>
