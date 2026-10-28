<script module lang="ts">
	export interface RidgelineSeries {
		/** Stable identity. A ridge that survives a data change morphs into its new shape. */
		id: string;
		label: string;
		/** Raw observations. The ridge is a smoothed density of these values. */
		values: number[];
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		clamp,
		createTooltipGlide,
		mix,
		onceInView,
		physicalSpring
	} from '../brush-chart/chart-motion.svelte';
	import { isReducedMotion } from '../motion';
	import { buildRidges, heightAt, niceStep, SAMPLES, type Shape } from './density';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** One ridge per series, drawn top to bottom. */
		series: RidgelineSeries[];
		/** What is measured, such as "Daily highs in Zurich". Names the chart for assistive technology. */
		label: string;
		/** Unit after each value, such as "°C". */
		unit?: string;
		formatValue?: (value: number) => string;
		/** Value range of the axis. Defaults to the data with a little room on each side. */
		domain?: [number, number];
		/** How far a ridge may rise into the rows above, in row heights. */
		overlap?: number;
		/** Height of one row in pixels. */
		rowHeight?: number;
		/** Smoothing in value units. Defaults to Silverman's rule per series. */
		bandwidth?: number;
		/** Shades each ridge by its median, from a light tint to the full first series color, and shows the scale under the axis. */
		tint?: boolean;
		/** Id of the lifted ridge. */
		active?: string | null;
		defaultActive?: string | null;
		onActiveChange?: (id: string | null) => void;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	};

	let {
		series,
		label,
		unit = '',
		formatValue,
		domain,
		overlap = 2.4,
		rowHeight = 30,
		bandwidth,
		tint = true,
		defaultActive = null,
		active = $bindable(defaultActive),
		onActiveChange,
		emptyLabel = 'No data yet',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	type Cursor = { value: number; pointerY: number | null };

	const morph = physicalSpring({ visualDuration: 0.7, bounce: 0.08 });
	const reveal = physicalSpring({ visualDuration: 1, bounce: 0 });
	const AXIS = 28;
	const TIP = 14;
	const LIFT = 6;
	const NARROW_WIDTH = 420;
	const TICK_SPACING = 72;
	/** Each row starts its reveal this much of the spring later than the row above, so the ridges roll in like a wave. */
	const ROW_WAVE = 0.025;
	const TONE_STEPS = [0, 0.25, 0.5, 0.75, 1];
	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
	const glide = createTooltipGlide();

	let tip: HTMLDivElement;
	let cross: HTMLDivElement;
	let lensFill: SVGPathElement;
	let lensBand: SVGPathElement;
	let lensLine: SVGPathElement;
	let lensMedian: SVGLineElement;
	const fills = new Map<string, SVGPathElement>();
	const lines = new Map<string, SVGPathElement>();
	const medians = new Map<string, SVGLineElement>();
	const tickNodes = new Map<number, HTMLDivElement>();

	let width = $state(0);
	let seen = $state(false);
	let cursor: Cursor | null = $state(null);

	const reduced = $derived(isReducedMotion());
	const format = (value: number) =>
		formatValue ? formatValue(value) : `${grouped.format(value)}${unit}`;

	// Targets: one density per series on a shared domain, scaled so the tallest peak of all rises `overlap` rows.
	const signature = $derived(JSON.stringify([series, domain, bandwidth]));
	const model = $derived.by(() => {
		void signature;
		return untrack(() => buildRidges(series, domain, bandwidth));
	});

	const narrow = $derived(width > 0 && width < NARROW_WIDTH);
	const gutter = $derived(narrow ? 36 : 52);
	const top = $derived(Math.ceil((overlap - 1) * rowHeight) + LIFT + 8);
	const height = $derived(top + series.length * rowHeight + AXIS);
	const plotWidth = $derived(Math.max(40, width - gutter - 4));
	const baselineOf = (row: number) => top + (row + 1) * rowHeight;

	function setCurrent(id: string | null) {
		const changed = id !== active;
		active = id;
		if (changed) onActiveChange?.(id);
	}
	function clearReading() {
		setCurrent(null);
		cursor = null;
	}

	// Drawn geometry lives outside Svelte's state; a spring interpolates it from what is on screen to the new targets.
	const drawn = { shapes: new Map<string, Shape>(), lo: 0, hi: 1 };
	const xOf = (value: number) =>
		gutter + ((value - drawn.lo) / (drawn.hi - drawn.lo || 1)) * plotWidth;

	function curvePath(shape: Shape, closed: boolean, from = -Infinity, to = Infinity) {
		const lift = rowHeight * overlap;
		const base = top + (shape.row + 1) * rowHeight;
		const points: string[] = [];
		const push = (x: number, y: number) =>
			points.push(`${xOf(x).toFixed(2)},${(base - y * lift).toFixed(2)}`);
		if (from > -Infinity) push(from, heightAt(shape, from));
		shape.xs.forEach((x, i) => {
			if (x > from && x < to) push(x, shape.ys[i]);
		});
		if (to < Infinity) push(to, heightAt(shape, to));
		if (!points.length) return '';
		const first = from > -Infinity ? from : shape.xs[0];
		const last = to < Infinity ? to : shape.xs[shape.xs.length - 1];
		if (!closed) return `M${points.join('L')}`;
		return `M${xOf(first).toFixed(2)},${base}L${points.join('L')}L${xOf(last).toFixed(2)},${base}Z`;
	}
	function placeMedian(line: SVGLineElement, shape: Shape) {
		const x = xOf(shape.median).toFixed(2);
		const base = top + (shape.row + 1) * rowHeight;
		line.setAttribute('x1', x);
		line.setAttribute('x2', x);
		line.setAttribute('y1', String(base));
		line.setAttribute(
			'y2',
			(base - heightAt(shape, shape.median) * rowHeight * overlap).toFixed(2)
		);
	}

	function paint() {
		for (const [id, shape] of drawn.shapes) {
			fills.get(id)?.setAttribute('d', curvePath(shape, true));
			lines.get(id)?.setAttribute('d', curvePath(shape, false));
			const median = medians.get(id);
			if (median) placeMedian(median, shape);
		}
		const shape = active ? drawn.shapes.get(active) : undefined;
		if (shape && lensFill) {
			lensFill.setAttribute('d', curvePath(shape, true));
			lensLine.setAttribute('d', curvePath(shape, false));
			lensBand.setAttribute('d', curvePath(shape, true, shape.q1, shape.q3));
			placeMedian(lensMedian, shape);
		}
		for (const [value, tick] of tickNodes)
			tick.style.transform = `translate3d(${xOf(value).toFixed(2)}px, 0, 0)`;
	}

	function copyShape(shape: Shape): Shape {
		return { ...shape, xs: [...shape.xs], ys: [...shape.ys] };
	}

	function morphTo(target: typeof model, instant: boolean) {
		const first = drawn.shapes.size === 0;
		const from = new Map<string, Shape>();
		for (const [id, goal] of target.shapes) {
			const now = drawn.shapes.get(id);
			from.set(
				id,
				now
					? copyShape(now)
					: { ...goal, ys: goal.ys.map(() => 0), q1: goal.median, q3: goal.median }
			);
		}
		const fromLo = first ? target.lo : drawn.lo;
		const fromHi = first ? target.hi : drawn.hi;
		const finish = () => {
			drawn.shapes = new Map([...target.shapes].map(([id, shape]) => [id, { ...shape }]));
			drawn.lo = target.lo;
			drawn.hi = target.hi;
			paint();
		};
		if (instant) {
			finish();
			return;
		}
		drawn.shapes = new Map([...from].map(([id, shape]) => [id, copyShape(shape)]));
		const waveSpan = 1 - Math.min(0.5, target.shapes.size * ROW_WAVE);
		const controls = animate(0, 1, {
			...(first ? reveal : morph),
			onUpdate: (t) => {
				drawn.lo = mix(fromLo, target.lo, t);
				drawn.hi = mix(fromHi, target.hi, t);
				for (const [id, to] of target.shapes) {
					const f = from.get(id)!;
					const out = drawn.shapes.get(id)!;
					const local = first ? clamp((t - to.row * ROW_WAVE) / waveSpan, 0, 1) : t;
					for (let i = 0; i < SAMPLES; i++) {
						out.xs[i] = mix(f.xs[i], to.xs[i], local);
						out.ys[i] = mix(f.ys[i], to.ys[i], local);
					}
					out.row = mix(f.row, to.row, local);
					out.q1 = mix(f.q1, to.q1, local);
					out.median = mix(f.median, to.median, local);
					out.q3 = mix(f.q3, to.q3, local);
				}
				paint();
			},
			onComplete: finish
		});
		return () => controls.stop();
	}

	const shown = $derived(seen || reduced);
	$effect(() => {
		if (!shown) return;
		const target = model;
		const instant = reduced;
		return untrack(() => morphTo(target, instant));
	});

	// Axis ticks for the target domain; their positions follow the drawn domain every frame.
	const step = $derived(
		niceStep(model.hi - model.lo, Math.max(2, Math.floor(plotWidth / TICK_SPACING)))
	);
	const ticks = $derived.by(() => {
		const out: number[] = [];
		for (let value = Math.ceil(model.lo / step) * step; value <= model.hi + 1e-9; value += step)
			out.push(Math.round(value * 1e6) / 1e6 || 0);
		return out;
	});

	// Layout, the lifted ridge, and new ticks all need a repaint outside the morph.
	$effect(() => {
		void [gutter, plotWidth, rowHeight, overlap, top, active, ticks];
		untrack(paint);
	});

	const activeStats = $derived(active ? model.stats.get(active) : undefined);
	const activeSeries = $derived(active ? series.find((entry) => entry.id === active) : undefined);
	const reading = $derived.by(() => {
		if (!cursor || !activeStats) return null;
		const { value } = cursor;
		const below = activeStats.n
			? activeStats.sorted.filter((entry) => entry <= value).length / activeStats.n
			: 0;
		return { value, below };
	});

	// The tooltip trails the pointer or the keyboard cursor and stays inside the chart.
	let wasOn = false;
	$effect(() => {
		const shape = active ? model.shapes.get(active) : undefined;
		cross.style.transform = `translate3d(${reading ? xOf(reading.value).toFixed(2) : 0}px, 0, 0)`;
		if (!shape || !width) {
			wasOn = false;
			return;
		}
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;
		const ax = reading ? xOf(reading.value) : xOf(shape.median);
		const ay =
			cursor?.pointerY ??
			baselineOf(shape.row) - heightAt(shape, shape.median) * rowHeight * overlap - LIFT;
		let left = ax + TIP;
		if (left + tw > width) left = ax - TIP - tw;
		let y = ay - th - TIP;
		if (y < 0) y = ay + TIP;
		glide.place(
			clamp(left, 0, Math.max(0, width - tw)),
			clamp(y, 0, Math.max(0, height - th)),
			!wasOn || reduced
		);
		wasOn = true;
	});

	const valueAt = (x: number) =>
		drawn.lo + clamp((x - gutter) / plotWidth, 0, 1) * (drawn.hi - drawn.lo);
	function pick(x: number, y: number) {
		const value = valueAt(x);
		const lift = rowHeight * overlap;
		let best: Shape | null = null;
		let bestId: string | null = null;
		for (const [id, shape] of drawn.shapes) {
			const base = baselineOf(shape.row);
			const h = heightAt(shape, value) * lift;
			if (y <= base + 2 && y >= base - h - 4 && (!best || shape.row > best.row)) {
				best = shape;
				bestId = id;
			}
		}
		if (!bestId) {
			const row = clamp(Math.floor((y - top) / rowHeight), 0, series.length - 1);
			bestId = series[row]?.id ?? null;
		}
		return { id: bestId, value };
	}
	function onPointerMove(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		if (x < gutter - 8 || y > height - AXIS + 4) {
			if (event.pointerType === 'mouse') clearReading();
			return;
		}
		const hit = pick(x, y);
		setCurrent(hit.id);
		cursor = { value: hit.value, pointerY: y };
	}
	function onKeyDown(event: KeyboardEvent) {
		const at = active ? series.findIndex((entry) => entry.id === active) : -1;
		const medianOf = (id: string | null | undefined) =>
			id ? model.stats.get(id)?.median : undefined;
		const choose = (index: number) => {
			event.preventDefault();
			const next = series[clamp(index, 0, series.length - 1)];
			if (!next) return;
			setCurrent(next.id);
			cursor = { value: cursor?.value ?? medianOf(next.id) ?? model.lo, pointerY: null };
		};
		const nudge = (direction: number) => {
			event.preventDefault();
			if (!active) {
				choose(0);
				return;
			}
			const base = cursor?.value ?? medianOf(active) ?? model.lo;
			const next = clamp((Math.round(base / step) + direction) * step, model.lo, model.hi);
			cursor = { value: next, pointerY: null };
		};
		if (event.key === 'ArrowDown') choose(at + 1);
		else if (event.key === 'ArrowUp') choose(at < 0 ? 0 : at - 1);
		else if (event.key === 'Home') choose(0);
		else if (event.key === 'End') choose(series.length - 1);
		else if (event.key === 'ArrowRight') nudge(1);
		else if (event.key === 'ArrowLeft') nudge(-1);
		else if (event.key === 'Escape' && active) {
			event.preventDefault();
			clearReading();
		}
	}

	function register<T extends Element>(map: Map<string, T>, id: string): Attachment<T> {
		return (element) => {
			map.set(id, element);
			return () => map.delete(id);
		};
	}
	function registerTick(value: number): Attachment<HTMLDivElement> {
		return (element) => {
			tickNodes.set(value, element);
			element.style.transform = `translate3d(${xOf(value).toFixed(2)}px, 0, 0)`;
			return () => tickNodes.delete(value);
		};
	}

	const empty = $derived(!series.length || series.every((entry) => !entry.values.length));
	/** Ridge tone: one hue, the first series color, from a light tint (low median) to full strength (high median), so the scale never passes through a muddy middle. */
	const toneOf = (t: number) =>
		`color-mix(in oklch, var(--arc-series-1) ${Math.round(38 + clamp(t, 0, 1) * 62)}%, var(--arc-surface))`;
	const ridgeColor = (value: number) =>
		tint ? toneOf((value - model.lo) / (model.hi - model.lo || 1)) : 'var(--arc-series-1)';
	function describe(entry: RidgelineSeries) {
		const s = model.stats.get(entry.id)!;
		return `${entry.label}: median ${format(s.median)}, middle half ${format(s.q1)} to ${format(s.q3)}, range ${format(s.min)} to ${format(s.max)}, ${s.n} values`;
	}
	const announce = $derived(
		activeSeries
			? `${describe(activeSeries)}${reading ? `. ${percent.format(reading.below)} at or below ${format(reading.value)}` : ''}`
			: ''
	);
</script>

<figure
	bind:this={ref}
	{@attach onceInView(0.3, () => (seen = true))}
	class={['figure', className]}
	aria-label={label}
	{...rest}
>
	<!-- The chart is one focusable composite: arrow keys move the reading inside it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:clientWidth={width}
		class="plot"
		style:height="{height}px"
		data-active={active ? true : undefined}
		data-cursor={reading ? true : undefined}
		role="group"
		tabindex={empty ? -1 : 0}
		aria-roledescription="ridgeline chart"
		aria-label="{label}. Up and down arrows choose a ridge, left and right arrows move along the values."
		onpointermove={onPointerMove}
		onpointerdown={onPointerMove}
		onpointerleave={(event) => event.pointerType === 'mouse' && clearReading()}
		onkeydown={onKeyDown}
		onblur={clearReading}
	>
		<div class="ticks" aria-hidden="true" style:height="{height - AXIS + 22}px">
			{#each ticks as value (value)}
				<div {@attach registerTick(value)} class="tick" style:top="{top - rowHeight * 0.5}px">
					<span class="tick-label">{format(value)}</span>
				</div>
			{/each}
		</div>
		<div
			bind:this={cross}
			class="crosshair"
			style:top="{top - rowHeight * 0.5}px"
			style:height="{height - AXIS - top + rowHeight * 0.5}px"
			aria-hidden="true"
		></div>
		<svg
			class="svg"
			width={width || undefined}
			{height}
			viewBox="0 0 {Math.max(1, width)} {height}"
			aria-hidden="true"
			focusable="false"
		>
			{#each series as entry (entry.id)}
				<g
					class="ridge"
					data-dim={(active !== null && active !== entry.id) || undefined}
					data-lifted={active === entry.id || undefined}
					style:--ridgeline-tone={ridgeColor(model.stats.get(entry.id)?.median ?? model.lo)}
				>
					<path {@attach register(fills, entry.id)} class="fill" />
					<line {@attach register(medians, entry.id)} class="median" />
					<path {@attach register(lines, entry.id)} class="line" />
				</g>
			{/each}
			<g
				class="lens"
				data-on={active ? true : undefined}
				style:--ridgeline-tone={activeStats ? ridgeColor(activeStats.median) : undefined}
			>
				<path bind:this={lensFill} class="lens-fill" />
				<path bind:this={lensBand} class="lens-band" />
				<line bind:this={lensMedian} class="lens-median" />
				<path bind:this={lensLine} class="lens-line" />
			</g>
		</svg>
		<div class="labels" aria-hidden="true">
			{#each series as entry, index (entry.id)}
				<span
					class="row-label"
					data-active={active === entry.id || undefined}
					style:top="{baselineOf(index) - 18}px"
					style:width="{gutter - 10}px">{entry.label}</span
				>
			{/each}
		</div>
		{#if empty}<p class="message">{emptyLabel}</p>{/if}
		<div bind:this={tip} {@attach glide.attach} class="tooltip" aria-hidden="true">
			{#if activeSeries && activeStats}
				<p class="tip-title">{activeSeries.label}</p>
				<p class="tip-value">
					<span class="tip-key">Median</span><span>{format(activeStats.median)}</span>
				</p>
				<p class="tip-row">
					<span class="tip-key">Middle half</span><span
						>{format(activeStats.q1)} to {format(activeStats.q3)}</span
					>
				</p>
				<p class="tip-row">
					<span class="tip-key">Range</span><span
						>{format(activeStats.min)} to {format(activeStats.max)}</span
					>
				</p>
				{#if reading}
					<p class="tip-note">
						{percent.format(reading.below)} at or below {format(reading.value)}
					</p>
				{/if}
			{/if}
		</div>
	</div>
	{#if tint && !empty}
		<div class="scale" aria-hidden="true">
			<span class="scale-label">Median</span>
			<span>{format(model.lo)}</span>
			<span class="steps">
				{#each TONE_STEPS as toneStep (toneStep)}
					<span class="step" style:--ridgeline-tone={toneOf(toneStep)}></span>
				{/each}
			</span>
			<span>{format(model.hi)}</span>
		</div>
	{/if}
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
	{#if !empty}
		<div class="sr-only">
			<table>
				<caption>{label}</caption>
				<thead>
					<tr>
						<th scope="col">Series</th>
						<th scope="col">Median</th>
						<th scope="col">First quartile</th>
						<th scope="col">Third quartile</th>
						<th scope="col">Lowest</th>
						<th scope="col">Highest</th>
						<th scope="col">Count</th>
					</tr>
				</thead>
				<tbody>
					{#each series as entry (entry.id)}
						{@const s = model.stats.get(entry.id)!}
						<tr>
							<th scope="row">{entry.label}</th>
							<td>{format(s.median)}</td>
							<td>{format(s.q1)}</td>
							<td>{format(s.q3)}</td>
							<td>{format(s.min)}</td>
							<td>{format(s.max)}</td>
							<td>{s.n}</td>
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
		position: absolute;
		inset: 0;
		display: block;
		overflow: visible;
	}
	/* Ridges are opaque, so each one hides the valleys of the row behind it. */
	.ridge {
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.fill {
		fill: color-mix(in oklch, var(--ridgeline-tone) 34%, var(--arc-surface));
		stroke: none;
		transition: fill var(--arc-duration-considered) var(--arc-ease-standard);
	}
	.line {
		fill: none;
		stroke: var(--ridgeline-tone);
		stroke-width: 1.5;
		stroke-linejoin: round;
		stroke-linecap: round;
		transition: stroke var(--arc-duration-considered) var(--arc-ease-standard);
	}
	.median {
		stroke: color-mix(in oklch, var(--ridgeline-tone) 55%, var(--arc-surface));
		stroke-width: 1;
		transition: stroke var(--arc-duration-considered) var(--arc-ease-standard);
	}
	.plot[data-active] .ridge[data-dim] {
		opacity: 0.38;
	}
	.ridge[data-lifted] {
		opacity: 0;
		transition-duration: var(--arc-duration-instant);
	}
	/* The lifted ridge is a copy drawn above the rest, so it can rise over its neighbours. */
	.lens {
		opacity: 0;
		pointer-events: none;
		transform: translateY(0);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.lens[data-on] {
		opacity: 1;
		transform: translateY(-6px);
	}
	.lens-fill {
		fill: color-mix(in oklch, var(--ridgeline-tone) 18%, var(--arc-surface));
		stroke: none;
	}
	.lens-band {
		fill: color-mix(in oklch, var(--ridgeline-tone) 48%, var(--arc-surface));
		stroke: none;
	}
	.lens-median {
		stroke: var(--arc-foreground);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.lens-line {
		fill: none;
		stroke: var(--ridgeline-tone);
		stroke-width: 2.25;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.ticks {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		pointer-events: none;
	}
	.tick {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 1px;
		background: var(--arc-border-subtle);
		will-change: transform;
		animation: tick-in var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.tick-label {
		position: absolute;
		bottom: 0;
		left: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		translate: -50% 0;
	}
	@keyframes tick-in {
		from {
			opacity: 0;
		}
	}
	.crosshair {
		position: absolute;
		left: 0;
		width: 1px;
		background: var(--arc-foreground);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.plot[data-cursor] .crosshair {
		opacity: 0.35;
	}
	.labels {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.row-label {
		position: absolute;
		left: 0;
		overflow: hidden;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		line-height: 18px;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.row-label[data-active] {
		color: var(--arc-foreground);
		font-weight: 500;
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
	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 2;
		display: grid;
		min-width: 170px;
		max-width: min(240px, 100%);
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
	.plot[data-active] .tooltip {
		opacity: 1;
		scale: 1;
	}
	.tip-title {
		margin: 0 0 2px;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.tip-value,
	.tip-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 0;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.tip-value {
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: 1.4;
	}
	.tip-row {
		color: var(--arc-foreground);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.tip-key {
		color: var(--arc-text-muted);
		font-weight: 400;
	}
	.tip-note {
		margin: 4px 0 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	.scale {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: var(--arc-space-3);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	.scale-label {
		margin-right: 4px;
		color: var(--arc-text-secondary);
	}
	.steps {
		display: inline-flex;
		gap: 2px;
	}
	.step {
		width: 18px;
		height: 10px;
		border-radius: 3px;
		background: var(--ridgeline-tone);
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
		.ridge,
		.lens,
		.crosshair,
		.tooltip,
		.row-label {
			transition: none;
		}
		.tick {
			animation: none;
		}
	}
</style>
