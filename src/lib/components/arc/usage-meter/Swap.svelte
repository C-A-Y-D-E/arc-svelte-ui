<script lang="ts">
	import { swapOnChange } from '../alert/swap';
	import { motionTokens } from '../motion';

	/** Changed text rises from a soft blur and leaves a little faster than it arrives. */
	let { text }: { text: string } = $props();

	const ENTER_SECONDS = 0.22;
	const EXIT_SECONDS = 0.14;
	const rise = swapOnChange({
		kind: 'text',
		enter: { duration: ENTER_SECONDS, ease: motionTokens.ease.enter },
		exitDuration: EXIT_SECONDS
	});
</script>

<span class="swap"><span class="swap-text" {@attach rise}>{text}</span></span>

<style>
	.swap {
		position: relative;
		display: block;
		min-width: 0;
	}
	.swap-text {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
