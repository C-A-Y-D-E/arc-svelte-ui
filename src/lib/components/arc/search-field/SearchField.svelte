<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { motionTransition } from '../input';
	import { isReducedMotion, motionTokens, pressScale } from '../motion';

	type Props = Omit<HTMLInputAttributes, 'type' | 'value'> & {
		label: string;
		value?: string;
		onValueChange?: (value: string) => void;
		ref?: HTMLInputElement | null;
	};

	let {
		label,
		value = $bindable(''),
		onValueChange,
		id,
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const CLEAR_PRESS_SCALE = 0.96;
	const { blur, duration, spring } = motionTokens;
	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);

	function setValue(next: string) {
		value = next;
		onValueChange?.(next);
	}

	/** Clearing returns focus to the field, since the clear button unmounts under the pointer. */
	function clear() {
		setValue('');
		ref?.focus();
	}

	function showClear(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: [0, 1] }
				: { opacity: [0, 1], scale: [0.8, 1], filter: [`blur(${blur.subtle}px)`, 'blur(0px)'] },
			transition: reduced
				? { duration: duration.instant }
				: {
						...spring.snappy,
						opacity: { duration: duration.fast },
						filter: { duration: duration.fast }
					}
		});
	}

	function hideClear(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: 0 }
				: { opacity: 0, scale: 0.8, filter: `blur(${blur.subtle}px)` },
			transition: reduced
				? { duration: 0 }
				: { duration: duration.instant, ease: motionTokens.ease.standard }
		});
	}
</script>

<div class="field">
	<label for={controlId}>{label}</label>
	<div class="shell" data-filled={value ? 'true' : undefined}>
		<SearchIcon size={18} aria-hidden="true" />
		<input
			{...rest}
			bind:this={ref}
			id={controlId}
			type="search"
			{value}
			oninput={(event) => setValue(event.currentTarget.value)}
			class={['input', className]}
		/>
		<!-- The clear button has a reserved slot, so the field never changes width when it appears or leaves. -->
		<span class="clear-slot">
			{#if value}
				<button
					type="button"
					tabindex={0}
					onclick={clear}
					aria-label="Clear search"
					{@attach pressScale(CLEAR_PRESS_SCALE)}
					in:showClear
					out:hideClear
				>
					<XIcon size={16} aria-hidden="true" />
				</button>
			{/if}
		</span>
	</div>
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
	/* The focus ring contracts onto the border while it fades in; the shell never changes size. */
	.shell {
		display: flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: var(--arc-space-2);
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-3);
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
	/* The glass wakes up with the field: muted at rest, full contrast while searching. */
	.shell > :global(svg) {
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.shell:focus-within > :global(svg),
	.shell[data-filled='true'] > :global(svg) {
		color: var(--arc-foreground);
	}
	.input {
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		outline: 0;
	}
	.input:focus-visible {
		outline: 0;
	}
	.input::placeholder {
		color: var(--arc-text-muted);
	}
	.input::-webkit-search-cancel-button {
		display: none;
	}
	.clear-slot {
		display: grid;
		width: 24px;
		height: 24px;
		flex: 0 0 auto;
		place-items: center;
	}
	.shell button {
		display: grid;
		width: 24px;
		height: 24px;
		flex: 0 0 auto;
		place-items: center;
		border: 0;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-text-muted);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.shell button:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.shell button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.shell,
		.shell > :global(svg),
		.shell button {
			transition: none;
		}
	}
</style>
