<script lang="ts">
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';

	let { text, direction = 1 }: { text: string; direction?: number } = $props();

	const RISE_EM = 0.3;
	const ENTER_S = 0.22;
	const LEAVE_S = 0.14;

	function riseDistance(node: Element) {
		return parseFloat(getComputedStyle(node).fontSize) * RISE_EM;
	}

	function riseIn(node: Element) {
		return presence(node, {
			y: riseDistance(node) * direction,
			blur: motionTokens.blur.soft,
			duration: ENTER_S
		});
	}

	function liftOut(node: Element) {
		if (isReducedMotion()) return { duration: 0 };
		return presence(node, {
			y: -riseDistance(node) * direction,
			blur: motionTokens.blur.subtle,
			duration: LEAVE_S,
			easing: ease.standard,
			pop: true
		});
	}
</script>

<!-- Text that changes in place: the new value rises in from a soft blur while the old one lifts away a little faster. -->
<span class="rise" aria-hidden="true">
	{#key text}
		<span class="rise-line" in:riseIn out:liftOut>{text}</span>
	{/key}
</span>

<style>
	.rise {
		position: relative;
		display: inline-flex;
	}
	.rise-line {
		display: inline-block;
		white-space: nowrap;
	}
</style>
