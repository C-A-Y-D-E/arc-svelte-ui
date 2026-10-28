<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { presenceEm } from '../animated-counter/motion-extras';
	import { ease, isReducedMotion, motionTokens } from '../motion';

	/** `morph` springs the wrapper to the new text's width instead of letting it snap. */
	let {
		text,
		morph = false,
		block = false
	}: { text: string; morph?: boolean; block?: boolean } = $props();

	const SHIFT_EM = 0.3;
	const { blur, duration, spring } = motionTokens;

	let wrapper: HTMLSpanElement;
	let sizer = $state<HTMLSpanElement>();
	let shownText = untrack(() => text);
	let lastDirection = 1;

	const amountIn = (copy: string) =>
		Number(copy.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);

	/** Copy that holds a number enters from the side it moved toward: a larger value rises from below, a smaller one drops from above. */
	const direction = $derived.by(() => {
		if (text !== shownText) {
			lastDirection = amountIn(text) < amountIn(shownText) ? -1 : 1;
			shownText = text;
		}
		return lastDirection;
	});

	$effect(() => {
		const node = sizer;
		if (!morph || !node) return;
		let measured: string | null = null;
		// Layout size, not the transformed rect, so a scaling parent never leaves the text clipped. Only a new text springs; font loads jump.
		const observer = new ResizeObserver(([entry]) => {
			const next = entry.borderBoxSize?.[0]?.inlineSize ?? node.offsetWidth;
			if (next && measured !== null && measured !== node.textContent && !isReducedMotion()) {
				animate(wrapper, { width: next }, spring.morph);
			} else {
				wrapper.style.width = next ? `${next}px` : 'auto';
			}
			measured = next ? node.textContent : null;
		});
		observer.observe(node);
		return () => observer.disconnect();
	});
</script>

<span bind:this={wrapper} class={block ? 'swap-block' : 'swap'}>
	{#if morph}
		<span bind:this={sizer} class="sizer" aria-hidden="true">{text}</span>
	{/if}
	{#key text}
		<span
			class="text"
			in:presenceEm={{ y: SHIFT_EM * direction, blur: blur.soft }}
			out:presenceEm={{
				y: -SHIFT_EM * direction,
				blur: blur.subtle,
				duration: duration.fast,
				easing: ease.standard
			}}>{text}</span
		>
	{/key}
</span>

<style>
	/* Old and new copy share one grid cell while they cross; a morphing wrapper takes its width from the sizer, never from both copies. */
	.swap,
	.swap-block {
		position: relative;
		max-width: 100%;
	}
	.swap {
		display: inline-grid;
		overflow-x: clip;
		white-space: nowrap;
		vertical-align: top;
	}
	.swap-block {
		display: grid;
	}
	.text {
		grid-area: 1 / 1;
	}
	.swap > .text {
		display: inline-block;
	}
	.swap-block > .text {
		display: block;
	}
	.sizer {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}
</style>
