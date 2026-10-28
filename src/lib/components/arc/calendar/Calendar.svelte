<script module lang="ts">
	export type CalendarDateMatcher = (date: Date) => boolean;
</script>

<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { animate, motionValue } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { intlLocale } from '../locale';
	import { strings } from '../strings';
	import { isReducedMotion, motionTokens, presence } from '../motion';
	import CalendarMonth from './CalendarMonth.svelte';
	import {
		addDays,
		addMonths,
		dateKey,
		fromIndex,
		isAfter,
		isBefore,
		monthIndex,
		monthStart,
		MS_PER_DAY,
		sameDay,
		sameMonth,
		shiftMonths,
		startOfDay
	} from './dates';
	import { Today } from './today.svelte';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'onchange'> & {
		value?: Date;
		onChange?: (date: Date) => void;
		month?: Date;
		onMonthChange?: (month: Date) => void;
		minDate?: Date;
		maxDate?: Date;
		disabledDates?: CalendarDateMatcher;
		locale?: string;
		/** Adds a Today button that slides back to the current month and selects today when it is available. */
		showToday?: boolean;
	};

	let {
		value = $bindable(),
		onChange,
		month = $bindable(),
		onMonthChange,
		minDate,
		maxDate,
		disabledDates,
		locale = intlLocale(),
		showToday = false,
		class: className,
		...rest
	}: Props = $props();

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const today = new Today();

	/** Months sit side by side on one strip. Rapid clicks retarget the same spring, so the strip never queues or stacks panes. */
	const stripSpring = {
		type: 'spring',
		visualDuration: 0.36,
		bounce: 0,
		restDelta: 0.002
	} as const;
	const STRIP_GAP_PX = 16;
	const PASSING_DIM = 0.6;
	const LONG_JUMP_MONTHS = 2;
	const SPAN_EPSILON = 1e-3;
	const MAX_SKIPPED_DAYS = 42;
	const TITLE_SHIFT_PX = 10;
	const DAYS_PER_WEEK = 7;
	const WEEKS_SHOWN = 6;
	const SUNDAY_IN_2024 = 7;
	const WEEKDAY_LETTERS = 2;

	// Without a value or month the calendar waits for the client's today, then settles on that month once.
	const shownMonth = $derived.by(() => {
		const anchor = month ?? value ?? today.current;
		return anchor && monthStart(anchor);
	});
	$effect.pre(() => {
		if (!month && shownMonth) month = shownMonth;
	});
	const monthTime = $derived(shownMonth?.getTime());
	const monthKey = $derived(shownMonth ? dateKey(shownMonth) : 'pending');

	// Direction is read from the month itself, so arrows, keys, Today, and a controlled month all travel the same way.
	let direction = $state(0);
	let lastMonthTime = untrack(() => monthTime);
	$effect.pre(() => {
		const time = monthTime;
		if (time === lastMonthTime) return;
		direction =
			lastMonthTime === undefined || time === undefined ? 0 : time > lastMonthTime ? 1 : -1;
		lastMonthTime = time;
	});

	// The strip position is measured in months. The panes on either side of it render, plus the month being navigated to.
	const target = $derived(shownMonth ? monthIndex(shownMonth) : 0);
	const strip = motionValue(untrack(() => target));
	let position = $state(untrack(() => target));
	let placed = untrack(() => shownMonth !== undefined);
	$effect(() => {
		const unsubscribe = strip.on('change', (next) => (position = next));
		return () => {
			unsubscribe();
			strip.stop();
		};
	});
	$effect(() => {
		if (!shownMonth) return;
		const to = target;
		const from = strip.get();
		if (from === to) return;
		// The first month and reduced motion land in place; everything else slides on the strip.
		if (!placed || isReducedMotion()) {
			placed = true;
			strip.jump(to);
			return;
		}
		// Long jumps (Today, a year with Shift) start one month away, so the strip never scrolls through the months between.
		if (Math.abs(to - from) > LONG_JUMP_MONTHS) strip.jump(to - Math.sign(to - from));
		const controls = animate(strip, to, stripSpring);
		return () => controls.stop();
	});
	const paneIndexes = $derived.by(() => {
		const span = [Math.floor(position + SPAN_EPSILON), Math.ceil(position - SPAN_EPSILON)];
		return [...new Set([...span, target])].sort((a, b) => a - b);
	});

	function paneStyle(index: number) {
		const offset = index - position;
		const opacity = 1 - Math.min(1, Math.abs(offset)) * PASSING_DIM;
		return `transform: translateX(calc(${offset * 100}% + ${offset * STRIP_GAP_PX}px)); opacity: ${opacity}`;
	}

	const titleFormatter = $derived(
		new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
	);
	const weekdays = $derived.by(() => {
		const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
		return Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
			formatter.format(new Date(2024, 0, SUNDAY_IN_2024 + index))
		);
	});
	const monthLabel = $derived(shownMonth ? titleFormatter.format(shownMonth) : '');

	// The selected disc glides between days, so each number flips color as the disc actually passes it:
	// the day it leaves waits longer on short hops, the day it lands on waits longer on long ones.
	const valueKey = $derived(value ? dateKey(value) : '');
	let handoff = $state({ from: '', to: '', distance: 0 });
	let lastSelection = untrack(() => ({ key: valueKey, date: value }));
	$effect.pre(() => {
		const key = valueKey;
		if (key === lastSelection.key) return;
		const previous = lastSelection.date;
		const days =
			previous && value
				? Math.round((startOfDay(value).getTime() - startOfDay(previous).getTime()) / MS_PER_DAY)
				: 0;
		const columns = previous && value ? value.getDay() - previous.getDay() : 0;
		handoff = {
			from: lastSelection.key,
			to: key,
			distance: Math.hypot(columns, (days - columns) / DAYS_PER_WEEK)
		};
		lastSelection = { key, date: value };
	});

	function numberDelay(key: string) {
		const { from, to, distance } = handoff;
		if (!distance || isReducedMotion() || (key !== to && key !== from)) return undefined;
		const delay =
			key === to ? Math.min(260, 95 + 85 * Math.log(distance)) : Math.max(20, 130 / distance);
		return `--number-delay: ${Math.round(delay)}ms`;
	}

	const isDisabled = (date: Date) =>
		isBefore(date, minDate) || isAfter(date, maxDate) || Boolean(disabledDates?.(date));
	const previousMonth = $derived(shownMonth && addMonths(shownMonth, -1));
	const nextMonth = $derived(shownMonth && addMonths(shownMonth, 1));
	// While the month is still unknown the controls keep their resting look, so the first paint does not flash them dim.
	const previousDisabled = $derived(
		Boolean(previousMonth && minDate && previousMonth.getTime() < monthStart(minDate).getTime())
	);
	const nextDisabled = $derived(
		Boolean(nextMonth && maxDate && nextMonth.getTime() > monthStart(maxDate).getTime())
	);
	const todaySelectable = $derived(Boolean(today.current && !isDisabled(today.current)));
	const todayIdle = $derived(
		Boolean(
			today.current &&
			sameMonth(shownMonth, today.current) &&
			(!todaySelectable || sameDay(value, today.current))
		)
	);

	let focusedDate = $state(untrack(() => value));
	// Roving tab stop: the day last focused, else the selection, else today, else the first open day of the month.
	const tabbableKey = $derived.by(() => {
		const open = (date?: Date) =>
			date && sameMonth(date, shownMonth) && !isDisabled(date) ? dateKey(date) : '';
		const firstOpen = () => {
			if (!shownMonth) return new Date(0);
			for (let day = shownMonth; sameMonth(day, shownMonth); day = addDays(day, 1))
				if (!isDisabled(day)) return day;
			return new Date(0);
		};
		return open(focusedDate) || open(value) || open(today.current) || dateKey(firstOpen());
	});

	function select(date: Date) {
		value = date;
		onChange?.(date);
	}

	function changeMonth(to: Date) {
		const normalized = monthStart(to);
		month = normalized;
		onMonthChange?.(normalized);
	}

	let viewport: HTMLDivElement;
	let focusRequest = $state<string | null>(null);
	/** Keyboard focus lands on the new day in the same frame the month starts to slide. */
	$effect(() => {
		const key = focusRequest;
		void target;
		if (!key) return;
		const button = viewport.querySelector<HTMLButtonElement>(`[data-present] [data-date="${key}"]`);
		if (!button) return;
		focusRequest = null;
		button.focus({ preventScroll: true });
	});

	function clampToRange(date: Date) {
		if (minDate && isBefore(date, minDate)) return startOfDay(minDate);
		if (maxDate && isAfter(date, maxDate)) return startOfDay(maxDate);
		return date;
	}

	/** Clamps a keyboard move to the allowed range and steps past blocked days in the direction of travel. */
	function moveFocus(from: Date, to: Date, step: number) {
		let next = clampToRange(to);
		for (let tries = 0; tries < MAX_SKIPPED_DAYS && isDisabled(next); tries += 1)
			next = addDays(next, step);
		if (isDisabled(next) || sameDay(next, from)) return;
		focusedDate = next;
		focusRequest = dateKey(next);
		if (!sameMonth(next, shownMonth)) changeMonth(next);
	}

	function onDayKeyDown(event: KeyboardEvent, date: Date) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (!isDisabled(date)) select(date);
			return;
		}
		const yearStep = event.shiftKey ? 12 : 1;
		const moves: Record<string, [Date, number]> = {
			ArrowLeft: [addDays(date, -1), -1],
			ArrowRight: [addDays(date, 1), 1],
			ArrowUp: [addDays(date, -DAYS_PER_WEEK), -1],
			ArrowDown: [addDays(date, DAYS_PER_WEEK), 1],
			Home: [addDays(date, -date.getDay()), 1],
			End: [addDays(date, DAYS_PER_WEEK - 1 - date.getDay()), -1],
			PageUp: [shiftMonths(date, -yearStep), -1],
			PageDown: [shiftMonths(date, yearStep), 1]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		moveFocus(date, move[0], move[1]);
	}

	function goToToday() {
		const now = today.current;
		if (!now || !shownMonth || todayIdle) return;
		focusedDate = now;
		if (!sameMonth(now, shownMonth)) changeMonth(now);
		if (todaySelectable && !sameDay(value, now)) select(now);
	}

	const todayLabel = $derived(
		today.current
			? strings.calendarTodayDate({
					date: today.current.toLocaleDateString(locale, { dateStyle: 'full' })
				})
			: strings.calendarToday()
	);
</script>

<section class={['calendar', className]} aria-labelledby={titleId} {...rest}>
	<div class="header">
		<h2 id={titleId} class="heading">
			<span class="sr-only">{monthLabel}</span>
			<!-- The title swaps at once and eases in from the side the strip travels from; a new click restarts it, so titles never pile up. -->
			<span class="title" aria-hidden="true">
				{#if shownMonth}
					{#key monthKey}
						<span
							class="title-row"
							in:presence={{
								x: direction * TITLE_SHIFT_PX,
								duration: direction ? motionTokens.duration.standard : 0
							}}
						>
							{monthLabel}
						</span>
					{/key}
				{/if}
			</span>
		</h2>
		<span class="sr-only" aria-live="polite">{direction ? monthLabel : ''}</span>
		<div class="navigation">
			{#if showToday}
				<button
					type="button"
					class="today-button"
					aria-disabled={todayIdle || undefined}
					aria-label={todayLabel}
					onclick={goToToday}
				>
					{strings.calendarToday()}
				</button>
			{/if}
			<button
				type="button"
				class="nav-button"
				aria-label={strings.calendarPreviousMonth()}
				aria-disabled={previousDisabled || undefined}
				onclick={() => {
					if (!previousDisabled && previousMonth) changeMonth(previousMonth);
				}}
			>
				<ChevronLeftIcon size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
			<button
				type="button"
				class="nav-button"
				aria-label={strings.calendarNextMonth()}
				aria-disabled={nextDisabled || undefined}
				onclick={() => {
					if (!nextDisabled && nextMonth) changeMonth(nextMonth);
				}}
			>
				<ChevronRightIcon size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
		</div>
	</div>
	<div class="weekdays" aria-hidden="true">
		{#each weekdays as day, index (index)}
			<span>{day.slice(0, WEEKDAY_LETTERS)}</span>
		{/each}
	</div>
	<div bind:this={viewport} class="month-viewport">
		{#if shownMonth}
			{#each paneIndexes as index (index)}
				{@const present = index === target}
				{@const paneMonth = fromIndex(index)}
				<div
					class="month-body"
					style={paneStyle(index)}
					data-present={present || undefined}
					aria-hidden={present ? undefined : true}
					inert={!present}
				>
					<CalendarMonth
						month={paneMonth}
						{present}
						{value}
						today={today.current}
						{tabbableKey}
						label={titleFormatter.format(paneMonth)}
						{locale}
						{isDisabled}
						{numberDelay}
						onSelect={select}
						{onDayKeyDown}
						onDayFocus={(date) => (focusedDate = date)}
					/>
				</div>
			{/each}
		{:else}
			<div class="month-body" aria-hidden="true">
				<div class="placeholder-grid">
					{#each { length: WEEKS_SHOWN }}
						<div class="placeholder-week">
							{#each { length: DAYS_PER_WEEK }}
								<span class="placeholder-day"></span>
							{/each}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.calendar {
		width: min(100%, 328px);
		min-width: 0;
		color: var(--arc-foreground);
	}
	/* The header is its own size container: below 260px the title takes a full row and the controls sit under it, decided by width alone so a long month name never reflows it. */
	.header {
		container-type: inline-size;
		display: grid;
		min-height: 34px;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 4px 12px;
		margin-bottom: 14px;
	}
	@container (max-width: 259px) {
		.heading,
		.navigation {
			grid-column: 1 / -1;
		}
		.navigation {
			justify-self: end;
		}
	}
	.heading {
		min-width: 0;
		margin: 0;
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-base);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
	}
	/* The global heading rule forces a tight line-height on h2, so the title row sets its own to center with the controls. */
	.title {
		display: flex;
		line-height: var(--arc-leading-body);
	}
	.title-row {
		display: inline-block;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.navigation {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 2px;
		margin-right: -6px;
	}
	/* Quiet header controls: a fill on hover, a short press, and a spring release. */
	.nav-button,
	.today-button {
		display: grid;
		height: 32px;
		place-items: center;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-secondary);
		font: inherit;
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			scale var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.nav-button {
		width: 32px;
	}
	.today-button {
		padding: 0 11px;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: 1;
	}
	@media (hover: hover) and (pointer: fine) {
		.nav-button:hover:not([aria-disabled]),
		.today-button:hover:not([aria-disabled]) {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.nav-button:active:not([aria-disabled]),
	.today-button:active:not([aria-disabled]) {
		scale: 0.96;
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-fast), 100ms;
		transition-timing-function: var(--arc-ease-standard);
	}
	.nav-button[aria-disabled],
	.today-button[aria-disabled] {
		cursor: default;
		opacity: 0.36;
	}
	.weekdays,
	.placeholder-week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		column-gap: 4px;
	}
	.weekdays {
		margin-bottom: 6px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: 24px;
		text-align: center;
	}
	.weekdays span {
		min-width: 0;
		overflow: hidden;
	}
	/* Months sit on one strip inside a clipped window. Every pane shares one grid cell and has six weeks, so the height never changes. */
	.month-viewport {
		position: relative;
		display: grid;
		overflow: hidden;
		contain: paint;
	}
	.month-body {
		grid-area: 1 / 1;
		min-width: 0;
		will-change: transform;
	}
	.month-body[inert] {
		pointer-events: none;
	}
	.placeholder-grid {
		display: grid;
		row-gap: 4px;
	}
	.placeholder-day {
		aspect-ratio: 1;
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-button,
		.today-button {
			transition: none;
		}
		.nav-button:active,
		.today-button:active {
			scale: none;
		}
	}
</style>
