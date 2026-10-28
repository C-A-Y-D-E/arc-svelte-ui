<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		clamp,
		createTooltipGlide,
		mix,
		onceInView,
		physicalSpring
	} from '../brush-chart/chart-motion.svelte';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import {
		carry,
		flatten,
		isUnder,
		layoutFrom,
		type FlatNode,
		type Rect,
		type TreemapNode
	} from './layout';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
		/** The root. Its label names the whole in the first breadcrumb. */
		data: TreemapNode;
		/** What the whole is, such as "Revenue". Names the chart for assistive technology. */
		label: string;
		formatValue?: (value: number) => string;
		/** Names the shading measure in the tooltip and scale, such as "Growth". Tiles take the hue of their top level branch and grow deeper with the measure. Leave it out to draw every tile at one depth. */
		colorLabel?: string;
		formatColor?: (value: number) => string;
		/** Range of the color measure. Defaults to the range of the leaves. */
		colorDomain?: [number, number];
		/** Id of the node that fills the view. */
		focus?: string;
		defaultFocus?: string;
		onFocusChange?: (id: string) => void;
		/** Height of the tiles in pixels. */
		height?: number;
		emptyLabel?: string;
		ref?: HTMLElement | null;
	};

	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
	const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

	let {
		data,
		label,
		formatValue = (value) => grouped.format(value),
		colorLabel,
		formatColor = (value) => grouped.format(value),
		colorDomain,
		defaultFocus,
		focus = $bindable(defaultFocus ?? data.id),
		onFocusChange,
		height = 420,
		emptyLabel = 'No data yet',
		ref = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	type Drawn = Rect & { o: number };

	const { spring, blur, duration } = motionTokens;
	const zoom = physicalSpring({ visualDuration: 0.62, bounce: 0.06 });
	const reveal = physicalSpring({ visualDuration: 0.9, bounce: 0 });
	const TIP = 14;
	const STEPS = 5;
	const LIGHTEST_SHADE = 14;
	const SHADE_RANGE = 44;
	const FLAT_SHADE = 34;
	const glide = createTooltipGlide();

	/** Top level branches take the four series hues in order; a fifth and beyond stay neutral rather than reuse a hue. */
	const hueOf = (index: number) =>
		index < 0
			? 'var(--arc-series-1)'
			: index < 4
				? `var(--arc-series-${index + 1})`
				: 'var(--arc-foreground)';
	const stepShade = (step: number) =>
		Math.round(LIGHTEST_SHADE + (step / (STEPS - 1)) * SHADE_RANGE);

	let stage: HTMLDivElement;
	let tip: HTMLDivElement;
	let width = $state(0);
	let seen = $state(false);
	let active: string | null = $state(null);
	let pointer: { x: number; y: number } | null = $state(null);
	const tiles = new Map<string, HTMLDivElement>();

	const reduced = $derived(isReducedMotion());
	const signature = $derived(JSON.stringify(data));
	const flat = $derived.by(() => {
		void signature;
		return untrack(() => flatten(data));
	});
	const root = $derived(flat.get(data.id)!);
	const nodes = $derived([...flat.values()].filter((node) => node.depth > 0));
	const wanted = $derived(flat.get(focus));
	const center = $derived(wanted && wanted.children.length ? wanted : root);
	const view: Rect = $derived({ x: 0, y: 0, w: width, h: height });
	const target = $derived(layoutFrom(flat, center.id, view));

	function zoomTo(id: string) {
		focus = id;
		onFocusChange?.(id);
	}

	// Color scale: a few neutral steps from light to dark, so shade reads as more without adding a hue.
	const leaves = $derived(nodes.filter((node) => !node.children.length && node.color !== null));
	const domain = $derived.by((): [number, number] => {
		if (colorDomain) return colorDomain;
		if (!leaves.length) return [0, 1];
		const colors = leaves.map((node) => node.color!);
		return [Math.min(...colors), Math.max(...colors)];
	});
	const colored = $derived(colorLabel !== undefined && leaves.length > 0);
	function shade(value: number | null) {
		if (!colored || value === null) return FLAT_SHADE;
		const [lo, hi] = domain;
		const t = clamp((value - lo) / (hi - lo || 1), 0, 1);
		return stepShade(Math.round(t * (STEPS - 1)));
	}
	const branchOf = $derived.by(() => {
		const map = new Map<string, number>();
		root.children.forEach((id, index) => {
			const walk = (at: string) => {
				map.set(at, index);
				flat.get(at)?.children.forEach(walk);
			};
			walk(id);
		});
		return map;
	});
	const hueFor = (id: string) => hueOf(branchOf.get(id) ?? -1);

	// Every tile keeps its on screen rect; a spring carries it to the new layout. Tiles entering or leaving ride the same zoom as the tile they belong to.
	const drawn = new Map<string, Drawn>();
	const levels = new Map<string, number>();
	let lastFocus: { id: string; layout: Map<string, Rect> } | null = null;

	function paint() {
		for (const node of nodes) {
			const el = tiles.get(node.id);
			const d = drawn.get(node.id);
			if (!el) continue;
			if (!d || d.o < 0.01 || d.w < 0.5 || d.h < 0.5) {
				el.style.visibility = 'hidden';
				el.style.pointerEvents = 'none';
				continue;
			}
			el.style.visibility = 'visible';
			el.style.transform = `translate3d(${d.x.toFixed(2)}px, ${d.y.toFixed(2)}px, 0)`;
			el.style.width = `${d.w.toFixed(2)}px`;
			el.style.height = `${d.h.toFixed(2)}px`;
			el.style.opacity = d.o.toFixed(3);
			el.style.pointerEvents = d.o > 0.6 ? 'auto' : 'none';
			el.dataset.level = String(levels.get(node.id) ?? 0);
			el.dataset.room = d.w > 64 && d.h > 38 ? (d.h > 54 ? 'full' : 'name') : 'none';
		}
	}

	function transitionTo(layout: Map<string, Rect>, focusNode: FlatNode, instant: boolean) {
		const prev = lastFocus;
		const visible = (node: FlatNode) => {
			const level = node.depth - focusNode.depth;
			return level >= 1 && level <= 2 && isUnder(flat, node.id, focusNode.id);
		};
		const nextVisible = new Set(nodes.filter(visible).map((node) => node.id));
		const before = new Map(drawn);
		const wasVisible = new Set([...before].filter(([, d]) => d.o > 0.5).map(([id]) => id));
		// The pivot: the tile that grows to fill the view, or the view that shrinks back into its tile.
		let toOld: ((r: Rect) => Rect) | null = null;
		let toNew: ((r: Rect) => Rect) | null = null;
		if (prev && prev.id !== focusNode.id && before.size) {
			if (isUnder(flat, focusNode.id, prev.id)) {
				const inOld = prev.layout.get(focusNode.id);
				if (inOld) {
					toOld = (r) => carry(r, view, inOld);
					toNew = (r) => carry(r, inOld, view);
				}
			} else if (isUnder(flat, prev.id, focusNode.id)) {
				const inNew = layout.get(prev.id);
				if (inNew) {
					toOld = (r) => carry(r, inNew, view);
					toNew = (r) => carry(r, view, inNew);
				}
			}
		}
		const from = new Map<string, Drawn>();
		const to = new Map<string, Drawn>();
		const first = !before.size;
		for (const node of nodes) {
			const goal = layout.get(node.id);
			const now = before.get(node.id);
			if (nextVisible.has(node.id) && goal) {
				to.set(node.id, { ...goal, o: 1 });
				if (wasVisible.has(node.id) && now) from.set(node.id, now);
				else if (first)
					from.set(node.id, { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2, w: 0, h: 0, o: 0 });
				else from.set(node.id, { ...(toOld ? toOld(goal) : goal), o: 0 });
				levels.set(node.id, node.depth - focusNode.depth);
			} else if (wasVisible.has(node.id) && now) {
				from.set(node.id, now);
				to.set(node.id, { ...(toNew ? toNew(now) : now), o: 0 });
			}
		}
		for (const node of nodes)
			if (!from.has(node.id)) drawn.set(node.id, { x: 0, y: 0, w: 0, h: 0, o: 0 });
		lastFocus = { id: focusNode.id, layout };
		const finish = () => {
			for (const [id, d] of to) drawn.set(id, d);
			paint();
		};
		if (instant) {
			finish();
			return;
		}
		const area = view.w * view.h || 1;
		const controls = animate(0, 1, {
			...(first ? reveal : zoom),
			onUpdate: (t) => {
				for (const [id, a] of from) {
					const b = to.get(id)!;
					// On the first reveal, tiles grow in a quick wave from the largest.
					const lag = Math.min(0.3, (1 - (b.w * b.h) / area) * 0.3);
					const local = first ? clamp((t - lag) / 0.7, 0, 1) : t;
					drawn.set(id, {
						x: mix(a.x, b.x, local),
						y: mix(a.y, b.y, local),
						w: mix(a.w, b.w, local),
						h: mix(a.h, b.h, local),
						o: mix(a.o, b.o, local)
					});
				}
				paint();
			},
			onComplete: finish
		});
		return () => controls.stop();
	}

	const shown = $derived((seen || reduced) && width > 0);
	$effect(() => {
		if (!shown) return;
		const layout = target;
		const focusNode = center;
		const instant = reduced;
		return untrack(() => transitionTo(layout, focusNode, instant));
	});

	const activeNode = $derived(active ? (flat.get(active) ?? null) : null);
	const parentOf = (node: FlatNode) => (node.parent ? flat.get(node.parent)! : node);
	const share = (node: FlatNode, of: FlatNode) => (of.value ? node.value / of.value : 0);

	// Tooltip: trails the pointer, or sits by the tile in focus, and stays inside the chart.
	let wasOn = false;
	$effect(() => {
		if (!activeNode || !width) {
			wasOn = false;
			return;
		}
		const r = target.get(activeNode.id);
		const ax = pointer?.x ?? (r ? r.x + r.w / 2 : 0);
		const ay = pointer?.y ?? (r ? r.y + Math.min(r.h / 2, 28) : 0);
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;
		let left = ax + TIP;
		if (left + tw > width) left = ax - TIP - tw;
		let top = ay + TIP;
		if (top + th > height) top = ay - TIP - th;
		glide.place(
			clamp(left, 0, Math.max(0, width - tw)),
			clamp(top, 0, Math.max(0, height - th)),
			!wasOn || reduced
		);
		wasOn = true;
	});

	// Keyboard: arrows hop to the nearest tile in that direction on the top level, Enter zooms in, Escape zooms out.
	const topTiles = $derived(
		center.children.map((id) => flat.get(id)!).filter((node) => node.value > 0)
	);
	function topOf(node: FlatNode | null) {
		let at = node;
		while (at && at.parent && at.parent !== center.id) at = flat.get(at.parent) ?? null;
		return at && at.parent === center.id ? at : null;
	}
	const DIRECTIONS: Record<string, [number, number]> = {
		ArrowRight: [1, 0],
		ArrowLeft: [-1, 0],
		ArrowDown: [0, 1],
		ArrowUp: [0, -1]
	};
	function nearestInDirection(current: FlatNode, [dx, dy]: [number, number]) {
		const o = target.get(current.id)!;
		const ox = o.x + o.w / 2;
		const oy = o.y + o.h / 2;
		let best: FlatNode | null = null;
		let score = Infinity;
		for (const node of topTiles) {
			if (node.id === current.id) continue;
			const r = target.get(node.id);
			if (!r) continue;
			const vx = r.x + r.w / 2 - ox;
			const vy = r.y + r.h / 2 - oy;
			const along = vx * dx + vy * dy;
			const across = Math.abs(vx * dy - vy * dx);
			if (along <= 1) continue;
			const s = along + across * 1.5;
			if (s < score) {
				score = s;
				best = node;
			}
		}
		return best;
	}
	function onKeyDown(event: KeyboardEvent) {
		const current = topOf(activeNode);
		if (event.key in DIRECTIONS) {
			event.preventDefault();
			pointer = null;
			if (!current) {
				active = topTiles[0]?.id ?? null;
				return;
			}
			const best = nearestInDirection(current, DIRECTIONS[event.key]);
			if (best) active = best.id;
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			pointer = null;
			active = (event.key === 'Home' ? topTiles[0] : topTiles[topTiles.length - 1])?.id ?? null;
		} else if (event.key === 'Enter' || event.key === ' ') {
			if (current?.children.length) {
				event.preventDefault();
				zoomTo(current.id);
				active = current.children[0];
			}
		} else if (event.key === 'Escape' || event.key === 'Backspace') {
			if (center.parent) {
				event.preventDefault();
				const leaving = center.id;
				zoomTo(center.parent);
				active = leaving;
			} else if (active) {
				event.preventDefault();
				active = null;
			}
		}
	}
	function onTilePointerMove(event: PointerEvent, id: string) {
		event.stopPropagation();
		if (event.pointerType !== 'mouse') return;
		const rect = stage.getBoundingClientRect();
		pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		active = id;
	}
	function onTileClick(event: MouseEvent, node: FlatNode) {
		event.stopPropagation();
		const top = topOf(node);
		if (top?.children.length) zoomTo(top.id);
		else if (!activeNode || activeNode.id !== node.id) active = node.id;
	}
	function registerTile(id: string): Attachment<HTMLDivElement> {
		return (element) => {
			tiles.set(id, element);
			return () => tiles.delete(id);
		};
	}

	const trail = $derived.by(() => {
		const out: FlatNode[] = [];
		for (
			let at: FlatNode | undefined = center;
			at;
			at = at.parent ? flat.get(at.parent) : undefined
		)
			out.unshift(at);
		return out;
	});
	const empty = $derived(!root.value);
	const focusTop = $derived(topOf(activeNode));
	function describe(node: FlatNode) {
		const parent = parentOf(node);
		const measure =
			colored && node.color !== null ? `, ${colorLabel} ${formatColor(node.color)}` : '';
		return `${node.path.join(', ')}, ${formatValue(node.value)}, ${percent.format(share(node, parent))} of ${parent.label}${measure}`;
	}
	const scaleHue = $derived(center.depth === 0 ? 'var(--arc-foreground)' : hueFor(center.id));
	const totalText = $derived(formatValue(center.value));
	const crumbEnter = $derived({ x: -6, blur: blur.subtle, duration: spring.smooth.visualDuration });
</script>

<figure
	bind:this={ref}
	{@attach onceInView(0.25, () => (seen = true))}
	class={['figure', className]}
	aria-label={label}
	{...rest}
>
	<div class="bar">
		<nav class="crumbs" aria-label="{label} path">
			<ol class="crumb-list">
				{#each trail as node, index (node.id)}
					<li
						class="crumb"
						animate:flip={{
							duration: reduced ? 0 : spring.smooth.visualDuration * 1000,
							easing: ease.standard
						}}
						in:presence={crumbEnter}
						out:presence={{ x: -6, duration: duration.instant, pop: true }}
					>
						{#if index > 0}<span class="crumb-sep" aria-hidden="true">/</span>{/if}
						{#if index < trail.length - 1}
							<button
								type="button"
								class="crumb-button"
								onclick={() => {
									zoomTo(node.id);
									active = null;
								}}>{node.label}</button
							>
						{:else}
							<span class="crumb-current" aria-current="location">{node.label}</span>
						{/if}
					</li>
				{/each}
			</ol>
		</nav>
		<p class="total">
			{#key totalText}
				<span
					class="total-value"
					in:presence={{ y: 6, duration: duration.standard }}
					out:presence={{ y: -6, duration: duration.standard, pop: true }}>{totalText}</span
				>
			{/key}
		</p>
	</div>
	<!-- The chart is one focusable composite: arrow keys move the reading inside it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={stage}
		bind:clientWidth={width}
		class="stage"
		style:height="{height}px"
		data-active={activeNode ? true : undefined}
		role="group"
		tabindex={empty ? -1 : 0}
		aria-roledescription="treemap"
		aria-label="{label}, {center.label}. Arrow keys move between tiles, Enter zooms in, Escape zooms out."
		onkeydown={onKeyDown}
		onblur={() => (active = null)}
		onpointerleave={() => {
			active = null;
			pointer = null;
		}}
	>
		{#each nodes as node (node.id)}
			{@const top = topOf(node)}
			<!-- Tiles are pointer shortcuts; keyboard users move through them with the arrow keys on the group. -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				{@attach registerTile(node.id)}
				class="tile"
				data-branch={node.children.length > 0 || undefined}
				data-active={active === node.id || undefined}
				data-lineage={(focusTop?.id === node.id && active !== node.id) || undefined}
				data-dim={(focusTop !== null && top !== null && focusTop.id !== top.id) || undefined}
				style:--treemap-hue={hueFor(node.id)}
				style:--treemap-fill="color-mix(in oklch, {hueFor(node.id)}
				{shade(node.color)}%, var(--arc-surface))"
				style:z-index={node.depth}
				onpointermove={(event) => onTilePointerMove(event, node.id)}
				onclick={(event) => onTileClick(event, node)}
			>
				<span class="tile-label">{node.label}</span>
				<span class="tile-value">{formatValue(node.value)}</span>
			</div>
		{/each}
		{#if empty}<p class="message">{emptyLabel}</p>{/if}
		<div bind:this={tip} {@attach glide.attach} class="tooltip" aria-hidden="true">
			{#if activeNode}
				<p class="tip-title">{activeNode.path.slice(0, -1).join(' / ') || root.label}</p>
				<p class="tip-value">
					<span class="tip-name">{activeNode.label}</span>
					<span class="tip-amount">{formatValue(activeNode.value)}</span>
				</p>
				<p class="tip-note">
					{percent.format(share(activeNode, parentOf(activeNode)))} of {parentOf(activeNode).label}
				</p>
				{#if colored && activeNode.color !== null}
					<p class="tip-note">{colorLabel} {formatColor(activeNode.color)}</p>
				{/if}
			{/if}
		</div>
	</div>
	{#if colored}
		<div class="scale" aria-hidden="true">
			<span class="scale-label">{colorLabel}</span>
			<span>{formatColor(domain[0])}</span>
			<span class="steps">
				{#each Array.from({ length: STEPS }, (_, i) => i) as step (step)}
					<span
						class="step"
						style:--treemap-fill="color-mix(in oklch, {scaleHue}
						{stepShade(step)}%, var(--arc-surface))"
					></span>
				{/each}
			</span>
			<span>{formatColor(domain[1])}</span>
		</div>
	{/if}
	<p class="sr-only" aria-live="polite" aria-atomic="true">
		{activeNode ? describe(activeNode) : `${center.label}, ${formatValue(center.value)}`}
	</p>
	{#if !empty}
		<div class="sr-only">
			<table>
				<caption>{label}</caption>
				<thead>
					<tr>
						<th scope="col">Path</th>
						<th scope="col">Value</th>
						<th scope="col">Share of parent</th>
						{#if colored}<th scope="col">{colorLabel}</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each nodes as node (node.id)}
						<tr>
							<th scope="row">{node.path.join(' / ')}</th>
							<td>{formatValue(node.value)}</td>
							<td>{percent.format(share(node, parentOf(node)))}</td>
							{#if colored}<td>{node.color === null ? '' : formatColor(node.color)}</td>{/if}
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
		gap: var(--arc-space-3);
		margin: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	/* Breadcrumb on the left, the total of what fills the view on the right. */
	.bar {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
	}
	.crumbs {
		min-width: 0;
	}
	.crumb-list {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 32px;
		flex-wrap: wrap;
		align-items: center;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.crumb {
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}
	.crumb-sep {
		padding: 0 4px;
		color: var(--arc-border-strong);
		font-size: var(--arc-text-sm);
	}
	.crumb-button {
		min-height: 32px;
		padding: 0 6px;
		margin: 0 -2px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.crumb-button:active {
		transform: scale(0.97);
	}
	.crumb-button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 1px;
	}
	.crumb-current {
		padding: 0 4px;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		white-space: nowrap;
	}
	@media (hover: hover) and (pointer: fine) {
		.crumb-button:hover {
			background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
			color: var(--arc-foreground);
		}
	}
	.total {
		position: relative;
		display: inline-grid;
		flex: none;
		justify-items: end;
		overflow: hidden;
		margin: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	.total-value {
		display: block;
	}
	/* Tiles are absolutely placed and sized each frame, so text never scales while a tile grows or shrinks. */
	.stage {
		position: relative;
		min-width: 0;
		overflow: hidden;
		border-radius: 12px;
		outline: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.stage:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.tile {
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
		padding: 6px 8px;
		border-radius: 6px;
		background: var(--treemap-fill);
		color: var(--arc-foreground);
		cursor: pointer;
		visibility: hidden;
		will-change: transform, width, height;
		transition:
			background-color var(--arc-duration-considered) var(--arc-ease-standard),
			color var(--arc-duration-considered) var(--arc-ease-standard),
			filter var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.tile[data-branch][data-level='1'] {
		padding: 3px 8px;
		border-radius: 8px;
		background: color-mix(in oklch, var(--treemap-hue) 9%, var(--arc-surface));
		color: var(--arc-foreground);
		cursor: zoom-in;
	}
	.tile-label,
	.tile-value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--arc-text-xs);
		line-height: 16px;
		opacity: 0;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.tile-label {
		font-weight: 500;
	}
	.tile-value {
		opacity: 0;
		font-variant-numeric: tabular-nums;
	}
	.tile[data-room='name'] .tile-label,
	.tile[data-room='full'] .tile-label,
	.tile[data-room='full'] .tile-value {
		opacity: 1;
	}
	.tile[data-room='full'] .tile-value {
		opacity: 0.72;
	}
	/* A branch on the top level prints its name and total on one header line. */
	.tile[data-branch][data-level='1'] {
		flex-direction: row;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.tile[data-branch][data-level='1'] .tile-value {
		flex: none;
		opacity: 0.6;
	}
	.tile[data-branch][data-level='1'][data-room='none'] .tile-label,
	.tile[data-branch][data-level='1'][data-room='none'] .tile-value {
		opacity: 0;
	}
	.tile[data-branch][data-level='1'][data-room='name'] .tile-value {
		opacity: 0.6;
	}
	.tile[data-level='2'] {
		padding: 5px 7px;
	}
	.tile[data-active] {
		box-shadow: inset 0 0 0 2px var(--arc-foreground);
	}
	.tile[data-lineage] {
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--treemap-hue) 70%, transparent);
	}
	.stage[data-active] .tile[data-dim] {
		filter: opacity(0.5);
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
		z-index: 50;
		display: grid;
		min-width: 160px;
		max-width: min(240px, 100%);
		grid-template-columns: minmax(0, 1fr);
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
	.stage[data-active] .tooltip {
		opacity: 1;
		scale: 1;
	}
	.tip-title {
		margin: 0;
		overflow: hidden;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tip-value {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 0;
		font-size: var(--arc-text-sm);
		line-height: 1.35;
	}
	.tip-name {
		min-width: 0;
		overflow: hidden;
		color: var(--arc-foreground);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tip-amount {
		flex: none;
		color: var(--arc-foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.tip-note {
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		font-variant-numeric: tabular-nums;
	}
	/* The color scale: stepped swatches from light to dark, never a gradient. */
	.scale {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
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
		background: var(--treemap-fill);
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
		.tile,
		.tile-label,
		.tile-value,
		.tooltip,
		.crumb-button {
			transition: none;
		}
	}
</style>
