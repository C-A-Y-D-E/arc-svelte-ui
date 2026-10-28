<script lang="ts">
	import { motionTransition } from '../input';
	import { isReducedMotion, motionTokens } from '../motion';
	import type { Part } from './parts';
	import Wheel from './Wheel.svelte';

	let { parts, direction, instant }: { parts: Part[]; direction: number; instant: boolean } =
		$props();

	const SHIFT_EM = 0.3;
	const HIDDEN_SCALE = 0.6;
	const BLUR_SETTLE_S = 0.3;
	const { blur, duration, spring, ease } = motionTokens;

	/** A column or character opens its width while it rises in the direction of change. Scale and opacity ride the width spring, so a digit grows with its slot instead of landing on its neighbours. */
	function open(node: HTMLElement) {
		if (instant)
			return motionTransition(node, {
				keyframes: { opacity: [1, 1] },
				transition: { duration: 0 }
			});
		if (isReducedMotion()) {
			return motionTransition(node, {
				keyframes: { opacity: [0, 1] },
				transition: { duration: duration.instant }
			});
		}
		return motionTransition(node, {
			keyframes: {
				width: [0, node.offsetWidth],
				scale: [HIDDEN_SCALE, 1],
				opacity: [0, 1],
				y: [`${direction * SHIFT_EM}em`, 0],
				filter: [`blur(${blur.soft}px)`, 'blur(0px)']
			},
			transition: {
				width: spring.morph,
				scale: spring.morph,
				opacity: spring.morph,
				y: spring.snappy,
				filter: { duration: BLUR_SETTLE_S, ease: ease.standard },
				onComplete: () => {
					node.style.removeProperty('width');
					node.style.removeProperty('filter');
				}
			}
		});
	}

	/** A leaving column closes on a spring that never passes zero. */
	function close(node: HTMLElement) {
		if (instant || isReducedMotion())
			return motionTransition(node, { keyframes: { opacity: 0 }, transition: { duration: 0 } });
		return motionTransition(node, {
			keyframes: {
				width: 0,
				scale: HIDDEN_SCALE,
				opacity: 0,
				y: `${direction * -SHIFT_EM}em`,
				filter: `blur(${blur.subtle}px)`
			},
			transition: {
				width: spring.smooth,
				scale: spring.smooth,
				y: { duration: duration.fast, ease: ease.standard },
				opacity: { duration: duration.instant },
				filter: { duration: duration.instant }
			}
		});
	}
</script>

{#each parts as part (part.key)}
	<span class={'digit' in part ? 'column' : 'symbol'} in:open out:close>
		{#if 'digit' in part}
			<Wheel digit={part.digit} {direction} {instant} />
		{:else}
			{part.text}
		{/if}
	</span>
{/each}

<style>
	/* Each digit is a wheel whose window reaches a little past the line box and feathers out, so a turning digit fades at the edge instead of being cut. The window clips vertically only. */
	.column {
		--feather: 0.2em;
		position: relative;
		display: inline-block;
		overflow-x: visible;
		overflow-y: clip;
		margin-block: calc(var(--feather) * -1);
		padding-block: var(--feather);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 calc(var(--feather) * 1.5),
			#000 calc(100% - var(--feather) * 1.5),
			transparent
		);
		mask-repeat: repeat-x;
		mask-clip: no-clip;
	}
	.symbol {
		display: inline-block;
		overflow-x: clip;
		white-space: pre;
	}
</style>
