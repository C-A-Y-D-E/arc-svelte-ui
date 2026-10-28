<script module lang="ts">
	export type TextMorphTag = 'span' | 'div' | 'p' | 'strong' | 'h1' | 'h2' | 'h3';

	/** Letters match by character and occurrence, so the second "i" in one string pairs with the second "i" in the next. */
	function toGlyphs(text: string) {
		const seen = new Map<string, number>();
		return Array.from(text).map((char) => {
			const count = seen.get(char) ?? 0;
			seen.set(char, count + 1);
			return { char, key: `${char}-${count}` };
		});
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import { motionPresence, springFlip } from './transitions';

	/**
	 * Morphs one short label into the next in place. Letters both strings share glide to their new positions, new letters sharpen in,
	 * removed letters blur away, and the width follows on a spring so the surrounding layout glides instead of jumping.
	 */
	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** The current label. Change it to morph. A prop rather than children, since Svelte children are snippets, not strings. */
		text: string;
		as?: TextMorphTag;
	};

	let { text, as = 'span', ...rest }: Props = $props();

	/** Lets leaving letters start to clear before the first new letter sharpens in their place. */
	const HANDOFF = 0.05;
	const MAX_STAGGERED = 8;
	const WIDTH_EPSILON = 0.5;
	const NBSP = ' ';
	const { blur, duration, stagger, spring } = motionTokens;

	let frame: HTMLSpanElement;
	let track: HTMLSpanElement;
	let width = 0;
	let sizing: ReturnType<typeof animate> | undefined;

	const glyphs = $derived(toGlyphs(text));
	// The previous label tells which letters are new, so only they stagger, in reading order, however far along the word they sit.
	let previousText = $state(untrack(() => text));
	let currentText = untrack(() => text);
	$effect.pre(() => {
		if (text === currentText) return;
		previousText = currentText;
		currentText = text;
	});
	const enterOrder = $derived.by(() => {
		const kept = new Set(toGlyphs(previousText).map((glyph) => glyph.key));
		const order = new Map<string, number>();
		for (const { key } of glyphs) if (!kept.has(key)) order.set(key, order.size);
		return order;
	});

	const measure = (element: HTMLElement) => parseFloat(getComputedStyle(element).width);

	function glyphIn(key: string) {
		const order = Math.min(enterOrder.get(key) ?? 0, MAX_STAGGERED);
		return {
			scale: 0.8,
			y: 0.14,
			em: true,
			blur: blur.soft,
			duration: duration.standard + 0.04,
			delay: HANDOFF + order * stagger.char * 2,
			reducedFade: 0
		};
	}
	const glyphOut = {
		scale: 0.86,
		y: -0.1,
		em: true,
		blur: blur.soft,
		duration: duration.exit,
		easing: ease.standard,
		reducedFade: 0
	};

	// The frame holds an explicit width so a new label never snaps it; the spring then follows the track, which already has the new letters in place.
	$effect(() => {
		void text;
		const next = measure(track);
		if (!Number.isFinite(next)) return;
		const morph = width && Math.abs(next - width) > WIDTH_EPSILON && !isReducedMotion();
		if (morph) sizing = animate(frame, { width: next }, spring.morph);
		else {
			sizing?.stop();
			frame.style.width = `${next}px`;
		}
		width = next;
	});

	// Font loading or a responsive font size changes the width without a new label: follow it immediately.
	$effect(() => {
		const observer = new ResizeObserver(() => {
			const next = measure(track);
			if (!Number.isFinite(next) || Math.abs(next - width) < WIDTH_EPSILON) return;
			sizing?.stop();
			frame.style.width = `${next}px`;
			width = next;
		});
		observer.observe(track);
		return () => observer.disconnect();
	});
</script>

<svelte:element this={as} {...rest}>
	<span class="sr-only">{text}</span>
	<span bind:this={frame} class="frame" aria-hidden="true">
		<span bind:this={track} class="track">
			{#each glyphs as { char, key } (key)}
				<span
					class="glyph"
					animate:springFlip
					in:motionPresence={glyphIn(key)}
					out:motionPresence={glyphOut}
				>
					{char === ' ' ? NBSP : char}
				</span>
			{/each}
		</span>
	</span>
</svelte:element>

<style>
	/* The frame carries the animated width. Its mask reveals new letters through a soft trailing edge as it grows and fades leaving ones as it shrinks.
	   Padding with matching negative margins gives the mask room for blur and descenders without changing layout; the edge sits entirely in that room, so resting text is never dimmed.
	   The track always starts at the frame's leading edge, even in centered text: otherwise it would recenter inside the old width and leaving letters would jump. */
	.frame {
		position: relative;
		display: inline-block;
		box-sizing: content-box;
		padding: 0.5em 0.5em 0.5em 0.2em;
		margin: -0.5em -0.5em -0.5em -0.2em;
		text-align: start;
		white-space: nowrap;
		mask-image: linear-gradient(90deg, #000 calc(100% - 0.5em), transparent);
	}
	/* The track sizes to the letters in flow. Leaving letters are taken out of flow and positioned against it. */
	.track {
		position: relative;
		display: inline-block;
		white-space: nowrap;
	}
	.glyph {
		display: inline-block;
		white-space: pre;
		transform-origin: 50% 60%;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
		user-select: none;
	}
</style>
