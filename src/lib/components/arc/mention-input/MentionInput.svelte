<script module lang="ts">
	import type { MentionKind } from './mentions';

	/** Methods on the component instance (`bind:this`). The textarea itself is `bind:textarea`. */
	export type MentionInputHandle = {
		focus: () => void;
		/** Inserts text at the caret, as if typed. */
		insert: (text: string) => void;
		/** Types a trigger at the caret so the suggestions open, adding a space first when needed. */
		openSuggestions: (kind: MentionKind) => void;
		clear: () => void;
	};
</script>

<script lang="ts">
	import { animate, motionValue, styleEffect } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { isReducedMotion } from '../motion';
	import {
		EMPTY_VALUE,
		SYMBOL,
		byStart,
		findTrigger,
		mentionText,
		mirrorHtml,
		rankSuggestions,
		reconcile,
		type Mention,
		type MentionChannel,
		type MentionPerson,
		type MentionValue,
		type Suggestion
	} from './mentions';
	import MentionSuggestions, { type SuggestionAnchor } from './MentionSuggestions.svelte';
	import { GROW } from './springs';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'onsubmit'> & {
		value?: MentionValue;
		defaultValue?: MentionValue;
		onChange?: (value: MentionValue) => void;
		/** People offered after `@`. Leave it out to turn person mentions off. */
		people?: MentionPerson[];
		/** Channels offered after `#`. Leave it out to turn channel mentions off. */
		channels?: MentionChannel[];
		/** Called when a suggestion becomes a mention. */
		onMentionAdd?: (mention: Mention) => void;
		/** With `submitOnEnter`, Enter submits and Shift+Enter adds a line. */
		onSubmit?: (value: MentionValue) => void;
		submitOnEnter?: boolean;
		placeholder?: string;
		minRows?: number;
		/** The field grows to this many rows, then scrolls. */
		maxRows?: number;
		/** Where suggestions open. `auto` flips above when there is no room below. */
		placement?: 'auto' | 'top' | 'bottom';
		maxSuggestions?: number;
		disabled?: boolean;
		name?: string;
		id?: string;
		textarea?: HTMLTextAreaElement | null;
	};

	let {
		defaultValue,
		value = $bindable(defaultValue ?? EMPTY_VALUE),
		onChange,
		people,
		channels,
		onMentionAdd,
		onSubmit,
		submitOnEnter = false,
		placeholder,
		minRows = 1,
		maxRows = 8,
		placement = 'auto',
		maxSuggestions = 6,
		disabled,
		name,
		id,
		'aria-label': ariaLabel,
		'aria-describedby': describedBy,
		textarea = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	const POPOVER_WIDTH = 272;
	const FALLBACK_LINE_PX = 24;
	/** Suggestions flip above the caret when less room than this is left below it. */
	const FLIP_ROOM_PX = 300;
	const POPOVER_GAP_PX = 6;
	const POPOVER_INSET_PX = 10;
	const HEIGHT_EPSILON = 0.5;

	const uid = $props.id();
	const listId = `${uid}-list`;
	const optionId = (index: number) => `${uid}-option-${index}`;

	let root: HTMLDivElement;
	let field: HTMLDivElement;
	let area: HTMLTextAreaElement;
	let backdrop: HTMLDivElement;
	let lastCaret = 0;
	let pending: Mention | null = null;

	let caret = $state<number | null>(null);
	let focused = $state(false);
	let anchor = $state.raw<SuggestionAnchor | null>(null);
	let limits = $state.raw({ min: 0, max: Infinity });

	const kinds = $derived({ person: !!people?.length, channel: !!channels?.length });
	const trigger = $derived(
		caret === null ? null : findTrigger(value.text, caret, value.mentions, kinds)
	);
	const triggerStart = $derived(trigger?.start ?? null);
	const queryKey = $derived(trigger ? `${trigger.start}:${trigger.query}` : '');
	const suggestions = $derived(
		trigger ? rankSuggestions(trigger, people ?? [], channels ?? [], maxSuggestions) : []
	);
	/** Escape dismisses the list for the trigger it was open for; a new trigger clears it. */
	let dismissed = $derived.by<number | null>(() => {
		void triggerStart;
		return null;
	});
	let active = $derived.by(() => {
		void queryKey;
		return 0;
	});

	// A sentence that simply continues after an unmatched name closes the list instead of showing an empty state.
	const open = $derived(
		focused &&
			!disabled &&
			!!trigger &&
			trigger.start !== dismissed &&
			(suggestions.length > 0 || !trigger.query.includes(' '))
	);
	const activeIndex = $derived(Math.min(active, Math.max(0, suggestions.length - 1)));
	const mirror = $derived(mirrorHtml(value, open && trigger ? trigger.start : -1));
	const countLabel = $derived.by(() => {
		if (!open) return '';
		const count = suggestions.length;
		if (!count) return 'No matches';
		const noun =
			trigger?.kind === 'person'
				? count === 1
					? 'person'
					: 'people'
				: count === 1
					? 'channel'
					: 'channels';
		return `${count} ${noun}`;
	});

	$effect(() => {
		textarea = area;
	});

	function commit(next: MentionValue) {
		value = next;
		onChange?.(next);
	}

	function trackCaret() {
		lastCaret = area.selectionStart;
		caret = area.selectionStart === area.selectionEnd ? area.selectionStart : null;
	}

	/** Adds the mention a chosen suggestion typed, once the text really holds its token. */
	function withPending(mentions: Mention[], text: string) {
		const added = pending;
		pending = null;
		if (added && text.slice(added.start, added.end) === mentionText(added.kind, added.label)) {
			mentions.push(added);
			mentions.sort(byStart);
			return added;
		}
		return null;
	}

	/* Selection: the caret never rests inside a token. Arrow keys hop over it; a click lands on the nearest edge. */
	function snapSelection() {
		if (document.activeElement !== area) return;
		let start = area.selectionStart;
		let end = area.selectionEnd;
		const collapsed = start === end;
		for (const mention of value.mentions) {
			if (collapsed && start > mention.start && start < mention.end) {
				const stepped = Math.abs(start - lastCaret) === 1;
				const forward = start > lastCaret;
				const nearest = start - mention.start < mention.end - start ? mention.start : mention.end;
				start = end = stepped ? (forward ? mention.end : mention.start) : nearest;
			} else if (!collapsed) {
				if (start > mention.start && start < mention.end) start = mention.start;
				if (end > mention.start && end < mention.end) end = mention.end;
			}
		}
		if (start !== area.selectionStart || end !== area.selectionEnd) {
			area.setSelectionRange(start, end, area.selectionDirection);
		}
		lastCaret = area.selectionStart;
		caret = collapsed ? start : null;
	}

	/* React's onSelect covers every selection move in the field; the document event does the same here. */
	$effect(() => {
		document.addEventListener('selectionchange', snapSelection);
		return () => document.removeEventListener('selectionchange', snapSelection);
	});

	function oninput() {
		const text = area.value;
		const mentions = reconcile(value, text, lastCaret);
		const added = withPending(mentions, text);
		commit({ text, mentions });
		if (added) onMentionAdd?.(added);
		trackCaret();
	}

	/** Types through the browser so the change joins the native undo stack; falls back to a direct edit. */
	function typeText(text: string, from?: number, to?: number) {
		area.focus({ preventScroll: true });
		if (from !== undefined) area.setSelectionRange(from, to ?? from);
		lastCaret = area.selectionStart;
		const typed =
			typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
		if (typed) return;
		const start = area.selectionStart;
		const nextText = value.text.slice(0, start) + text + value.text.slice(area.selectionEnd);
		const mentions = reconcile(value, nextText, start);
		const added = pending;
		pending = null;
		if (added) mentions.push(added);
		mentions.sort(byStart);
		commit({ text: nextText, mentions });
		if (added) onMentionAdd?.(added);
		requestAnimationFrame(() => {
			area.setSelectionRange(start + text.length, start + text.length);
			caret = start + text.length;
		});
	}

	function choose(suggestion: Suggestion | undefined) {
		if (!suggestion || !trigger || caret === null) return;
		const label = suggestion.item.name;
		const token = mentionText(suggestion.kind, label);
		pending = {
			kind: suggestion.kind,
			id: suggestion.item.id,
			label,
			start: trigger.start,
			end: trigger.start + token.length
		};
		const after = value.text[caret];
		typeText(after === undefined || !/\s/.test(after) ? `${token} ` : token, trigger.start, caret);
	}

	function suggestionKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			if (suggestions.length)
				active = (activeIndex + step + suggestions.length) % suggestions.length;
			return true;
		}
		if ((event.key === 'Enter' || event.key === 'Tab') && suggestions.length && !event.shiftKey) {
			event.preventDefault();
			choose(suggestions[activeIndex]);
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismissed = trigger?.start ?? null;
			return true;
		}
		return false;
	}

	function onkeydown(event: KeyboardEvent) {
		lastCaret = area.selectionStart;
		if (open && suggestionKey(event)) return;
		const start = area.selectionStart;
		const deleting = event.key === 'Backspace' || event.key === 'Delete';
		if (start === area.selectionEnd && !event.metaKey && deleting) {
			// Select the whole token and let the native delete run, so one keystroke removes it and undo restores it.
			const hit = value.mentions.find((mention) =>
				event.key === 'Backspace'
					? start > mention.start && start <= mention.end
					: start >= mention.start && start < mention.end
			);
			if (hit) area.setSelectionRange(hit.start, hit.end);
			return;
		}
		if (event.key === 'Enter' && submitOnEnter && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (value.text.trim()) onSubmit?.(value);
		}
	}

	export function focus() {
		area.focus();
	}

	export function insert(text: string) {
		typeText(text);
	}

	export function openSuggestions(kind: MentionKind) {
		const inField = document.activeElement === area;
		const at = inField ? area.selectionStart : value.text.length;
		const before = value.text[at - 1];
		dismissed = null;
		typeText(
			`${before && !/\s/.test(before) ? ' ' : ''}${SYMBOL[kind]}`,
			at,
			inField ? area.selectionEnd : at
		);
	}

	export function clear() {
		commit(EMPTY_VALUE);
		caret = 0;
	}

	/* Autosize: the backdrop mirrors the text, so its height is the content height. The field springs to it within the row limits. */
	const fieldHeight = motionValue<number | string>('auto');
	$effect(() => styleEffect(field, { height: fieldHeight }));

	$effect(() => {
		const style = getComputedStyle(backdrop);
		const line = parseFloat(style.lineHeight) || FALLBACK_LINE_PX;
		const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		limits = { min: line * minRows + pad, max: line * Math.max(minRows, maxRows) + pad };
	});

	$effect(() => {
		const { min, max } = limits;
		if (!min) return;
		const fit = () => {
			const target = Math.min(max, Math.max(min, backdrop.offsetHeight));
			const current = fieldHeight.get();
			if (isReducedMotion() || typeof current !== 'number') {
				fieldHeight.jump(target);
				return;
			}
			if (Math.abs(current - target) > HEIGHT_EPSILON) animate(fieldHeight, target, GROW);
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(backdrop);
		return () => observer.disconnect();
	});

	/* The popover hangs from the trigger character, measured from a marker in the mirrored text. */
	function measureAnchor() {
		const marker = backdrop.querySelector<HTMLElement>('[data-anchor]');
		if (!marker) {
			anchor = null;
			return;
		}
		const line =
			parseFloat(getComputedStyle(marker.parentElement ?? marker).lineHeight) || FALLBACK_LINE_PX;
		const x = Math.max(
			0,
			Math.min(
				field.offsetLeft + marker.offsetLeft - POPOVER_INSET_PX,
				root.offsetWidth - POPOVER_WIDTH
			)
		);
		const top = field.offsetTop + marker.offsetTop - area.scrollTop;
		const box = root.getBoundingClientRect();
		const roomBelow = window.innerHeight - (box.top + top + line);
		const above =
			placement === 'top' ||
			(placement === 'auto' && roomBelow < FLIP_ROOM_PX && box.top + top > roomBelow);
		const y = above ? top - POPOVER_GAP_PX : top + line + POPOVER_GAP_PX;
		const same =
			anchor && anchor.x === x && anchor.y === y && anchor.above === above && anchor.line === line;
		if (!same) anchor = { x, y, line, above };
	}

	$effect(() => {
		void triggerStart;
		void mirror;
		if (open) measureAnchor();
	});

	function onscroll() {
		backdrop.style.transform = `translateY(${-area.scrollTop}px)`;
		measureAnchor();
	}
</script>

<div bind:this={root} class={['root', className]} data-disabled={disabled || undefined} {...rest}>
	<div bind:this={field} class="field" data-focused={focused || undefined}>
		<div bind:this={backdrop} class="backdrop" aria-hidden="true">{@html mirror + '​'}</div>
		<textarea
			bind:this={area}
			{id}
			{name}
			class="textarea"
			value={value.text}
			{placeholder}
			{disabled}
			rows={minRows}
			spellcheck="true"
			role="combobox"
			aria-label={ariaLabel}
			aria-describedby={describedBy}
			aria-autocomplete="list"
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls={open ? listId : undefined}
			aria-activedescendant={open && suggestions.length ? optionId(activeIndex) : undefined}
			{oninput}
			onselect={snapSelection}
			{onkeydown}
			{onscroll}
			onfocus={() => (focused = true)}
			onblur={() => {
				focused = false;
				caret = null;
			}}></textarea>
	</div>
	<span class="sr-only" aria-live="polite">{countLabel}</span>
	{#if open && anchor && trigger}
		{#key triggerStart}
			<MentionSuggestions
				{trigger}
				{anchor}
				{suggestions}
				{activeIndex}
				{listId}
				{optionId}
				onchoose={choose}
				onactivate={(index) => (active = index)}
			/>
		{/key}
	{/if}
</div>

<style>
	.root {
		position: relative;
		width: 100%;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}
	.root[data-disabled] {
		opacity: 0.55;
	}

	/* The field's height springs to its text. The mirror and the textarea share every metric so tokens sit exactly under their characters. */
	.field {
		position: relative;
		box-sizing: content-box;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.field[data-focused] {
		border-color: var(--arc-border-strong);
	}

	.backdrop,
	.textarea {
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		padding: 11px 14px;
		border: 0;
		font: inherit;
		font-size: var(--arc-text-base);
		letter-spacing: var(--arc-tracking-body);
		line-height: 24px;
		overflow-wrap: break-word;
		white-space: pre-wrap;
		word-break: break-word;
		tab-size: 4;
	}

	.backdrop {
		position: absolute;
		top: 0;
		left: 0;
		color: var(--arc-foreground);
		pointer-events: none;
		will-change: transform;
	}

	.textarea {
		position: absolute;
		inset: 0;
		height: 100%;
		display: block;
		resize: none;
		overflow-y: auto;
		background: transparent;
		color: transparent;
		caret-color: var(--arc-foreground);
		outline: none;
		scrollbar-width: none;
		-webkit-text-fill-color: transparent;
	}
	.textarea::-webkit-scrollbar {
		display: none;
	}
	.textarea::placeholder {
		color: var(--arc-text-muted);
		-webkit-text-fill-color: var(--arc-text-muted);
		opacity: 1;
	}
	.textarea::selection {
		background: color-mix(in oklch, var(--arc-accent) 24%, transparent);
	}
	.textarea:disabled {
		cursor: not-allowed;
	}

	/* A token is tinted around its own glyphs; the negative margin keeps every character where the textarea put it. */
	.backdrop :global(.token) {
		margin: 0 -3px;
		padding: 1px 3px;
		border-radius: 6px;
		background: var(--arc-accent-subtle);
		color: var(--arc-accent-strong);
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
	.backdrop :global(.token[data-kind='channel']) {
		background: color-mix(in oklch, var(--arc-foreground) 7%, transparent);
		color: var(--arc-foreground);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
