<script module lang="ts">
	export type RangeFormatters = {
		title: Intl.DateTimeFormat;
		day: Intl.DateTimeFormat;
		weekday: Intl.DateTimeFormat;
		weekdayLong: Intl.DateTimeFormat;
	};
</script>

<script lang="ts">
	import { dateKey, dayDiff, fromKey, makeWeeks, monthDiff, sameDay } from '../calendar/dates';
	import type { DateRange } from './presets';
	import RangeBar, { type Segment } from './RangeBar.svelte';
	import RangeThumb from './RangeThumb.svelte';

	type Props = {
		month: Date;
		range: DateRange | null;
		tabbable: string;
		today?: Date;
		minDate?: Date;
		maxDate?: Date;
		weekStartsOn: 0 | 1;
		formatters: RangeFormatters;
		idBase: string;
		onPick: (date: Date) => void;
		onHover: (date: Date) => void;
		onKey: (event: KeyboardEvent, date: Date) => void;
		onFocusDay: (date: Date) => void;
	};

	let {
		month,
		range,
		tabbable,
		today,
		minDate,
		maxDate,
		weekStartsOn,
		formatters,
		idBase,
		onPick,
		onHover,
		onKey,
		onFocusDay
	}: Props = $props();

	const DAYS_PER_WEEK = 7;
	const WEEKDAY_LETTERS = 2;
	const COLUMN_PERCENT = 100 / DAYS_PER_WEEK;

	const rows = $derived(makeWeeks(month, weekStartsOn));
	const first = $derived(rows[0][0]);
	const titleId = $derived(`${idBase}-${dateKey(month)}`);
	const inMonth = (date: Date) => monthDiff(date, month) === 0;
	const columnOf = (date: Date) => dayDiff(date, first) % DAYS_PER_WEEK;
	const cellOf = (date: Date) => {
		const index = dayDiff(date, first);
		return { row: Math.floor(index / DAYS_PER_WEEK), col: index % DAYS_PER_WEEK };
	};

	// Keyed by the range's days, so the highlight only moves when they do.
	const startKey = $derived(range ? dateKey(range.start) : '');
	const endKey = $derived(range ? dateKey(range.end) : '');

	/** Each week's slice of the range, in percent of the row. */
	const segments = $derived.by((): Segment[] => {
		if (!startKey || !endKey) return rows.map(() => null);
		const start = fromKey(startKey);
		const end = fromKey(endKey);
		return rows.map((row) => {
			const days = row.filter(inMonth);
			if (!days.length) return null;
			const rowFirst = days[0];
			const rowLast = days[days.length - 1];
			const from = dayDiff(start, rowFirst) > 0 ? start : rowFirst;
			const to = dayDiff(end, rowLast) < 0 ? end : rowLast;
			if (dayDiff(from, to) <= 0) {
				const left = columnOf(from);
				return { left: left * COLUMN_PERCENT, width: (columnOf(to) - left + 1) * COLUMN_PERCENT };
			}
			// The week sits wholly before or after the range: collapse at the edge the range would grow in from.
			if (dayDiff(rowLast, start) < 0)
				return { left: (columnOf(rowLast) + 1) * COLUMN_PERCENT, width: 0 };
			return { left: columnOf(rowFirst) * COLUMN_PERCENT, width: 0 };
		});
	});
	const startCell = $derived(
		startKey && inMonth(fromKey(startKey)) ? cellOf(fromKey(startKey)) : null
	);
	const endCell = $derived(
		endKey && endKey !== startKey && inMonth(fromKey(endKey)) ? cellOf(fromKey(endKey)) : null
	);

	const isOutOfRange = (date: Date) =>
		Boolean((minDate && dayDiff(date, minDate) < 0) || (maxDate && dayDiff(date, maxDate) > 0));
	const isInRange = (date: Date) =>
		Boolean(range && dayDiff(date, range.start) >= 0 && dayDiff(date, range.end) <= 0);
</script>

<div class="month">
	<p id={titleId} class="month-title">{formatters.title.format(month)}</p>
	<div role="grid" aria-labelledby={titleId} class="grid">
		<div role="row" class="weekdays">
			{#each rows[0] as date (date.getDay())}
				<span role="columnheader" aria-label={formatters.weekdayLong.format(date)}>
					{formatters.weekday.format(date).slice(0, WEEKDAY_LETTERS)}
				</span>
			{/each}
		</div>
		<div class="weeks">
			<span class="layer" aria-hidden="true">
				{#each segments as segment, row (row)}
					<RangeBar {row} {segment} />
				{/each}
				<RangeThumb cell={startCell} />
				<RangeThumb cell={endCell} />
			</span>
			{#each rows as row, index (index)}
				<div role="row" class="week">
					{#each row as date (dateKey(date))}
						{#if inMonth(date)}
							{@const key = dateKey(date)}
							{@const disabled = isOutOfRange(date)}
							{@const inRange = isInRange(date)}
							{@const isToday = sameDay(date, today)}
							<span role="gridcell" aria-selected={inRange} class="cell">
								<button
									type="button"
									class="day"
									data-date={key}
									data-edge={sameDay(date, range?.start) || sameDay(date, range?.end) || undefined}
									data-range={inRange || undefined}
									data-today={isToday || undefined}
									tabindex={key === tabbable ? 0 : -1}
									{disabled}
									aria-current={isToday ? 'date' : undefined}
									aria-label={formatters.day.format(date)}
									onclick={() => onPick(date)}
									onpointerenter={() => {
										if (!disabled) onHover(date);
									}}
									onfocus={() => onFocusDay(date)}
									onkeydown={(event) => onKey(event, date)}
								>
									<span>{date.getDate()}</span>
								</button>
							</span>
						{:else}
							<span role="gridcell" class="blank"></span>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.month {
		width: calc(var(--cell) * 7);
	}
	.month-title {
		height: 32px;
		margin: 0;
		color: var(--arc-foreground);
		font-weight: 500;
		line-height: 32px;
		text-align: center;
		white-space: nowrap;
	}
	.grid {
		display: grid;
	}
	.weekdays {
		display: grid;
		height: 28px;
		align-items: center;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		grid-template-columns: repeat(7, var(--cell));
		text-align: center;
	}
	.weeks {
		position: relative;
	}
	.week {
		display: grid;
		height: var(--cell);
		grid-template-columns: repeat(7, var(--cell));
	}
	.cell,
	.blank {
		position: relative;
		display: block;
	}
	/* The highlight lives under the days: one bar per week plus a solid end at each side of the range. */
	.layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.day {
		position: relative;
		z-index: 1;
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--arc-foreground);
		cursor: pointer;
		font: inherit;
		font-variant-numeric: tabular-nums;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.day > span {
		position: relative;
		display: grid;
		width: calc(100% - 6px);
		height: calc(100% - 6px);
		place-items: center;
		border-radius: 50%;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.day:active:not(:disabled) > span {
		transform: scale(0.9);
	}
	.day[data-edge] {
		color: var(--arc-accent-foreground);
		font-weight: 500;
		transition-delay: 40ms;
	}
	.day[data-today]::after {
		content: '';
		position: absolute;
		bottom: 5px;
		left: 50%;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--arc-accent);
	}
	.day[data-today][data-edge]::after {
		background: var(--arc-accent-foreground);
	}
	.day:disabled {
		color: var(--arc-text-muted);
		cursor: default;
		opacity: 0.5;
	}
	.day:focus-visible:not([data-edge]) > span {
		background: color-mix(in oklch, var(--arc-foreground) 7%, transparent);
	}
	@media (hover: hover) and (pointer: fine) {
		.day:hover:not(:disabled):not([data-edge]) > span {
			background: color-mix(in oklch, var(--arc-foreground) 7%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.day,
		.day > span {
			transition-duration: 0ms;
		}
	}
</style>
