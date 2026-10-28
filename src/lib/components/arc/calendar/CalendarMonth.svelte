<script lang="ts">
	import { animate } from 'motion';
	import { isReducedMotion, motionTokens } from '../motion';
	import { dateKey, makeWeeks, sameDay, sameMonth } from './dates';

	/** One month of the strip. The selected disc glides between its days; each pane owns its own disc. */
	type Props = {
		month: Date;
		present: boolean;
		value?: Date;
		today?: Date;
		tabbableKey: string;
		label: string;
		locale: string;
		isDisabled: (date: Date) => boolean;
		numberDelay: (key: string) => string | undefined;
		onSelect: (date: Date) => void;
		onDayKeyDown: (event: KeyboardEvent, date: Date) => void;
		onDayFocus: (date: Date) => void;
	};

	let {
		month,
		present,
		value,
		today,
		tabbableKey,
		label,
		locale,
		isDisabled,
		numberDelay,
		onSelect,
		onDayKeyDown,
		onDayFocus
	}: Props = $props();

	const weeks = $derived(makeWeeks(month));
	const selectedKey = $derived(value ? dateKey(value) : '');

	let grid: HTMLDivElement;
	let departing: DOMRect | undefined;

	const findHighlight = () => grid?.querySelector<HTMLElement>('[data-highlight]');

	// The disc is one shared element: it is read where it was before the selection changes, then glides from there.
	$effect.pre(() => {
		void selectedKey;
		departing = findHighlight()?.getBoundingClientRect();
	});
	$effect(() => {
		void selectedKey;
		const from = departing;
		departing = undefined;
		const highlight = findHighlight();
		if (!highlight || !from || isReducedMotion()) return;
		const to = highlight.getBoundingClientRect();
		animate(
			highlight,
			{ x: [from.left - to.left, 0], y: [from.top - to.top, 0] },
			motionTokens.spring.morph
		);
	});
</script>

<div bind:this={grid} class="grid" role="grid" aria-label={label}>
	{#each weeks as week (dateKey(week[0]))}
		<div class="week" role="row">
			{#each week as date (dateKey(date))}
				{@const key = dateKey(date)}
				{@const selected = sameDay(date, value)}
				{@const isToday = sameDay(date, today)}
				<button
					type="button"
					role="gridcell"
					data-date={key}
					aria-label={date.toLocaleDateString(locale, { dateStyle: 'full' })}
					aria-selected={selected}
					aria-current={isToday ? 'date' : undefined}
					tabindex={present && key === tabbableKey ? 0 : -1}
					disabled={isDisabled(date)}
					style={present ? numberDelay(key) : undefined}
					class={[
						'day',
						!sameMonth(date, month) && 'outside',
						selected && 'selected',
						isToday && 'today'
					]}
					onfocus={() => onDayFocus(date)}
					onkeydown={(event) => onDayKeyDown(event, date)}
					onclick={() => onSelect(date)}
				>
					{#if selected}<span class="highlight" data-highlight aria-hidden="true"></span>{/if}
					<span class="day-number">{date.getDate()}</span>
				</button>
			{/each}
		</div>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		row-gap: 4px;
	}
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		column-gap: 4px;
	}
	.day {
		position: relative;
		display: grid;
		width: 100%;
		aspect-ratio: 1;
		min-width: 0;
		place-items: center;
		border: 0;
		border-radius: 50%;
		padding: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 400;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard) var(--number-delay, 0ms);
	}
	/* The inner circle carries hover and press; the grid cell itself never moves, so the hit area stays put. */
	.day::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			scale var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.day-number {
		position: relative;
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard) var(--number-delay, 0ms),
			scale var(--arc-duration-spring) var(--arc-ease-spring);
	}
	/* The selected disc is one shared element that glides to the new day. Press uses the separate scale property so it never fights the glide. */
	.highlight {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--arc-accent);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			scale var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.day:hover:not(:disabled):not(.selected)::before {
			background: var(--arc-surface-muted);
		}
		.day.selected:hover .highlight {
			background: var(--arc-accent-strong);
		}
	}
	.day:active:not(:disabled)::before,
	.day:active:not(:disabled) .highlight,
	.day:active:not(:disabled) .day-number {
		scale: 0.94;
		transition-duration: var(--arc-duration-fast), 100ms;
		transition-timing-function: var(--arc-ease-standard);
	}
	/* Outside days dim their number, not the button, so a disc gliding onto one keeps its full strength. */
	.day.outside {
		color: var(--arc-text-muted);
	}
	.day.outside:not(.selected) .day-number {
		opacity: 0.8;
	}
	/* Today is a small dot under the number. It takes the number's color, so it flips with it when the disc arrives. */
	.day.today .day-number::after {
		content: '';
		position: absolute;
		top: calc(100% + 4px);
		left: 50%;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: currentColor;
	}
	.day.selected,
	.day.today {
		font-weight: 500;
	}
	.day.selected {
		color: var(--arc-accent-foreground);
	}
	.day:disabled {
		cursor: default;
		color: var(--arc-text-muted);
	}
	.day:disabled .day-number {
		opacity: 0.42;
	}
	.day.outside:disabled .day-number {
		opacity: 0.3;
	}
	@media (prefers-reduced-motion: reduce) {
		.day,
		.day::before,
		.day-number,
		.highlight {
			transition: none;
		}
		.day:active::before,
		.day:active .highlight,
		.day:active .day-number {
			scale: none;
		}
	}
</style>
