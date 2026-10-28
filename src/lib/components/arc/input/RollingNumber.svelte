<script lang="ts">
	import { isReducedMotion, motionTokens } from '../motion';
	import { motionTransition } from './motion-transition';

	type Props = {
		value: string;
		/** How far a digit travels as it turns, in px. */
		travel?: number;
	};

	let { value, travel = 7 }: Props = $props();

	const { blur, duration, spring } = motionTokens;
	const instant = { duration: 0 };

	let lastValue: string | undefined;
	/** Digits roll up when the number grows and down when it shrinks; leaving digits read the latest direction. */
	const direction = $derived.by(() => {
		const shrinking = lastValue !== undefined && toNumber(value) < toNumber(lastValue);
		lastValue = value;
		return shrinking ? -1 : 1;
	});
	const characters = $derived(value.split(''));
	const digitTiming = $derived(
		isReducedMotion()
			? instant
			: {
					y: spring.snappy,
					opacity: { duration: duration.fast },
					filter: { duration: duration.fast }
				}
	);
	const columnTiming = $derived(
		isReducedMotion() ? instant : { width: spring.morph, opacity: { duration: duration.fast } }
	);

	function toNumber(word: string) {
		return parseFloat(word.replace(/,/g, ''));
	}

	/** A gained digit opens its width; the inline width clears once it lands, so a narrower glyph never keeps a gap. */
	function openColumn(node: HTMLElement) {
		return motionTransition(node, {
			keyframes: { width: [0, node.offsetWidth], opacity: [0, 1] },
			transition: { ...columnTiming, onComplete: () => node.style.removeProperty('width') }
		});
	}

	function closeColumn(node: HTMLElement) {
		return motionTransition(node, {
			keyframes: { width: 0, opacity: 0 },
			transition: columnTiming
		});
	}

	function turnIn(node: HTMLElement) {
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				y: [direction * travel, 0],
				filter: [`blur(${blur.subtle}px)`, 'blur(0px)']
			},
			transition: digitTiming
		});
	}

	function turnOut(node: HTMLElement) {
		return motionTransition(node, {
			keyframes: { opacity: 0, y: -direction * travel, filter: `blur(${blur.subtle}px)` },
			transition: digitTiming,
			pop: true
		});
	}
</script>

<!-- Columns are keyed by place value, so 10 → 9 lets the tens column narrow away while the ones column turns. -->
{#each characters as character, index (characters.length - index)}
	<span class="column" in:openColumn out:closeColumn>
		{#key character}
			<span class="digit" in:turnIn out:turnOut>{character}</span>
		{/key}
	</span>
{/each}

<style>
	/* One column per character of a count. Tabular digits keep columns equal, so only a gained or lost digit changes the width. */
	.column {
		position: relative;
		display: inline-flex;
		justify-content: center;
		font-variant-numeric: tabular-nums;
	}
	.digit {
		display: inline-block;
	}
</style>
