<script lang="ts">
	import { animate } from 'motion';
	import { isReducedMotion, motionTokens } from '../motion';
	import { textSwapIn, textSwapOut } from '../dialog/text-swap';

	let { text }: { text: string } = $props();

	const SWAP_IN_SECONDS = 0.22;
	const SWAP_OUT_SECONDS = 0.14;

	let box: HTMLSpanElement;
	let measure: HTMLSpanElement;

	/** String content crossfades when it changes while open, and the bubble springs to the new text size. */
	$effect(() => {
		let measuredText: string | null = null;
		const observer = new ResizeObserver(([entry]) => {
			const size = entry.borderBoxSize?.[0];
			const current = measure.textContent;
			const morph = measuredText !== null && measuredText !== current && !isReducedMotion();
			measuredText = current;
			animate(
				box,
				{
					width: Math.ceil(size?.inlineSize ?? measure.offsetWidth),
					height: Math.ceil(size?.blockSize ?? measure.offsetHeight)
				},
				morph ? motionTokens.spring.morph : { duration: 0 }
			);
		});
		observer.observe(measure);
		return () => observer.disconnect();
	});
</script>

<span bind:this={box} class="text">
	<span bind:this={measure} class="measure" aria-hidden="true">{text}</span>
	{#key text}
		<span
			class="line"
			in:textSwapIn={{ duration: SWAP_IN_SECONDS }}
			out:textSwapOut={{ duration: SWAP_OUT_SECONDS }}>{text}</span
		>
	{/key}
</span>

<style>
	.text {
		position: relative;
		display: block;
		overflow: clip;
		overflow-clip-margin: var(--arc-space-2);
	}
	.measure {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		max-width: calc(15rem - 2 * var(--arc-space-4) - 2px);
		visibility: hidden;
		pointer-events: none;
	}
	.line {
		display: block;
		width: max-content;
		max-width: calc(15rem - 2 * var(--arc-space-4) - 2px);
	}
</style>
