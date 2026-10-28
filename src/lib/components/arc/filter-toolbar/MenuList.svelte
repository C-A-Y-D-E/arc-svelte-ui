<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { isReducedMotion, motionTokens } from '../motion';
	import type { MenuRow } from './types';

	type Props = {
		rows: MenuRow[];
		labelledBy: string;
		onChoose: (row: MenuRow, keyboard: boolean) => void;
		onBack?: (keyboard: boolean) => void;
		onLeave: () => void;
		radio?: boolean;
	};

	let { rows, labelledBy, onChoose, onBack, onLeave, radio = false }: Props = $props();

	const TYPEAHEAD_RESET_MS = 700;
	const HIGHLIGHT_FADE_S = 0.08;
	const still = { duration: 0 };

	let list: HTMLDivElement;
	let highlight: HTMLSpanElement;
	let pointer = false;
	let typed = { text: '', at: 0 };
	let highlightShown = false;
	let current = $state(
		untrack(() =>
			Math.max(
				0,
				rows.findIndex((row) => row.checked)
			)
		)
	);
	let ring = $state(false);

	const items = () => Array.from(list.querySelectorAll<HTMLElement>('[data-row]'));

	function move(item: HTMLElement | undefined) {
		if (!item) return;
		item.focus({ preventScroll: true });
		if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
		else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
			list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
	}

	/** Typeahead: letters typed in quick succession build one prefix; a single letter cycles through its matches. */
	function findTyped(key: string, all: HTMLElement[], index: number) {
		const now = performance.now();
		const letter = key.toLowerCase();
		typed = { text: now - typed.at < TYPEAHEAD_RESET_MS ? typed.text + letter : letter, at: now };
		const start = index + (typed.text.length > 1 ? 0 : 1);
		const order = [...all.slice(start), ...all.slice(0, start)];
		return order.find((item) => (item.dataset.text ?? '').toLowerCase().startsWith(typed.text));
	}

	function isTypeaheadKey(event: KeyboardEvent) {
		return (
			event.key.length === 1 &&
			/\S/.test(event.key) &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		);
	}

	function onkeydown(event: KeyboardEvent) {
		const all = items();
		const index = all.indexOf(document.activeElement as HTMLElement);
		const go = (next: number) => {
			event.preventDefault();
			pointer = false;
			move(all[next]);
		};
		if (event.key === 'ArrowDown') return go(index < 0 ? 0 : (index + 1) % all.length);
		if (event.key === 'ArrowUp')
			return go(index < 0 ? all.length - 1 : (index - 1 + all.length) % all.length);
		if (event.key === 'Home') return go(0);
		if (event.key === 'End') return go(all.length - 1);
		if (event.key === 'ArrowRight' && index >= 0 && rows[index]?.drill) {
			event.preventDefault();
			onChoose(rows[index], true);
			return;
		}
		if (event.key === 'ArrowLeft' && onBack) {
			event.preventDefault();
			onBack(true);
			return;
		}
		if (!isTypeaheadKey(event)) return;
		const match = findTyped(event.key, all, index);
		if (match) go(all.indexOf(match));
	}

	function onfocusin(event: FocusEvent) {
		const item = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
		if (!item) return;
		current = items().indexOf(item);
		// Keyboard focus also draws the focus ring inside the highlight, where the scrolling list cannot clip it.
		const glide = pointer && !isReducedMotion() && highlightShown;
		ring = !pointer && item.matches(':focus-visible');
		highlightShown = true;
		animate(
			highlight,
			{ y: item.offsetTop, height: item.offsetHeight, opacity: 1 },
			{ ...(glide ? motionTokens.spring.snappy : still), opacity: fadeTiming() }
		);
	}

	function onfocusout(event: FocusEvent) {
		// The highlight fades where it is; it keeps its place so the fade is visible.
		if (list.contains(event.relatedTarget as Node | null)) return;
		ring = false;
		highlightShown = false;
		animate(highlight, { opacity: 0 }, fadeTiming());
	}

	function fadeTiming() {
		return { duration: isReducedMotion() ? 0 : HIGHLIGHT_FADE_S };
	}

	function onpointerleave() {
		if (pointer && list.contains(document.activeElement)) onLeave();
	}

	function onRowPointerMove(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		pointer = true;
		if (document.activeElement !== event.currentTarget)
			event.currentTarget.focus({ preventScroll: true });
	}
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
	bind:this={list}
	class="list"
	role="menu"
	aria-labelledby={labelledBy}
	{onkeydown}
	{onfocusin}
	{onfocusout}
	{onpointerleave}
>
	<span bind:this={highlight} class="highlight" data-ring={ring || undefined} aria-hidden="true"
	></span>
	{#each rows as row, index (row.key)}
		<button
			type="button"
			class="item"
			role={radio ? 'menuitemradio' : 'menuitem'}
			aria-checked={radio ? !!row.checked : undefined}
			tabindex={index === current ? 0 : -1}
			data-row={row.key}
			data-text={row.label}
			onpointermove={onRowPointerMove}
			onclick={(event) => onChoose(row, event.detail === 0)}
		>
			{#if row.icon}
				<span class="item-icon" aria-hidden="true">{@render row.icon()}</span>
			{/if}
			<span class="item-label">{row.label}</span>
			{#if row.drill}
				<span class="item-meta">
					{#if row.current}
						<span class="meta-value">{row.current}</span>
					{/if}
					<ChevronRightIcon size={15} strokeWidth={1.8} aria-hidden="true" />
				</span>
			{:else if row.hint != null || row.checked}
				<span class="item-meta">
					{#if row.hint != null}
						<span class="hint">{row.hint}</span>
					{/if}
					<span class="check" data-on={row.checked || undefined}>
						<CheckIcon size={15} strokeWidth={2} aria-hidden="true" />
					</span>
				</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.list {
		position: relative;
		display: grid;
		max-height: min(20rem, 55vh);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.highlight {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		background: color-mix(in oklch, var(--arc-foreground) 6%, transparent);
		opacity: 0;
		pointer-events: none;
	}
	.highlight[data-ring] {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.item:focus-visible {
		outline: none;
	}
	.item {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: var(--arc-control-height-sm);
		align-items: center;
		gap: 10px;
		padding: 0 10px;
		border: 0;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		text-align: left;
		cursor: pointer;
		outline: none;
		-webkit-tap-highlight-color: transparent;
	}
	.item-icon {
		display: inline-flex;
		min-width: 16px;
		flex: none;
		align-items: center;
		justify-content: center;
		color: var(--arc-text-secondary);
	}
	.item-label {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-meta {
		display: inline-flex;
		min-width: 0;
		flex: none;
		align-items: center;
		gap: 6px;
		max-width: 50%;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.meta-value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hint {
		min-width: 2ch;
		text-align: right;
	}
	.check {
		display: inline-flex;
		width: 15px;
		color: var(--arc-foreground);
		opacity: 0;
	}
	.check[data-on] {
		opacity: 1;
	}
</style>
