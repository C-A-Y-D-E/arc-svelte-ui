<script module lang="ts">
	import { ease, motionTokens } from '../motion';

	const { blur, duration } = motionTokens;
	const SWAP_SHIFT_EM = 0.45;

	export const swapIn = {
		y: SWAP_SHIFT_EM,
		blur: blur.subtle,
		duration: duration.standard,
		easing: ease.enter
	};
	export const swapOut = {
		y: -SWAP_SHIFT_EM,
		blur: blur.subtle,
		duration: duration.fast,
		easing: ease.standard
	};
</script>

<script lang="ts">
	import { presenceEm } from '../animated-counter/motion-extras';

	let { text, candidates }: { text: string; candidates: string[] } = $props();

	const sizers = $derived([...new Set(candidates)]);
</script>

<!-- Every candidate sits in the same grid cell, so the box always has the width of the longest one and nothing around it moves when the text changes. -->
<span class="swap">
	{#each sizers as candidate (candidate)}
		<span class="swap-sizer" aria-hidden="true">{candidate}</span>
	{/each}
	{#key text}
		<span class="swap-text" in:presenceEm={swapIn} out:presenceEm={swapOut}>{text}</span>
	{/key}
</span>

<style>
	.swap {
		position: relative;
		display: inline-grid;
		justify-items: center;
		overflow-y: clip;
		overflow-clip-margin: 2px;
	}
	.swap-sizer {
		grid-area: 1 / 1;
		visibility: hidden;
	}
	.swap-text {
		grid-area: 1 / 1;
		display: inline-block;
	}
</style>
