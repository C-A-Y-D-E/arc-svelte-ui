<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type RadioCardContent = string | Snippet;

	export type RadioCardOption = {
		value: string;
		label: RadioCardContent;
		/** One or two short lines under the label. */
		description?: RadioCardContent;
		/** A price, estimate, or other value. Sits at the end of a list row, or under the text in a grid card. */
		meta?: RadioCardContent;
		/** Plain decorative icon beside the label. */
		icon?: Snippet;
		disabled?: boolean;
		/** Short reason shown in place of the description when the option is disabled. */
		disabledReason?: RadioCardContent;
	};

	/** Motion drops velocity on time-defined springs, so the glide is written as stiffness and damping. */
	function physicalSpring(visualDuration: number, bounce: number) {
		const root = (2 * Math.PI) / (visualDuration * 1.2);
		return {
			type: 'spring',
			stiffness: root * root,
			damping: 2 * (1 - bounce) * root,
			mass: 1
		} as const;
	}
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		options: RadioCardOption[];
		value?: string | null;
		defaultValue?: string | null;
		onValueChange?: (value: string) => void;
		/** "grid" places cards in responsive columns; "list" stacks full width rows. */
		layout?: 'grid' | 'list';
		/** Narrowest a grid column may get before the grid drops a column, in px. */
		minColumnWidth?: number;
		/** Form field name. Renders a hidden input with the selected value. */
		name?: string;
		required?: boolean;
		disabled?: boolean;
		ref?: HTMLDivElement | null;
	};

	let {
		options,
		defaultValue = null,
		value = $bindable(defaultValue),
		onValueChange,
		layout = 'grid',
		minColumnWidth = 180,
		name,
		required,
		disabled = false,
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const GLIDE = physicalSpring(0.42, 0.14);
	const RING_FADE = { duration: 0.18, ease: motionTokens.ease.standard };

	const uid = $props.id();
	const initialValue = untrack(() => value);
	let ring: HTMLSpanElement;
	const cards: HTMLDivElement[] = $state([]);
	const dots: HTMLSpanElement[] = $state([]);
	let ringPlaced = false;
	let dotsPlaced = false;
	const selectedIndex = $derived(options.findIndex((option) => option.value === value));
	const tabStop = $derived(
		selectedIndex >= 0 && isUsable(options[selectedIndex])
			? selectedIndex
			: options.findIndex(isUsable)
	);

	function isUsable(option: RadioCardOption) {
		return !disabled && !option.disabled;
	}

	function select(next: string) {
		if (next === value) return;
		value = next;
		onValueChange?.(next);
	}

	function jumpRing(box: { x: number; y: number; width: number; height: number }) {
		Object.assign(ring.style, {
			transform: `translateX(${box.x}px) translateY(${box.y}px)`,
			width: `${box.width}px`,
			height: `${box.height}px`
		});
		animate(ring, box, { duration: 0 });
	}

	/** The ring is one element that springs to the selected card's box. At rest it follows layout changes exactly. */
	function placeRing(glide: boolean) {
		const card = cards[selectedIndex];
		const reduced = isReducedMotion();
		if (selectedIndex < 0 || !card) {
			animate(ring, { opacity: 0 }, { duration: 0 });
			ringPlaced = false;
			return;
		}
		const box = {
			x: card.offsetLeft,
			y: card.offsetTop,
			width: card.offsetWidth,
			height: card.offsetHeight
		};
		if (glide && ringPlaced && !reduced) {
			animate(ring, box, GLIDE);
			animate(ring, { opacity: 1 }, { duration: 0 });
			return;
		}
		jumpRing(box);
		const fadeIn = !ringPlaced && !reduced && glide;
		animate(ring, { opacity: fadeIn ? [0, 1] : 1 }, fadeIn ? RING_FADE : { duration: 0 });
		ringPlaced = true;
	}

	$effect(() => {
		void selectedIndex;
		untrack(() => placeRing(true));
	});

	// A resize only snaps the ring to the new layout; it never replays the glide.
	$effect(() => {
		if (!ref) return;
		const observer = new ResizeObserver(() => placeRing(false));
		observer.observe(ref);
		return () => observer.disconnect();
	});

	$effect(() => {
		const instant = !dotsPlaced || isReducedMotion();
		dotsPlaced = true;
		options.forEach((option, index) => {
			const scale = option.value === value ? 1 : 0;
			animate(dots[index], { scale }, instant ? { duration: 0 } : motionTokens.spring.snappy);
		});
	});

	function stepFor(key: string) {
		if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
		if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
		return 0;
	}

	function onKeyDown(event: KeyboardEvent & { currentTarget: HTMLDivElement }, index: number) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (isUsable(options[index])) select(options[index].value);
			return;
		}
		const step = stepFor(event.key);
		if (!step && event.key !== 'Home' && event.key !== 'End') return;
		event.preventDefault();
		const count = options.length;
		const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
		const rtl = horizontal && getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
		let at = event.key === 'Home' ? -1 : event.key === 'End' ? count : index;
		const direction = event.key === 'Home' ? 1 : event.key === 'End' ? -1 : step * rtl;
		for (let tries = 0; tries < count; tries++) {
			at = (at + direction + count) % count;
			if (isUsable(options[at])) {
				cards[at]?.focus();
				select(options[at].value);
				return;
			}
		}
	}
</script>

{#snippet content(copy: RadioCardContent)}
	{#if typeof copy === 'string'}{copy}{:else}{@render copy()}{/if}
{/snippet}

<!-- One selection ring glides from card to card on a spring, so the eye follows the change. Behaves as a native radio group: one tab stop, arrow keys move and select. -->
<div
	bind:this={ref}
	role="radiogroup"
	aria-disabled={disabled || undefined}
	aria-required={required || undefined}
	class={['root', className]}
	data-layout={layout}
	style:--radio-cards-min-column="{minColumnWidth}px"
	{...rest}
>
	<span bind:this={ring} class="ring" aria-hidden="true"></span>
	{#each options as option, index (option.value)}
		{@const checked = index === selectedIndex}
		{@const off = !isUsable(option)}
		{@const description = off && option.disabledReason ? option.disabledReason : option.description}
		<div
			bind:this={cards[index]}
			role="radio"
			class="card"
			aria-checked={checked}
			aria-disabled={off || undefined}
			aria-labelledby="{uid}-{index}-label"
			aria-describedby={description ? `${uid}-${index}-description` : undefined}
			tabindex={index === tabStop ? 0 : -1}
			data-checked={checked || undefined}
			onclick={() => !off && select(option.value)}
			onkeydown={(event) => onKeyDown(event, index)}
		>
			<span class="indicator" aria-hidden="true">
				<span
					bind:this={dots[index]}
					class="indicator-dot"
					style:transform="scale({option.value === initialValue ? 1 : 0})"
				></span>
			</span>
			<span class="body">
				<span id="{uid}-{index}-label" class="label">
					{#if option.icon}<span class="icon">{@render option.icon()}</span>{/if}
					<span class="label-text">{@render content(option.label)}</span>
				</span>
				{#if description}
					<span id="{uid}-{index}-description" class="description"
						>{@render content(description)}</span
					>
				{/if}
			</span>
			{#if option.meta}<span class="meta">{@render content(option.meta)}</span>{/if}
		</div>
	{/each}
	{#if name}<input type="hidden" {name} value={value ?? ''} {required} />{/if}
</div>

<style>
	.root {
		position: relative;
		display: grid;
		gap: 10px;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	.root :global(*),
	.root :global(*::before),
	.root :global(*::after) {
		box-sizing: border-box;
	}
	.root[data-layout='grid'] {
		grid-template-columns: repeat(
			auto-fill,
			minmax(min(100%, var(--radio-cards-min-column, 180px)), 1fr)
		);
	}
	.root[data-layout='list'] {
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
	}

	/* The one moving part: a ring that springs from card to card. It sits over the card border so the card itself never changes size. */
	.ring {
		position: absolute;
		z-index: 1;
		top: 0;
		left: 0;
		border: 1.5px solid var(--arc-control-on);
		border-radius: 20px;
		opacity: 0;
		pointer-events: none;
	}

	.card {
		position: relative;
		display: grid;
		min-width: 0;
		align-items: start;
		gap: 4px 12px;
		padding: 14px 16px;
		border: 1px solid var(--arc-border);
		border-radius: 20px;
		background: var(--arc-surface);
		cursor: pointer;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.root[data-layout='grid'] .card {
		grid-template-areas: 'body indicator' 'meta meta';
		grid-template-columns: minmax(0, 1fr) auto;
		align-content: start;
	}
	.root[data-layout='list'] .card {
		grid-template-areas: 'indicator body meta';
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		padding: 13px 16px 13px 14px;
	}
	.card[data-checked] {
		background: color-mix(in oklch, var(--arc-control-on) 4%, var(--arc-surface));
	}
	.card[aria-disabled='true'] {
		background: var(--arc-surface-muted);
		cursor: not-allowed;
	}
	.card[aria-disabled='true'] :is(.label, .meta) {
		color: var(--arc-text-muted);
	}

	.indicator {
		display: grid;
		width: 18px;
		height: 18px;
		flex: none;
		place-items: center;
		grid-area: indicator;
		border: 1.5px solid var(--arc-border-strong);
		border-radius: 50%;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.root[data-layout='grid'] .indicator {
		margin-top: 1px;
	}
	.card[data-checked] .indicator {
		border-color: var(--arc-control-on);
		background: var(--arc-control-on);
	}
	.indicator-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--arc-control-glyph);
	}
	.card[aria-disabled='true'] .indicator {
		border-color: var(--arc-border);
	}

	.body {
		display: grid;
		min-width: 0;
		gap: 2px;
		grid-area: body;
	}
	.label {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 8px;
		font-weight: 500;
	}
	.label-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.icon {
		display: grid;
		width: 18px;
		height: 18px;
		flex: none;
		place-items: center;
		color: var(--arc-text-secondary);
	}
	.icon > :global(svg) {
		width: 18px;
		height: 18px;
	}
	.card[data-checked] .icon {
		color: var(--arc-foreground);
	}
	.description {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		line-height: 1.45;
		text-wrap: pretty;
	}

	.meta {
		grid-area: meta;
		color: var(--arc-foreground);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.root[data-layout='grid'] .meta {
		margin-top: 10px;
		font-size: var(--arc-text-lg);
	}
	.root[data-layout='list'] .meta {
		font-weight: 500;
	}

	@media (hover: hover) and (pointer: fine) {
		.card:not([data-checked]):not([aria-disabled='true']):hover {
			border-color: var(--arc-border-strong);
		}
	}
	.card:not([data-checked]):not([aria-disabled='true']):active {
		background: var(--arc-surface-muted);
	}
	.card:focus-visible {
		outline: 2px solid var(--arc-control-on);
		outline-offset: 2px;
	}
	.card:focus-visible:not([data-checked]) {
		border-color: var(--arc-border-strong);
		background: var(--arc-surface-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.card,
		.indicator {
			transition: none;
		}
	}
</style>
