<script module lang="ts">
	type Glyph = { id: string; char: string; order: number };

	/** Shorter shared runs are replaced too, so a one-letter coincidence never pins a stray glyph in place. */
	const MIN_SHARED_RUN = 2;
	const MAX_STAGGER_S = 0.1;

	function toGlyphs(chars: string[], seq: number): Glyph[] {
		return chars.map((char, order) => ({ id: `${seq}:${order}`, char, order }));
	}

	/** Shared leading and trailing characters keep their identity, so only the changed run of text is replaced. */
	function diffGlyphs(
		previousGlyphs: Glyph[],
		previousText: string,
		text: string,
		seq: number
	): Glyph[] {
		const prev = [...previousText];
		const next = [...text];
		let start = 0;
		let end = 0;
		while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
		while (
			end < prev.length - start &&
			end < next.length - start &&
			prev[prev.length - 1 - end] === next[next.length - 1 - end]
		)
			end++;
		if (start < MIN_SHARED_RUN) start = 0;
		if (end < MIN_SHARED_RUN) end = 0;
		return [
			...previousGlyphs.slice(0, start),
			...toGlyphs(next.slice(start, next.length - end), seq),
			...previousGlyphs.slice(previousGlyphs.length - end)
		];
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';

	type Props = HTMLAttributes<HTMLSpanElement> & { text: string };

	let { text, class: className, ...rest }: Props = $props();

	const { blur, duration, stagger } = motionTokens;

	let seq = 0;
	let previous: { text: string; glyphs: Glyph[] } | null = null;

	const glyphs = $derived.by(() => {
		if (!previous) previous = { text, glyphs: toGlyphs([...text], seq) };
		if (previous.text !== text) {
			seq += 1;
			previous = { text, glyphs: diffGlyphs(previous.glyphs, previous.text, text, seq) };
		}
		return previous.glyphs;
	});

	/** Kept letters glide to their new place on the morph spring (Motion's layout="position"). */
	function glide(node: Element, { from, to }: { from: DOMRect; to: DOMRect }) {
		if (!isReducedMotion())
			animate(node, { x: [from.left - to.left, 0] }, motionTokens.spring.morph);
		return { duration: 0 };
	}
</script>

<!-- Svelte takes leaving glyphs out of flow (like popLayout) because the each block is animated. -->
<span class={['glyphs', className]} {...rest}>
	{#each glyphs as glyph (glyph.id)}
		<span
			class="glyph"
			animate:glide
			in:presence={{
				y: 5,
				blur: blur.soft,
				delay: Math.min(glyph.order * stagger.char, MAX_STAGGER_S)
			}}
			out:presence={{ y: -4, blur: blur.subtle, duration: duration.fast, easing: ease.standard }}
			>{glyph.char}</span
		>
	{/each}
</span>

<style>
	.glyphs {
		position: relative;
		display: inline-flex;
		flex: none;
		white-space: pre;
	}
	.glyph {
		display: inline-block;
	}
</style>
