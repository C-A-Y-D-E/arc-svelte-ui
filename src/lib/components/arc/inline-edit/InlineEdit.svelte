<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import XIcon from '@lucide/svelte/icons/x';
	import { animate, motionValue, styleEffect } from 'motion';
	import { flushSync, untrack } from 'svelte';
	import { motionTransition } from '../input';
	import { strings } from '../strings';
	import { isReducedMotion, motionTokens } from '../motion';

	/**
	 * Click-to-edit text for names and short fields that are read far more often than they change, such as a project name or its description.
	 * The text turns into a field in place with the same metrics, so nothing around it moves, and the box grows with what you type. Enter saves
	 * optimistically and a check draws once the save lands; Escape rolls the text back. A failed save restores the last saved value and says why.
	 * Use a regular form when several fields must be saved together.
	 */
	type Props = {
		/** The saved value. A new value from outside replaces the text while it is not being edited. */
		value: string;
		/** Persists the new value. Return a promise to show the saving state, and reject it to roll back. */
		onSave: (next: string) => void | Promise<unknown>;
		/** Accessible name, for example “Project name”. */
		label: string;
		/** Returns a message when the draft cannot be saved. */
		validate?: (next: string) => string | null | undefined;
		/** Shown when the value is empty. */
		placeholder?: string;
		/** Wraps onto several lines and grows in height. Enter still saves; Shift+Enter adds a line break. */
		multiline?: boolean;
		/** `title` for names and headings, `body` for descriptions. */
		variant?: 'title' | 'body';
		/** The element that holds the text, so a title can stay a heading. */
		as?: 'span' | 'p' | 'h1' | 'h2' | 'h3';
		/** Reserves room for the actions only while editing, for values set in a row of text. Not in Arc. */
		compact?: boolean;
		class?: string;
	};

	let {
		value,
		onSave,
		label,
		validate,
		placeholder = '',
		multiline = false,
		variant = 'title',
		as = 'span',
		compact = false,
		class: className
	}: Props = $props();

	type Phase = 'idle' | 'saving' | 'saved' | 'failed';
	type Source = 'key' | 'button' | 'blur';
	type Message = { key: string; tone: 'error' | 'failed'; text: string };
	type CaretDocument = Document & {
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};

	const SAVED_HOLD_MS = 1800;
	const FLASH_HOLD_MS = 1400;
	const FLASH_FADE_MS = 2000;
	/** Size changes under this are rounding, not content. */
	const MIN_CHANGE_PX = 0.1;
	/** About .3em of the text. */
	const TEXT_RISE_PX = 5;
	const TEXT_IN_S = 0.22;
	const TEXT_OUT_S = 0.15;
	const FADE_IN_S = 0.15;
	const FADE_OUT_S = 0.1;
	const ICON_SCALE = 0.6;
	/** A zero-width space keeps the line box, so an empty field never collapses. */
	const LINE_KEEPER = '​';
	const { blur, duration, spring } = motionTokens;
	/** Typing retargets many times a second, so the frame follows on a quicker spring without overshoot and keeps up with a fast typist. */
	const typingSpring = { ...spring.snappy, visualDuration: duration.fast, bounce: 0 };

	const ids = $props.id();
	const displayHintId = `${ids}-display`;
	const editHintId = `${ids}-edit`;
	const messageId = `${ids}-message`;

	let committed = $state(untrack(() => value));
	let shown = $state(untrack(() => value));
	let layer = $state({ key: 0, direction: 1 });
	let editing = $state(false);
	let draft = $state(untrack(() => value));
	let phase = $state<Phase>('idle');
	let error = $state<string | null>(null);
	let failed = $state<string | null>(null);
	let flash = $state<'on' | 'off' | null>(null);
	let announcement = $state('');

	let root: HTMLDivElement;
	let display: HTMLButtonElement;
	let box: HTMLSpanElement;
	let frame: HTMLSpanElement;
	let control = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let saveRun = 0;
	const timers: ReturnType<typeof setTimeout>[] = [];

	// Single line: the layout box and the input take a new width at once, so the input never scrolls, while the visible frame springs after it.
	// Multiline: the box's height springs, so content below glides, while the textarea already has the room its text needs.
	const frameWidth = motionValue<number | string>('100%');
	const boxHeight = motionValue<number | string>('auto');
	let size = 0;
	let wasEditing = false;

	const layerText = $derived(editing ? draft : shown);
	const saving = $derived(phase === 'saving');
	const noun = $derived(label.toLowerCase());
	const slot = $derived(editing ? 'edit' : phase);
	const message: Message | null = $derived(
		error
			? { key: `error:${error}`, tone: 'error', text: error }
			: failed && !editing
				? {
						key: `failed:${failed}`,
						tone: 'failed',
						text: strings.inlineEditFailed({ value: failed, name: noun })
					}
				: null
	);

	// A new value from outside replaces the text, unless the person is typing or a save is still in flight.
	$effect.pre(() => {
		const next = value;
		untrack(() => {
			if (next === committed) return;
			committed = next;
			if (editing || phase === 'saving' || next === shown) return;
			shown = next;
			layer = { key: layer.key + 1, direction: 1 };
		});
	});

	$effect(() => () => timers.forEach(clearTimeout));

	$effect(() =>
		multiline ? styleEffect(box, { height: boxHeight }) : styleEffect(frame, { width: frameWidth })
	);

	// Changes the person caused (typing, switching modes, a rollback) spring from the size on screen, measured before paint.
	$effect(() => {
		void [layerText, editing, multiline, isReducedMotion()];
		untrack(followContent);
	});

	// A late web font or a resized container follows at once instead of animating.
	$effect(() => {
		const observer = new ResizeObserver(() => {
			const next = naturalSize();
			if (!next || Math.abs(next - size) < MIN_CHANGE_PX) return;
			size = next;
			snap(next);
		});
		// Border box, so the room added while editing (padding, not content) is noticed too.
		observer.observe(display, { box: 'border-box' });
		return () => observer.disconnect();
	});

	function later(run: () => void, ms: number) {
		timers.push(setTimeout(run, ms));
	}

	function naturalSize() {
		return parseFloat(getComputedStyle(display)[multiline ? 'height' : 'width']) || 0;
	}

	function fitControlHeight(next: number) {
		if (!multiline || !control) return;
		control.style.height = `${next}px`;
		control.scrollTop = 0;
	}

	/** Written straight to the DOM, because a motion value only reaches the style on its next frame, and one frame at the wrong size shows. */
	function snap(next: number) {
		fitControlHeight(next);
		if (multiline) box.style.height = `${next}px`;
		else frame.style.width = `${next}px`;
		(multiline ? boxHeight : frameWidth).jump(next);
	}

	function followContent() {
		const next = naturalSize();
		const previous = size;
		const typing = editing && wasEditing;
		size = next;
		wasEditing = editing;
		if (!next) return;
		fitControlHeight(next);
		const target = multiline ? boxHeight : frameWidth;
		if (!previous || isReducedMotion() || typeof target.get() !== 'number') return snap(next);
		if (Math.abs(next - previous) < MIN_CHANGE_PX) return;
		const transition = multiline ? spring.smooth : typing ? typingSpring : spring.morph;
		animate(target as ReturnType<typeof motionValue<number>>, next, transition);
	}

	/** Focus moves into the field with the caret where the text was clicked. */
	function startEdit(at: number | 'all', text = shown) {
		if (editing || saving) return;
		draft = text;
		editing = true;
		error = null;
		failed = null;
		flash = null;
		phase = 'idle';
		flushSync();
		control?.focus({ preventScroll: true });
		if (at === 'all') control?.select();
		else control?.setSelectionRange(at, at);
	}

	function stopEdit(returnFocus: boolean) {
		editing = false;
		error = null;
		if (!returnFocus) return;
		flushSync();
		display.focus({ preventScroll: true });
	}

	function rollLayer(direction: 1 | -1) {
		layer = { key: layer.key + 1, direction };
	}

	/** The caret lands on the character that was clicked, the way it would in a text field. */
	function caretAt(x: number, y: number) {
		const node = display.querySelector(`[data-layer="${layer.key}"]`)?.firstChild;
		if (!node || !shown) return shown.length;
		const doc = document as CaretDocument;
		const position = doc.caretPositionFromPoint?.(x, y);
		if (position)
			return position.offsetNode === node ? Math.min(position.offset, shown.length) : shown.length;
		const range = doc.caretRangeFromPoint?.(x, y);
		return range && range.startContainer === node
			? Math.min(range.startOffset, shown.length)
			: shown.length;
	}

	function onDisplayClick(event: MouseEvent) {
		if (saving) return;
		// A keyboard activation selects everything, ready to retype; a click puts the caret where it landed.
		startEdit(event.detail === 0 ? 'all' : caretAt(event.clientX, event.clientY));
	}

	function clean(text: string) {
		return multiline ? text.trim() : text.replace(/\s+/g, ' ').trim();
	}

	function submit(source: Source) {
		const next = clean(draft);
		const problem = validate?.(next) || null;
		if (problem) {
			error = problem;
			if (source !== 'blur') control?.focus();
			return;
		}
		// Trimmed spaces would shift the text in one frame, so a cleaned value arrives with the text motion instead.
		if (next !== draft) rollLayer(1);
		stopEdit(source !== 'blur');
		if (next !== shown) save(next);
	}

	function save(next: string) {
		const previous = committed;
		const run = ++saveRun;
		shown = next;
		phase = 'saving';
		announcement = strings.inlineEditSaving({ name: noun });
		Promise.resolve()
			.then(() => onSave(next))
			.then(
				() => run === saveRun && landSave(next),
				() => run === saveRun && rollBack(previous, next)
			);
	}

	function landSave(next: string) {
		committed = next;
		phase = 'saved';
		announcement = `${label} saved`;
		later(() => phase === 'saved' && (phase = 'idle'), SAVED_HOLD_MS);
	}

	/** A failed save restores the last saved value, washes the frame once, and says why. */
	function rollBack(previous: string, attempted: string) {
		shown = previous;
		rollLayer(-1);
		phase = 'failed';
		failed = attempted;
		flash = 'on';
		announcement = '';
		later(() => flash === 'on' && (flash = 'off'), FLASH_HOLD_MS);
		later(() => flash === 'off' && (flash = null), FLASH_FADE_MS);
	}

	function cancel() {
		if (draft !== shown) rollLayer(-1);
		stopEdit(true);
	}

	function retry() {
		if (failed) startEdit(failed.length, failed);
	}

	function onDraftInput() {
		if (error) error = validate?.(clean(draft)) || null;
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			return cancel();
		}
		if (event.key === 'Enter' && !event.isComposing && !(multiline && event.shiftKey)) {
			event.preventDefault();
			submit('key');
		}
	}

	// Leaving the component saves, the way a rename does; switching windows does not.
	function onFocusOut(event: FocusEvent) {
		if (!editing) return;
		const next = event.relatedTarget as Node | null;
		if (next && root.contains(next)) return;
		if (!next && !document.hasFocus()) return;
		submit('blur');
	}

	function describedBy(hint: string) {
		return [hint, message ? messageId : null].filter(Boolean).join(' ');
	}

	/** Text rises in from a soft blur. A rollback runs the other way, dropping the old words down and the saved ones in from above. */
	function textIn(node: Element, direction: number) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: [0, 1] }
				: {
						opacity: [0, 1],
						y: [TEXT_RISE_PX * direction, 0],
						filter: [`blur(${blur.soft}px)`, 'blur(0px)']
					},
			transition: reduced
				? { duration: FADE_IN_S }
				: { duration: TEXT_IN_S, ease: motionTokens.ease.enter }
		});
	}

	function textOut(node: Element, direction: number) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: 0 }
				: { opacity: 0, y: -TEXT_RISE_PX * direction, filter: `blur(${blur.subtle}px)` },
			transition: reduced
				? { duration: FADE_OUT_S }
				: { duration: TEXT_OUT_S, ease: motionTokens.ease.standard },
			pop: true
		});
	}

	/** Scale rides the spring; opacity and blur tween so the blur never overshoots below zero. */
	function iconIn(node: Element) {
		const reduced = isReducedMotion();
		const tween = { duration: duration.fast, ease: motionTokens.ease.enter };
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: [0, 1] }
				: {
						opacity: [0, 1],
						scale: [ICON_SCALE, 1],
						filter: [`blur(${blur.subtle}px)`, 'blur(0px)']
					},
			transition: reduced
				? { duration: FADE_IN_S }
				: { ...spring.snappy, opacity: tween, filter: tween }
		});
	}

	function iconOut(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: 0 }
				: { opacity: 0, scale: ICON_SCALE, filter: `blur(${blur.subtle}px)` },
			transition: reduced
				? { duration: FADE_OUT_S }
				: { duration: TEXT_OUT_S, ease: motionTokens.ease.standard }
		});
	}

	/** The message row opens and closes its height on a spring while the words rise in, so an error never pushes the page in one frame. */
	function followMessageHeight(inner: HTMLElement) {
		const row = inner.parentElement as HTMLElement;
		const height = motionValue(0);
		const stopStyles = styleEffect(row, { height });
		let measured = false;
		const observer = new ResizeObserver(([entry]) => {
			const next = entry.borderBoxSize?.[0]?.blockSize ?? inner.offsetHeight;
			if (measured && !isReducedMotion()) return void animate(height, next, spring.smooth);
			measured = true;
			height.jump(next);
		});
		observer.observe(inner, { box: 'border-box' });
		return () => {
			observer.disconnect();
			height.stop();
			stopStyles();
		};
	}
</script>

<div
	bind:this={root}
	class={['root', className]}
	data-variant={variant}
	data-multiline={multiline || undefined}
	data-compact={compact || undefined}
	data-editing={editing || undefined}
	data-phase={phase}
	data-invalid={error ? '' : undefined}
	data-flash={flash ?? undefined}
	onfocusout={onFocusOut}
>
	<svelte:element this={as} class="line">
		<span bind:this={box} class="box">
			<!-- The text stays in flow while editing, hidden and mirroring the draft, so it sizes the box and can roll back with motion on Escape. -->
			<button
				bind:this={display}
				type="button"
				class="display"
				onclick={onDisplayClick}
				tabindex={editing ? -1 : undefined}
				aria-label={`${label}: ${shown || placeholder}`}
				aria-describedby={describedBy(displayHintId)}
				aria-disabled={saving || undefined}
			>
				<span class="layer" data-empty={layerText ? undefined : ''}>
					{#key layer.key}
						<span
							data-layer={layer.key}
							class="text"
							in:textIn={layer.direction}
							out:textOut={layer.direction}
							>{(layerText || placeholder || LINE_KEEPER) +
								(multiline && editing ? LINE_KEEPER : '')}</span
						>
					{/key}
				</span>
			</button>
			{#if editing}
				{#if multiline}
					<textarea
						bind:this={control}
						bind:value={draft}
						class="control"
						rows={1}
						enterkeyhint="done"
						{placeholder}
						aria-label={label}
						aria-invalid={error ? true : undefined}
						aria-describedby={describedBy(editHintId)}
						autocomplete="off"
						spellcheck={variant === 'body'}
						oninput={onDraftInput}
						onkeydown={onKeydown}></textarea>
				{:else}
					<input
						bind:this={control}
						bind:value={draft}
						class="control"
						type="text"
						enterkeyhint="done"
						{placeholder}
						aria-label={label}
						aria-invalid={error ? true : undefined}
						aria-describedby={describedBy(editHintId)}
						autocomplete="off"
						spellcheck={variant === 'body'}
						oninput={onDraftInput}
						onkeydown={onKeydown}
					/>
				{/if}
			{/if}
			<span bind:this={frame} class="frame">
				<span class="slot">
					{#key slot}
						<span class="slot-item" in:iconIn out:iconOut>
							{#if slot === 'edit'}
								<span class="actions">
									<button
										type="button"
										class="save"
										aria-label={strings.inlineEditSave({ name: noun })}
										onpointerdown={(event) => event.preventDefault()}
										onclick={() => submit('button')}
									>
										<CheckIcon size={15} strokeWidth={2} aria-hidden="true" />
									</button>
									<button
										type="button"
										class="cancel"
										aria-label={strings.inlineEditCancel()}
										onpointerdown={(event) => event.preventDefault()}
										onclick={cancel}
									>
										<XIcon size={15} strokeWidth={2} aria-hidden="true" />
									</button>
								</span>
							{:else if slot === 'saving'}
								<span class="spinner" aria-hidden="true"></span>
							{:else if slot === 'saved'}
								<!-- The tick draws itself from its short stroke, the way a hand would write it. -->
								<span class="saved" aria-hidden="true">
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.25"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path class="drawn-check" d="M4 12.5l5 5L20 6.5" pathLength="1" />
									</svg>
								</span>
							{:else if slot === 'failed'}
								<CircleAlertIcon
									class="failed-icon"
									size={16}
									strokeWidth={1.75}
									aria-hidden="true"
								/>
							{:else}
								<!-- The display button is the keyboard path; the pencil is a pointer shortcut. -->
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
								<span class="pencil" onclick={() => startEdit(shown.length)}>
									<PencilIcon size={14} strokeWidth={1.75} aria-hidden="true" />
								</span>
							{/if}
						</span>
					{/key}
				</span>
			</span>
		</span>
	</svelte:element>
	<span class="reveal">
		<span id={messageId} class="reveal-inner" aria-live="polite" {@attach followMessageHeight}>
			{#key message?.key}
				{#if message}
					<span
						class="message"
						data-tone={message.tone}
						in:textIn|global={1}
						out:textOut|global={1}
					>
						<CircleAlertIcon class="message-icon" size={14} strokeWidth={2} aria-hidden="true" />
						{#if message.tone === 'failed'}
							<span
								>{message.text}
								<button type="button" class="retry" onclick={retry}>{strings.tryAgain()}</button
								></span
							>
						{:else}
							<span>{message.text}</span>
						{/if}
					</span>
				{/if}
			{/key}
		</span>
	</span>
	<span id={displayHintId} class="sr-only">{strings.inlineEditActivate()}</span>
	<span id={editHintId} class="sr-only"
		>{multiline ? strings.inlineEditHintMultiline() : strings.inlineEditHint()}</span
	>
	<span class="sr-only" role="status">{announcement}</span>
</div>

<style>
	/* The box sits a border and padding outside the text, so the text lines up with the content around it and the hover surface reaches past it. */
	.root {
		--inline-pad-x: 8px;
		--inline-pad-y: 3px;
		position: relative;
		display: grid;
		min-width: 0;
		margin-inline-start: calc(-1 * (var(--inline-pad-x) + 1px));
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	/* Whole-pixel line heights: an input centres its text by rounding, so a fractional line would sit the field a pixel below the display. */
	.root[data-variant='title'] {
		--inline-size: var(--arc-text-xl);
		--inline-leading: round(var(--inline-size) * 1.3, 2px);
		--inline-weight: 500;
		--inline-ink: var(--arc-foreground);
	}
	.root[data-variant='body'] {
		--inline-pad-y: 5px;
		--inline-size: var(--arc-text-sm);
		--inline-leading: round(var(--inline-size) * 1.5, 1px);
		--inline-weight: 400;
		--inline-ink: var(--arc-text-secondary);
	}
	/* Room for the actions is reserved in every state, so the text never rewraps when editing starts. */
	/* Inter at every size here: a heading host keeps its semantics but not the display face. */
	.line {
		display: block;
		min-width: 0;
		margin: 0;
		padding-inline-end: 66px;
		color: var(--inline-ink);
		font-family: var(--arc-font-body);
		font-size: var(--inline-size);
		font-weight: var(--inline-weight);
		line-height: var(--inline-leading);
		letter-spacing: var(--arc-tracking-body);
	}
	.root[data-multiline] .line {
		padding-inline-end: 38px;
	}
	/* Compact: just the pencil's width at rest; neighbours make room once editing starts. */
	.root[data-compact]:not([data-editing]) .line {
		padding-inline-end: 22px;
	}
	.box {
		position: relative;
		display: inline-block;
		max-width: 100%;
		vertical-align: top;
	}
	.root[data-multiline] .box {
		display: block;
	}
	/* Display and field share every metric: border, padding, font, and line height. Only the frame behind them changes. */
	.display,
	.control {
		box-sizing: border-box;
		margin: 0;
		padding: var(--inline-pad-y) var(--inline-pad-x);
		border: 1px solid transparent;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: inherit;
		font: inherit;
		font-feature-settings: inherit;
		letter-spacing: inherit;
		word-spacing: inherit;
		line-height: var(--inline-leading);
		text-align: left;
		text-indent: 0;
		text-transform: none;
		-webkit-tap-highlight-color: transparent;
	}
	.display {
		position: relative;
		z-index: 1;
		display: block;
		max-width: 100%;
		cursor: text;
	}
	.root[data-multiline] .display {
		width: 100%;
	}
	.root[data-editing] .display {
		visibility: hidden;
	}
	/* While editing, a single line keeps a little extra room, so the next character never has to wait for the box. */
	.root[data-editing]:not([data-multiline]) .display {
		min-width: 5em;
		padding-inline-end: calc(var(--inline-pad-x) + 16px);
	}
	.display[aria-disabled='true'] {
		cursor: progress;
	}
	.display:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.layer {
		position: relative;
		display: block;
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.layer[data-empty] {
		color: var(--arc-text-muted);
	}
	/* An optimistic save shows the new text at once, a little quieter until the save lands; then it settles to full strength. */
	.root[data-phase='saving'] .layer {
		opacity: 0.5;
		transition-duration: var(--arc-duration-fast);
	}
	.text {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: pre;
	}
	.root[data-multiline] .text {
		overflow: visible;
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	.control {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 2;
		width: 100%;
		height: 100%;
		outline: none;
		resize: none;
		overflow: hidden;
		caret-color: var(--arc-foreground);
	}
	/* The frame carries the focus ring for the field, so the field itself never draws a second one. */
	.control:focus-visible {
		outline: none;
	}
	.control::placeholder {
		color: var(--arc-text-muted);
		opacity: 1;
	}
	textarea.control {
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	/* The frame is the only surface: a hover tint at rest, a bordered field while editing, a soft danger wash when a save fails. */
	.frame {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		z-index: 0;
		box-sizing: border-box;
		border: 1px solid transparent;
		border-radius: var(--arc-radius-control);
		background: transparent;
		pointer-events: none;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* The natural width before any script runs; the frame's spring takes over from there. */
	.root:not([data-multiline]) .frame {
		width: 100%;
	}
	.root[data-multiline] .frame {
		right: 0;
	}
	@media (hover: hover) and (pointer: fine) {
		.display:not([aria-disabled='true']):hover ~ .frame {
			background: var(--arc-surface-muted);
		}
		/* Always shown so the value reads as editable; hovering gives one short writing stroke, never a loop. */
		.pencil {
			transition: color var(--arc-duration-fast) var(--arc-ease-standard);
		}
		.display:hover ~ .frame .pencil,
		.display:focus-visible ~ .frame .pencil,
		.pencil:hover {
			color: var(--arc-foreground);
		}
	}
	@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
		.display:hover ~ .frame .pencil,
		.display:focus-visible ~ .frame .pencil,
		.pencil:hover {
			animation: pencil-write 0.45s var(--arc-ease-standard);
		}
	}
	.root[data-editing] .frame {
		border-color: var(--arc-foreground);
		background: var(--arc-surface);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
	}
	.root[data-invalid] .frame {
		border-color: var(--arc-danger);
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-danger) 24%, transparent);
	}
	.root[data-flash='on'] .frame {
		border-color: color-mix(in oklch, var(--arc-danger) 30%, transparent);
		background: color-mix(in oklch, var(--arc-danger) 9%, transparent);
	}
	/* The wash leaves slowly, without any movement, once the message has been read. */
	.root[data-flash='off'] .frame {
		transition-duration: var(--arc-duration-considered);
	}
	/* The slot rides on the frame's edge, so it follows the width morph instead of jumping to the new width. */
	.slot {
		position: absolute;
		top: 50%;
		left: calc(100% + 6px);
		display: grid;
		min-height: 28px;
		margin-top: -14px;
		pointer-events: auto;
	}
	.root[data-multiline] .slot {
		top: 0;
		left: calc(100% + 8px);
		margin-top: calc(var(--inline-pad-y) + var(--inline-leading) / 2 - 13px);
	}
	.slot-item {
		display: grid;
		grid-area: 1 / 1;
		min-height: 28px;
		place-items: center start;
	}
	.actions {
		display: flex;
		gap: 4px;
	}
	.root[data-multiline] .actions {
		flex-direction: column;
	}
	.save,
	.cancel {
		display: grid;
		width: 28px;
		height: 28px;
		flex: none;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--arc-radius-pill);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.save {
		background: var(--arc-foreground);
		color: var(--arc-background);
	}
	.cancel {
		border-color: var(--arc-border);
		background: var(--arc-surface);
		color: var(--arc-text-secondary);
	}
	.save:active,
	.cancel:active {
		transform: scale(0.96);
	}
	@media (hover: hover) and (pointer: fine) {
		.save:hover {
			background: color-mix(in oklch, var(--arc-foreground) 86%, var(--arc-background));
		}
		.cancel:hover {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.save:focus-visible,
	.cancel:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.pencil {
		display: grid;
		margin-left: 2px;
		color: var(--arc-text-muted);
		cursor: pointer;
		transform-origin: bottom left;
	}
	.spinner {
		display: block;
		width: 14px;
		height: 14px;
		margin-left: 2px;
		border: 1.5px solid var(--arc-text-muted);
		border-right-color: transparent;
		border-radius: var(--arc-radius-pill);
		animation: spin 0.7s linear infinite;
	}
	.saved {
		display: grid;
		margin-left: 1px;
		place-items: center;
		color: var(--arc-success);
	}
	.drawn-check {
		stroke-dasharray: 1;
		animation: draw-check 0.32s var(--arc-ease-enter) 0.06s both;
	}
	.slot-item :global(.failed-icon) {
		margin-left: 1px;
		color: var(--arc-danger);
	}
	/* The message row opens from a true zero; its spacing lives inside the clipped slot. */
	.reveal {
		display: block;
		overflow: hidden;
	}
	.reveal-inner {
		position: relative;
		display: block;
	}
	.message {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 6px var(--inline-pad-x) 4px calc(var(--inline-pad-x) + 1px);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		font-weight: 400;
		line-height: var(--arc-leading-body);
	}
	.message[data-tone='error'] {
		color: var(--arc-danger);
	}
	.message :global(.message-icon) {
		flex: none;
		margin-top: 2px;
		color: var(--arc-danger);
	}
	.retry {
		margin: 0 0 0 2px;
		padding: 0;
		border: 0;
		border-radius: 4px;
		background: none;
		color: var(--arc-foreground);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--arc-border-strong);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	@media (hover: hover) and (pointer: fine) {
		.retry:hover {
			text-decoration-color: currentColor;
		}
	}
	.retry:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes pencil-write {
		35% {
			transform: rotate(-16deg) translateY(-1px);
		}
		70% {
			transform: rotate(6deg);
		}
	}
	@keyframes draw-check {
		from {
			opacity: 0;
			stroke-dashoffset: 1;
		}
		to {
			opacity: 1;
			stroke-dashoffset: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
			border-right-color: var(--arc-text-muted);
			border-top-color: transparent;
		}
		.drawn-check {
			animation: none;
		}
		.layer,
		.save,
		.cancel,
		.pencil {
			transition: none;
		}
	}
</style>
