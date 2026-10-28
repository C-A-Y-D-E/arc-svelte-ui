<script module lang="ts">
	export type TimeFormat = '12h' | '24h';
	export type MinuteStep = 1 | 5 | 10 | 15 | 30;
</script>

<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { motionPresence } from '../text-morph/transitions';
	import { ease, motionTokens } from '../motion';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange'> & {
		label: string;
		/** "HH:mm", 24-hour, whatever the display format. */
		value?: string;
		defaultValue?: string;
		onChange?: (value: string) => void;
		description?: string;
		placeholder?: string;
		minuteStep?: MinuteStep;
		format?: TimeFormat;
		disabled?: boolean;
	};

	let {
		label,
		defaultValue = '09:00',
		value = $bindable(untrack(() => defaultValue)),
		onChange,
		description,
		placeholder = 'Select a time',
		minuteStep = 15,
		format = '12h',
		disabled = false,
		class: className,
		...rest
	}: Props = $props();

	const MINUTES_PER_HOUR = 60;
	const MINUTES_PER_DAY = 1440;
	const HALF_DAY_HOURS = 12;
	const MENU_EXIT_SECONDS = 0.13;
	const { blur, duration, spring } = motionTokens;

	const id = $props.id();
	const labelId = `${id}-label`;
	const valueId = `${id}-value`;
	const listboxId = `${id}-listbox`;

	const pad = (part: number) => String(part).padStart(2, '0');
	function toMinutes(raw: string) {
		const [hours, minutes] = raw.split(':').map(Number);
		return Number.isFinite(hours) && Number.isFinite(minutes)
			? hours * MINUTES_PER_HOUR + minutes
			: 0;
	}
	function display(raw: string) {
		const total = toMinutes(raw);
		const hour = Math.floor(total / MINUTES_PER_HOUR);
		const minute = pad(total % MINUTES_PER_HOUR);
		if (format === '24h') return `${pad(hour)}:${minute}`;
		return `${hour % HALF_DAY_HOURS || HALF_DAY_HOURS}:${minute} ${hour < HALF_DAY_HOURS ? 'AM' : 'PM'}`;
	}

	const options = $derived(
		Array.from({ length: Math.ceil(MINUTES_PER_DAY / minuteStep) }, (_, index) => {
			const minutes = index * minuteStep;
			return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
		})
	);

	let root: HTMLDivElement;
	let menu = $state<HTMLDivElement>();
	let open = $state(false);
	let activeIndex = $state(-1);
	let centerOnOpen = false;

	// The shown time rolls like a clock face: a later time rises from below, an earlier one drops from above.
	let direction = $state(1);
	let previous = untrack(() => value);
	$effect.pre(() => {
		const next = value;
		if (next === previous) return;
		direction = toMinutes(next) >= toMinutes(previous) ? 1 : -1;
		previous = next;
	});
	const rollIn = (towards: number) => ({ y: towards * 0.35, em: true, blur: blur.soft });
	const rollOut = (towards: number) => ({
		y: towards * -0.3,
		em: true,
		blur: blur.subtle,
		duration: duration.fast,
		easing: ease.standard
	});

	$effect(() => {
		const closeOutside = (event: PointerEvent) => {
			if (!root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', closeOutside);
		return () => document.removeEventListener('pointerdown', closeOutside);
	});

	// Scroll only the menu, never the page: the selected time opens centered, arrow keys then keep the highlight in view.
	$effect(() => {
		if (!open || !menu || activeIndex < 0) return;
		const option = menu.children[activeIndex] as HTMLElement | undefined;
		if (!option) return;
		const top = option.offsetTop;
		const bottom = top + option.offsetHeight;
		if (centerOnOpen) {
			centerOnOpen = false;
			menu.scrollTop = top - (menu.clientHeight - option.offsetHeight) / 2;
		} else if (top < menu.scrollTop) menu.scrollTop = top;
		else if (bottom > menu.scrollTop + menu.clientHeight)
			menu.scrollTop = bottom - menu.clientHeight;
	});

	function choose(next: string) {
		value = next;
		onChange?.(next);
		open = false;
	}

	function openMenu() {
		const selectedIndex = options.indexOf(value);
		activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
		centerOnOpen = true;
		open = true;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (open && activeIndex >= 0) choose(options[activeIndex]);
			else openMenu();
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		if (!open) {
			openMenu();
			return;
		}
		const step = event.key === 'ArrowDown' ? 1 : -1;
		activeIndex = (activeIndex + step + options.length) % options.length;
	}
</script>

<div bind:this={root} class={['field', className]} {...rest}>
	<span id={labelId} class="label">{label}</span>
	<div class="anchor">
		<button
			type="button"
			class="trigger"
			{disabled}
			aria-labelledby={`${labelId} ${valueId}`}
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls={listboxId}
			onclick={() => (open ? (open = false) : openMenu())}
			onkeydown={onKeyDown}
		>
			<Clock3Icon size={16} aria-hidden="true" />
			<span id={valueId} class="sr-only">{value ? display(value) : placeholder}</span>
			<span class="value-text" aria-hidden="true">
				{#key value || 'placeholder'}
					<span
						class={value ? 'value' : 'placeholder'}
						in:motionPresence={rollIn(direction)}
						out:motionPresence={rollOut(direction)}
					>
						{value ? display(value) : placeholder}
					</span>
				{/key}
			</span>
			<ChevronDownIcon class="time-picker-chevron" size={16} aria-hidden="true" />
		</button>
		{#if open}
			<div
				bind:this={menu}
				id={listboxId}
				class="menu"
				role="listbox"
				aria-label={`${label} options`}
				in:motionPresence={{ y: -6, scale: 0.97, spring: spring.snappy, duration: duration.fast }}
				out:motionPresence={{
					y: -4,
					scale: 0.98,
					duration: MENU_EXIT_SECONDS,
					easing: ease.standard
				}}
			>
				{#each options as option, index (option)}
					<button
						id={`${id}-option-${index}`}
						type="button"
						role="option"
						aria-selected={option === value}
						data-active={activeIndex === index || undefined}
						class="option"
						onpointermove={() => {
							if (activeIndex !== index) activeIndex = index;
						}}
						onclick={() => choose(option)}
					>
						{display(option)}
						{#if option === value}<span class="dot" aria-hidden="true"></span>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if description}
		<span class="description">{description}</span>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: var(--arc-space-2);
		min-width: 0;
	}
	.label {
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.anchor {
		position: relative;
		min-width: 0;
	}
	/* The trigger anchors the menu, so press feedback stays in color; it never scales. */
	.trigger {
		position: relative;
		display: flex;
		width: 100%;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: 9px;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: 0 12px;
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
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.trigger > :global(svg:first-child) {
		flex: 0 0 auto;
		color: var(--arc-text-muted);
	}
	.value-text {
		display: grid;
		flex: 1;
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
	}
	.value-text > span {
		grid-area: 1 / 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.value {
		font-variant-numeric: tabular-nums;
	}
	.placeholder,
	.description {
		color: var(--arc-text-muted);
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
	.trigger :global(.time-picker-chevron) {
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.trigger[aria-expanded='true'] :global(.time-picker-chevron) {
		transform: rotate(180deg);
	}
	.description {
		font-size: var(--arc-text-xs);
	}
	.menu {
		position: absolute;
		z-index: 80;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		max-height: 250px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		padding: 5px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: top center;
		will-change: transform, opacity;
	}
	/* Arrow keys move the highlight often, so it changes almost instantly. The dot marks the chosen time, so only one row is ever highlighted. */
	.option {
		display: flex;
		width: 100%;
		min-height: 36px;
		align-items: center;
		justify-content: space-between;
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 6px);
		padding: 0 11px;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-variant-numeric: tabular-nums;
		text-align: left;
		cursor: pointer;
		transition: background-color 80ms var(--arc-ease-standard);
	}
	.option[data-active='true'] {
		background: var(--arc-surface-muted);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--arc-foreground);
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.trigger :global(.time-picker-chevron),
		.option {
			transition: none;
		}
	}
</style>
