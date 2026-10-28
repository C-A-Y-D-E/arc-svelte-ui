import type { ToastRecord } from './toast-store.svelte';

export type Target = { y: number; scale: number; height: number; opacity: number; content: number };

/** Each tucked toast shows this many pixels above the one in front of it. */
const PEEK = 14;
/** Space between toasts when the stack is open. */
const GAP = 12;
/** Tucked toasts shrink by this much per step back. */
const STEP = 0.05;

/**
 * Closed, tucked toasts take the front toast's height so their edges line up; open, each takes its own and they stack with a gap.
 * The list is the hover target and is sized to cover the gaps, so moving between open toasts never collapses the stack.
 */
export function layoutStack(
	toasts: ToastRecord[],
	heights: Record<string, number>,
	expanded: boolean,
	visibleToasts: number
) {
	const heightOf = (item: ToastRecord) => heights[item.id] ?? 0;
	const front = toasts.length ? heightOf(toasts[0]) : 0;
	const tops = toasts.reduce<number[]>(
		(sum, item, index) => [...sum, sum[index] + (index < visibleToasts ? heightOf(item) + GAP : 0)],
		[0]
	);
	const targets = toasts.map((item, index): Target => {
		const visible = index < visibleToasts;
		const depth = Math.min(index, visibleToasts);
		return expanded
			? { y: -tops[index], scale: 1, height: heightOf(item), opacity: visible ? 1 : 0, content: 1 }
			: {
					y: -PEEK * depth,
					scale: 1 - STEP * depth,
					height: index === 0 ? heightOf(item) : front,
					opacity: visible ? 1 : 0,
					content: index === 0 ? 1 : 0
				};
	});
	const listHeight = !toasts.length
		? 0
		: expanded
			? tops[toasts.length] - GAP
			: front + PEEK * (Math.min(toasts.length, visibleToasts) - 1);
	return { targets, listHeight };
}
