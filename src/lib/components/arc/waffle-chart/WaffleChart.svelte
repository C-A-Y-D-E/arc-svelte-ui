<script module lang="ts">
	export interface WaffleCategory {
		/** Stable identity. Cells keep following their category when the data changes, so a new dataset flows instead of repainting. */
		key: string;
		/** Name in the legend, the tooltip, and the data table. */
		label: string;
		/** Raw amount. Shares are computed from the total; negatives count as zero. */
		value: number;
		/** Any CSS color. Defaults to the first series for accentKey, the supporting series for the next three, then neutral steps. */
		color?: string;
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
		motionTo,
		onceInView
	} from '../brush-chart/chart-motion.svelte';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** Categories in fill order. The first fills from the bottom-left corner, column by column. */
		data: WaffleCategory[];
		/** What the whole is, such as "Electricity generation, 2023". Names the chart for assistive technology. */
		label: string;
		/** Unit after each raw value in the tooltip and table, such as "TWh". */
		unit?: string;
		formatValue?: (value: number, category: WaffleCategory) => string;
		/** Grid rows. rows × columns cells make the whole; 10 × 10 means one cell per percent. */
		rows?: number;
		columns?: number;
		/** The category painted in the accent. Pass null to keep every category neutral. Defaults to the first category. */
		accentKey?: string | null;
		/** Pinned category. Others dim while one is focused. */
		activeKey?: string | null;
		defaultActiveKey?: string | null;
		onActiveChange?: (key: string | null) => void;
		/** Category list with shares that roll to their new value. */
		legend?: boolean;
		/** Decimal places for shares. */
		decimals?: number;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	};

	let {
		data,
		label,
		unit = '',
		formatValue,
		rows = 10,
		columns = 10,
		accentKey,
		defaultActiveKey = null,
		activeKey = $bindable(defaultActiveKey),
		onActiveChange,
		legend = true,
		decimals = 0,
		emptyLabel = 'No data',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	type Cell = { id: number; key: string | null; slot: number };
	type Pointer = { key: string; slot: number } | null;

	const { spring } = motionTokens;
	const GAP = 3;
	/** accentKey takes the first series and the next three categories the supporting series. Anything past that falls back to neutral steps that alternate in lightness. */
	const SHADES = [40, 20, 30, 14];
	/** A second, colour-free channel: neutral categories cycle through square, round, and framed cells, so neighbours differ in shape as well as lightness. */
	const SHAPES = ['square', 'round', 'framed'] as const;
	const SUPPORTING_SERIES = 3;
	const TIP_OFFSET = 10;
	/** Total stagger across the grid, in seconds. */
	const WAVE_SECONDS = 0.32;
	const HIDDEN_SCALE = 0.4;
	const DIP_SCALE = 0.62;
	const DIP_SECONDS = 0.62;
	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const glide = createTooltipGlide({ stiffness: 520, damping: 44, restDelta: 0.01 });

	/** Whole cells per category by largest remainder, so the counts always add up to the grid. */
	function allocate(items: WaffleCategory[], total: number, cells: number): number[] {
		if (total <= 0) return items.map(() => 0);
		const exact = items.map((item) => (Math.max(0, item.value) / total) * cells);
		const counts = exact.map(Math.floor);
		let left = cells - counts.reduce((sum, count) => sum + count, 0);
		const order = exact
			.map((value, index) => ({ index, rest: value - Math.floor(value) }))
			.sort((a, b) => b.rest - a.rest);
		for (let k = 0; left > 0 && k < order.length; k++, left--) counts[order[k].index]++;
		return counts;
	}

	/**
	 * Hands cells to categories while moving as few as possible: each category keeps the cells it already had,
	 * surplus cells join the categories that grew, and every block takes its cells in their previous order so paths never cross.
	 */
	function reassign(previous: Cell[], items: WaffleCategory[], counts: number[]): Cell[] {
		const bySlot = [...previous].sort((a, b) => a.slot - b.slot);
		const kept = new Map<string, Cell[]>();
		const pool: Cell[] = [];
		const want = new Map(items.map((item, index) => [item.key, counts[index]]));
		for (const cell of bySlot) {
			const list = cell.key !== null ? (kept.get(cell.key) ?? []) : [];
			if (cell.key !== null && list.length < (want.get(cell.key) ?? 0)) {
				list.push(cell);
				kept.set(cell.key, list);
			} else pool.push(cell);
		}
		const next: Cell[] = [];
		let slot = 0;
		items.forEach((item, index) => {
			const own = kept.get(item.key) ?? [];
			while (own.length < counts[index] && pool.length) own.push(pool.shift()!);
			own
				.sort((a, b) => a.slot - b.slot)
				.forEach((cell) => next.push({ id: cell.id, key: item.key, slot: slot++ }));
		});
		pool.forEach((cell) => next.push({ id: cell.id, key: null, slot: slot++ }));
		return next.sort((a, b) => a.id - b.id);
	}

	let grid: HTMLDivElement;
	let tip: HTMLDivElement | undefined = $state();
	let side = $state(0);
	let seen = $state(false);
	let pointer = $state<Pointer>(null);
	let preview: string | null = $state(null);

	const reduced = $derived(isReducedMotion());
	const count = $derived(Math.max(1, rows * columns));
	const total = $derived(data.reduce((sum, item) => sum + Math.max(0, item.value), 0));
	const empty = $derived(!data.length || total <= 0);
	const accent = $derived(accentKey === undefined ? (data[0]?.key ?? null) : accentKey);

	// Cells are persistent objects; each data change reassigns them so they travel instead of repainting.
	const signature = $derived(
		`${count}|${data.map((item) => `${item.key}:${item.value}`).join(',')}`
	);
	const counts = $derived.by(() => {
		void signature;
		return untrack(() => allocate(data, total, count));
	});
	let previousCells = null as Cell[] | null;
	const layout = $derived.by(() => {
		void signature;
		return untrack(() => {
			const base = Array.from(
				{ length: count },
				(_, id) => previousCells?.[id] ?? { id, key: null, slot: id }
			);
			const cells = reassign(base, data, counts);
			const moved = previousCells
				? new Set(
						cells
							.filter((cell) => base[cell.id].slot !== cell.slot || base[cell.id].key !== cell.key)
							.map((cell) => cell.id)
					)
				: new Set<number>();
			previousCells = cells;
			return { cells, moved };
		});
	});

	const focusKey = $derived(pointer?.key ?? preview ?? activeKey);
	const active = $derived(focusKey && data.some((item) => item.key === focusKey) ? focusKey : null);

	const size = $derived(side ? (side - GAP * (columns - 1)) / columns : 0);
	const height = $derived(size ? size * rows + GAP * (rows - 1) : 0);
	// Column by column from the bottom-left corner, like a glass filling up.
	function place(slot: number) {
		return {
			x: Math.floor(slot / rows) * (size + GAP),
			y: (rows - 1 - (slot % rows)) * (size + GAP)
		};
	}

	function neutralRank(key: string) {
		return data.filter((entry) => entry.key !== accent).findIndex((entry) => entry.key === key);
	}
	function colorOf(key: string | null) {
		if (key === null) return 'transparent';
		const item = data.find((entry) => entry.key === key);
		if (!item) return 'transparent';
		if (item.color) return item.color;
		if (key === accent) return 'var(--arc-series-1)';
		const rank = neutralRank(key);
		// The supporting series only sit beside an accent; with none, every category is a neutral step.
		if (accent !== null && rank < SUPPORTING_SERIES) return `var(--arc-series-${rank + 2})`;
		const neutralStep = accent === null ? rank : rank - SUPPORTING_SERIES;
		const shade = SHADES[neutralStep % SHADES.length];
		return `color-mix(in oklch, var(--arc-foreground) ${shade}%, var(--arc-surface))`;
	}
	function shapeOf(key: string | null) {
		if (key === null || key === accent) return 'square';
		const rank = neutralRank(key);
		return rank < 0 ? 'square' : SHAPES[rank % SHAPES.length];
	}

	function setPinned(key: string | null) {
		activeKey = key;
		onActiveChange?.(key);
	}

	// The tooltip glides between cells on its own spring and stays inside the figure.
	let wasShown = false;
	$effect(() => {
		if (!pointer || !tip || !ref || !size) {
			wasShown = false;
			return;
		}
		const hostBox = ref.getBoundingClientRect();
		const boardBox = grid.getBoundingClientRect();
		const { x, y } = place(pointer.slot);
		const cx = boardBox.left - hostBox.left + x + size / 2;
		const cy = boardBox.top - hostBox.top + y;
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;
		let top = cy - th - TIP_OFFSET;
		if (top < 0) top = cy + size + TIP_OFFSET;
		const left = clamp(cx - tw / 2, 0, Math.max(0, hostBox.width - tw));
		glide.place(left, clamp(top, 0, Math.max(0, hostBox.height - th)), !wasShown || reduced);
		wasShown = true;
	});

	function slotAt(clientX: number, clientY: number) {
		const box = grid.getBoundingClientRect();
		if (!size) return null;
		const col = clamp(Math.floor((clientX - box.left) / (size + GAP)), 0, columns - 1);
		const row = clamp(Math.floor((clientY - box.top) / (size + GAP)), 0, rows - 1);
		return col * rows + (rows - 1 - row);
	}
	function pointAt(slot: number | null): Pointer {
		if (slot === null) return null;
		const cell = layout.cells.find((item) => item.slot === slot);
		return cell?.key ? { key: cell.key, slot } : null;
	}
	function onPointerMove(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.buttons)
			pointer = pointAt(slotAt(event.clientX, event.clientY));
	}
	function onPointerDown(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture?.(event.pointerId);
		pointer = pointAt(slotAt(event.clientX, event.clientY));
	}
	function onFocus(event: FocusEvent & { currentTarget: HTMLDivElement }) {
		if (event.currentTarget.matches(':focus-visible') && !empty) pointer = pointer ?? pointAt(0);
	}

	// Arrows walk the grid cell by cell; Page keys jump between categories.
	function onKeyDown(event: KeyboardEvent) {
		if (empty) return;
		if (event.key === 'Escape' && pointer) {
			event.preventDefault();
			pointer = null;
			return;
		}
		const filled = layout.cells.filter((cell) => cell.key !== null).length;
		const at = pointer?.slot ?? 0;
		const col = Math.floor(at / rows);
		const row = at % rows;
		const blocks = counts
			.map((blockSize, index) => ({
				start: counts.slice(0, index).reduce((sum, value) => sum + value, 0),
				size: blockSize
			}))
			.filter((block) => block.size > 0);
		const block = Math.max(
			0,
			blocks.findIndex((item) => at >= item.start && at < item.start + item.size)
		);
		const moves: Record<string, () => number> = {
			ArrowUp: () => col * rows + Math.min(rows - 1, row + 1),
			ArrowDown: () => col * rows + Math.max(0, row - 1),
			ArrowRight: () => Math.min(columns - 1, col + 1) * rows + row,
			ArrowLeft: () => Math.max(0, col - 1) * rows + row,
			PageDown: () => blocks[Math.min(blocks.length - 1, block + 1)].start,
			PageUp: () =>
				at > blocks[block].start ? blocks[block].start : blocks[Math.max(0, block - 1)].start,
			Home: () => 0,
			End: () => filled - 1
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		pointer = pointAt(clamp(pointer ? move() : 0, 0, Math.max(0, filled - 1)));
	}

	const format = (value: number, item: WaffleCategory) =>
		`${formatValue ? formatValue(value, item) : grouped.format(value)}${unit ? ` ${unit}` : ''}`;
	const share = (item: WaffleCategory) => (total > 0 ? (Math.max(0, item.value) / total) * 100 : 0);
	const reading = $derived(
		pointer ? (data.find((item) => item.key === pointer?.key) ?? null) : null
	);
	const announce = $derived(
		reading
			? `${reading.label}, ${share(reading).toFixed(decimals)}%, ${format(reading.value, reading)}`
			: ''
	);
	const summary = $derived(
		empty
			? `${label}. ${emptyLabel}.`
			: `${label}. ${data.map((item) => `${item.label} ${share(item).toFixed(decimals)}%`).join(', ')}.`
	);

	function cellMotion(cell: Cell) {
		const { x, y } = place(cell.slot);
		const travel = layout.moved.has(cell.id) && !reduced;
		const delay = reduced ? 0 : (cell.slot / count) * WAVE_SECONDS;
		const settle = reduced ? { duration: 0 } : spring.morph;
		const hidden = { x, y, scale: HIDDEN_SCALE, opacity: 0 };
		// A travelling cell dips while it flies, so the flow reads as cells lifting out of one block and landing in another.
		const shown = {
			x,
			y,
			scale: travel ? [1, DIP_SCALE, 1] : 1,
			opacity: cell.key === null ? 0 : 1
		};
		return {
			initial: !reduced && hidden,
			values: seen || reduced ? shown : hidden,
			transition: reduced
				? { duration: 0 }
				: {
						x: { ...settle, delay },
						y: { ...settle, delay },
						scale: travel
							? { duration: DIP_SECONDS, times: [0, 0.42, 1], ease: 'easeInOut' as const, delay }
							: { ...spring.snappy, delay: delay * 0.6 },
						opacity: { duration: 0.24, delay: delay * 0.6 }
					}
		};
	}

	/** A share that rolls to its new value on a spring and holds its width with tabular figures. */
	function rollingShare(read: () => number): Attachment<HTMLElement> {
		return (node) => {
			let current: number | null = null;
			let controls: ReturnType<typeof animate> | undefined;
			const paint = (value: number) => (node.textContent = `${value.toFixed(decimals)}%`);
			$effect(() => {
				const target = read();
				controls?.stop();
				if (current === null || reduced) {
					current = target;
					paint(target);
					return;
				}
				controls = animate(current, target, {
					...spring.smooth,
					onUpdate: (value) => {
						current = value;
						paint(value);
					}
				});
			});
			return () => controls?.stop();
		};
	}
</script>

<figure
	bind:this={ref}
	{@attach onceInView(0.35, () => (seen = true))}
	class={['figure', className]}
	aria-label={label}
	data-legend={legend || undefined}
	{...rest}
>
	<div class="body">
		<div class="board">
			<!-- The chart is one focusable composite: arrow keys move the reading inside it. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<div
				bind:this={grid}
				bind:clientWidth={side}
				class="grid"
				style:height={height ? `${height}px` : undefined}
				style:aspect-ratio={height ? undefined : `${columns} / ${rows}`}
				data-active={active ? true : undefined}
				role="group"
				tabindex={empty ? -1 : 0}
				aria-roledescription="waffle chart"
				aria-label="{label}. {count} cells. Use arrow keys to move between cells, Page Up and Page Down to jump between categories."
				onpointermove={onPointerMove}
				onpointerdown={onPointerDown}
				onpointerup={(event) => {
					if (event.pointerType !== 'mouse') pointer = null;
				}}
				onpointercancel={() => (pointer = null)}
				onpointerleave={(event) => {
					if (event.pointerType === 'mouse') pointer = null;
				}}
				onkeydown={onKeyDown}
				onblur={() => (pointer = null)}
				onfocus={onFocus}
			>
				{#if size > 0}
					{#each layout.cells as cell (cell.id)}
						<span
							class="cell"
							aria-hidden="true"
							data-on={(cell.key !== null && cell.key === active) || undefined}
							data-cursor={pointer?.slot === cell.slot || undefined}
							data-empty={cell.key === null || undefined}
							data-shape={shapeOf(cell.key)}
							style:width="{size}px"
							style:height="{size}px"
							style:--waffle-cell={colorOf(cell.key)}
							style:--waffle-delay="{reduced ? 0 : (cell.slot / count) * WAVE_SECONDS}s"
							{@attach motionTo(() => cellMotion(cell))}
						></span>
					{/each}
				{/if}
			</div>
			{#if !empty}
				<div
					bind:this={tip}
					{@attach glide.attach}
					class="tooltip"
					data-shown={pointer ? true : undefined}
					aria-hidden="true"
				>
					<p class="tip-row">
						<span
							class="tip-swatch"
							data-shape={shapeOf(reading?.key ?? null)}
							style:--waffle-cell={colorOf(reading?.key ?? null)}
						></span>
						<span class="tip-name">{reading?.label ?? ''}</span>
						<span class="tip-value">{reading ? `${share(reading).toFixed(decimals)}%` : ''}</span>
					</p>
					<p class="tip-meta">{reading ? format(reading.value, reading) : ''}</p>
				</div>
			{:else}
				<p class="message">{emptyLabel}</p>
			{/if}
		</div>
		{#if legend && !empty}
			<ul class="legend" aria-label="{label} categories" onpointerleave={() => (preview = null)}>
				{#each data as item (item.key)}
					<li>
						<button
							type="button"
							class="item"
							aria-pressed={activeKey === item.key}
							data-on={active === item.key || undefined}
							data-dim={(active !== null && active !== item.key) || undefined}
							onclick={() => setPinned(activeKey === item.key ? null : item.key)}
							onpointerenter={(event) => {
								if (event.pointerType === 'mouse') preview = item.key;
							}}
							onfocus={(event) => {
								if (event.currentTarget.matches(':focus-visible')) preview = item.key;
							}}
							onblur={() => (preview = null)}
						>
							<span
								class="swatch"
								data-shape={shapeOf(item.key)}
								style:--waffle-cell={colorOf(item.key)}
								aria-hidden="true"
							></span>
							<span class="item-label">{item.label}</span>
							<span class="item-share" {@attach rollingShare(() => share(item))}></span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
	<p class="sr-only">{summary}</p>
	{#if !empty}
		<div class="sr-only">
			<table>
				<caption>{label}</caption>
				<thead>
					<tr>
						<th scope="col">Category</th>
						<th scope="col">Value</th>
						<th scope="col">Share</th>
						<th scope="col">Cells</th>
					</tr>
				</thead>
				<tbody>
					{#each data as item, index (item.key)}
						<tr>
							<th scope="row">{item.label}</th>
							<td>{format(item.value, item)}</td>
							<td>{share(item).toFixed(decimals)}%</td>
							<td>{counts[index]}</td>
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
		min-width: 0;
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
		container-type: inline-size;
	}
	.body {
		display: grid;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
		gap: var(--arc-space-6);
	}
	@container (min-width: 420px) {
		.figure[data-legend] .body {
			grid-template-columns: minmax(0, 232px) minmax(0, 1fr);
			gap: var(--arc-space-6);
		}
	}
	.board {
		min-width: 0;
	}
	.grid {
		position: relative;
		width: 100%;
		max-width: 300px;
		margin-inline: auto;
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
		cursor: default;
	}
	/* Each cell is one unit. Its colour changes mid-flight with the same stagger as its travel. */
	.cell {
		--waffle-inner: 0 0 0 0 transparent;
		--waffle-outer: 0 0 0 0 transparent;
		position: absolute;
		top: 0;
		left: 0;
		border-radius: 22%;
		background: var(--waffle-cell);
		box-shadow: var(--waffle-inner), var(--waffle-outer);
		will-change: transform;
		transition:
			background-color var(--arc-duration-considered) var(--arc-ease-standard)
				var(--waffle-delay, 0s),
			border-radius var(--arc-duration-considered) var(--arc-ease-standard) var(--waffle-delay, 0s),
			box-shadow var(--arc-duration-considered) var(--arc-ease-standard) var(--waffle-delay, 0s),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.grid[data-active] .cell:not([data-on]) {
		opacity: 0.26 !important;
		transition:
			background-color var(--arc-duration-considered) var(--arc-ease-standard)
				var(--waffle-delay, 0s),
			border-radius var(--arc-duration-considered) var(--arc-ease-standard) var(--waffle-delay, 0s),
			opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.cell[data-cursor] {
		--waffle-outer:
			0 0 0 2px var(--arc-surface),
			0 0 0 3.5px color-mix(in oklch, var(--arc-foreground) 55%, transparent);
	}
	/* Shape is the colour-free second channel: a cell morphs between these as it changes category. */
	.cell[data-shape='round'],
	.swatch[data-shape='round'],
	.tip-swatch[data-shape='round'] {
		border-radius: 50%;
	}
	.cell[data-shape='framed'] {
		--waffle-inner: inset 0 0 0 2.5px var(--waffle-cell), inset 0 0 0 3.25px var(--arc-surface);
	}
	.swatch[data-shape='framed'],
	.tip-swatch[data-shape='framed'] {
		box-shadow:
			inset 0 0 0 2px var(--waffle-cell),
			inset 0 0 0 3px var(--arc-surface);
	}
	.tooltip {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 2;
		display: grid;
		min-width: 150px;
		max-width: min(240px, 100%);
		gap: 2px;
		padding: 9px 12px;
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
	.tooltip[data-shown] {
		opacity: 1;
		scale: 1;
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
		height: 10px;
		flex: none;
		border-radius: 3px;
		background: var(--waffle-cell);
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
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
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.tip-meta {
		margin: 0 0 0 18px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.message {
		display: grid;
		min-height: 160px;
		place-items: center;
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
	}
	/* The legend doubles as the reading: each share rolls to its new value. */
	.legend {
		display: grid;
		min-width: 0;
		grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		gap: 2px var(--arc-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@container (min-width: 420px) {
		.figure[data-legend] .legend {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	/* Below the side-by-side layout two columns would clip names like "Wind and solar", so the legend reads as one list. */
	@container (max-width: 419px) {
		.legend {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.item {
		display: grid;
		width: 100%;
		min-height: 36px;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 4px 10px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		text-align: left;
		-webkit-tap-highlight-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.item:active {
		transform: scale(0.98);
	}
	.item[data-on] {
		color: var(--arc-foreground);
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
	}
	.item[data-dim] {
		opacity: 0.5;
	}
	.item[aria-pressed='true'] {
		color: var(--arc-foreground);
	}
	@media (hover: hover) and (pointer: fine) {
		.item:hover {
			color: var(--arc-foreground);
		}
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--waffle-cell);
	}
	.item-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-share {
		min-width: 3.2em;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		text-align: right;
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
		.cell,
		.grid[data-active] .cell:not([data-on]),
		.tooltip,
		.tip-swatch,
		.item {
			transition: none;
		}
	}
</style>
