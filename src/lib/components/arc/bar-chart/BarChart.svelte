<script module lang="ts">
	export type BarChartDatum = {
		/** Stable identity, such as an ISO date. A bar whose key survives a data change keeps its place, so switching ranges morphs instead of redrawing. */
		key: string;
		/** Full label for the headline and screen readers, such as "Tue, Sep 15". */
		label: string;
		/** Short label under the bar, such as "T" or "Sep 14". Leave it out to keep the axis quiet. */
		axisLabel?: string;
		value: number;
	};

	/** Room above the top gridline, the share of each slot a bar fills, its widest size, and the radius of its data end. */
	const TOP = 12;
	const FILL = 0.58;
	const MAX_BAR = 28;
	const RADIUS = 4;
	const MAX_ROWS = 4;
	const LABEL_GAP = 10;

	/** Clean gridlines: the smallest step of 1, 2, 3, or 5 that covers the data in four rows or fewer, so shared steps survive a range change. */
	function scaleFor(max: number) {
		const safe = Math.max(max, 1);
		const magnitude = 10 ** Math.floor(Math.log10(safe / MAX_ROWS));
		for (const factor of [1, 2, 3, 5, 10]) {
			const step = factor * magnitude;
			const rows = Math.ceil(safe / step);
			if (rows <= MAX_ROWS)
				return {
					top: rows * step,
					ticks: Array.from({ length: rows + 1 }, (_, row) => row * step)
				};
		}
		return { top: safe, ticks: [0, safe] };
	}

	/** A column that grows from a square baseline to a softly rounded data end. */
	function barPath(x: number, w: number, h: number, base: number) {
		const f = (value: number) => value.toFixed(2);
		if (w <= 0 || h <= 0.01) return `M${f(x)} ${base}H${f(x + Math.max(w, 0))}Z`;
		const r = Math.min(RADIUS, w / 2, h);
		const top = base - h;
		return `M${f(x)} ${base}V${f(top + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(top)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(top + r)}V${base}Z`;
	}

	/** Axis labels that fit once the range has settled: every label, else every second, third, and so on, counted back from the latest so the newest date always shows and spacing stays even. */
	function fittingLabels(data: BarChartDatum[], width: number, sizes: Record<string, number>) {
		const fitting = new Map<string, number>();
		if (!width) return fitting;
		const count = Math.max(1, data.length);
		const labels = data
			.flatMap((item, index) => {
				const size = item.axisLabel ? sizes[item.axisLabel] : undefined;
				if (size === undefined) return [];
				const natural = width - (data.length - 1 - index + 0.5) * (width / count) - size / 2;
				return [
					{
						key: item.key,
						size,
						natural,
						left: Math.min(Math.max(0, width - size), Math.max(0, natural))
					}
				];
			})
			.reverse();
		for (let stride = 1; stride <= labels.length; stride++) {
			const picked = labels.filter((_, rank) => rank % stride === 0);
			const fits = picked.every(
				(label, rank) => rank === 0 || label.left + label.size + LABEL_GAP <= picked[rank - 1].left
			);
			if (stride === labels.length || fits) {
				picked.forEach((label) => fitting.set(label.key, label.left - label.natural));
				break;
			}
		}
		return fitting;
	}
</script>

<script lang="ts">
	import { animate, cancelFrame, frame, motionValue, type MotionValue } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { fade } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import { clamp, isKeyboardFocus, onceInView, physicalSpring } from '../sparkline/chart-kit';
	import RollText from '../sparkline/RollText.svelte';

	/** Use a bar chart for one measure across a run of days, weeks, or months, when people compare each period against the rest and against the average. */
	type Props = HTMLAttributes<HTMLElement> & {
		data: BarChartDatum[];
		/** What is measured, such as "Active minutes". Names the chart for assistive technology. */
		label: string;
		/** The range on show, such as "Sep 15–21, 2026". It rests under the headline. */
		period: string;
		/** Unit after each value, such as "min". */
		unit?: string;
		/** Headline label at rest, above the average. */
		averageLabel?: string;
		/** Headline label while a bar is scrubbed. */
		valueLabel?: string;
		/** Header of the first column in the data table read by screen readers. */
		categoryLabel?: string;
		/** Draws the average as a reference line that springs to each new range. */
		showAverage?: boolean;
		/** Plot height in pixels. */
		height?: number;
		formatValue?: (value: number) => string;
	};

	const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

	let {
		data,
		label,
		period,
		unit = '',
		averageLabel = 'Daily average',
		valueLabel = 'Total',
		categoryLabel = 'Day',
		showAverage = true,
		height = 176,
		formatValue = (value: number) => grouped.format(value),
		class: className,
		...rest
	}: Props = $props();

	type BarRecord = {
		amount: MotionValue<number>;
		slot: MotionValue<number>;
		place: number;
		target: number | null;
		delay: number;
		grown: boolean;
		collapsing: boolean;
		off: () => void;
	};
	type LeavingBar = { key: string; place: number };
	type Controls = { stop: () => void };

	const { spring, duration, stagger } = motionTokens;
	const settle = physicalSpring(spring.smooth);
	const grow = physicalSpring(spring.morph);
	const glide = physicalSpring(spring.snappy);
	/** The zoom runs in fractions of the plot, so it rests far below a pixel. */
	const zoom = physicalSpring(spring.smooth, 0.00001);
	const collapse = physicalSpring({ visualDuration: duration.standard, bounce: 0 });
	const fadeFast = { duration: duration.instant, ease: motionTokens.ease.standard };
	const MEAN_DELAY = 0.12;
	const meanFade = { duration: duration.standard, delay: MEAN_DELAY };
	const MS = 1000;
	const SEEN_AMOUNT = 0.35;
	const REVEAL_SPAN = 0.36;
	const JOIN_SPAN = 0.32;
	const KEYBOARD_PAGE = 7;
	/** A tick label makes way where the average label sits beside it: fully hidden within this many pixels, back over the next few. */
	const AVOID_NEAR = 10;
	const AVOID_FADE = 6;

	/** Starts animations on the next frame, so the update that caused them never swallows a spring's first frames. Returns a cleanup. */
	function soon(start: () => Controls) {
		let controls: Controls | null = null;
		const run = () => {
			controls = start();
		};
		frame.update(run);
		return () => {
			cancelFrame(run);
			controls?.stop();
		};
	}

	const titleId = $props.id();
	const count = $derived(Math.max(data.length, 1));
	const last = $derived(data.length - 1);
	const average = $derived(
		data.length ? data.reduce((sum, item) => sum + item.value, 0) / data.length : 0
	);
	const peak = $derived(data.reduce((max, item) => Math.max(max, item.value), 0));
	const scaleRange = $derived(scaleFor(peak));
	const signature = $derived(data.map((item) => item.key).join('|'));
	const suffix = $derived(unit ? ` ${unit}` : '');
	const revealStep = $derived(Math.min(stagger.item, REVEAL_SPAN / count));

	let figure: HTMLElement;
	let plot: HTMLDivElement;
	let ruler: HTMLSpanElement;
	let cursorLine: SVGLineElement;
	let meanLine = $state<SVGLineElement>();
	let meanLabel = $state<HTMLSpanElement>();
	let meanText = $state<HTMLSpanElement>();

	let inView = $state(false);
	let active = $state<number | null>(null);
	let changes = $state(0);
	let leaving = $state<LeavingBar[]>([]);
	let plotWidth = $state(0);
	let labelSizes = $state<Record<string, number>>({});

	const index = $derived(active === null ? null : Math.min(active, last));
	const scrubbing = $derived(index !== null && last >= 0);
	const shown = $derived(inView || isReducedMotion());
	const shownValue = $derived(scrubbing ? data[index!].value : average);

	// Bars that join an existing chart grow outward from the ones that stayed; the first reveal runs left to right.
	// svelte-ignore state_referenced_locally
	let knownSignature = signature;
	// svelte-ignore state_referenced_locally
	let knownKeys = new Set(data.map((item) => item.key));
	let freshDelays = new Map<string, number>();
	$effect.pre(() => {
		if (signature === knownSignature) return;
		const keys = new Set(data.map((item) => item.key));
		const gone = [...knownKeys]
			.filter((key) => !keys.has(key))
			.map((key) => ({ key, place: records.get(key)?.place ?? 0 }));
		const incoming = data
			.map((item, at) => ({ key: item.key, place: last - at }))
			.filter((item) => !knownKeys.has(item.key))
			.sort((a, b) => a.place - b.place);
		const step = Math.min(stagger.item, JOIN_SPAN / Math.max(1, incoming.length));
		freshDelays = new Map(incoming.map((item, rank) => [item.key, rank * step]));
		leaving = [...leaving.filter((bar) => !keys.has(bar.key)), ...gone];
		knownSignature = signature;
		knownKeys = keys;
		changes += 1;
		active = null;
	});

	// Headline copy moves the way the data did: a larger value rises from below, a later day arrives from below too.
	let valueWay = $state(1);
	let indexWay = $state(1);
	// svelte-ignore state_referenced_locally
	let previousValue = shownValue;
	// svelte-ignore state_referenced_locally
	let previousIndex = index;
	$effect.pre(() => {
		if (shownValue !== previousValue) valueWay = shownValue > previousValue ? 1 : -1;
		if (index !== previousIndex)
			indexWay =
				index === null || previousIndex === null ? 1 : Math.sign(index - previousIndex) || 1;
		previousValue = shownValue;
		previousIndex = index;
	});

	const renderedBars = $derived([
		...leaving.map((bar) => ({ ...bar, value: 0, at: -1 })),
		...data.map((item, at) => ({ key: item.key, place: last - at, value: item.value, at }))
	]);

	// The plot's own motion: the zoom of the time axis, the value scale, the average and the scrub cursor.
	let width = 0;
	// svelte-ignore state_referenced_locally
	const unitShare = motionValue(1 / count);
	// svelte-ignore state_referenced_locally
	const scale = motionValue(scaleRange.top);
	const mean = motionValue(0);
	const cursor = motionValue(0);
	const records = new Map<string, BarRecord>();
	const barNodes = new Map<string, SVGPathElement>();
	const rows = new Map<Element, { value: number; kind: 'grid' | 'tick' }>();
	const axisLabels = new Map<HTMLElement, { key: string; size: number; shift: number }>();

	const centerOf = (place: number) => width - (place + 0.5) * width * unitShare.get();
	const rowY = (value: number) => Math.round(height - (value / scale.get()) * (height - TOP)) + 0.5;

	// One paint per frame, whatever moved: every bar, row, label and line is written straight to the DOM.
	function paint() {
		const barWidth = width * unitShare.get();
		const size = Math.min(barWidth * FILL, MAX_BAR);
		for (const [key, node] of barNodes) {
			const record = records.get(key);
			if (!record) continue;
			const barHeight = (record.amount.get() / scale.get()) * (height - TOP);
			node.setAttribute(
				'd',
				barPath(centerOf(record.slot.get()) - size / 2, size, barHeight, height)
			);
		}
		const meanY = rowY(mean.get());
		for (const [node, row] of rows) {
			const y = rowY(row.value);
			if (row.kind === 'grid') {
				node.setAttribute('y1', String(y));
				node.setAttribute('y2', String(y));
				continue;
			}
			(node as HTMLElement).style.transform = `translateY(${y}px)`;
			const text = node.firstElementChild as HTMLElement;
			text.style.opacity = showAverage
				? String(clamp((Math.abs(y - meanY) - AVOID_NEAR) / AVOID_FADE, 0, 1))
				: '1';
		}
		for (const [node, placement] of axisLabels) {
			const record = records.get(placement.key);
			if (record)
				node.style.transform = `translateX(${centerOf(record.slot.get()) - placement.size / 2 + placement.shift}px)`;
		}
		const cursorX = String(Math.round(centerOf(cursor.get())) + 0.5);
		cursorLine.setAttribute('x1', cursorX);
		cursorLine.setAttribute('x2', cursorX);
		meanLine?.setAttribute('y1', String(meanY));
		meanLine?.setAttribute('y2', String(meanY));
		if (meanLabel) meanLabel.style.transform = `translateY(${meanY}px)`;
		if (meanText) meanText.textContent = `Avg ${formatValue(Math.round(mean.get()))}`;
	}
	const schedule = () => frame.render(paint);

	$effect(() => {
		const offs = [unitShare, scale, mean, cursor].map((value) => value.on('change', schedule));
		return () => {
			offs.forEach((off) => off());
			cancelFrame(paint);
			for (const record of records.values()) record.off();
		};
	});

	$effect(() => onceInView(figure, SEEN_AMOUNT, () => (inView = true)));

	function recordFor(key: string, place: number, delay: number) {
		let record = records.get(key);
		if (record) return record;
		const amount = motionValue(0);
		const slot = motionValue(place);
		const offs = [amount.on('change', schedule), slot.on('change', schedule)];
		record = {
			amount,
			slot,
			place,
			target: null,
			delay,
			grown: false,
			collapsing: false,
			off: () => offs.forEach((off) => off())
		};
		records.set(key, record);
		return record;
	}

	function dropLeaving(key: string) {
		leaving = leaving.filter((bar) => bar.key !== key);
		records.get(key)?.off();
		records.delete(key);
	}

	/** Slots count back from the latest bar, so the newest day stays pinned right while a longer range zooms out to the left. */
	function moveSlot(record: BarRecord, place: number, reduced: boolean) {
		if (record.place === place) return;
		record.place = place;
		if (reduced) record.slot.jump(place);
		else soon(() => animate(record.slot, place, settle));
	}

	// A bar grows once it is seen, each a beat after its neighbour; later values settle without a delay.
	function growBar(record: BarRecord, value: number, reduced: boolean) {
		record.collapsing = false;
		if (reduced) {
			record.amount.jump(value);
			record.target = value;
			record.grown = true;
			return;
		}
		if (!shown || record.target === value) return;
		const first = !record.grown;
		record.grown = true;
		record.target = value;
		soon(() => animate(record.amount, value, first ? { ...grow, delay: record.delay } : settle));
	}

	// A leaving bar sinks into the baseline, faster than a bar grows, while the zoom carries it out of the plot.
	function collapseBar(key: string, reduced: boolean) {
		const record = records.get(key);
		if (!record || reduced) {
			dropLeaving(key);
			return;
		}
		if (record.collapsing) return;
		record.collapsing = true;
		record.target = 0;
		soon(() => animate(record.amount, 0, { ...collapse, onComplete: () => dropLeaving(key) }));
	}

	$effect(() => {
		const reduced = isReducedMotion();
		data.forEach((item, at) => {
			const place = last - at;
			const record = recordFor(item.key, place, freshDelays.get(item.key) ?? at * revealStep);
			moveSlot(record, place, reduced);
			growBar(record, item.value, reduced);
		});
		for (const bar of leaving) collapseBar(bar.key, reduced);
		schedule();
	});

	// A new range zooms the time axis around the latest bar, rescales the gridlines, and moves the average, all on springs that can be retargeted mid-flight.
	$effect(() => {
		const share = 1 / count;
		const top = scaleRange.top;
		if (isReducedMotion()) {
			unitShare.jump(share);
			scale.jump(top);
			return;
		}
		return soon(() => {
			const controls = [animate(unitShare, share, zoom), animate(scale, top, settle)];
			return { stop: () => controls.forEach((control) => control.stop()) };
		});
	});

	// The average rises with the first bars, then springs to each new range.
	let meanStarted = false;
	$effect(() => {
		const target = average;
		if (isReducedMotion()) {
			mean.jump(target);
			return;
		}
		if (!inView) return;
		const first = !meanStarted;
		meanStarted = true;
		return soon(() => animate(mean, target, first ? { ...settle, delay: MEAN_DELAY } : settle));
	});

	$effect(() => {
		const transition = isReducedMotion() ? { duration: 0 } : meanFade;
		const opacity = shown ? 1 : 0;
		if (meanLine) animate(meanLine, { opacity }, transition);
		if (meanLabel) animate(meanLabel, { opacity }, transition);
	});

	// The cursor appears on the first scrubbed bar and glides between the ones after it.
	let wasScrubbing = false;
	$effect(() => {
		animate(
			cursorLine,
			{ opacity: scrubbing ? 1 : 0 },
			isReducedMotion() ? { duration: 0 } : fadeFast
		);
		if (index === null) {
			wasScrubbing = false;
			return;
		}
		const place = last - index;
		const reduced = isReducedMotion();
		if (reduced || !wasScrubbing) cursor.jump(place);
		wasScrubbing = true;
		if (reduced) return;
		const controls = animate(cursor, place, glide);
		return () => controls.stop();
	});

	// The chart draws in its own pixels; the width is read before paint and followed on resize. Axis labels wait for it, then thin out where they would collide.
	const labelTexts = $derived([
		...new Set(data.map((item) => item.axisLabel).filter((text): text is string => !!text))
	]);
	$effect(() => {
		void labelTexts;
		const read = () => {
			width = plot.clientWidth;
			plotWidth = width;
			const sizes: Record<string, number> = {};
			ruler.querySelectorAll<HTMLElement>('[data-text]').forEach((item) => {
				sizes[item.dataset.text ?? ''] = item.offsetWidth;
			});
			const current = untrack(() => labelSizes);
			if (!Object.keys(sizes).every((text) => current[text] === sizes[text])) labelSizes = sizes;
			schedule();
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(plot);
		observer.observe(ruler);
		return () => observer.disconnect();
	});
	const shownLabels = $derived(fittingLabels(data, plotWidth, labelSizes));
	const axisLabelsShown = $derived(
		data.flatMap((item) =>
			item.axisLabel && shownLabels.has(item.key) ? [{ key: item.key, text: item.axisLabel }] : []
		)
	);

	const trackBar =
		(key: string): Attachment<SVGPathElement> =>
		(node) => {
			barNodes.set(key, node);
			schedule();
			return () => {
				if (barNodes.get(key) === node) barNodes.delete(key);
			};
		};
	const trackRow =
		(value: number, kind: 'grid' | 'tick'): Attachment<Element> =>
		(node) => {
			rows.set(node, { value, kind });
			schedule();
			return () => rows.delete(node);
		};
	const trackAxisLabel =
		(key: string, size: number, shift: number): Attachment<HTMLElement> =>
		(node) => {
			axisLabels.set(node, { key, size, shift });
			schedule();
			return () => axisLabels.delete(node);
		};

	const rowFade = { duration: duration.standard * MS, easing: ease.standard };
	const rowExit = { duration: duration.instant * MS, easing: ease.standard };

	function pointAt(clientX: number) {
		const rect = plot.getBoundingClientRect();
		if (!rect.width) return last;
		const place = Math.floor(((rect.right - clientX) / rect.width) * count);
		return clamp(last - place, 0, last);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && scrubbing) {
			event.preventDefault();
			active = null;
			return;
		}
		const from = index ?? last + 1;
		const page = Math.min(KEYBOARD_PAGE, count);
		const steps: Record<string, number> = {
			ArrowLeft: from - 1,
			ArrowDown: from - 1,
			ArrowRight: index === null ? last : from + 1,
			ArrowUp: index === null ? last : from + 1,
			PageDown: from - page,
			PageUp: from + page,
			Home: 0,
			End: last
		};
		const next = steps[event.key];
		if (next === undefined || last < 0) return;
		event.preventDefault();
		active = clamp(next, 0, last);
	}

	function onpointerdown(event: PointerEvent) {
		if (event.pointerType !== 'mouse')
			(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		active = pointAt(event.clientX);
	}
	function onpointermove(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.buttons) active = pointAt(event.clientX);
	}
	function onfocus(event: FocusEvent) {
		if (isKeyboardFocus(event.currentTarget as Element) && last >= 0) active = active ?? last;
	}

	const scrubbed = $derived(scrubbing ? data[index!] : null);
	const reading = $derived(scrubbed ?? data[last]);
	const valueText = $derived(
		reading ? `${reading.label}: ${formatValue(reading.value)}${suffix}` : 'No data'
	);
	const highest = $derived(
		data.reduce<BarChartDatum | null>(
			(best, item) => (!best || item.value > best.value ? item : best),
			null
		)
	);
	const lowest = $derived(
		data.reduce<BarChartDatum | null>(
			(best, item) => (!best || item.value < best.value ? item : best),
			null
		)
	);
	const summary = $derived(
		`${label}, ${period}. ${averageLabel} ${formatValue(Math.round(average))}${suffix}.` +
			(highest ? ` Highest ${highest.label}, ${formatValue(highest.value)}${suffix}.` : '') +
			(lowest && lowest !== highest
				? ` Lowest ${lowest.label}, ${formatValue(lowest.value)}${suffix}.`
				: '')
	);
</script>

<figure bind:this={figure} class={['figure', className]} aria-labelledby={titleId} {...rest}>
	<figcaption id={titleId} class="sr-only">{label}, {period}</figcaption>
	<div class="header" aria-hidden="true">
		<span class="kind"
			><RollText text={scrubbing ? valueLabel : averageLabel} direction={1} whole /></span
		>
		<span class="value">
			<RollText
				text={formatValue(scrubbing ? data[index!].value : Math.round(average))}
				direction={valueWay}
				morph
			/>
			{#if unit}<span class="unit">{unit}</span>{/if}
		</span>
		<span class="when">
			<RollText
				text={scrubbed ? scrubbed.label : period}
				direction={scrubbing ? indexWay : 1}
				whole
			/>
		</span>
	</div>
	<div class="chart" data-scrubbing={scrubbing || undefined}>
		<div bind:this={plot} class="plot" style:height={`${height}px`}>
			<svg class="svg" width="100%" {height} role="img" aria-label={summary}>
				{#each scaleRange.ticks.filter((value) => value !== 0) as value (value)}
					<line
						class="grid"
						x1="0"
						x2="100%"
						{@attach trackRow(value, 'grid')}
						in:fade={rowFade}
						out:fade={rowExit}
					/>
				{/each}
				<line bind:this={cursorLine} class="cursor" y1={TOP} y2={height} opacity="0" />
				{#each renderedBars as bar (bar.key)}
					<path
						class="bar"
						data-key={bar.key}
						data-active={index === bar.at || undefined}
						{@attach trackBar(bar.key)}
					/>
				{/each}
				<line class="baseline" x1="0" x2="100%" y1={height - 0.5} y2={height - 0.5} />
				{#if showAverage}
					<line bind:this={meanLine} class="mean" x1="0" x2="100%" opacity="0" />
				{/if}
			</svg>
		</div>
		<div class="gutter" aria-hidden="true">
			{#each scaleRange.ticks as value (value)}
				<span class="tick" {@attach trackRow(value, 'tick')} in:fade={rowFade} out:fade={rowExit}>
					<span class="tick-text">{formatValue(value)}</span>
				</span>
			{/each}
			{#if showAverage}
				<span bind:this={meanLabel} class="mean-label" style="opacity: 0">
					<span bind:this={meanText} class="tick-text"></span>
				</span>
			{/if}
		</div>
		<div class="axis" aria-hidden="true">
			{#each axisLabelsShown as item (`${item.key}:${item.text}`)}
				<span
					class="axis-label"
					{@attach trackAxisLabel(
						item.key,
						labelSizes[item.text] ?? 0,
						shownLabels.get(item.key) ?? 0
					)}
					in:fade={rowFade}
					out:fade={rowExit}>{item.text}</span
				>
			{/each}
			<span bind:this={ruler} class="measure">
				{#each labelTexts as text (text)}<span data-text={text}>{text}</span>{/each}
			</span>
		</div>
		<!-- The scrubber lies over the plot: hover or drag across it, or focus it and use the arrow keys. Vertical swipes still scroll the page. -->
		<div
			class="scrubber"
			role="slider"
			tabindex="0"
			aria-label={`${label}, explore by ${categoryLabel.toLowerCase()}`}
			aria-orientation="horizontal"
			aria-valuemin={1}
			aria-valuemax={Math.max(1, data.length)}
			aria-valuenow={(index ?? last) + 1}
			aria-valuetext={valueText}
			{onpointerdown}
			{onpointermove}
			onpointerup={(event) => {
				if (event.pointerType !== 'mouse') active = null;
			}}
			onpointercancel={() => (active = null)}
			onpointerleave={(event) => {
				if (event.pointerType === 'mouse') active = null;
			}}
			{onkeydown}
			onblur={() => (active = null)}
			{onfocus}
		></div>
	</div>
	<table class="sr-only">
		<caption>{label}, {period}</caption>
		<thead><tr><th scope="col">{categoryLabel}</th><th scope="col">{label}</th></tr></thead>
		<tbody>
			{#each data as item (item.key)}
				<tr><th scope="row">{item.label}</th><td>{formatValue(item.value)}{suffix}</td></tr>
			{/each}
		</tbody>
	</table>
	<p class="sr-only" aria-live="polite" aria-atomic="true">
		{changes ? `${period}. ${averageLabel} ${formatValue(Math.round(average))}${suffix}.` : ''}
	</p>
</figure>

<style>
	.figure {
		display: grid;
		min-width: 0;
		gap: var(--arc-space-5);
		margin: 0;
		color: var(--arc-foreground);
	}

	/* The headline is the readout: the average at rest, the scrubbed bar while exploring. Each line keeps its height, so swaps never move the plot. */
	.header {
		display: grid;
		min-width: 0;
		gap: 2px;
	}
	.kind,
	.when {
		display: block;
		min-height: calc(1em * var(--arc-leading-body));
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.kind {
		color: var(--arc-text-secondary);
	}
	.when {
		color: var(--arc-text-muted);
	}
	.value {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: 6px;
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
		line-height: var(--arc-leading-display);
		font-variant-numeric: tabular-nums;
	}
	.unit {
		color: var(--arc-text-secondary);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-base);
		font-weight: 400;
		letter-spacing: var(--arc-tracking-body);
	}

	/* Plot, right-hand value axis, and the date axis beneath. */
	.chart {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 52px;
		grid-template-rows: auto 26px;
		min-width: 0;
	}
	.plot {
		position: relative;
		grid-area: 1 / 1;
		min-width: 0;
	}
	.svg {
		display: block;
		overflow: hidden;
	}
	.grid {
		stroke: var(--arc-border);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	.baseline {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	.cursor {
		stroke: var(--arc-border-strong);
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
	.mean {
		stroke: var(--arc-text-secondary);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		shape-rendering: crispEdges;
	}
	/* The series is drawn in a soft step of the accent; the scrubbed bar takes the full accent while its neighbours step back. */
	.bar {
		fill: color-mix(in oklch, var(--arc-accent) 62%, var(--arc-surface));
		transition: fill var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.chart[data-scrubbing] .bar {
		fill: color-mix(in oklch, var(--arc-accent) 24%, var(--arc-surface));
	}
	/* On a dark surface a lighter mix keeps the hue clear instead of turning muddy. */
	:global(.dark) .bar {
		fill: color-mix(in oklch, var(--arc-accent) 76%, var(--arc-surface));
	}
	:global(.dark) .chart[data-scrubbing] .bar {
		fill: color-mix(in oklch, var(--arc-accent) 34%, var(--arc-surface));
	}
	:global(.dark) .chart .bar[data-active] {
		fill: var(--arc-accent);
	}
	.chart .bar[data-active] {
		fill: var(--arc-accent);
	}

	.gutter {
		position: relative;
		grid-area: 1 / 2;
		min-width: 0;
	}
	.tick,
	.mean-label {
		position: absolute;
		top: 0;
		left: 10px;
		display: block;
		height: 0;
		white-space: nowrap;
		pointer-events: none;
	}
	.tick-text {
		display: block;
		transform: translateY(-50%);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.mean-label .tick-text {
		color: var(--arc-foreground);
		font-weight: 500;
	}

	.axis {
		position: relative;
		grid-area: 2 / 1;
		min-width: 0;
		overflow: hidden;
	}
	.axis-label {
		position: absolute;
		top: 8px;
		left: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	/* The scrubber covers the plot and its axes. Horizontal drags scrub, vertical swipes still scroll the page. */
	.scrubber {
		position: absolute;
		inset: 0;
		border-radius: calc(var(--arc-radius-control) / 2);
		outline: none;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	.scrubber:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 6px;
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
		.bar {
			transition: none;
		}
	}
	.measure {
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		visibility: hidden;
		pointer-events: none;
	}
	.measure > span {
		flex: none;
		font-size: var(--arc-text-xs);
		line-height: 1;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
</style>
