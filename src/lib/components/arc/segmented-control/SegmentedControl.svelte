<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type Segment = {
		value: string;
		label: string;
		/** Optional content after the label, such as a badge. */
		accessory?: Snippet;
		/** Shown but not choosable, e.g. a state the app sets itself. Not in Arc. */
		disabled?: boolean;
	};
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion, moveIndicator } from '../motion';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'role'> & {
		options: Segment[];
		value: string;
		onValueChange?: (value: string) => void;
		/** aria-label for the group. */
		label?: string;
		/** Called when the pointer or focus reaches an option, before it is chosen. Use it to start loading what that option shows. */
		onOptionIntent?: (value: string) => void;
		/** Stretches to the container and splits it evenly between options. Not in Arc. */
		fill?: boolean;
		/** Shorter and frameless, for a toolbar row inside a panel. Not in Arc. */
		compact?: boolean;
	};

	let {
		options,
		value = $bindable(),
		onValueChange,
		label,
		onOptionIntent,
		fill = false,
		compact = false,
		class: className,
		...rest
	}: Props = $props();

	/** Room kept beside the selected option when it scrolls into view, so it clears the edge fade. */
	const SCROLL_ROOM_PX = 20;
	const EDGE_TOLERANCE_PX = 1;

	const id = $props.id();
	let track: HTMLDivElement;
	let selection: HTMLSpanElement;
	const buttons: HTMLButtonElement[] = $state([]);
	let indicatorPlaced = false;
	let scrolledOnce = false;
	const selectedIndex = $derived(
		Math.max(
			0,
			options.findIndex((option) => option.value === value)
		)
	);

	// When the options are wider than the container, the track scrolls inside itself. Edges fade only on the side with more to see.
	$effect(() => {
		void options.length;
		const updateEdges = () => {
			const rest = track.scrollWidth - track.clientWidth - track.scrollLeft;
			track.toggleAttribute('data-fade-start', track.scrollLeft > EDGE_TOLERANCE_PX);
			track.toggleAttribute('data-fade-end', rest > EDGE_TOLERANCE_PX);
		};
		const onResize = () => {
			updateEdges();
			// Filled options change width with the container, so the highlight follows without animating.
			if (fill) moveIndicator(selection, buttons[selectedIndex], { instant: true });
		};
		updateEdges();
		track.addEventListener('scroll', updateEdges, { passive: true });
		const observer = new ResizeObserver(onResize);
		observer.observe(track);
		return () => {
			track.removeEventListener('scroll', updateEdges);
			observer.disconnect();
		};
	});

	$effect(() => {
		const target = buttons[options.findIndex((option) => option.value === value)];
		moveIndicator(selection, target, { instant: !indicatorPlaced });
		indicatorPlaced = !!target;
	});

	// The selected option is always scrolled fully into view, with a little room so it clears the fade.
	$effect(() => {
		const button = buttons[selectedIndex];
		const first = !scrolledOnce;
		scrolledOnce = true;
		if (!button || track.scrollWidth <= track.clientWidth) return;
		const start = button.offsetLeft - SCROLL_ROOM_PX;
		const end = button.offsetLeft + button.offsetWidth + SCROLL_ROOM_PX - track.clientWidth;
		const left = track.scrollLeft > start ? start : track.scrollLeft < end ? end : track.scrollLeft;
		if (left === track.scrollLeft) return;
		track.scrollTo({
			left: Math.max(0, left),
			behavior: first || isReducedMotion() ? 'auto' : 'smooth'
		});
	});

	function choose(next: string) {
		value = next;
		onValueChange?.(next);
	}

	// Arrow keys, Home and End move the selection like a tab list; only the selected option is a tab stop.
	function onKeyDown(event: KeyboardEvent) {
		const last = options.length - 1;
		const target =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? selectedIndex === last
					? 0
					: selectedIndex + 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? selectedIndex === 0
						? last
						: selectedIndex - 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? last
							: -1;
		if (target < 0 || !options[target] || options[target].disabled) return;
		event.preventDefault();
		choose(options[target].value);
		buttons[target]?.focus({ preventScroll: true });
	}
</script>

<div
	class={['root', fill && 'fill', compact && 'compact', className]}
	role="group"
	aria-label={label}
	{...rest}
>
	<div bind:this={track} class="track">
		<span bind:this={selection} class="selection" aria-hidden="true"></span>
		{#each options as option, index (option.value)}
			<button
				bind:this={buttons[index]}
				id="{id}-{option.value}"
				class="button"
				type="button"
				data-value={option.value}
				aria-pressed={value === option.value}
				disabled={option.disabled}
				tabindex={index === selectedIndex ? 0 : -1}
				onclick={() => choose(option.value)}
				onkeydown={onKeyDown}
				onpointerenter={onOptionIntent ? () => onOptionIntent(option.value) : undefined}
				onfocus={onOptionIntent ? () => onOptionIntent(option.value) : undefined}
			>
				<span class="label">{option.label}{@render option.accessory?.()}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.fill {
		display: flex;
		width: 100%;
	}
	.fill .track {
		flex: 1;
	}
	.fill .button {
		flex: 1;
	}
	/* The frame can shrink below its content inside flex and grid parents; the track then scrolls inside it. */
	.root {
		display: inline-flex;
		min-width: 0;
		max-width: 100%;
		flex-shrink: 1;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface-muted);
	}
	/* The track owns the stacking context so the gliding highlight passes under every label, not over earlier ones. */
	.track {
		--segmented-fade-start: 0px;
		--segmented-fade-end: 0px;
		position: relative;
		isolation: isolate;
		display: flex;
		min-width: 0;
		gap: 2px;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		padding: 3px;
		border-radius: inherit;
		scrollbar-width: none;
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--segmented-fade-start),
			#000 calc(100% - var(--segmented-fade-end)),
			transparent
		);
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--segmented-fade-start),
			#000 calc(100% - var(--segmented-fade-end)),
			transparent
		);
	}
	.track::-webkit-scrollbar {
		display: none;
	}
	.track:global([data-fade-start]) {
		--segmented-fade-start: 20px;
	}
	.track:global([data-fade-end]) {
		--segmented-fade-end: 20px;
	}
	/* Items never scale or change weight; only the highlight travels and the label color follows it. */
	.button {
		position: relative;
		flex: 0 0 auto;
		min-height: var(--arc-control-height-sm);
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 3px);
		padding: 0 13px;
		background: transparent;
		color: var(--arc-text-muted);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* A disabled option that is selected still reads as the current state. */
	.button:disabled {
		cursor: default;
	}
	.button:disabled:not([aria-pressed='true']) {
		opacity: 0.5;
	}
	@media (hover: hover) and (pointer: fine) {
		.button:hover:not(:disabled) {
			color: var(--arc-foreground);
		}
	}
	.button:active,
	.button[aria-pressed='true'] {
		color: var(--arc-foreground);
	}
	.button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.selection {
		position: absolute;
		z-index: -1;
		top: 0;
		left: 0;
		box-sizing: border-box;
		border: 1px solid var(--arc-border);
		border-radius: calc(var(--arc-radius-control) - 3px);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
		opacity: 0;
		pointer-events: none;
	}
	.label {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.compact {
		border-color: transparent;
		background: transparent;
	}
	.compact .track {
		padding: 0;
	}
	.compact .button {
		min-height: 1.75rem;
		padding: 0 10px;
		border-radius: calc(var(--arc-radius-control) - 4px);
	}
	.compact .selection {
		border-color: var(--arc-border);
		border-radius: calc(var(--arc-radius-control) - 4px);
		background: var(--arc-surface-muted);
		box-shadow: none;
	}
	@media (max-width: 380px) {
		.button {
			padding: 0 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
	}
</style>
