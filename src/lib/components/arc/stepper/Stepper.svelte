<script module lang="ts">
	export type StepperOrientation = 'horizontal' | 'vertical';
	export type StepperStatus = 'complete' | 'current' | 'upcoming' | 'error';
	export type StepperStep = {
		/** Stable key, so each step keeps its own motion when the list changes. */
		id: string;
		label: string;
		/** A short hint under the label. */
		description?: string;
		/** Marks the step as failed: the marker morphs into an alert and this message replaces the description. */
		error?: string;
	};
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { strings } from '../strings';
	import { isReducedMotion, motionTokens } from '../motion';
	import StepMarker, { type GlyphKind } from './StepMarker.svelte';
	import SwapText from './SwapText.svelte';

	type Props = {
		steps: StepperStep[];
		/** Index of the step in progress. `steps.length` marks the whole flow complete. */
		current: number;
		orientation?: StepperOrientation;
		/** Called with the index of a completed step when it is chosen. Without it the stepper is a read-only indicator. */
		onStepSelect?: (index: number) => void;
		/** `current` shows only the active step's description, for tight spaces. Errors always show. */
		details?: 'all' | 'current';
		/** Markers only; labels stay available to assistive tech. Horizontal steppers switch to this below 30rem on their own. */
		compact?: boolean;
		label?: string;
		/** Announced, and shown in the compact caption, once every step is complete. */
		completeLabel?: string;
		class?: string;
	};

	let {
		steps,
		current,
		orientation = 'horizontal',
		onStepSelect,
		details = 'all',
		compact = false,
		label: labelProp,
		completeLabel: completeLabelProp,
		class: className
	}: Props = $props();

	const RING_LAG = 0.12;
	const STEP_GAP = motionTokens.stagger.line;
	const label = $derived(labelProp ?? strings.stepperLabel());
	const completeLabel = $derived(completeLabelProp ?? strings.stepperComplete());
	const statusText: Record<StepperStatus, string> = $derived({
		complete: strings.stepperStatusComplete(),
		current: '',
		upcoming: strings.stepperStatusUpcoming(),
		error: strings.stepperStatusError()
	});

	const count = $derived(steps.length);
	const active = $derived(Math.min(Math.max(Math.round(current), 0), count));
	const interactive = $derived(Boolean(onStepSelect));
	const vertical = $derived(orientation === 'vertical');
	const now = $derived(active >= count ? undefined : steps[active]);

	// Remember where progress came from, so a jump across several steps fills or drains its connectors one after another.
	let from = $state(untrack(() => active));
	let lastActive = untrack(() => active);
	$effect.pre(() => {
		if (active === lastActive) return;
		from = lastActive;
		lastActive = active;
	});

	const ringDelay = $derived(
		isReducedMotion() ? 0 : Math.max(0, Math.abs(active - from) - 1) * STEP_GAP + RING_LAG
	);

	function delayAt(index: number) {
		if (isReducedMotion()) return 0;
		if (active > from) return index >= from && index < active ? (index - from) * STEP_GAP : 0;
		return index >= active && index < from ? (from - 1 - index) * STEP_GAP : 0;
	}

	function statusOf(step: StepperStep, index: number): StepperStatus {
		if (step.error) return 'error';
		if (index < active) return 'complete';
		return index === active ? 'current' : 'upcoming';
	}

	function glyphOf(step: StepperStep, index: number): GlyphKind {
		if (step.error) return 'error';
		return index < active ? 'check' : 'number';
	}

	const placedFills = new WeakMap<HTMLElement, StepperOrientation>();

	/** The track stays put; only the fill scales along it on a spring, from the step that was just finished. */
	function fill(filled: boolean, delay: number, axis: StepperOrientation) {
		return (node: HTMLElement) => {
			const scale = filled ? 1 : 0;
			const target =
				axis === 'vertical' ? { scaleX: 1, scaleY: scale } : { scaleX: scale, scaleY: 1 };
			const placed = placedFills.get(node) === axis;
			placedFills.set(node, axis);
			const instant = !placed || untrack(isReducedMotion);
			animate(node, target, instant ? { duration: 0 } : { ...motionTokens.spring.smooth, delay });
		};
	}

	/** Arrow keys move between the steps you can reach; Home and End jump to the first and the current one. */
	function onKeyDown(event: KeyboardEvent) {
		const list = event.currentTarget as HTMLOListElement;
		const rtl = !vertical && getComputedStyle(list).direction === 'rtl';
		const back = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft'];
		const ahead = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'];
		if (![...back, ...ahead, 'Home', 'End'].includes(event.key)) return;
		const targets = Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-reachable]'));
		const at = targets.indexOf(event.target as HTMLButtonElement);
		if (at < 0) return;
		event.preventDefault();
		const last = targets.length - 1;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? last
					: back.includes(event.key)
						? Math.max(0, at - 1)
						: Math.min(last, at + 1);
		targets[next]?.focus();
	}
</script>

<svelte:element
	this={interactive ? 'nav' : 'div'}
	class={['root', vertical ? 'vertical' : 'horizontal', compact && 'compact', className]}
	aria-label={label}
	role={interactive ? undefined : 'group'}
>
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<ol
		class="list"
		style:grid-template-columns={vertical
			? undefined
			: count > 1
				? `repeat(${count - 1}, minmax(0, 1fr)) auto`
				: 'auto'}
		onkeydown={interactive ? onKeyDown : undefined}
	>
		{#each steps as step, index (step.id)}
			{@const isCurrent = index === active}
			{@const status = statusOf(step, index)}
			{@const clickable = interactive && index < active}
			{@const detail =
				step.error ?? (details === 'all' || isCurrent ? step.description : undefined)}
			<li class="item" data-status={status}>
				{#if index < count - 1}
					<span class="connector" aria-hidden="true">
						<span class="fill" {@attach fill(index < active, delayAt(index), orientation)}></span>
					</span>
				{/if}
				{#snippet content()}
					<StepMarker
						number={index + 1}
						kind={glyphOf(step, index)}
						current={isCurrent}
						glyphDelay={delayAt(index)}
						{ringDelay}
					/>
					<span class="text">
						<span class="label">{step.label}</span>
						{#if statusText[status]}
							<span class="sr-only">, {statusText[status]}</span>
						{/if}
						<SwapText text={detail} class={step.error ? 'error' : 'description'} />
					</span>
				{/snippet}
				{#if interactive}
					<button
						type="button"
						class="head"
						data-clickable={clickable || undefined}
						data-reachable={index <= active || undefined}
						aria-current={isCurrent ? 'step' : undefined}
						aria-disabled={clickable ? undefined : true}
						tabindex={clickable ? undefined : -1}
						onclick={clickable ? () => onStepSelect?.(index) : undefined}
					>
						{@render content()}
					</button>
				{:else}
					<span class="head" aria-current={isCurrent ? 'step' : undefined}>{@render content()}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
	{#if !vertical}
		<span class="caption" aria-hidden="true">
			<SwapText text={now?.label ?? completeLabel} class="caption-label" />
			<SwapText
				text={now?.error ?? now?.description}
				class={now?.error ? 'error' : 'description'}
			/>
		</span>
	{/if}
	<span class="sr-only" aria-live="polite"
		>{now
			? strings.stepperStepOf({ step: active + 1, total: count, label: now.label })
			: completeLabel}</span
	>
</svelte:element>

<style>
	.root {
		--marker: 1.75rem;
		--halo: 4px;
		min-width: 0;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	/* A horizontal stepper spans its container, so it can safely measure itself and fold into markers when space runs out. */
	.horizontal {
		width: 100%;
		container: stepper / inline-size;
	}
	.list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.item {
		position: relative;
		min-width: 0;
	}
	.horizontal .item:not(:last-child) {
		padding-inline-end: var(--arc-space-4);
	}
	.vertical .item:not(:last-child) {
		padding-bottom: var(--arc-space-5);
	}
	.compact.vertical .item:not(:last-child) {
		padding-bottom: var(--arc-space-6);
	}
	/* Buttons and spans share one head, so a chosen step keeps focus as it becomes the current one. */
	.head {
		display: grid;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--arc-space-2);
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-align: start;
		cursor: default;
		-webkit-tap-highlight-color: transparent;
	}
	.head[data-clickable] {
		cursor: pointer;
	}
	.horizontal .head {
		width: fit-content;
		max-width: 100%;
		justify-items: start;
		row-gap: var(--arc-space-3);
	}
	.vertical .head {
		width: 100%;
		grid-template-columns: var(--marker) minmax(0, 1fr);
		column-gap: var(--arc-space-3);
		align-items: start;
	}
	.compact.vertical .head {
		grid-template-columns: var(--marker);
		column-gap: 0;
	}
	.head:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 4px;
	}
	.head:focus:not(:focus-visible) {
		outline: none;
	}
	.item[data-status='current'] :global(.disc) {
		box-shadow: inset 0 0 0 1.5px var(--arc-accent);
		color: var(--arc-foreground);
	}
	.item[data-status='complete'] :global(.disc) {
		background: var(--arc-accent);
		box-shadow: inset 0 0 0 1px var(--arc-accent);
		color: var(--arc-accent-foreground);
	}
	.item[data-status='error'] :global(.disc) {
		background: color-mix(in oklch, var(--arc-danger) 10%, var(--arc-surface));
		box-shadow: inset 0 0 0 1.5px var(--arc-danger);
		color: var(--arc-danger);
	}
	.item[data-status='error'] :global(.ring) {
		background: color-mix(in oklch, var(--arc-danger) 16%, transparent);
	}
	.connector {
		position: absolute;
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border);
		pointer-events: none;
	}
	.horizontal .connector {
		top: calc(var(--marker) / 2 - 1px);
		inset-inline: calc(var(--marker) + var(--halo) + var(--arc-space-1))
			calc(var(--halo) + var(--arc-space-1));
		height: 2px;
	}
	/* Both ends keep a clear gap from the markers, and from the current step's ring. */
	.vertical .connector {
		top: calc(var(--marker) + var(--halo) + 2px);
		bottom: calc(var(--halo) + 2px);
		inset-inline-start: calc(var(--marker) / 2 - 1px);
		width: 2px;
	}
	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--arc-accent);
	}
	.horizontal .fill {
		transform-origin: left center;
	}
	.horizontal .fill:dir(rtl) {
		transform-origin: right center;
	}
	.vertical .fill {
		transform-origin: center top;
	}
	.text {
		display: grid;
		min-width: 0;
	}
	/* Centers the first line of the label on the marker. */
	.vertical .text {
		padding-top: 0.25rem;
	}
	.label {
		display: block;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: 1.25rem;
		overflow-wrap: break-word;
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.item[data-status='complete'] .label {
		color: var(--arc-text-secondary);
	}
	.item[data-status='current'] .label,
	.item[data-status='error'] .label {
		color: var(--arc-foreground);
	}
	.caption {
		display: none;
		margin-top: var(--arc-space-3);
	}
	@media (hover: hover) and (pointer: fine) {
		.head[data-clickable]:hover .label {
			color: var(--arc-foreground);
		}
		.item[data-status='complete'] .head[data-clickable]:hover :global(.disc) {
			background: var(--arc-accent-strong);
			box-shadow: inset 0 0 0 1px var(--arc-accent-strong);
		}
		.item[data-status='error'] .head[data-clickable]:hover :global(.disc) {
			background: color-mix(in oklch, var(--arc-danger) 18%, var(--arc-surface));
		}
	}
	.head[data-clickable]:active :global(.disc) {
		transform: scale(0.92);
	}
	.sr-only,
	.compact .text {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.compact.horizontal .caption {
		display: grid;
	}
	/* Four labels no longer fit side by side: keep the markers and name the current step underneath. */
	@container stepper (max-width: 30rem) {
		.horizontal .text {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: 0;
			padding: 0;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.horizontal .caption {
			display: grid;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.label {
			transition: none;
		}
		.head[data-clickable]:active :global(.disc) {
			transform: none;
		}
	}
</style>
