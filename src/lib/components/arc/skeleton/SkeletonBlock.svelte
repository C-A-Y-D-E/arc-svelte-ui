<script lang="ts">
	/**
	 * A single placeholder shape sized by its class, for values that aren't text blocks (a price,
	 * a stat, a chart). Not in Arc; it reuses Skeleton's surface and finite pulse so both read as one.
	 */
	type Props = {
		class?: string;
		/** Position in a group; each step pulses a beat later, like Skeleton's lines. */
		index?: number;
	};

	let { class: className, index = 0 }: Props = $props();
</script>

<span class={['block', className]} style:--index={index} aria-hidden="true"></span>

<style>
	/* A calm, finite pulse: each block dims a beat after the previous one, then rests after about 20 seconds. */
	.block {
		display: block;
		border-radius: var(--arc-radius-control);
		background: color-mix(in oklch, var(--arc-border-strong) 38%, var(--arc-surface));
		animation: skeleton-pulse 1.8s var(--arc-ease-in-out) calc(var(--index, 0) * 90ms) 11 both;
	}
	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.52;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.block {
			animation: none;
		}
	}
</style>
