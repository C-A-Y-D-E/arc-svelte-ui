<script lang="ts">
	import { animate, inView } from 'motion';
	import type { TransitionConfig } from 'svelte/transition';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { springEasing } from '../copy-button';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import RiseText from './RiseText.svelte';
	import type { TimelineRow } from './types';

	type Props = {
		row: TimelineRow;
		last: boolean;
		expanded: boolean;
		/** Added after the first render: it slides in at the top while the rest glide down. */
		fresh: boolean;
		timeLabel: string;
		timeFull: string;
		/** Hands out reveal delays, so rows that come into view together draw the line downward in turn. */
		schedule: () => number;
		onToggle: () => void;
	};

	let { row, last, expanded, fresh, timeLabel, timeFull, schedule, onToggle }: Props = $props();

	const detailId = $props.id();
	const MS_PER_SECOND = 1000;
	const AVATAR_PX = 28;
	const REVEAL_AMOUNT = 0.2;
	const FRESH_REVEAL_DELAY_S = 0.12;
	const SEGMENT_LAG_S = 0.1;
	const REDUCED_FADE_S = 0.15;
	const CONTENT_FADE_DELAY_S = 0.05;
	const CONTENT_DROP_PX = -10;
	const DETAIL_DROP_PX = -4;
	const DETAIL_FADE_DELAY_S = 0.06;
	const DETAIL_FADE_OUT_S = 0.1;
	const ROW_FADE_OUT_S = 0.12;
	const REDUCED_ROW_EXIT_S = 0.1;
	const { spring, duration, blur } = motionTokens;
	const popSpring = { ...spring.morph, visualDuration: 0.36, bounce: 0.32 };
	const drawSpring = { ...spring.smooth, visualDuration: 0.34 };
	const smooth = springEasing(spring.smooth);
	const rowCollapse = springEasing({ ...spring.smooth, visualDuration: 0.3 });
	const detailCollapse = springEasing({ ...spring.smooth, visualDuration: 0.28 });

	const tone = $derived(row.avatar ? undefined : (row.tone ?? 'neutral'));

	let item: HTMLLIElement;
	/** Seconds to wait before the marker pops, set the first time the row scrolls into view. */
	let revealDelay = $state<number | null>(null);

	$effect(() => {
		const stop = inView(
			item,
			() => {
				revealDelay ??= schedule() + (fresh ? FRESH_REVEAL_DELAY_S : 0);
				stop();
			},
			{ amount: REVEAL_AMOUNT }
		);
		return stop;
	});

	function popMarker(marker: HTMLElement) {
		if (revealDelay === null) return;
		const delay = revealDelay;
		if (isReducedMotion()) {
			animate(marker, { scale: 1 }, { duration: 0 });
			animate(marker, { opacity: 1 }, { duration: REDUCED_FADE_S });
			return;
		}
		animate(marker, { scale: [0.4, 1] }, { ...popSpring, delay });
		animate(
			marker,
			{ opacity: [0, 1] },
			{ duration: duration.fast, ease: motionTokens.ease.enter, delay }
		);
	}

	function drawSegment(segment: HTMLElement) {
		if (revealDelay === null) return;
		const transition = isReducedMotion()
			? { duration: 0 }
			: { ...drawSpring, delay: revealDelay + SEGMENT_LAG_S };
		animate(segment, { scaleY: [0, 1] }, transition);
	}

	const turnedChevrons = new WeakSet<Element>();

	function turnChevron(degrees: number) {
		return (chevron: HTMLElement) => {
			const instant = isReducedMotion() || !turnedChevrons.has(chevron);
			turnedChevrons.add(chevron);
			animate(chevron, { rotate: degrees }, instant ? { duration: 0 } : spring.snappy);
		};
	}

	function clamp01(progress: number) {
		return Math.min(1, Math.max(0, progress));
	}

	/** Opens from nothing on the spring; clips only while it grows. */
	function growIn(node: HTMLElement, spring: ReturnType<typeof springEasing>): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		const full = node.offsetHeight;
		return {
			duration: spring.duration * MS_PER_SECOND,
			css: (t) => `overflow:clip;height:${full * spring.easing(t)}px`
		};
	}

	function rowIn(node: HTMLElement) {
		return fresh ? growIn(node, smooth) : { duration: 0 };
	}

	function rowOut(node: HTMLElement): TransitionConfig {
		if (isReducedMotion())
			return { duration: REDUCED_ROW_EXIT_S * MS_PER_SECOND, css: (t) => `opacity:${t}` };
		const full = node.offsetHeight;
		return {
			duration: rowCollapse.duration * MS_PER_SECOND,
			css: (t) => {
				const elapsed = (1 - t) * rowCollapse.duration;
				const height = full * (1 - rowCollapse.easing(1 - t));
				return `overflow:clip;height:${height}px;opacity:${1 - clamp01(elapsed / ROW_FADE_OUT_S)}`;
			}
		};
	}

	function contentIn(_node: Element): TransitionConfig {
		if (!fresh) return { duration: 0 };
		if (isReducedMotion()) {
			return { duration: REDUCED_FADE_S * MS_PER_SECOND, css: (t) => `opacity:${t}` };
		}
		const total = Math.max(smooth.duration, CONTENT_FADE_DELAY_S + duration.standard);
		return {
			duration: total * MS_PER_SECOND,
			css: (t) => {
				const elapsed = t * total;
				const drop = CONTENT_DROP_PX * (1 - smooth.easing(clamp01(elapsed / smooth.duration)));
				const fade = ease.enter(clamp01((elapsed - CONTENT_FADE_DELAY_S) / duration.standard));
				return `opacity:${fade};transform:translateY(${drop}px);filter:blur(${blur.soft * (1 - fade)}px)`;
			}
		};
	}

	function detailOut(node: HTMLElement): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		const full = node.offsetHeight;
		return {
			duration: detailCollapse.duration * MS_PER_SECOND,
			css: (t) => `overflow:clip;height:${full * (1 - detailCollapse.easing(1 - t))}px`
		};
	}

	function detailInnerIn(_node: Element): TransitionConfig {
		if (isReducedMotion()) {
			return { duration: REDUCED_FADE_S * MS_PER_SECOND, css: (t) => `opacity:${t}` };
		}
		return {
			delay: DETAIL_FADE_DELAY_S * MS_PER_SECOND,
			duration: duration.standard * MS_PER_SECOND,
			easing: ease.enter,
			css: (t, u) =>
				`opacity:${t};transform:translateY(${DETAIL_DROP_PX * u}px);filter:blur(${blur.soft * u}px)`
		};
	}

	function detailInnerOut(_node: Element): TransitionConfig {
		return {
			duration: DETAIL_FADE_OUT_S * MS_PER_SECOND,
			easing: ease.standard,
			css: (t) => `opacity:${t}`
		};
	}

	const triggerAttributes = $derived(
		row.detail
			? {
					type: 'button' as const,
					'data-timeline-trigger': '',
					'aria-expanded': expanded,
					'aria-controls': expanded ? detailId : undefined,
					onclick: onToggle
				}
			: {}
	);
</script>

<li bind:this={item} class="item" in:rowIn out:rowOut>
	<span
		class="marker"
		data-tone={tone}
		aria-hidden="true"
		style="opacity: 0; transform: scale(0.4)"
		{@attach popMarker}
	>
		{#if row.avatar}
			<img src={row.avatar} alt="" width={AVATAR_PX} height={AVATAR_PX} decoding="async" />
		{:else}
			{@render row.icon?.()}
		{/if}
	</span>
	{#if !last}
		<span class="segment" aria-hidden="true" style="transform: scaleY(0)" {@attach drawSegment}
		></span>
	{/if}
	<div class="content" in:contentIn>
		<svelte:element this={row.detail ? 'button' : 'div'} class="trigger" {...triggerAttributes}>
			<span class="text">
				<span class="title">
					{#if row.actor}<span class="actor">{row.actor}</span>{' '}{/if}{row.title}
				</span>
				{#if row.meta}<span class="meta">{row.meta}</span>{/if}
			</span>
			<time class="time" datetime={new Date(row.time).toISOString()} title={timeFull}>
				<RiseText text={timeLabel} />
				<span class="sr-only">{timeFull}</span>
			</time>
			{#if row.detail}
				<span class="chevron" aria-hidden="true" {@attach turnChevron(expanded ? 180 : 0)}>
					<ChevronDownIcon size={16} strokeWidth={1.75} />
				</span>
			{/if}
		</svelte:element>
		{#if expanded && row.detail}
			<div id={detailId} class="detail" in:growIn={smooth} out:detailOut>
				<div class="detail-inner" in:detailInnerIn out:detailInnerOut>{@render row.detail()}</div>
			</div>
		{/if}
	</div>
</li>

<style>
	.item {
		position: relative;
		padding-left: calc(var(--marker) + var(--arc-space-2));
	}
	.marker {
		position: absolute;
		z-index: 1;
		top: var(--marker-top);
		left: 0;
		display: grid;
		width: var(--marker);
		height: var(--marker);
		place-items: center;
		border-radius: var(--arc-radius-pill);
		color: var(--arc-text-secondary);
	}
	.marker img {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: inherit;
		object-fit: cover;
	}
	/* A person's portrait sits on a hairline ring; a system event is a quiet node with its icon. */
	.marker::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid color-mix(in oklch, var(--arc-foreground) 10%, transparent);
		border-radius: inherit;
		pointer-events: none;
	}
	.marker[data-tone] {
		background: var(--arc-surface);
	}
	.marker[data-tone='success'] {
		background: color-mix(in oklch, var(--arc-success) 12%, var(--arc-surface));
		color: var(--arc-success);
	}
	.marker[data-tone='danger'] {
		background: color-mix(in oklch, var(--arc-danger) 12%, var(--arc-surface));
		color: var(--arc-danger);
	}
	.marker :global(svg) {
		width: 14px;
		height: 14px;
		stroke-width: 2;
	}
	/* The line runs from just under this marker to just above the next one and draws downward from its top. */
	.segment {
		position: absolute;
		top: calc(var(--marker-top) + var(--marker) + var(--line-gap));
		bottom: calc(var(--line-gap) - var(--marker-top));
		left: calc(var(--marker) / 2 - 0.5px);
		width: 1px;
		background: var(--arc-border-strong);
		transform-origin: 50% 0;
	}
	.content {
		min-width: 0;
	}
	.trigger {
		display: grid;
		width: 100%;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		column-gap: var(--arc-space-3);
		margin: 0;
		padding: 12px var(--arc-space-3);
		border: 0;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	button.trigger {
		grid-template-columns: minmax(0, 1fr) auto 16px;
		cursor: pointer;
	}
	@media (hover: hover) and (pointer: fine) {
		button.trigger:hover {
			background: var(--arc-surface-muted);
		}
	}
	button.trigger:active {
		background: var(--arc-surface-muted);
	}
	button.trigger:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.text {
		display: grid;
		min-width: 0;
		gap: 2px;
	}
	.title {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: 20px;
	}
	.actor {
		color: var(--arc-foreground);
		font-weight: 500;
	}
	.meta {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	/* Times keep a steady column, so "9m" becoming "10m" never rewraps the title beside it. */
	.time {
		display: flex;
		min-width: 2.75rem;
		justify-content: flex-end;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 20px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.chevron {
		display: grid;
		height: 20px;
		place-items: center;
		color: var(--arc-text-muted);
	}
	.detail {
		overflow: clip;
		overflow-clip-margin: 4px;
	}
	.detail-inner {
		padding: 0 var(--arc-space-3) var(--arc-space-4);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (max-width: 420px) {
		.trigger {
			column-gap: var(--arc-space-2);
			padding-inline: var(--arc-space-2);
		}
		.detail-inner {
			padding-inline: var(--arc-space-2);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger {
			transition: none;
		}
	}
</style>
