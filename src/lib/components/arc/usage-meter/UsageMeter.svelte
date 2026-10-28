<script module lang="ts">
	export interface UsageMeterSegment {
		/** Stable identity. Keep it the same while the value changes, so the segment re-flows instead of being replaced. */
		id: string;
		label: string;
		value: number;
	}
</script>

<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import {
		animate,
		inView,
		motionValue,
		styleEffect,
		transformValue,
		type AnimationPlaybackControls,
		type MotionValue
	} from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { swapIn, swapOut } from '../alert/swap';
	import { isReducedMotion, motionTokens } from '../motion';
	import { physical, soon } from './meter-motion';
	import StatusBadge, { type UsageMeterStatus } from './StatusBadge.svelte';
	import Swap from './Swap.svelte';
	import Ticker from './Ticker.svelte';

	/** Use a usage meter for a fixed allowance, such as storage or seats, when people need to see what takes the space and how close they are to the limit. */
	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		/** What is measured, such as "Workspace storage". */
		label: string;
		/** Used amounts in display order. Up to four read clearly. */
		segments: UsageMeterSegment[];
		/** The plan limit, in the same unit as the segments. */
		limit: number;
		unit?: string;
		/** Digits after the decimal point. */
		decimals?: number;
		freeLabel?: string;
		overLabel?: string;
		/** Share of the limit at which the meter warns that it is almost full. */
		warnAt?: number;
	};

	let {
		label,
		segments,
		limit,
		unit = '',
		decimals = 1,
		freeLabel = 'Free',
		overLabel = 'Over limit',
		warnAt = 0.9,
		class: className,
		...rest
	}: Props = $props();

	const { duration, spring } = motionTokens;
	const settle = physical(spring.smooth);
	const reveal = physical({ visualDuration: duration.considered + 0.1, bounce: 0 });
	const markerFade = { duration: duration.fast, ease: motionTokens.ease.standard };
	/** A segment stops two pixels short of the next, so neighbours read apart without an outline. */
	const GAP = 2;
	const MIN_SPAN = 1e-6;
	const REVEAL_STAGGER = 0.07;
	const IN_VIEW_AMOUNT = 0.4;
	const FREE_ID = 'free';

	type Highlight = 'on' | 'off' | undefined;
	type LegendItem = { id: string; label: string; value: number };

	const uid = $props.id();
	const titleId = `${uid}-title`;
	const hatchId = `hatch${uid.replace(/[^a-zA-Z0-9_-]/g, '')}`;

	const reduced = $derived(isReducedMotion());
	let mounted = $state(false);
	let seen = $state(false);
	const ready = $derived(mounted && (seen || reduced));

	const precision = $derived(10 ** decimals);
	const round = (value: number) => Math.round(value * precision) / precision;
	const total = $derived(round(segments.reduce((sum, segment) => sum + segment.value, 0)));
	const free = $derived(round(Math.max(0, limit - total)));
	const over = $derived(round(Math.max(0, total - limit)));
	const status: UsageMeterStatus = $derived(
		total > limit ? 'over' : total >= limit * warnAt ? 'near' : 'ok'
	);
	const format = (value: number) => `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
	const limitText = $derived(format(limit).replace(/\.0+(?= |$)/, ''));

	// One motion value per segment id, kept across renders so a changed value springs from where it is.
	const amountStore = new Map<string, MotionValue<number>>();
	function amountFor(id: string) {
		let amount = amountStore.get(id);
		if (!amount) {
			amount = motionValue(0);
			amountStore.set(id, amount);
		}
		return amount;
	}
	const segmentIdsKey = $derived(JSON.stringify(segments.map((segment) => segment.id)));
	const amounts = $derived((JSON.parse(segmentIdsKey) as string[]).map(amountFor));

	const shownLimit = motionValue(untrack(() => limit));
	const trackWidth = motionValue(0);
	const markerOpacity = motionValue(0);

	/** The bar spans the limit, or everything used once that is more; both follow their springs, so crossing the limit is continuous. */
	function createGeometry(list: MotionValue<number>[]) {
		const used = transformValue(() => list.reduce((sum, amount) => sum + amount.get(), 0));
		const span = transformValue(() => Math.max(shownLimit.get(), used.get(), MIN_SPAN));
		const limitX = transformValue(() =>
			Math.round((shownLimit.get() / span.get()) * trackWidth.get())
		);
		const overClip = transformValue(() => `inset(0 0 0 ${limitX.get() + GAP}px)`);
		const destroy = () => [used, span, limitX, overClip].forEach((value) => value.destroy());
		return { used, span, limitX, overClip, destroy };
	}
	const geometry = $derived(createGeometry(amounts));

	$effect(() => {
		const current = geometry;
		return () => current.destroy();
	});

	$effect(() => {
		mounted = true;
	});

	// The limit marker and the hatch fade on their own short tween whenever usage crosses the limit, so a limit that jumps past usage never blinks them out in one frame.
	$effect(() => {
		const { used } = geometry;
		const fadeInstantly = reduced;
		const isOver = () => used.get() > shownLimit.get();
		let wasOver = isOver();
		markerOpacity.jump(wasOver ? 1 : 0);
		let fading: AnimationPlaybackControls | undefined;
		const check = () => {
			const nowOver = isOver();
			if (nowOver === wasOver) return;
			wasOver = nowOver;
			fading?.stop();
			if (fadeInstantly) markerOpacity.jump(nowOver ? 1 : 0);
			else fading = animate(markerOpacity, nowOver ? 1 : 0, markerFade);
		};
		const stops = [used.on('change', check), shownLimit.on('change', check)];
		return () => {
			stops.forEach((stop) => stop());
			fading?.stop();
		};
	});

	// Segments grow into place once seen, left to right; later changes re-flow every segment on one spring each.
	let revealed = false;
	function springAmount(segment: UsageMeterSegment, index: number, first: boolean) {
		const amount = amountFor(segment.id);
		if (amount.get() === segment.value) return null;
		if (reduced) {
			amount.jump(segment.value);
			return null;
		}
		const transition = first ? { ...reveal, delay: index * REVEAL_STAGGER } : settle;
		return soon(() => animate(amount, segment.value, transition));
	}

	$effect(() => {
		if (!ready) return;
		const first = !revealed;
		revealed = true;
		const stops = segments.map((segment, index) => springAmount(segment, index, first));
		return () => stops.forEach((stop) => stop?.());
	});

	$effect(() => {
		const target = limit;
		if (shownLimit.get() === target) return;
		if (reduced) {
			shownLimit.jump(target);
			return;
		}
		return soon(() => animate(shownLimit, target, settle));
	});

	function watchInView(node: HTMLElement) {
		return inView(
			node,
			() => {
				seen = true;
			},
			{ amount: IN_VIEW_AMOUNT }
		);
	}

	function measureTrack(node: HTMLElement) {
		trackWidth.set(node.clientWidth);
		const observer = new ResizeObserver(() => trackWidth.set(node.clientWidth));
		observer.observe(node);
		return () => observer.disconnect();
	}

	// Each segment starts where the ones before it end, so growth in any of them pushes the rest along in the same frame.
	function placeSegment(index: number): Attachment<HTMLElement> {
		return (node) => {
			const list = amounts;
			const { span } = geometry;
			const x = transformValue(() => {
				let start = 0;
				for (let at = 0; at < index; at++) start += list[at].get();
				return (start / span.get()) * trackWidth.get();
			});
			const scaleX = transformValue(() => {
				const width = trackWidth.get();
				const size = (list[index].get() / span.get()) * width;
				const rest = width - x.get() - size;
				if (!width) return 0;
				return Math.max(0, size - Math.min(GAP, size, Math.max(0, rest))) / width;
			});
			const stopStyles = styleEffect(node, { x, scaleX });
			return () => {
				stopStyles();
				x.destroy();
				scaleX.destroy();
			};
		};
	}

	const bindOverflow: Attachment<SVGSVGElement> = (node) =>
		styleEffect(node, { clipPath: geometry.overClip, opacity: markerOpacity });
	const bindLimitMarker: Attachment<HTMLElement> = (node) =>
		styleEffect(node, { x: geometry.limitX, opacity: markerOpacity });

	// Hover previews a category, focus previews it too, and a press pins it until pressed again or Escape.
	let hovered = $state<string | null>(null);
	let focused = $state<string | null>(null);
	let pinned = $state<string | null>(null);
	let roving = $state(0);
	let track: HTMLDivElement;
	let legend: HTMLDivElement;

	const items: LegendItem[] = $derived([
		...segments.map(({ id, label, value }) => ({ id, label, value })),
		{
			id: FREE_ID,
			label: status === 'over' ? overLabel : freeLabel,
			value: status === 'over' ? over : free
		}
	]);
	const active = $derived(hovered ?? focused ?? pinned);
	const activeItem = $derived(items.find((item) => item.id === active) ?? null);
	const highlightOf = (id: string): Highlight =>
		active ? (active === id ? 'on' : 'off') : undefined;

	function idAt(clientX: number) {
		const rect = track.getBoundingClientRect();
		if (!rect.width) return null;
		const at = ((clientX - rect.left) / rect.width) * Math.max(limit, total);
		// Past the limit the hatch stands for the overage, so pointing there highlights it rather than the category beneath.
		if (at > limit) return FREE_ID;
		let end = 0;
		for (const segment of segments) {
			end += segment.value;
			if (at <= end) return segment.id;
		}
		return FREE_ID;
	}

	const togglePinned = (id: string | null) => (pinned = pinned === id ? null : id);

	function onTrackMove(event: PointerEvent) {
		if (event.pointerType === 'mouse') hovered = idAt(event.clientX);
	}

	function onTrackTap(event: PointerEvent) {
		if (event.pointerType !== 'mouse') togglePinned(idAt(event.clientX));
	}

	const ROVING_KEYS: Record<string, (current: number, last: number) => number> = {
		ArrowRight: (current) => current + 1,
		ArrowDown: (current) => current + 1,
		ArrowLeft: (current) => current - 1,
		ArrowUp: (current) => current - 1,
		Home: () => 0,
		End: (_, last) => last
	};

	function onLegendKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (pinned || focused) {
				event.preventDefault();
				pinned = null;
			}
			return;
		}
		const move = ROVING_KEYS[event.key];
		if (!move) return;
		event.preventDefault();
		const index = (move(roving, items.length - 1) + items.length) % items.length;
		roving = index;
		legend.querySelectorAll('button')[index]?.focus();
	}

	const headline = $derived(ready ? (activeItem ? activeItem.value : total) : 0);
	const share = $derived(activeItem ? Math.round((activeItem.value / limit) * 100) : 0);
	const caption = $derived.by(() => {
		if (!activeItem) return `${unit} of ${limitText} used`;
		if (activeItem.id === FREE_ID)
			return `${unit} ${status === 'over' ? 'over the limit' : 'free'}`;
		return `${unit} in ${activeItem.label} · ${share}% of plan`;
	});
	const badge = $derived(
		status === 'over'
			? `${format(over)} over`
			: status === 'near'
				? 'Almost full'
				: `${format(free)} free`
	);
	const summary = $derived.by(() => {
		const parts = segments.map((segment) => `${segment.label} ${format(segment.value)}`).join(', ');
		const standing =
			status === 'over'
				? `Over the limit by ${format(over)}.`
				: `${format(free)} free${status === 'near' ? ', almost full' : ''}.`;
		return `${label}: ${format(total)} of ${limitText} used. ${parts}. ${standing}`;
	});

	// Status changes are announced, and so is a growing overage; routine changes inside a status stay quiet.
	const notice = $derived(status === 'over' ? `over:${over}` : status);
	let announcedNotice = untrack(() => notice);
	let announcedMessage = '';
	function statusMessage() {
		if (status === 'over') return `Over the plan limit by ${format(over)}.`;
		if (status === 'near') return `Almost full. ${format(free)} free.`;
		return `Under the limit. ${format(free)} free.`;
	}
	const announcement = $derived.by(() => {
		if (notice !== announcedNotice) {
			announcedNotice = notice;
			announcedMessage = statusMessage();
		}
		return announcedMessage;
	});

	const ICON_SWAP = { kind: 'icon', exitDuration: duration.instant } as const;
</script>

<div
	{@attach watchInView}
	class={['meter', className]}
	role="group"
	aria-labelledby={titleId}
	data-status={status}
	{...rest}
>
	<div class="top">
		<span id={titleId} class="title">{label}</span>
		<StatusBadge {status} text={badge} />
	</div>
	<p class="total">
		<span class="sr-only">{format(total)} of {limitText} used</span>
		<span class="amount" aria-hidden="true"><Ticker value={headline} {decimals} /></span>
		<span class="caption" aria-hidden="true"><Swap text={caption} /></span>
	</p>
	<div class="bar">
		<div
			bind:this={track}
			{@attach measureTrack}
			class="track"
			role="img"
			aria-label={summary}
			data-active={active ?? undefined}
			onpointermove={onTrackMove}
			onpointerleave={() => (hovered = null)}
			onpointerup={onTrackTap}
		>
			{#each segments as segment, index (segment.id)}
				<span
					class="segment"
					data-index={index}
					data-highlight={highlightOf(segment.id)}
					{@attach placeSegment(index)}
				></span>
			{/each}
			<!-- Past the limit the bar is struck through: the overflow keeps its colours, hatched so it reads as over without colour. -->
			<svg
				class="overflow"
				data-highlight={highlightOf(FREE_ID)}
				aria-hidden="true"
				focusable="false"
				{@attach bindOverflow}
			>
				<defs>
					<pattern
						id={hatchId}
						width={6}
						height={6}
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<rect width={2.5} height={6} class="hatch" />
					</pattern>
				</defs>
				<rect class="over-tint" width="100%" height="100%" />
				<rect width="100%" height="100%" fill="url(#{hatchId})" />
			</svg>
		</div>
		<span class="limit" aria-hidden="true" {@attach bindLimitMarker}></span>
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (arrow keys bubble up from the legend buttons) -->
	<div
		bind:this={legend}
		class="legend"
		role="group"
		aria-label="{label} by category"
		onkeydown={onLegendKey}
	>
		{#each items as item, index (item.id)}
			{@const warning = item.id === FREE_ID && status === 'over'}
			<button
				type="button"
				class="item"
				data-highlight={highlightOf(item.id)}
				aria-pressed={pinned === item.id}
				aria-label="{item.label}, {format(item.value)}"
				tabindex={index === roving ? 0 : -1}
				onclick={() => {
					roving = index;
					togglePinned(item.id);
				}}
				onfocus={() => {
					roving = index;
					focused = item.id;
				}}
				onblur={() => (focused = null)}
				onpointerenter={(event) => {
					if (event.pointerType === 'mouse') hovered = item.id;
				}}
				onpointerleave={(event) => {
					if (event.pointerType === 'mouse') hovered = null;
				}}
			>
				<span class="item-head">
					<span class="key" aria-hidden="true">
						{#if warning}
							<span class="key-icon" in:swapIn={ICON_SWAP} out:swapOut={ICON_SWAP}>
								<TriangleAlertIcon size={12} strokeWidth={2} />
							</span>
						{:else}
							<span
								class="swatch"
								data-index={item.id === FREE_ID ? FREE_ID : index}
								in:swapIn={ICON_SWAP}
								out:swapOut={ICON_SWAP}
							></span>
						{/if}
					</span>
					<span class="item-label"><Swap text={item.label} /></span>
				</span>
				<span class="item-value">
					<Ticker value={item.value} {decimals} />
					{#if unit}<span class="item-unit">{unit}</span>{/if}
				</span>
			</button>
		{/each}
	</div>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
</div>

<style>
	/* Categories are steps of the accent, strongest first, so the meter reads as one allowance rather than a rainbow. Free space is the track itself. */
	.meter {
		--usage-meter-segment-0: var(--arc-accent);
		--usage-meter-segment-1: color-mix(in oklch, var(--arc-accent) 62%, var(--arc-surface));
		--usage-meter-segment-2: color-mix(in oklch, var(--arc-accent) 36%, var(--arc-surface));
		--usage-meter-segment-3: color-mix(in oklch, var(--arc-accent) 22%, var(--arc-surface));
		display: grid;
		min-width: 0;
		gap: var(--arc-space-4);
		color: var(--arc-foreground);
	}
	.top {
		display: flex;
		min-width: 0;
		min-height: 28px;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
	}
	/* A long label wraps beside the status mark instead of hiding its end. */
	.title {
		min-width: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
		text-wrap: balance;
	}

	.total {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: var(--arc-space-2);
		margin: 0;
	}
	.amount {
		flex: none;
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
		line-height: var(--arc-leading-display);
	}
	.caption {
		min-width: 0;
		flex: 1;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}

	/* The bar leaves room above and below the track for the limit marker. */
	.bar {
		position: relative;
		padding-block: 5px;
	}
	.track {
		position: relative;
		height: 14px;
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-foreground) 7%, var(--arc-surface));
		isolation: isolate;
		-webkit-tap-highlight-color: transparent;
	}
	/* Collapsed until the springs place it, so the server render matches the first client frame. */
	.segment {
		position: absolute;
		inset: 0;
		transform: scaleX(0);
		transform-origin: 0 50%;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.segment[data-index='0'],
	.swatch[data-index='0'] {
		background: var(--usage-meter-segment-0);
	}
	.segment[data-index='1'],
	.swatch[data-index='1'] {
		background: var(--usage-meter-segment-1);
	}
	.segment[data-index='2'],
	.swatch[data-index='2'] {
		background: var(--usage-meter-segment-2);
	}
	.segment[data-index='3'],
	.swatch[data-index='3'] {
		background: var(--usage-meter-segment-3);
	}
	.segment[data-highlight='off'] {
		opacity: 0.28;
	}
	/* Past the limit the used colours stay, struck through by a hatch; highlighting the overage floods it with the danger colour. */
	.overflow {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		pointer-events: none;
	}
	.hatch {
		fill: var(--arc-surface);
	}
	.over-tint {
		fill: var(--arc-danger);
		opacity: 0;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.overflow[data-highlight='on'] .over-tint {
		opacity: 1;
	}
	.limit {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -1px;
		width: 2px;
		border-radius: 1px;
		background: var(--arc-foreground);
		opacity: 0;
		pointer-events: none;
	}

	/* The legend doubles as the keyboard path: arrow keys move between categories, focus previews one, a press pins it. */
	.legend {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
		gap: 2px;
		margin: 0 calc(var(--arc-space-2) * -1);
	}
	.item {
		display: grid;
		min-width: 0;
		justify-items: start;
		gap: 2px;
		padding: var(--arc-space-2);
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 6px);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.item:hover {
			background: var(--arc-surface-muted);
		}
	}
	.item[aria-pressed='true'] {
		background: var(--arc-surface-muted);
	}
	.item[data-highlight='off'] {
		opacity: 0.45;
	}
	.item:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 0;
	}
	.item-head {
		display: flex;
		min-width: 0;
		max-width: 100%;
		align-items: center;
		gap: var(--arc-space-2);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.item-label {
		min-width: 0;
		flex: 1;
	}
	.key {
		display: grid;
		width: 12px;
		height: 12px;
		flex: none;
		place-items: center;
	}
	.swatch {
		grid-area: 1 / 1;
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.swatch[data-index='free'] {
		background: color-mix(in oklch, var(--arc-foreground) 7%, var(--arc-surface));
		box-shadow: inset 0 0 0 1px var(--arc-border-strong);
	}
	.key-icon {
		grid-area: 1 / 1;
		display: grid;
		place-items: center;
		color: var(--arc-danger);
	}
	.item-value {
		display: flex;
		align-items: baseline;
		gap: 4px;
		padding-left: 20px;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.item-unit {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		font-weight: 400;
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
		.segment,
		.item,
		.over-tint {
			transition: none;
		}
	}
</style>
