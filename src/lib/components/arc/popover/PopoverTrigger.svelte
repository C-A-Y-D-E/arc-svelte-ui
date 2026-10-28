<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...rest
	}: PopoverPrimitive.TriggerProps = $props();
</script>

<!-- The trigger anchors the panel, so it opts out of press-scale: a scaled rect measured on open would shift the panel as the trigger springs back. -->
<PopoverPrimitive.Trigger bind:ref class={['arc-popover-anchor', className]} {...rest} />

<style>
	/* Press feedback on the anchor stays in color. */
	:global(.arc-popover-anchor:active:not(:disabled)) {
		transform: none;
	}
</style>
