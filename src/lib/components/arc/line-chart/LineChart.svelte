<script module lang="ts">
	export interface LineChartSeries {
		/** Stable identity. A series keeps its line across data changes, so switching ranges morphs the path instead of redrawing it. */
		key: string;
		/** Name in the legend, the tooltip, and the data table. */
		label: string;
		/** Any CSS color. Defaults to the accent for the first series, then quieter neutral steps. */
		color?: string;
		/** Draws a dashed stroke, useful for a previous period or a target. */
		dashed?: boolean;
		/** Fills the area under the line with a faint tint of its color. Defaults to true for the first series. */
		area?: boolean;
	}

	export interface LineChartDatum {
		/** Stable identity, such as an ISO date. */
		key: string;
		/** Full label for the tooltip and screen readers, such as "Tue, Sep 15". */
		label: string;
		/** Short label on the x axis, such as "Sep 15". Leave it out to keep the axis quiet at that point. */
		axisLabel?: string;
		/** One value per series key. A missing value counts as zero. */
		values: Record<string, number | undefined>;
	}

	/** Use a line chart for one or more measures over time, when the shape of the trend matters more than any single value. */
	export interface LineChartProps {
		data: LineChartDatum[];
		series: LineChartSeries[];
		/** What is measured, such as "Signups". Names the chart for assistive technology. */
		label: string;
		/** Unit after each value in the tooltip, such as "ms". */
		unit?: string;
		/** Plot height in pixels. The width follows the container. */
		height?: number;
		/** Formats values in the tooltip and data table. */
		formatValue?: (value: number, series: LineChartSeries) => string;
		/** Formats the value axis. Defaults to a compact number, such as 1.2K. */
		formatTick?: (value: number) => string;
		/** Hidden series keys. Bind it, or pass it with onHiddenSeriesChange, to control it. */
		hiddenSeries?: string[];
		defaultHiddenSeries?: string[];
		onHiddenSeriesChange?: (hidden: string[]) => void;
		/** Called as the crosshair moves, and with null when it leaves. Use it to drive a headline readout. */
		onActiveChange?: (index: number | null, datum: LineChartDatum | null) => void;
		/** Keeps the current lines on screen, dimmed, while the next range loads. */
		loading?: boolean;
		/** Shown when there are no points. */
		emptyLabel?: string;
		/** Series toggles above the plot. Shown by default when there is more than one series. */
		legend?: boolean;
		/** Header of the first column in the data table read by screen readers. */
		categoryLabel?: string;
		/** Smooth monotone curves that never swing past the data, or straight segments. */
		curve?: 'smooth' | 'linear';
		/** The figure element. */
		ref?: HTMLElement | null;
		class?: string;
	}
</script>

<script lang="ts">
	import { animate, cubicBezier, motionValue, springValue } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { fade } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import {
		clamp,
		isKeyboardFocus,
		onceInView,
		physicalSpring,
		svgId
	} from '../sparkline/chart-kit';

	type Props = LineChartProps & Omit<HTMLAttributes<HTMLElement>, keyof LineChartProps>;
	type Point = [x: number, value: number];
	type Track = { shape: Point[]; presence: number; fade: { stop: () => void } | null };

	let {
		data,
		series,
		label,
		unit = '',
		height = 220,
		formatValue,
		formatTick = (value: number) => compact.format(value),
		defaultHiddenSeries,
		hiddenSeries = $bindable(defaultHiddenSeries ?? []),
		onHiddenSeriesChange,
		onActiveChange,
		loading = false,
		emptyLabel = 'No data for this range',
		legend,
		categoryLabel = 'Date',
		curve = 'smooth',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	const { spring, duration } = motionTokens;
	const settle = physicalSpring(spring.smooth, 0.001);
	const glide = physicalSpring(spring.snappy, 0.0001);
	const follow = { stiffness: glide.stiffness, damping: glide.damping, restDelta: 0.01 };
	const draw = { duration: duration.considered * 1.75, ease: motionTokens.ease.inOut };
	const MORPH_REST_DELTA = 0.0005;

	const MS_PER_SECOND = 1000;
	const fadeIn = { duration: duration.standard * MS_PER_SECOND, easing: ease.standard };
	const fadeOut = { duration: duration.instant * MS_PER_SECOND, easing: ease.standard };
	/** Motion's default opacity tween, which Arc's empty and loading states enter on. */
	const defaultFadeIn = { duration: 0.3 * MS_PER_SECOND, easing: cubicBezier(0.25, 0.1, 0.35, 1) };

	/** Room above the top gridline, and the gap between the crosshair and its tooltip. */
	const TOP = 12;
	const GAP = 14;
	const CROSSHAIR_OVERHANG = 4;
	const DOT_RADIUS = 4;
	/** The draw-in clip reaches past the plot so round caps, dots and strokes at the edges are never cut. */
	const CLIP_BLEED_X = 8;
	const CLIP_BLEED_Y = 16;
	const MAX_TICK_ROWS = 4;
	const AXIS_LABEL_SPACING = 76;
	const PAGE_SHARE = 6;
	const MORPH_GRID_STEPS = 240;
	const MAX_SAMPLES_PER_SEGMENT = 16;
	const SAMPLES_PER_LINE = 192;
	const IN_VIEW_AMOUNT = 0.3;

	const PALETTE = [
		'var(--arc-accent)',
		'color-mix(in oklch, var(--arc-foreground) 46%, var(--arc-surface))',
		'color-mix(in oklch, var(--arc-foreground) 26%, var(--arc-surface))'
	];
	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
	const colorOf = (line: LineChartSeries, index: number) =>
		line.color ?? PALETTE[Math.min(index, PALETTE.length - 1)];
	const clean = (value: number) => Number(value.toPrecision(12));

	/** Clean gridlines: the smallest step of 1, 2, 2.5, or 5 that covers the data in four rows or fewer, from zero unless the data dips below it. */
	function niceScale(low: number, high: number) {
		const lo = Math.min(0, low);
		const hi = Math.max(high, lo + 1);
		const magnitude = 10 ** Math.floor(Math.log10((hi - lo) / MAX_TICK_ROWS));
		for (const factor of [1, 2, 2.5, 5, 10]) {
			const step = factor * magnitude;
			const bottom = Math.floor(lo / step) * step;
			const top = Math.ceil(hi / step) * step;
			if ((top - bottom) / step <= MAX_TICK_ROWS + 1e-9) {
				const ticks: number[] = [];
				for (let value = bottom; value <= top + step / 2; value += step) ticks.push(clean(value));
				return { min: clean(bottom), max: clean(top), ticks };
			}
		}
		return { min: lo, max: hi, ticks: [lo, hi] };
	}

	/** The line through every value, sampled densely on x from 0 to 1 in data units. Monotone cubic tangents keep a smooth curve from swinging past the data. */
	function curveFor(values: number[], smooth: boolean): Point[] {
		if (values.length === 0) return [];
		if (values.length === 1) {
			return [
				[0, values[0]],
				[1, values[0]]
			];
		}
		const last = values.length - 1;
		const step = 1 / last;
		if (!smooth) return values.map((value, index) => [index * step, value]);
		const slopes = values.slice(1).map((value, index) => (value - values[index]) / step);
		const tangents = values.map(
			(_, index) =>
				(index === 0 || index === last
					? 0
					: (Math.sign(slopes[index - 1]) + Math.sign(slopes[index])) *
						Math.min(
							Math.abs(slopes[index - 1]),
							Math.abs(slopes[index]),
							Math.abs(slopes[index - 1] + slopes[index]) / 4
						)) || 0
		);
		if (last > 1) {
			tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
			tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2;
		} else {
			tangents[0] = slopes[0];
			tangents[1] = slopes[0];
		}
		const samples = Math.max(
			1,
			Math.min(MAX_SAMPLES_PER_SEGMENT, Math.round(SAMPLES_PER_LINE / last))
		);
		const points: Point[] = [];
		for (let index = 0; index < last; index++) {
			const low = Math.min(values[index], values[index + 1]);
			const high = Math.max(values[index], values[index + 1]);
			for (let sample = 0; sample < samples; sample++) {
				const t = sample / samples;
				const t2 = t * t;
				const t3 = t2 * t;
				const value =
					(2 * t3 - 3 * t2 + 1) * values[index] +
					(t3 - 2 * t2 + t) * step * tangents[index] +
					(3 * t2 - 2 * t3) * values[index + 1] +
					(t3 - t2) * step * tangents[index + 1];
				points.push([(index + t) * step, clamp(value, low, high)]);
			}
		}
		points.push([1, values[last]]);
		return points;
	}

	/** Value of a sampled line at x, straight between samples. */
	function valueAt(shape: Point[], x: number) {
		if (!shape.length) return 0;
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

	const morphGrid = Array.from(
		{ length: MORPH_GRID_STEPS + 1 },
		(_, index) => index / MORPH_GRID_STEPS
	);

	/** Axis labels that fit: at most one per 76 pixels, counted back from the latest so the newest date always shows. */
	function axisPicks(points: LineChartDatum[], width: number) {
		const labeled = points.flatMap((item, index) => (item.axisLabel ? [index] : []));
		if (!width || !labeled.length) return [];
		const room = Math.max(2, Math.floor(width / AXIS_LABEL_SPACING));
		const stride = Math.ceil(labeled.length / room);
		return labeled
			.reverse()
			.filter((_, rank) => rank % stride === 0)
			.reverse();
	}

	const componentId = $props.id();
	const uid = `line${svgId(componentId)}`;
	const reduced = $derived(isReducedMotion());
	const last = $derived(data.length - 1);
	const empty = $derived(data.length === 0);

	const hidden = $derived(hiddenSeries ?? []);
	const visible = $derived(series.filter((line) => !hidden.includes(line.key)));
	const showLegend = $derived(legend ?? series.length > 1);

	function toggle(key: string) {
		const next = hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];
		hiddenSeries = next;
		onHiddenSeriesChange?.(next);
	}

	// Each series becomes a dense curve in data units; the scale fits only the series on show.
	const signature = $derived(
		`${curve}|${series.map((line) => line.key).join(',')}|${data
			.map((item) => `${item.key}:${series.map((line) => item.values[line.key] ?? 0).join(',')}`)
			.join(';')}`
	);
	const targets = $derived.by(() => {
		void signature;
		return untrack(
			() =>
				new Map(
					series.map((line) => [
						line.key,
						curveFor(
							data.map((item) => item.values[line.key] ?? 0),
							curve === 'smooth'
						)
					])
				)
		);
	});
	const range = $derived.by(() => {
		let low = Infinity;
		let high = -Infinity;
		for (const line of visible) {
			for (const item of data) {
				const value = item.values[line.key] ?? 0;
				low = Math.min(low, value);
				high = Math.max(high, value);
			}
		}
		return Number.isFinite(low) ? niceScale(low, high) : null;
	});
	/** The last range with something on show, so hiding every series keeps the gridlines where they were. */
	let lastRange = niceScale(0, 100);
	const steady = $derived.by(() => {
		if (range && (range.min !== lastRange.min || range.max !== lastRange.max)) lastRange = range;
		return lastRange;
	});
	const scaleMin = motionValue(untrack(() => steady.min));
	const scaleMax = motionValue(untrack(() => steady.max));

	// Scrubbing: a new range lets go of the crosshair.
	let active = $state<number | null>(null);
	$effect.pre(() => {
		void signature;
		active = null;
	});
	const index = $derived(active === null || empty ? null : Math.min(active, last));
	const scrubbing = $derived(index !== null);

	let figureSeen = $state(false);
	let plotWidth = $state(0);
	let width = 0;
	let tipSize = { w: 0, h: 0 };
	let tipTarget = { x: 0, y: 0 };
	const tracks = new Map<string, Track>();
	const drawn = motionValue(0);
	const cursor = motionValue(1);
	const tipX = springValue<number>(0, follow);
	const tipY = springValue<number>(0, follow);

	let plot: HTMLDivElement;
	let tip: HTMLDivElement;
	let clipRect: SVGRectElement;
	let crosshair: SVGLineElement;
	const lines = new Map<string, SVGPathElement>();
	const areas = new Map<string, SVGPathElement>();
	const dots = new Map<string, SVGCircleElement>();
	const groups = new Map<string, SVGGElement>();
	const gridRows = new Map<SVGLineElement, number>();
	const tickRows = new Map<HTMLElement, number>();

	function register<T extends Element>(nodes: Map<string, T>, key: string): Attachment<T> {
		return (node) => {
			nodes.set(key, node);
			return () => {
				if (nodes.get(key) === node) nodes.delete(key);
			};
		};
	}

	/** Gridlines and value labels ride the animated scale, so a taller range slides them down while new rows fade in above. */
	function row<T extends Element>(rows: Map<T, number>, value: number): Attachment<T> {
		return (node) => {
			rows.set(node, value);
			paint();
			return () => rows.delete(node);
		};
	}

	function rowY(value: number) {
		const span = scaleMax.get() - scaleMin.get() || 1;
		return Math.round(TOP + (1 - (value - scaleMin.get()) / span) * (height - TOP)) + 0.5;
	}

	function paintRows() {
		for (const [node, value] of gridRows) {
			const y = String(rowY(value));
			node.setAttribute('y1', y);
			node.setAttribute('y2', y);
		}
		for (const [node, value] of tickRows) node.style.transform = `translateY(${rowY(value)}px)`;
	}

	/** Writes every line, area and dot for the cursor position; returns the y of each dot on show. */
	function paintSeries(plotWidthPx: number, at: number) {
		const low = scaleMin.get();
		const span = scaleMax.get() - low || 1;
		const toY = (value: number) => TOP + (1 - (value - low) / span) * (height - TOP);
		const dotYs: number[] = [];
		for (const line of series) {
			const track = tracks.get(line.key);
			if (!track) continue;
			const presence = track.presence;
			const y = (value: number) => toY(low + (value - low) * presence);
			const path = track.shape.length
				? `M${track.shape.map(([x, value]) => `${(x * plotWidthPx).toFixed(1)},${y(value).toFixed(1)}`).join('L')}`
				: '';
			lines.get(line.key)?.setAttribute('d', path);
			areas
				.get(line.key)
				?.setAttribute('d', path ? `${path}L${plotWidthPx},${height}L0,${height}Z` : '');
			const group = groups.get(line.key);
			if (group) group.style.opacity = String(presence);
			const dot = dots.get(line.key);
			if (dot && track.shape.length) {
				const cy = y(valueAt(track.shape, at));
				dot.setAttribute('cx', (at * plotWidthPx).toFixed(1));
				dot.setAttribute('cy', cy.toFixed(1));
				if (presence > 0.5) dotYs.push(cy);
			}
		}
		return dotYs;
	}

	// The tooltip sits beside the crosshair, flips sides before it would leave the plot, and centres on the points it describes.
	function placeTip(crosshairX: number, plotWidthPx: number, dotYs: number[]) {
		const { w: tipWidth, h: tipHeight } = tipSize;
		let x = crosshairX + GAP;
		if (x + tipWidth > plotWidthPx) x = crosshairX - GAP - tipWidth;
		const middle = dotYs.length
			? dotYs.reduce((sum, value) => sum + value, 0) / dotYs.length
			: height / 2;
		tipTarget = {
			x: clamp(x, 0, Math.max(0, plotWidthPx - tipWidth)),
			y: clamp(middle - tipHeight / 2, 0, Math.max(0, height - tipHeight))
		};
		if (reduced) {
			tipX.jump(tipTarget.x);
			tipY.jump(tipTarget.y);
		} else {
			tipX.set(tipTarget.x);
			tipY.set(tipTarget.y);
		}
	}

	// One writer for every drawn attribute: morphs, toggles, the scale, the crosshair, and the measured size all repaint through here.
	function paintFrame() {
		paintRows();
		if (!width) return;
		const at = cursor.get();
		const dotYs = paintSeries(width, at);
		clipRect?.setAttribute('width', String(drawn.get() * (width + 2 * CLIP_BLEED_X)));
		const crosshairX = Math.round(at * width) + 0.5;
		crosshair?.setAttribute('x1', String(crosshairX));
		crosshair?.setAttribute('x2', String(crosshairX));
		placeTip(crosshairX, width, dotYs);
	}

	/** Paint runs from motion callbacks and effects alike; it must never subscribe the caller to what it reads. */
	const paint = () => untrack(paintFrame);

	$effect(() => {
		const moveTip = () =>
			(tip.style.transform = `translateX(${tipX.get()}px) translateY(${tipY.get()}px)`);
		moveTip();
		const stops = [
			...[cursor, drawn, scaleMin, scaleMax].map((value) => value.on('change', paint)),
			tipX.on('change', moveTip),
			tipY.on('change', moveTip)
		];
		return () => stops.forEach((stop) => stop());
	});

	$effect(() => {
		void series;
		void height;
		paint();
	});

	// The plot draws in its own pixels: measure the width, follow resizes, and size the tooltip for its flip.
	$effect(() => {
		const read = () => {
			width = plot.clientWidth;
			plotWidth = width;
			tipSize = { w: tip.offsetWidth, h: tip.offsetHeight };
			paint();
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(plot);
		observer.observe(tip);
		return () => observer.disconnect();
	});

	// New data morphs every line from the shape on screen, sampled on shared x positions so a range that gains or loses points still flows.
	let morph: { stop: () => void } | null = null;
	function morphTo(next: Map<string, Point[]>, jump: boolean) {
		const moves: { track: Track; xs: number[]; from: number[]; to: number[]; target: Point[] }[] =
			[];
		for (const [key, target] of next) {
			const track = tracks.get(key);
			if (!track) {
				tracks.set(key, { shape: target, presence: hidden.includes(key) ? 0 : 1, fade: null });
				continue;
			}
			if (!track.shape.length || !target.length || jump) {
				track.shape = target;
				continue;
			}
			const xs = [...new Set([...morphGrid, ...target.map(([x]) => x)])].sort((a, b) => a - b);
			moves.push({
				track,
				xs,
				from: xs.map((x) => valueAt(track.shape, x)),
				to: xs.map((x) => valueAt(target, x)),
				target
			});
		}
		morph?.stop();
		if (!moves.length) {
			paint();
			return;
		}
		morph = animate(0, 1, {
			...settle,
			restDelta: MORPH_REST_DELTA,
			onUpdate: (progress) => {
				for (const move of moves) {
					move.track.shape = move.xs.map((x, at): Point => [
						x,
						move.from[at] + (move.to[at] - move.from[at]) * progress
					]);
				}
				paint();
			},
			onComplete: () => {
				for (const move of moves) move.track.shape = move.target;
				paint();
			}
		});
	}
	$effect(() => {
		const next = targets;
		const jump = reduced;
		untrack(() => morphTo(next, jump));
		return () => morph?.stop();
	});

	// A hidden series flattens into the baseline as it fades; the ones that stay rescale around it.
	function fadeTracks(hiddenKeys: string[], jump: boolean) {
		for (const [key, track] of tracks) {
			const to = hiddenKeys.includes(key) ? 0 : 1;
			if (track.presence === to) continue;
			track.fade?.stop();
			if (jump) {
				track.presence = to;
				continue;
			}
			track.fade = animate(track.presence, to, {
				...settle,
				onUpdate: (value) => {
					track.presence = value;
					paint();
				}
			});
		}
		paint();
	}
	$effect(() => {
		const hiddenKeys = hidden;
		const jump = reduced;
		untrack(() => fadeTracks(hiddenKeys, jump));
	});

	$effect(() => {
		const { min, max } = steady;
		if (reduced) {
			scaleMin.jump(min);
			scaleMax.jump(max);
			return;
		}
		const controls = [animate(scaleMin, min, settle), animate(scaleMax, max, settle)];
		return () => controls.forEach((control) => control.stop());
	});

	// The lines draw left to right the first time the chart is seen with data.
	$effect(() => onceInView(ref!, IN_VIEW_AMOUNT, () => (figureSeen = true)));
	$effect(() => {
		if (empty) return;
		if (reduced) {
			drawn.jump(1);
			return;
		}
		if (!figureSeen || drawn.get() >= 1) return;
		const controls = animate(drawn, 1, draw);
		return () => controls.stop();
	});

	// The crosshair appears on the first scrubbed point and glides between the ones after it; the tooltip follows on its own spring.
	let wasScrubbing = false;
	function moveCursor(to: number, jump: boolean) {
		if (jump || !wasScrubbing) {
			cursor.jump(to);
			tipX.jump(tipTarget.x);
			tipY.jump(tipTarget.y);
		}
		wasScrubbing = true;
		if (jump) return;
		const controls = animate(cursor, to, glide);
		return () => controls.stop();
	}
	$effect(() => {
		if (index === null) {
			wasScrubbing = false;
			return;
		}
		const to = last > 0 ? index / last : 0.5;
		const jump = reduced;
		return untrack(() => moveCursor(to, jump));
	});

	$effect(() => {
		const at = index;
		untrack(() => onActiveChange?.(at, at === null ? null : (data[at] ?? null)));
	});

	function pointAt(clientX: number) {
		const rect = plot.getBoundingClientRect();
		if (!rect.width || last < 1) return Math.max(0, last);
		return clamp(Math.round(((clientX - rect.left) / rect.width) * last), 0, last);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && scrubbing) {
			event.preventDefault();
			active = null;
			return;
		}
		const from = index ?? last + 1;
		const page = Math.max(1, Math.round(data.length / PAGE_SHARE));
		const forward = index === null ? last : from + 1;
		const targetsByKey: Record<string, number> = {
			ArrowLeft: from - 1,
			ArrowDown: from - 1,
			ArrowRight: forward,
			ArrowUp: forward,
			PageDown: from - page,
			PageUp: from + page,
			Home: 0,
			End: last
		};
		const next = targetsByKey[event.key];
		if (next === undefined || empty) return;
		event.preventDefault();
		active = clamp(next, 0, last);
	}

	function onpointerdown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (empty) return;
		if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture?.(event.pointerId);
		active = pointAt(event.clientX);
	}

	function onpointermove(event: PointerEvent) {
		if (!empty && (event.pointerType === 'mouse' || event.buttons)) active = pointAt(event.clientX);
	}

	function onfocus(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (isKeyboardFocus(event.currentTarget) && !empty) active = active ?? last;
	}

	const format = (value: number, line: LineChartSeries) =>
		`${formatValue ? formatValue(value, line) : grouped.format(value)}${unit ? ` ${unit}` : ''}`;
	const reading = $derived(index === null ? null : data[index]);
	const shown = $derived(reading ?? data[last]);
	const valueText = $derived(
		reading
			? `${reading.label}: ${visible.map((line) => `${line.label} ${format(reading.values[line.key] ?? 0, line)}`).join(', ')}`
			: empty
				? emptyLabel
				: `${visible.length} of ${series.length} series shown`
	);
	const summary = $derived(
		empty
			? `${label}. ${emptyLabel}.`
			: `${label}, ${data[0].label} to ${data[last].label}. ${visible
					.map((line) => `${line.label}, latest ${format(data[last].values[line.key] ?? 0, line)}`)
					.join('. ')}.`
	);
	const picks = $derived(axisPicks(data, plotWidth));
	const allHidden = $derived(!empty && visible.length === 0);
</script>

<figure
	bind:this={ref}
	class={['figure', className]}
	aria-label={label}
	aria-busy={loading || undefined}
	{...rest}
>
	{#if showLegend}
		<div class="legend" role="group" aria-label="{label} series">
			{#each series as line, at (line.key)}
				<button
					type="button"
					class="toggle"
					aria-pressed={!hidden.includes(line.key)}
					onclick={() => toggle(line.key)}
					style:--series={colorOf(line, at)}
				>
					<span class="swatch" data-dashed={line.dashed || undefined} aria-hidden="true"></span>
					<span class="toggle-label">{line.label}</span>
				</button>
			{/each}
		</div>
	{/if}
	<div class="chart" data-scrubbing={scrubbing || undefined} data-loading={loading || undefined}>
		<div
			bind:this={plot}
			class="plot"
			style:height="{height}px"
			role="slider"
			tabindex={empty ? -1 : 0}
			aria-label="{label}, explore by {categoryLabel.toLowerCase()}"
			aria-orientation="horizontal"
			aria-valuemin={1}
			aria-valuemax={Math.max(1, data.length)}
			aria-valuenow={(index ?? last) + 1}
			aria-valuetext={valueText}
			{onpointerdown}
			{onpointermove}
			onpointerup={(event) => {
				if (event.pointerType !== 'mouse') active = null;
			}}
			onpointercancel={() => (active = null)}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') active = null;
			}}
			{onkeydown}
			onblur={() => (active = null)}
			{onfocus}
		>
			<svg class="svg" width="100%" {height} aria-hidden="true" focusable="false">
				<defs>
					<clipPath id="{uid}-draw" clipPathUnits="userSpaceOnUse">
						<rect
							bind:this={clipRect}
							x={-CLIP_BLEED_X}
							y={-CLIP_BLEED_Y}
							width={0}
							height={height + 2 * CLIP_BLEED_Y}
						/>
					</clipPath>
				</defs>
				{#each steady.ticks.slice(1) as value (value)}
					<line
						class="grid"
						x1={0}
						x2="100%"
						{@attach row(gridRows, value)}
						in:fade={fadeIn}
						out:fade={fadeOut}
					/>
				{/each}
				<line class="baseline" x1={0} x2="100%" y1={height - 0.5} y2={height - 0.5} />
				<line bind:this={crosshair} class="crosshair" y1={TOP - CROSSHAIR_OVERHANG} y2={height} />
				<g class="series" clip-path="url(#{uid}-draw)">
					{#each series as line, at (line.key)}
						<g {@attach register(groups, line.key)} style:--series={colorOf(line, at)}>
							{#if line.area ?? at === 0}
								<path class="area" {@attach register(areas, line.key)} />
							{/if}
							<path
								class="line"
								data-dashed={line.dashed || undefined}
								{@attach register(lines, line.key)}
							/>
						</g>
					{/each}
				</g>
				{#each series as line, at (line.key)}
					<circle
						class="dot"
						r={DOT_RADIUS}
						data-hidden={hidden.includes(line.key) || undefined}
						style:--series={colorOf(line, at)}
						{@attach register(dots, line.key)}
					/>
				{/each}
			</svg>
			<div bind:this={tip} class="tooltip" aria-hidden="true">
				<p class="tip-title">{shown?.label ?? ''}</p>
				{#each visible as line (line.key)}
					<p class="tip-row" style:--series={colorOf(line, series.indexOf(line))}>
						<span class="tip-swatch" data-dashed={line.dashed || undefined}></span>
						<span class="tip-name">{line.label}</span>
						<span class="tip-value">{format(shown?.values[line.key] ?? 0, line)}</span>
					</p>
				{/each}
			</div>
			{#if empty && !loading}
				<p class="message" in:fade={defaultFadeIn} out:fade={fadeOut}>{emptyLabel}</p>
			{:else if allHidden && !loading}
				<p class="message" in:fade={defaultFadeIn} out:fade={fadeOut}>Choose a series to show</p>
			{/if}
			{#if loading && empty}
				<span class="skeleton" in:fade={defaultFadeIn} out:fade={fadeOut} aria-hidden="true"></span>
			{/if}
		</div>
		<div class="gutter" aria-hidden="true">
			{#each steady.ticks as value (value)}
				<span class="tick" {@attach row(tickRows, value)} in:fade={fadeIn} out:fade={fadeOut}>
					<span class="tick-text">{formatTick(value)}</span>
				</span>
			{/each}
		</div>
		<div class="axis" aria-hidden="true">
			{#each picks as at (`${data[at].key}:${data[at].axisLabel}`)}
				{@const share = last > 0 ? at / last : 0.5}
				<span
					class="axis-label"
					style:left="{share * 100}%"
					style:transform="translateX({-share * 100}%)"
					in:fade={fadeIn}
					out:fade={fadeOut}
				>
					{data[at].axisLabel}
				</span>
			{/each}
		</div>
	</div>
	<p class="sr-only">{summary}</p>
	{#if !empty}
		<table class="sr-only">
			<caption>{label}</caption>
			<thead>
				<tr>
					<th scope="col">{categoryLabel}</th>
					{#each series as line (line.key)}
						<th scope="col">{line.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data as item (item.key)}
					<tr>
						<th scope="row">{item.label}</th>
						{#each series as line (line.key)}
							<td>{format(item.values[line.key] ?? 0, line)}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
	<p class="sr-only" aria-live="polite" aria-atomic="true">{loading ? 'Loading' : ''}</p>
</figure>

<style>
	.figure {
		display: grid;
		min-width: 0;
		gap: var(--arc-space-4);
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}

	/* Series toggles: a plain line swatch beside each name. A hidden series keeps its place, its swatch empties and its name steps back. */
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 4px;
		min-width: 0;
		margin-inline: -8px;
	}
	.toggle {
		display: inline-flex;
		min-height: 32px;
		align-items: center;
		gap: 8px;
		padding: 0 10px 0 8px;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		-webkit-tap-highlight-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.toggle:active {
		transform: scale(0.97);
	}
	.toggle[aria-pressed='false'] {
		color: var(--arc-text-muted);
	}
	.toggle-label {
		white-space: nowrap;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.toggle[aria-pressed='false'] .toggle-label {
		opacity: 0.72;
		text-decoration: line-through;
		text-decoration-color: color-mix(in oklch, currentColor 55%, transparent);
	}
	.swatch {
		position: relative;
		width: 14px;
		height: 10px;
		flex: none;
	}
	.swatch::before {
		position: absolute;
		top: 50%;
		left: 0;
		width: 100%;
		height: 2.5px;
		border-radius: 2px;
		background: var(--series);
		content: '';
		transform: translateY(-50%) scaleX(1);
		transform-origin: left;
		transition:
			transform var(--arc-duration-standard) var(--arc-ease-spring),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* Functional gradient: the dashes mirror the series' dashed stroke. */
	.swatch[data-dashed]::before {
		background: repeating-linear-gradient(to right, var(--series) 0 4px, transparent 4px 7px);
	}
	.toggle[aria-pressed='false'] .swatch::before {
		opacity: 0.45;
		transform: translateY(-50%) scaleX(0.35);
	}
	@media (hover: hover) and (pointer: fine) {
		.toggle:hover {
			background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
			color: var(--arc-foreground);
		}
	}

	/* Plot, right-hand value axis, and the date axis beneath. */
	.chart {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px;
		grid-template-rows: auto 26px;
		min-width: 0;
	}
	.plot {
		position: relative;
		grid-area: 1 / 1;
		min-width: 0;
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--arc-border);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	.baseline {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	.crosshair {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
		shape-rendering: crispEdges;
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.chart[data-scrubbing] .crosshair {
		opacity: 1;
	}

	.series {
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.chart[data-loading] .series {
		opacity: 0.32;
		animation: breathe 1.4s var(--arc-ease-in-out) infinite alternate;
	}
	.line {
		fill: none;
		stroke: var(--series);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: stroke var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.line[data-dashed] {
		stroke-dasharray: 4 5;
		stroke-width: 1.75;
	}
	.area {
		fill: color-mix(in oklch, var(--series) 9%, transparent);
		stroke: none;
	}
	.dot {
		fill: var(--series);
		stroke: var(--arc-surface);
		stroke-width: 2;
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.chart[data-scrubbing] .dot:not([data-hidden]) {
		opacity: 1;
	}

	/* The tooltip floats over the plot, so it is the one layer here with a shadow. Springs carry its position; opacity and a small scale bring it in. */
	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		display: grid;
		min-width: 140px;
		max-width: min(220px, 100%);
		gap: 4px;
		padding: 10px 12px;
		border: 1px solid var(--arc-border);
		border-radius: 14px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		opacity: 0;
		pointer-events: none;
		scale: 0.96;
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			scale var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.chart[data-scrubbing] .tooltip {
		opacity: 1;
		scale: 1;
	}
	.tip-title {
		margin: 0 0 2px;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.tip-row {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: var(--arc-text-sm);
		line-height: 1.3;
	}
	.tip-swatch {
		width: 10px;
		height: 2.5px;
		flex: none;
		border-radius: 2px;
		background: var(--series);
	}
	/* Functional gradient: the dashes mirror the series' dashed stroke. */
	.tip-swatch[data-dashed] {
		background: repeating-linear-gradient(to right, var(--series) 0 3px, transparent 3px 5px);
	}
	.tip-name {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		color: var(--arc-text-secondary);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tip-value {
		flex: none;
		margin-left: 8px;
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.message {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		pointer-events: none;
	}
	/* First load with nothing to keep on screen: a calm band that breathes where the lines will be. Solid, with no decorative gradient. */
	.skeleton {
		position: absolute;
		inset: 30% 0 25%;
		border-radius: 12px;
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
		animation: breathe 1.4s var(--arc-ease-in-out) infinite alternate;
	}

	.gutter {
		position: relative;
		grid-area: 1 / 2;
		min-width: 0;
	}
	.tick {
		position: absolute;
		top: 0;
		left: 10px;
		display: block;
		height: 0;
		white-space: nowrap;
		pointer-events: none;
	}
	.tick-text {
		display: block;
		transform: translateY(-50%);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.axis {
		position: relative;
		grid-area: 2 / 1;
		min-width: 0;
	}
	.axis-label {
		position: absolute;
		top: 8px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@keyframes breathe {
		from {
			opacity: 0.22;
		}
		to {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.toggle,
		.swatch::before,
		.line,
		.tooltip,
		.crosshair,
		.dot,
		.series {
			transition: none;
		}
		.chart[data-loading] .series,
		.skeleton {
			animation: none;
		}
	}
</style>
