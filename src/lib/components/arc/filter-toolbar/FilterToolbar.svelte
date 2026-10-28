<script lang="ts">
	import { animate, motionValue, styleEffect, type MotionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { isReducedMotion, motionTokens } from '../motion';
	import FilterMenu from './FilterMenu.svelte';
	import MorphText from './MorphText.svelte';
	import { chipIn, chipOut, slotResize, textIn } from './transitions';
	import type { AddFilterConfig, FilterChip } from './types';

	/** Screen reader announcements. Pass translated text; each builder gets the chip text such as "Status: Active". */
	type Announcements = {
		added: (text: string) => string;
		removed: (text: string) => string;
		changed: (label: string, value: string) => string;
		cleared: string;
		anyValue: string;
	};

	type Props = {
		filters: FilterChip[];
		onRemove: (id: string) => void;
		onClearAll?: () => void;
		/** Adds an Add filter trigger that morphs into a two step field and value menu. */
		addFilter?: AddFilterConfig;
		/** Extra actions next to the Add filter trigger. */
		children?: Snippet;
		/** Accessible name of the group. */
		label?: string;
		clearAllLabel?: string;
		/** Note shown while no filter applies. */
		emptyLabel?: string;
		removeLabel?: (chip: FilterChip) => string;
		announcements?: Announcements;
	};

	const defaultRemoveLabel = (chip: FilterChip) =>
		`Remove ${chip.label}${chip.value ? `: ${chip.value}` : ''}`;
	const defaultAnnouncements: Announcements = {
		added: (text) => `Added ${text}`,
		removed: (text) => `Removed ${text}`,
		changed: (label, value) => `${label} changed to ${value}`,
		cleared: 'All filters cleared',
		anyValue: 'any'
	};

	let {
		filters,
		onRemove,
		onClearAll,
		addFilter,
		children,
		label = 'Active filters',
		clearAllLabel = 'Clear all',
		emptyLabel = 'No filters applied',
		removeLabel = defaultRemoveLabel,
		announcements = defaultAnnouncements
	}: Props = $props();

	/** Layout motion runs only this long after the filters change, so window resizes and font swaps settle at once. */
	const LAYOUT_MOTION_WINDOW_MS = 900;
	const CHIP_GAP_PX = 8;
	const CLEAR_GAP_PX = 12;
	const REFLOW_MIN_ROW_JUMP_PX = 1;
	const REFLOW_MAX_SLOT_JUMP_PX = 40;
	const EMPTY_NOTE_DELAY_RATIO = 0.75;

	let root: HTMLDivElement;
	let frame: HTMLDivElement;
	let list: HTMLDivElement;
	let armedUntil = 0;
	let pendingFocusIndex: number | null = null;
	let previous: FilterChip[] = untrack(() => filters);
	let message = $state('');

	const frameHeight = motionValue<number | string>('auto');
	const chipText = (chip: FilterChip) => (chip.value ? `${chip.label}: ${chip.value}` : chip.label);

	function describeChange(before: FilterChip[], after: FilterChip[]) {
		const removed = before.filter((old) => !after.some((chip) => chip.id === old.id));
		if (!after.length && removed.length > 1) return announcements.cleared;
		const added = after.filter((chip) => !before.some((old) => old.id === chip.id));
		const changed = after.filter((chip) =>
			before.some((old) => old.id === chip.id && old.value !== chip.value)
		);
		return [
			...added.map((chip) => announcements.added(chipText(chip))),
			...changed.map((chip) =>
				announcements.changed(chip.label, chip.value ?? announcements.anyValue)
			),
			...removed.map((chip) => announcements.removed(chipText(chip)))
		].join('. ');
	}

	$effect(() => styleEffect(frame, { height: frameHeight }));

	// The signature changes whenever a chip is added, removed or re-valued; it opens the layout motion window.
	$effect.pre(() => {
		filters.map((chip) => `${chip.id}:${chip.value ?? ''}`).join('|');
		armedUntil = performance.now() + LAYOUT_MOTION_WINDOW_MS;
	});

	$effect(() => {
		const next = filters;
		const text = describeChange(previous, next);
		previous = next;
		if (text) message = text;
	});

	// The frame springs to the chip list height, so a new line of chips opens the toolbar instead of snapping it.
	$effect(() => {
		let known = false;
		const observer = new ResizeObserver(() => {
			const next = list.offsetHeight;
			if (!known || isReducedMotion() || performance.now() > armedUntil) {
				known = true;
				frameHeight.jump(next);
				return;
			}
			animate(frameHeight as MotionValue<number>, next, motionTokens.spring.smooth);
		});
		observer.observe(list);
		return () => observer.disconnect();
	});

	type Track = { x: number; y: number; dx: number; dy: number; stop?: () => void };

	// A chip that wraps to another line would teleport. Each jump is offset in the same frame and springs back to zero.
	$effect(() => {
		const tracks = new Map<Element, Track>();
		const check = () => {
			const now = performance.now();
			const reduced = isReducedMotion();
			for (const child of Array.from(list.children) as HTMLElement[]) {
				const x = child.offsetLeft;
				const y = child.offsetTop;
				const track = tracks.get(child);
				if (!track) {
					tracks.set(child, { x, y, dx: 0, dy: 0 });
					continue;
				}
				const jumpX = track.x - x;
				const jumpY = track.y - y;
				track.x = x;
				track.y = y;
				const settled =
					Math.abs(jumpY) < REFLOW_MIN_ROW_JUMP_PX && Math.abs(jumpX) < REFLOW_MAX_SLOT_JUMP_PX;
				if (reduced || now > armedUntil || settled) continue;
				track.stop?.();
				const fromX = track.dx + jumpX;
				const fromY = track.dy + jumpY;
				const apply = (progress: number) => {
					track.dx = fromX * (1 - progress);
					track.dy = fromY * (1 - progress);
					child.style.translate = progress >= 1 ? '' : `${track.dx}px ${track.dy}px`;
				};
				apply(0);
				track.stop = animate(0, 1, {
					...motionTokens.spring.smooth,
					onUpdate: apply,
					onComplete: () => apply(1)
				}).stop;
			}
			for (const child of tracks.keys()) if (child.parentElement !== list) tracks.delete(child);
		};
		const observer = new ResizeObserver(check);
		const watch = () => Array.from(list.children).forEach((child) => observer.observe(child));
		const mutations = new MutationObserver(() => {
			watch();
			check();
		});
		observer.observe(list);
		watch();
		mutations.observe(list, { childList: true });
		return () => {
			observer.disconnect();
			mutations.disconnect();
			tracks.forEach((track) => track.stop?.());
		};
	});

	// A removed chip hands focus to its neighbor, or to the Add filter trigger once the list is empty.
	$effect(() => {
		const next = filters;
		const index = pendingFocusIndex;
		if (index === null) return;
		pendingFocusIndex = null;
		const chip = next[Math.min(index, next.length - 1)];
		const target = chip
			? root.querySelector<HTMLElement>(`[data-chip-remove="${CSS.escape(chip.id)}"]`)
			: root.querySelector<HTMLElement>('[data-filter-trigger]');
		target?.focus({ preventScroll: true });
	});

	function remove(event: MouseEvent, chip: FilterChip, index: number) {
		if (document.activeElement === event.currentTarget) pendingFocusIndex = index;
		onRemove(chip.id);
	}

	function clearAll() {
		pendingFocusIndex = -1;
		onClearAll?.();
	}
</script>

<div bind:this={root} class="toolbar" role="group" aria-label={label}>
	<div bind:this={frame} class="frame">
		<div bind:this={list} class="chips">
			{#each filters as chip, index (chip.id)}
				<span
					class="slot"
					in:slotResize={{ gap: CHIP_GAP_PX }}
					out:slotResize={{ gap: CHIP_GAP_PX }}
				>
					<span class="chip" in:chipIn out:chipOut>
						<span class="chip-label">
							{chip.label}{#if chip.value}<span class="value"
									><span class="separator">{' · '}</span><MorphText text={chip.value} /></span
								>{/if}
						</span>
						<button
							type="button"
							data-chip-remove={chip.id}
							aria-label={removeLabel(chip)}
							onclick={(event) => remove(event, chip, index)}
						>
							<XIcon size={14} strokeWidth={1.8} aria-hidden="true" />
						</button>
					</span>
				</span>
			{/each}
			<!-- The note sits over the leading edge, so it fades in where the chips were instead of riding their slots. -->
			{#if !filters.length}
				<span
					class="empty"
					in:textIn={{ delay: motionTokens.duration.instant * EMPTY_NOTE_DELAY_RATIO }}
					>{emptyLabel}</span
				>
			{/if}
		</div>
	</div>
	<div class="actions">
		{#if addFilter}
			<FilterMenu
				fields={addFilter.fields}
				onSelect={addFilter.onAdd}
				active={filters}
				label={addFilter.label}
				backLabel={addFilter.backLabel}
				align={addFilter.align}
			/>
		{/if}
		{@render children?.()}
		{#if filters.length > 0}
			<span
				class="slot"
				in:slotResize={{ gap: CLEAR_GAP_PX }}
				out:slotResize={{ gap: CLEAR_GAP_PX }}
			>
				<button class="clear" type="button" onclick={clearAll}>{clearAllLabel}</button>
			</span>
		{/if}
	</div>
	<span class="sr-only" role="status">{message}</span>
</div>

<style>
	.toolbar {
		position: relative;
		display: flex;
		min-height: var(--arc-control-height-lg);
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--arc-space-4);
		padding: var(--arc-space-3) var(--arc-space-4);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface);
	}
	.frame {
		min-width: 0;
		flex: 1;
	}
	.chips {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: var(--arc-control-height-sm);
		flex-wrap: wrap;
		align-items: center;
		gap: var(--arc-space-2);
	}
	/* The slot clips with a pill radius while it opens, so a growing chip reads as a pill stretching out. */
	.slot {
		display: inline-flex;
		max-width: 100%;
		min-width: 0;
		flex: none;
		border-radius: var(--arc-radius-pill);
	}
	/* --slot-moving is 1 while the slot animates: the chip then ignores the slot width instead of squeezing. */
	.chip {
		display: inline-flex;
		max-width: calc(100% + var(--slot-moving, 0) * 100vw);
		flex: none;
		min-height: var(--arc-control-height-sm);
		align-items: center;
		gap: var(--arc-space-2);
		padding: 0 var(--arc-space-2) 0 var(--arc-space-3);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
	}
	.chip-label {
		overflow-x: clip;
		overflow-y: visible;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value {
		color: var(--arc-foreground);
		font-weight: 500;
	}
	.separator {
		color: var(--arc-text-secondary);
		font-weight: 400;
	}
	.chip button {
		display: grid;
		width: 24px;
		height: 24px;
		flex: 0 0 24px;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			background var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.chip button:active {
		transform: scale(0.96);
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-instant);
		transition-timing-function:
			var(--arc-ease-standard), var(--arc-ease-standard), var(--arc-ease-standard);
	}
	.empty {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		display: flex;
		max-width: 100%;
		align-items: center;
		overflow: hidden;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		white-space: nowrap;
		pointer-events: none;
	}
	.actions {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: var(--arc-space-3);
	}
	.clear {
		min-height: var(--arc-control-height-sm);
		padding: 0 var(--arc-space-3);
		border: 0;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-text-muted);
		font: inherit;
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.clear:active {
		transform: scale(0.97);
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-instant);
		transition-timing-function:
			var(--arc-ease-standard), var(--arc-ease-standard), var(--arc-ease-standard);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (hover: hover) and (pointer: fine) {
		.chip button:hover {
			background: var(--arc-border);
			color: var(--arc-foreground);
		}
		.clear:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	/* In a column the frame must size from its height, not a zero flex basis, or its spring is ignored. */
	@media (max-width: 520px) {
		.toolbar {
			align-items: stretch;
			flex-direction: column;
		}
		.frame {
			flex: none;
		}
		.actions {
			justify-content: flex-end;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chip button,
		.clear {
			transition: none;
		}
		.chip button:active,
		.clear:active {
			transform: none;
		}
	}
</style>
