<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';

	type Props = Omit<PopoverPrimitive.ContentProps, 'child'>;

	let {
		ref = $bindable(null),
		class: className,
		align = 'start',
		sideOffset = 6,
		collisionPadding = 10,
		children,
		...rest
	}: Props = $props();
</script>

<PopoverPrimitive.Portal>
	<PopoverPrimitive.Content bind:ref {align} {sideOffset} {collisionPadding} {...rest}>
		{#snippet child({ wrapperProps, props })}
			<div {...wrapperProps}>
				<div {...props} class={['content', className]}>{@render children?.()}</div>
			</div>
		{/snippet}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Portal>

<style>
	.content {
		--popover-x: 0px;
		--popover-y: -5px;
		z-index: 80;
		min-width: 12rem;
		max-width: min(22rem, calc(100vw - 20px));
		padding: 1rem;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: var(--bits-popover-content-transform-origin);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-enter),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	/* The panel starts a few pixels toward its trigger and settles on a spring; it leaves faster than it arrives.
	   Transitions instead of keyframes, so a close that interrupts the open, or a reopen during the close, reverses from where the panel is. */
	.content[data-side='top'] {
		--popover-y: 5px;
	}
	.content[data-side='left'] {
		--popover-x: 5px;
		--popover-y: 0px;
	}
	.content[data-side='right'] {
		--popover-x: -5px;
		--popover-y: 0px;
	}
	@starting-style {
		.content[data-state='open'] {
			opacity: 0;
			transform: translate(var(--popover-x), var(--popover-y)) scale(0.97);
		}
	}
	/* bits-ui unmounts once the running transitions finish, so the exit needs no keyframe of its own. */
	.content[data-state='closed'] {
		opacity: 0;
		transform: translate(calc(var(--popover-x) * 0.5), calc(var(--popover-y) * 0.5)) scale(0.98);
		transition:
			opacity 140ms var(--arc-ease-standard),
			transform 140ms var(--arc-ease-standard);
		pointer-events: none;
	}
	.content:focus {
		outline: none;
	}
	.content:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	@media (prefers-reduced-motion: reduce) {
		.content,
		.content[data-state='closed'] {
			transform: none;
			transition: opacity var(--arc-duration-instant) linear;
		}
	}
</style>
