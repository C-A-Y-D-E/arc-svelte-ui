<script lang="ts">
	import { styleEffect, transformValue, type MotionValue } from 'motion';
	import { untrack } from 'svelte';
	import { clamp } from './carousel-physics';

	type Props = {
		index: number;
		last: number;
		progress: MotionValue<number>;
		drain: MotionValue<number>;
		selected: boolean;
		label: string;
		controls: string;
		ref?: HTMLButtonElement | null;
		onselect: () => void;
	};

	let {
		index,
		last,
		progress,
		drain,
		selected,
		label,
		controls,
		ref = $bindable(),
		onselect
	}: Props = $props();

	const DOT_PX = 6;
	const PILL_PX = 22;

	/** Server-rendered resting look, before the motion values take over. */
	const resting = untrack(() => ({
		width: `${selected ? PILL_PX : DOT_PX}px`,
		fillOpacity: selected ? 1 : 0
	}));

	let dot: HTMLSpanElement;
	let fill: HTMLSpanElement;
	let drainBar: HTMLSpanElement;

	/** Each indicator grows toward a pill as the track nears its slide, so the pill hands over continuously instead of hopping. */
	$effect(() => {
		const emphasis = transformValue(() =>
			Math.max(0, 1 - Math.abs(clamp(progress.get(), 0, last) - index))
		);
		const width = transformValue(() => DOT_PX + (PILL_PX - DOT_PX) * emphasis.get());
		const stops = [
			styleEffect(dot, { width }),
			styleEffect(fill, { opacity: emphasis }),
			styleEffect(drainBar, { scaleX: drain })
		];
		return () => {
			stops.forEach((stop) => stop());
			width.destroy();
			emphasis.destroy();
		};
	});
</script>

<button
	bind:this={ref}
	type="button"
	role="tab"
	class="tab"
	aria-selected={selected}
	aria-controls={controls}
	aria-label={label}
	tabindex={selected ? 0 : -1}
	onclick={onselect}
>
	<span bind:this={dot} class="dot" style:width={resting.width} aria-hidden="true">
		<span bind:this={fill} class="dot-fill" style:opacity={resting.fillOpacity}></span>
		<span bind:this={drainBar} class="dot-drain" style:transform="scaleX(0)"></span>
	</span>
</button>

<style>
	.tab {
		display: grid;
		height: var(--arc-control-height-sm);
		flex: none;
		place-items: center;
		border: 0;
		border-radius: var(--arc-radius-pill);
		padding: 0 5px;
		background: transparent;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	/* Resting dots use the strong border color; the fill fades in as the pill forms, and the drain covers it from the right while rotation runs. */
	.dot {
		position: relative;
		display: block;
		width: 6px;
		height: 6px;
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border-strong);
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.dot-fill,
	.dot-drain {
		position: absolute;
		inset: 0;
	}
	.dot-fill {
		background: var(--arc-foreground);
	}
	.dot-drain {
		background: var(--arc-border-strong);
		transform-origin: 100% 50%;
	}
	@media (hover: hover) and (pointer: fine) {
		.tab:hover .dot {
			background: var(--arc-text-muted);
		}
	}
	.tab:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
