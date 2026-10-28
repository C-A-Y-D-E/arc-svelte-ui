<script module lang="ts">
	export type BillingToggleOption = {
		value: string;
		label: string;
		/** Short savings note, e.g. "Save 20%". */
		badge?: string;
		/** Badge text once this option is selected, e.g. "You save $48". Defaults to `badge`. */
		activeBadge?: string;
	};

	const DEFAULT_OPTIONS: BillingToggleOption[] = [
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly', badge: 'Save 20%' }
	];
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion } from '../motion';
	import StableSwap from './StableSwap.svelte';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		value: string;
		onValueChange?: (value: string) => void;
		options?: BillingToggleOption[];
		/** Accessible name of the group. */
		label?: string;
		size?: 'md' | 'lg';
	};

	let {
		value = $bindable(),
		onValueChange,
		options = DEFAULT_OPTIONS,
		label = 'Billing period',
		size = 'md',
		class: className,
		...rest
	}: Props = $props();

	type Thumb = { x: number; width: number };

	/** Critically damped: the thumb glides and lands without overshoot. */
	const GLIDE = { type: 'spring', visualDuration: 0.34, bounce: 0 } as const;

	let root: HTMLDivElement;
	let thumbNode = $state<HTMLSpanElement>();
	let thumb = $state<Thumb | null>(null);
	const optionNodes: HTMLButtonElement[] = $state([]);
	let placedNode: HTMLSpanElement | undefined;
	const selectedIndex = $derived(
		Math.max(
			0,
			options.findIndex((option) => option.value === value)
		)
	);

	function measure() {
		const node = optionNodes[selectedIndex];
		if (!node) return;
		if (thumb && thumb.x === node.offsetLeft && thumb.width === node.offsetWidth) return;
		thumb = { x: node.offsetLeft, width: node.offsetWidth };
	}

	$effect(() => {
		void selectedIndex;
		untrack(measure);
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!thumbNode || !thumb) return;
		const target = { x: thumb.x, width: thumb.width };
		if (placedNode !== thumbNode || isReducedMotion()) {
			placedNode = thumbNode;
			animate(thumbNode, target, { duration: 0 });
			return;
		}
		animate(thumbNode, target, GLIDE);
	});

	function choose(next: string) {
		value = next;
		onValueChange?.(next);
	}

	function onKeyDown(event: KeyboardEvent, index: number) {
		const last = options.length - 1;
		const step = ['ArrowRight', 'ArrowDown'].includes(event.key)
			? 1
			: ['ArrowLeft', 'ArrowUp'].includes(event.key)
				? -1
				: 0;
		const target =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? last
					: step
						? (index + step + options.length) % options.length
						: -1;
		if (target < 0) return;
		event.preventDefault();
		choose(options[target].value);
		optionNodes[target]?.focus();
	}

	function badgeCandidates(option: BillingToggleOption) {
		return [option.badge, option.activeBadge].filter((text): text is string => !!text);
	}
</script>

<!-- One thumb glides between the options on a critically damped spring; the savings note on the cheaper period tints and rewrites itself once chosen. -->
<div
	bind:this={root}
	role="radiogroup"
	aria-label={label}
	class={['root', className]}
	data-size={size}
	{...rest}
>
	{#if thumb}
		<span bind:this={thumbNode} class="thumb" aria-hidden="true"></span>
	{/if}
	{#each options as option, index (option.value)}
		{@const selected = index === selectedIndex}
		{@const badgeText = selected ? (option.activeBadge ?? option.badge) : option.badge}
		<button
			bind:this={optionNodes[index]}
			type="button"
			role="radio"
			aria-checked={selected}
			tabindex={selected ? 0 : -1}
			class="option"
			data-selected={selected || undefined}
			onclick={() => choose(option.value)}
			onkeydown={(event) => onKeyDown(event, index)}
		>
			{#if selected && !thumb}
				<span class="thumb-static" aria-hidden="true"></span>
			{/if}
			<span class="content">
				<span class="label">{option.label}</span>
				{#if badgeText}
					<span class="badge" data-active={selected || undefined}>
						<StableSwap text={badgeText} candidates={badgeCandidates(option)} />
					</span>
				{/if}
			</span>
		</button>
	{/each}
</div>

<style>
	/* Override --billing-accent on any ancestor to recolor the savings note. */
	.root {
		--billing-accent-resolved: var(--billing-accent, var(--arc-success));
		--billing-height: 34px;
		--billing-pad: 3px;
		position: relative;
		isolation: isolate;
		display: inline-flex;
		max-width: 100%;
		align-items: center;
		padding: var(--billing-pad);
		border: 1px solid var(--arc-border-subtle);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		line-height: 1;
	}
	.root[data-size='lg'] {
		--billing-height: 42px;
		--billing-pad: 4px;
		font-size: var(--arc-text-base);
	}

	/* One thumb for the whole track. Its position and width are measured from the selected option. */
	.thumb,
	.thumb-static {
		position: absolute;
		z-index: -1;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-raised);
		box-shadow:
			0 0 0 1px var(--arc-border-subtle),
			0 1px 2px oklch(0% 0 0 / 0.06),
			0 2px 6px oklch(0% 0 0 / 0.04);
		pointer-events: none;
	}
	.thumb {
		top: var(--billing-pad);
		bottom: var(--billing-pad);
		left: 0;
		will-change: transform, width;
	}
	.thumb-static {
		inset: 0;
	}
	:global(.dark) .thumb,
	:global(.dark) .thumb-static {
		box-shadow:
			0 0 0 1px var(--arc-border),
			inset 0 1px 0 oklch(100% 0 0 / 0.05),
			0 1px 2px oklch(0% 0 0 / 0.3);
	}

	.option {
		position: relative;
		display: inline-flex;
		min-width: 0;
		height: var(--billing-height);
		align-items: center;
		padding: 0 14px;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-muted);
		font: inherit;
		letter-spacing: inherit;
		white-space: nowrap;
		cursor: pointer;
		transition: color var(--arc-duration-fast) ease;
		-webkit-tap-highlight-color: transparent;
	}
	.option[data-selected] {
		color: var(--arc-foreground);
		cursor: default;
	}
	.option:focus-visible {
		outline: 2px solid var(--arc-accent);
		outline-offset: -2px;
	}
	.option:has(.badge) {
		padding-right: 5px;
	}
	.root[data-size='lg'] .option {
		padding-inline: 18px;
	}
	.root[data-size='lg'] .option:has(.badge) {
		padding-right: 6px;
	}

	@media (hover: hover) and (pointer: fine) {
		.option:not([data-selected]):hover {
			color: var(--arc-text-secondary);
		}
	}

	.content {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: transform var(--arc-duration-fast) cubic-bezier(0.23, 1, 0.32, 1);
	}
	.option:not([data-selected]):active .content {
		transform: scale(0.97);
	}

	.label {
		font-weight: 500;
	}

	/* The savings note: quiet until its option is chosen, then it takes the accent tint. */
	.badge {
		display: inline-flex;
		height: calc(var(--billing-height) - 10px);
		align-items: center;
		padding: 0 8px;
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-foreground) 6%, transparent);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		transition:
			background-color var(--arc-duration-standard) ease,
			color var(--arc-duration-standard) ease;
	}
	.badge[data-active] {
		background: color-mix(in oklch, var(--billing-accent-resolved) 13%, transparent);
		color: color-mix(in oklch, var(--billing-accent-resolved) 88%, var(--arc-foreground));
	}
	:global(.dark) .badge[data-active] {
		background: color-mix(in oklch, var(--billing-accent-resolved) 18%, transparent);
		color: var(--billing-accent-resolved);
	}

	@media (prefers-reduced-motion: reduce) {
		.content,
		.badge {
			transition: none;
		}
	}
</style>
