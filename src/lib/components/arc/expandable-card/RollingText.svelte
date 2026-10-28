<script lang="ts">
	import { measureSpot, textSwapIn, textSwapOut, type TextSpot } from '../dialog/text-swap';

	let { text }: { text: string } = $props();

	const RISE_EM = 0.35;

	const words = $derived(text.split(/(\s+)/));
	let row: HTMLSpanElement;
	const spots = new WeakMap<Element, TextSpot>();

	// Measured before the words change, so a leaving word pins where it stood rather than where new words pushed it.
	$effect.pre(() => {
		void text;
		if (!row) return;
		for (const word of row.children) spots.set(word, measureSpot(word as HTMLElement));
	});

	function wordOut(node: HTMLElement) {
		return textSwapOut(node, { spot: spots.get(node) });
	}
</script>

<!-- Changed words in the summary rise in; unchanged words hold still. -->
<span class="roll">
	<span class="sr-only">{text}</span>
	<span bind:this={row} aria-hidden="true">
		{#each words as word, index (`${index}:${word}`)}
			<span class="word" in:textSwapIn={{ riseEm: RISE_EM }} out:wordOut>{word}</span>
		{/each}
	</span>
</span>

<style>
	.roll {
		position: relative;
		display: block;
	}
	.word {
		display: inline-block;
		white-space: pre;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
