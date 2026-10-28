<script lang="ts">
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import { physicalSpring } from '../text-morph/transitions';
	import { isReducedMotion } from '../motion';

	/** A solid end of the range. It glides from day to day and only fades when the end leaves this month. */
	let { cell }: { cell: { row: number; col: number } | null } = $props();

	const GLIDE = physicalSpring(0.3, 0.1);
	const HIDDEN_SCALE = 0.8;
	const initial = untrack(() => cell);

	const x = motionValue(initial?.col ?? 0);
	const y = motionValue(initial?.row ?? 0);
	const scale = motionValue(initial ? 1 : HIDDEN_SCALE);
	const transformFor = () =>
		`translate(${x.get() * 100}%, ${y.get() * 100}%) scale(${scale.get()})`;

	let thumb: HTMLSpanElement;
	let hidden = !initial;

	$effect(() => {
		const paint = () => (thumb.style.transform = transformFor());
		const stops = [x.on('change', paint), y.on('change', paint), scale.on('change', paint)];
		return () => stops.forEach((stop) => stop());
	});

	$effect(() => {
		const reduced = isReducedMotion();
		const fade = { duration: reduced ? 0 : 0.12 };
		if (!cell) {
			hidden = true;
			animate(thumb, { opacity: 0 }, fade);
			animate(scale, HIDDEN_SCALE, fade);
			return;
		}
		if (hidden || reduced) {
			x.jump(cell.col);
			y.jump(cell.row);
		} else {
			animate(x, cell.col, GLIDE);
			animate(y, cell.row, GLIDE);
		}
		hidden = false;
		animate(thumb, { opacity: 1 }, { duration: reduced ? 0 : 0.16 });
		animate(scale, 1, reduced ? { duration: 0 } : GLIDE);
	});
</script>

<span
	bind:this={thumb}
	class="thumb"
	style:transform={transformFor()}
	style:opacity={initial ? 1 : 0}
></span>

<style>
	.thumb {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--cell);
		height: var(--cell);
	}
	.thumb::before {
		content: '';
		position: absolute;
		inset: 3px;
		border-radius: 50%;
		background: var(--arc-accent);
	}
</style>
