<script lang="ts">
	import { ease, motionTokens, presence } from '../motion';

	let { text }: { text: string } = $props();

	const RISE_EM = 0.3;
	const SWAP_IN_SECONDS = 0.24;
	const SWAP_OUT_SECONDS = 0.15;

	function emToPx(node: Element, em: number) {
		return parseFloat(getComputedStyle(node).fontSize) * em;
	}

	function riseIn(node: Element) {
		return presence(node, {
			y: emToPx(node, RISE_EM),
			blur: motionTokens.blur.soft,
			duration: SWAP_IN_SECONDS
		});
	}

	function liftOut(node: Element) {
		return presence(node, {
			y: -emToPx(node, RISE_EM),
			blur: motionTokens.blur.subtle,
			duration: SWAP_OUT_SECONDS,
			easing: ease.standard,
			pop: true
		});
	}
</script>

<!-- When the title or description changes while open, the new copy rises in and the old copy leaves upward. -->
{#key text}
	<span class="swap" in:riseIn out:liftOut>{text}</span>
{/key}

<style>
	.swap {
		display: block;
	}
</style>
