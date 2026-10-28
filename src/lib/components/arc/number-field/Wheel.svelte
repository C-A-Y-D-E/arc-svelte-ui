<script lang="ts">
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import { isReducedMotion, motionTokens } from '../motion';

	let { digit, direction, instant }: { digit: number; direction: number; instant: boolean } =
		$props();

	const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	const WHEEL_SIZE = DIGITS.length;
	const HALF_WHEEL = WHEEL_SIZE / 2;
	const LINE_SPACING_EM = 1.05;
	const FADE_CURVE = 1.5;
	const FADE_RATE = 1.1;
	const BLUR_RATE = 0.75;
	const SHARP_BELOW = 0.02;
	const { blur, spring } = motionTokens;

	const startDigit = untrack(() => digit);
	const position = motionValue(startDigit);
	const wheel = { digit: startDigit, target: startDigit };
	let wheelPosition = $state(startDigit);

	$effect(() => position.on('change', (next) => (wheelPosition = next)));

	/** An odometer wheel. It turns the way the number moved, unless that is over half a turn, so a big clamp never spins. */
	$effect(() => {
		if (wheel.digit === digit) return;
		const forward = (digit - wheel.digit + WHEEL_SIZE) % WHEEL_SIZE;
		const backward = (wheel.digit - digit + WHEEL_SIZE) % WHEEL_SIZE;
		let delta = direction > 0 ? forward : -backward;
		if (Math.abs(delta) > HALF_WHEEL) delta -= Math.sign(delta) * WHEEL_SIZE;
		wheel.target += delta;
		wheel.digit = digit;
		if (instant || isReducedMotion()) position.jump(wheel.target);
		else animate(position, wheel.target, spring.snappy);
	});

	function offsetOf(glyph: number) {
		return (
			((((glyph - wheelPosition) % WHEEL_SIZE) + WHEEL_SIZE + HALF_WHEEL) % WHEEL_SIZE) - HALF_WHEEL
		);
	}

	function blurAt(distance: number) {
		if (distance < SHARP_BELOW || distance >= 1) return 'none';
		return `blur(${(distance * blur.soft * BLUR_RATE).toFixed(2)}px)`;
	}
</script>

<span class="sizer">0</span>
{#each DIGITS as glyph (glyph)}
	{@const offset = offsetOf(glyph)}
	{@const distance = Math.abs(offset)}
	<span
		class="glyph"
		style:transform="translateY({offset * LINE_SPACING_EM}em)"
		style:opacity={Math.max(0, 1 - distance ** FADE_CURVE * FADE_RATE)}
		style:visibility={distance >= 1 ? 'hidden' : 'visible'}
		style:filter={blurAt(distance)}>{glyph}</span
	>
{/each}

<style>
	.sizer {
		visibility: hidden;
	}
	.glyph {
		position: absolute;
		inset: var(--feather) 0;
		text-align: center;
	}
</style>
