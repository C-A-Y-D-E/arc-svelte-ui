<script lang="ts">
	import { ease, motionTokens, presence } from '../motion';

	let { value }: { value: string } = $props();

	/** About 0.3em at the block's text size. */
	const RISE_PX = 4;
</script>

<!-- Text that changes in place: the new words rise in with a soft blur while the old ones leave upward, faster. -->
{#key value}
	<span
		class="swap-text"
		in:presence={{ y: RISE_PX, blur: motionTokens.blur.soft }}
		out:presence={{
			y: -RISE_PX,
			blur: motionTokens.blur.subtle,
			duration: motionTokens.duration.instant,
			easing: ease.standard
		}}>{value}</span
	>
{/key}

<style>
	.swap-text {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
