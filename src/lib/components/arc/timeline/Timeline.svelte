<script module lang="ts">
	import type { TimelineEvent, TimelineRow } from './types';

	type Group = { day: string; label: string; rows: TimelineRow[] };
	type Known = { ids: Set<string>; fresh: Set<string>; announcement: string };

	const HOUR_MS = 3_600_000;
	const MINUTE_MS = 60_000;
	const DAY_MS = 24 * HOUR_MS;
	/** Rows from the last 12 hours of today read as relative times; older ones show the clock time. */
	const RELATIVE_WINDOW_MS = 12 * HOUR_MS;

	function timeOf(event: TimelineEvent) {
		return new Date(event.at).getTime();
	}

	function dayKey(time: number, timeZone: string) {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(new Date(time));
		const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
		return `${get('year')}-${get('month')}-${get('day')}`;
	}

	function relative(time: number, now: number) {
		const minutes = Math.max(0, Math.floor((now - time) / MINUTE_MS));
		if (minutes < 1) return { short: 'Now', long: 'just now' };
		if (minutes < 60)
			return {
				short: `${minutes}m`,
				long: `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
			};
		const hours = Math.floor(minutes / 60);
		return { short: `${hours}h`, long: `${hours} ${hours === 1 ? 'hour' : 'hours'} ago` };
	}

	function describe(event: TimelineEvent) {
		return [event.actor, event.title].filter(Boolean).join(' ');
	}

	function updates(count: number) {
		return count === 1 ? 'update' : 'updates';
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { TransitionConfig } from 'svelte/transition';
	import { springEasing } from '../copy-button';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import RollingCount from './RollingCount.svelte';
	import TimelineRowView from './TimelineRow.svelte';

	/**
	 * A vertical activity feed grouped by day, for project history, audit logs, and deploy streams. Use it when order and
	 * recency matter; use a table when people need to sort or compare. Day labels stay pinned while their updates scroll,
	 * the connecting line draws itself as rows come into view, rows expand in place, and new updates slide in at the top
	 * while the rest glide down. Arrow keys move between rows, Enter or Space expands one.
	 */
	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Updates in any order; the newest shows first. */
		events: TimelineEvent[];
		/** Reference time for relative labels and day groups, in epoch milliseconds. Pass a ticking clock to keep labels fresh. */
		now: number;
		/** Accessible name for the feed. */
		label: string;
		/** Time zone for day groups and clock times. Fixed by default so server and client agree. */
		timeZone?: string;
		locale?: string;
		/** Height of the scrolling area. Without it the feed grows with the page and reveals on page scroll. */
		maxHeight?: number | string;
		/** Scroll back to the top when a new update arrives while the feed is scrolled down. */
		scrollToNew?: boolean;
		defaultExpanded?: string[];
		/** Heading level for the day labels. */
		headingLevel?: 2 | 3 | 4 | 5 | 6;
	};

	let {
		events,
		now,
		label,
		timeZone = 'UTC',
		locale = 'en-US',
		maxHeight,
		scrollToNew = true,
		defaultExpanded = [],
		headingLevel = 3,
		class: className,
		...rest
	}: Props = $props();

	const id = $props.id();
	const MS_PER_SECOND = 1000;
	/** Seconds between rows revealed together, so the line reads as drawing downward. */
	const REVEAL_STEP_S = 0.09;
	/** Rows revealed at once never wait longer than this for their turn. */
	const MAX_REVEAL_WAIT_S = 0.45;
	/** Pixels of scroll left below before the bottom edge stops feathering. */
	const MORE_BELOW_PX = 2;
	const REDUCED_FADE_S = 0.15;
	const DAY_EXIT_S = 0.2;
	const REDUCED_DAY_EXIT_S = 0.1;
	const smooth = springEasing(motionTokens.spring.smooth);

	const reduced = $derived(isReducedMotion());
	const scrolls = $derived(maxHeight !== undefined);
	const scrollerHeight = $derived(typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight);

	let expanded = $state(new Set(untrack(() => defaultExpanded)));
	let scroller: HTMLDivElement;
	let track: HTMLDivElement;

	// Rows added after the first render are fresh: they slide in and the rest glide down. Their titles are announced.
	let known: Known = untrack(() => ({
		ids: new Set(events.map((event) => event.id)),
		fresh: new Set(),
		announcement: ''
	}));
	const tracked = $derived.by(() => {
		const added = events.filter((event) => !known.ids.has(event.id));
		known = {
			ids: new Set(events.map((event) => event.id)),
			fresh: new Set([...known.fresh, ...added.map((event) => event.id)]),
			announcement: added.length
				? `New update: ${added.map(describe).join('. ')}`
				: known.announcement
		};
		return known;
	});

	const initialDays = untrack(
		() => new Set(events.map((event) => dayKey(timeOf(event), timeZone)))
	);

	const groups = $derived.by<Group[]>(() => {
		const today = dayKey(now, timeZone);
		const yesterday = dayKey(now - DAY_MS, timeZone);
		const heading = new Intl.DateTimeFormat(locale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone
		});
		const byDay = new Map<string, TimelineRow[]>();
		const rows = events
			.map((event) => ({ ...event, time: timeOf(event) }))
			.sort((a, b) => b.time - a.time);
		for (const event of rows) {
			const day = dayKey(event.time, timeZone);
			byDay.set(day, [...(byDay.get(day) ?? []), { ...event, day }]);
		}
		return [...byDay].map(([day, dayRows]) => ({
			day,
			rows: dayRows,
			label:
				day === today
					? 'Today'
					: day === yesterday
						? 'Yesterday'
						: heading.format(new Date(dayRows[0].time))
		}));
	});

	const formats = $derived({
		clock: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }),
		full: new Intl.DateTimeFormat(locale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			timeZone
		})
	});

	function timeLabels(group: Group, row: TimelineRow) {
		const full = formats.full.format(new Date(row.time));
		if (group.label === 'Today' && now - row.time < RELATIVE_WINDOW_MS) {
			const time = relative(row.time, now);
			return { short: time.short, full: `${time.long}, ${full}` };
		}
		return { short: formats.clock.format(new Date(row.time)), full };
	}

	// Rows that come into view together are spaced a beat apart, so the line reads as drawing down the feed.
	let nextReveal = 0;
	function schedule() {
		if (isReducedMotion()) return 0;
		const current = performance.now() / MS_PER_SECOND;
		const start = Math.min(Math.max(current, nextReveal), current + MAX_REVEAL_WAIT_S);
		nextReveal = start + REVEAL_STEP_S;
		return start - current;
	}

	// The bottom edge feathers while more updates wait below, and clears once the end is in view.
	$effect(() => {
		if (!scrolls) return;
		const update = () => {
			const below = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
			if (below > MORE_BELOW_PX) scroller.dataset.more = '';
			else delete scroller.dataset.more;
		};
		update();
		scroller.addEventListener('scroll', update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(scroller);
		observer.observe(track);
		return () => {
			scroller.removeEventListener('scroll', update);
			observer.disconnect();
		};
	});

	const newestId = $derived(
		events.reduce<TimelineEvent | null>(
			(latest, event) => (!latest || timeOf(event) > timeOf(latest) ? event : latest),
			null
		)?.id
	);
	$effect(() => {
		void newestId;
		if (!scrollToNew || scroller.scrollTop < 1) return;
		scroller.scrollTo({ top: 0, behavior: untrack(() => reduced) ? 'auto' : 'smooth' });
	});

	function toggle(rowId: string) {
		const next = new Set(expanded);
		if (next.has(rowId)) next.delete(rowId);
		else next.add(rowId);
		expanded = next;
	}

	const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

	function onKeyDown(event: KeyboardEvent) {
		if (!NAVIGATION_KEYS.has(event.key)) return;
		const triggers = [...scroller.querySelectorAll<HTMLElement>('[data-timeline-trigger]')];
		const index = triggers.indexOf(document.activeElement as HTMLElement);
		if (index < 0) return;
		event.preventDefault();
		const step = event.key === 'ArrowDown' ? 1 : -1;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? triggers.length - 1
					: Math.min(Math.max(index + step, 0), triggers.length - 1);
		triggers[next]?.focus();
	}

	/** A new day opens from nothing and pushes the older days down; it clips only while it grows. */
	function dayIn(node: HTMLElement, fresh: boolean): TransitionConfig {
		if (!fresh) return { duration: 0 };
		if (isReducedMotion()) {
			return { duration: REDUCED_FADE_S * MS_PER_SECOND, css: (t) => `opacity:${t}` };
		}
		const full = node.offsetHeight;
		const fadeShare = motionTokens.duration.standard / smooth.duration;
		return {
			duration: smooth.duration * MS_PER_SECOND,
			css: (t) =>
				`overflow:clip;height:${full * smooth.easing(t)}px;opacity:${ease.enter(Math.min(1, t / fadeShare))}`
		};
	}

	function dayOut(node: HTMLElement): TransitionConfig {
		const full = node.offsetHeight;
		return {
			duration: (isReducedMotion() ? REDUCED_DAY_EXIT_S : DAY_EXIT_S) * MS_PER_SECOND,
			easing: ease.standard,
			css: (t) => `overflow:clip;height:${full * t}px;opacity:${t}`
		};
	}
</script>

<div class={['root', className]} role="region" aria-label={label} {...rest}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={scroller}
		class="scroller"
		data-scrolls={scrolls || undefined}
		style:--timeline-height={scrollerHeight}
		onkeydown={onKeyDown}
	>
		<div bind:this={track}>
			{#each groups as group (group.day)}
				{@const headingId = `${id}-${group.day}`}
				{@const count = group.rows.length}
				<section
					class="group"
					aria-labelledby={headingId}
					in:dayIn={!initialDays.has(group.day)}
					out:dayOut
				>
					<div class="day" role="heading" aria-level={headingLevel} id={headingId}>
						<span>{group.label}</span>
						<span class="count" aria-hidden="true"
							><RollingCount value={count} /> {updates(count)}</span
						>
						<span class="sr-only">{`, ${count} ${updates(count)}`}</span>
					</div>
					<ol class="list">
						{#each group.rows as row, index (row.id)}
							{@const time = timeLabels(group, row)}
							<TimelineRowView
								{row}
								last={index === group.rows.length - 1}
								expanded={expanded.has(row.id)}
								fresh={tracked.fresh.has(row.id)}
								timeLabel={time.short}
								timeFull={time.full}
								{schedule}
								onToggle={() => toggle(row.id)}
							/>
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	</div>
	<span class="sr-only" role="status">{tracked.announcement}</span>
</div>

<style>
	/* Geometry: a 28px marker column, the line centred under it, and rows whose first text line centres on the marker. */
	.root {
		--marker: 28px;
		--marker-top: 8px;
		--line-gap: 4px;
		position: relative;
		display: grid;
		min-width: 0;
		color: var(--arc-foreground);
	}
	/* Inserting at the top pushes the rows down instead of the browser holding the scroll position still. */
	.scroller {
		min-width: 0;
		overflow-anchor: none;
	}
	@property --timeline-feather {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}
	.scroller[data-scrolls] {
		max-height: var(--timeline-height);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-color: var(--arc-border-strong) transparent;
		scrollbar-width: thin;
		mask-image: linear-gradient(to bottom, #000 calc(100% - var(--timeline-feather)), transparent);
		transition: --timeline-feather var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* While more updates wait below, the last visible row fades into the edge instead of being cut. */
	.scroller[data-more] {
		--timeline-feather: 36px;
	}
	.group {
		position: relative;
	}
	/* Day labels stay pinned while their updates scroll under them. Set --timeline-surface when the feed sits on another surface. */
	.day {
		position: sticky;
		z-index: 2;
		top: 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--arc-space-3);
		padding: var(--arc-space-2) var(--arc-space-3) var(--arc-space-2) 0;
		background: var(--timeline-surface, var(--arc-surface));
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.count {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.list {
		margin: 0 0 var(--arc-space-3);
		padding: 0;
		list-style: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.scroller[data-scrolls] {
			transition: --timeline-feather 150ms linear;
		}
	}
</style>
