<script lang="ts">
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Today } from '../calendar';
	import {
		addDays,
		addMonths,
		dateKey,
		dayDiff,
		fromKey,
		monthDiff,
		monthStart,
		sameDay,
		shiftMonths,
		startOfDay
	} from '../calendar/dates';
	import { motionPresence, physicalSpring } from '../text-morph/transitions';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import { TimeDirection } from './direction.svelte';
	import { defaultDateRangePresets, type DateRange, type DateRangePreset } from './presets';
	import RangeMonth from './RangeMonth.svelte';
	import Rolling from './Rolling.svelte';

	/**
	 * A range picker whose trigger grows into the panel it opens. The panel shows two months beside a preset rail, or one
	 * month with a scrolling preset row when space is tight. On Apply the formatted label flies back into the trigger as
	 * the surface shrinks around it.
	 */
	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange'> & {
		/** Controlled value. Pass `null` for no selection. */
		value?: DateRange | null;
		defaultValue?: DateRange | null;
		/** Called with the applied range. */
		onChange?: (range: DateRange) => void;
		/** Accessible name of the trigger and the dialog. */
		label?: string;
		placeholder?: string;
		presets?: DateRangePreset[];
		minDate?: Date;
		maxDate?: Date;
		/** 0 is Sunday, 1 is Monday. */
		weekStartsOn?: 0 | 1;
		locale?: string;
		/** Force one or two months. `auto` picks two when the boundary is wide enough. */
		months?: 'auto' | 1 | 2;
		/** The element the panel should stay inside. Defaults to the viewport. */
		boundary?: () => HTMLElement | null;
	};

	let {
		defaultValue = null,
		value = $bindable(untrack(() => defaultValue)),
		onChange,
		label = 'Date range',
		placeholder = 'Select dates',
		presets = defaultDateRangePresets,
		minDate,
		maxDate,
		weekStartsOn = 0,
		locale = 'en-US',
		months = 'auto',
		boundary,
		class: className,
		...rest
	}: Props = $props();

	type Size = { w: number; h: number };

	const GROW = physicalSpring(0.48, 0.12);
	const SHRINK = physicalSpring(0.38, 0);
	const GLIDE = physicalSpring(0.3, 0.1);
	const SLIDE = physicalSpring(0.4, 0.06);
	const TRIGGER_RADIUS = 18;
	const PANEL_RADIUS = 26;
	const WIDE_CELL = 36;
	const WIDE_MIN = 712;
	const COMPACT_MAX_WIDTH = 352;
	const COMPACT_CELL = { min: 32, max: 42, inset: 24 };
	const EDGE = 8;
	const RAIL_SCROLL_INSET = 12;
	const MONTH_SLIDE = { in: 48, out: 36 };
	const DAYS_PER_WEEK = 7;
	const MONTHS_PER_YEAR = 12;
	const { blur, spring } = motionTokens;

	const uid = $props.id();
	const panelId = `${uid}-panel`;
	const today = new Today();

	let open = $state(false);
	let compact = $state(false);
	let panelWidth = $state(0);
	let view = $state(monthStart(untrack(() => value)?.end ?? new Date(2000, 0, 1)));
	let direction = $state(1);
	let draft = $state<DateRange | null>(untrack(() => value));
	let anchor = $state<Date | null>(null);
	let hover = $state<Date | null>(null);
	let focusKey = $state('');

	const formatters = $derived({
		label: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }),
		title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
		day: new Intl.DateTimeFormat(locale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		}),
		weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
		weekdayLong: new Intl.DateTimeFormat(locale, { weekday: 'long' })
	});
	function format(range: DateRange | null) {
		if (!range) return placeholder;
		if (sameDay(range.start, range.end)) return formatters.label.format(range.start);
		return formatters.label.formatRange(range.start, range.end);
	}

	const ordered = (a: Date, b: Date): DateRange =>
		dayDiff(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
	const sameRange = (a?: DateRange | null, b?: DateRange | null) =>
		Boolean(a && b && sameDay(a.start, b.start) && sameDay(a.end, b.end));
	const rangeTime = (range: DateRange | null) =>
		range ? range.start.getTime() * 2 + range.end.getTime() : null;
	function clampDate(date: Date) {
		if (minDate && dayDiff(date, minDate) < 0) return startOfDay(minDate);
		if (maxDate && dayDiff(date, maxDate) > 0) return startOfDay(maxDate);
		return date;
	}

	const count = $derived(compact ? 1 : 2);
	const visible = $derived(Array.from({ length: count }, (_, index) => addMonths(view, index)));
	const shown = $derived(anchor ? ordered(anchor, hover ?? anchor) : draft);
	const activePreset = $derived(
		today.current && !anchor
			? presets.findIndex((preset) => sameRange(preset.range(today.current!), draft))
			: -1
	);
	const days = $derived(shown ? dayDiff(shown.end, shown.start) + 1 : 0);
	const committedDirection = new TimeDirection(() => rangeTime(value));
	const shownDirection = new TimeDirection(() => rangeTime(shown));

	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let triggerValue: HTMLSpanElement;
	let triggerIcon: HTMLSpanElement;
	let chevron: HTMLSpanElement;
	let surface: HTMLDivElement;
	let panel = $state<HTMLDivElement>();
	let summaryValue = $state<HTMLSpanElement>();
	let rail = $state<HTMLDivElement>();
	let railHighlight = $state<HTMLSpanElement>();
	let pendingFocus: 'trigger' | 'day' | null = null;

	/* One surface: the trigger's box springs to the panel's box and back. */
	// Before the first measurement the surface simply fills the root and the root wraps the trigger, so server markup already looks right.
	const sizes: { trigger: Size; panel: Size | null } = { trigger: { w: 0, h: 0 }, panel: null };
	let surfaceReady = false;
	let queued = false;

	function bounds() {
		const element = boundary?.();
		const viewport = { left: 0, right: document.documentElement.clientWidth };
		if (!element) return viewport;
		const rect = element.getBoundingClientRect();
		return {
			left: Math.max(viewport.left, rect.left),
			right: Math.min(viewport.right, rect.right)
		};
	}

	function panelOffset(panelSize: Size) {
		const rect = root.getBoundingClientRect();
		const box = bounds();
		const overflowRight = Math.min(0, box.right - EDGE - (rect.left + panelSize.w));
		return Math.max(overflowRight, box.left + EDGE - rect.left);
	}

	function updateSurface() {
		queued = false;
		const { trigger: triggerSize, panel: panelSize } = sizes;
		if (!triggerSize.w) return;
		const isOpen = untrack(() => open);
		const openPanel = isOpen && panelSize ? panelSize : null;
		const target = openPanel ?? triggerSize;
		const frame = {
			width: target.w,
			height: target.h,
			borderRadius: openPanel ? PANEL_RADIUS : TRIGGER_RADIUS,
			x: openPanel ? panelOffset(openPanel) : 0
		};
		if (!surfaceReady || isReducedMotion()) {
			animate(surface, frame, { duration: 0 });
			animate(root, { width: triggerSize.w }, { duration: 0 });
			surfaceReady = true;
			return;
		}
		animate(surface, frame, isOpen ? GROW : SHRINK);
		animate(root, { width: triggerSize.w }, spring.morph);
	}

	function scheduleSurface() {
		if (queued) return;
		queued = true;
		queueMicrotask(updateSurface);
	}

	$effect(() => {
		if (!open) sizes.panel = null;
		void isReducedMotion();
		scheduleSurface();
	});

	$effect(() => {
		const read = () => {
			sizes.trigger = { w: trigger.offsetWidth, h: trigger.offsetHeight };
			scheduleSurface();
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(trigger);
		return () => observer.disconnect();
	});

	$effect(() => {
		const node = panel;
		if (!open || !node) return;
		const read = () => {
			sizes.panel = { w: node.offsetWidth, h: node.offsetHeight };
			scheduleSurface();
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		return () => observer.disconnect();
	});

	/* Layout: two months when there is room, one compact month otherwise. */
	function measureLayout() {
		const box = bounds();
		const available = Math.max(0, box.right - box.left - EDGE * 2);
		const single = months === 1 || (months === 'auto' && available < WIDE_MIN);
		return { single, width: Math.min(COMPACT_MAX_WIDTH, available) };
	}

	$effect(() => {
		if (!open) return;
		const onResize = () => {
			const next = measureLayout();
			compact = next.single;
			panelWidth = next.width;
			scheduleSurface();
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function viewFor(range: DateRange | null, single: boolean, fallback: Date) {
		const end = monthStart(range?.end ?? fallback);
		return single ? end : addMonths(end, -1);
	}

	/* The trigger's value flies to the panel footer and back, like a shared layout element. */
	let flightFrom: DOMRect | undefined;
	let quietPlaced = false;
	const quietOut = { opacity: 0, filter: `blur(${blur.subtle}px)` };
	const quietIn = { opacity: 1, filter: 'blur(0px)' };

	function quiet(isOpen: boolean, reduced: boolean) {
		const icons = [triggerIcon, chevron];
		const transition = isOpen
			? { duration: 0.12, ease: motionTokens.ease.standard }
			: { duration: 0.22, ease: motionTokens.ease.enter, delay: reduced ? 0 : 0.1 };
		const iconState = isOpen ? (reduced ? { opacity: 0 } : quietOut) : quietIn;
		icons.forEach((icon) => animate(icon, iconState, transition));
		// The shared label lands at full strength; only reduced motion fades it back.
		const labelTransition = isOpen || reduced ? transition : { duration: 0 };
		animate(triggerValue, { opacity: isOpen ? 0 : 1 }, labelTransition);
	}

	function fly(isOpen: boolean) {
		const from = flightFrom;
		flightFrom = undefined;
		const reduced = isReducedMotion();
		quiet(isOpen, reduced);
		const node = isOpen ? summaryValue : triggerValue;
		if (reduced || !from || !node) return;
		const to = node.getBoundingClientRect();
		animate(
			node,
			{ x: [from.left - to.left, 0], y: [from.top - to.top, 0] },
			isOpen ? GROW : SHRINK
		);
	}

	$effect(() => {
		const isOpen = open;
		if (!quietPlaced) {
			quietPlaced = true;
			return;
		}
		untrack(() => fly(isOpen));
	});

	function openPanel() {
		const now = today.current;
		if (!now) return;
		const layout = measureLayout();
		compact = layout.single;
		panelWidth = layout.width;
		draft = value;
		anchor = null;
		hover = null;
		view = viewFor(value, layout.single, now);
		direction = 0;
		focusKey = dateKey(value?.start ?? now);
		pendingFocus = 'day';
		flightFrom = triggerValue.getBoundingClientRect();
		open = true;
	}

	function close(returnFocus: boolean) {
		if (!open) return;
		if (returnFocus) pendingFocus = 'trigger';
		if (summaryValue && !isReducedMotion()) {
			flightFrom = summaryValue.getBoundingClientRect();
			summaryValue.style.opacity = '0';
		}
		direction = 0;
		open = false;
		anchor = null;
		hover = null;
	}

	function apply() {
		const next = anchor ? { start: anchor, end: anchor } : draft;
		if (!next) return;
		value = next;
		onChange?.(next);
		close(true);
	}

	/* Focus management */
	$effect(() => {
		void focusKey;
		void view;
		void compact;
		const isOpen = open;
		if (pendingFocus === 'trigger' && !isOpen) {
			pendingFocus = null;
			trigger.focus({ preventScroll: true });
			return;
		}
		if (pendingFocus !== 'day' || !isOpen || !panel) return;
		const day = panel.querySelector<HTMLButtonElement>(
			`[data-current]:not([inert]) [data-date="${focusKey}"]`
		);
		if (!day) return;
		pendingFocus = null;
		day.focus({ preventScroll: true });
	});

	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!root.contains(event.target as Node)) close(false);
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => document.removeEventListener('pointerdown', onPointerDown);
	});

	function onRootKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !open) return;
		event.preventDefault();
		event.stopPropagation();
		close(true);
	}

	function onRootFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (open && next && !root.contains(next)) close(false);
	}

	/* Month navigation and picking */
	function goTo(next: Date) {
		const delta = monthDiff(next, view);
		if (!delta) return;
		direction = Math.sign(delta);
		view = next;
	}

	/** Keeps a range on screen: nothing moves when it already fits, otherwise its last month lands on the right. */
	function reveal(range: DateRange) {
		const last = addMonths(view, count - 1);
		if (monthDiff(range.start, view) >= 0 && monthDiff(range.end, last) <= 0) return;
		goTo(viewFor(range, compact, range.end));
	}

	function pick(date: Date) {
		focusKey = dateKey(date);
		if (!anchor) {
			anchor = date;
			hover = date;
			return;
		}
		draft = ordered(anchor, date);
		anchor = null;
		hover = null;
	}

	function choosePreset(preset: DateRangePreset) {
		const now = today.current;
		if (!now) return;
		const range = preset.range(now);
		draft = range;
		anchor = null;
		hover = null;
		focusKey = dateKey(range.start);
		reveal(range);
	}

	function onDayKey(event: KeyboardEvent, date: Date) {
		const weekday = (date.getDay() - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
		const monthStep = event.shiftKey ? MONTHS_PER_YEAR : 1;
		const moves: Record<string, () => Date> = {
			ArrowLeft: () => addDays(date, -1),
			ArrowRight: () => addDays(date, 1),
			ArrowUp: () => addDays(date, -DAYS_PER_WEEK),
			ArrowDown: () => addDays(date, DAYS_PER_WEEK),
			Home: () => addDays(date, -weekday),
			End: () => addDays(date, DAYS_PER_WEEK - 1 - weekday),
			PageUp: () => shiftMonths(date, -monthStep),
			PageDown: () => shiftMonths(date, monthStep)
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		const next = clampDate(move());
		focusKey = dateKey(next);
		if (anchor) hover = next;
		pendingFocus = 'day';
		const last = addMonths(view, count - 1);
		if (monthDiff(next, view) < 0) goTo(monthStart(next));
		else if (monthDiff(next, last) > 0) goTo(addMonths(monthStart(next), -(count - 1)));
	}

	function onRailKey(event: KeyboardEvent) {
		const keys = compact ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
		if (!keys.includes(event.key)) return;
		const buttons = Array.from(
			(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-preset]')
		);
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		event.preventDefault();
		const step = event.key === keys[1] ? 1 : -1;
		buttons[(at + step + buttons.length) % buttons.length]?.focus();
	}

	/** The day that owns the tab stop: the focused day when it is on screen, else the first visible day of the range, else the 1st. */
	const tabbable = $derived.by(() => {
		const onScreen = (date: Date) =>
			visible.some((shownMonth) => monthDiff(date, shownMonth) === 0);
		if (focusKey && onScreen(fromKey(focusKey))) return focusKey;
		if (shown && onScreen(shown.start)) return dateKey(shown.start);
		return dateKey(visible[0]);
	});

	/* The preset highlight glides between presets. */
	let highlightShown = false;
	$effect(() => {
		const index = activePreset;
		const reduced = isReducedMotion();
		void open;
		const node = index < 0 ? null : rail?.querySelector<HTMLElement>(`[data-preset="${index}"]`);
		if (!railHighlight) return;
		if (!rail || !node) {
			highlightShown = false;
			animate(railHighlight, { opacity: 0 }, { duration: reduced ? 0 : 0.14 });
			return;
		}
		const place = {
			x: node.offsetLeft,
			y: node.offsetTop,
			width: node.offsetWidth,
			height: node.offsetHeight
		};
		animate(railHighlight, place, !highlightShown || reduced ? { duration: 0 } : GLIDE);
		highlightShown = true;
		animate(railHighlight, { opacity: 1 }, { duration: reduced ? 0 : 0.16 });
		const offscreen =
			node.offsetLeft < rail.scrollLeft ||
			node.offsetLeft + node.offsetWidth > rail.scrollLeft + rail.clientWidth;
		if (compact && offscreen) {
			rail.scrollTo({
				left: node.offsetLeft - RAIL_SCROLL_INSET,
				behavior: reduced ? 'auto' : 'smooth'
			});
		}
	});

	/* Copy */
	const committedText = $derived(format(value));
	const shownText = $derived(shown ? format(shown) : 'No dates');
	const countText = $derived(shown ? `${days} ${days === 1 ? 'day' : 'days'}` : '');
	const status = $derived.by(() => {
		if (!open) return '';
		if (anchor) return `Start ${formatters.label.format(anchor)}. Choose an end date.`;
		return shown ? `${shownText}, ${countText}` : '';
	});
	const cellSize = $derived(
		compact && panelWidth
			? Math.max(
					COMPACT_CELL.min,
					Math.min(COMPACT_CELL.max, Math.floor((panelWidth - COMPACT_CELL.inset) / DAYS_PER_WEEK))
				)
			: WIDE_CELL
	);
	const viewKey = $derived(`${dateKey(view)}-${count}`);

	/** Panel content arrives just behind the growing surface and leaves ahead of it. */
	const faceIn = { y: -4, blur: blur.soft, duration: 0.26, delay: 0.07, reducedFade: 0.12 };
	const faceOut = {
		y: -2,
		blur: blur.soft,
		duration: 0.12,
		easing: ease.standard,
		reducedFade: 0.08
	};
	const slideIn = (towards: number) => ({
		x: towards * MONTH_SLIDE.in,
		blur: blur.soft,
		spring: SLIDE,
		duration: 0.22,
		reducedFade: 0.12
	});
	const slideOut = (towards: number) => ({
		x: towards * -MONTH_SLIDE.out,
		blur: blur.soft,
		spring: SLIDE,
		duration: 0.14,
		easing: ease.standard,
		pop: true,
		reducedFade: 0.08
	});
	/** Keeps the panel mounted while its content leaves ahead of the shrinking surface. */
	const linger = (_node: Element) => ({ duration: 140 });
</script>

<div
	bind:this={root}
	class={['root', className]}
	data-open={open || undefined}
	onkeydown={onRootKeyDown}
	onfocusout={onRootFocusOut}
	role="presentation"
	{...rest}
>
	<!-- The trigger stays in place under the panel. Its icons fade, while the value itself flies to the panel footer and back. -->
	<button
		bind:this={trigger}
		type="button"
		class="trigger"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={open ? panelId : undefined}
		aria-label={`${label}: ${committedText}`}
		disabled={!today.current}
		inert={open || undefined}
		onclick={openPanel}
	>
		<span bind:this={triggerIcon} class="trigger-icon">
			<CalendarDaysIcon size={16} strokeWidth={1.75} aria-hidden="true" />
		</span>
		<span bind:this={triggerValue} class="value" data-empty={!value || undefined}>
			<Rolling text={committedText} direction={committedDirection.current} />
		</span>
		<span bind:this={chevron} class="chevron">
			<ChevronDownIcon size={16} strokeWidth={1.75} aria-hidden="true" />
		</span>
	</button>

	<div bind:this={surface} class="surface">
		{#if open && today.current}
			<div
				bind:this={panel}
				id={panelId}
				class="panel"
				role="dialog"
				aria-label={label}
				data-compact={compact || undefined}
				style:--cell="{cellSize}px"
				style:width={compact && panelWidth ? `${panelWidth}px` : undefined}
				out:linger
			>
				<div class="body" in:motionPresence={faceIn} out:motionPresence={faceOut}>
					<div
						bind:this={rail}
						class="rail"
						role="group"
						aria-label="Presets"
						onkeydown={onRailKey}
					>
						<span bind:this={railHighlight} class="rail-highlight" aria-hidden="true"></span>
						{#each presets as preset, index (preset.label)}
							<button
								type="button"
								class="preset"
								data-preset={index}
								aria-pressed={index === activePreset}
								onclick={() => choosePreset(preset)}
							>
								{preset.label}
							</button>
						{/each}
					</div>

					<div
						class="calendars"
						role="presentation"
						onpointerleave={() => {
							if (anchor) hover = null;
						}}
					>
						<button
							type="button"
							class="nav-button"
							data-side="prev"
							aria-label="Previous month"
							onclick={() => goTo(addMonths(view, -1))}
							disabled={Boolean(minDate && monthDiff(view, minDate) <= 0)}
						>
							<ChevronLeftIcon size={16} strokeWidth={1.75} aria-hidden="true" />
						</button>
						<button
							type="button"
							class="nav-button"
							data-side="next"
							aria-label="Next month"
							onclick={() => goTo(addMonths(view, 1))}
							disabled={Boolean(maxDate && monthDiff(addMonths(view, count - 1), maxDate) >= 0)}
						>
							<ChevronRightIcon size={16} strokeWidth={1.75} aria-hidden="true" />
						</button>
						<!-- The visible months travel together; a leaving set turns inert so focus and queries only find the current one. -->
						<div class="viewport">
							{#key viewKey}
								<div
									class="months"
									data-current
									in:motionPresence={slideIn(direction)}
									out:motionPresence={slideOut(direction)}
								>
									{#each visible as shownMonth (dateKey(shownMonth))}
										<RangeMonth
											month={shownMonth}
											range={shown}
											{tabbable}
											today={today.current}
											{minDate}
											{maxDate}
											{weekStartsOn}
											{formatters}
											idBase={uid}
											onPick={pick}
											onHover={(date) => {
												if (anchor) hover = date;
											}}
											onKey={onDayKey}
											onFocusDay={(date) => (focusKey = dateKey(date))}
										/>
									{/each}
								</div>
							{/key}
						</div>
					</div>
				</div>

				<div class="footer">
					<div class="summary">
						<span
							bind:this={summaryValue}
							class="summary-value"
							in:motionPresence={{ duration: 0, reducedFade: 0.12 }}
							out:motionPresence={{ duration: 0, reducedFade: 0.08 }}
						>
							<Rolling text={shownText} direction={shownDirection.current} />
						</span>
						<span class="summary-count" in:motionPresence={faceIn} out:motionPresence={faceOut}>
							{#if countText}
								<Rolling
									text={anchor && sameDay(anchor, hover) ? 'Pick an end date' : countText}
									direction={shownDirection.current}
								/>
							{/if}
						</span>
					</div>
					<div class="actions" in:motionPresence={faceIn} out:motionPresence={faceOut}>
						<button type="button" class="ghost" onclick={() => close(true)}>Cancel</button>
						<button type="button" class="primary" onclick={apply} disabled={!shown}>Apply</button>
					</div>
				</div>
				<p class="sr-only" aria-live="polite">{status}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	/* The root holds the trigger's place in the page. The surface floats above it and grows into the panel, so opening never pushes content. */
	.root {
		position: relative;
		z-index: 0;
		display: inline-block;
		height: var(--arc-control-height-md);
		vertical-align: top;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
		transition: z-index 0s linear 0.5s;
	}
	.root[data-open] {
		z-index: 30;
		transition-delay: 0s;
	}
	.root:not([data-open]) .surface {
		z-index: 0;
	}
	.root :global(*),
	.root :global(*::before),
	.root :global(*::after) {
		box-sizing: border-box;
	}

	/* One material from trigger to panel. Size, corners, and offset come from springs; the border is an overlay so it never changes a measurement. */
	.surface {
		position: absolute;
		z-index: 2;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border-radius: 18px;
		overflow: clip;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-resting);
		transition:
			box-shadow var(--arc-duration-considered) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.surface::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--arc-border);
		border-radius: inherit;
		pointer-events: none;
		transition: border-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.root[data-open] .surface {
		box-shadow: var(--arc-shadow-floating);
	}

	/* The trigger sits in flow above the surface while closed; when open, the surface and its panel rise over it. */
	.trigger {
		position: relative;
		z-index: 1;
		display: inline-flex;
		width: max-content;
		height: var(--arc-control-height-md);
		align-items: center;
		gap: 10px;
		padding: 0 12px 0 14px;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		cursor: pointer;
		font: inherit;
		font-weight: 500;
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
	}
	.trigger:disabled {
		cursor: default;
	}
	.trigger[inert] {
		pointer-events: none;
	}
	.trigger-icon,
	.chevron {
		display: grid;
		flex: none;
		place-items: center;
		color: var(--arc-text-secondary);
	}
	.chevron {
		color: var(--arc-text-muted);
	}
	.value {
		display: inline-flex;
		font-variant-numeric: tabular-nums;
	}
	.value[data-empty] {
		color: var(--arc-text-secondary);
		font-weight: 400;
	}

	.panel {
		--cell: 36px;
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		padding: 10px;
	}
	.body {
		display: flex;
		gap: 10px;
	}

	.rail {
		position: relative;
		display: flex;
		width: 9.25rem;
		flex: none;
		flex-direction: column;
		gap: 2px;
		padding-right: 10px;
		border-right: 1px solid var(--arc-border-subtle);
	}
	.rail-highlight {
		position: absolute;
		top: 0;
		left: 0;
		border-radius: 12px;
		background: color-mix(in oklch, var(--arc-foreground) 6.5%, transparent);
		opacity: 0;
		pointer-events: none;
	}
	.preset {
		position: relative;
		display: flex;
		height: 32px;
		flex: none;
		align-items: center;
		padding: 0 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		font: inherit;
		text-align: left;
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.preset[aria-pressed='true'] {
		color: var(--arc-foreground);
		font-weight: 500;
	}

	.calendars {
		position: relative;
		padding: 0 2px;
	}
	.nav-button {
		position: absolute;
		z-index: 2;
		top: 0;
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.nav-button[data-side='prev'] {
		left: 2px;
	}
	.nav-button[data-side='next'] {
		right: 2px;
	}
	.nav-button:active:not(:disabled) {
		transform: scale(0.92);
	}
	.nav-button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* Months slide horizontally inside a clipped window that keeps a little room for the blur. */
	.viewport {
		position: relative;
		overflow: clip;
		overflow-clip-margin: 2px;
	}
	.months {
		display: flex;
		gap: 24px;
	}

	/* Footer: the formatted range and the two decisions. */
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 10px;
		padding: 10px 2px 0 6px;
		border-top: 1px solid var(--arc-border-subtle);
	}
	.summary {
		display: grid;
		min-width: 0;
		gap: 1px;
	}
	.summary-value {
		display: inline-flex;
		width: max-content;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.summary-count {
		display: inline-flex;
		min-height: 1.4em;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 6px;
	}
	.ghost,
	.primary {
		display: inline-flex;
		height: var(--arc-control-height-sm);
		align-items: center;
		justify-content: center;
		padding: 0 14px;
		border: 0;
		border-radius: var(--arc-radius-control);
		cursor: pointer;
		font: inherit;
		font-weight: 500;
		white-space: nowrap;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.ghost {
		background: transparent;
		color: var(--arc-text-secondary);
	}
	.primary {
		min-width: 4.75rem;
		background: var(--arc-accent);
		color: var(--arc-accent-foreground);
	}
	.ghost:active,
	.primary:active:not(:disabled) {
		transform: scale(0.97);
	}
	.primary:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ghost:focus-visible {
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	.preset:focus-visible,
	.nav-button:focus-visible {
		background: color-mix(in oklch, var(--arc-foreground) 5%, transparent);
		color: var(--arc-foreground);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	/* Compact: one month under a scrolling row of presets. */
	.panel[data-compact] {
		padding: 8px;
	}
	.panel[data-compact] .body {
		flex-direction: column;
		gap: 8px;
	}
	.panel[data-compact] .rail {
		width: auto;
		flex-direction: row;
		gap: 2px;
		margin: 0 -8px;
		padding: 0 8px 8px;
		overflow-x: auto;
		border-right: 0;
		border-bottom: 1px solid var(--arc-border-subtle);
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}
	.panel[data-compact] .rail::-webkit-scrollbar {
		display: none;
	}
	.panel[data-compact] .preset {
		padding: 0 11px;
	}
	.panel[data-compact] .calendars {
		align-self: center;
	}
	.panel[data-compact] .footer {
		flex-wrap: wrap;
		margin-top: 6px;
	}
	.panel[data-compact] .summary {
		flex: 1 1 8rem;
	}

	@media (hover: hover) and (pointer: fine) {
		.root:not([data-open]):has(> .trigger:hover:not(:disabled)) .surface {
			background: color-mix(in oklch, var(--arc-foreground) 3%, var(--arc-surface-raised));
		}
		.root:not([data-open]):has(> .trigger:hover:not(:disabled)) .surface::after {
			border-color: var(--arc-border-strong);
		}
		.preset:hover {
			color: var(--arc-foreground);
		}
		.preset:not([aria-pressed='true']):hover {
			background: color-mix(in oklch, var(--arc-foreground) 4%, transparent);
		}
		.nav-button:hover:not(:disabled) {
			background: color-mix(in oklch, var(--arc-foreground) 6.5%, transparent);
			color: var(--arc-foreground);
		}
		.ghost:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
		.primary:hover:not(:disabled) {
			background: var(--arc-accent-strong);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.surface,
		.preset,
		.nav-button,
		.ghost,
		.primary {
			transition-duration: 0ms;
		}
	}

	@media (prefers-contrast: more) {
		.surface::after {
			border-color: var(--arc-border-strong);
		}
	}
</style>
