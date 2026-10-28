<script lang="ts">
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import { isReducedMotion, motionTokens } from '../motion';
	import { widthPresence } from './motion-extras';

	type Props = { digit: number; direction: number; armed: boolean; delay: number };

	let { digit, direction, armed, delay }: Props = $props();

	const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	const WHEEL_SIZE = DIGITS.length;
	const HALF_WHEEL = WHEEL_SIZE / 2;
	const SHARP_BELOW = 0.02;
	const reveal = {
		...motionTokens.spring.smooth,
		visualDuration: motionTokens.duration.considered
	};

	const startDigit = untrack(() => (armed ? 0 : digit));
	const position = motionValue(startDigit);
	const wheel = { digit: startDigit, target: startDigit, revealed: untrack(() => !armed) };
	let wheelPosition = $state(startDigit);

	$effect(() => position.on('change', (next) => (wheelPosition = next)));

	/** A digit wheel. It always turns in the direction the whole number moved, wrapping 9 → 0 like an odometer. */
	$effect(() => {
		if (armed || wheel.digit === digit) {
			if (!armed) wheel.revealed = true;
			return;
		}
		const forward = (digit - wheel.digit + WHEEL_SIZE) % WHEEL_SIZE;
		const backward = (wheel.digit - digit + WHEEL_SIZE) % WHEEL_SIZE;
		wheel.target += direction < 0 && wheel.revealed ? -backward : forward;
		wheel.digit = digit;
		if (isReducedMotion()) position.jump(wheel.target);
		else
			animate(
				position,
				wheel.target,
				wheel.revealed ? motionTokens.spring.smooth : { ...reveal, delay }
			);
		wheel.revealed = true;
	});

	/** One digit's offset from the wheel position decides where it sits and how visible it is. */
	function offsetOf(glyph: number) {
		return (
			((((glyph - wheelPosition) % WHEEL_SIZE) + WHEEL_SIZE + HALF_WHEEL) % WHEEL_SIZE) - HALF_WHEEL
		);
	}

	function blurAt(distance: number) {
		if (distance < SHARP_BELOW || distance >= 1) return 'none';
		return `blur(${(distance * motionTokens.blur.subtle).toFixed(2)}px)`;
	}
</script>

<span class="column" transition:widthPresence>
	<span class="sizer">0</span>
	{#each DIGITS as glyph (glyph)}
		{@const offset = offsetOf(glyph)}
		{@const distance = Math.abs(offset)}
		<span
			class="glyph"
			style:transform="translateY({offset}em)"
			style:opacity={Math.max(0, 1 - distance)}
			style:visibility={distance >= 1 ? 'hidden' : 'visible'}
			style:filter={blurAt(distance)}>{glyph}</span
		>
	{/each}
</span>

<style>
	/* The wheel's window reaches a little past the line box and feathers out, so a turning digit fades at the edge instead of being cut. */
	.column {
		--feather: 0.16em;
		position: relative;
		display: inline-block;
		overflow: hidden;
		margin-block: calc(var(--feather) * -1);
		padding-block: var(--feather);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 calc(var(--feather) * 1.5),
			#000 calc(100% - var(--feather) * 1.5),
			transparent
		);
	}
	.sizer {
		visibility: hidden;
	}
	.glyph {
		position: absolute;
		inset: var(--feather) 0;
		text-align: center;
	}
</style>
