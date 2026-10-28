<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type ContextMenuItem = {
		id: string;
		label: string;
		icon?: Snippet;
		onSelect?: () => void;
		disabled?: boolean;
		destructive?: boolean;
		checked?: boolean;
	};
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { Portal } from 'bits-ui';
	import { motionTransition } from '../action-button/motion-transition';
	import { measureRow, moveHighlight, type Highlight } from '../dropdown-menu/highlight';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = {
		/** The target area. */
		children: Snippet;
		items: ContextMenuItem[];
		/** Accessible name for both the target and the menu. */
		label?: string;
	};

	let { children, items, label = 'Context menu' }: Props = $props();

	const MENU_WIDTH = 208;
	const MENU_MAX_HEIGHT = 300;
	const ROW_ESTIMATE_PX = 40;
	const MENU_PADDING_PX = 16;
	const VIEWPORT_MARGIN = 8;
	/** Click and keyboard open the menu just under the target's leading edge. */
	const TARGET_OFFSET = { x: 12, y: 8 };
	const HIGHLIGHT_GRACE_MS = 70;
	const ICON_PX = 15;
	const { duration, spring } = motionTokens;

	let open = $state(false);
	// Each open gets its own key, so reopening at a new point fades the old menu out in place
	// and grows a fresh one from the pointer instead of teleporting the visible menu.
	let point = $state({ x: 0, y: 0, originX: 0, originY: 0, key: 0 });
	let highlight = $state<Highlight & { index: number }>();
	let menuNode = $state<HTMLDivElement>();
	let highlightNode = $state<HTMLSpanElement>();
	let targetNode: HTMLDivElement;
	let pointer = false;
	let clearTimer = 0;
	// A primary press on the target while the menu is open closes it; the click that follows must not reopen it.
	let pressedWhileOpen = false;

	$effect(() => () => clearTimeout(clearTimer));

	$effect(() => {
		if (highlightNode) moveHighlight(highlightNode, highlight ?? null);
	});

	$effect(() => {
		if (!open || !menuNode) return;
		const menu = menuNode;
		void point.key;
		menu
			.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
			?.focus({ preventScroll: true });
		const closeOnPointerDown = (event: PointerEvent) => {
			if (!menu.contains(event.target as Node)) open = false;
		};
		const closeOnViewportChange = (event: Event) => {
			if (event.target instanceof Node && menu.contains(event.target)) return;
			open = false;
		};
		document.addEventListener('pointerdown', closeOnPointerDown);
		window.addEventListener('scroll', closeOnViewportChange, true);
		window.addEventListener('resize', closeOnViewportChange);
		return () => {
			document.removeEventListener('pointerdown', closeOnPointerDown);
			window.removeEventListener('scroll', closeOnViewportChange, true);
			window.removeEventListener('resize', closeOnViewportChange);
		};
	});

	const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

	function showMenu(x: number, y: number) {
		const menuHeight = Math.min(MENU_MAX_HEIGHT, items.length * ROW_ESTIMATE_PX + MENU_PADDING_PX);
		const left = clamp(x, VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
		const top = clamp(y, VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN);
		// The menu grows from the pointer, even when it is clamped away from a viewport edge.
		point = {
			x: left,
			y: top,
			originX: clamp(x - left, 0, MENU_WIDTH),
			originY: clamp(y - top, 0, menuHeight),
			key: point.key + 1
		};
		clearTimeout(clearTimer);
		pointer = false;
		highlight = undefined;
		open = true;
	}

	/**
	 * Not in Arc: opens the menu at a point, for a right-click on a larger area (a table row)
	 * that can't be the target itself because its own click does something else.
	 */
	export function openAt(x: number, y: number) {
		showMenu(x, y);
	}

	function showUnderTarget() {
		const rect = targetNode.getBoundingClientRect();
		showMenu(rect.left + TARGET_OFFSET.x, rect.bottom + TARGET_OFFSET.y);
	}

	function closeToTarget() {
		open = false;
		targetNode.focus();
	}

	function onTargetKeyDown(event: KeyboardEvent) {
		if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
		event.preventDefault();
		showUnderTarget();
	}

	function onTargetClick() {
		if (pressedWhileOpen) {
			pressedWhileOpen = false;
			return;
		}
		showUnderTarget();
	}

	function onTargetContextMenu(event: MouseEvent) {
		event.preventDefault();
		showMenu(event.clientX, event.clientY);
	}

	function nextPosition(key: string, current: number, count: number) {
		if (key === 'ArrowDown') return (current + 1) % count;
		if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count;
		if (key === 'Home') return 0;
		if (key === 'End') return count - 1;
		return undefined;
	}

	function onMenuKeyDown(event: KeyboardEvent & { currentTarget: HTMLDivElement }) {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeToTarget();
			return;
		}
		const enabled = items.flatMap((item, index) => (item.disabled ? [] : [index]));
		const current = document.activeElement?.getAttribute('data-index');
		const position = nextPosition(
			event.key,
			enabled.findIndex((index) => String(index) === current),
			enabled.length
		);
		if (position === undefined || !enabled.length) return;
		event.preventDefault();
		event.currentTarget.querySelector<HTMLElement>(`[data-index="${enabled[position]}"]`)?.focus();
	}

	function place(item: HTMLElement, glide: boolean) {
		clearTimeout(clearTimer);
		highlight = {
			...measureRow(item, glide && highlight !== undefined),
			index: Number(item.dataset.index)
		};
	}

	// Keyboard focus places the highlight instantly; the pointer makes it glide between rows.
	function onMenuFocus(event: FocusEvent) {
		const item =
			event.target instanceof HTMLElement
				? event.target.closest<HTMLElement>('[role="menuitem"]')
				: null;
		if (item) {
			// A pointer-opened menu focuses its first row without showing a highlight, like a native menu.
			if (!pointer && item.matches(':focus-visible')) place(item, false);
			return;
		}
		// A short grace period keeps the highlight gliding across the gap between rows.
		clearTimeout(clearTimer);
		clearTimer = window.setTimeout(() => (highlight = undefined), pointer ? HIGHLIGHT_GRACE_MS : 0);
	}

	function onItemPointerMove(
		event: PointerEvent & { currentTarget: HTMLButtonElement },
		index: number
	) {
		if (!open) return;
		clearTimeout(clearTimer);
		const row = event.currentTarget;
		if (document.activeElement !== row) row.focus({ preventScroll: true });
		if (highlight?.index !== index) place(row, true);
	}

	function select(item: ContextMenuItem) {
		if (!open) return;
		item.onSelect?.();
		closeToTarget();
	}

	function menuIn() {
		if (isReducedMotion())
			return { keyframes: { opacity: [0, 1] }, transition: { duration: duration.instant } };
		return {
			keyframes: { opacity: [0, 1], scale: [0.96, 1] },
			transition: {
				default: spring.snappy,
				opacity: { duration: duration.fast, ease: motionTokens.ease.enter }
			}
		};
	}

	function menuOut() {
		if (isReducedMotion()) return { keyframes: { opacity: 0 }, transition: { duration: 0.1 } };
		return {
			keyframes: { opacity: 0, scale: 0.98 },
			transition: { duration: 0.13, ease: motionTokens.ease.standard }
		};
	}
</script>

<div
	bind:this={targetNode}
	class="target"
	tabindex="0"
	role="button"
	aria-label={label}
	aria-haspopup="menu"
	aria-expanded={open}
	onpointerdown={(event) => (pressedWhileOpen = open && event.button === 0)}
	onclick={onTargetClick}
	oncontextmenu={onTargetContextMenu}
	onkeydown={onTargetKeyDown}
>
	{@render children()}
</div>

<Portal>
	{#if open}
		{#key point.key}
			<!-- An exiting menu keeps its last props, so its handlers check `open` before moving focus or selecting. -->
			<div
				bind:this={menuNode}
				class="menu"
				role="menu"
				aria-label={label}
				tabindex="-1"
				style:left="{point.x}px"
				style:top="{point.y}px"
				style:transform-origin="{point.originX}px {point.originY}px"
				onkeydown={onMenuKeyDown}
				onfocusin={onMenuFocus}
				onpointermovecapture={() => (pointer = true)}
				onkeydowncapture={() => (pointer = false)}
				onpointerleave={(event) => open && event.currentTarget.focus({ preventScroll: true })}
				in:motionTransition={menuIn()}
				out:motionTransition={menuOut()}
			>
				<span
					bind:this={highlightNode}
					class="highlight"
					data-tone={highlight?.tone}
					aria-hidden="true"
				></span>
				{#each items as item, index (item.id)}
					<button
						type="button"
						role="menuitem"
						tabindex="-1"
						data-index={index}
						data-tone={item.destructive ? 'danger' : undefined}
						style:--i={index}
						disabled={item.disabled}
						class={['item', item.destructive && 'destructive']}
						onpointermove={(event) => onItemPointerMove(event, index)}
						onpointerleave={() => open && menuNode?.focus({ preventScroll: true })}
						onclick={() => select(item)}
					>
						<span class="icon" aria-hidden="true">
							{#if item.icon}
								{@render item.icon()}
							{:else if item.checked}
								<CheckIcon size={ICON_PX} />
							{/if}
						</span>
						<span>{item.label}</span>
					</button>
				{/each}
			</div>
		{/key}
	{/if}
</Portal>

<style>
	.target {
		display: block;
		outline: none;
	}
	.target:focus-visible {
		border-radius: var(--arc-radius-control);
		outline: 3px solid var(--arc-focus-ring);
		outline-offset: 4px;
	}
	/* Motion scales the menu from the pointer (transform-origin is set inline) and fades it out faster than it arrives. */
	.menu {
		position: fixed;
		z-index: 100;
		min-width: min(13rem, calc(100vw - 16px));
		max-width: calc(100vw - 16px);
		max-height: min(300px, calc(100vh - 16px));
		overflow-y: auto;
		padding: 5px;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		outline: none;
	}
	.highlight {
		position: absolute;
		top: 0;
		right: 5px;
		left: 5px;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		background: var(--arc-surface-muted);
		opacity: 0;
		pointer-events: none;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.highlight[data-tone='danger'] {
		background: color-mix(in oklch, var(--arc-danger) 8%, var(--arc-surface));
	}
	.item {
		position: relative;
		display: flex;
		width: 100%;
		min-height: 34px;
		align-items: center;
		gap: 9px;
		padding: 0 11px;
		border: 0;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--arc-text-sm);
		text-align: left;
		cursor: pointer;
		outline: none;
		transition:
			background-color var(--arc-duration-instant) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
		animation: context-item-in var(--arc-duration-standard) var(--arc-ease-enter) both;
		animation-delay: calc(min(var(--i, 0), 4) * 35ms);
	}
	/* The gliding highlight is the focus indicator, as in the dropdown menu. */
	.item:focus-visible {
		outline: none;
	}
	/* Rows press with a tint, not a scale. */
	.item:active:not(:disabled) {
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
	}
	.item:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.item.destructive {
		color: var(--arc-danger);
	}
	.icon {
		display: inline-flex;
		width: 17px;
		color: var(--arc-text-secondary);
	}
	.item > span:last-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.destructive .icon {
		color: currentColor;
	}
	@keyframes context-item-in {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.item,
		.highlight {
			animation: none;
			transition: none;
		}
	}
</style>
