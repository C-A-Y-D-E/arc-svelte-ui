<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** One pane of a `ResizablePanels` group. */
	export type ResizablePanelProps = {
		/** Stable id, also used by the dividers' `aria-controls`. */
		id: string;
		/** Names the pane for its divider, for example "Folders". */
		label: string;
		/** Starting share of the group. Shares are relative, so they need not add up to 100. */
		defaultSize: number;
		/** Width in px where the pane starts to resist. Its content never reflows below it; it clips and fades instead. */
		minSize?: number;
		maxSize?: number;
		/** Dragging well past the minimum, or flicking toward the edge, snaps the pane closed. Its divider then shows a restore tab. */
		collapsible?: boolean;
		defaultCollapsed?: boolean;
		class?: string;
		children?: Snippet;
	};
</script>

<script lang="ts">
	import { DEFAULT_MIN, getPanelGroup, hasPanelGroup } from './panel-group.svelte';
	import ResizeHandle from './ResizeHandle.svelte';

	let {
		id,
		label,
		defaultSize,
		minSize,
		maxSize,
		collapsible,
		defaultCollapsed,
		class: className,
		children
	}: ResizablePanelProps = $props();

	const MIN_RATIO_DIGITS = 5;

	// Rendered on its own, outside a group, a pane shows its children unchanged.
	const group = hasPanelGroup() ? getPanelGroup() : null;
	const index =
		group?.register({
			get id() {
				return id;
			},
			get label() {
				return label;
			},
			get defaultSize() {
				return defaultSize;
			},
			get minSize() {
				return minSize;
			},
			get maxSize() {
				return maxSize;
			},
			get collapsible() {
				return collapsible;
			},
			get defaultCollapsed() {
				return defaultCollapsed;
			}
		}) ?? 0;
	const size = group?.sizes[index];
	// Widths are written straight to the DOM from here on, so only the first render sets them in the template.
	const initialGrow = Math.max(0, size?.get() ?? 0);
	const initialOpacity = group?.collapsed[index] ? 0 : 1;

	let pane = $state<HTMLDivElement>();
	let content = $state<HTMLDivElement>();

	const min = $derived(minSize ?? DEFAULT_MIN);
	const collapsed = $derived(group?.collapsed[index] ?? false);
	const anchor = $derived(index === 0 && (group?.count ?? 0) > 1 ? 'end' : 'start');
	// The group is a size container: below the sum of the minimums, each floor becomes its share of the room between the dividers.
	const panelMin = $derived.by(() => {
		const gaps = (group?.count ?? 1) - 1;
		const ratio = +(min / Math.max(1, group?.minTotal ?? min)).toFixed(MIN_RATIO_DIGITS);
		return `min(${min}px, (100cqw - ${gaps}px) * ${ratio})`;
	});

	$effect(() => {
		if (!group || !pane) return;
		group.panelNodes[index] = pane;
		return () => {
			group.panelNodes[index] = null;
		};
	});

	$effect(() => {
		const node = pane;
		return size?.on('change', (value) => {
			if (node) node.style.flexGrow = String(Math.max(0, value));
		});
	});

	// Content fades as a pane is squeezed below its minimum, so a collapsing pane dissolves rather than crushes.
	$effect(() => {
		const node = content;
		const floor = Math.max(1, group?.minOf(index) ?? DEFAULT_MIN);
		return size?.on('change', (value) => {
			if (node) node.style.opacity = String(Math.min(1, Math.max(0, value / floor)));
		});
	});
</script>

{#if group}
	{#if index > 0}
		<ResizeHandle {group} handle={index - 1} />
	{/if}
	<!-- The content stays anchored to the moving edge, so a closing pane slides away like a drawer instead of being crushed. -->
	<div
		bind:this={pane}
		{id}
		class={['panel', className]}
		style:flex-grow={initialGrow}
		style:--resizable-panel-min={panelMin}
		style:--resizable-panel-max={maxSize ? `${maxSize}px` : 'none'}
		data-collapsed={collapsed || undefined}
		data-free={group.free[index] || undefined}
		data-anchor={anchor}
	>
		<div bind:this={content} class="content" style:opacity={initialOpacity} inert={collapsed}>
			{@render children?.()}
		</div>
	</div>
{:else}
	{@render children?.()}
{/if}

<style>
	/* CSS enforces each pane's limits until an interaction frees it; JS hands them back once the pane settles inside them. */
	.panel {
		position: relative;
		display: flex;
		min-width: var(--resizable-panel-min);
		max-width: var(--resizable-panel-max);
		min-height: 0;
		flex: 0 1 0px;
		overflow: hidden;
	}
	.panel[data-anchor='end'] {
		justify-content: flex-end;
	}
	.panel[data-free],
	.panel[data-collapsed] {
		min-width: 0;
		max-width: none;
	}
	.content {
		display: flex;
		width: 100%;
		flex: none;
		flex-direction: column;
		min-height: 0;
	}
	.panel[data-free] .content,
	.panel[data-collapsed] .content {
		min-width: var(--resizable-panel-min);
	}
	/* Content ignores the pointer while a divider moves, so hover states never flicker underneath it. */
	:global([data-resizing]) > .panel > .content {
		pointer-events: none;
	}
</style>
