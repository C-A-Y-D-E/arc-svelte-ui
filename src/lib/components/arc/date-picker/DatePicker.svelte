<script lang="ts">
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Calendar, type CalendarDateMatcher } from '../calendar';
	import { motionPresence } from '../text-morph/transitions';
	import { ease, isReducedMotion, motionTokens } from '../motion';

	type Props = Omit<HTMLButtonAttributes, 'value' | 'onchange'> & {
		label: string;
		value?: Date;
		onChange?: (date: Date | undefined) => void;
		description?: string;
		placeholder?: string;
		minDate?: Date;
		maxDate?: Date;
		disabledDates?: CalendarDateMatcher;
		locale?: string;
		format?: Intl.DateTimeFormatOptions;
		/** Adds a Today button to the calendar header. */
		showToday?: boolean;
	};

	let {
		label,
		value = $bindable(),
		onChange,
		description,
		placeholder = 'Select a date',
		minDate,
		maxDate,
		disabledDates,
		locale = 'en-US',
		format = { month: 'short', day: 'numeric', year: 'numeric' },
		showToday,
		id,
		class: className,
		disabled,
		...buttonProps
	}: Props = $props();

	/** A picked day lets the highlight glide onto it and the footer confirm it, then the calendar returns to the field. */
	const CLOSE_AFTER_PICK_MS = 240;
	const { blur, duration, spring } = motionTokens;
	const EXIT_SECONDS = 0.14;

	const uid = $props.id();
	const controlId = $derived(id ?? uid);
	const hintId = $derived(description ? `${controlId}-description` : undefined);
	const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

	let open = $state(false);
	let month = $state(monthStart(untrack(() => value) ?? new Date()));
	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let valueText: HTMLSpanElement;
	let closeTimer: number | undefined;

	const formatter = $derived(new Intl.DateTimeFormat(locale, format));
	const time = $derived(value?.getTime() ?? null);
	const shown = $derived(value ? formatter.format(value) : placeholder);
	const parts = $derived(value ? formatter.formatToParts(value) : []);

	// Each part of the date rolls with time: a later date rises from below, an earlier one drops from above. Parts that did not change stay still.
	let direction = $state(1);
	let lastTime = untrack(() => time);
	$effect.pre(() => {
		const next = time;
		if (next === lastTime) return;
		direction = next === null || lastTime === null || next >= lastTime ? 1 : -1;
		lastTime = next;
	});

	const rollIn = (towards: number) => ({ y: towards * 0.35, em: true, blur: blur.soft });
	const rollOut = (towards: number) => ({
		y: towards * -0.3,
		em: true,
		blur: blur.subtle,
		duration: EXIT_SECONDS,
		easing: ease.standard,
		pop: true
	});
	const statusIn = { y: 0.3, em: true, blur: blur.soft };
	const statusOut = {
		y: -0.3,
		em: true,
		blur: blur.subtle,
		duration: EXIT_SECONDS,
		easing: ease.standard
	};

	// Parts after a wider or narrower segment move on the same curve the new text arrives on, so they never overlap it.
	const partNodes = () => Array.from(valueText?.querySelectorAll<HTMLElement>('[data-part]') ?? []);
	let partOffsets: number[] = [];
	$effect.pre(() => {
		void time;
		partOffsets = partNodes().map((node) => node.offsetLeft);
	});
	$effect(() => {
		void time;
		const before = partOffsets;
		partOffsets = [];
		if (isReducedMotion()) return;
		partNodes().forEach((node, index) => {
			const shift = (before[index] ?? node.offsetLeft) - node.offsetLeft;
			if (shift)
				animate(
					node,
					{ x: [shift, 0] },
					{ duration: duration.standard, ease: motionTokens.ease.enter }
				);
		});
	});

	$effect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (root.contains(event.target as Node)) return;
			window.clearTimeout(closeTimer);
			open = false;
		};
		document.addEventListener('pointerdown', onPointerDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			window.clearTimeout(closeTimer);
		};
	});

	/** Opening moves focus to the day that owns the tab stop, so arrows work at once; a pointer open shows no ring. */
	$effect(() => {
		if (!open) return;
		root
			.querySelector<HTMLButtonElement>('[role="dialog"] [data-present] [data-date][tabindex="0"]')
			?.focus({
				preventScroll: true
			});
	});

	/** Closing hands focus back to the trigger when it was inside the calendar, so keyboard users never land on the page body. */
	function close() {
		window.clearTimeout(closeTimer);
		if (root.querySelector('[role="dialog"]')?.contains(document.activeElement)) trigger.focus();
		open = false;
	}

	/** The calendar always opens on the month of the current value, or today's month. */
	function show() {
		window.clearTimeout(closeTimer);
		month = monthStart(value ?? new Date());
		open = true;
	}

	function selectDate(date: Date | undefined) {
		value = date;
		onChange?.(date);
		window.clearTimeout(closeTimer);
		if (isReducedMotion() || !date) close();
		else closeTimer = window.setTimeout(close, CLOSE_AFTER_PICK_MS);
	}

	function onTriggerKeyDown(event: KeyboardEvent) {
		const opens = event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ';
		if (opens && !open) {
			event.preventDefault();
			show();
		}
		if (event.key === 'Escape') close();
	}

	/** Tabbing past the popover closes it; focus moving within the field keeps it open. */
	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!open || !next || root.contains(next)) return;
		window.clearTimeout(closeTimer);
		open = false;
	}

	function onPopoverKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.stopPropagation();
		close();
	}
</script>

<div bind:this={root} class={['field', className]} onfocusout={onFocusOut}>
	<label class="label" for={controlId}>{label}</label>
	<div class="anchor">
		<button
			{...buttonProps}
			bind:this={trigger}
			id={controlId}
			type="button"
			{disabled}
			aria-haspopup="dialog"
			aria-expanded={open}
			aria-describedby={hintId}
			class="trigger"
			onclick={() => (open ? close() : show())}
			onkeydown={onTriggerKeyDown}
		>
			<CalendarDaysIcon size={16} strokeWidth={1.75} aria-hidden="true" />
			<span class="sr-only">{shown}</span>
			<span bind:this={valueText} class="value-text" aria-hidden="true">
				{#if value}
					<span class="value" in:motionPresence={rollIn(1)} out:motionPresence={rollOut(1)}>
						{#each parts as part, index (`${index}-${part.type}`)}
							<span class="part" data-part>
								{#if part.type === 'literal'}
									<span class="part-value">{part.value}</span>
								{:else}
									{#key part.value}
										<span
											class="part-value"
											in:motionPresence={rollIn(direction)}
											out:motionPresence={rollOut(direction)}>{part.value}</span
										>
									{/key}
								{/if}
							</span>
						{/each}
					</span>
				{:else}
					<span class="placeholder" in:motionPresence={rollIn(-1)} out:motionPresence={rollOut(1)}>
						{placeholder}
					</span>
				{/if}
			</span>
			<ChevronDownIcon
				class="date-picker-chevron"
				size={16}
				strokeWidth={1.75}
				aria-hidden="true"
			/>
		</button>
		{#if open}
			<!-- Grows out of the trigger's calendar icon and returns there on close. -->
			<div
				class="popover"
				role="dialog"
				tabindex="-1"
				aria-label={`${label} calendar`}
				onkeydown={onPopoverKeyDown}
				in:motionPresence={{ y: -8, scale: 0.95, spring: spring.snappy, duration: duration.fast }}
				out:motionPresence={{ y: -6, scale: 0.97, duration: EXIT_SECONDS, easing: ease.standard }}
			>
				<Calendar
					{value}
					onChange={selectDate}
					bind:month
					{minDate}
					{maxDate}
					{disabledDates}
					{locale}
					{showToday}
				/>
				<div class="footer">
					<button type="button" onclick={() => selectDate(undefined)} disabled={!value}
						>Clear</button
					>
					<!-- Old and new status lines share one cell, pinned to the trailing edge so a shorter line never shifts. -->
					<span class="status">
						{#key time ?? 'none'}
							<span in:motionPresence={statusIn} out:motionPresence={statusOut}>
								{value ? `Selected ${formatter.format(value)}` : 'Choose a day'}
							</span>
						{/key}
					</span>
				</div>
			</div>
		{/if}
	</div>
	{#if description}
		<span id={hintId} class="description">{description}</span>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: 7px;
		min-width: 0;
	}
	.label {
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.anchor {
		position: relative;
		min-width: 0;
	}
	/* The trigger anchors the calendar, so press feedback stays in color; it never scales. */
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
			background var(--arc-duration-fast) var(--arc-ease-standard),
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
	.trigger:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.trigger > :global(svg:first-child) {
		flex: 0 0 auto;
		color: var(--arc-text-muted);
	}
	/* Old and new values cross in place; each part of a date is its own box so a wider day or month moves the rest along. */
	.value-text {
		position: relative;
		display: flex;
		flex: 1;
		min-width: 0;
	}
	.value,
	.part {
		position: relative;
		display: inline-flex;
		white-space: pre;
	}
	.value {
		font-variant-numeric: tabular-nums;
	}
	.part-value {
		display: inline-block;
		white-space: pre;
	}
	.placeholder {
		min-width: 0;
		overflow: hidden;
		color: var(--arc-text-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.trigger :global(.date-picker-chevron) {
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.trigger[aria-expanded='true'] :global(.date-picker-chevron) {
		transform: rotate(180deg);
	}
	/* Grows out of the trigger's calendar icon and returns there on close. */
	.popover {
		position: absolute;
		z-index: 20;
		top: calc(100% + 8px);
		left: 0;
		width: min(320px, calc(100vw - 32px));
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		padding: 16px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		transform-origin: 22px -8px;
		will-change: transform, opacity;
	}
	.popover:focus {
		outline: none;
	}
	/* On phone widths the calendar matches the field instead of running past the screen edge. */
	@media (max-width: 360px) {
		.popover {
			right: 0;
			width: auto;
		}
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 14px;
		border-top: 1px solid var(--arc-border-subtle);
		padding-top: 11px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.status {
		display: grid;
		min-width: 0;
		justify-items: end;
	}
	.status > span {
		grid-area: 1 / 1;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.footer button {
		border: 0;
		border-radius: 18px;
		padding: 4px 8px;
		background: transparent;
		color: var(--arc-text-secondary);
		font: inherit;
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.footer button:hover:not(:disabled) {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.footer button:active:not(:disabled) {
		transform: scale(0.97);
		transition-duration: var(--arc-duration-fast), var(--arc-duration-fast), 100ms;
		transition-timing-function: var(--arc-ease-standard);
	}
	.footer button:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
	.description {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* The open calendar covers the hint; fading it keeps its first letters from peeking past the popover's rounded corner. */
	.anchor:has(.popover) + .description {
		opacity: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.trigger,
		.trigger :global(.date-picker-chevron),
		.footer button,
		.description {
			transition: none;
		}
		.footer button:active:not(:disabled) {
			transform: none;
		}
	}
</style>
