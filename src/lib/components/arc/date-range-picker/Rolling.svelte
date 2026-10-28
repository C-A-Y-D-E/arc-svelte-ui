<script lang="ts">
	import { motionPresence } from '../text-morph/transitions';
	import { ease, motionTokens } from '../motion';

	/** Words roll one by one: a later date rises from below, an earlier one drops from above; words that stay the same hold still. */
	let { text, direction }: { text: string; direction: number } = $props();

	const words = $derived(text.split(/\s+/).filter(Boolean));
	const { blur } = motionTokens;
	const rollIn = (towards: number) => ({
		y: towards * 0.45,
		em: true,
		blur: blur.subtle,
		duration: 0.26,
		easing: ease.enter,
		reducedFade: 0.12
	});
	const rollOut = (towards: number) => ({
		y: towards * -0.45,
		em: true,
		blur: blur.subtle,
		duration: 0.14,
		easing: ease.standard,
		pop: true,
		reducedFade: 0.08
	});
</script>

<span class="rolling" aria-hidden="true">
	{#each words as word, index (index)}
		<span class="word">
			{#key word}
				<span
					class="word-inner"
					in:motionPresence={rollIn(direction)}
					out:motionPresence={rollOut(direction)}>{word}</span
				>
			{/key}
		</span>
	{/each}
</span>

<style>
	/* Words roll in their own slots; a leaving word pops out of flow so the next one never waits for space. */
	.rolling {
		display: inline-flex;
		gap: 0.28em;
		white-space: nowrap;
	}
	.word {
		position: relative;
		display: inline-block;
	}
	.word-inner {
		display: inline-block;
	}
</style>
