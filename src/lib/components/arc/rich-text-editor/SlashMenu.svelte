<script lang="ts">
	import { animate, motionValue, styleEffect } from 'motion';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import type { Slash, SlashItem } from './slash';
	import { GLIDE, GROW } from './springs';

	type Props = {
		slash: Slash;
		items: SlashItem[];
		activeIndex: number;
		listId: string;
		optionId: (index: number) => string;
		onchoose: (item: SlashItem) => void;
		onactivate: (index: number) => void;
	};

	let { slash, items, activeIndex, listId, optionId, onchoose, onactivate }: Props = $props();

	const ROW_SCROLL_MARGIN = 6;
	const { duration } = motionTokens;

	let panel: HTMLDivElement;
	let body: HTMLDivElement;
	let list: HTMLUListElement;
	let highlight: HTMLLIElement;
	const highlightY = motionValue(0);
	const highlightHeight = motionValue(0);
	const panelHeight = motionValue(0);

	$effect(() => styleEffect(highlight, { y: highlightY, height: highlightHeight }));
	$effect(() => styleEffect(panel, { height: panelHeight }));

	/** A short panel scrolls to keep the active row in view. */
	function scrollIntoPanel(row: HTMLElement) {
		const top = row.offsetTop + ROW_SCROLL_MARGIN;
		const bottom = top + row.offsetHeight;
		if (top - ROW_SCROLL_MARGIN < panel.scrollTop) panel.scrollTop = top - ROW_SCROLL_MARGIN;
		else if (bottom + ROW_SCROLL_MARGIN > panel.scrollTop + panel.clientHeight) {
			panel.scrollTop = bottom + ROW_SCROLL_MARGIN - panel.clientHeight;
		}
	}

	/** The highlight glides between rows. */
	$effect(() => {
		void items;
		const row = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
		if (!row) return;
		if (isReducedMotion() || highlightHeight.get() === 0) {
			highlightY.jump(row.offsetTop);
			highlightHeight.jump(row.offsetHeight);
			return;
		}
		animate(highlightY, row.offsetTop, GLIDE);
		animate(highlightHeight, row.offsetHeight, GLIDE);
		scrollIntoPanel(row);
	});

	/** The panel springs to its rows as results filter. */
	const max = $derived(slash.max);
	$effect(() => {
		let sized = false;
		const fit = () => {
			const target = Math.min(body.offsetHeight, max);
			if (!sized || isReducedMotion()) {
				panelHeight.jump(target);
				sized = true;
				return;
			}
			animate(panelHeight, target, GROW);
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(body);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={panel}
	class="slash"
	role="presentation"
	data-above={slash.above || undefined}
	style:left="{slash.x}px"
	style:top="{slash.y}px"
	style:transform-origin={slash.above ? '16px 100%' : '16px 0'}
	in:presence|global={{
		scale: 0.96,
		y: slash.above ? 4 : -4,
		duration: motionTokens.spring.snappy.visualDuration
	}}
	out:presence|global={{ scale: 0.97, duration: duration.exit * 0.8, easing: ease.standard }}
	onmousedown={(event) => event.preventDefault()}
>
	<div bind:this={body} class="slash-body">
		<ul bind:this={list} id={listId} role="listbox" aria-label="Blocks" class="slash-list">
			<li bind:this={highlight} aria-hidden="true" class="slash-highlight"></li>
			{#each items as item, index (item.type)}
				<!-- The editor keeps focus and drives the options with aria-activedescendant. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optionId(index)}
					role="option"
					aria-selected={index === activeIndex}
					data-index={index}
					class="slash-option"
					onpointermove={() => {
						if (index !== activeIndex) onactivate(index);
					}}
					onclick={() => onchoose(item)}
				>
					<span class="slash-icon"
						><item.icon size={16} strokeWidth={1.75} aria-hidden="true" /></span
					>
					<span class="slash-label">{item.label}</span>
					{#if item.hint}<kbd class="slash-hint">{item.hint}</kbd>{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.slash {
		position: absolute;
		z-index: 40;
		width: 240px;
		max-width: calc(100% - 8px);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
		border: 1px solid var(--arc-border);
		border-radius: 18px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
	}
	.slash[data-above] {
		translate: 0 -100%;
	}
	.slash-body {
		padding: 6px;
	}
	.slash-list {
		position: relative;
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.slash-highlight {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		border-radius: 12px;
		background: color-mix(in oklch, var(--arc-foreground) 6.5%, transparent);
		pointer-events: none;
	}
	.slash-option {
		position: relative;
		display: flex;
		height: 34px;
		align-items: center;
		gap: 10px;
		padding: 0 10px;
		border-radius: 12px;
		color: var(--arc-text-secondary);
		cursor: pointer;
		font-size: var(--arc-text-sm);
		-webkit-tap-highlight-color: transparent;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.slash-option[aria-selected='true'] {
		color: var(--arc-foreground);
	}
	.slash-icon {
		display: grid;
		width: 20px;
		flex: none;
		place-items: center;
	}
	.slash-label {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.slash-hint {
		flex: none;
		color: var(--arc-text-muted);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 11px;
	}
</style>
