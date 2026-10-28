<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export interface DonutChartDatum {
		/** Stable identity. A segment whose key survives a data change keeps its place and color, so switching datasets morphs the arcs. */
		key: string;
		label: string;
		value: number;
		/** Any CSS color. Segments default to the shared --arc-series-* palette in data order, then neutral steps. */
		color?: string;
	}

	/** Use a donut chart for a few parts of one whole, when the share of each part matters more than precise comparison. */
	export interface DonutChartProps extends Omit<HTMLAttributes<HTMLElement>, 'class'> {
		data: DonutChartDatum[];
		/** What the whole is, such as "Visits by source". Names the chart for assistive technology. */
		label: string;
		/** Unit after values, such as "visits". */
		unit?: string;
		formatValue?: (value: number) => string;
		/** Center label at rest, above the total. */
		totalLabel?: string;
		/** Diameter in pixels. The chart scales down to fit narrower containers. */
		size?: number;
		/** Ring thickness in pixels. */
		thickness?: number;
		/** Segments below this share of the total join "Other". */
		groupBelow?: number;
		/** The most segments drawn, counting "Other". The smallest parts beyond it are grouped. */
		maxSegments?: number;
		otherLabel?: string;
		/** Selected segment key. Hover and focus preview other segments without changing it. */
		activeKey?: string | null;
		defaultActiveKey?: string | null;
		onActiveChange?: (key: string | null) => void;
		/** Hidden segment keys. A hidden segment closes and the rest of the ring redistributes. */
		hiddenKeys?: string[];
		defaultHiddenKeys?: string[];
		onHiddenKeysChange?: (keys: string[]) => void;
		/** What clicking a legend row does: show or hide its segment, or pin it as the selected segment. */
		legendAction?: 'toggle' | 'select';
		/** The synced legend beside or below the ring. */
		legend?: boolean;
		emptyLabel?: string;
		ref?: HTMLElement | null;
		class?: string;
	}
</script>

<script lang="ts">
	import { animate, cancelFrame, frame, motionValue, type MotionValue } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { isReducedMotion, motionTokens } from '../motion';
	import { isKeyboardFocus, onceInView, physicalSpring } from '../sparkline/chart-kit';
	import Count from './Count.svelte';
	import {
		OTHER_KEY,
		TAU,
		breadth,
		formatGrouped,
		keepLeaving,
		layout,
		memberSummary,
		round2,
		sector,
		shareText,
		sliceData,
		type SegmentArc,
		type Slice
	} from './donut-math';

	let {
		data,
		label,
		unit = '',
		formatValue = formatGrouped,
		totalLabel = 'Total',
		size = 208,
		thickness = 24,
		groupBelow = 0.04,
		maxSegments = 6,
		otherLabel = 'Other',
		defaultActiveKey = null,
		activeKey = $bindable(defaultActiveKey),
		onActiveChange,
		defaultHiddenKeys = [],
		hiddenKeys = $bindable(defaultHiddenKeys),
		onHiddenKeysChange,
		legendAction = 'toggle',
		legend = true,
		emptyLabel = 'No data yet',
		ref = $bindable(null),
		class: className,
		...rest
	}: DonutChartProps = $props();

	type Segment = {
		start: MotionValue<number>;
		end: MotionValue<number>;
		lift: MotionValue<number>;
		off: () => void;
	};

	const { spring, stagger } = motionTokens;
	const reveal = physicalSpring({ visualDuration: 0.72, bounce: 0 }, 0.0005);
	const settle = physicalSpring({ visualDuration: 0.5, bounce: 0 }, 0.0005);
	const pop = physicalSpring(spring.snappy, 0.002);
	const REVEAL_LEAD = 0.04;
	const IN_VIEW_AMOUNT = 0.35;

	/** Neutral steps after the four series colors, and the quietest step for Other. */
	const SERIES_COUNT = 4;
	const NEUTRAL = [56, 42, 32];
	const OTHER_COLOR = 'color-mix(in oklch, var(--arc-foreground) 26%, var(--arc-surface))';
	const seriesColor = (index: number) =>
		index < SERIES_COUNT
			? `var(--arc-series-${index + 1})`
			: `color-mix(in oklch, var(--arc-foreground) ${NEUTRAL[(index - SERIES_COUNT) % NEUTRAL.length]}%, var(--arc-surface))`;

	/** Room left outside the ring for the lift; the gap between segments and their corner radius, in pixels. */
	const LIFT = 4;
	const GROW = 2;
	const MARGIN = 7;
	const GAP = 3;
	const CORNER = 4;
	const MIN_INNER_RADIUS = 8;
	const HOLE_HIT_SLOP = 6;
	/** A segment fades in over this many pixels of outer-edge breadth, starting at one. */
	const FADE_BREADTH = 3;

	/** Center readouts stay mounted in one grid cell and roll like a drum: the ones before the active segment wait above, the ones after it below. */
	const DRUM_OFFSET_EM = 0.45;
	const drumIn = { duration: 0.26, ease: motionTokens.ease.enter };
	const drumOut = { duration: 0.16, ease: motionTokens.ease.standard };
	const TOTAL_KEY = '__total';
	const EMPTY_KEY = '__empty';

	const reduced = $derived(isReducedMotion());
	let seen = $state(false);
	const shown = $derived(seen || reduced);
	const legendId = $props.id();

	const slices = $derived(sliceData(data, groupBelow, maxSegments, otherLabel));
	const hidden = $derived(
		new Set(hiddenKeys.filter((key) => slices.some((item) => item.key === key)))
	);
	const visible = $derived(slices.filter((item) => !hidden.has(item.key)));
	const total = $derived(visible.reduce((sum, item) => sum + item.value, 0));
	const signature = $derived(
		slices.map((item) => `${item.key}:${item.value}${hidden.has(item.key) ? 'h' : ''}`).join('|')
	);
	const suffix = $derived(unit ? ` ${unit}` : '');

	// Colors follow a key from the first time it is seen, so a segment keeps its color through every dataset.
	const paletteOrder = new Map<string, number>();
	const palette = $derived.by(() => {
		for (const item of data)
			if (!paletteOrder.has(item.key)) paletteOrder.set(item.key, paletteOrder.size);
		return new Map(paletteOrder);
	});
	const colorFor = (item: Slice) =>
		item.color ?? (item.key === OTHER_KEY ? OTHER_COLOR : seriesColor(palette.get(item.key) ?? 0));

	// Leaving segments stay drawn in their old place while they close, then drop out once they have.
	let drawn = $state.raw<Slice[]>(untrack(() => slices));
	$effect.pre(() => {
		void signature;
		untrack(() => (drawn = keepLeaving(drawn, slices)));
	});

	// Selection is controlled or not; hover and focus preview on top of it.
	let preview = $state<string | null>(null);
	const current = $derived(
		[preview, activeKey].find((key) => key && visible.some((item) => item.key === key)) ?? null
	);
	const activeSlice = $derived(visible.find((item) => item.key === current) ?? null);
	let announcement = $state('');

	function select(key: string | null) {
		activeKey = key;
		onActiveChange?.(key);
	}

	function toggleHidden(key: string) {
		const isHidden = hidden.has(key);
		if (!isHidden && visible.length <= 1) return;
		const next = isHidden ? hiddenKeys.filter((item) => item !== key) : [...hiddenKeys, key];
		hiddenKeys = next;
		onHiddenKeysChange?.(next);
		const item = slices.find((slice) => slice.key === key);
		const nextTotal = slices.reduce(
			(sum, slice) => sum + (next.includes(slice.key) ? 0 : slice.value),
			0
		);
		if (item)
			announcement = `${item.label} ${isHidden ? 'shown' : 'hidden'}. ${totalLabel} ${formatValue(nextTotal)}${suffix}.`;
	}

	// Geometry in the chart's own units; the SVG scales with its container.
	const geometry = $derived.by(() => {
		const center = size / 2;
		const outer = center - MARGIN;
		return {
			center,
			outer,
			inner: Math.max(MIN_INNER_RADIUS, outer - thickness),
			corner: Math.min(CORNER, thickness / 4)
		};
	});

	const segments = new Map<string, Segment>();
	const paths = new Map<string, SVGPathElement>();
	let targets = new Map<string, SegmentArc>();
	let svg: SVGSVGElement;

	const registerPath =
		(key: string): Attachment<SVGPathElement> =>
		(node) => {
			paths.set(key, node);
			return () => {
				if (paths.get(key) === node) paths.delete(key);
			};
		};

	// One paint per frame, whatever moved: every path's shape and lift are written straight to the DOM.
	function paint() {
		const { center, outer, inner, corner } = geometry;
		for (const [key, node] of paths) {
			const segment = segments.get(key);
			if (!segment) {
				node.setAttribute('d', '');
				continue;
			}
			const start = segment.start.get();
			const end = segment.end.get();
			const lift = Math.max(0, segment.lift.get());
			const R = outer + lift * GROW;
			node.setAttribute('d', sector(center, R, inner - lift * GROW * 0.5, start, end, GAP, corner));
			const fade = (breadth(R, start, end, GAP) - 1) / FADE_BREADTH;
			node.setAttribute('fill-opacity', round2(Math.min(1, Math.max(0, fade))));
			const middle = ((start + end) / 2) * TAU - Math.PI / 2;
			const distance = lift * LIFT;
			node.setAttribute(
				'transform',
				`translate(${round2(Math.cos(middle) * distance)} ${round2(Math.sin(middle) * distance)})`
			);
		}
	}
	const schedulePaint = () => frame.render(paint);

	$effect(paint);
	$effect(() => () => {
		cancelFrame(paint);
		for (const segment of segments.values()) segment.off();
		segments.clear();
	});

	function createSegment(from: number): Segment {
		const start = motionValue(from);
		const end = motionValue(from);
		const lift = motionValue(0);
		const unsubscribers = [start, end, lift].map((value) => value.on('change', schedulePaint));
		return {
			start,
			end,
			lift,
			off: () => {
				unsubscribers.forEach((unsubscribe) => unsubscribe());
				start.destroy();
				end.destroy();
				lift.destroy();
			}
		};
	}

	function dropSegment(key: string) {
		if (slices.some((item) => item.key === key)) return;
		segments.get(key)?.off();
		segments.delete(key);
		drawn = drawn.filter((item) => item.key !== key);
	}

	// New data, or a segment shown or hidden, moves every arc from wherever it is on screen, keeping its velocity if it was already moving.
	function syncArcs(instant: boolean) {
		const order = drawn;
		const goal = layout(slices, hidden);
		targets = goal;
		const first = segments.size === 0;
		const closedAt = (index: number) => {
			const before = order
				.slice(0, index)
				.reverse()
				.find((item) => goal.has(item.key));
			return before ? goal.get(before.key)!.end : 0;
		};
		order.forEach((item, index) => {
			const leaving = !goal.has(item.key);
			const to = goal.get(item.key) ?? { start: closedAt(index), end: closedAt(index) };
			let segment = segments.get(item.key);
			if (!segment) {
				// A new segment opens from the edge of the one before it, as it is right now.
				const prior = order
					.slice(0, index)
					.reverse()
					.map((entry) => segments.get(entry.key))
					.find(Boolean);
				segment = createSegment(first ? 0 : (prior?.end.get() ?? 0));
				segments.set(item.key, segment);
			}
			if (instant) {
				segment.start.jump(to.start);
				segment.end.jump(to.end);
				if (leaving) dropSegment(item.key);
				return;
			}
			if (first) {
				// One sweep: every segment leaves the top together, and each trailing edge follows a beat behind the one before.
				animate(segment.start, to.start, reveal);
				animate(segment.end, to.end, { ...reveal, delay: REVEAL_LEAD + index * stagger.item });
				return;
			}
			animate(segment.start, to.start, settle);
			animate(segment.end, to.end, {
				...settle,
				onComplete: leaving ? () => dropSegment(item.key) : undefined
			});
		});
		schedulePaint();
	}

	$effect(() => {
		void signature;
		const instant = reduced;
		if (!shown) return;
		untrack(() => syncArcs(instant));
	});

	// The active segment slides out along its middle and thickens a little; the one it replaces settles back at the same time.
	function liftSegments(activeKey: string | null, instant: boolean) {
		for (const [key, segment] of segments) {
			const to = key === activeKey ? 1 : 0;
			if (instant) segment.lift.jump(to);
			else if (segment.lift.get() !== to || segment.lift.isAnimating())
				animate(segment.lift, to, pop);
		}
	}

	$effect(() => {
		const liftedKey = current;
		const instant = reduced;
		void [drawn, shown];
		untrack(() => liftSegments(liftedKey, instant));
	});

	/** The segment under the pointer: null off the ring, undefined in a gap so crossing it never drops the hover. */
	function segmentAt(event: { clientX: number; clientY: number }) {
		const { center, inner } = geometry;
		const box = svg?.getBoundingClientRect();
		if (!box || !box.width) return undefined;
		const scale = size / box.width;
		const x = (event.clientX - box.left) * scale - center;
		const y = (event.clientY - box.top) * scale - center;
		const radius = Math.hypot(x, y);
		if (radius < inner - HOLE_HIT_SLOP || radius > center) return null;
		let turn = (Math.atan2(y, x) + Math.PI / 2) / TAU;
		if (turn < 0) turn += 1;
		for (const [key, arc] of targets)
			if (
				arc.end > arc.start &&
				turn >= arc.start &&
				turn < arc.end &&
				visible.some((item) => item.key === key)
			)
				return key;
		return undefined;
	}

	// One pointer handler for the whole ring: the angle picks the segment.
	function onRingMove(event: PointerEvent) {
		if (event.pointerType !== 'mouse') return;
		const key = segmentAt(event);
		if (key !== undefined && key !== preview) preview = key;
	}

	function onRingClick(event: MouseEvent) {
		const key = segmentAt(event);
		if (key) select(activeKey === key ? null : key);
	}

	const format = (value: number) => `${formatValue(value)}${suffix}`;
	const describe = (item: Slice) =>
		`${item.label}, ${format(item.value)}, ${shareText(item.value / (total || 1))}${item.members ? `. Includes ${item.members.map((member) => member.label).join(', ')}` : ''}`;

	// Arrow keys walk the segments, in the legend or on the ring itself when there is no legend.
	const rows: HTMLButtonElement[] = $state([]);
	function step(key: string, index: number, count: number): number | undefined {
		const moves: Record<string, number> = {
			ArrowDown: index + 1,
			ArrowRight: index + 1,
			ArrowUp: index - 1,
			ArrowLeft: index - 1,
			Home: 0,
			End: count - 1
		};
		return moves[key];
	}

	function onLegendKey(event: KeyboardEvent, index: number) {
		if (event.key === 'Escape' && activeKey) {
			event.preventDefault();
			select(null);
			return;
		}
		const next = step(event.key, index, slices.length);
		if (next === undefined) return;
		event.preventDefault();
		rows[(next + slices.length) % slices.length]?.focus();
	}

	function onRingKey(event: KeyboardEvent) {
		if (!visible.length) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			preview = null;
			if (activeKey) select(null);
			return;
		}
		if ((event.key === 'Enter' || event.key === ' ') && current) {
			event.preventDefault();
			select(activeKey === current ? null : current);
			return;
		}
		const index = visible.findIndex((item) => item.key === current);
		const backwards = event.key.endsWith('Up') || event.key.endsWith('Left');
		const next = step(event.key, index < 0 ? (backwards ? 0 : -1) : index, visible.length);
		if (next === undefined) return;
		event.preventDefault();
		const item = visible[(next + visible.length) % visible.length];
		preview = item.key;
		announcement = describe(item);
	}

	function onLegendBlur(event: FocusEvent & { currentTarget: HTMLButtonElement }) {
		const staysInLegend =
			event.relatedTarget instanceof Node &&
			event.currentTarget.closest('ul')?.contains(event.relatedTarget);
		if (!staysInLegend) preview = null;
	}

	function onRowClick(key: string) {
		if (legendAction === 'toggle') toggleHidden(key);
		else select(activeKey === key ? null : key);
	}

	// One readout per segment plus the total; the active one rolls in from the side it sits on, so moving clockwise rolls the drum forward.
	const identity = $derived(activeSlice ? activeSlice.key : total ? TOTAL_KEY : EMPTY_KEY);
	const readouts = $derived([
		{
			key: TOTAL_KEY,
			label: total ? totalLabel : emptyLabel,
			value: total,
			meta: null as Slice | null
		},
		...slices.map((item) => ({
			key: item.key,
			label: item.label,
			value: item.value,
			meta: item as Slice | null
		}))
	]);
	const activeIndex = $derived(
		Math.max(
			0,
			readouts.findIndex((item) => item.key === (identity === EMPTY_KEY ? TOTAL_KEY : identity))
		)
	);

	const placedReadouts = new WeakSet<Element>();
	const rollDrum =
		(place: number): Attachment<HTMLElement> =>
		(node) => {
			const instant = reduced || !placedReadouts.has(node);
			placedReadouts.add(node);
			animate(
				node,
				{ opacity: place === 0 ? 1 : 0, y: `${DRUM_OFFSET_EM * Math.sign(place)}em` },
				instant ? { duration: 0 } : place === 0 ? drumIn : drumOut
			);
		};

	const summary = $derived(
		total
			? `${label}. ${totalLabel} ${format(total)}. ${visible.map(describe).join('. ')}.`
			: `${label}. ${emptyLabel}.`
	);
	const ringLabel = $derived(`${label}. Use the arrow keys to read each segment.`);
	const tableRows = $derived(
		visible.flatMap((item) =>
			item.members
				? item.members.map((member) => ({
						key: member.key,
						label: `${member.label} (${otherLabel})`,
						value: member.value
					}))
				: [item]
		)
	);
</script>

<figure
	bind:this={ref}
	{@attach (node) => onceInView(node, IN_VIEW_AMOUNT, () => (seen = true))}
	class={['figure', className]}
	{...rest}
	aria-label={label}
	data-legend={legend || undefined}
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="donut"
		style:width="{size}px"
		style:--inner="{((geometry.inner * 2) / size) * 100}%"
		tabindex={legend ? undefined : 0}
		role={legend ? undefined : 'group'}
		aria-label={legend ? undefined : ringLabel}
		onkeydown={legend ? undefined : onRingKey}
		onblur={legend ? undefined : () => (preview = null)}
	>
		<!-- The legend (or the focusable ring) is the keyboard path; the SVG is decoration for pointers. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<svg
			bind:this={svg}
			class="svg"
			viewBox="0 0 {size} {size}"
			aria-hidden="true"
			focusable="false"
			onpointermove={onRingMove}
			onpointerleave={() => (preview = null)}
			onclick={onRingClick}
			data-hovering={current !== null || undefined}
		>
			<circle
				class="track"
				cx={geometry.center}
				cy={geometry.center}
				r={(geometry.outer + geometry.inner) / 2}
				stroke-width={geometry.outer - geometry.inner}
				data-idle={!shown || !total || undefined}
			/>
			{#each drawn as item (item.key)}
				<path
					{@attach registerPath(item.key)}
					class="segment"
					data-active={item.key === current || undefined}
					data-dim={(current !== null && item.key !== current) || undefined}
					style:--slice={colorFor(item)}
				/>
			{/each}
		</svg>
		<div class="center" aria-hidden="true">
			{#each readouts as item, index (item.key)}
				<span class="readout" {@attach rollDrum(index - activeIndex)}>
					<span class="center-label">{item.label}</span>
					<span class="center-value">
						{#if item.value || item.meta}<Count
								value={item.value}
								format={formatValue}
							/>{:else}{' '}{/if}
					</span>
					<span class="center-meta">
						{#if item.meta}
							<Count
								value={total && !hidden.has(item.key) ? item.value / total : 0}
								format={shareText}
							/> of {totalLabel.toLowerCase()}
						{:else}
							{unit || ' '}
						{/if}
					</span>
				</span>
			{/each}
		</div>
	</div>
	{#if legend && slices.length > 0}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<ul
			class="legend"
			aria-label="{label}, segments{legendAction === 'toggle'
				? '. Press a segment to show or hide it'
				: ''}"
			id={legendId}
			onpointerleave={() => (preview = null)}
		>
			{#each slices as item, index (item.key)}
				{@const off = hidden.has(item.key)}
				{@const members = memberSummary(item)}
				<li>
					<button
						bind:this={rows[index]}
						type="button"
						class="row"
						aria-pressed={legendAction === 'toggle' ? !off : activeKey === item.key}
						aria-label={off ? `${item.label}, hidden` : describe(item)}
						data-active={item.key === current || undefined}
						data-pinned={activeKey === item.key || undefined}
						data-hidden={off || undefined}
						style:--slice={colorFor(item)}
						onclick={() => onRowClick(item.key)}
						onpointerenter={(event) => {
							if (event.pointerType === 'mouse') preview = off ? null : item.key;
						}}
						onfocus={(event) => {
							if (isKeyboardFocus(event.currentTarget)) preview = off ? null : item.key;
						}}
						onblur={onLegendBlur}
						onkeydown={(event) => onLegendKey(event, index)}
					>
						<span class="dot" aria-hidden="true"></span>
						<span class="row-text">
							<span class="row-label">{item.label}</span>
							{#if members}<span class="row-members">{members}</span>{/if}
						</span>
						<span class="row-value" aria-hidden="true"
							><Count value={item.value} format={formatValue} /></span
						>
						<span class="row-share" aria-hidden="true">
							<Count value={off || !total ? 0 : item.value / total} format={shareText} />
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="sr-only">{summary}</p>
	<p class="sr-only" aria-live="polite">{announcement}</p>
	{#if total > 0}
		<table class="sr-only">
			<caption>{label}</caption>
			<thead>
				<tr><th scope="col">Segment</th><th scope="col">Value</th><th scope="col">Share</th></tr>
			</thead>
			<tbody>
				{#each tableRows as item (item.key)}
					<tr>
						<th scope="row">{item.label}</th>
						<td>{format(item.value)}</td>
						<td>{shareText(item.value / total)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</figure>

<style>
	/* The ring sits beside its legend when there is room, and above it on a phone. */
	.figure {
		container-type: inline-size;
		display: grid;
		min-width: 0;
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	.figure > :global(*) {
		min-width: 0;
	}
	.figure[data-legend] {
		gap: var(--arc-space-6);
	}
	@container (min-width: 460px) {
		.figure[data-legend] {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: center;
			gap: var(--arc-space-8);
		}
	}

	.donut {
		position: relative;
		max-width: 100%;
		aspect-ratio: 1;
		justify-self: center;
		-webkit-tap-highlight-color: transparent;
	}
	.donut:focus-visible {
		border-radius: 50%;
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		cursor: default;
	}
	.svg[data-hovering] {
		cursor: pointer;
	}
	/* The track shows only before the first sweep and when there is nothing to draw, so the gaps between segments stay the page colour. */
	.track {
		fill: none;
		stroke: var(--arc-surface-muted);
		transition: opacity var(--arc-duration-considered, 0.48s) var(--arc-ease-standard);
		opacity: 0;
	}
	.track[data-idle] {
		opacity: 1;
	}
	/* Shapes are written every frame from script; only colour and dimming ease here, on the compositor. */
	.segment {
		fill: var(--slice);
		shape-rendering: geometricPrecision;
		transition:
			fill var(--arc-duration-standard) var(--arc-ease-standard),
			opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.segment[data-dim] {
		opacity: 0.45;
	}

	/* The centre reads the active segment, or the total at rest. Old and new readouts share one grid cell, so a swap never moves or resizes anything. */
	.center {
		position: absolute;
		top: 50%;
		left: 50%;
		display: grid;
		width: calc(var(--inner) - 16px);
		transform: translate(-50%, -50%);
		pointer-events: none;
	}
	.readout {
		grid-area: 1 / 1;
		display: grid;
		min-width: 0;
		justify-items: center;
		gap: 2px;
		text-align: center;
	}
	.center-label,
	.center-meta {
		display: block;
		width: 100%;
		min-height: calc(1em * var(--arc-leading-body));
		overflow: hidden;
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.center-label {
		color: var(--arc-text-secondary);
	}
	.center-meta {
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.center-value {
		display: block;
		max-width: 100%;
		min-height: calc(1em * var(--arc-leading-display));
		overflow: hidden;
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-2xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
		line-height: var(--arc-leading-display);
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Legend rows mirror the segments: hovering either lights both. */
	.legend {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: grid;
		width: 100%;
		min-height: 40px;
		grid-template-columns: 10px minmax(0, 1fr) auto 3.25em;
		align-items: center;
		column-gap: 10px;
		padding: 6px 10px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--arc-foreground);
		cursor: pointer;
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: 1.3;
		text-align: left;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.row:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.row:active {
		transform: scale(0.985);
	}
	.row[data-active],
	.row[data-pinned] {
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--slice);
		box-shadow: inset 0 0 0 1.5px var(--slice);
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* A hidden segment keeps its row: the dot empties to a ring and the text quiets, so it can be shown again. */
	.row[data-hidden] .dot {
		background: transparent;
	}
	.row[data-hidden] .row-label,
	.row[data-hidden] .row-value,
	.row[data-hidden] .row-share {
		color: var(--arc-text-muted);
	}
	.row-label,
	.row-value,
	.row-share {
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.row-text {
		display: grid;
		min-width: 0;
	}
	.row-label,
	.row-members {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-members {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.row-value {
		justify-self: end;
		color: var(--arc-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.row-share {
		justify-self: end;
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	@media (hover: hover) and (pointer: fine) {
		.row:hover {
			background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
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
		.segment,
		.track,
		.row,
		.dot,
		.row-label,
		.row-value,
		.row-share {
			transition: none;
		}
	}
</style>
