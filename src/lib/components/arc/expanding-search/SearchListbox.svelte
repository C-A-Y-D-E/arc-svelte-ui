<script lang="ts">
	import { animate, motionValue, styleEffect } from 'motion';
	import { flip } from 'svelte/animate';
	import { springCurve } from '../input';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { offsetWithin, splitMatch, type ExpandingSearchItem, type SearchGroup } from './search';

	type Props = {
		id: string;
		label: string;
		groups: SearchGroup[];
		query: string;
		activeIndex: number;
		optionId: (item: ExpandingSearchItem) => string;
		/** True while the last highlight move came from the keyboard, so only keyboard moves scroll the list. */
		movedByKeyboard: () => boolean;
		onHover: (index: number) => void;
		onChoose: (item: ExpandingSearchItem) => void;
	};

	let {
		id,
		label,
		groups,
		query,
		activeIndex,
		optionId,
		movedByKeyboard,
		onHover,
		onChoose
	}: Props = $props();

	const ROW_EXIT_S = 0.08;
	const HIGHLIGHT_FADE_S = 0.12;
	const { duration, spring } = motionTokens;
	const glide = springCurve(spring.smooth);

	let list: HTMLDivElement;
	const flat = $derived(groups.flatMap((group) => group.items));
	const layoutKey = $derived(flat.map((item) => item.id).join('|'));
	const activeItem = $derived(flat[activeIndex]);
	const activeId = $derived(activeItem ? optionId(activeItem) : '');
	const flipTiming = $derived(isReducedMotion() ? { duration: 0 } : glide);

	/** The highlight lives inside the active row, so it rides that row wherever it glides. Moving to another row, it starts where the old one was and springs home. */
	const travel = motionValue(0);
	const fade = motionValue(1);
	let last: { id: string; set: string; top: number } | null = null;

	$effect(() => {
		const row = activeId ? document.getElementById(activeId) : null;
		if (!row) {
			last = null;
			return;
		}
		const top = offsetWithin(row, list);
		const previous = last;
		last = { id: activeId, set: layoutKey, top };
		// Same row: its highlight is already in place, and any travel still in flight stays relative to it.
		if (previous?.id === activeId) return;
		if (previous && previous.set === layoutKey && !isReducedMotion()) glideFrom(previous.top, top);
		else fadeInPlace();
		if (movedByKeyboard()) row.scrollIntoView({ block: 'nearest' });
	});

	function glideFrom(previousTop: number, top: number) {
		const velocity = travel.getVelocity();
		travel.jump(previousTop + travel.get() - top);
		animate(travel, 0, { ...spring.snappy, velocity });
	}

	/** Nothing was highlighted, or new results arrived: it fades in on its row, without travel. */
	function fadeInPlace() {
		travel.jump(0);
		if (isReducedMotion()) return fade.jump(1);
		fade.jump(0);
		animate(fade, 1, { duration: HIGHLIGHT_FADE_S, ease: motionTokens.ease.enter });
	}

	function headingId(group: SearchGroup) {
		return `${id}-${group.name || 'results'}`.replace(/\s+/g, '-');
	}
</script>

<div bind:this={list} {id} role="listbox" aria-label={label} class="listbox">
	{#each groups as group (group.name)}
		<div
			role="group"
			aria-labelledby={group.name ? headingId(group) : undefined}
			class="group"
			animate:flip={flipTiming}
			in:presence={{ duration: duration.fast }}
			out:presence={{ duration: ROW_EXIT_S, easing: ease.standard }}
		>
			{#if group.name}
				<div id={headingId(group)} class="group-label" role="presentation">{group.name}</div>
			{/if}
			{#each group.items as item (item.id)}
				{@const position = flat.indexOf(item)}
				{@const active = position === activeIndex}
				{@const title = splitMatch(item.title, query)}
				<!-- svelte-ignore a11y_click_events_have_key_events (the combobox input owns the keyboard) -->
				<div
					id={optionId(item)}
					role="option"
					tabindex="-1"
					aria-selected={active}
					data-active={active || undefined}
					class="option"
					animate:flip={flipTiming}
					in:presence={{ duration: duration.fast }}
					out:presence={{ duration: ROW_EXIT_S, easing: ease.standard }}
					onpointermove={() => !active && onHover(position)}
					onmousedown={(event) => event.preventDefault()}
					onclick={() => onChoose(item)}
				>
					{#if active}
						<span
							class="highlight"
							aria-hidden="true"
							{@attach (node) => styleEffect(node, { y: travel, opacity: fade })}
						></span>
					{/if}
					{#if item.icon}
						<span class="option-icon" aria-hidden="true">{@render item.icon()}</span>
					{/if}
					<span class="option-text">
						<span class="option-title"
							>{title.before}{#if title.match}<mark class="mark">{title.match}</mark
								>{/if}{title.after}</span
						>
						{#if item.meta}<span class="option-meta">{item.meta}</span>{/if}
					</span>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	/* A flex gap, not margins: a group popping out while it leaves never lets the next one's margin collapse through the list. */
	.listbox {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.group {
		position: relative;
	}
	.group-label {
		padding: 8px 12px 4px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	/* Nested corners step down from the panel by its inset. The highlight paints under every row's content, so text never hides while it travels. */
	.option {
		position: relative;
		display: flex;
		min-height: 48px;
		align-items: center;
		gap: 12px;
		padding: 6px 12px;
		border-radius: calc(var(--arc-radius-panel) - 6px);
		color: var(--arc-foreground);
		cursor: pointer;
		user-select: none;
		outline: none;
		-webkit-tap-highlight-color: transparent;
	}
	.highlight {
		position: absolute;
		z-index: -1;
		inset: 0;
		border-radius: inherit;
		background: color-mix(in oklch, var(--arc-foreground) 6%, transparent);
		pointer-events: none;
	}
	.option-icon {
		display: grid;
		flex: none;
		width: 18px;
		place-items: center;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.option[data-active] .option-icon {
		color: var(--arc-foreground);
	}
	.option-text {
		display: grid;
		min-width: 0;
	}
	.option-title,
	.option-meta {
		overflow: hidden;
		line-height: var(--arc-leading-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.option-title {
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
	}
	.option-meta {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.mark {
		background: none;
		color: var(--arc-foreground);
		font-weight: 500;
	}
	@media (prefers-reduced-motion: reduce) {
		.option-icon {
			transition: none;
		}
	}
</style>
