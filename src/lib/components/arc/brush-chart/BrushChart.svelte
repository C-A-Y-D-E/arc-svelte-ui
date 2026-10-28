<script module lang="ts">
	export interface BrushChartDatum {
		/** A point in time, as a Date or epoch milliseconds. Points must be in ascending order. */
		date: Date | number;
		value: number;
	}

	export interface BrushChartAnnotation {
		date: Date | number;
		/** Short label printed beside the marker, such as "v2 launch". */
		label: string;
		/** Longer note for the tooltip and screen readers. */
		description?: string;
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';
	import { clamp, createTooltipGlide, onceInView, physicalSpring } from './chart-motion.svelte';
	import { clean, DAY, linePath, lowerBound, niceTop, smoothSeries, timeTicks } from './series';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		data: BrushChartDatum[];
		/** What is measured, such as "Daily active users". Names the chart for assistive technology. */
		label: string;
		/** Unit after each value, such as "users". */
		unit?: string;
		formatValue?: (value: number) => string;
		/** Formats the value axis. Defaults to a compact number, such as 12K. */
		formatTick?: (value: number) => string;
		/** Formats a date in the tooltip and announcements. */
		formatDate?: (date: Date) => string;
		/** Events drawn as markers on both charts. */
		annotations?: BrushChartAnnotation[];
		/** Window as [start, end] epoch milliseconds. A new value glides the window there. */
		range?: [number, number];
		/** Initial window when uncontrolled. Defaults to the whole series. */
		defaultRange?: [number, number];
		/** Called while the window is dragged, resized, stepped, or reset. */
		onRangeChange?: (range: [number, number]) => void;
		/** Smallest window in milliseconds. Defaults to seven days. */
		minSpan?: number;
		/** Main plot height in pixels. */
		height?: number;
		/** Overview strip height in pixels. */
		overviewHeight?: number;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	};

	type Drag = {
		mode: 'start' | 'end' | 'pan' | 'new';
		pointerX: number;
		from: [number, number];
		anchor: number;
		moved: boolean;
	};
	type Edge = 'start' | 'end' | 'window';

	const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const utc = (options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options });
	const fullDate = utc({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
	const shortDate = utc({ month: 'short', day: 'numeric', year: 'numeric' });

	let {
		data,
		label,
		unit = '',
		formatValue = (value) => grouped.format(value),
		formatTick = (value) => compact.format(value),
		formatDate = (date) => fullDate.format(date),
		annotations = [],
		range = $bindable(),
		defaultRange,
		onRangeChange,
		minSpan = 7 * DAY,
		height = 240,
		overviewHeight = 52,
		emptyLabel = 'No data yet',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	const settle = physicalSpring(motionTokens.spring.smooth, 0.001);
	const draw = physicalSpring({ visualDuration: 0.9, bounce: 0 }, 0.001);
	const TOP = 28;
	const GAP = 14;
	const GRIP = 14;
	const DRAG_THRESHOLD = 3;
	const WEEK_POINTS = 7;
	/** Distance in milliseconds below which a controlled range counts as already in place. */
	const RANGE_TOLERANCE = 1000;
	const EDGE_LABEL_ROOM = 24;
	/** Rough width of one character of an event label, for the collision check. */
	const EVENT_CHAR_WIDTH = 6.2;
	const EVENT_OFFSET = 14;
	const id = $props.id();
	const uid = `brush${id}`;
	const glide = createTooltipGlide();
	const time = (date: Date | number) => (typeof date === 'number' ? date : date.getTime());

	let plot: HTMLDivElement;
	let strip: HTMLDivElement;
	let tip: HTMLDivElement;
	let width = $state(0);
	let stripWidth = $state(0);
	let seen = $state(false);

	const reduced = $derived(isReducedMotion());
	const points = $derived(data.map((item) => ({ t: time(item.date), value: item.value })));
	// Zoomed out, a centred seven point average and its low to high band replace the raw line, so weekly noise reads as texture instead of a solid block.
	const smooth = $derived(smoothSeries(points));
	const events = $derived(
		annotations.map((item) => ({ ...item, t: time(item.date) })).sort((a, b) => a.t - b.t)
	);
	const empty = $derived(points.length < 2);
	const first = $derived(points[0]?.t ?? 0);
	const lastT = $derived(points[points.length - 1]?.t ?? 1);
	const whole: [number, number] = $derived([first, lastT]);
	const least = $derived(Math.min(minSpan, lastT - first));

	function fit([start, end]: [number, number]): [number, number] {
		const span = clamp(end - start, least, lastT - first);
		const s = clamp(start, first, lastT - span);
		return [s, s + span];
	}

	// The window: follows the finger 1:1 while dragged, glides on a spring when set from outside or reset.
	let view: [number, number] = $state(untrack(() => range ?? defaultRange ?? whole));
	let flight: { stop: () => void } | null = null;
	function glideTo(next: [number, number]) {
		flight?.stop();
		const from = view;
		if (reduced) {
			view = next;
			return;
		}
		flight = animate(0, 1, {
			...settle,
			onUpdate: (t) =>
				(view = [from[0] + (next[0] - from[0]) * t, from[1] + (next[1] - from[1]) * t])
		});
	}
	function commit(next: [number, number], smoothly: boolean) {
		const target = fit(next);
		if (smoothly) glideTo(target);
		else {
			flight?.stop();
			view = target;
		}
		range = target;
		onRangeChange?.(target);
	}
	$effect(() => {
		const wanted = range;
		if (!wanted || empty) return;
		untrack(() => {
			const target = fit(wanted);
			const distance = Math.abs(target[0] - view[0]) + Math.abs(target[1] - view[1]);
			if (distance > RANGE_TOLERANCE) glideTo(target);
		});
	});
	// Data that no longer covers the window pulls it back inside.
	$effect(() => {
		void [first, lastT];
		untrack(() => {
			if (empty) return;
			const target = fit(view);
			if (target[0] !== view[0] || target[1] !== view[1]) view = target;
		});
	});

	const start = $derived(view[0]);
	const end = $derived(view[1]);
	const span = $derived(Math.max(1, end - start));
	const from = $derived(Math.max(0, lowerBound(points, start) - 1));
	const to = $derived(Math.min(points.length, lowerBound(points, end) + 1));
	const scale = $derived.by(() => {
		let peak = 0;
		for (let index = from; index < to; index++) peak = Math.max(peak, points[index].value);
		return niceTop(peak * 1.04);
	});

	// The value axis springs to the tallest point in view, so zooming into a quiet stretch fills the plot.
	let top = $state(untrack(() => scale.top));
	let aimed = untrack(() => scale.top);
	let topFlight: { stop: () => void } | null = null;
	$effect(() => {
		const goal = scale.top;
		if (aimed === goal) return;
		aimed = goal;
		topFlight?.stop();
		if (reduced) return;
		topFlight = animate(
			untrack(() => top),
			goal,
			{ ...settle, onUpdate: (value) => (top = value) }
		);
	});
	$effect(() => () => {
		flight?.stop();
		topFlight?.stop();
	});

	const x = (t: number) => ((t - start) / span) * width;
	const topNow = $derived(reduced ? scale.top : top);
	const y = (value: number) => TOP + (1 - value / (topNow || 1)) * (height - TOP);
	const line = $derived(width && !empty ? linePath(points, from, to, x, y, width) : '');
	const area = $derived(
		line
			? `${line}L${x(points[to - 1].t).toFixed(1)},${height}L${x(points[from].t).toFixed(1)},${height}Z`
			: ''
	);
	const trend = $derived(width && !empty ? linePath(smooth, from, to, x, y, width * 4) : '');
	const band = $derived.by(() => {
		if (!trend) return '';
		const edge = (read: (point: (typeof smooth)[number]) => number) =>
			linePath(
				smooth.map((point) => ({ t: point.t, value: read(point) })),
				from,
				to,
				x,
				y,
				width * 4
			);
		const upper = edge((point) => point.high);
		const lower = edge((point) => point.low)
			.slice(1)
			.split('L')
			.reverse()
			.join('L');
		return `${upper}L${lower}Z`;
	});
	// How much of the raw line shows: all of it past about four pixels a point, none below about three.
	const pxPerPoint = $derived(
		empty ? width : (width * (lastT - first)) / (points.length - 1) / span
	);
	const detail = $derived(clamp((pxPerPoint - 2.75) / 1.5, 0, 1));
	const ticks = $derived(
		scale.top > 0
			? Array.from({ length: Math.round(scale.top / scale.step) + 1 }, (_, index) =>
					clean(index * scale.step)
				)
			: []
	);
	const xTicks = $derived(width && !empty ? timeTicks(start, end, width) : []);

	// Overview: the whole series, drawn once per width.
	const ox = (t: number) => ((t - first) / (lastT - first || 1)) * stripWidth;
	const overview = $derived.by(() => {
		if (!stripWidth || empty) return { line: '', area: '', marks: [] };
		const max = niceTop(smooth.reduce((m, point) => Math.max(m, point.value), 0)).top || 1;
		const oy = (value: number) => 4 + (1 - value / max) * (overviewHeight - 4);
		const path = linePath(smooth, 0, smooth.length, ox, oy, stripWidth * 4);
		const marks = events.map((event) => {
			const at = clamp(lowerBound(smooth, event.t), 0, smooth.length - 1);
			return { t: event.t, x: ox(event.t), y: oy(smooth[at].value) };
		});
		return {
			line: path,
			area: `${path}L${stripWidth},${overviewHeight}L0,${overviewHeight}Z`,
			marks
		};
	});
	const wx0 = $derived(ox(start));
	const wx1 = $derived(ox(end));

	// The line draws in from the left once, the first time it is seen.
	let revealed = $state(0);
	$effect(() => {
		if (empty || reduced || !seen) return;
		const from = untrack(() => revealed);
		if (from >= 1) return;
		const controls = animate(from, 1, { ...draw, onUpdate: (value) => (revealed = value) });
		return () => controls.stop();
	});

	// Crosshair on the nearest point in view; the tooltip glides beside it and never leaves the plot.
	let active: number | null = $state(null);
	let hoverEvent: number | null = $state(null);
	const index = $derived(active !== null && active >= from && active < to ? active : null);
	function nearest(clientX: number) {
		const rect = plot.getBoundingClientRect();
		if (!rect.width || empty) return null;
		const t = start + ((clientX - rect.left) / rect.width) * span;
		const at = clamp(lowerBound(points, t), 1, points.length - 1);
		const closer = t - points[at - 1].t < points[at].t - t ? at - 1 : at;
		return clamp(closer, Math.max(0, from), to - 1);
	}
	const cx = $derived(index === null ? 0 : x(points[index].t));
	const cy = $derived(
		index === null
			? 0
			: y(smooth[index].value + (points[index].value - smooth[index].value) * detail)
	);
	const sameDay = (a: number, b: number) => Math.abs(a - b) < DAY / 2;
	const eventAt = $derived(
		index === null ? null : (events.find((event) => sameDay(event.t, points[index].t)) ?? null)
	);
	const shownEvent = $derived(hoverEvent !== null ? events[hoverEvent] : null);
	const tipOn = $derived(index !== null || shownEvent !== null);
	let wasOn = false;
	$effect(() => {
		if (!tipOn || !width) {
			wasOn = false;
			return;
		}
		const ax = shownEvent ? x(shownEvent.t) : cx;
		const ay = shownEvent ? TOP : cy;
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;
		let left = ax + GAP;
		if (left + tw > width) left = ax - GAP - tw;
		let topY = ay - th - GAP;
		if (topY < 0) topY = ay + GAP;
		glide.place(
			clamp(left, 0, Math.max(0, width - tw)),
			clamp(topY, 0, Math.max(0, height - th)),
			!wasOn || reduced
		);
		wasOn = true;
	});

	function onPlotMove(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.buttons) active = nearest(event.clientX);
	}
	function onPlotDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (event.pointerType === 'mouse') return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		active = nearest(event.clientX);
	}
	function onPlotKey(event: KeyboardEvent) {
		if (empty) return;
		if (event.key === 'Escape' && index !== null) {
			event.preventDefault();
			active = null;
			return;
		}
		const current = index ?? to - 1;
		const page = Math.max(1, Math.round((to - from) / 8));
		const moves: Record<string, number> = {
			ArrowLeft: current - 1,
			ArrowRight: index === null ? to - 1 : current + 1,
			PageDown: current - page,
			PageUp: current + page,
			Home: from,
			End: to - 1
		};
		const next = moves[event.key];
		if (next === undefined) return;
		event.preventDefault();
		active = clamp(next, Math.max(0, from), to - 1);
	}
	function onPlotFocus(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (event.currentTarget.matches(':focus-visible') && !empty) active = active ?? to - 1;
	}

	// Overview gestures: grab an edge to resize, the window to pan, or empty track to draw a new window. A tap recentres; a double tap resets.
	let drag: Drag | null = null;
	function toTime(clientX: number) {
		const rect = strip.getBoundingClientRect();
		return rect.width
			? first + clamp((clientX - rect.left) / rect.width, 0, 1) * (lastT - first)
			: first;
	}
	function dragMode(px: number): Drag['mode'] {
		if (Math.abs(px - wx0) <= GRIP && px <= (wx0 + wx1) / 2) return 'start';
		if (Math.abs(px - wx1) <= GRIP) return 'end';
		return px > wx0 && px < wx1 ? 'pan' : 'new';
	}
	function onStripDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (empty || event.button > 0) return;
		const px = event.clientX - strip.getBoundingClientRect().left;
		drag = {
			mode: dragMode(px),
			pointerX: event.clientX,
			from: view,
			anchor: toTime(event.clientX),
			moved: false
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
		flight?.stop();
	}
	function onStripMove(event: PointerEvent) {
		if (!drag) return;
		if (!drag.moved && Math.abs(event.clientX - drag.pointerX) < DRAG_THRESHOLD) return;
		drag.moved = true;
		const t = toTime(event.clientX);
		const shift = t - drag.anchor;
		const [s, e] = drag.from;
		const next: [number, number] =
			drag.mode === 'pan'
				? [s + shift, e + shift]
				: drag.mode === 'start'
					? [clamp(t, first, e - least), e]
					: drag.mode === 'end'
						? [s, clamp(t, s + least, lastT)]
						: [Math.min(drag.anchor, t), Math.max(drag.anchor, t)];
		if (drag.mode === 'new' && next[1] - next[0] < least) {
			if (t >= drag.anchor) next[1] = next[0] + least;
			else next[0] = next[1] - least;
		}
		commit(next, false);
	}
	function onStripUp() {
		const current = drag;
		drag = null;
		if (!current || current.moved || current.mode !== 'new') return;
		const half = (view[1] - view[0]) / 2;
		commit([current.anchor - half, current.anchor + half], true);
	}
	const reset = () => commit(whole, true);

	const stepSize = $derived(Math.max(DAY, (lastT - first) / Math.max(1, points.length - 1)));
	const HANDLE_STEPS: Record<string, number> = {
		ArrowLeft: -1,
		ArrowDown: -1,
		PageDown: -1,
		ArrowRight: 1,
		ArrowUp: 1,
		PageUp: 1
	};
	function handleTarget(event: KeyboardEvent, edge: Edge): [number, number] | null {
		const [s, e] = view;
		const win = e - s;
		const big = event.shiftKey || event.key.startsWith('Page');
		const delta = HANDLE_STEPS[event.key];
		if (event.key === 'Escape' || event.key === '0') return whole;
		if (edge === 'window' && (event.key === '+' || event.key === '='))
			return [s + win / 4, e - win / 4];
		if (edge === 'window' && (event.key === '-' || event.key === '_'))
			return [s - win / 2, e + win / 2];
		if (event.key === 'Home')
			return edge === 'end' ? [s, s + least] : [first, edge === 'window' ? first + win : e];
		if (event.key === 'End')
			return edge === 'start' ? [e - least, e] : [edge === 'window' ? lastT - win : s, lastT];
		if (!delta) return null;
		const move = delta * (edge === 'window' ? win * (big ? 0.5 : 0.1) : stepSize * (big ? 10 : 1));
		if (edge === 'window') return [s + move, e + move];
		return edge === 'start'
			? [Math.min(s + move, e - minSpan), e]
			: [s, Math.max(e + move, s + minSpan)];
	}
	function onHandleKey(event: KeyboardEvent, edge: Edge) {
		const next = handleTarget(event, edge);
		if (!next) return;
		event.preventDefault();
		commit(next, false);
	}

	const format = (value: number) => `${formatValue(value)}${unit ? ` ${unit}` : ''}`;
	const reading = $derived(index === null ? null : points[index]);
	const previous = $derived(
		index !== null && index >= WEEK_POINTS ? points[index - WEEK_POINTS] : null
	);
	const change = $derived(
		reading && previous && previous.value ? (reading.value - previous.value) / previous.value : null
	);
	const windowText = $derived(`${shortDate.format(start)} to ${shortDate.format(end)}`);
	const inWindow = $derived(events.filter((event) => event.t >= start && event.t <= end));
	// Event labels are placed left to right and skipped when they would collide with the one before. The value says whether a label flips to the left.
	const labelled = $derived.by(() => {
		const placed = new Map<number, boolean>();
		let edge = -Infinity;
		inWindow.forEach((event, at) => {
			const px = x(event.t);
			const w = event.label.length * EVENT_CHAR_WIDTH + 4;
			const next = at + 1 < inWindow.length ? x(inWindow[at + 1].t) - 10 : width;
			if (px + EVENT_OFFSET >= edge && px + EVENT_OFFSET + w <= next) {
				placed.set(event.t, false);
				edge = px + EVENT_OFFSET + w + 8;
				return;
			}
			const leftRoom = px - EVENT_OFFSET - w;
			if (leftRoom >= Math.max(0, edge) && (at === 0 || leftRoom >= x(inWindow[at - 1].t) + 12)) {
				placed.set(event.t, true);
				edge = px + 12;
				return;
			}
			edge = Math.max(edge, px + 12);
		});
		return placed;
	});
	const isEventActive = (t: number) => shownEvent?.t === t || eventAt?.t === t;
	const announce = $derived(
		reading
			? `${formatDate(new Date(reading.t))}, ${format(reading.value)}${eventAt ? `. ${eventAt.label}` : ''}`
			: ''
	);
	const summary = $derived(
		empty
			? `${label}. ${emptyLabel}.`
			: `${label}, ${shortDate.format(first)} to ${shortDate.format(lastT)}. Showing ${windowText}.`
	);
	const tableRows = $derived(
		points.slice(lowerBound(points, start), lowerBound(points, end + 1)).map((point) => ({
			point,
			event: events.find((item) => sameDay(item.t, point.t))
		}))
	);
	const axisShift = (px: number) =>
		px < EDGE_LABEL_ROOM ? 0 : px > width - EDGE_LABEL_ROOM ? -100 : -50;
</script>

<figure
	bind:this={ref}
	{@attach onceInView(0.3, () => (seen = true))}
	class={['figure', className]}
	aria-label={label}
	{...rest}
>
	<div class="chart" data-active={tipOn || undefined}>
		<!-- The chart is one focusable composite: arrow keys move the reading inside it. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={plot}
			bind:clientWidth={width}
			class="plot"
			style:height="{height}px"
			role="group"
			tabindex={empty ? -1 : 0}
			aria-roledescription="chart"
			aria-label="{label}, {windowText}. Use left and right arrows to read values."
			onpointermove={onPlotMove}
			onpointerdown={onPlotDown}
			onpointerup={(event) => {
				if (event.pointerType !== 'mouse') active = null;
			}}
			onpointercancel={() => (active = null)}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') active = null;
			}}
			onkeydown={onPlotKey}
			onblur={() => (active = null)}
			ondblclick={reset}
			onfocus={onPlotFocus}
		>
			<svg class="svg" width="100%" {height} aria-hidden="true" focusable="false">
				<defs>
					<clipPath id="{uid}-plot">
						<rect
							x={0}
							y={-8}
							width={Math.max(0, width * (reduced ? 1 : revealed))}
							height={height + 16}
						/>
					</clipPath>
				</defs>
				{#each ticks.slice(1) as value (value)}
					<line
						class="grid"
						x1={0}
						x2="100%"
						y1={Math.round(y(value)) + 0.5}
						y2={Math.round(y(value)) + 0.5}
					/>
				{/each}
				<line class="baseline" x1={0} x2="100%" y1={height - 0.5} y2={height - 0.5} />
				{#each inWindow as event (event.t)}
					<line
						class="event-rule"
						x1={Math.round(x(event.t)) + 0.5}
						x2={Math.round(x(event.t)) + 0.5}
						y1={TOP - 10}
						y2={height}
						data-active={isEventActive(event.t) || undefined}
					/>
				{/each}
				<g clip-path="url(#{uid}-plot)">
					<path class="band" d={band} style:opacity={1 - detail} />
					<path class="area" d={area} style:opacity={detail} />
					<path class="trend" d={trend} style:opacity={1 - detail} />
					<path class="line" d={line} style:opacity={detail} />
				</g>
				<line
					class="crosshair"
					x1={Math.round(cx) + 0.5}
					x2={Math.round(cx) + 0.5}
					y1={TOP - 10}
					y2={height}
				/>
				<circle class="dot" {cx} {cy} r={4} />
			</svg>
			{#each inWindow as event (event.t)}
				<!-- Event markers answer hover only; the plot's arrow keys and live region carry the same readings. -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="event"
					style:left="{x(event.t)}px"
					data-labelled={labelled.has(event.t) || undefined}
					data-flip={labelled.get(event.t) || undefined}
					data-active={isEventActive(event.t) || undefined}
					aria-hidden="true"
					onpointerenter={() => (hoverEvent = events.indexOf(event))}
					onpointerleave={() => (hoverEvent = null)}
					onpointerdown={(pointerEvent) => pointerEvent.stopPropagation()}
				>
					<span class="event-dot"></span>
					<span class="event-label">{event.label}</span>
				</span>
			{/each}
			<div bind:this={tip} {@attach glide.attach} class="tooltip" aria-hidden="true">
				{#if shownEvent}
					<p class="tip-title">{formatDate(new Date(shownEvent.t))}</p>
					<p class="tip-value">{shownEvent.label}</p>
					{#if shownEvent.description}<p class="tip-note">{shownEvent.description}</p>{/if}
				{:else if reading && index !== null}
					<p class="tip-title">{formatDate(new Date(reading.t))}</p>
					<p class="tip-value">{format(reading.value)}</p>
					{#if detail < 1}
						<p class="tip-note">{formatValue(Math.round(smooth[index].value))} seven day average</p>
					{/if}
					{#if change !== null}
						<p class="tip-note">
							{change >= 0 ? '+' : '−'}{Math.abs(change * 100).toFixed(1)}% vs a week earlier
						</p>
					{/if}
					{#if eventAt}
						<p class="tip-event"><span class="tip-event-dot"></span>{eventAt.label}</p>
					{/if}
				{/if}
			</div>
			{#if empty}<p class="message">{emptyLabel}</p>{/if}
		</div>
		<div class="gutter" aria-hidden="true">
			{#each ticks as value (value)}
				<span class="tick" style:top="{y(value)}px">{formatTick(value)}</span>
			{/each}
		</div>
		<div class="axis" aria-hidden="true">
			{#each xTicks as tick (tick.t)}
				{@const px = x(tick.t)}
				<span class="axis-label" style:left="{px}px" style:translate="{axisShift(px)}% 0"
					>{tick.label}</span
				>
			{/each}
		</div>
		<!-- The strip is a pointer surface; keyboard users drive the same window through the sliders inside it. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={strip}
			bind:clientWidth={stripWidth}
			class="strip"
			style:height="{overviewHeight}px"
			onpointerdown={onStripDown}
			onpointermove={onStripMove}
			onpointerup={onStripUp}
			onpointercancel={() => (drag = null)}
			ondblclick={reset}
		>
			<svg class="svg" width="100%" height={overviewHeight} aria-hidden="true" focusable="false">
				<defs>
					<clipPath id="{uid}-window">
						<rect x={wx0} y={-2} width={Math.max(0, wx1 - wx0)} height={overviewHeight + 4} />
					</clipPath>
				</defs>
				<path class="overview-area" d={overview.area} />
				<path class="overview-line" d={overview.line} />
				<g clip-path="url(#{uid}-window)">
					<path class="overview-area-in" d={overview.area} />
					<path class="overview-line-in" d={overview.line} />
				</g>
				{#each overview.marks as mark (mark.t)}
					<circle class="overview-event" cx={mark.x} cy={mark.y} r={2.5} />
				{/each}
			</svg>
			{#if !empty}
				<div class="shade" style:left="0" style:width="{Math.max(0, wx0)}px"></div>
				<div class="shade" style:left="{wx1}px" style:right="0"></div>
				<div
					class="window"
					style:left="{wx0}px"
					style:width="{Math.max(0, wx1 - wx0)}px"
					role="slider"
					tabindex="0"
					aria-label="{label} window"
					aria-roledescription="range window"
					aria-valuemin={first}
					aria-valuemax={lastT}
					aria-valuenow={Math.round(start)}
					aria-valuetext={windowText}
					onkeydown={(event) => onHandleKey(event, 'window')}
				></div>
				<div
					class="handle"
					style:left="{wx0}px"
					role="slider"
					tabindex="0"
					aria-label="Window start"
					aria-valuemin={first}
					aria-valuemax={Math.round(end)}
					aria-valuenow={Math.round(start)}
					aria-valuetext={shortDate.format(start)}
					onkeydown={(event) => onHandleKey(event, 'start')}
				>
					<span class="grip"></span>
				</div>
				<div
					class="handle"
					style:left="{wx1}px"
					role="slider"
					tabindex="0"
					aria-label="Window end"
					aria-valuemin={Math.round(start)}
					aria-valuemax={lastT}
					aria-valuenow={Math.round(end)}
					aria-valuetext={shortDate.format(end)}
					onkeydown={(event) => onHandleKey(event, 'end')}
				>
					<span class="grip"></span>
				</div>
			{/if}
		</div>
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
	<p class="sr-only">{summary}</p>
	{#if !empty}
		<div class="sr-only">
			<table>
				<caption>{label}, {windowText}</caption>
				<thead>
					<tr>
						<th scope="col">Date</th>
						<th scope="col">{label}</th>
						<th scope="col">Event</th>
					</tr>
				</thead>
				<tbody>
					{#each tableRows as { point, event } (point.t)}
						<tr>
							<th scope="row">{shortDate.format(point.t)}</th>
							<td>{format(point.value)}</td>
							<td
								>{event
									? `${event.label}${event.description ? `. ${event.description}` : ''}`
									: ''}</td
							>
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
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	/* Plot with a right-hand value axis, the date axis beneath, and the overview strip under both. */
	.chart {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px;
		grid-template-rows: auto 28px auto;
		row-gap: 0;
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
		cursor: crosshair;
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
	.line {
		fill: none;
		stroke: var(--arc-series-1);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.area {
		fill: color-mix(in oklch, var(--arc-series-1) 10%, transparent);
		stroke: none;
	}
	.trend {
		fill: none;
		stroke: var(--arc-series-1);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.band {
		fill: color-mix(in oklch, var(--arc-series-1) 14%, transparent);
		stroke: none;
	}
	.crosshair {
		stroke: var(--arc-foreground);
		stroke-opacity: 0.45;
		stroke-width: 1;
		shape-rendering: crispEdges;
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
		pointer-events: none;
	}
	.dot {
		fill: var(--arc-series-1);
		stroke: var(--arc-surface);
		stroke-width: 2;
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
		pointer-events: none;
	}
	.chart[data-active] .crosshair,
	.chart[data-active] .dot {
		opacity: 1;
	}
	/* Events: a hairline through the plot, a dot in the second chart series on top, and a label when there is room for it. */
	.event-rule {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
		shape-rendering: crispEdges;
		transition: stroke var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.event-rule[data-active] {
		stroke: var(--arc-series-2);
	}
	.event {
		position: absolute;
		top: 6px;
		display: flex;
		box-sizing: border-box;
		min-height: 24px;
		align-items: center;
		gap: 6px;
		padding: 0 6px 0 0;
		margin-left: -12px;
		border: 0;
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: default;
		font: inherit;
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
	}
	.event[data-flip] {
		flex-direction: row-reverse;
		padding: 0 0 0 6px;
		margin-left: 0;
		translate: calc(-100% + 12px) 0;
	}
	.event-dot {
		display: grid;
		width: 24px;
		height: 24px;
		flex: none;
		place-items: center;
	}
	.event-dot::before {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--arc-series-2);
		box-shadow: 0 0 0 2px var(--arc-surface);
		content: '';
		transition: transform var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.event[data-active] .event-dot::before {
		transform: scale(1.3);
	}
	.event-label {
		opacity: 0;
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.event[data-labelled] .event-label {
		opacity: 1;
	}
	.event[data-active] .event-label {
		color: var(--arc-foreground);
	}
	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 2;
		display: grid;
		min-width: 132px;
		max-width: min(220px, 100%);
		gap: 2px;
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
	.tip-value {
		margin: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.tip-note {
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	.tip-event {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 4px 0 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.tip-event-dot {
		width: 7px;
		height: 7px;
		flex: none;
		border-radius: 50%;
		background: var(--arc-series-2);
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
	.gutter {
		position: relative;
		grid-area: 1 / 2;
		min-width: 0;
	}
	.tick {
		position: absolute;
		left: 10px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		translate: 0 -50%;
		pointer-events: none;
	}
	.axis {
		position: relative;
		grid-area: 2 / 1;
		min-width: 0;
	}
	.axis-label {
		position: absolute;
		top: 9px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	/* Overview: the whole history, with everything outside the window stepped back. */
	.strip {
		position: relative;
		grid-area: 3 / 1;
		min-width: 0;
		margin-top: 8px;
		border-radius: 10px;
		background: color-mix(in oklch, var(--arc-foreground) 2.5%, transparent);
		cursor: crosshair;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.overview-line {
		fill: none;
		stroke: color-mix(in oklch, var(--arc-foreground) 28%, var(--arc-surface));
		stroke-width: 1;
		stroke-linejoin: round;
	}
	.overview-area {
		fill: color-mix(in oklch, var(--arc-foreground) 4%, transparent);
	}
	.overview-line-in {
		fill: none;
		stroke: var(--arc-series-1);
		stroke-width: 1;
		stroke-linejoin: round;
	}
	.overview-area-in {
		fill: color-mix(in oklch, var(--arc-series-1) 12%, transparent);
	}
	.overview-event {
		fill: var(--arc-series-2);
		stroke: var(--arc-surface);
		stroke-width: 1.5;
	}
	.shade {
		position: absolute;
		top: 0;
		bottom: 0;
		background: color-mix(in oklch, var(--arc-surface) 45%, transparent);
		pointer-events: none;
	}
	.window {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 8px;
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--arc-series-1) 45%, transparent);
		cursor: grab;
		outline: none;
		transition: box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.window:active {
		cursor: grabbing;
	}
	.handle {
		position: absolute;
		top: 50%;
		display: grid;
		width: 28px;
		height: 44px;
		place-items: center;
		margin-left: -14px;
		translate: 0 -50%;
		cursor: ew-resize;
		outline: none;
		touch-action: none;
	}
	.grip {
		width: 6px;
		height: 22px;
		border-radius: 3px;
		background: var(--arc-surface-raised);
		box-shadow:
			0 0 0 1px color-mix(in oklch, var(--arc-foreground) 26%, transparent),
			0 1px 3px oklch(0% 0 0 / 0.12);
		transition:
			transform var(--arc-duration-instant) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.handle:active .grip {
		transform: scaleY(1.12);
	}
	@media (hover: hover) and (pointer: fine) {
		.handle:hover .grip {
			transform: scaleY(1.12);
		}
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
		.crosshair,
		.dot,
		.tooltip,
		.event-rule,
		.event-label,
		.event-dot::before,
		.grip,
		.window {
			transition: none;
		}
	}
</style>
