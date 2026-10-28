<script module lang="ts">
	export type Segment = { left: number; width: number } | null;
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { physicalSpring } from '../text-morph/transitions';
	import { isReducedMotion } from '../motion';

	/** One week's slice of the highlight. It grows out of the edge the range arrives from, so hovering reads as stretching. */
	let { row, segment }: { row: number; segment: Segment } = $props();

	const STRETCH = physicalSpring(0.3, 0.04);
	const initial = untrack(() => segment);

	let bar: HTMLSpanElement;
	let wasEmpty = !initial;

	$effect(() => {
		const reduced = isReducedMotion();
		if (!segment) {
			wasEmpty = true;
			animate(bar, { opacity: 0 }, { duration: reduced ? 0 : 0.14 });
			return;
		}
		const place = { left: `${segment.left}%`, width: `${segment.width}%` };
		animate(bar, place, wasEmpty || reduced ? { duration: 0 } : STRETCH);
		wasEmpty = false;
		animate(bar, { opacity: 1 }, { duration: reduced ? 0 : 0.16 });
	});
</script>

<span
	bind:this={bar}
	class="bar"
	style:top="calc({row} * var(--cell) + 3px)"
	style:left="{initial?.left ?? 0}%"
	style:width="{initial?.width ?? 0}%"
	style:opacity={initial ? 1 : 0}
></span>

<style>
	.bar {
		position: absolute;
		height: calc(var(--cell) - 6px);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-accent-subtle);
	}
</style>
