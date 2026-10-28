<script module lang="ts">
	import type { ToastRecord } from './toast-store.svelte';

	/** `top-center` is not in Arc: the stack hangs from the top and fans downward. */
	export type ToastStackPosition = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-center';

	/** A rendered toast. A leaving one keeps the index and open state it had, so it fades out where it stood. */
	type Entry =
		| { record: ToastRecord; leaving: false }
		| { record: ToastRecord; leaving: true; index: number; expanded: boolean };

	/** Keeps leaving toasts in place (like AnimatePresence) while new ones join at the front. */
	function reconcile(previous: Entry[], live: ToastRecord[], expandedBefore: boolean): Entry[] {
		const liveById = new Map(live.map((record) => [record.id, record]));
		const known = new Set(previous.map((entry) => entry.record.id));
		let liveIndex = 0;
		const kept = previous.map((entry): Entry => {
			const index = entry.leaving ? entry.index : liveIndex++;
			const record = liveById.get(entry.record.id);
			if (record) return { record, leaving: false };
			return entry.leaving
				? entry
				: { record: entry.record, leaving: true, index, expanded: expandedBefore };
		});
		const added = live
			.filter((record) => !known.has(record.id))
			.map((record): Entry => ({ record, leaving: false }));
		return [...added, ...kept];
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { strings } from '../strings';
	import type { HTMLAttributes } from 'svelte/elements';
	import { focusVisible } from './focus';
	import { layoutStack } from './layout';
	import ToastItem from './ToastItem.svelte';
	import { getToastStore } from './toast-store.svelte';

	/**
	 * The viewport for a toast stack. Render it once inside a `ToastStackProvider` and call `useToastStack()` anywhere below.
	 * New toasts rise from the bottom edge, older ones tuck behind, and hovering or focusing the stack fans it out into a list.
	 * Toasts pause while the stack is open or the tab is hidden, and swipe right to dismiss.
	 */
	type Props = HTMLAttributes<HTMLElement> & {
		/** Accessible name of the notification region. */
		label?: string;
		position?: ToastStackPosition;
		/** Pins the stack inside the nearest positioned ancestor instead of the window, for panels and previews. */
		contained?: boolean;
		/** How many toasts show at once. Older ones wait behind and return as the front ones close. */
		visibleToasts?: number;
		/** Alt+T moves focus into the stack. */
		hotkey?: boolean;
	};

	let {
		label: labelProp,
		position = 'bottom-right',
		contained = false,
		visibleToasts = 3,
		hotkey = true,
		class: className,
		...rest
	}: Props = $props();

	const store = getToastStore();
	const label = $derived(labelProp ?? strings.toastStackLabel());

	let hovered = $state(false);
	let focused = $state(false);
	let tapped = $state(false);
	let dragging = $state(false);
	let pageHidden = $state(false);
	let heights = $state<Record<string, number>>({});
	let entries = $state.raw<Entry[]>([]);
	let region: HTMLElement;
	let list: HTMLOListElement;
	let returnFocus: HTMLElement | null = null;
	/** The open state as last rendered, which leaving toasts keep. */
	let renderedExpanded = false;

	const expanded = $derived(store.toasts.length > 0 && (hovered || focused || tapped));
	const paused = $derived(expanded || dragging || pageHidden);
	const fromTop = $derived(position === 'top-center');
	/** The layout stacks upward from a bottom edge; hung from the top, the same offsets point down. */
	const layout = $derived.by(() => {
		const stacked = layoutStack(store.toasts, heights, expanded, visibleToasts);
		if (!fromTop) return stacked;
		return { ...stacked, targets: stacked.targets.map((target) => ({ ...target, y: -target.y })) };
	});
	const liveIndex = $derived(new Map(store.toasts.map((record, index) => [record.id, index])));

	$effect.pre(() => {
		const live = store.toasts;
		untrack(() => (entries = reconcile(entries, live, renderedExpanded)));
	});

	$effect(() => {
		renderedExpanded = expanded;
	});

	$effect(() => {
		if (tapped && store.toasts.length === 0) tapped = false;
	});

	$effect(() => {
		const sync = () => (pageHidden = document.visibilityState === 'hidden');
		sync();
		document.addEventListener('visibilitychange', sync);
		return () => document.removeEventListener('visibilitychange', sync);
	});

	$effect(() => {
		if (!hotkey) return;
		const onKey = (event: KeyboardEvent) => {
			if (!event.altKey || event.metaKey || event.ctrlKey || event.code !== 'KeyT') return;
			const target = list.querySelector<HTMLElement>(':scope > li:not([inert]) button');
			if (!target) return;
			event.preventDefault();
			// Browsers skip the focus ring after a modifier shortcut, so the hotkey asks for it and opens the stack itself.
			target.focus({ focusVisible: true } as FocusOptions);
			focused = true;
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	});

	$effect(() => {
		if (!tapped) return;
		const onDown = (event: PointerEvent) => {
			if (!region.contains(event.target as Node)) tapped = false;
		};
		document.addEventListener('pointerdown', onDown);
		return () => document.removeEventListener('pointerdown', onDown);
	});

	function measure(id: string, height: number) {
		if (heights[id] !== height) heights[id] = height;
	}

	function removeLeaving(id: string) {
		entries = entries.filter((entry) => !(entry.leaving && entry.record.id === id));
		delete heights[id];
	}

	function toggleTap() {
		tapped = !tapped;
	}

	function setDragging(value: boolean) {
		dragging = value;
	}

	/** Keyboard users land on the next toast; with none left they return to where they were before entering the stack. */
	function handOff(leaving: HTMLElement, keyboard: boolean) {
		const items = Array.from(list.children) as HTMLElement[];
		const at = items.indexOf(leaving);
		const candidates = items.filter((item) => item !== leaving && !item.hasAttribute('inert'));
		const next =
			candidates.find((item) => items.indexOf(item) > at) ?? candidates[candidates.length - 1];
		const button = next?.querySelector<HTMLElement>('button');
		if (keyboard && button) button.focus();
		else if (keyboard && returnFocus?.isConnected) returnFocus.focus();
		else (document.activeElement as HTMLElement | null)?.blur();
	}

	function onFocusIn(event: FocusEvent & { currentTarget: HTMLElement }) {
		const from = event.relatedTarget;
		if (!(from instanceof Node) || !event.currentTarget.contains(from)) {
			returnFocus = from instanceof HTMLElement ? from : null;
		}
		// Only keyboard focus opens the stack; a mouse click on a button should not pin it open.
		if (event.target instanceof Element && focusVisible(event.target)) focused = true;
	}

	function onFocusOut(event: FocusEvent & { currentTarget: HTMLElement }) {
		if (
			!(event.relatedTarget instanceof Node) ||
			!event.currentTarget.contains(event.relatedTarget)
		)
			focused = false;
	}

	function onPointerHover(event: PointerEvent) {
		if (event.pointerType === 'mouse' && !hovered) hovered = true;
	}

	function onPointerLeave(event: PointerEvent) {
		if (event.pointerType === 'mouse') hovered = false;
	}
</script>

<section
	bind:this={region}
	class={['viewport', position, contained && 'contained', className]}
	aria-label={hotkey ? strings.toastStackHotkey({ label }) : label}
	aria-live="polite"
	aria-relevant="additions text"
	aria-atomic="false"
	onfocusin={onFocusIn}
	onfocusout={onFocusOut}
	{...rest}
>
	<ol
		bind:this={list}
		class="list"
		style:height="{layout.listHeight}px"
		data-expanded={expanded}
		onpointerenter={onPointerHover}
		onpointermove={onPointerHover}
		onpointerleave={onPointerLeave}
	>
		{#each entries as entry (entry.record.id)}
			{@const index = entry.leaving ? entry.index : (liveIndex.get(entry.record.id) ?? 0)}
			<ToastItem
				toast={entry.record}
				target={entry.leaving ? undefined : layout.targets[index]}
				present={!entry.leaving}
				expanded={entry.leaving ? entry.expanded : expanded}
				front={index === 0}
				hidden={index >= visibleToasts}
				{paused}
				{store}
				onMeasure={measure}
				onDragChange={setDragging}
				onTap={toggleTap}
				onHandOff={handOff}
				onExitComplete={removeLeaving}
				{fromTop}
			/>
		{/each}
	</ol>
</section>

<style>
	/* The region only holds the list; it never blocks clicks outside the toasts themselves. */
	.viewport {
		position: fixed;
		z-index: 60;
		bottom: var(--arc-space-6);
		width: min(22.5rem, calc(100% - var(--arc-space-8)));
		pointer-events: none;
	}
	.bottom-right {
		right: var(--arc-space-6);
	}
	.bottom-left {
		left: var(--arc-space-6);
	}
	.bottom-center,
	.top-center {
		right: 0;
		left: 0;
		margin-inline: auto;
	}
	.top-center {
		top: var(--arc-space-4);
		bottom: auto;
	}
	.contained {
		position: absolute;
		z-index: 2;
		bottom: var(--arc-space-4);
	}
	.contained.bottom-right {
		right: var(--arc-space-4);
	}
	.contained.bottom-left {
		left: var(--arc-space-4);
	}
	@media (max-width: 30rem) {
		.viewport:not(.contained):not(.top-center) {
			right: 0;
			bottom: var(--arc-space-4);
			left: 0;
			margin-inline: auto;
		}
	}

	/* Toasts hang from the bottom of the list. Its height covers the gaps between open toasts, so hover survives the space between them. */
	.list {
		position: relative;
		margin: 0;
		padding: 0;
		list-style: none;
		pointer-events: auto;
	}
</style>
