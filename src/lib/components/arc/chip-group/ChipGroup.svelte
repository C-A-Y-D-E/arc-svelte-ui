<script module lang="ts">
	export type Chip = {
		value: string;
		label: string;
		/** Muted number after the label, such as how many items the chip filters to. */
		count?: number;
	};
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		chips: Chip[];
		value: string;
		onValueChange?: (value: string) => void;
		/** aria-label for the group. */
		label?: string;
	};

	let {
		chips,
		value = $bindable(),
		onValueChange,
		label,
		class: className,
		...rest
	}: Props = $props();

	function choose(next: string) {
		value = next;
		onValueChange?.(next);
	}
</script>

<!-- Not in Arc. A compact filter row that wraps onto as many lines as it needs, with no frame of its own so it can sit inside a popup. -->
<div class={['root', className]} role="group" aria-label={label} {...rest}>
	{#each chips as chip (chip.value)}
		<button
			type="button"
			class="chip"
			aria-pressed={value === chip.value}
			onclick={() => choose(chip.value)}
		>
			<span>{chip.label}</span>
			{#if chip.count !== undefined}<span class="count">{chip.count}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.root {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.chip {
		display: inline-flex;
		min-height: 1.75rem;
		align-items: center;
		gap: 5px;
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 6px);
		padding: 0 10px;
		background: transparent;
		color: var(--arc-text-muted);
		font: inherit;
		font-size: var(--arc-text-xs);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.count {
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
	}
	@media (hover: hover) and (pointer: fine) {
		.chip:hover {
			color: var(--arc-foreground);
		}
	}
	.chip[aria-pressed='true'] {
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	.chip:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.chip {
			transition: none;
		}
	}
</style>
