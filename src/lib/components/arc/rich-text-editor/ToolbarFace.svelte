<script module lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';

	const MS = 1000;
	const TRAVEL_PX = 18;
	const SLIDE_S = motionTokens.spring.morph.visualDuration;
	const FADE_IN = { delay: 0.03, duration: 0.2 };
	const FADE_OUT_S = 0.12;
	const REDUCED_IN_S = 0.14;
	const REDUCED_OUT_S = 0.1;

	const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

	/**
	 * The faces slide and blur across each other. Travel rides the morph spring's duration while
	 * opacity and blur run on their own shorter clock, as in Arc's per-value transitions.
	 */
	function slideFace(
		node: HTMLElement,
		{ direction }: { direction: number },
		options: { direction: 'in' | 'out' | 'both' }
	): TransitionConfig {
		const leaving = options.direction === 'out';
		if (leaving) node.inert = true;
		if (isReducedMotion()) {
			return {
				duration: (leaving ? REDUCED_OUT_S : REDUCED_IN_S) * MS,
				css: (t) => `opacity:${t}`
			};
		}
		const blur = motionTokens.blur.subtle;
		return {
			duration: SLIDE_S * MS,
			css: (t) => {
				const elapsed = (leaving ? 1 - t : t) * SLIDE_S;
				const travel = ease.enter(leaving ? 1 - t : t);
				const x = leaving ? -direction * TRAVEL_PX * travel : direction * TRAVEL_PX * (1 - travel);
				const shown = leaving
					? 1 - ease.standard(clamp01(elapsed / FADE_OUT_S))
					: ease.enter(clamp01((elapsed - FADE_IN.delay) / FADE_IN.duration));
				return `transform:translateX(${x}px);opacity:${shown};filter:blur(${(1 - shown) * blur}px)`;
			}
		};
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		direction,
		onsize,
		children
	}: { direction: number; onsize: (width: number, height: number) => void; children: Snippet } =
		$props();

	let face: HTMLDivElement;

	/** A toolbar face reports its natural size while current, so the shared surface can spring to it. */
	$effect(() => {
		const report = () => onsize(face.offsetWidth, face.offsetHeight);
		report();
		const observer = new ResizeObserver(report);
		observer.observe(face);
		return () => observer.disconnect();
	});
</script>

<div bind:this={face} class="face" in:slideFace={{ direction }} out:slideFace={{ direction }}>
	{@render children()}
</div>

<style>
	.face {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
	}
	.face:global([inert]) {
		pointer-events: none;
	}
</style>
