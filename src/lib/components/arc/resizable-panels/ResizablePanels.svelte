<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { PanelGroup, setPanelGroup } from './panel-group.svelte';

	/**
	 * A horizontal split view whose panes people resize by dragging the dividers between them, the way a mail or code editor window works.
	 * Dividers follow the pointer 1:1, resist past a pane's limits, and snap collapsible panes closed. Each divider is a focusable separator:
	 * arrows resize, Home and End jump to the limits, Enter hides or restores a collapsible pane, and a double-click resets the layout.
	 * The group needs a definite height.
	 */
	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Names the group for assistive technology. */
		label?: string;
		/** `ResizablePanel` elements, in order. The set of panes should stay the same for the life of the group. */
		children: Snippet;
		/** Called with each pane's share in percent after a resize settles. */
		onLayoutChange?: (sizes: number[]) => void;
		ref?: HTMLDivElement | null;
	};

	let {
		label,
		children,
		onLayoutChange,
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const group = new PanelGroup(() => onLayoutChange);
	setPanelGroup(group);

	$effect(() => {
		if (!ref) return;
		const observer = new ResizeObserver(() => group.measure());
		observer.observe(ref);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={ref}
	class={['group', className]}
	role="group"
	aria-label={label}
	data-resizing={group.resizing !== null || undefined}
	{...rest}
>
	{@render children()}
</div>

<style>
	/* Panes share the width through flex-grow factors, so the layout is right on the server and stays proportional as the group resizes. */
	/* A size container, so each pane's floor can scale with the group when it is too narrow for every minimum (see --resizable-panel-min). */
	.group {
		display: flex;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		container-type: inline-size;
	}
	.group[data-resizing] {
		cursor: col-resize;
		user-select: none;
		-webkit-user-select: none;
	}
</style>
