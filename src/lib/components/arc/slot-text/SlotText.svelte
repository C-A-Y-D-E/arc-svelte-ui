<script module lang="ts">
	export type SlotTextAlign = 'start' | 'end';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion } from '../motion';
	import Reel from './Reel.svelte';

	/**
	 * Text and numbers that spin into their new value like slot machine reels. Every character is a reel; digits count through
	 * the wheel in the direction the number moved, letters shuffle through the alphabet, and reels stop one after another from
	 * left to right with a soft, overshoot-free landing. Use it for prices, stats, and launch moments where a change deserves a beat.
	 */
	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** The value to show. Numbers pass through format; strings render as they are. */
		value: string | number;
		/** Formats a number value. Defaults to en-US grouping, so 12480 reads 12,480. */
		format?: (value: number) => string;
		/** Seconds the first reel spins. Later reels add stagger. */
		duration?: number;
		/** Seconds between reels stopping, left to right. */
		stagger?: number;
		/** Extra full turns a digit makes before it lands. 0 rolls straight to the new digit. */
		spins?: number;
		/** Which end reels are matched from when the length changes. Numbers default to end, so 999 to 1,000 grows on the left. */
		align?: SlotTextAlign;
		/** Announce new values politely to screen readers. */
		announce?: boolean;
	};

	let {
		value,
		format,
		duration = 0.9,
		stagger = 0.07,
		spins = 1,
		align,
		announce = false,
		class: className,
		...rest
	}: Props = $props();

	const reduced = $derived(isReducedMotion());
	const text = $derived(
		typeof value === 'number' ? (format ? format(value) : value.toLocaleString('en-US')) : value
	);
	const fromEnd = $derived((align ?? (typeof value === 'number' ? 'end' : 'start')) === 'end');

	// A leading run of symbols (a currency sign, a plus) is keyed from the start and never spins into a digit; the rest is
	// keyed from the aligned end, so separators and suffixes stay on their own reels when the number grows.
	function reelsFor(chars: string[], alignEnd: boolean) {
		const lead = alignEnd ? chars.findIndex((char) => /[\p{L}\p{N}]/u.test(char)) : 0;
		const prefix = lead < 0 ? chars.length : lead;
		const keyOf = (i: number) =>
			i < prefix ? `p${i}` : alignEnd ? `e${chars.length - 1 - i}` : `s${i}`;
		return chars.map((char, i) => ({ char, key: keyOf(i) }));
	}

	const reels = $derived(reelsFor(Array.from(text), fromEnd));
	const initialKeys = new Set(untrack(() => reels.map((reel) => reel.key)));

	function createTrend(initial: string | number) {
		let last = initial;
		let rising = true;
		return (next: string | number) => {
			if (next !== last) {
				rising = typeof next === 'number' && typeof last === 'number' ? next >= last : true;
				last = next;
			}
			return rising;
		};
	}
	const followTrend = createTrend(untrack(() => value));
	const rising = $derived(followTrend(value));
</script>

<span class={['root', className]} {...rest}>
	<span class="sr-only" aria-live={announce ? 'polite' : undefined}>{text}</span>
	<span class="reels" aria-hidden="true">
		{#each reels as reel, order (reel.key)}
			<Reel
				char={reel.char}
				{order}
				entering={!initialKeys.has(reel.key)}
				{rising}
				{duration}
				{stagger}
				{spins}
				{reduced}
			/>
		{/each}
	</span>
</span>

<style>
	.root {
		position: relative;
		display: inline-block;
		font-variant-numeric: tabular-nums;
		line-height: 1.15;
		white-space: nowrap;
		vertical-align: bottom;
	}
	.reels {
		display: inline-flex;
		height: 1.15em;
		align-items: flex-start;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
