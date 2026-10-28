<script module lang="ts">
	export type GaugeTone = 'accent' | 'success' | 'warning' | 'danger';
	/** A band that starts at `from`: the highest band the value reaches sets the tone and names the state, so it never rests on color alone. */
	export type GaugeThreshold = { from: number; tone: GaugeTone; label: string };

	/** A 270 degree ring open at the bottom, drawn clockwise from its lower left end. Redrawn from the sweep every frame so the round cap stays exact. */
	const RADIUS = 42;
	const START_ANGLE = -135;
	const SPAN_ANGLE = 270;
	const CENTER = 50;

	function arcFor(sweep: number) {
		const end = START_ANGLE + SPAN_ANGLE * Math.min(1, Math.max(0, sweep));
		const at = (angle: number) =>
			`${(CENTER + RADIUS * Math.sin((angle * Math.PI) / 180)).toFixed(3)} ${(CENTER - RADIUS * Math.cos((angle * Math.PI) / 180)).toFixed(3)}`;
		return `M ${at(START_ANGLE)} A ${RADIUS} ${RADIUS} 0 ${end - START_ANGLE > 180 ? 1 : 0} 1 ${at(end)}`;
	}
	const track = arcFor(1);
</script>

<script lang="ts">
	import { animate, motionValue } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';
	import { clamp, onceInView } from '../sparkline/chart-kit';
	import RollText from '../sparkline/RollText.svelte';

	type Props = HTMLAttributes<HTMLElement> & {
		value: number;
		min?: number;
		max?: number;
		label: string;
		detail?: string;
		tone?: GaugeTone;
		thresholds?: GaugeThreshold[];
	};

	let {
		value,
		min = 0,
		max = 100,
		label,
		detail,
		tone = 'accent',
		thresholds,
		class: className,
		...rest
	}: Props = $props();

	const { spring, duration } = motionTokens;
	/** The first fill is slower and never overshoots, like a ring closing when the view opens. */
	const reveal = { ...spring.smooth, visualDuration: duration.considered * 1.6 };
	/** The cap fades in over the first sliver instead of popping in as a dot. */
	const CAP_FADE_SWEEP = 0.02;
	const SEEN_AMOUNT = 0.5;
	const BAND_EPSILON = 1e-6;
	/** How close the count must be to its target for the first fill to count as landed. */
	const LANDED_WITHIN = 1;

	const safeMax = $derived(max > min ? max : min + 1);
	const percentage = $derived(clamp((value - min) / (safeMax - min), 0, 1));
	const displayValue = $derived(Math.round(percentage * 100));
	const bands = $derived([...(thresholds ?? [])].sort((a, b) => a.from - b.from));
	const bandAt = (at: number) =>
		bands.filter((threshold) => at >= threshold.from - BAND_EPSILON).pop();
	const band = $derived(bandAt(value));

	let figure: HTMLElement;
	let arcPath: SVGPathElement;
	let digitsNode: HTMLSpanElement;
	let sizer: HTMLSpanElement;
	let inView = $state(false);
	let filled = $state(false);
	// svelte-ignore state_referenced_locally
	let live = $state(band);
	let valueDirection = $state(1);
	// svelte-ignore state_referenced_locally
	let previousDisplay = displayValue;

	const sweep = motionValue(0);
	const count = motionValue(0);

	$effect.pre(() => {
		if (displayValue === previousDisplay) return;
		valueDirection = displayValue < previousDisplay ? -1 : 1;
		previousDisplay = displayValue;
	});

	$effect(() => onceInView(figure, SEEN_AMOUNT, () => (inView = true)));

	$effect(() => {
		const offs = [
			sweep.on('change', (current) => {
				arcPath.setAttribute('d', arcFor(current));
				arcPath.style.opacity = String(clamp(current / CAP_FADE_SWEEP, 0, 1));
			}),
			count.on('change', (current) => {
				digitsNode.textContent = String(Math.round(clamp(current, 0, 100)));
				followBand(current);
			})
		];
		return () => offs.forEach((off) => off());
	});

	// The ring fills once it is seen, then springs to each new value with a little life; the count follows without overshooting.
	$effect(() => {
		const target = percentage;
		// Reduced motion lands on the value at once; the state appears a frame later.
		if (isReducedMotion()) {
			sweep.jump(target);
			count.jump(target * 100);
			const frame = requestAnimationFrame(() => (filled = true));
			return () => cancelAnimationFrame(frame);
		}
		if (!inView) return;
		const arc = animate(sweep, target, filled ? spring.morph : reveal);
		const number = animate(count, target * 100, {
			...(filled ? spring.smooth : reveal),
			onComplete: () => (filled = true)
		});
		return () => {
			arc.stop();
			number.stop();
		};
	});

	// The state arrives as the first fill lands. After that it follows the number on screen, so the color and label change exactly as the count crosses a threshold.
	function followBand(current: number) {
		const next = bandAt(min + (current / 100) * (safeMax - min));
		const changed = next?.from !== live?.from || next?.label !== live?.label;
		if (filled) {
			if (changed) live = next;
		} else if (inView && Math.abs(current - percentage * 100) < LANDED_WITHIN) {
			if (changed) live = next;
			filled = true;
		}
	}

	const shown = $derived(isReducedMotion() || !filled ? band : live);
	const activeTone = $derived(shown?.tone ?? tone);

	// Digits are right aligned in a box sized to the target number, so the ones column never jumps while counting and the group recentres on a spring.
	$effect(() => {
		let measured: string | null = null;
		const observer = new ResizeObserver(([entry]) => {
			const next = entry.borderBoxSize?.[0]?.inlineSize ?? sizer.offsetWidth;
			if (measured !== null && measured !== sizer.textContent && !isReducedMotion())
				animate(digitsNode, { width: next }, spring.smooth);
			else digitsNode.style.width = `${next}px`;
			measured = sizer.textContent;
		});
		observer.observe(sizer);
		return () => observer.disconnect();
	});
</script>

<figure
	bind:this={figure}
	class={['figure', activeTone, className]}
	aria-label={`${label}: ${value} of ${safeMax}${band ? `, ${band.label}` : ''}`}
	{...rest}
>
	<div
		class="visual"
		role="meter"
		aria-label={label}
		aria-valuemin={min}
		aria-valuemax={safeMax}
		aria-valuenow={clamp(value, min, safeMax)}
		aria-valuetext={`${displayValue}%${band ? `, ${band.label}` : ''}`}
	>
		<svg viewBox="0 0 100 90" aria-hidden="true" focusable="false">
			<path class="track" d={track} />
			<path bind:this={arcPath} class="arc" d={arcFor(0)} style="opacity: 0" />
		</svg>
		<div class="readout" aria-hidden="true">
			<span class="number">
				<span bind:this={digitsNode} class="digits">0</span><span class="unit">%</span><span
					bind:this={sizer}
					class="sizer">{displayValue}</span
				>
			</span>
			{#if thresholds}
				<span class="status">
					<RollText text={filled ? (shown?.label ?? '') : ''} direction={valueDirection} whole />
				</span>
			{/if}
		</div>
	</div>
	<figcaption>
		<strong><RollText text={label} whole /></strong>
		{#if detail}<span class="detail"
				><RollText text={detail} direction={valueDirection} whole /></span
			>{/if}
	</figcaption>
</figure>

<style>
	.figure {
		display: grid;
		justify-items: center;
		min-width: 0;
		gap: 10px;
		margin: 0;
		text-align: center;
	}
	.figure figcaption {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.figure strong {
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.detail {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.accent {
		--gauge-color: var(--arc-accent);
		--gauge-text: var(--arc-accent-strong);
	}
	.success {
		--gauge-color: var(--arc-success);
		--gauge-text: var(--arc-success);
	}
	.warning {
		--gauge-color: var(--arc-warning);
		--gauge-text: var(--arc-warning);
	}
	.danger {
		--gauge-color: var(--arc-danger);
		--gauge-text: var(--arc-danger);
	}

	/* An activity style ring: a thick stroke with round caps over a faint tint of its own color. The stroke scales with the ring. */
	.visual {
		position: relative;
		width: min(100%, 176px);
		aspect-ratio: 100 / 90;
	}
	.visual svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.track,
	.arc {
		fill: none;
		stroke-width: 9;
		stroke-linecap: round;
		transition: stroke var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.track {
		stroke: color-mix(in oklch, var(--gauge-color) 13%, transparent);
	}
	.arc {
		stroke: var(--gauge-color);
	}

	/* The readout sits on the ring's true centre, which is the middle of a square as wide as the ring. */
	.readout {
		position: absolute;
		top: 0;
		left: 0;
		display: grid;
		width: 100%;
		aspect-ratio: 1;
		place-content: center;
		justify-items: center;
		gap: 4px;
		pointer-events: none;
	}
	.number {
		position: relative;
		display: inline-flex;
		align-items: baseline;
		color: var(--arc-foreground);
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.digits {
		display: inline-flex;
		justify-content: flex-end;
		white-space: nowrap;
	}
	.unit {
		margin-left: 1px;
		color: var(--arc-text-secondary);
		font-family: var(--arc-font-body);
		font-size: 0.5em;
		letter-spacing: 0;
	}
	.sizer {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}
	.status {
		min-width: 100px;
		min-height: 1.4em;
		color: var(--gauge-text);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: 1.4;
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	@media (prefers-reduced-motion: reduce) {
		.track,
		.arc,
		.status {
			transition: none;
		}
	}
</style>
