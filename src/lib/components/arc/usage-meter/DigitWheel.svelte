<script lang="ts">
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import { isReducedMotion, motionTokens } from '../motion';
	import { physical, soon } from './meter-motion';

	let { digit, direction }: { digit: number; direction: number } = $props();

	const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
	const SETTLED_OFFSET = 0.02;
	const turn = physical(motionTokens.spring.smooth);

	const initialDigit = untrack(() => digit);
	const position = motionValue(initialDigit);
	const wheel = { digit: initialDigit, target: initialDigit };
	const glyphs: HTMLSpanElement[] = $state([]);
	let stopTurn: (() => void) | null = null;

	/** A glyph's distance from the wheel position sets where it sits and how clearly it shows. */
	function offsetOf(glyphDigit: number, current: number) {
		return ((((glyphDigit - current) % 10) + 15) % 10) - 5;
	}

	function glyphStyle(offset: number) {
		const distance = Math.abs(offset);
		const blurred = distance >= SETTLED_OFFSET && distance < 1;
		return {
			transform: `translateY(${offset}em)`,
			opacity: String(Math.max(0, 1 - distance)),
			filter: blurred ? `blur(${(distance * motionTokens.blur.subtle).toFixed(2)}px)` : 'none'
		};
	}

	function renderWheel(current: number) {
		glyphs.forEach((glyph, glyphDigit) =>
			Object.assign(glyph.style, glyphStyle(offsetOf(glyphDigit, current)))
		);
	}

	/** The wheel always turns the way the whole number moved, wrapping 9 → 0 like an odometer. */
	function turnTo(next: number, turnDirection: number) {
		wheel.target +=
			turnDirection < 0 ? -((wheel.digit - next + 10) % 10) : (next - wheel.digit + 10) % 10;
		wheel.digit = next;
		stopTurn?.();
		stopTurn = null;
		if (isReducedMotion()) {
			position.jump(wheel.target);
			return;
		}
		const target = wheel.target;
		stopTurn = soon(() => animate(position, target, turn));
	}

	$effect(() => {
		renderWheel(position.get());
		return position.on('change', renderWheel);
	});

	$effect(() => {
		if (wheel.digit !== digit) turnTo(digit, direction);
	});

	$effect(() => () => stopTurn?.());
</script>

<span class="sizer">0</span>
{#each DIGITS as glyphDigit (glyphDigit)}
	{@const initial = glyphStyle(offsetOf(glyphDigit, initialDigit))}
	<span
		bind:this={glyphs[glyphDigit]}
		class="glyph"
		style:transform={initial.transform}
		style:opacity={initial.opacity}
		style:filter={initial.filter}>{glyphDigit}</span
	>
{/each}

<style>
	.sizer {
		visibility: hidden;
	}
	.glyph {
		position: absolute;
		inset: var(--usage-meter-feather) 0;
		text-align: center;
	}
</style>
