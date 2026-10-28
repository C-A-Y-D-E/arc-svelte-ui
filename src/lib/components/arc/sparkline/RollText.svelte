<script module lang="ts">
	type Chunk = { slot: string; key: string; text: string };
	type Spot = { top: number; left: number; right: number };

	/** A number keeps its unchanged digits still, keyed by place from the right. Words key on everything up to them, so only the first changed word and what follows it roll. */
	function chunksOf(text: string, whole: boolean): Chunk[] {
		if (!text) return [];
		if (whole) return [{ slot: 'all', key: text, text }];
		if (!/\p{L}/u.test(text))
			return [...text].map((char, index, all) => ({
				slot: `n${all.length - index}`,
				key: char,
				text: char
			}));
		const words = text.split(/(?<=\s)/);
		return words.map((word, index) => ({
			slot: `w${index}`,
			key: words.slice(0, index + 1).join(''),
			text: word
		}));
	}

	const amountIn = (text: string) =>
		Number(
			text
				.replace(/,/g, '')
				.replace(/−/g, '-')
				.match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN
		);
</script>

<script lang="ts">
	import { animate } from 'motion';
	import type { TransitionConfig } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';

	type Props = {
		text: string;
		/** 1 rolls up (a larger value rises from below), -1 rolls down. Worked out from the numbers in the text when left out. */
		direction?: number;
		/** Rolls the text as one piece instead of by digit or word. */
		whole?: boolean;
		/** Springs the wrapper to the new text's width, so nothing beside it jumps. */
		morph?: boolean;
		/** Class on each glyph; changing it rolls the glyphs too. */
		glyphClass?: string;
	};

	let { text, direction, whole = false, morph = false, glyphClass }: Props = $props();

	/** Copy moves about a third of a line as it rolls. */
	const ROLL_EM = 0.3;
	const { blur, duration } = motionTokens;
	const MS = 1000;

	let root: HTMLSpanElement;
	let sizer = $state<HTMLSpanElement>();
	// svelte-ignore state_referenced_locally
	let previousText = text;
	let rollDirection = 1;
	const spots = new WeakMap<Element, Spot>();

	const numeric = $derived(!whole && !/\p{L}/u.test(text));
	const anchor = $derived(numeric ? 'right' : 'left');
	const chunks = $derived(chunksOf(text, whole));

	/** Outgoing pieces pop out of flow where they stood, so the wrapper never holds both widths. Positions are read before the DOM changes. */
	$effect.pre(() => {
		void text;
		void glyphClass;
		if (text !== previousText) {
			rollDirection = direction ?? (amountIn(text) < amountIn(previousText) ? -1 : 1);
			previousText = text;
		}
		if (!root) return;
		for (const piece of root.querySelectorAll<HTMLElement>('[data-roll-piece]')) {
			const parentWidth = (piece.offsetParent as HTMLElement | null)?.clientWidth ?? 0;
			spots.set(piece, {
				top: piece.offsetTop,
				left: piece.offsetLeft,
				right: parentWidth - piece.offsetLeft - piece.offsetWidth
			});
		}
	});

	/** A piece that comes back while still leaving returns to the flow. */
	function rollIn(node: HTMLElement): TransitionConfig {
		Object.assign(node.style, { position: '', top: '', left: '', right: '' });
		if (isReducedMotion()) return { duration: duration.instant * MS, css: (t) => `opacity:${t}` };
		const way = direction ?? rollDirection;
		return {
			duration: duration.standard * MS,
			easing: ease.enter,
			css: (t, u) =>
				`opacity:${t};transform:translateY(${ROLL_EM * way * u}em);filter:blur(${blur.soft * u}px)`
		};
	}

	function rollOut(node: HTMLElement): TransitionConfig {
		const spot = spots.get(node);
		if (spot) {
			node.style.position = 'absolute';
			node.style.top = `${spot.top}px`;
			node.style[anchor] = `${spot[anchor]}px`;
		}
		if (isReducedMotion()) return { duration: duration.instant * MS, css: (t) => `opacity:${t}` };
		const way = direction ?? rollDirection;
		return {
			duration: duration.fast * MS,
			easing: ease.standard,
			css: (t, u) =>
				`opacity:${t};transform:translateY(${-ROLL_EM * way * u}em);filter:blur(${blur.subtle * u}px)`
		};
	}

	// Layout size, not the transformed rect, so a scaling parent never leaves the text clipped. Only a new text springs; font loads jump.
	$effect(() => {
		if (!sizer) return;
		const node = sizer;
		let measured: string | null = null;
		const observer = new ResizeObserver(([entry]) => {
			const next = entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth;
			if (measured !== null && measured !== node.textContent && !isReducedMotion())
				animate(root, { width: next }, motionTokens.spring.morph);
			else root.style.width = `${next}px`;
			measured = node.textContent;
		});
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<span bind:this={root} class="roll" data-end={numeric || undefined} data-whole={whole || undefined}>
	{#if morph}<span bind:this={sizer} class="sizer" aria-hidden="true">{text}</span>{/if}
	<!-- One flex item holds the pieces, so they stay inline and the text reads and copies as one string. -->
	<span class="track">
		{#each chunks as chunk (chunk.slot)}
			<span class="slot" data-roll-piece in:rollIn out:rollOut>
				{#key `${glyphClass ?? ''}${chunk.key}`}
					<span class={['glyph', glyphClass]} data-roll-piece in:rollIn out:rollOut
						>{chunk.text}</span
					>
				{/key}
			</span>
		{/each}
	</span>
</span>

<style>
	/* Changing text rolls in place. Numbers stay anchored to their right edge. */
	.roll {
		position: relative;
		display: inline-flex;
		max-width: 100%;
		overflow-x: clip;
		white-space: pre;
		vertical-align: top;
	}
	.roll[data-end] {
		justify-content: flex-end;
	}
	.track,
	.slot,
	.glyph {
		position: relative;
		display: inline-block;
		white-space: pre;
	}
	.roll[data-whole] .track,
	.roll[data-whole] .slot,
	.roll[data-whole] .glyph {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: top;
	}
	.sizer {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: pre;
		pointer-events: none;
	}
</style>
