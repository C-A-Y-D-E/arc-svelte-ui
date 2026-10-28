<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	type Props = Omit<TabsPrimitive.TriggerProps, 'child'>;

	let { ref = $bindable(null), value, class: className, children, ...rest }: Props = $props();
</script>

<TabsPrimitive.Trigger {value} {...rest}>
	{#snippet child({ props })}
		<button {...props} bind:this={ref} data-value={value} class={['trigger', className]}>
			<span class="trigger-label">{@render children?.()}</span>
		</button>
	{/snippet}
</TabsPrimitive.Trigger>

<style>
	.trigger {
		position: relative;
		-webkit-tap-highlight-color: transparent;
		display: inline-grid;
		min-width: 5.5rem;
		place-items: center;
		flex: 0 0 auto;
		min-height: var(--arc-control-height-sm);
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 3px);
		padding: 0 var(--arc-space-3);
		background: transparent;
		color: var(--arc-text-muted);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover {
			color: var(--arc-foreground);
		}
	}
	.trigger:active {
		color: var(--arc-foreground);
	}
	.trigger[data-state='active'] {
		color: var(--arc-highlight-strong);
	}
	.trigger-label {
		position: relative;
		z-index: 1;
	}
	.trigger:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger {
			transition: none;
		}
	}
</style>
