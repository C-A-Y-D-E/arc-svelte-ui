<script module lang="ts">
	import type { Snippet } from 'svelte';

	export interface TreeNode {
		id: string;
		label: string;
		children?: TreeNode[];
		icon?: Snippet;
	}

	type VisibleNode = {
		node: TreeNode;
		depth: number;
		parentId?: string;
		position: number;
		setSize: number;
	};

	function flatten(
		nodes: TreeNode[],
		expanded: ReadonlySet<string>,
		depth = 1,
		parentId?: string
	): VisibleNode[] {
		return nodes.flatMap((node, index) => [
			{ node, depth, parentId, position: index + 1, setSize: nodes.length },
			...(node.children && expanded.has(node.id)
				? flatten(node.children, expanded, depth + 1, node.id)
				: [])
		]);
	}

	const FILE_TONES: [extensions: string[], tone: string][] = [
		[['.tsx', '.ts'], 'typescript'],
		[['.css'], 'stylesheet'],
		[['.md'], 'markdown'],
		[['.json'], 'json']
	];

	function fileTone(label: string) {
		const name = label.toLowerCase();
		const match = FILE_TONES.find(([extensions]) => extensions.some((ext) => name.endsWith(ext)));
		return match?.[1] ?? 'file';
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { TransitionConfig } from 'svelte/transition';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FileIcon from '@lucide/svelte/icons/file';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import { springEasing, springPop } from '../copy-button';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';

	/** What a drag would do to a row: drop inside it, above it, below it, or nothing (an invalid target). */
	export type TreeDropState = 'inside' | 'before' | 'after' | 'invalid';

	type RowAttributes = HTMLAttributes<HTMLDivElement> & { 'data-drop'?: TreeDropState };

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onselect'> & {
		nodes: TreeNode[];
		defaultExpandedIds?: string[];
		expandedIds?: string[];
		onExpandedChange?: (expandedIds: string[]) => void;
		onSelect?: (node: TreeNode) => void;
		/** Controlled selection: the highlight follows it, including changes the tree did not make. */
		selectedId?: string | null;
		/** Icon for every row without its own `icon`; it replaces the folder and file glyphs. */
		icon?: Snippet<[TreeNode]>;
		/** Content at the row's end, outside the row button, so clicks in it never select or toggle. */
		trailing?: Snippet<[TreeNode]>;
		/** Attributes for a row's wrapper: drag and drop handlers, and `data-drop` for the drop styling. */
		rowAttrs?: (node: TreeNode) => RowAttributes;
		/** No border, background or outer padding, for a tree that fills a card that is already the surface. */
		flush?: boolean;
		/**
		 * Not in Arc: `end` puts the expand chevron after the label, only on rows that have
		 * children, so no row keeps an empty chevron slot and icons sit at the row's inner edge.
		 */
		disclosure?: 'start' | 'end';
	};

	let {
		nodes,
		defaultExpandedIds = [],
		expandedIds = $bindable(defaultExpandedIds),
		onExpandedChange,
		onSelect,
		selectedId,
		icon,
		trailing,
		rowAttrs,
		flush = false,
		disclosure = 'start',
		'aria-label': ariaLabel = 'File tree',
		class: className,
		...rest
	}: Props = $props();

	/** A row is 36px plus the 2px gap above it; both collapse together, so nothing snaps when a row leaves. */
	const ROW_HEIGHT = 38;
	const ENTER_OFFSET_X = -6;
	const EXIT_OFFSET_X = -4;
	const MAX_STAGGERED_ROWS = 7;
	const MS_PER_SECOND = 1000;
	const smooth = springEasing(motionTokens.spring.smooth);
	const { duration, stagger } = motionTokens;

	const reduced = $derived(isReducedMotion());
	const expanded = $derived(new Set(expandedIds));
	const visible = $derived(flatten(nodes, expanded));

	let focusedId = $state<string | null>(null);
	let internalSelectedId = $state<string | null>(null);
	/** The folder that opened last; its new children fade in one after another, then everything else stays still. */
	let openedId = $state<string | null>(null);

	const focusableId = $derived(
		visible.some(({ node }) => node.id === focusedId) ? focusedId : (visible[0]?.node.id ?? null)
	);
	const activeId = $derived(selectedId === undefined ? internalSelectedId : selectedId);
	const openedIndex = $derived(visible.findIndex(({ node }) => node.id === openedId));

	const rowButtons = new Map<string, HTMLButtonElement>();
	let treeElement: HTMLDivElement;
	/** Where the selection sat before it moved, so the new one can glide from there like a shared layout. */
	let previousSelectionRect: DOMRect | null = null;

	function hasChildren(node: TreeNode) {
		return Boolean(node.children?.length);
	}

	function setExpanded(next: Set<string>) {
		expandedIds = [...next];
		onExpandedChange?.([...next]);
	}

	function toggle(node: TreeNode) {
		if (!hasChildren(node)) return;
		const next = new Set(expanded);
		if (next.has(node.id)) next.delete(node.id);
		else {
			next.add(node.id);
			openedId = node.id;
		}
		setExpanded(next);
	}

	function focus(id: string) {
		focusedId = id;
		const row = rowButtons.get(id);
		if (row) row.focus();
		else requestAnimationFrame(() => rowButtons.get(id)?.focus());
	}

	function select(node: TreeNode) {
		internalSelectedId = node.id;
		onSelect?.(node);
	}

	/** Runs before the DOM follows a selection change, so the old highlight can still be measured. */
	$effect.pre(() => {
		void activeId;
		previousSelectionRect =
			treeElement?.querySelector('.selection')?.getBoundingClientRect() ?? null;
	});

	function activate(node: TreeNode) {
		focusedId = node.id;
		select(node);
		toggle(node);
	}

	const KEY_ACTIONS: Record<string, (item: VisibleNode, index: number) => void> = {
		ArrowDown: (_, index) => focus(visible[Math.min(index + 1, visible.length - 1)].node.id),
		ArrowUp: (_, index) => focus(visible[Math.max(index - 1, 0)].node.id),
		Home: () => focus(visible[0].node.id),
		End: () => focus(visible[visible.length - 1].node.id),
		ArrowRight: ({ node }, index) => {
			if (!expanded.has(node.id)) toggle(node);
			else if (visible[index + 1]?.parentId === node.id) focus(visible[index + 1].node.id);
		},
		ArrowLeft: (item) => {
			if (hasChildren(item.node) && expanded.has(item.node.id)) toggle(item.node);
			else if (item.parentId) focus(item.parentId);
		},
		Enter: ({ node }) => {
			select(node);
			toggle(node);
		}
	};
	KEY_ACTIONS[' '] = KEY_ACTIONS.Enter;

	function onKeyDown(event: KeyboardEvent, item: VisibleNode, index: number) {
		if (event.key === 'ArrowRight' && !hasChildren(item.node)) return;
		const action = KEY_ACTIONS[event.key];
		if (!action) return;
		event.preventDefault();
		action(item, index);
	}

	/** Only rows that mount use this delay: the space opens in one motion and the new children follow in order. */
	function staggerDelay(index: number) {
		if (openedIndex < 0 || index <= openedIndex) return 0;
		return Math.min(index - openedIndex - 1, MAX_STAGGERED_ROWS) * stagger.item;
	}

	function clamp01(progress: number) {
		return Math.min(1, Math.max(0, progress));
	}

	function rowIn(_node: Element, delay: number): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		const total = delay + smooth.duration;
		return {
			duration: total * MS_PER_SECOND,
			css: (t) => {
				const elapsed = t * total;
				const height = smooth.easing(clamp01(elapsed / smooth.duration));
				const fade = ease.enter(clamp01((elapsed - delay) / duration.fast));
				const slide = smooth.easing(clamp01((elapsed - delay) / smooth.duration));
				return `overflow:hidden;height:${ROW_HEIGHT * height}px;opacity:${fade};transform:translateX(${ENTER_OFFSET_X * (1 - slide)}px)`;
			}
		};
	}

	function rowOut(_node: Element): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		return {
			duration: smooth.duration * MS_PER_SECOND,
			css: (t) => {
				const elapsed = (1 - t) * smooth.duration;
				const height = 1 - smooth.easing(elapsed / smooth.duration);
				const fade = 1 - ease.standard(clamp01(elapsed / duration.instant));
				return `overflow:hidden;pointer-events:none;height:${ROW_HEIGHT * height}px;opacity:${fade};transform:translateX(${EXIT_OFFSET_X * (1 - fade)}px)`;
			}
		};
	}

	/** Rows present on the first render are already in place; later rows draw their branch line down after the row opens. */
	let settled = false;
	$effect(() => {
		settled = true;
	});

	const drawnBranches = new WeakSet<Element>();

	/** Runs once per line: later stagger changes re-create the attachment but must not redraw it. */
	function drawBranch(delay: number) {
		return (line: HTMLElement) => {
			if (drawnBranches.has(line)) return;
			drawnBranches.add(line);
			if (!settled || isReducedMotion()) return;
			animate(
				line,
				{ opacity: [0, 1], scaleY: [0, 1] },
				{ duration: duration.standard, ease: motionTokens.ease.enter, delay }
			);
		};
	}

	function glideSelection(highlight: HTMLElement) {
		const from = previousSelectionRect;
		previousSelectionRect = null;
		if (!from || isReducedMotion()) return;
		const to = highlight.getBoundingClientRect();
		animate(
			highlight,
			{
				x: [from.left - to.left, 0],
				y: [from.top - to.top, 0],
				scaleX: [from.width / to.width, 1],
				scaleY: [from.height / to.height, 1]
			},
			motionTokens.spring.morph
		);
	}

	const turnedDisclosures = new WeakSet<Element>();

	function turnDisclosure(degrees: number) {
		return (disclosure: HTMLElement) => {
			const instant = isReducedMotion() || !turnedDisclosures.has(disclosure);
			turnedDisclosures.add(disclosure);
			animate(
				disclosure,
				{ rotate: degrees },
				instant ? { duration: 0 } : motionTokens.spring.snappy
			);
		};
	}

	function registerButton(id: string) {
		return (button: HTMLButtonElement) => {
			rowButtons.set(id, button);
			return () => rowButtons.delete(id);
		};
	}
</script>

<div
	bind:this={treeElement}
	class={['tree', flush && 'flush', disclosure === 'end' && 'disclosure-end', className]}
	role="tree"
	aria-label={ariaLabel}
	aria-multiselectable="false"
	{...rest}
>
	{#each visible as item, index (item.node.id)}
		{@const folder = hasChildren(item.node)}
		{@const isExpanded = folder && expanded.has(item.node.id)}
		{@const isSelected = activeId === item.node.id}
		{@const delay = staggerDelay(index)}
		{@const customIcon = item.node.icon ?? icon}
		<div class="row group/tree-row" {...rowAttrs?.(item.node)} in:rowIn={delay} out:rowOut>
			<button
				{@attach registerButton(item.node.id)}
				type="button"
				class={['item', trailing && 'has-trailing']}
				role="treeitem"
				aria-level={item.depth}
				aria-posinset={item.position}
				aria-setsize={item.setSize}
				aria-expanded={folder ? isExpanded : undefined}
				aria-selected={isSelected}
				tabindex={focusableId === item.node.id ? 0 : -1}
				style:--tree-depth={item.depth}
				onfocus={() => (focusedId = item.node.id)}
				onkeydown={(event) => onKeyDown(event, item, index)}
				onclick={() => activate(item.node)}
			>
				{#if isSelected}
					<span class="selection" aria-hidden="true" {@attach glideSelection}></span>
				{/if}
				{#if item.depth > 1}
					<span class="branch" aria-hidden="true" {@attach drawBranch(delay)}></span>
				{/if}
				{#if disclosure === 'start'}
					<span class="disclosure" aria-hidden="true" {@attach turnDisclosure(isExpanded ? 90 : 0)}>
						{#if folder}<ChevronRightIcon size={14} strokeWidth={1.9} />{/if}
					</span>
				{/if}
				<span
					class={['icon', folder || customIcon ? 'folder' : fileTone(item.node.label)]}
					aria-hidden="true"
				>
					{#if item.node.icon}
						{@render item.node.icon()}
					{:else if icon}
						{@render icon(item.node)}
					{:else if folder}
						{#key isExpanded}
							<span
								class="folder-glyph"
								in:springPop
								out:presence={{
									scale: 0.6,
									blur: motionTokens.blur.subtle,
									duration: duration.instant,
									easing: ease.standard
								}}
							>
								{#if isExpanded}
									<FolderOpenIcon size={16} strokeWidth={1.7} />
								{:else}
									<FolderIcon size={16} strokeWidth={1.7} />
								{/if}
							</span>
						{/key}
					{:else}
						<FileIcon size={16} strokeWidth={1.7} />
					{/if}
				</span>
				<span class="label">{item.node.label}</span>
				{#if disclosure === 'end' && folder}
					<span class="disclosure" aria-hidden="true" {@attach turnDisclosure(isExpanded ? 90 : 0)}>
						<ChevronRightIcon size={14} strokeWidth={1.9} />
					</span>
				{/if}
			</button>
			{#if trailing}
				<div class="trailing">{@render trailing(item.node)}</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.tree {
		display: block;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 6px 8px 8px;
		border: 1px solid var(--arc-border);
		border-radius: 16px;
		background: var(--arc-surface);
		color: var(--arc-foreground);
		overflow: hidden;
	}
	.tree.flush {
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}
	/* Rows clip only while their height animates, so the selection can glide between them unclipped. */
	.row {
		position: relative;
		display: flow-root;
		min-width: 0;
		height: 38px;
	}
	.item {
		position: relative;
		display: flex;
		width: 100%;
		min-width: 0;
		height: 36px;
		margin-top: 2px;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		padding-left: calc(10px + (var(--tree-depth) - 1) * 18px);
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--arc-text-secondary);
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: 1;
		text-align: left;
		cursor: pointer;
		outline: none;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* Selection changes color only; a heavier weight would reflow the label. */
	.item[aria-selected='true'] {
		color: var(--arc-foreground);
	}
	/* One ring drawn inside the row, so it clears the tree's clipped edge; the global button outline would add a second ring outside it. */
	.item:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.selection {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: 10px;
		background: var(--arc-surface-muted);
		transform-origin: 0 0;
	}
	.branch {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: calc(16.5px + (var(--tree-depth) - 2) * 18px);
		z-index: 1;
		width: 1px;
		background: var(--arc-border);
		transform-origin: top;
		pointer-events: none;
	}
	.disclosure,
	.icon,
	.label {
		position: relative;
		z-index: 1;
	}
	.disclosure {
		display: grid;
		width: 14px;
		height: 16px;
		flex: 0 0 14px;
		place-items: center;
		color: var(--arc-text-muted);
	}
	.icon {
		display: grid;
		width: 16px;
		height: 16px;
		flex: 0 0 16px;
		place-items: center;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.folder {
		color: var(--arc-text-secondary);
	}
	.item[aria-expanded='true'] .folder,
	.item[aria-selected='true'] .folder {
		color: var(--arc-foreground);
	}
	.folder-glyph {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.typescript {
		color: color-mix(in oklab, #3178c6 78%, var(--arc-foreground));
	}
	.stylesheet {
		color: color-mix(in oklab, #8b6ace 73%, var(--arc-foreground));
	}
	.markdown {
		color: color-mix(in oklab, #38896b 74%, var(--arc-foreground));
	}
	.json {
		color: color-mix(in oklab, #c48637 78%, var(--arc-foreground));
	}
	/* Its own line height: the row sets 1, and the clipped box (needed for the ellipsis) would cut descenders like g. */
	.label {
		min-width: 0;
		overflow: hidden;
		line-height: 1.45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Chevron at the end: the label fills the row so the chevron sits by the trailing slot, the
	   trailing slot keeps the same inset as the row's left padding, and branch lines drop from the
	   parent's icon centre instead of its chevron. */
	.disclosure-end .label {
		flex: 1;
	}
	.disclosure-end .trailing {
		right: 10px;
	}
	.disclosure-end .branch {
		left: calc(18px + (var(--tree-depth) - 2) * 18px);
	}
	.item.has-trailing {
		padding-right: var(--tree-trailing-size, 56px);
	}
	.trailing {
		position: absolute;
		top: 2px;
		right: 6px;
		z-index: 2;
		display: flex;
		height: 36px;
		align-items: center;
		gap: 4px;
	}
	.row[data-drop='inside'] .item {
		background: var(--arc-accent-subtle);
		color: var(--arc-foreground);
	}
	.row[data-drop='invalid'] .item {
		background: color-mix(in oklab, var(--arc-danger) 12%, transparent);
		cursor: not-allowed;
	}
	.row[data-drop='before']::before,
	.row[data-drop='after']::before {
		content: '';
		position: absolute;
		right: 8px;
		left: 8px;
		z-index: 3;
		height: 2px;
		border-radius: 1px;
		background: var(--arc-accent);
		pointer-events: none;
	}
	.row[data-drop='before']::before {
		top: 0;
	}
	.row[data-drop='after']::before {
		bottom: 0;
	}
	@media (hover: hover) and (pointer: fine) {
		.item:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.item,
		.icon {
			transition: none;
		}
	}
</style>
