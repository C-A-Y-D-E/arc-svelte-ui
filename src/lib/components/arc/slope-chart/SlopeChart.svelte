<script module lang="ts">
	export interface SlopeItem {
		/** Stable identity. An item keeps its line across datasets, so switching morphs it. */
		key: string;
		/** Name beside the start value, in the tooltip, and in the table. */
		label: string;
		start: number;
		end: number;
	}
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		clamp,
		createTooltipGlide,
		motionTo,
		onceInView
	} from '../brush-chart/chart-motion.svelte';
	import { isReducedMotion, motionTokens } from '../motion';
	import SlopeRank from './SlopeRank.svelte';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		data: SlopeItem[];
		/** What is measured, such as "Conversion rate by channel". Names the chart for assistive technology. */
		label: string;
		startLabel: string;
		endLabel: string;
		formatValue?: (value: number) => string;
		/** Formats the change in the tooltip. Defaults to the difference in formatValue's terms. */
		formatChange?: (change: number, item: SlopeItem) => string;
		/** Plot height in pixels. Defaults to 44 pixels per item. */
		height?: number;
		/** The item drawn in the accent, such as the one the story is about. */
		highlightKey?: string | null;
		/** Item in focus. The others fade while one is in focus. */
		activeKey?: string | null;
		onActiveChange?: (key: string | null) => void;
		/** Rank movement beside each end value. */
		ranks?: boolean;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	};

	let {
		data,
		label,
		startLabel,
		endLabel,
		formatValue,
		formatChange,
		height,
		highlightKey = null,
		activeKey = $bindable(null),
		onActiveChange,
		ranks = true,
		emptyLabel = 'No data',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	type Row = {
		item: SlopeItem;
		y0: number;
		y1: number;
		l0: number;
		l1: number;
		rank0: number;
		rank1: number;
		order: number;
	};

	const { spring } = motionTokens;
	const LABEL_GAP = 20;
	const PAD = 14;
	const HEAD = 28;
	const ROW_HEIGHT = 44;
	const MIN_PLOT_HEIGHT = 200;
	const NARROW_WIDTH = 440;
	const PHONE_WIDTH = 300;
	const HIT_DISTANCE = 22;
	const TIP_OFFSET = 16;
	const DRAW_SECONDS = 0.7;
	const ROW_STAGGER = 0.05;
	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const glide = createTooltipGlide({ stiffness: 480, damping: 42, restDelta: 0.01 });

	let stage: HTMLDivElement;
	let tip: HTMLDivElement;
	let width = $state(0);
	let seen = $state(false);

	/** Moves labels apart just enough to stop overlaps: touching labels form a group centred on where its members want to be. */
	function spread(wanted: number[], gap: number, low: number, high: number): number[] {
		const order = wanted.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
		let groups = order.map((entry) => ({ members: [entry], top: entry.y }));
		for (let changed = true; changed;) {
			changed = false;
			const next: typeof groups = [];
			for (const group of groups) {
				const prev = next[next.length - 1];
				if (prev && prev.top + prev.members.length * gap > group.top) {
					const members = [...prev.members, ...group.members];
					const top =
						members.reduce((sum, member, k) => sum + member.y - k * gap, 0) / members.length;
					next[next.length - 1] = { members, top };
					changed = true;
				} else next.push(group);
			}
			groups = next.map((group) => ({
				...group,
				top: clamp(group.top, low, Math.max(low, high - (group.members.length - 1) * gap))
			}));
		}
		const out = new Array<number>(wanted.length);
		groups.forEach((group) =>
			group.members.forEach((member, k) => {
				out[member.index] = group.top + k * gap;
			})
		);
		return out;
	}

	const reduced = $derived(isReducedMotion());
	const empty = $derived(data.length === 0);
	const plotHeight = $derived(height ?? Math.max(MIN_PLOT_HEIGHT, data.length * ROW_HEIGHT));
	const narrow = $derived(width < NARROW_WIDTH);
	const leftRoom = $derived(narrow ? (width < PHONE_WIDTH ? 116 : 132) : 168);
	const rightRoom = $derived(ranks ? (narrow ? 76 : 96) : narrow ? 52 : 64);
	const x0 = $derived(leftRoom);
	const x1 = $derived(Math.max(x0 + 40, width - rightRoom));

	// One shared value axis for both columns, padded so dots never touch the edges.
	const bounds = $derived.by(() => {
		const values = data.flatMap((item) => [item.start, item.end]);
		let lo = Math.min(...values);
		let hi = Math.max(...values);
		if (!Number.isFinite(lo)) {
			lo = 0;
			hi = 1;
		}
		if (hi - lo < 1e-9) {
			lo -= 1;
			hi += 1;
		}
		return { lo, hi };
	});

	const rows: Row[] = $derived.by(() => {
		const { lo, hi } = bounds;
		const yOf = (value: number) => PAD + (1 - (value - lo) / (hi - lo)) * (plotHeight - PAD * 2);
		const rankOf = (field: 'start' | 'end') => {
			const sorted = [...data].sort((a, b) => b[field] - a[field]);
			return (item: SlopeItem) => sorted.indexOf(item) + 1;
		};
		const r0 = rankOf('start');
		const r1 = rankOf('end');
		const l0 = spread(
			data.map((item) => yOf(item.start)),
			LABEL_GAP,
			8,
			plotHeight - 8
		);
		const l1 = spread(
			data.map((item) => yOf(item.end)),
			LABEL_GAP,
			8,
			plotHeight - 8
		);
		const built = data.map((item, i) => ({
			item,
			y0: yOf(item.start),
			y1: yOf(item.end),
			l0: l0[i],
			l1: l1[i],
			rank0: r0(item),
			rank1: r1(item),
			order: 0
		}));
		[...built].sort((a, b) => a.rank1 - b.rank1).forEach((row, k) => (row.order = k));
		return built;
	});
	const byEnd = $derived([...rows].sort((a, b) => a.rank1 - b.rank1));

	const active = $derived(
		activeKey && data.some((item) => item.key === activeKey) ? activeKey : null
	);
	const activeRow = $derived(rows.find((row) => row.item.key === active) ?? null);
	const drawn = $derived(seen || reduced);
	const settle = $derived(reduced ? { duration: 0 } : spring.morph);

	function setActive(key: string | null) {
		const changed = key !== active;
		activeKey = key;
		if (changed) onActiveChange?.(key);
	}

	// The tooltip glides to the middle of the line in focus and stays inside the chart.
	let wasShown = false;
	$effect(() => {
		if (!activeRow || !tip || !width) {
			wasShown = false;
			return;
		}
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;
		const mid = (activeRow.y0 + activeRow.y1) / 2;
		const cx = (x0 + x1) / 2;
		const above = mid - th - TIP_OFFSET >= 0;
		const left = clamp(cx - tw / 2, 0, Math.max(0, width - tw));
		const top = clamp(
			HEAD + (above ? mid - th - TIP_OFFSET : mid + TIP_OFFSET),
			0,
			Math.max(0, plotHeight + HEAD - th)
		);
		glide.place(left, top, !wasShown || reduced);
		wasShown = true;
	});

	// The line nearest the pointer, measured at the pointer's position along the plot.
	function nearest(clientX: number, clientY: number) {
		const rect = stage.getBoundingClientRect();
		if (empty) return null;
		const px = clientX - rect.left;
		const x = clamp(px, x0, x1);
		const y = clientY - rect.top - HEAD;
		const t = (x - x0) / Math.max(1, x1 - x0);
		let best: Row | null = null;
		let distance = Infinity;
		for (const row of rows) {
			const inLine = Math.abs(row.y0 + (row.y1 - row.y0) * t - y);
			const onLabel = px < x0 ? Math.abs(row.l0 - y) : px > x1 ? Math.abs(row.l1 - y) : Infinity;
			const d = Math.min(inLine, onLabel);
			if (d < distance) {
				distance = d;
				best = row;
			}
		}
		return distance <= HIT_DISTANCE ? (best?.item.key ?? null) : null;
	}

	function onPointerMove(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.buttons)
			setActive(nearest(event.clientX, event.clientY));
	}
	function onPointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (event.pointerType === 'mouse') return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		setActive(nearest(event.clientX, event.clientY));
	}
	function onKeyDown(event: KeyboardEvent) {
		if (empty) return;
		if (event.key === 'Escape' && active) {
			event.preventDefault();
			setActive(null);
			return;
		}
		const at = activeRow ? activeRow.order : -1;
		const previous = at < 0 ? 0 : at - 1;
		const moves: Record<string, number> = {
			ArrowDown: at + 1,
			ArrowRight: at + 1,
			ArrowUp: previous,
			ArrowLeft: previous,
			Home: 0,
			End: byEnd.length - 1
		};
		if (!(event.key in moves)) return;
		event.preventDefault();
		setActive(byEnd[clamp(moves[event.key], 0, byEnd.length - 1)].item.key);
	}
	function onFocus(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (event.currentTarget.matches(':focus-visible') && !empty && !active)
			setActive(byEnd[0].item.key);
	}

	const format = (value: number) => (formatValue ? formatValue(value) : grouped.format(value));
	function change(item: SlopeItem) {
		if (formatChange) return formatChange(item.end - item.start, item);
		return `${item.end >= item.start ? '+' : '−'}${format(Math.abs(item.end - item.start))}`;
	}
	function rankText(row: Row) {
		if (row.rank0 === row.rank1) return 'same rank';
		const direction = row.rank1 < row.rank0 ? 'up' : 'down';
		return `${direction} ${Math.abs(row.rank0 - row.rank1)} to rank ${row.rank1}`;
	}
	const announce = $derived(
		activeRow
			? `${activeRow.item.label}, ${startLabel} ${format(activeRow.item.start)}, ${endLabel} ${format(activeRow.item.end)}, ${change(activeRow.item)}, ${rankText(activeRow)}`
			: ''
	);
	const summary = $derived(
		empty
			? `${label}. ${emptyLabel}.`
			: `${label}, ${startLabel} to ${endLabel}. ${byEnd.map((row) => `${row.item.label} ${format(row.item.start)} to ${format(row.item.end)}`).join(', ')}.`
	);

	const rowDelay = (index: number) => (reduced ? 0 : index * ROW_STAGGER);
	function instantOr<T>(transition: T) {
		return reduced ? { duration: 0 } : transition;
	}
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
		bind:this={stage}
		bind:clientWidth={width}
		class="stage"
		data-narrow={narrow || undefined}
		data-active={active ? true : undefined}
		role="group"
		tabindex={empty ? -1 : 0}
		aria-roledescription="slope chart"
		aria-label="{label}. Use up and down arrows to move between items in {endLabel} order."
		onpointermove={onPointerMove}
		onpointerdown={onPointerDown}
		onpointerup={(event) => event.pointerType !== 'mouse' && setActive(null)}
		onpointercancel={() => setActive(null)}
		onpointerleave={(event) => event.pointerType === 'mouse' && setActive(null)}
		onkeydown={onKeyDown}
		onblur={() => setActive(null)}
		onfocus={onFocus}
	>
		{#if width > 0}
			<div class="columns" aria-hidden="true">
				<span class="column" style:left="{x0}px">{startLabel}</span>
				<span class="column" style:left="{x1}px">{endLabel}</span>
			</div>
			<div class="plot" style:height="{plotHeight}px">
				<svg class="svg" {width} height={plotHeight} aria-hidden="true" focusable="false">
					<line class="axis" x1={x0} x2={x0} y1={0} y2={plotHeight} />
					<line class="axis" {x1} x2={x1} y1={0} y2={plotHeight} />
					{#each rows as row, i (row.item.key)}
						{@const on = active === row.item.key}
						<g
							class="item"
							data-on={on || undefined}
							data-accent={highlightKey === row.item.key || undefined}
							data-dim={(active !== null && !on) || undefined}
						>
							<path
								class="leader"
								{@attach motionTo(() => ({
									values: { d: `M${x0 - 6},${row.l0}L${x0 - 1},${row.y0}` },
									transition: settle
								}))}
							/>
							<path
								class="leader"
								{@attach motionTo(() => ({
									values: { d: `M${x1 + 6},${row.l1}L${x1 + 1},${row.y1}` },
									transition: settle
								}))}
							/>
							<line
								class="line"
								x1={x0}
								x2={x1}
								{@attach motionTo(() => ({
									initial: !reduced && { y1: row.y0, y2: row.y1, pathLength: 0 },
									values: { y1: row.y0, y2: row.y1, pathLength: drawn ? 1 : 0 },
									transition: {
										y1: settle,
										y2: settle,
										pathLength: instantOr({
											duration: DRAW_SECONDS,
											ease: motionTokens.ease.inOut,
											delay: 0.1 + rowDelay(i)
										})
									}
								}))}
							/>
							<circle
								class="dot"
								cx={x0}
								r={4}
								{@attach motionTo(() => ({
									initial: !reduced && { cy: row.y0, scale: 0 },
									values: { cy: row.y0, scale: drawn ? 1 : 0 },
									transition: {
										cy: settle,
										scale: instantOr({ ...spring.snappy, delay: rowDelay(i) })
									}
								}))}
							/>
							<circle
								class="dot"
								cx={x1}
								r={4}
								{@attach motionTo(() => ({
									initial: !reduced && { cy: row.y1, scale: 0 },
									values: { cy: row.y1, scale: drawn ? 1 : 0 },
									transition: {
										cy: settle,
										scale: instantOr({ ...spring.snappy, delay: DRAW_SECONDS + rowDelay(i) })
									}
								}))}
							/>
						</g>
					{/each}
				</svg>
				{#each rows as row, i (row.item.key)}
					{@const on = active === row.item.key}
					<div
						class="labels"
						data-on={on || undefined}
						data-accent={highlightKey === row.item.key || undefined}
						data-dim={(active !== null && !on) || undefined}
						aria-hidden="true"
					>
						<span
							class="start"
							style:right="{width - x0 + 10}px"
							style:max-width="{x0 - 10}px"
							{@attach motionTo(() => ({
								initial: !reduced && { y: row.l0, opacity: 0 },
								values: { y: row.l0, opacity: drawn ? 1 : 0 },
								transition: { y: settle, opacity: { duration: 0.3, delay: rowDelay(i) } }
							}))}
						>
							<span class="name">{row.item.label}</span>
							<span class="value">{format(row.item.start)}</span>
						</span>
						<span
							class="end"
							style:left="{x1 + 10}px"
							{@attach motionTo(() => ({
								initial: !reduced && { y: row.l1, opacity: 0 },
								values: { y: row.l1, opacity: drawn ? 1 : 0 },
								transition: {
									y: settle,
									opacity: { duration: 0.3, delay: DRAW_SECONDS + rowDelay(i) }
								}
							}))}
						>
							<span class="value">{format(row.item.end)}</span>
							{#if ranks}<SlopeRank move={row.rank0 - row.rank1} />{/if}
						</span>
					</div>
				{/each}
			</div>
		{/if}
		<div bind:this={tip} {@attach glide.attach} class="tooltip" aria-hidden="true">
			<p class="tip-title">{activeRow?.item.label ?? ''}</p>
			<p class="tip-row">
				<span class="tip-name">{startLabel}</span>
				<span class="tip-value">{activeRow ? format(activeRow.item.start) : ''}</span>
			</p>
			<p class="tip-row">
				<span class="tip-name">{endLabel}</span>
				<span class="tip-value">{activeRow ? format(activeRow.item.end) : ''}</span>
			</p>
			<p class="tip-meta">{activeRow ? `${change(activeRow.item)}, ${rankText(activeRow)}` : ''}</p>
		</div>
		{#if empty}<p class="message">{emptyLabel}</p>{/if}
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
	<p class="sr-only">{summary}</p>
	{#if !empty}
		<div class="sr-only">
			<table>
				<caption>{label}</caption>
				<thead>
					<tr>
						<th scope="col">Item</th>
						<th scope="col">{startLabel}</th>
						<th scope="col">{endLabel}</th>
						<th scope="col">Change</th>
						<th scope="col">Rank</th>
					</tr>
				</thead>
				<tbody>
					{#each byEnd as row (row.item.key)}
						<tr>
							<th scope="row">{row.item.label}</th>
							<td>{format(row.item.start)}</td>
							<td>{format(row.item.end)}</td>
							<td>{change(row.item)}</td>
							<td>{row.rank0} to {row.rank1}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</figure>

<style>
	.figure {
		position: relative;
		display: grid;
		min-width: 0;
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	.stage {
		position: relative;
		min-width: 0;
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.columns {
		position: relative;
		height: 28px;
	}
	.column {
		position: absolute;
		top: 0;
		translate: -50% 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		line-height: 20px;
		white-space: nowrap;
	}
	.plot {
		position: relative;
	}
	.svg {
		display: block;
		overflow: visible;
	}
	.axis {
		stroke: var(--arc-border);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	/* Every line is one neutral ink; the story item takes the first series (derived from the accent) and the item in focus comes forward. */
	.item {
		--slope-ink: color-mix(in oklch, var(--arc-foreground) 36%, var(--arc-surface));
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.item[data-accent] {
		--slope-ink: var(--arc-series-1);
	}
	.item[data-on]:not([data-accent]) {
		--slope-ink: var(--arc-foreground);
	}
	.item[data-dim] {
		opacity: 0.14;
	}
	.line {
		stroke: var(--slope-ink);
		stroke-width: 2;
		stroke-linecap: round;
		fill: none;
		transition: stroke var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.dot {
		fill: var(--slope-ink);
		stroke: var(--arc-surface);
		stroke-width: 2;
		transform-box: fill-box;
		transform-origin: center;
		transition: fill var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.leader {
		fill: none;
		stroke: var(--arc-border-strong);
		stroke-width: 1;
	}
	.labels {
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.labels[data-dim] {
		opacity: 0.3;
	}
	.start,
	.end {
		position: absolute;
		top: 0;
		display: flex;
		height: 20px;
		align-items: center;
		gap: 8px;
		margin-top: -10px;
		font-size: var(--arc-text-sm);
		line-height: 20px;
		white-space: nowrap;
		pointer-events: none;
	}
	.start {
		justify-content: flex-end;
		max-width: 100%;
	}
	/* On a phone the labels step down a size so the longest names fit beside the first column instead of running off the edge. */
	.stage[data-narrow] .start,
	.stage[data-narrow] .end {
		gap: 6px;
		font-size: var(--arc-text-xs);
	}
	.name {
		min-width: 0;
		overflow: hidden;
		color: var(--arc-text-secondary);
		text-overflow: ellipsis;
	}
	.value {
		color: var(--arc-foreground);
		font-variant-numeric: tabular-nums;
	}
	.labels[data-on] .name,
	.labels[data-accent] .name {
		color: var(--arc-foreground);
	}
	.labels[data-on] .value,
	.labels[data-accent] .value {
		font-weight: 500;
	}
	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 2;
		display: grid;
		min-width: 168px;
		max-width: min(240px, 100%);
		gap: 3px;
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
	.stage[data-active] .tooltip {
		opacity: 1;
		scale: 1;
	}
	.tip-title {
		margin: 0 0 2px;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		white-space: nowrap;
	}
	.tip-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0;
		font-size: var(--arc-text-sm);
		line-height: 1.3;
	}
	.tip-name {
		color: var(--arc-text-secondary);
	}
	.tip-value {
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.tip-meta {
		margin: 2px 0 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	.message {
		display: grid;
		min-height: 160px;
		place-items: center;
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
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
		.item,
		.line,
		.dot,
		.labels,
		.tooltip {
			transition: none;
		}
	}
</style>
