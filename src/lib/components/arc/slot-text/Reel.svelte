<script lang="ts">
	import { animate, motionValue, styleEffect } from 'motion';
	import { untrack } from 'svelte';
	import type { TransitionConfig } from 'svelte/transition';
	import { springTiming } from '../usage-meter/meter-motion';
	import { buildStrip } from './reel-strip';

	type Props = {
		char: string;
		order: number;
		entering: boolean;
		rising: boolean;
		duration: number;
		stagger: number;
		spins: number;
		reduced: boolean;
	};

	let { char, order, entering, rising, duration, stagger, spins, reduced }: Props = $props();

	type ReelState = { char: string; strip: string[]; from: number; grow: boolean; time: number };

	/** Fast out, long soft landing, never past the target. */
	const LANDING = [0.12, 0.8, 0.16, 1] as const;
	/** Cell pitch in em. Keep in sync with .cell below. */
	const CELL = 1.6;
	const SETTLE_SECONDS = 0.2;
	const MAX_RESIZE_SECONDS = 0.6;
	const EXIT_SECONDS = 0.35;
	const BLUR_PER_SPEED = 0.05;
	const MAX_BLUR = 2.4;
	const MIN_BLUR = 0.15;
	const exitTiming = springTiming({ type: 'spring', visualDuration: EXIT_SECONDS, bounce: 0 });

	const position = motionValue(0);
	const width = motionValue<number | string>('auto');
	let sizer: HTMLSpanElement;
	let strip: HTMLSpanElement;

	const display = (cell: string) => (cell === ' ' ? ' ' : cell);

	function firstReel(): ReelState {
		const grows = entering && !reduced;
		return {
			char,
			strip: grows ? buildStrip('', char, spins, rising, char.charCodeAt(0) + order) : [char],
			from: 0,
			grow: entering,
			time: duration + order * stagger
		};
	}

	// A new target restarts the reel from the cell that is on screen right now, keeping its sub-cell offset, so nothing jumps.
	function retarget(previous: ReelState): ReelState {
		const current = position.get();
		const index = Math.max(0, Math.min(previous.strip.length - 1, Math.round(current)));
		const visible = previous.strip[index];
		const seed =
			char.charCodeAt(0) * 31 + visible.charCodeAt(0) * 7 + order + previous.strip.length;
		return {
			char,
			strip: reduced ? [char] : buildStrip(visible, char, spins, rising, seed),
			from: reduced ? 0 : current - index,
			grow: false,
			time: duration + order * stagger
		};
	}

	let latest = untrack(firstReel);
	const reel = $derived.by(() => {
		if (char !== latest.char) latest = retarget(latest);
		return latest;
	});

	function blurFor(velocity: number) {
		const amount = Math.min(Math.abs(velocity) * BLUR_PER_SPEED, MAX_BLUR);
		return amount < MIN_BLUR ? 'none' : `blur(${amount.toFixed(2)}px)`;
	}

	// Cells are taller than the line, so the neighbours of a landed glyph sit fully outside the window.
	function renderStrip(value: number) {
		strip.style.transform = `translate3d(0, ${(-value * CELL).toFixed(4)}em, 0)`;
		strip.style.filter = blurFor(position.getVelocity());
	}

	function spin({ strip: cells, from, grow, time }: ReelState, instant: boolean) {
		const measured = sizer.getBoundingClientRect().width;
		const last = cells.length - 1;
		if (instant) {
			position.jump(last);
			width.jump(measured);
			return;
		}
		position.jump(from);
		const spinning = animate(position, last, {
			duration: last === 0 ? SETTLE_SECONDS : time,
			ease: LANDING
		});
		spinning.then(() => (strip.style.filter = 'none'));
		if (grow) width.jump(0);
		if (width.get() === 'auto') {
			width.jump(measured);
			return () => spinning.stop();
		}
		const resizing = animate(width, measured, {
			type: 'spring',
			visualDuration: Math.min(time, MAX_RESIZE_SECONDS),
			bounce: 0
		});
		return () => {
			spinning.stop();
			resizing.stop();
		};
	}

	/** A removed reel collapses its width on a critically damped spring before it leaves. */
	function collapse(node: HTMLElement): TransitionConfig {
		if (reduced) return { duration: 0 };
		const from = node.getBoundingClientRect().width;
		return { ...exitTiming, css: (t) => `width:${Math.max(0, t) * from}px` };
	}

	$effect(() => {
		renderStrip(position.get());
		return position.on('change', renderStrip);
	});

	$effect(() => spin(reel, reduced));
</script>

<span class="slot" {@attach (node) => styleEffect(node, { width })} out:collapse>
	<span bind:this={sizer} class="sizer">{display(char)}</span>
	<span class="window">
		<span bind:this={strip} class="strip">
			{#each reel.strip as cell, index (index)}
				<span class="cell">{display(cell)}</span>
			{/each}
		</span>
	</span>
</span>

<style>
	/* Each slot holds one character. Its width follows the character on a spring, so the word never resizes in one frame. */
	.slot {
		position: relative;
		display: inline-block;
		height: 1.15em;
		flex: none;
		overflow: visible;
	}
	.sizer {
		display: inline-block;
		visibility: hidden;
		white-space: pre;
		pointer-events: none;
	}
	/* The window reaches a little past the line so glyphs fade at the edges instead of being cut. */
	.window {
		position: absolute;
		inset: -0.22em -0.08em;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 0.24em,
			#000 calc(100% - 0.24em),
			transparent
		);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 0.24em,
			#000 calc(100% - 0.24em),
			transparent
		);
	}
	.strip {
		position: absolute;
		top: calc(0.22em - 0.225em);
		right: 0.08em;
		left: 0.08em;
		display: flex;
		flex-direction: column;
		align-items: center;
		will-change: transform;
	}
	.cell {
		display: block;
		height: 1.6em;
		padding-top: 0.225em;
		box-sizing: border-box;
		line-height: 1.15;
		white-space: pre;
	}
</style>
