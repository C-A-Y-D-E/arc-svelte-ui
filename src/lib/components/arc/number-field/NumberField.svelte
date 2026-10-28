<script module lang="ts">
	/** Text shown beside the number. A function receives the value, so a unit can follow it: `n => n === 1 ? " seat" : " seats"`. */
	export type NumberFieldAffix = string | ((value: number) => string);
	export type NumberFieldSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { animate, motionValue } from 'motion';
	import { tick } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { strings } from '../strings';
	import { changeDirection } from '../animated-counter/direction.svelte';
	import { FieldMessage, motionTransition } from '../input';
	import { isReducedMotion, motionTokens } from '../motion';
	import { kickSpring } from '../slider/spring';
	import Digits from './Digits.svelte';
	import {
		clamp,
		decimalsOf,
		parseNumber,
		readSymbols,
		snapToGrid,
		stepFrom,
		stripDisallowed,
		type Grid
	} from './number-math';
	import { affixParts, numberParts } from './parts';

	type Direction = 1 | -1;
	type Edge = Direction | 0;
	type Source = 'button' | 'key' | 'scrub' | 'type';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'prefix'> & {
		label: string;
		/** `null` is an empty field: it shows the placeholder, and a step lands on `min`. Not in Arc; forms need an unset state. */
		value?: number | null;
		onValueChange?: (value: number | null) => void;
		min?: number;
		max?: number;
		step?: number;
		/** PageUp, PageDown, and Shift with an arrow move this far. Defaults to ten steps. */
		largeStep?: number;
		description?: string;
		disabled?: boolean;
		id?: string;
		/** Text before the number, such as "$". */
		prefix?: NumberFieldAffix;
		/** Text after the number, such as "%" or " seats". */
		suffix?: NumberFieldAffix;
		placeholder?: string;
		/** Clearing the text and leaving the field sets `null` instead of restoring the last value. */
		allowEmpty?: boolean;
		/** Drag the label sideways to scrub the value, one step every few pixels. */
		scrub?: boolean;
		/** Keeps the label for screen readers only. The limit note then floats above the control. Not in Arc. */
		hideLabel?: boolean;
		locale?: string;
		/** Fraction digits and grouping. Fraction digits follow the precision of `step` by default. */
		formatOptions?: {
			minimumFractionDigits?: number;
			maximumFractionDigits?: number;
			useGrouping?: boolean;
		};
		size?: NumberFieldSize;
		/** A short note beside the label when a press meets a limit or a typed value passes one. `false` hides it; a function writes the copy. */
		limitHint?: boolean | ((edge: 'min' | 'max', limit: number) => string);
	};

	let {
		label,
		value = $bindable(),
		onValueChange,
		min = 0,
		max = Number.MAX_SAFE_INTEGER,
		step: stepProp = 1,
		largeStep,
		description,
		disabled = false,
		id,
		prefix,
		suffix,
		placeholder,
		allowEmpty = false,
		scrub = false,
		hideLabel = false,
		locale = 'en-US',
		formatOptions,
		size = 'md',
		limitHint = true,
		class: className,
		...rest
	}: Props = $props();

	const { spring, duration, blur, ease } = motionTokens;
	const SCRUB_PX_PER_STEP = 6;
	const SCRUB_DEAD_ZONE_PX = 3;
	const SCRUB_RUBBER_PX = 10;
	const HOLD_DELAY_MS = 400;
	const HOLD_SLOWEST_MS = 150;
	const HOLD_FASTEST_MS = 40;
	const HOLD_SPEEDUP = 0.86;
	/** A held press keeps leaning on a limit at this cadence, the note stays this long, and an under-minimum draft waits before it warns. */
	const LIMIT_PUSH_MS = 240;
	const LIMIT_HINT_MS = 1500;
	const UNDER_WARN_MS = 700;
	const STRAIN_MS = 420;
	/** Pushes within this window count as one continued effort, each straining a little further up to the cap. */
	const PUSH_WINDOW_MS = 700;
	const PUSH_GAIN = 0.22;
	const PUSH_CAP = 4;
	const BUMP_VELOCITY = 130;
	const ICON_SHAKE_PX = [0, -2.5, 2.5, -1.5, 1, 0];
	const ICON_SHAKE_S = 0.32;
	const NOTE_RISE_EM = 0.45;
	const LARGE_STEP_MULTIPLE = 10;
	const STEP_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']);

	const generatedId = $props.id();
	const inputId = $derived(id ?? generatedId);
	const hintId = $derived(description ? `${inputId}-description` : undefined);
	const limitId = $derived(`${inputId}-limit`);

	const step = $derived(stepProp > 0 ? stepProp : 1);
	const base = $derived(Number.isFinite(min) ? min : 0);
	const decimals = $derived(Math.max(decimalsOf(step), decimalsOf(base)));
	const grid: Grid = $derived({ base, step, decimals });
	const hasMax = $derived(max < Number.MAX_SAFE_INTEGER);
	const minFraction = $derived(formatOptions?.minimumFractionDigits ?? decimals);
	const maxFraction = $derived(
		Math.max(minFraction, formatOptions?.maximumFractionDigits ?? decimals)
	);
	const format = $derived(
		new Intl.NumberFormat(locale, {
			minimumFractionDigits: minFraction,
			maximumFractionDigits: maxFraction,
			useGrouping: formatOptions?.useGrouping ?? true,
			numberingSystem: 'latn'
		})
	);
	const symbols = $derived(readSymbols(locale));

	let draft = $state('');
	let editing = $state(false);
	let editStart: number | null = null;
	let pressed = $state<Edge>(0);
	let pushedEdge = $state<Edge>(0);
	let strainEdge = $state<Edge>(0);
	let underWarn = $state(false);
	let scrubbing = $state(false);
	let announcement = $state('');
	let input = $state<HTMLInputElement | null>(null);
	let group = $state<HTMLElement | null>(null);
	let minusIcon = $state<HTMLElement | null>(null);
	let plusIcon = $state<HTMLElement | null>(null);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let pushedTimer: ReturnType<typeof setTimeout> | undefined;
	let underTimer: ReturnType<typeof setTimeout> | undefined;
	let strainTimer: ReturnType<typeof setTimeout> | undefined;
	let effort = { edge: 0 as Edge, count: 0, at: 0 };
	let scrubDrag: { pointer: number; x: number; from: number | null; active: boolean } | null = null;
	let suppressClick = false;
	let selectCaretAtEnd = false;

	/** The value group's offsets: scrub drag, the glide back to center as typing changes its width, and the bump at a limit. */
	const scrubX = motionValue(0);
	const shiftX = motionValue(0);
	const bumpY = motionValue(0);

	const current = $derived(value ?? null);
	const typed = $derived(editing ? parseNumber(draft, symbols) : null);
	const shown = $derived(typed ?? current);
	const direction = changeDirection(() => shown ?? base);
	const atMax = $derived(shown !== null && shown >= max);
	const atMin = $derived(shown !== null && shown <= min);
	const numberText = $derived(shown === null ? [] : numberParts(shown, format));
	const prefixParts = $derived(affixParts(affixText(prefix, shown)));
	const suffixParts = $derived(affixParts(affixText(suffix, shown)));
	const showPlaceholder = $derived(shown === null && !editing && Boolean(placeholder));

	/** A typed value past a limit holds a calm warning until it commits and snaps back. */
	const outside: Edge = $derived(
		typed === null ? 0 : typed > max ? 1 : typed < min && underWarn ? -1 : 0
	);
	const noteEdge: Edge = $derived(limitHint ? outside || pushedEdge : 0);
	const noteText = $derived(noteEdge ? limitNote(noteEdge) : '');
	const describedBy = $derived(
		[hintId, outside && limitHint ? limitId : undefined].filter(Boolean).join(' ') || undefined
	);

	$effect(() => () => {
		clearTimeout(holdTimer);
		clearTimeout(pushedTimer);
		clearTimeout(underTimer);
		clearTimeout(strainTimer);
	});

	function affixText(affix: NumberFieldAffix | undefined, at: number | null) {
		if (at === null) return '';
		return typeof affix === 'function' ? affix(at) : (affix ?? '');
	}

	function spoken(at: number) {
		return `${affixText(prefix, at)}${format.format(at)}${affixText(suffix, at)}`.trim();
	}

	function limitNote(edge: Direction) {
		const limit = edge > 0 ? max : min;
		if (typeof limitHint === 'function') return limitHint(edge > 0 ? 'max' : 'min', limit);
		return edge > 0
			? strings.numberFieldMax({ value: spoken(limit) })
			: strings.numberFieldMin({ value: spoken(limit) });
	}

	function followOffsets(node: HTMLElement) {
		const apply = () => {
			node.style.transform = `translate(${scrubX.get() + shiftX.get()}px, ${bumpY.get()}px)`;
		};
		const stops = [scrubX, shiftX, bumpY].map((offset) => offset.on('change', apply));
		return () => stops.forEach((stop) => stop());
	}

	/** The group glides back to center when typing changes its width, instead of hopping half a character per key. */
	async function glideThrough(change: () => void) {
		const groupLeft = () =>
			(group?.getBoundingClientRect().left ?? 0) - scrubX.get() - shiftX.get();
		const from = groupLeft();
		change();
		await tick();
		const delta = from - groupLeft();
		if (Math.abs(delta) < 0.5) return;
		shiftX.set(shiftX.get() + delta);
		if (isReducedMotion()) shiftX.jump(0);
		else animate(shiftX, 0, spring.morph);
	}

	/** A press past a limit. The value strains toward it and springs home, a little further with each push in a row; the refused button shakes once; the note names the limit. Reduced motion keeps only a brief color change. */
	function strain(edge: Direction, source: Source) {
		const now = performance.now();
		effort.count = effort.edge === edge && now - effort.at < PUSH_WINDOW_MS ? effort.count + 1 : 1;
		effort.edge = edge;
		effort.at = now;
		strainEdge = edge;
		clearTimeout(strainTimer);
		strainTimer = setTimeout(() => (strainEdge = 0), STRAIN_MS);
		if (!isReducedMotion()) {
			const velocity =
				-edge * BUMP_VELOCITY * (1 + Math.min(effort.count - 1, PUSH_CAP) * PUSH_GAIN);
			animate(bumpY, 0, { ...kickSpring, velocity });
			const icon = edge > 0 ? plusIcon : minusIcon;
			if (icon && (source === 'button' || source === 'key')) {
				animate(icon, { x: ICON_SHAKE_PX }, { duration: ICON_SHAKE_S, ease: 'easeOut' });
			}
		}
		if (!limitHint) return;
		pushedEdge = edge;
		clearTimeout(pushedTimer);
		pushedTimer = setTimeout(() => (pushedEdge = 0), LIMIT_HINT_MS);
	}

	/** Every change lands here. A value past a limit clamps, strains toward it, and says which limit it met. */
	function commitValue(next: number | null, source: Source) {
		if (next === null) {
			if (current === null) return false;
			value = null;
			onValueChange?.(null);
			return true;
		}
		const clamped = clamp(next, min, max);
		const overshoot = Math.sign(next - clamped);
		if (overshoot && source !== 'scrub') {
			strain(overshoot > 0 ? 1 : -1, source);
			announcement = `${spoken(clamped)}, ${overshoot > 0 ? 'maximum' : 'minimum'}`;
		} else if (source === 'button' && clamped !== current) {
			announcement = spoken(clamped);
		}
		if (clamped === current) return false;
		value = clamped;
		onValueChange?.(clamped);
		return true;
	}

	function nudge(toward: Direction, steps: number, source: Source) {
		if (current === null) return commitValue(min, source);
		return commitValue(stepFrom(current, toward * steps, grid), source);
	}

	function clearUnderWarning() {
		clearTimeout(underTimer);
		underWarn = false;
	}

	function endEditing() {
		editing = false;
		clearUnderWarning();
	}

	function commitDraft() {
		if (!editing) return;
		const parsed = parseNumber(draft, symbols);
		const emptied = allowEmpty && draft.trim() === '';
		void glideThrough(() => {
			endEditing();
			if (parsed !== null) commitValue(snapToGrid(parsed, grid), 'type');
			else if (emptied) commitValue(null, 'type');
		});
	}

	function revertDraft() {
		selectCaretAtEnd = true;
		void glideThrough(() => {
			endEditing();
			commitValue(editStart, 'type');
		});
	}

	function stopHold() {
		clearTimeout(holdTimer);
		holdTimer = undefined;
		pressed = 0;
	}

	/** One step now; after a pause, repeats that speed up gently until release. Held into a limit it keeps leaning on it at a steady cadence. */
	function startHold(toward: Direction, amount: number, source: Source) {
		stopHold();
		commitDraft();
		const steps = Math.max(1, Math.round(amount / step));
		if (source === 'button') pressed = toward;
		let repeats = 0;
		const tick = () => {
			const moved = nudge(toward, steps, source);
			const delay = moved
				? Math.max(HOLD_FASTEST_MS, HOLD_SLOWEST_MS * HOLD_SPEEDUP ** ++repeats)
				: LIMIT_PUSH_MS;
			holdTimer = setTimeout(tick, delay);
		};
		holdTimer = setTimeout(
			tick,
			nudge(toward, steps, source) ? HOLD_DELAY_MS : LIMIT_PUSH_MS + 120
		);
	}

	function stepKey(event: KeyboardEvent): [Direction, number] | undefined {
		const large = largeStep ?? step * LARGE_STEP_MULTIPLE;
		const amount = event.shiftKey ? large : step;
		const moves: Record<string, [Direction, number]> = {
			ArrowUp: [1, amount],
			ArrowDown: [-1, amount],
			PageUp: [1, large],
			PageDown: [-1, large]
		};
		return moves[event.key];
	}

	function placeCaretAtEnd() {
		if (!selectCaretAtEnd) return;
		selectCaretAtEnd = false;
		if (input && document.activeElement === input) {
			const end = input.value.length;
			input.setSelectionRange(end, end);
		}
	}

	function onKeyDown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		const move = stepKey(event);
		if (move) {
			event.preventDefault();
			if (!event.repeat) startHold(move[0], move[1], 'key');
			return;
		}
		const jumpsToLimit =
			(event.key === 'Home' && Number.isFinite(min)) || (event.key === 'End' && hasMax);
		if (!editing && jumpsToLimit) {
			event.preventDefault();
			commitValue(event.key === 'Home' ? min : max, 'key');
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (!editing) return event.currentTarget.select();
			selectCaretAtEnd = true;
			commitDraft();
			void tick().then(placeCaretAtEnd);
		} else if (event.key === 'Escape' && editing) {
			event.preventDefault();
			revertDraft();
			void tick().then(placeCaretAtEnd);
		}
	}

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		const next = stripDisallowed(event.currentTarget.value, symbols, {
			allowDecimal: decimals > 0 || maxFraction > 0,
			allowNegative: min < 0
		});
		if (!editing) editStart = current;
		event.currentTarget.value = next;
		void glideThrough(() => {
			draft = next;
			editing = true;
			applyValidDraft(next);
		});
	}

	/** Valid drafts apply as they are typed. Under the minimum waits before warning, since "1" is often the start of "12". */
	function applyValidDraft(text: string) {
		const parsed = parseNumber(text, symbols);
		if (parsed !== null && parsed >= min && parsed <= max && snapToGrid(parsed, grid) === parsed) {
			commitValue(parsed, 'type');
		}
		clearUnderWarning();
		if (parsed !== null && parsed < min)
			underTimer = setTimeout(() => (underWarn = true), UNDER_WARN_MS);
	}

	function onInputKeyUp(event: KeyboardEvent) {
		if (STEP_KEYS.has(event.key)) stopHold();
	}

	function onInputBlur() {
		stopHold();
		commitDraft();
	}

	function focusInput(event: MouseEvent) {
		if (disabled || event.target === input) return;
		input?.focus();
		input?.select();
	}

	function pressStepper(event: PointerEvent, toward: Direction) {
		if (event.button === 0) startHold(toward, step, 'button');
	}

	/** Keyboard and assistive clicks (detail 0) take one step; pointer presses are handled by hold. */
	function activateStepper(event: MouseEvent, toward: Direction) {
		if (event.detail !== 0) return;
		commitDraft();
		nudge(toward, 1, 'button');
	}

	function onScrubStart(event: PointerEvent & { currentTarget: HTMLElement }) {
		suppressClick = false;
		if (!scrub || disabled || event.button !== 0) return;
		commitDraft();
		scrubDrag = { pointer: event.pointerId, x: event.clientX, from: current, active: false };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	/** iOS style resistance: travel past a limit gives less and less, and never more than the cap. */
	function rubber(distance: number) {
		const eased = 1 - 1 / ((Math.abs(distance) * 0.55) / SCRUB_RUBBER_PX + 1);
		return Math.sign(distance) * eased * SCRUB_RUBBER_PX;
	}

	function onScrubMove(event: PointerEvent) {
		const drag = scrubDrag;
		if (!drag || drag.pointer !== event.pointerId) return;
		const dx = event.clientX - drag.x;
		if (!drag.active) {
			if (Math.abs(dx) < SCRUB_DEAD_ZONE_PX) return;
			drag.active = true;
			scrubbing = true;
		}
		const travel = dx / SCRUB_PX_PER_STEP;
		const steps = Math.trunc(travel);
		const from = drag.from ?? min;
		commitValue(steps ? stepFrom(from, steps, grid) : from, 'scrub');
		const raw = from + travel * step;
		const over =
			raw > max
				? ((raw - max) / step) * SCRUB_PX_PER_STEP
				: raw < min
					? ((raw - min) / step) * SCRUB_PX_PER_STEP
					: 0;
		scrubX.set(isReducedMotion() ? 0 : rubber(over));
	}

	function onScrubEnd(event: PointerEvent) {
		const drag = scrubDrag;
		if (!drag || drag.pointer !== event.pointerId) return;
		scrubDrag = null;
		if (!drag.active) return;
		suppressClick = true;
		scrubbing = false;
		animate(scrubX, 0, isReducedMotion() ? { duration: 0 } : spring.snappy);
		if (current !== null) announcement = spoken(current);
	}

	function onLabelClick(event: MouseEvent) {
		if (!suppressClick) return;
		event.preventDefault();
		suppressClick = false;
	}

	/** The limit note rises in from the side it guards (up for a maximum, down for a minimum) and fades out in place. */
	function noteIn(node: HTMLElement) {
		if (isReducedMotion()) {
			return motionTransition(node, {
				keyframes: { opacity: [0, 1] },
				transition: { duration: duration.instant }
			});
		}
		return motionTransition(node, {
			keyframes: {
				opacity: [0, 1],
				y: [`${noteEdge * NOTE_RISE_EM}em`, 0],
				filter: [`blur(${blur.subtle}px)`, 'blur(0px)']
			},
			transition: {
				y: spring.snappy,
				opacity: { duration: duration.fast },
				filter: { duration: duration.fast }
			}
		});
	}

	function noteOut(node: HTMLElement) {
		return motionTransition(node, {
			keyframes: { opacity: 0 },
			transition: {
				duration: isReducedMotion() ? duration.instant : duration.standard,
				ease: ease.standard
			}
		});
	}
</script>

<div {...rest} class={['field', className]} data-size={size}>
	<div class={['head', hideLabel && 'floating']}>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
		<label
			class={['label', hideLabel && 'sr-only']}
			for={inputId}
			data-scrub={(scrub && !disabled) || undefined}
			onpointerdown={onScrubStart}
			onpointermove={onScrubMove}
			onpointerup={onScrubEnd}
			onpointercancel={onScrubEnd}
			onclick={onLabelClick}>{label}</label
		>
		{#if noteEdge}
			<span id={limitId} class="limit" in:noteIn out:noteOut>{noteText}</span>
		{/if}
	</div>
	<div
		class="control"
		data-scrubbing={scrubbing || undefined}
		data-disabled={disabled || undefined}
		data-warn={outside ? (outside > 0 ? 'max' : 'min') : undefined}
		data-strain={strainEdge ? (strainEdge > 0 ? 'max' : 'min') : undefined}
	>
		<button
			type="button"
			class="step"
			{disabled}
			aria-controls={inputId}
			aria-label={strings.numberFieldDecrease({ label })}
			aria-disabled={atMin || undefined}
			data-pressed={pressed === -1 || undefined}
			onpointerdown={(event) => pressStepper(event, -1)}
			onpointerup={stopHold}
			onpointerleave={stopHold}
			onpointercancel={stopHold}
			onmousedown={(event) => event.preventDefault()}
			onclick={(event) => activateStepper(event, -1)}
			oncontextmenu={(event) => event.preventDefault()}
		>
			<span class="icon" bind:this={minusIcon}
				><MinusIcon size={16} strokeWidth={1.75} aria-hidden="true" /></span
			>
		</button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="value-wrap"
			onmousedown={(event) => event.target !== input && event.preventDefault()}
			onclick={focusInput}
		>
			<span class="value" bind:this={group} {@attach followOffsets}>
				<span class="affix"
					><Digits parts={prefixParts} direction={direction.current} instant={editing} /></span
				>
				<span class="number">
					<span class="display" data-hidden={editing || undefined} aria-hidden="true">
						<Digits parts={numberText} direction={direction.current} instant={editing} />
					</span>
					{#if editing}<span class="mirror" aria-hidden="true">{draft}</span>{/if}
					{#if showPlaceholder}<span class="placeholder" aria-hidden="true">{placeholder}</span
						>{/if}
					<input
						bind:this={input}
						id={inputId}
						class="input"
						type="text"
						role="spinbutton"
						inputmode={min < 0 ? 'text' : decimals || maxFraction ? 'decimal' : 'numeric'}
						autocomplete="off"
						spellcheck={false}
						{placeholder}
						{disabled}
						value={editing ? draft : current === null ? '' : format.format(current)}
						aria-describedby={describedBy}
						aria-invalid={outside ? true : undefined}
						aria-valuenow={current ?? undefined}
						aria-valuetext={current === null ? undefined : spoken(current)}
						aria-valuemin={Number.isFinite(min) ? min : undefined}
						aria-valuemax={hasMax ? max : undefined}
						oninput={onInput}
						onkeydown={onKeyDown}
						onkeyup={onInputKeyUp}
						onblur={onInputBlur}
					/>
				</span>
				<span class="affix"
					><Digits parts={suffixParts} direction={direction.current} instant={editing} /></span
				>
			</span>
		</div>
		<button
			type="button"
			class="step"
			{disabled}
			aria-controls={inputId}
			aria-label={strings.numberFieldIncrease({ label })}
			aria-disabled={atMax || undefined}
			data-pressed={pressed === 1 || undefined}
			onpointerdown={(event) => pressStepper(event, 1)}
			onpointerup={stopHold}
			onpointerleave={stopHold}
			onpointercancel={stopHold}
			onmousedown={(event) => event.preventDefault()}
			onclick={(event) => activateStepper(event, 1)}
			oncontextmenu={(event) => event.preventDefault()}
		>
			<span class="icon" bind:this={plusIcon}
				><PlusIcon size={16} strokeWidth={1.75} aria-hidden="true" /></span
			>
		</button>
	</div>
	<FieldMessage id={hintId} text={description} />
	<span class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
</div>

<style>
	.field {
		--nf-height: var(--arc-control-height-md);
		--nf-step: 34px;
		--nf-inset: 3px;
		--nf-text: var(--arc-text-base);
		--nf-width: var(--number-field-width, 196px);
		--nf-limit: color-mix(in oklch, var(--arc-warning) 72%, var(--arc-foreground));
		position: relative;
		display: grid;
		min-width: 0;
	}
	.field[data-size='sm'] {
		--nf-height: var(--arc-control-height-sm);
		--nf-step: 28px;
		--nf-text: var(--arc-text-sm);
		--nf-width: var(--number-field-width, 164px);
	}
	.field[data-size='lg'] {
		--nf-height: var(--arc-control-height-lg);
		--nf-step: 40px;
		--nf-inset: 4px;
		--nf-text: var(--arc-text-lg);
		--nf-width: var(--number-field-width, 228px);
	}
	:global(.dark) .field {
		--nf-limit: color-mix(in oklch, var(--arc-warning) 88%, var(--arc-foreground));
	}
	/* The label row matches the control's width, so the limit note sits over the stepper it answers. */
	.head {
		display: flex;
		width: min(100%, var(--nf-width));
		align-items: baseline;
		justify-content: space-between;
		gap: var(--arc-space-3);
		margin-bottom: var(--arc-space-2);
	}
	/* Without a visible label the note floats above the control, so showing it never moves the layout. */
	.head.floating {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: var(--arc-space-1);
		justify-content: flex-end;
		pointer-events: none;
	}
	.label {
		min-width: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
	}
	.field[data-size='sm'] .label {
		font-size: var(--arc-text-xs);
	}
	.limit {
		flex: none;
		color: var(--nf-limit);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* A hairline shell. Focus darkens the border only; a typed value past a limit tints it with the warning role instead. */
	.control {
		display: flex;
		align-items: center;
		width: min(100%, var(--nf-width));
		min-height: var(--nf-height);
		gap: 2px;
		padding: var(--nf-inset);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.control:hover {
			border-color: var(--arc-border-strong);
		}
	}
	.control:has(input:focus) {
		border-color: var(--arc-foreground);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
	}
	.control[data-warn],
	.control[data-warn]:hover {
		border-color: color-mix(in oklch, var(--arc-warning) 55%, var(--arc-border));
		background: color-mix(in oklch, var(--arc-warning) 5%, var(--arc-surface));
	}
	.control[data-warn]:has(input:focus) {
		border-color: color-mix(in oklch, var(--arc-warning) 80%, var(--arc-border));
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-warning) 24%, transparent);
	}
	.control[data-disabled] {
		opacity: 0.5;
		background: var(--arc-surface-muted);
	}
	/* Radius steps in by the shell's inset, so the pressed fill sits concentric with the shell. */
	.step {
		display: grid;
		width: var(--nf-step);
		height: var(--nf-step);
		flex: 0 0 var(--nf-step);
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: calc(var(--arc-radius-control) - var(--nf-inset) - 1px);
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.step :global(svg) {
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.step:hover:not(:disabled, [aria-disabled='true']) {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	/* Quick press, spring release: the fill deepens and the glyph sinks. A held button stays pressed for as long as it repeats. */
	.step:is(:active, [data-pressed]):not(:disabled, [aria-disabled='true']) {
		background: color-mix(in oklch, var(--arc-foreground) 10%, var(--arc-surface));
		color: var(--arc-foreground);
		transition:
			background-color 60ms linear,
			color 60ms linear;
	}
	.step:is(:active, [data-pressed]):not(:disabled, [aria-disabled='true']) :global(svg) {
		transform: scale(0.82);
		transition: transform 90ms var(--arc-ease-standard);
	}
	.step:focus-visible {
		outline: none;
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	/* At a limit the button dims but stays in the tab order, so a press there names the limit instead of dropping focus. */
	.step[aria-disabled='true'] {
		opacity: 0.32;
		cursor: not-allowed;
	}
	.step:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.control[data-strain='max'] .step[aria-disabled='true']:last-child,
	.control[data-strain='min'] .step[aria-disabled='true']:first-child {
		opacity: 0.6;
		color: var(--nf-limit);
		transition:
			opacity 60ms linear,
			color 60ms linear;
	}
	.value-wrap {
		position: relative;
		display: flex;
		min-width: 0;
		flex: 1;
		align-self: stretch;
		align-items: center;
		justify-content: center;
		cursor: text;
	}
	.control[data-disabled] .value-wrap {
		cursor: not-allowed;
	}
	/* The number and its affixes travel as one centered group. Tabular digits keep every column the same width. */
	.value {
		display: inline-flex;
		align-items: center;
		color: var(--arc-foreground);
		font-size: var(--nf-text);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.affix {
		display: inline-flex;
		color: var(--arc-text-secondary);
		font-weight: 400;
	}
	/* The rolling digits and the real input share one cell. The input only draws the caret and selection; its text is always painted by a span (the digits, or the draft mirror while typing), so the value keeps one weight and position either way. */
	.number {
		position: relative;
		display: inline-grid;
		align-items: center;
	}
	.display {
		display: inline-flex;
		grid-area: 1 / 1;
	}
	.display[data-hidden] {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
	}
	.mirror,
	.placeholder {
		grid-area: 1 / 1;
		white-space: pre;
	}
	.placeholder {
		color: var(--arc-text-muted);
		font-weight: 400;
	}
	.input {
		position: absolute;
		z-index: 1;
		top: 0;
		left: 0;
		width: calc(100% + 1em);
		height: 100%;
		min-width: 2ch;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: transparent;
		caret-color: var(--arc-foreground);
		font: inherit;
		font-variant-numeric: inherit;
		letter-spacing: inherit;
		line-height: inherit;
		text-align: left;
		outline: none;
	}
	.input::placeholder {
		color: transparent;
	}
	.input::selection {
		background: color-mix(in oklch, var(--arc-foreground) 16%, transparent);
		color: transparent;
	}
	.input:disabled {
		cursor: not-allowed;
	}
	.icon {
		display: grid;
		place-items: center;
	}
	.label[data-scrub] {
		cursor: ew-resize;
		touch-action: pan-y;
		user-select: none;
		-webkit-user-select: none;
	}
	.control[data-scrubbing] {
		border-color: var(--arc-foreground);
	}
	@media (prefers-reduced-motion: reduce) {
		.control,
		.step {
			transition:
				opacity var(--arc-duration-instant) linear,
				border-color var(--arc-duration-instant) linear,
				background-color var(--arc-duration-instant) linear;
		}
		.step :global(svg),
		.step:is(:active, [data-pressed]):not(:disabled, [aria-disabled='true']) :global(svg) {
			transform: none;
			transition: none;
		}
		.control[data-strain] .value {
			color: var(--nf-limit);
			transition: none;
		}
	}
</style>
