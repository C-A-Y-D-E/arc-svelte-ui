<script module lang="ts">
	export type MultiSelectOption = { value: string; label: string; disabled?: boolean };
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import XIcon from '@lucide/svelte/icons/x';
	import { draw } from 'svelte/transition';
	import type { HTMLAttributes } from 'svelte/elements';
	import { changeDirection } from '../animated-counter/direction.svelte';
	import { presenceEm, springEasing, widthPresence } from '../animated-counter/motion-extras';
	import { ease, isReducedMotion, motionTokens, presence, pressScale } from '../motion';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue'> & {
		label: string;
		options: MultiSelectOption[];
		value?: string[];
		defaultValue?: string[];
		onValueChange?: (value: string[]) => void;
		placeholder?: string;
		description?: string;
		/** Chips shown in the trigger before the rest collapse into +N. */
		maxVisible?: number;
		disabled?: boolean;
	};

	let {
		label,
		options,
		defaultValue = [],
		value = $bindable(defaultValue),
		onValueChange,
		placeholder = 'Select options',
		description,
		maxVisible = 2,
		disabled = false,
		class: className,
		...rest
	}: Props = $props();

	const MS_PER_SECOND = 1000;
	const CHIP_SCALE = 0.9;
	const CHIP_EXIT_SECONDS = 0.14;
	const CLEAR_PRESS_SCALE = 0.96;
	const POPOVER_EXIT_SECONDS = 0.13;
	const COUNT_SHIFT_EM = 0.5;
	const { blur, duration, spring } = motionTokens;
	const smooth = springEasing(spring.smooth);
	const snappy = springEasing(spring.snappy);

	const id = $props.id();
	const labelId = `${id}-label`;
	const valueId = `${id}-value`;
	const listboxId = `${id}-listbox`;
	let root: HTMLDivElement;
	let open = $state(false);
	let activeIndex = $state(-1);

	const selectedSet = $derived(new Set(value));
	const visible = $derived(
		value.slice(0, maxVisible).map((item) => ({ value: item, label: labelFor(item) }))
	);
	const remaining = $derived(Math.max(0, value.length - visible.length));
	/** The overflow count rolls: a larger number rises from below, a smaller one drops from above. */
	const countDirection = changeDirection(() => remaining);
	const enabled = $derived(options.flatMap((option, index) => (option.disabled ? [] : [index])));

	function labelFor(item: string) {
		return options.find((option) => option.value === item)?.label ?? item;
	}

	// A closed menu forgets its highlight, so the next open starts clean instead of on a stale hovered row.
	$effect(() => {
		if (!open) activeIndex = -1;
	});

	$effect(() => {
		const closeOutside = (event: PointerEvent) => {
			if (!root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', closeOutside);
		return () => document.removeEventListener('pointerdown', closeOutside);
	});

	function update(next: string[]) {
		value = next;
		onValueChange?.(next);
	}

	function toggle(option: MultiSelectOption) {
		if (disabled || option.disabled) return;
		update(
			selectedSet.has(option.value)
				? value.filter((item) => item !== option.value)
				: [...value, option.value]
		);
	}

	function clear() {
		update([]);
		open = false;
	}

	function moveActive(key: string) {
		open = true;
		const count = enabled.length;
		const current = enabled.indexOf(activeIndex);
		const down = key === 'ArrowDown';
		const next =
			current < 0
				? down
					? 0
					: count - 1
				: down
					? (current + 1) % count
					: (current - 1 + count) % count;
		activeIndex = enabled[next];
	}

	function onKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'Enter' && open && activeIndex >= 0) {
			event.preventDefault();
			toggle(options[activeIndex]);
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			open = !open;
			return;
		}
		if (event.key === 'Escape') {
			open = false;
			return;
		}
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && enabled.length) {
			event.preventDefault();
			moveActive(event.key);
		}
	}

	/** Each chip sits in a slot whose width opens and collapses on a spring, so neighbours travel with it and nothing overlaps. */
	const slotIn = { duration: smooth.duration, easing: smooth.easing };
	const chipIn = { scale: CHIP_SCALE, blur: blur.soft, ...snappy };
	const chipOut = {
		scale: CHIP_SCALE,
		blur: blur.subtle,
		duration: CHIP_EXIT_SECONDS,
		easing: ease.standard
	};

	/** A check that draws itself when an option is picked and retracts when it is removed. */
	function checkDraw(node: SVGPathElement) {
		if (isReducedMotion())
			return { duration: duration.instant * MS_PER_SECOND, css: (t: number) => `opacity:${t}` };
		return draw(node, { duration: duration.standard * MS_PER_SECOND, easing: ease.enter });
	}
</script>

<div bind:this={root} class={['field', className]} {...rest}>
	<span id={labelId} class="label">{label}</span>
	<div class="control">
		<button
			type="button"
			class={['trigger', value.length && 'has-clear']}
			{disabled}
			aria-labelledby="{labelId} {valueId}"
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls={listboxId}
			onclick={() => (open = !open)}
			onkeydown={onKeyDown}
		>
			<span id={valueId} class="sr-only"
				>{value.length ? value.map(labelFor).join(', ') : placeholder}</span
			>
			<span class="value" aria-hidden="true">
				{#each visible as item (item.value)}
					<span class="slot" transition:widthPresence={slotIn}>
						<span class="chip" in:presence={chipIn} out:presence={chipOut}>{item.label}</span>
					</span>
				{/each}
				{#if remaining > 0}
					<span class="slot" transition:widthPresence={slotIn}>
						<span class="more" in:presence={chipIn} out:presence={chipOut}>
							+<span class="count">
								{#key remaining}
									<span
										in:presenceEm={{
											y: COUNT_SHIFT_EM * countDirection.current,
											blur: blur.subtle
										}}
										out:presenceEm={{
											y: -COUNT_SHIFT_EM * countDirection.current,
											blur: blur.subtle,
											duration: CHIP_EXIT_SECONDS,
											easing: ease.standard
										}}>{remaining}</span
									>
								{/key}
							</span>
						</span>
					</span>
				{/if}
				{#if !value.length}
					<span class="placeholder" transition:presence={{ duration: duration.instant }}
						>{placeholder}</span
					>
				{/if}
			</span>
			<span class="chevron"><ChevronDownIcon size={16} aria-hidden="true" /></span>
		</button>
		{#if value.length > 0 && !disabled}
			<button
				type="button"
				aria-label="Clear selections"
				class="clear"
				{@attach pressScale(CLEAR_PRESS_SCALE)}
				onclick={clear}
				in:presence={{ scale: 0.6, blur: blur.subtle, ...snappy }}
				out:presence={{
					scale: 0.6,
					blur: blur.subtle,
					duration: duration.instant,
					easing: ease.standard
				}}
			>
				<XIcon size={14} aria-hidden="true" />
			</button>
		{/if}
		{#if open}
			<div
				id={listboxId}
				class="menu"
				role="listbox"
				aria-label={label}
				aria-multiselectable="true"
				in:presence={{ y: -6, scale: 0.97, ...snappy }}
				out:presence={{ y: -4, scale: 0.98, duration: POPOVER_EXIT_SECONDS, easing: ease.standard }}
			>
				{#each options as option, index (option.value)}
					<button
						type="button"
						role="option"
						aria-selected={selectedSet.has(option.value)}
						aria-disabled={option.disabled || undefined}
						class="option"
						data-active={activeIndex === index}
						disabled={option.disabled}
						onpointermove={() => activeIndex !== index && (activeIndex = index)}
						onclick={() => toggle(option)}
					>
						<span>{option.label}</span>
						{#if selectedSet.has(option.value)}
							<svg
								class="check"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M4 12.5 9 17.5 20 6.5" transition:checkDraw />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if description}<span class="description">{description}</span>{/if}
</div>

<style>
	.field {
		position: relative;
		display: grid;
		gap: var(--arc-space-2);
		min-width: 0;
	}
	.control {
		position: relative;
		min-width: 0;
	}
	.label {
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	/* The trigger anchors the menu, so press feedback stays in color; it never scales. */
	.trigger {
		position: relative;
		display: flex;
		width: 100%;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: 8px;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: 5px 11px 5px 12px;
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		text-align: left;
		cursor: pointer;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover:not(:disabled) {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
		}
	}
	.trigger:active:not(:disabled),
	.trigger[aria-expanded='true'] {
		border-color: var(--arc-border-strong);
		background: var(--arc-surface-muted);
	}
	.trigger:focus-visible {
		border-color: var(--arc-border-strong);
		outline: 3px solid var(--arc-accent-subtle);
		outline-offset: 0;
	}
	.trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	/* The chevron stays pinned to the trailing edge; a selection only reserves room for the clear button beside it, so nothing jumps. */
	.has-clear .chevron {
		margin-left: 26px;
	}
	.value {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 26px;
		flex: 1;
		align-items: center;
		overflow: hidden;
	}
	.placeholder,
	.description {
		color: var(--arc-text-muted);
	}
	/* The placeholder sits outside the flow so the first chip can open its slot from the leading edge. */
	.placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		overflow: hidden;
		white-space: nowrap;
	}
	/* The slot clips while its width springs open or closed; the chip keeps its natural width so the label never re-truncates mid-flight. */
	.slot {
		display: flex;
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
	}
	.slot:has(.more) {
		flex-shrink: 0;
	}
	.chip,
	.more {
		box-sizing: border-box;
		flex: 0 0 auto;
		max-width: 9rem;
		overflow: hidden;
		margin-right: 5px;
		border-radius: 999px;
		padding: 4px 8px;
		background: var(--arc-surface-muted);
		box-shadow: inset 0 0 0 1px var(--arc-border-subtle);
		color: var(--arc-foreground);
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--arc-text-xs);
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.trigger[aria-expanded='true'] .chip,
	.trigger[aria-expanded='true'] .more {
		background: var(--arc-surface);
	}
	@media (hover: hover) and (pointer: fine) {
		.trigger:hover:not(:disabled) .chip,
		.trigger:hover:not(:disabled) .more {
			background: var(--arc-surface);
		}
	}
	.more {
		display: inline-flex;
		color: var(--arc-text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.count {
		display: inline-grid;
	}
	.count > span {
		grid-area: 1 / 1;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.clear {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 36px;
		display: grid;
		width: 22px;
		height: 22px;
		margin: auto 0;
		place-items: center;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.clear:hover {
			background: var(--arc-surface);
			color: var(--arc-foreground);
		}
	}
	.clear:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 1px;
	}
	.chevron {
		display: inline-flex;
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.trigger[aria-expanded='true'] .chevron {
		transform: rotate(180deg);
	}
	.description {
		font-size: var(--arc-text-xs);
	}
	.menu {
		position: absolute;
		z-index: 80;
		top: calc(100% + 8px);
		right: 0;
		left: 0;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		padding: 5px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: top center;
		will-change: transform, opacity;
	}
	/* Arrow keys move the highlight often, so it changes almost instantly. Selection is shown by the check, not by weight, so labels never reflow. */
	.option {
		display: flex;
		width: 100%;
		min-height: 38px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 6px);
		padding: 0 11px;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		text-align: left;
		cursor: pointer;
		transition:
			background-color 80ms var(--arc-ease-standard),
			color 80ms var(--arc-ease-standard);
	}
	.option[data-active='true'] {
		background: var(--arc-surface-muted);
	}
	.option:disabled {
		opacity: 0.42;
		cursor: not-allowed;
	}
	.check {
		flex: 0 0 auto;
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.chevron,
		.option,
		.clear,
		.chip,
		.more {
			transition: none;
		}
	}
</style>
