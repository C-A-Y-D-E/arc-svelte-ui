<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { clamp } from '../sparkline/chart-kit';

	export interface StreamgraphSeries {
		/** Stable identity. A layer keeps its place and color across data changes, so switching datasets morphs it. */
		key: string;
		/** Name in the legend, the direct label, the tooltip, and the data table. */
		label: string;
		/** Any CSS color. Defaults to the chart series for the first four layers (the first in the accent), then neutral steps. */
		color?: string;
	}

	export interface StreamgraphDatum {
		/** Stable identity, such as an ISO week. */
		key: string;
		/** Full label for the tooltip and screen readers, such as "Week of Sep 14". */
		label: string;
		/** Short label on the time axis. Leave it out to keep the axis quiet at that point. */
		axisLabel?: string;
		/** One value per series key. Missing values count as zero; negatives are treated as zero. */
		values: Record<string, number | undefined>;
	}

	/** "wiggle" minimises layer slopes for a flowing stream, "silhouette" centres the stack, "zero" stacks from a flat baseline. */
	export type StreamgraphOffset = 'wiggle' | 'silhouette' | 'zero';

	/** Use a streamgraph for how the mix of several parts changes over time, when the overall shape matters more than exact values. */
	export interface StreamgraphProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
		data: StreamgraphDatum[];
		/** Layers from the centre out: the first runs through the middle of the stream, the rest alternate above and below it. */
		series: StreamgraphSeries[];
		/** What is measured, such as "Support tickets by topic". Names the chart for assistive technology. */
		label: string;
		/** Unit after each value, such as "tickets". */
		unit?: string;
		/** Plot height in pixels. The width follows the container. */
		height?: number;
		offset?: StreamgraphOffset;
		formatValue?: (value: number, series: StreamgraphSeries) => string;
		/** Hidden layer keys. A hidden layer thins to nothing and the rest reflow. */
		hiddenSeries?: string[];
		defaultHiddenSeries?: string[];
		onHiddenSeriesChange?: (hidden: string[]) => void;
		/** Called as the reading moves, and with nulls when it leaves. */
		onActiveChange?: (index: number | null, seriesKey: string | null) => void;
		/** Layer toggles above the plot. */
		legend?: boolean;
		/** Names each layer inside its widest stretch when it is thick enough to hold the text. */
		directLabels?: boolean;
		/** Header of the first column in the screen reader table. */
		categoryLabel?: string;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	}

	/** Samples across the plot: every layer is resampled onto the same grid, so datasets of any length morph into each other. */
	const SAMPLES = 161;
	const SERIES_TOKEN_COUNT = 4;
	/** The first four layers take the chart series in order (the first in the accent); later layers fall back to neutral steps that alternate in lightness. */
	const NEUTRAL_SHADES = [30, 18, 24, 14];
	const AXIS_LABEL_SPACING = 72;
	const MIN_AXIS_LABELS = 2;
	const FLAT_SPAN = 1e-9;

	function colorOf(item: StreamgraphSeries, index: number) {
		if (item.color) return item.color;
		if (index < SERIES_TOKEN_COUNT) return `var(--arc-series-${index + 1})`;
		const shade = NEUTRAL_SHADES[(index - SERIES_TOKEN_COUNT) % NEUTRAL_SHADES.length];
		return `color-mix(in oklch, var(--arc-foreground) ${shade}%, var(--arc-surface))`;
	}

	/** The first layer sits in the middle of the stream and the rest alternate above and below it; a flat baseline stacks them in order. */
	function stackOrder(count: number, mode: StreamgraphOffset) {
		const order = Array.from({ length: count }, (_, index) => index);
		if (mode === 'zero') return order;
		return order.reduce<number[]>(
			(list, index) => (index === 0 ? [0] : index % 2 ? [...list, index] : [index, ...list]),
			[]
		);
	}

	/** Resamples values onto the shared grid with monotone cubic tangents, so curves never swing past the data or below zero. */
	function resample(raw: number[]): number[] {
		const values = raw.map((value) => Math.max(0, value || 0));
		const out = new Array<number>(SAMPLES);
		if (!values.length) return out.fill(0);
		if (values.length === 1) return out.fill(values[0]);
		const last = values.length - 1;
		const slopes = values.slice(1).map((value, index) => value - values[index]);
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
			tangents[0] = tangents[1] = slopes[0];
		}
		for (let k = 0; k < SAMPLES; k++) {
			const at = (k / (SAMPLES - 1)) * last;
			const seg = Math.min(last - 1, Math.floor(at));
			const t = at - seg;
			const t2 = t * t;
			const t3 = t2 * t;
			const a = values[seg];
			const b = values[seg + 1];
			const value =
				(2 * t3 - 3 * t2 + 1) * a +
				(t3 - 2 * t2 + t) * tangents[seg] +
				(3 * t2 - 2 * t3) * b +
				(t3 - t2) * tangents[seg + 1];
			out[k] = clamp(value, Math.min(a, b), Math.max(a, b));
		}
		return out;
	}

	/** The baseline under the stack. Wiggle follows Byron and Wattenberg, then removes its linear drift so the stream stays level. */
	function baseline(layers: number[][], mode: StreamgraphOffset): number[] {
		const base = new Array<number>(SAMPLES).fill(0);
		const totals = base.map((_, j) => layers.reduce((sum, layer) => sum + layer[j], 0));
		if (mode === 'zero' || !layers.length) return base;
		if (mode === 'silhouette') return totals.map((total) => -total / 2);
		for (let j = 1; j < SAMPLES; j++) {
			let s1 = 0;
			let s2 = 0;
			let below = 0;
			for (const layer of layers) {
				const change = layer[j] - layer[j - 1];
				s1 += layer[j];
				s2 += (below + change / 2) * layer[j];
				below += change;
			}
			base[j] = base[j - 1] - (s1 ? s2 / s1 : 0);
		}
		// Least squares line through the centre of the stream, subtracted so it never tilts off the plot.
		const centers = base.map((value, j) => value + totals[j] / 2);
		const mx = (SAMPLES - 1) / 2;
		const my = centers.reduce((sum, value) => sum + value, 0) / SAMPLES;
		let num = 0;
		let den = 0;
		centers.forEach((value, j) => {
			num += (j - mx) * (value - my);
			den += (j - mx) ** 2;
		});
		const slope = den ? num / den : 0;
		return base.map((value, j) => value - (my + slope * (j - mx)));
	}

	/** Stacks the layers on the baseline in stack order; lower and upper edges are indexed like the input layers. */
	function stackLayers(layers: number[][], mode: StreamgraphOffset) {
		const order = stackOrder(layers.length, mode);
		const base = baseline(
			order.map((index) => layers[index]),
			mode
		);
		const lower = new Array<number[]>(layers.length);
		const upper = new Array<number[]>(layers.length);
		let running = base.slice();
		for (const index of order) {
			lower[index] = running;
			running = running.map((value, j) => value + layers[index][j]);
			upper[index] = running;
		}
		let low = Infinity;
		let high = -Infinity;
		for (let j = 0; j < SAMPLES; j++) {
			low = Math.min(low, base[j]);
			high = Math.max(high, running[j]);
		}
		if (!Number.isFinite(low) || high - low < FLAT_SPAN) {
			low = -1;
			high = 1;
		}
		const center = base.map((value, j) => (value + running[j]) / 2);
		return { lower, upper, center, low, high };
	}

	/** Axis labels that fit: at most one per 72 pixels, counted back from the latest. */
	function axisPicks(data: StreamgraphDatum[], width: number) {
		const labeled = data.flatMap((item, index) => (item.axisLabel ? [index] : []));
		if (!width || !labeled.length) return [];
		const stride = Math.ceil(
			labeled.length / Math.max(MIN_AXIS_LABELS, Math.floor(width / AXIS_LABEL_SPACING))
		);
		return labeled
			.reverse()
			.filter((_, rank) => rank % stride === 0)
			.reverse();
	}

	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
</script>

<script lang="ts">
	import { animate, motionValue, springValue, type MotionValue } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { isReducedMotion, motionTokens } from '../motion';
	import { isKeyboardFocus, onceInView, physicalSpring } from '../sparkline/chart-kit';

	type Hover = { index: number; key: string | null; y: number | null };
	type Frame = { lower: number[][]; upper: number[][]; toY: (value: number) => number };
	type Layout = {
		series: StreamgraphSeries[];
		offset: StreamgraphOffset;
		height: number;
		width: number;
	};
	type Presence = { value: number; stop: (() => void) | null };
	type LabelGeometry = {
		xs: number[];
		yAt: (value: number, j: number) => number;
		pixelsPerUnit: number;
		width: number;
	};

	let {
		data,
		series,
		label,
		unit = '',
		height = 260,
		offset = 'wiggle',
		formatValue,
		defaultHiddenSeries = [],
		hiddenSeries = $bindable(defaultHiddenSeries),
		onHiddenSeriesChange,
		onActiveChange,
		legend = true,
		directLabels = true,
		categoryLabel = 'Date',
		emptyLabel = 'No data for this range',
		ref = $bindable(null),
		class: className,
		...rest
	}: StreamgraphProps = $props();

	const PLOT_PAD = 10;
	const TIP_GAP = 14;
	const IN_VIEW_AMOUNT = 0.3;
	const MORPH_REST_DELTA = 0.0005;
	const SWELL_SECONDS = 0.9;
	const HIT_SLOP = 1;
	const KEYBOARD_PAGES = 6;
	/** Labels never sit on the first or last few samples, where a layer is clipped by the plot edge. */
	const LABEL_EDGE_SAMPLES = 4;
	const LABEL_HOLD_SHARE = 0.8;
	const LABEL_MIN_THICKNESS = 19;
	const LABEL_INSET = 6;
	const LABEL_FALLBACK_WIDTH = 60;
	const LABEL_MIN_ROOM = 16;

	const { spring } = motionTokens;
	const settle = physicalSpring(spring.smooth, MORPH_REST_DELTA);
	const swell = physicalSpring({ visualDuration: SWELL_SECONDS, bounce: 0 }, MORPH_REST_DELTA);
	const glide = physicalSpring(spring.snappy);
	const follow = { stiffness: glide.stiffness, damping: glide.damping, restDelta: glide.restDelta };

	let plot: HTMLDivElement;
	let tip: HTMLDivElement;
	let crosshair: SVGLineElement;
	const paths = new Map<string, SVGPathElement>();
	const labels = new Map<string, SVGTextElement>();

	const last = $derived(data.length - 1);
	const empty = $derived(data.length === 0);
	const colors = $derived(series.map(colorOf));

	const hidden = $derived(hiddenSeries ?? []);
	const visible = $derived(series.filter((item) => !hidden.includes(item.key)));

	function toggle(key: string) {
		const next = hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];
		hiddenSeries = next;
		onHiddenSeriesChange?.(next);
	}

	// Each layer becomes a dense curve on the shared grid; the painter blends from what is on screen to it.
	const signature = $derived(
		`${series.map((item) => item.key).join(',')}|${data.map((item) => series.map((line) => item.values[line.key] ?? 0).join(',')).join(';')}`
	);
	// Keyed on the values rather than the arrays, so a parent re-creating the same data never restarts a morph.
	const targets = $derived.by(() => {
		void signature;
		return untrack(
			() =>
				new Map(
					series.map((line) => [line.key, resample(data.map((item) => item.values[line.key] ?? 0))])
				)
		);
	});

	// A new dataset starts without a reading.
	let hover = $derived.by<Hover | null>(() => {
		void signature;
		return null;
	});
	const index = $derived(hover && !empty ? Math.min(hover.index, last) : null);
	let legendKey = $state<string | null>(null);
	const wanted = $derived(hover?.key ?? legendKey);
	const activeKey = $derived(wanted && visible.some((item) => item.key === wanted) ? wanted : null);
	const isDimmed = (key: string) => activeKey !== null && activeKey !== key;

	let plotWidth = $state(0);
	let layout: Layout | null = null;
	const shapes = new Map<string, number[]>();
	const presences = new Map<string, Presence>();
	const labelSpots = new Map<string, number>();
	let frame: Frame | null = null;
	const grow = motionValue(0);

	function scaledShape(key: string) {
		const shape = shapes.get(key);
		const presence = presences.get(key)?.value ?? 1;
		return shape ? shape.map((value) => value * presence) : new Array<number>(SAMPLES).fill(0);
	}

	// One writer for every drawn attribute: morphs, toggles, the first swell, and resizes all repaint through here.
	function paint() {
		if (!layout?.width) return;
		const { series: order, offset: mode, height: plotHeight, width } = layout;
		const { lower, upper, center, low, high } = stackLayers(
			order.map((line) => scaledShape(line.key)),
			mode
		);
		const span = high - low;
		const growth = grow.get();
		const toY = (value: number) =>
			PLOT_PAD + (1 - (value - low) / span) * (plotHeight - PLOT_PAD * 2);
		const yAt = (value: number, j: number) => toY(center[j] + (value - center[j]) * growth);
		frame = { lower, upper, toY };
		const xs = Array.from({ length: SAMPLES }, (_, j) => (j / (SAMPLES - 1)) * width);
		const geometry = {
			xs,
			yAt,
			pixelsPerUnit: ((plotHeight - PLOT_PAD * 2) / span) * growth,
			width
		};
		order.forEach((line, i) => {
			paths.get(line.key)?.setAttribute('d', layerPath(xs, upper[i], lower[i], yAt));
			const text = labels.get(line.key);
			if (text) placeLabel(text, line.key, upper[i], lower[i], geometry);
		});
	}

	function layerPath(xs: number[], top: number[], bottom: number[], yAt: LabelGeometry['yAt']) {
		let d = '';
		for (let j = 0; j < SAMPLES; j++)
			d += `${j ? 'L' : 'M'}${xs[j].toFixed(1)},${yAt(top[j], j).toFixed(1)}`;
		for (let j = SAMPLES - 1; j >= 0; j--)
			d += `L${xs[j].toFixed(1)},${yAt(bottom[j], j).toFixed(1)}`;
		return `${d}Z`;
	}

	// The label sits where its layer is thickest, and holds its spot until another stretch is clearly thicker.
	function placeLabel(
		text: SVGTextElement,
		key: string,
		top: number[],
		bottom: number[],
		{ xs, yAt, pixelsPerUnit, width }: LabelGeometry
	) {
		const thicknessAt = (j: number) => top[j] - bottom[j];
		let best = LABEL_EDGE_SAMPLES;
		for (let j = LABEL_EDGE_SAMPLES; j < SAMPLES - LABEL_EDGE_SAMPLES; j++) {
			if (thicknessAt(j) > thicknessAt(best)) best = j;
		}
		const held = labelSpots.get(key);
		const holds = held !== undefined && thicknessAt(held) >= thicknessAt(best) * LABEL_HOLD_SHARE;
		const j = holds ? held : best;
		labelSpots.set(key, j);
		const room = text.getComputedTextLength?.() ?? LABEL_FALLBACK_WIDTH;
		const x = clamp(xs[j], room / 2 + LABEL_INSET, width - room / 2 - LABEL_INSET);
		const fits =
			thicknessAt(j) * pixelsPerUnit >= LABEL_MIN_THICKNESS && room + LABEL_MIN_ROOM < width;
		text.setAttribute('x', x.toFixed(1));
		text.setAttribute('y', yAt((top[j] + bottom[j]) / 2, j).toFixed(1));
		text.style.opacity = fits ? '1' : '0';
	}

	const register =
		<T extends Element>(nodes: Map<string, T>, key: string): Attachment<T> =>
		(node) => {
			nodes.set(key, node);
			return () => nodes.delete(key);
		};

	$effect(() => {
		layout = { series, offset, height, width: plotWidth };
		paint();
	});

	$effect(() => {
		const node = plot;
		const measure = () => (plotWidth = node.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	});

	// New data blends every layer from the shape on screen; a layer that arrives grows out of the one below it.
	$effect(() => {
		const next = targets;
		const jump = isReducedMotion();
		return untrack(() => morphTo(next, jump));
	});

	function morphTo(next: Map<string, number[]>, jump: boolean) {
		const moves: { key: string; from: number[]; to: number[] }[] = [];
		for (const [key, to] of next) {
			const from = shapes.get(key);
			if (!from || jump) shapes.set(key, to);
			else moves.push({ key, from, to });
		}
		for (const key of [...shapes.keys()]) if (!next.has(key)) shapes.delete(key);
		if (!moves.length) {
			paint();
			return;
		}
		const blend = (t: number) => {
			for (const move of moves) {
				shapes.set(
					move.key,
					move.from.map((value, j) => value + (move.to[j] - value) * t)
				);
			}
			paint();
		};
		const controls = animate(0, 1, { ...settle, onUpdate: blend, onComplete: () => blend(1) });
		return () => controls.stop();
	}

	// A hidden layer thins to nothing while the others close over it.
	$effect(() => {
		const hiddenKeys = hidden;
		const lines = series;
		const jump = isReducedMotion();
		untrack(() => {
			for (const line of lines) fadeLayer(line.key, hiddenKeys.includes(line.key) ? 0 : 1, jump);
			paint();
		});
	});

	function fadeLayer(key: string, to: number, jump: boolean) {
		const track = presences.get(key);
		if (!track) {
			presences.set(key, { value: to, stop: null });
			return;
		}
		if (track.value === to) return;
		track.stop?.();
		if (jump) {
			track.value = to;
			track.stop = null;
			return;
		}
		const controls = animate(track.value, to, {
			...settle,
			onUpdate: (value) => {
				track.value = value;
				paint();
			}
		});
		track.stop = () => controls.stop();
	}

	let seen = $state(false);
	$effect(() => {
		if (ref) return onceInView(ref, IN_VIEW_AMOUNT, () => (seen = true));
	});

	// The first time the chart is seen, the stream swells out of a hairline along its centre.
	$effect(() => {
		if (empty) return;
		if (isReducedMotion()) {
			grow.jump(1);
			paint();
			return;
		}
		if (!seen || grow.get() >= 1) return;
		const controls = animate(grow, 1, { ...swell, onUpdate: paint });
		return () => controls.stop();
	});

	// The crosshair glides between points; the tooltip follows on its own spring and never leaves the plot.
	const cursorX = springValue<number>(0, follow);
	const tipX = springValue<number>(0, follow);
	const tipY = springValue<number>(0, follow);
	let wasActive = false;

	$effect(() => {
		const moveTip = () =>
			(tip.style.transform = `translateX(${tipX.get()}px) translateY(${tipY.get()}px)`);
		const unsubscribes = [
			cursorX.on('change', (x) => (crosshair.style.transform = `translateX(${x}px)`)),
			tipX.on('change', moveTip),
			tipY.on('change', moveTip)
		];
		return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
	});

	$effect(() => {
		const width = plotWidth;
		if (index === null || !width) {
			wasActive = false;
			return;
		}
		const x = last > 0 ? (index / last) * width : width / 2;
		const y = hover?.y ?? activeLayerMiddle(x, width);
		const tipWidth = tip.offsetWidth;
		const tipHeight = tip.offsetHeight;
		let left = x + TIP_GAP;
		if (left + tipWidth > width) left = x - TIP_GAP - tipWidth;
		const top = clamp((y ?? height / 2) - tipHeight / 2, 0, Math.max(0, height - tipHeight));
		const instant = !wasActive || isReducedMotion();
		glideTo(cursorX, x, instant);
		glideTo(tipX, clamp(left, 0, Math.max(0, width - tipWidth)), instant);
		glideTo(tipY, top, instant);
		wasActive = true;
	});

	function glideTo(value: MotionValue<number>, target: number, instant: boolean) {
		if (instant) value.jump(target);
		else value.set(target);
	}

	function activeLayerMiddle(x: number, width: number) {
		const layer = series.findIndex((line) => line.key === activeKey);
		if (!frame || layer < 0) return null;
		const j = Math.round((x / width) * (SAMPLES - 1));
		return frame.toY((frame.upper[layer][j] + frame.lower[layer][j]) / 2);
	}

	$effect(() => {
		const reading = index;
		const key = activeKey;
		untrack(() => onActiveChange?.(reading, key));
	});

	// The layer under the pointer, found in the frame that is on screen.
	function readPointer(clientX: number, clientY: number): Hover | null {
		const rect = plot.getBoundingClientRect();
		if (!rect.width || empty) return null;
		const share = clamp((clientX - rect.left) / rect.width, 0, 1);
		const y = clientY - rect.top;
		const j = Math.round(share * (SAMPLES - 1));
		let key: string | null = null;
		series.forEach((line, i) => {
			if (!frame || hidden.includes(line.key)) return;
			const top = frame.toY(frame.upper[i][j]);
			const bottom = frame.toY(frame.lower[i][j]);
			if (y >= top - HIT_SLOP && y <= bottom + HIT_SLOP) key = line.key;
		});
		return { index: last > 0 ? Math.round(share * last) : 0, key, y };
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.buttons)
			hover = readPointer(event.clientX, event.clientY);
	}

	function onPointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture?.(event.pointerId);
		hover = readPointer(event.clientX, event.clientY);
	}

	function onFocus(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (isKeyboardFocus(event.currentTarget) && !empty)
			hover ??= { index: last, key: null, y: null };
	}

	function onKeyDown(event: KeyboardEvent) {
		if (empty) return;
		if (event.key === 'Escape' && hover) {
			event.preventDefault();
			hover = null;
			return;
		}
		const move = keyboardMoves()[event.key];
		if (!move) return;
		event.preventDefault();
		hover = move();
	}

	function keyboardMoves(): Record<string, () => Hover> {
		const from = index ?? last;
		const keys = visible.map((line) => line.key);
		const at = activeKey ? keys.indexOf(activeKey) : -1;
		const page = Math.max(1, Math.round(data.length / KEYBOARD_PAGES));
		const readAt = (point: number): Hover => ({
			index: clamp(point, 0, last),
			key: activeKey,
			y: null
		});
		const readLayer = (key: string | undefined): Hover => ({
			index: from,
			key: key ?? null,
			y: null
		});
		return {
			ArrowLeft: () => readAt(from - 1),
			ArrowRight: () => readAt(index === null ? last : from + 1),
			PageDown: () => readAt(from - page),
			PageUp: () => readAt(from + page),
			Home: () => readAt(0),
			End: () => readAt(last),
			ArrowUp: () => readLayer(keys[at < 0 ? keys.length - 1 : Math.min(keys.length - 1, at + 1)]),
			ArrowDown: () => readLayer(keys[at < 0 ? 0 : Math.max(0, at - 1)])
		};
	}

	const withUnit = (text: string) => `${text}${unit ? ` ${unit}` : ''}`;
	const format = (value: number, line: StreamgraphSeries) =>
		withUnit(formatValue ? formatValue(value, line) : grouped.format(value));
	const total = (datum: StreamgraphDatum) =>
		visible.reduce((sum, line) => sum + Math.max(0, datum.values[line.key] ?? 0), 0);

	const reading = $derived(index === null ? null : data[index]);
	const activeLine = $derived(series.find((line) => line.key === activeKey));
	const announce = $derived.by(() => {
		if (!reading) return '';
		const layerPart = activeLine
			? `${activeLine.label} ${format(reading.values[activeLine.key] ?? 0, activeLine)}, `
			: '';
		return `${reading.label}. ${layerPart}${visible.length} layers, ${withUnit(grouped.format(total(reading)))} in total`;
	});
	const summary = $derived(
		empty
			? `${label}. ${emptyLabel}.`
			: `${label}, ${data[0].label} to ${data[last].label}. ${visible.map((line) => `${line.label}, latest ${format(data[last].values[line.key] ?? 0, line)}`).join('. ')}.`
	);
	const picks = $derived(axisPicks(data, plotWidth));
	const tipRows = $derived(
		stackOrder(series.length, offset)
			.reverse()
			.filter((at) => !hidden.includes(series[at].key))
			.map((at) => ({ line: series[at], color: colors[at] }))
	);
</script>

<figure bind:this={ref} class={['figure', className]} aria-label={label} {...rest}>
	{#if legend && series.length > 1}
		<div
			class="legend"
			role="group"
			aria-label="{label} layers"
			onpointerleave={() => (legendKey = null)}
		>
			{#each series as line, at (line.key)}
				<button
					type="button"
					class="toggle"
					aria-pressed={!hidden.includes(line.key)}
					data-active={activeKey === line.key || undefined}
					data-dim={isDimmed(line.key) || undefined}
					style:--series={colors[at]}
					onclick={() => toggle(line.key)}
					onpointerenter={(event) => {
						if (event.pointerType === 'mouse') legendKey = line.key;
					}}
					onfocus={(event) => {
						if (isKeyboardFocus(event.currentTarget)) legendKey = line.key;
					}}
					onblur={() => (legendKey = null)}
				>
					<span class="swatch" aria-hidden="true"></span>
					<span class="toggle-label">{line.label}</span>
				</button>
			{/each}
		</div>
	{/if}
	<div
		class="chart"
		data-active={index !== null || undefined}
		data-layer={activeKey ? true : undefined}
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={plot}
			class="plot"
			style:height="{height}px"
			role="group"
			tabindex={empty ? -1 : 0}
			aria-roledescription="stream graph"
			aria-label="{label}. Use left and right arrows to move through time, up and down to change layer."
			onpointermove={onPointerMove}
			onpointerdown={onPointerDown}
			onpointerup={(event) => {
				if (event.pointerType !== 'mouse') hover = null;
			}}
			onpointercancel={() => (hover = null)}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') hover = null;
			}}
			onkeydown={onKeyDown}
			onblur={() => (hover = null)}
			onfocus={onFocus}
		>
			<svg class="svg" width="100%" {height} aria-hidden="true" focusable="false">
				{#each series as line, at (line.key)}
					<path
						{@attach register(paths, line.key)}
						class="layer"
						data-active={activeKey === line.key || undefined}
						style:--series={colors[at]}
					/>
				{/each}
				<line bind:this={crosshair} class="crosshair" x1="0" x2="0" y1="0" y2={height} />
				{#if directLabels}
					{#each series as line (line.key)}
						<text
							{@attach register(labels, line.key)}
							class="label"
							data-active={activeKey === line.key || undefined}
							data-hidden={hidden.includes(line.key) || undefined}
							data-dim={isDimmed(line.key) || undefined}
							text-anchor="middle"
							dominant-baseline="central">{line.label}</text
						>
					{/each}
				{/if}
			</svg>
			<div bind:this={tip} class="tooltip" aria-hidden="true">
				<p class="tip-title">{reading?.label ?? ''}</p>
				{#each tipRows as { line, color } (line.key)}
					<p
						class="tip-row"
						data-active={activeKey === line.key || undefined}
						data-dim={isDimmed(line.key) || undefined}
						style:--series={color}
					>
						<span class="tip-swatch"></span>
						<span class="tip-name">{line.label}</span>
						<span class="tip-value"
							>{reading ? format(reading.values[line.key] ?? 0, line) : ''}</span
						>
					</p>
				{/each}
			</div>
			{#if empty || visible.length === 0}
				<p class="message">{empty ? emptyLabel : 'Choose a layer to show'}</p>
			{/if}
		</div>
		<div class="axis" aria-hidden="true">
			{#each picks as at (data[at].key)}
				{@const share = last > 0 ? at / last : 0.5}
				<span class="axis-label" style:left="{share * 100}%" style:translate="{-share * 100}% 0"
					>{data[at].axisLabel}</span
				>
			{/each}
		</div>
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
	<p class="sr-only">{summary}</p>
	{#if !empty}
		<div class="sr-only">
			<table>
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
		</div>
	{/if}
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

	/* Layer toggles: a rect swatch mirrors the area it names. Hover or focus previews that layer in the plot. */
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
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.toggle:active {
		transform: scale(0.97);
	}
	.toggle[data-active] {
		color: var(--arc-foreground);
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
	}
	.toggle[data-dim] {
		opacity: 0.56;
	}
	.toggle[aria-pressed='false'] {
		color: var(--arc-text-muted);
	}
	.toggle-label {
		white-space: nowrap;
	}
	.toggle[aria-pressed='false'] .toggle-label {
		opacity: 0.72;
		text-decoration: line-through;
		text-decoration-color: color-mix(in oklch, currentColor 55%, transparent);
	}
	.swatch {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 3px;
		background: var(--series);
		transition:
			transform var(--arc-duration-standard) var(--arc-ease-spring),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.toggle[aria-pressed='false'] .swatch {
		opacity: 0.35;
		transform: scale(0.6);
	}
	@media (hover: hover) and (pointer: fine) {
		.toggle:hover {
			color: var(--arc-foreground);
		}
	}

	.chart {
		position: relative;
		display: grid;
		grid-template-rows: auto 26px;
		min-width: 0;
	}
	.plot {
		position: relative;
		min-width: 0;
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		cursor: crosshair;
	}
	.svg {
		display: block;
		overflow: visible;
	}

	/* A 2px surface stroke is the gap between neighbouring layers. */
	.layer {
		fill: color-mix(in oklch, var(--series) 82%, var(--arc-surface));
		stroke: var(--arc-surface);
		stroke-width: 2;
		stroke-linejoin: round;
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			fill var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.chart[data-layer] .layer:not([data-active]) {
		opacity: 0.34;
	}
	.layer[data-active] {
		fill: var(--series);
	}

	.crosshair {
		stroke: var(--arc-foreground);
		stroke-opacity: 0.5;
		stroke-width: 1;
		shape-rendering: crispEdges;
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
		pointer-events: none;
	}
	.chart[data-active] .crosshair {
		opacity: 1;
	}

	.label {
		fill: var(--arc-foreground);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		paint-order: stroke;
		stroke: var(--arc-surface);
		stroke-width: 3px;
		stroke-opacity: 0.85;
		stroke-linejoin: round;
		pointer-events: none;
		transition:
			opacity var(--arc-duration-standard) var(--arc-ease-standard),
			fill var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.label[data-hidden] {
		opacity: 0 !important;
	}
	.chart[data-layer] .label[data-dim] {
		opacity: 0 !important;
	}

	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		display: grid;
		min-width: 156px;
		max-width: min(232px, 100%);
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
	.chart[data-active] .tooltip {
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
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.tip-row[data-dim] {
		opacity: 0.5;
	}
	.tip-swatch {
		width: 10px;
		height: 2.5px;
		flex: none;
		border-radius: 2px;
		background: var(--series);
	}
	.tip-name {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		color: var(--arc-text-secondary);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tip-row[data-active] .tip-name {
		color: var(--arc-foreground);
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

	.axis {
		position: relative;
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

	@media (prefers-reduced-motion: reduce) {
		.toggle,
		.swatch,
		.layer,
		.crosshair,
		.label,
		.tooltip,
		.tip-row {
			transition: none;
		}
	}
</style>
