<script module lang="ts">
	export type RadioGroupOption = { value: string; label: string; description?: string };
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLFieldsetAttributes } from 'svelte/elements';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = HTMLFieldsetAttributes & {
		label: string;
		options: RadioGroupOption[];
		value: string;
		onValueChange?: (value: string) => void;
		/** Native radio name for form submission. Generated when omitted. */
		name?: string;
	};

	let {
		label,
		options,
		value = $bindable(),
		onValueChange,
		name,
		class: className,
		...rest
	}: Props = $props();

	const HIDDEN_DOT_SCALE = 0.4;
	const { duration, spring } = motionTokens;

	const id = $props.id();
	const initialValue = untrack(() => value);
	let list: HTMLDivElement;
	let highlight: HTMLSpanElement;
	const rows: HTMLLabelElement[] = $state([]);
	const dots: HTMLSpanElement[] = $state([]);
	let shownIndex: number | null = null;
	let placedAt = '';
	let dotsPlaced = false;
	let ready = $state(false);
	const selectedIndex = $derived(options.findIndex((option) => option.value === value));

	/** Sizes the highlight to the chosen row. A new choice glides on the morph spring; the first paint and resizes place it at once. */
	function place(row: HTMLElement | undefined, glide: boolean) {
		const next = row ? `${row.offsetTop} ${row.offsetHeight}` : '';
		if (next === placedAt) return;
		const visible = placedAt !== '';
		placedAt = next;
		if (!row) {
			animate(highlight, { opacity: 0 }, { duration: 0 });
			return;
		}
		const target = { y: row.offsetTop, height: row.offsetHeight, opacity: 1 };
		if (glide && visible) {
			animate(highlight, target, { ...spring.morph, opacity: { duration: 0 } });
			return;
		}
		// Written to the element too, so the paint that drops the server fallback already shows the highlight in place.
		Object.assign(highlight.style, {
			transform: `translateY(${target.y}px)`,
			height: `${target.height}px`,
			opacity: '1'
		});
		animate(highlight, target, { duration: 0 });
	}

	$effect(() => {
		const index = selectedIndex;
		const glide = shownIndex !== null && shownIndex !== index && !isReducedMotion();
		place(rows[index], glide);
		shownIndex = index;
		ready = true;
	});

	$effect(() => {
		void options.length;
		const observer = new ResizeObserver(() => place(rows[shownIndex ?? -1], false));
		observer.observe(list);
		rows.forEach((row) => row && observer.observe(row));
		return () => observer.disconnect();
	});

	/** The new dot springs in while the old one shrinks away. */
	$effect(() => {
		const instant = !dotsPlaced || isReducedMotion();
		dotsPlaced = true;
		options.forEach((option, index) => {
			const checked = option.value === value;
			const target = checked ? { scale: 1, opacity: 1 } : { scale: HIDDEN_DOT_SCALE, opacity: 0 };
			const fade = { duration: checked ? duration.fast : duration.instant };
			animate(dots[index], target, instant ? { duration: 0 } : { ...spring.snappy, opacity: fade });
		});
	});

	function choose(next: string) {
		value = next;
		onValueChange?.(next);
	}
</script>

<!-- One highlight travels to the chosen row while the new dot springs in and the old one shrinks away, so a change reads as a single physical move. Arrow keys take the same path. Rows and text never resize. -->
<fieldset class={['group', className]} {...rest}>
	<legend>{label}</legend>
	<div bind:this={list} class="options" data-ready={ready || undefined}>
		<span bind:this={highlight} class="highlight" aria-hidden="true"></span>
		{#each options as option, index (option.value)}
			{@const initiallyChecked = option.value === initialValue}
			<label class="option" bind:this={rows[index]}>
				<input
					type="radio"
					name={name ?? id}
					value={option.value}
					checked={value === option.value}
					onchange={() => choose(option.value)}
				/>
				<span class="mark" aria-hidden="true">
					<span
						bind:this={dots[index]}
						class="dot"
						style:opacity={initiallyChecked ? 1 : 0}
						style:transform="scale({initiallyChecked ? 1 : HIDDEN_DOT_SCALE})"
					></span>
				</span>
				<span>
					<strong>{option.label}</strong>
					{#if option.description}<small>{option.description}</small>{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.group {
		display: grid;
		min-width: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}
	.group legend {
		margin-bottom: var(--arc-space-2);
		padding: 0;
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	/* One highlight travels between the rows: above their borders and fills, below their text, so it never crosses a label. */
	.options {
		position: relative;
		display: grid;
		gap: var(--arc-space-2);
	}
	.highlight {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		z-index: 1;
		box-sizing: border-box;
		border: 1px solid var(--arc-control-on);
		border-radius: var(--arc-radius-control);
		background: color-mix(in oklch, var(--arc-control-on) 5%, transparent);
		opacity: 0;
		pointer-events: none;
	}
	/* Rows answer a press with color only; the mark is what moves. The mark sits centered on the left edge of the row, whether or not the option has a description. */
	/* A disabled fieldset disables its radios natively; this shows it, as Switch does. */
	.group:disabled {
		opacity: 0.5;
	}
	.group:disabled .option {
		cursor: not-allowed;
	}
	.option {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--arc-space-3);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: var(--arc-space-3);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.option:hover {
			background: var(--arc-surface-muted);
		}
	}
	.option:active {
		background: var(--arc-surface-muted);
	}
	/* Until the highlight is placed (server paint or no script), the checked row carries the same look itself. */
	.options:not([data-ready]) .option:has(input:checked) {
		border-color: var(--arc-control-on);
		background: color-mix(in oklch, var(--arc-control-on) 5%, transparent);
	}
	/* Focus rides on the highlight when it marks the focused row, so the ring glides with arrow key choices. */
	.option:has(input:focus-visible:not(:checked)),
	.options:not([data-ready]) .option:has(input:focus-visible) {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.options[data-ready]:has(input:checked:focus-visible) .highlight {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.option input {
		position: absolute;
		opacity: 0;
	}
	/* Rows are not stacking contexts, so their mark and copy rise above the highlight while their border and fill stay below it. */
	.option > span {
		position: relative;
		z-index: 2;
	}
	.mark {
		display: grid;
		width: 17px;
		height: 17px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--arc-border-strong);
		border-radius: 50%;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.mark::after,
	.dot {
		grid-area: 1 / 1;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--arc-foreground);
	}
	.dot {
		width: 6px;
		height: 6px;
	}
	/* A faint dot previews the choice while the pointer is down, then the real dot springs in on release. */
	.mark::after {
		content: '';
		opacity: 0;
		transition: opacity var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.option:active:not(:has(input:checked)) .mark::after {
		opacity: 0.22;
	}
	/* The mark alone answers a press: a quick dip, then a spring back. */
	.option:active .mark {
		transform: scale(0.88);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 100ms var(--arc-ease-standard);
	}
	.option:has(input:checked) .mark {
		border-color: var(--arc-control-on);
		background: var(--arc-control-on);
	}
	.option:has(input:checked) .dot {
		background: var(--arc-control-glyph);
	}
	.option strong,
	.option small {
		display: block;
	}
	.option strong {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.option:has(input:checked) strong {
		color: var(--arc-foreground);
	}
	.option small {
		margin-top: 2px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	@media (prefers-reduced-motion: reduce) {
		.option,
		.mark,
		.mark::after,
		.option strong {
			transition: none;
		}
		.option:active .mark {
			transform: none;
		}
	}
</style>
