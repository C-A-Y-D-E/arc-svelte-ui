<script lang="ts">
	import { animate, motionValue, styleEffect } from 'motion';
	import { isReducedMotion, motionTokens } from '../motion';
	import { textIn, textOut } from './transitions';

	let { text }: { text: string } = $props();

	let box: HTMLSpanElement;
	let measure: HTMLSpanElement;
	const width = motionValue<number | string>('auto');

	$effect(() => styleEffect(box, { width }));

	/** Text that swaps with a rise and blur while its box springs to the new width, so nothing beside it snaps. */
	$effect(() => {
		const reduced = isReducedMotion();
		let last: string | null = null;
		// The observer reports the layout size, so an entering chip's scale never shrinks the measurement.
		const observer = new ResizeObserver(([entry]) => {
			const next = Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? measure.offsetWidth);
			const changed = last !== null && last !== measure.textContent;
			last = measure.textContent;
			// Only a new value morphs; the first measure and font swaps settle at once.
			if (changed && !reduced) animate(width, next, motionTokens.spring.morph);
			else width.jump(next);
		});
		observer.observe(measure);
		return () => observer.disconnect();
	});
</script>

<span class="morph-text" bind:this={box}>
	<span class="measure" aria-hidden="true" bind:this={measure}>{text}</span>
	{#key text}
		<span class="morph-value" in:textIn out:textOut={{ pop: true }}>{text}</span>
	{/key}
</span>

<style>
	.morph-text {
		position: relative;
		display: inline-flex;
		overflow-x: clip;
		overflow-y: visible;
		white-space: nowrap;
		vertical-align: bottom;
	}
	.morph-value {
		display: inline-block;
		flex: none;
		white-space: nowrap;
	}
	.measure {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
