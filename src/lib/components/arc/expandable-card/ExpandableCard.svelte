<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { animate } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';
	import RollingText from './RollingText.svelte';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title' | 'children'> & {
		title: string;
		description?: string;
		children: Snippet;
		defaultExpanded?: boolean;
		/** Collapsed width cap in px. The card is centered and never wider than its container. Fills the container when omitted. */
		width?: number;
		/** Expanded width cap in px, so the card can grow sideways into more room. Defaults to `width`. */
		expandedWidth?: number;
	};

	let {
		title,
		description,
		children,
		defaultExpanded = false,
		width,
		expandedWidth,
		class: className,
		style,
		onkeydown,
		...rest
	}: Props = $props();

	/**
	 * One morph: the box grows in width and height on the same spring, which never overshoots, so close is the exact mirror of open.
	 * Size is animated for real (not with a scale), so the text, border, and corner radius never stretch.
	 */
	const MORPH = motionTokens.spring.smooth;
	/** On close the details fade out first, then the box starts to shrink; on open they fade in once the box has made room. */
	const CLOSE_HOLD_SECONDS = 0.06;
	/** A close that reverses an open still in flight skips the hold, so the spring turns around with its velocity instead of stalling. */
	const SETTLE_MS = 450;
	const CONTENT_IN_DELAY_SECONDS = 0.12;
	const CONTENT_OUT_SECONDS = 0.1;
	const CARD_BORDERS_PX = 2;
	const ROTATION_OPEN = 180;
	const STILL = { duration: 0 };

	const panelId = $props.id();
	const initiallyExpanded = untrack(() => defaultExpanded);
	let expanded = $state(initiallyExpanded);
	let hold = true;
	let lastToggle = 0;

	let track: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let card: HTMLElement;
	let arrow: HTMLSpanElement;
	let panel: HTMLDivElement;
	let details: HTMLDivElement;

	// The room the card can use, measured from its centering track. Until it is known, CSS caps the width.
	let room = $state<number | null>(null);

	const openCap = $derived(expandedWidth ?? width);
	const fit = (cap: number | undefined) =>
		room === null ? undefined : Math.min(room, cap ?? room);
	const boxWidth = $derived(fit(expanded ? openCap : width));
	// The details are laid out at their final width the whole time, so nothing reflows while the box changes size.
	const innerWidth = $derived(fit(openCap));

	function boxTransition() {
		if (isReducedMotion()) return STILL;
		return expanded || !hold ? MORPH : { ...MORPH, delay: CLOSE_HOLD_SECONDS };
	}

	function contentTransition() {
		if (isReducedMotion()) return STILL;
		return expanded
			? {
					duration: motionTokens.duration.standard,
					ease: motionTokens.ease.standard,
					delay: CONTENT_IN_DELAY_SECONDS
				}
			: { duration: CONTENT_OUT_SECONDS, ease: motionTokens.ease.standard };
	}

	$effect(() => {
		const measure = () => (room = track.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(track);
		return () => observer.disconnect();
	});

	// The first measurement lands without motion; later changes spring from the current width and velocity.
	let placed = false;
	$effect(() => {
		if (boxWidth === undefined) return;
		const transition = placed ? untrack(boxTransition) : STILL;
		placed = true;
		const controls = animate(card, { width: boxWidth }, transition);
		return () => controls.stop();
	});

	// The panel stays mounted so a second click mid-animation reverses from where it is.
	let rendered = initiallyExpanded;
	$effect(() => {
		if (initiallyExpanded) animate(arrow, { rotate: ROTATION_OPEN }, STILL);
	});
	$effect(() => {
		const open = expanded;
		if (open === rendered) return;
		rendered = open;
		const box = boxTransition();
		animate(arrow, { rotate: open ? ROTATION_OPEN : 0 }, box);
		animate(panel, { height: open ? details.offsetHeight : 0 }, box).then(() => {
			if (open && expanded) panel.style.height = 'auto';
		});
		animate(details, { opacity: open ? 1 : 0 }, contentTransition());
	});

	function toggle(next: boolean) {
		const now = performance.now();
		hold = now - lastToggle > SETTLE_MS;
		lastToggle = now;
		expanded = next;
	}

	function handleKeydown(event: KeyboardEvent & { currentTarget: EventTarget & HTMLElement }) {
		onkeydown?.(event);
		if (event.defaultPrevented || event.key !== 'Escape' || !expanded) return;
		event.preventDefault();
		toggle(false);
		trigger.focus();
	}
</script>

<div bind:this={track} class="track">
	<article
		{...rest}
		bind:this={card}
		class={['card', className]}
		{style}
		style:--expandable-card-width={width ? `${width}px` : undefined}
		style:--expandable-card-expanded-width={openCap ? `${openCap}px` : undefined}
		data-expanded={expanded}
		data-measured={room === null ? undefined : ''}
		onkeydown={handleKeydown}
	>
		<button
			bind:this={trigger}
			type="button"
			class="trigger"
			aria-expanded={expanded}
			aria-controls={panelId}
			onclick={() => toggle(!expanded)}
		>
			<span class="copy">
				<strong>{title}</strong>
				{#if description}<span class="description"><RollingText text={description} /></span>{/if}
			</span>
			<span
				bind:this={arrow}
				class="arrow"
				style:transform={initiallyExpanded ? `rotate(${ROTATION_OPEN}deg)` : undefined}
			>
				<ChevronDownIcon size={18} aria-hidden="true" />
			</span>
		</button>
		<!-- inert keeps closed details out of reach. -->
		<div
			bind:this={panel}
			id={panelId}
			class="panel"
			inert={!expanded}
			style:height={initiallyExpanded ? undefined : '0px'}
		>
			<div
				bind:this={details}
				class="panel-inner"
				style:width={innerWidth === undefined ? undefined : `${innerWidth - CARD_BORDERS_PX}px`}
				style:opacity={initiallyExpanded ? undefined : '0'}
			>
				{@render children()}
			</div>
		</div>
	</article>
</div>

<style>
	/* The track centers the card and measures the room it may grow into. */
	.track {
		display: flex;
		width: 100%;
		min-width: 0;
		justify-content: center;
	}
	.card {
		width: 100%;
		max-width: var(--expandable-card-width, 100%);
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-surface);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
	}
	.card[data-expanded='true'] {
		max-width: var(--expandable-card-expanded-width, var(--expandable-card-width, 100%));
	}
	/* Once measured, the width is animated in px, so the CSS cap steps aside and never clamps the morph. */
	.card[data-measured] {
		max-width: 100%;
	}
	/* The card clips the header to its corners, so the header's hover fill never changes shape while the card opens or closes. */
	.trigger {
		display: flex;
		width: 100%;
		min-height: 64px;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-5);
		border: 0;
		padding: var(--arc-space-4) var(--arc-space-5);
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		text-align: left;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover {
			background: var(--arc-surface-muted);
		}
		.trigger:hover .arrow {
			color: var(--arc-foreground);
		}
	}
	.trigger:active {
		background: var(--arc-surface-muted);
	}
	.copy {
		min-width: 0;
	}
	.copy strong {
		display: block;
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.description {
		display: block;
		margin-top: 4px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.arrow {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		color: var(--arc-text-muted);
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.card[data-expanded='true'] .arrow {
		color: var(--arc-foreground);
	}
	/* The divider is an inset line rather than a border, so a collapsed panel is truly zero height and nothing pops at the end of the close. */
	.panel {
		overflow: hidden;
		box-shadow: inset 0 1px 0 var(--arc-border);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.panel-inner {
		max-width: none;
		padding: var(--arc-space-4) var(--arc-space-5) var(--arc-space-5);
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.arrow {
			transition: none;
		}
	}
</style>
