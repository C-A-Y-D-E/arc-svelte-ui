<script module lang="ts">
	export type SparklineTone = 'accent' | 'success' | 'warning' | 'danger';

	type Point = [number, number];

	/** Space kept above the highest and below the lowest point, and half the line width. */
	const INSET = 5;
	const CAP = 1.25;
	/** How far the lit stretch and the fill run past the pen tip, so the round cap is never cut. */
	const OVERSHOOT = 16;
	const GRID_STEPS = 160;
	const MAX_SAMPLES = 16;
	const SAMPLE_BUDGET = 128;
	const grid = Array.from({ length: GRID_STEPS + 1 }, (_, index) => index / GRID_STEPS);

	/** A smooth line through every point, sampled densely in unit space (x and y both 0 to 1, y up). Monotone cubic tangents keep it from swinging past the data. */
	function curveFor(data: number[]): Point[] {
		const min = Math.min(...data);
		const span = Math.max(...data) - min;
		const ys = data.map((value) => (span ? (value - min) / span : 0.5));
		const last = ys.length - 1;
		const step = 1 / last;
		const slopes = ys.slice(1).map((y, index) => (y - ys[index]) / step);
		const tangents = ys.map((_, index) =>
			index === 0 || index === last
				? slopes[0]
				: (Math.sign(slopes[index - 1]) + Math.sign(slopes[index])) *
						Math.min(
							Math.abs(slopes[index - 1]),
							Math.abs(slopes[index]),
							Math.abs(slopes[index - 1] + slopes[index]) / 4
						) || 0
		);
		if (last > 1) {
			tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
			tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2;
		}
		const samples = Math.max(1, Math.min(MAX_SAMPLES, Math.round(SAMPLE_BUDGET / last)));
		const points: Point[] = [];
		for (let index = 0; index < last; index++)
			for (let sample = 0; sample < samples; sample++) {
				const t = sample / samples;
				const t2 = t * t;
				const t3 = t2 * t;
				const y =
					(2 * t3 - 3 * t2 + 1) * ys[index] +
					(t3 - 2 * t2 + t) * step * tangents[index] +
					(3 * t2 - 2 * t3) * ys[index + 1] +
					(t3 - t2) * step * tangents[index + 1];
				points.push([(index + t) * step, Math.min(1, Math.max(0, y))]);
			}
		points.push([1, ys[last]]);
		return points;
	}

	/** Height of the sampled line at x, straight between samples. */
	function heightAt(shape: Point[], x: number) {
		let low = 0;
		let high = shape.length - 1;
		if (x <= shape[low][0]) return shape[low][1];
		if (x >= shape[high][0]) return shape[high][1];
		while (high - low > 1) {
			const middle = (low + high) >> 1;
			if (shape[middle][0] < x) low = middle;
			else high = middle;
		}
		const [x0, y0] = shape[low];
		const [x1, y1] = shape[high];
		return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
	}

	/** Every drawn string for one frame, in the chart's own pixels so strokes and dots stay round at any width. */
	function geometryOf(shape: Point[], w: number, h: number, at: number) {
		const toY = (y: number) => INSET + (1 - y) * (h - INSET * 2);
		const points = shape.map(([x, y]): Point => [x * w, toY(y)]);
		const pairs = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);
		const cx = at * w;
		const cy = toY(heightAt(shape, at));
		return {
			points,
			line: pairs.join(' '),
			trail: `M${pairs.join('L')}`,
			fill: `M${pairs.join('L')}L${w},${h}L0,${h}Z`,
			dot: `${cx},${cy} ${cx},${cy}`,
			cx
		};
	}

	/** Where the pen is along the line once `progress` of its length is drawn, so the fill follows the tip. */
	function tipAt(points: Point[], progress: number) {
		const steps = points
			.slice(1)
			.map(([x, y], index) => Math.hypot(x - points[index][0], y - points[index][1]));
		let left = progress * steps.reduce((sum, step) => sum + step, 0);
		for (let index = 0; index < steps.length; index++) {
			if (left <= steps[index])
				return (
					points[index][0] +
					(points[index + 1][0] - points[index][0]) * (steps[index] ? left / steps[index] : 1)
				);
			left -= steps[index];
		}
		return points[points.length - 1][0];
	}
</script>

<script lang="ts">
	import { animate, motionValue } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';
	import { clamp, onceInView, svgId } from './chart-kit';
	import RollText from './RollText.svelte';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'role'> & {
		data: number[];
		label: string;
		value?: string;
		change?: string;
		tone?: SparklineTone;
		width?: number;
		height?: number;
		/** One label per point, such as a date. It replaces the change while that point is scrubbed. */
		labels?: string[];
		/** Formats a scrubbed point for the headline. Defaults to a grouped number. */
		formatValue?: (value: number, index: number) => string;
		/** A quiet neutral fill under the line. */
		area?: boolean;
		/** Pointer and keyboard scrubbing through the points. */
		interactive?: boolean;
	};

	let {
		data,
		label,
		value,
		change,
		tone = 'accent',
		width = 160,
		height = 52,
		labels,
		formatValue,
		area = true,
		interactive = true,
		class: className,
		...rest
	}: Props = $props();

	const grouped = new Intl.NumberFormat('en-US');
	/** The first draw: one smooth stroke, slow at both ends like a pen. */
	const draw = { duration: motionTokens.duration.considered * 1.75, ease: motionTokens.ease.inOut };
	const quick = { duration: motionTokens.duration.fast, ease: motionTokens.ease.standard };
	const instant = { duration: 0 };
	const DOT_REST = 7;
	const DOT_SCRUB = 10;
	const SEEN_AMOUNT = 0.5;
	const PAGE_SHARE = 6;
	const componentId = $props.id();
	const uid = `sparkline${svgId(componentId)}`;

	const safeData = $derived(data.length > 1 ? data : [data[0] ?? 0, data[0] ?? 0]);
	const last = $derived(safeData.length - 1);
	const dataKey = $derived(safeData.join(','));
	const target = $derived(curveFor(dataKey.split(',').map(Number)));
	const description = $derived(`${label}: ${value ?? safeData[last]}. ${change ?? ''}`.trim());

	let figure: HTMLElement;
	let plot: HTMLDivElement;
	let linePath: SVGPolylineElement;
	let trailPath: SVGPathElement;
	let fillPath = $state<SVGPathElement>();
	let cursorLine: SVGLineElement;
	let endDot: SVGPolylineElement;
	let litRect: SVGRectElement;
	let dimRect: SVGRectElement;
	let revealRect: SVGRectElement;

	// svelte-ignore state_referenced_locally
	let box = $state({ w: width, h: height });
	let active = $state<number | null>(null);
	let landed = $state(false);
	let inView = $state(false);
	let scrubDirection = $state(1);
	const index = $derived(active === null ? null : Math.min(active, last));
	const scrubbing = $derived(index !== null);

	// svelte-ignore state_referenced_locally
	const first = geometryOf(curveFor(safeData), width, height, 1);
	// svelte-ignore state_referenced_locally
	let shape = target;
	const drawn = motionValue(0);
	const cursor = motionValue(1);

	// One writer for every drawn attribute: the morphing shape, the cursor, the pen and the measured size all repaint through here.
	function paint() {
		if (!linePath) return;
		const { w, h } = box;
		const progress = drawn.get();
		const next = geometryOf(shape, w, h, cursor.get());
		linePath.setAttribute('points', next.line);
		linePath.style.strokeDasharray = `${progress} 1`;
		linePath.style.opacity = progress > 0.001 ? '1' : '0';
		trailPath.setAttribute('d', next.trail);
		fillPath?.setAttribute('d', next.fill);
		endDot.setAttribute('points', next.dot);
		cursorLine.setAttribute('x1', String(next.cx));
		cursorLine.setAttribute('x2', String(next.cx));
		litRect.setAttribute('width', String(next.cx + CAP + OVERSHOOT));
		dimRect.setAttribute('x', String(next.cx + CAP));
		const reveal = progress >= 1 ? w + OVERSHOOT * 2 : tipAt(next.points, progress) + OVERSHOOT;
		revealRect.setAttribute('width', String(reveal));
	}

	$effect(() => {
		const offs = [drawn.on('change', paint), cursor.on('change', paint)];
		return () => offs.forEach((off) => off());
	});

	$effect(() => onceInView(figure, SEEN_AMOUNT, () => (inView = true)));

	// The chart draws in its own pixels: measure the width, keep the height in proportion.
	$effect(() => {
		const ratio = height / width;
		const observer = new ResizeObserver(() => {
			const w = plot.clientWidth;
			if (w && Math.abs(box.w - w) >= 0.5) box = { w, h: w * ratio };
		});
		observer.observe(plot);
		return () => observer.disconnect();
	});

	$effect(() => {
		void box;
		void fillPath;
		paint();
	});

	// The line draws left to right once it is seen, the fill follows the pen, then the end dot lands.
	$effect(() => {
		// Reduced motion shows the finished line at once; the dot lands a frame later.
		if (isReducedMotion()) {
			drawn.jump(1);
			paint();
			const frame = requestAnimationFrame(() => (landed = true));
			return () => cancelAnimationFrame(frame);
		}
		if (!inView) return;
		const controls = animate(drawn, 1, { ...draw, onComplete: () => (landed = true) });
		return () => controls.stop();
	});

	// New data morphs the line from the shape on screen, sampled on shared x positions so a series that gains or loses points still flows.
	$effect(() => {
		const goal = target;
		const from = shape;
		if (from === goal) return;
		if (isReducedMotion()) {
			shape = goal;
			paint();
			return;
		}
		const xs = [...new Set([...grid, ...goal.map(([x]) => x)])].sort((a, b) => a - b);
		const start = xs.map((x) => heightAt(from, x));
		const end = xs.map((x) => heightAt(goal, x));
		const controls = animate(0, 1, {
			...motionTokens.spring.smooth,
			onUpdate: (progress) => {
				shape = xs.map((x, at): Point => [x, start[at] + (end[at] - start[at]) * progress]);
				paint();
			},
			onComplete: () => {
				shape = goal;
				paint();
			}
		});
		return () => controls.stop();
	});

	// The cursor springs to the scrubbed point and rides the line between points; leaving sends it home to the latest value.
	$effect(() => {
		const to = index === null ? 1 : index / last;
		if (isReducedMotion()) {
			cursor.jump(to);
			return;
		}
		const controls = animate(cursor, to, motionTokens.spring.snappy);
		return () => controls.stop();
	});

	// While scrubbing, the stretch after the cursor dims, as if the later points have not happened yet.
	$effect(() => {
		const transition = isReducedMotion() ? instant : quick;
		animate(trailPath, { opacity: scrubbing && landed ? 1 : 0 }, transition);
		animate(cursorLine, { opacity: scrubbing ? 1 : 0 }, transition);
	});

	$effect(() => {
		const size = landed ? (scrubbing ? DOT_SCRUB : DOT_REST) : 0;
		const transition = isReducedMotion()
			? instant
			: { opacity: quick, strokeWidth: motionTokens.spring.snappy };
		animate(endDot, { opacity: landed ? 1 : 0, strokeWidth: size }, transition);
	});

	function scrubTo(next: number | null) {
		scrubDirection = next === null || index === null ? 1 : Math.sign(next - index) || 1;
		active = next;
	}

	const format = (at: number) =>
		formatValue ? formatValue(safeData[at], at) : grouped.format(safeData[at]);
	const point = $derived(format(index ?? last));
	const when = $derived(labels?.[index ?? last]);
	const headline = $derived(value === undefined ? undefined : scrubbing ? point : value);
	const aside = $derived(
		index === null
			? (change ?? '')
			: value === undefined
				? [point, when].filter(Boolean).join(' · ')
				: (when ?? `${index + 1} of ${last + 1}`)
	);

	function pointAt(clientX: number) {
		const rect = plot.getBoundingClientRect();
		return rect.width
			? clamp(Math.round(((clientX - rect.left) / rect.width) * last), 0, last)
			: last;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && scrubbing) {
			event.preventDefault();
			scrubTo(null);
			return;
		}
		const from = index ?? last;
		const page = Math.max(1, Math.round((last + 1) / PAGE_SHARE));
		const steps: Record<string, number> = {
			ArrowLeft: from - 1,
			ArrowDown: from - 1,
			ArrowRight: from + 1,
			ArrowUp: from + 1,
			PageDown: from - page,
			PageUp: from + page,
			Home: 0,
			End: last
		};
		const next = steps[event.key];
		if (next === undefined) return;
		event.preventDefault();
		scrubTo(clamp(next, 0, last));
	}

	const release = () => scrubTo(null);
	const scrubProps = $derived(
		interactive
			? {
					role: 'slider' as const,
					tabindex: 0,
					'aria-label': `${label}, explore values`,
					'aria-valuemin': 1,
					'aria-valuemax': last + 1,
					'aria-valuenow': (index ?? last) + 1,
					'aria-valuetext': `${when ?? (index === null ? 'Latest' : `Point ${index + 1} of ${last + 1}`)}: ${point}`,
					onpointerdown: (event: PointerEvent) => scrubTo(pointAt(event.clientX)),
					onpointermove: (event: PointerEvent) => {
						if (event.pointerType === 'mouse' || event.buttons) scrubTo(pointAt(event.clientX));
					},
					onpointerup: (event: PointerEvent) => {
						if (event.pointerType !== 'mouse') release();
					},
					onpointerleave: release,
					onpointercancel: release,
					onblur: release,
					onkeydown
				}
			: {}
	);
</script>

<figure bind:this={figure} class={['figure', className]} aria-label={description} {...rest}>
	<figcaption class="caption">
		<span class="label"><RollText text={label} whole /></span>
		{#if headline !== undefined}<strong><RollText text={headline} morph /></strong>{/if}
		<small class={tone}>
			<RollText
				text={aside}
				direction={scrubbing ? scrubDirection : undefined}
				glyphClass={scrubbing ? 'sparkline-point' : undefined}
				morph
			/>
		</small>
	</figcaption>
	<div bind:this={plot} class="plot" data-interactive={interactive || undefined} {...scrubProps}>
		<svg class="chart" viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true" focusable="false">
			<defs>
				<clipPath id={`${uid}-lit`} clipPathUnits="userSpaceOnUse">
					<rect
						bind:this={litRect}
						x={-OVERSHOOT}
						y={-OVERSHOOT}
						width={first.cx + CAP + OVERSHOOT}
						height={box.h + OVERSHOOT * 2}
					/>
				</clipPath>
				<clipPath id={`${uid}-dim`} clipPathUnits="userSpaceOnUse">
					<rect
						bind:this={dimRect}
						x={first.cx + CAP}
						y={-OVERSHOOT}
						width={box.w + OVERSHOOT * 2}
						height={box.h + OVERSHOOT * 2}
					/>
				</clipPath>
				<clipPath id={`${uid}-fill`} clipPathUnits="userSpaceOnUse">
					<rect
						bind:this={revealRect}
						x={-OVERSHOOT}
						y={-OVERSHOOT}
						width="0"
						height={box.h + OVERSHOOT * 2}
					/>
				</clipPath>
			</defs>
			{#if area}
				<path
					bind:this={fillPath}
					class={['area', tone]}
					d={first.fill}
					clip-path={`url(#${uid}-fill)`}
				/>
			{/if}
			<line class="baseline" x1="0" y1={box.h - 0.5} x2={box.w} y2={box.h - 0.5} />
			<path
				bind:this={trailPath}
				class="trail"
				d={first.trail}
				clip-path={`url(#${uid}-dim)`}
				opacity="0"
			/>
			<polyline
				bind:this={linePath}
				class={['line', tone]}
				points={first.line}
				pathLength="1"
				clip-path={`url(#${uid}-lit)`}
				style="stroke-dasharray: 0 1; opacity: 0"
			/>
			<line
				bind:this={cursorLine}
				class="cursor"
				x1={first.cx}
				x2={first.cx}
				y1="0"
				y2={box.h}
				opacity="0"
			/>
			<!-- A zero-length round-capped stroke is a true circle, and it takes the line's colour. It rests on the latest point and becomes the scrub handle. -->
			<polyline
				bind:this={endDot}
				class={['end', tone]}
				points={first.dot}
				fill="none"
				stroke-linecap="round"
				stroke-width="0"
				opacity="0"
			/>
		</svg>
	</div>
</figure>

<style>
	.figure {
		display: grid;
		min-width: 0;
		gap: 12px;
		margin: 0;
		color: var(--arc-foreground);
	}
	.caption {
		display: flex;
		align-items: baseline;
		gap: 9px;
		min-width: 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.label {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}
	.caption strong {
		margin-left: auto;
		color: var(--arc-foreground);
		font-size: var(--arc-text-lg);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		font-variant-numeric: tabular-nums;
	}
	.caption small {
		flex: none;
		font-size: var(--arc-text-xs);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.accent {
		color: var(--arc-accent-strong);
		stroke: var(--arc-accent);
	}
	.success {
		color: var(--arc-success);
		stroke: var(--arc-success);
	}
	.warning {
		color: var(--arc-warning);
		stroke: var(--arc-warning);
	}
	.danger {
		color: var(--arc-danger);
		stroke: var(--arc-danger);
	}
	/* The scrubbed date is context, not a change, so it stays neutral whatever the tone. */
	.caption small :global(.sparkline-point) {
		color: var(--arc-text-secondary);
	}

	/* The plot is the scrubber: hover or drag across it, or focus it and use the arrow keys. Vertical swipes still scroll the page. */
	.plot {
		position: relative;
		min-width: 0;
		border-radius: calc(var(--arc-radius-control) / 2);
		outline: none;
		-webkit-tap-highlight-color: transparent;
	}
	.plot[data-interactive] {
		touch-action: pan-y;
		cursor: default;
		user-select: none;
	}
	.plot:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 8px;
	}
	.chart {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.baseline {
		stroke: var(--arc-border);
		stroke-width: 1;
	}
	/* The area under the line carries a faint wash of the line tone. */
	.area.area {
		fill: color-mix(in oklch, currentColor 9%, transparent);
		stroke: none;
	}
	.line,
	.trail {
		fill: none;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.line {
		transition: stroke var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.trail {
		stroke: var(--arc-border-strong);
	}
	.cursor {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
	}
	.end {
		transition: stroke var(--arc-duration-standard) var(--arc-ease-standard);
	}
	@media (prefers-reduced-motion: reduce) {
		.line,
		.end,
		.caption small {
			transition: none;
		}
	}
</style>
