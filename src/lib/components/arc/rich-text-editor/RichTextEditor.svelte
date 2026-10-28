<script module lang="ts">
	import type { HistoryState } from './history';

	export type RichTextValue = { html: string; markdown: string; text: string; empty: boolean };

	/** Methods on the component instance (`bind:this`). */
	export type RichTextEditorHandle = {
		focus: () => void;
		getHTML: () => string;
		getMarkdown: () => string;
		getText: () => string;
		setHTML: (html: string) => void;
		setMarkdown: (markdown: string) => void;
		clear: () => void;
		undo: () => void;
		redo: () => void;
	};

	export type { HistoryState };
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import {
		EMPTY_DOCUMENT,
		TEXT_BLOCK_SELECTOR,
		blockAt,
		cleanClone,
		clipBand,
		elementOf,
		ensureFilled,
		placeCaret,
		plainOutput,
		readOffsets,
		selectContents,
		selectRange,
		tidy,
		visibleText,
		writeOffsets
	} from './dom';
	import { indent, outdent } from './blocks';
	import {
		applyBlock,
		applyMarkdownShortcut,
		backspaceAtStart,
		enterKey,
		insertCodeIndent,
		linkAt,
		paste,
		removeLink,
		setLink,
		toggleInlineCode,
		typeIntoEmptyEditor
	} from './editing';
	import { EditHistory, type EditKind, type Snapshot } from './history';
	import { htmlToMarkdown, markdownToHtml, normalizeUrl, sanitizeHtml } from './markdown';
	import { filterSlashItems, slashAtCaret, slashQuery, type Slash, type SlashItem } from './slash';
	import EditorToolbar, {
		type Formats,
		type Mark,
		type ToolbarAnchor,
		type ToolbarBlock,
		type ToolbarFaceName
	} from './EditorToolbar.svelte';
	import SlashMenu from './SlashMenu.svelte';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onchange'> & {
		/** Controlled HTML. The editor only rewrites its content when this differs from what it last emitted. */
		value?: string;
		defaultValue?: string;
		/** Initial content as Markdown, used when no HTML value is given. */
		defaultMarkdown?: string;
		onChange?: (value: RichTextValue) => void;
		/** Reports whether undo and redo are available, for your own toolbar. */
		onHistoryChange?: (state: HistoryState) => void;
		placeholder?: string;
		/** The hint on an empty line while typing. */
		blockHint?: string;
		readOnly?: boolean;
		autoFocus?: boolean;
		/** The contentEditable element. */
		element?: HTMLDivElement | null;
	};

	let {
		value = $bindable(),
		defaultValue,
		defaultMarkdown,
		onChange,
		onHistoryChange,
		placeholder = 'Start writing',
		blockHint = 'Type / for blocks',
		readOnly = false,
		autoFocus = false,
		'aria-label': ariaLabel = 'Editor',
		element = $bindable(null),
		class: className,
		...rest
	}: Props = $props();

	/** A selection this close to the top of the visible band opens the toolbar below it. */
	const TOOLBAR_FLIP_PX = 60;
	const TOOLBAR_GAP_PX = 8;
	const NO_FORMATS: Formats = {
		bold: false,
		italic: false,
		strike: false,
		code: false,
		link: null,
		block: 'p'
	};

	const uid = $props.id();
	let root = $state() as HTMLDivElement;
	let editor: HTMLDivElement;
	let busy = false;
	let dragging = false;
	let lastInput = '';
	let lastEmitted: string | null = null;
	let savedRange: Range | null = null;
	let hinted: HTMLElement | null = null;
	const history = new EditHistory();

	let empty = $state(true);
	let formats = $state.raw<Formats>(NO_FORMATS);
	let bar = $state.raw<ToolbarAnchor | null>(null);
	let face = $state<ToolbarFaceName>('format');
	let linkDraft = $state('');
	let linkInput = $state<HTMLInputElement | null>(null);
	let slash = $state.raw<Slash | null>(null);
	let slashActive = $state(0);
	let announce = $state('');

	const slashResults = $derived(filterSlashItems(slash?.query ?? ''));
	const slashIndex = $derived(Math.min(slashActive, Math.max(0, slashResults.length - 1)));
	const slashOpen = $derived(!!slash && slashResults.length > 0);
	const toolbarOpen = $derived(!!bar && !readOnly);
	const optionId = (index: number) => `${uid}-slash-${index}`;

	/* Output and history. */
	function emit() {
		const clone = cleanClone(editor);
		const html = clone.innerHTML;
		const text = plainOutput(clone);
		const isEmpty = !text && !clone.querySelector('hr');
		lastEmitted = html;
		value = html;
		empty = isEmpty;
		onChange?.({ html, markdown: htmlToMarkdown(clone), text, empty: isEmpty });
	}

	const reportHistory = () => onHistoryChange?.(history.state);

	function record(kind: EditKind, boundary = false) {
		const html = editor.innerHTML.replace(/ data-hint=""/g, '');
		const snap: Snapshot = { html, selection: readOffsets(editor), kind, at: Date.now() };
		if (history.push(snap, boundary)) reportHistory();
	}

	function restore(snap: Snapshot) {
		editor.innerHTML = snap.html;
		hinted = null;
		editor.focus({ preventScroll: true });
		writeOffsets(editor, snap.selection);
		emit();
		reportHistory();
	}

	export function undo() {
		const snap = history.back();
		if (!snap) return;
		slash = null;
		restore(snap);
		announce = 'Undone';
	}

	export function redo() {
		const snap = history.forward();
		if (!snap) return;
		slash = null;
		restore(snap);
		announce = 'Redone';
	}

	/* Selection driven chrome: block hint, active formats, the slash query, and the toolbar. */
	function markHint(range: Range | null, block: HTMLElement | null) {
		const hint =
			range?.collapsed && block && !visibleText(block) && block.nodeName !== 'PRE' ? block : null;
		if (hinted === hint) return;
		hinted?.removeAttribute('data-hint');
		hint?.setAttribute('data-hint', '');
		hinted = hint;
	}

	function readFormats(range: Range, block: HTMLElement | null): Formats {
		const start = elementOf(range.startContainer);
		const within = (selector: string) => {
			const found = start?.closest(selector);
			return !!found && editor.contains(found);
		};
		const anchor = start?.closest('a');
		const listType =
			block?.nodeName === 'LI' ? (block.parentElement?.nodeName.toLowerCase() ?? 'ul') : null;
		return {
			bold: within('strong, b'),
			italic: within('em, i'),
			strike: within('s, strike, del'),
			code: within('code') && !within('pre'),
			link: anchor && editor.contains(anchor) ? anchor.getAttribute('href') : null,
			block: listType ?? block?.nodeName.toLowerCase() ?? 'p'
		};
	}

	const sameFormats = (a: Formats, b: Formats) =>
		(Object.keys(a) as (keyof Formats)[]).every((key) => a[key] === b[key]);

	function followSlashQuery(range: Range) {
		if (!slash) return;
		const query = slashQuery(slash, range);
		if (query === null) slash = null;
		else if (query !== slash.query) slash = { ...slash, query };
	}

	function toolbarAnchor(range: Range): ToolbarAnchor {
		const rects = range.getClientRects();
		const rect = rects.length ? rects[0] : range.getBoundingClientRect();
		const whole = range.getBoundingClientRect();
		const box = root.getBoundingClientRect();
		const below = rect.top - clipBand(root).top < TOOLBAR_FLIP_PX;
		return {
			x: whole.left + whole.width / 2 - box.left,
			y: below ? whole.bottom - box.top + TOOLBAR_GAP_PX : rect.top - box.top - TOOLBAR_GAP_PX,
			below
		};
	}

	function hideToolbar() {
		if (face !== 'link') bar = null;
	}

	function sync() {
		if (busy) return;
		const selection = window.getSelection();
		const inside = !!selection?.rangeCount && editor.contains(selection.anchorNode);
		const range = inside ? selection!.getRangeAt(0) : null;
		const block = range ? blockAt(editor, range.startContainer) : null;
		markHint(range, block);
		if (!range) {
			hideToolbar();
			slash = null;
			return;
		}
		const next = readFormats(range, block);
		if (!sameFormats(formats, next)) formats = next;
		followSlashQuery(range);
		const inCode = !!elementOf(range.startContainer)?.closest('pre');
		if (range.collapsed || dragging || inCode || slash || readOnly) {
			hideToolbar();
			return;
		}
		bar = toolbarAnchor(range);
	}

	function run(change: () => void) {
		busy = true;
		try {
			change();
			tidy(editor);
		} finally {
			busy = false;
		}
		record('command');
		emit();
		sync();
	}

	/* Content in and out. */
	function load(html: string) {
		editor.innerHTML = sanitizeHtml(html) || EMPTY_DOCUMENT;
		editor.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR).forEach(ensureFilled);
		hinted = null;
	}

	function replaceContent(html: string) {
		load(html);
		record('command');
		emit();
	}

	onMount(() => {
		const markdown =
			defaultMarkdown !== undefined ? markdownToHtml(defaultMarkdown) : EMPTY_DOCUMENT;
		load(value ?? defaultValue ?? markdown);
		history.reset({ html: editor.innerHTML, selection: null, kind: 'command', at: 0 });
		emit();
		reportHistory();
		if (autoFocus) {
			editor.focus();
			writeOffsets(editor, null);
		}
	});

	$effect(() => {
		if (value === undefined || value === lastEmitted) return;
		replaceContent(value);
	});

	/* The slash menu. */
	function openSlashIfTyped(data: string | null) {
		if (data !== '/') return;
		const next = slashAtCaret(root);
		if (!next) return;
		slash = next;
		slashActive = 0;
		bar = null;
	}

	function chooseSlash(item: SlashItem | undefined) {
		const open = slash;
		if (!item || !open) return;
		const selection = window.getSelection();
		const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		const caret =
			range && range.startContainer === open.node
				? range.startOffset
				: open.offset + 1 + open.query.length;
		slash = null;
		run(() => {
			open.node.deleteData(open.offset, Math.max(1, caret - open.offset));
			const block = blockAt(editor, open.node);
			placeCaret(open.node, open.offset);
			if (!block) return;
			ensureFilled(block);
			applyBlock(editor, item.type, block);
		});
		announce = `${item.label} added`;
	}

	/* Inline marks and links. */
	function toggleMark(mark: Mark) {
		run(() => {
			if (!window.getSelection()?.rangeCount) return;
			if (mark === 'code') {
				toggleInlineCode(editor);
				return;
			}
			document.execCommand('styleWithCSS', false, 'false');
			document.execCommand(mark === 'strike' ? 'strikeThrough' : mark);
		});
	}

	function applyToolbarBlock(type: ToolbarBlock) {
		run(() => applyBlock(editor, type));
	}

	function openLink() {
		const selection = window.getSelection();
		if (!selection?.rangeCount) return;
		let range = selection.getRangeAt(0);
		const existing = linkAt(editor, range);
		if (existing) {
			selectContents(existing);
			range = selection.getRangeAt(0);
		}
		if (range.collapsed) return;
		savedRange = range.cloneRange();
		linkDraft = existing?.getAttribute('href') ?? '';
		face = 'link';
		sync();
		requestAnimationFrame(() => linkInput?.focus({ preventScroll: true }));
	}

	function closeLink() {
		face = 'format';
		const range = savedRange;
		savedRange = null;
		if (range) {
			editor.focus({ preventScroll: true });
			selectRange(range);
		}
		sync();
	}

	function applyLink(remove = false) {
		const range = savedRange;
		const url = normalizeUrl(linkDraft);
		if (!range) {
			closeLink();
			return;
		}
		editor.focus({ preventScroll: true });
		selectRange(range);
		const unlinking = remove || !url;
		run(() => (unlinking ? removeLink(editor, range) : setLink(editor, range, url)));
		savedRange = null;
		face = 'format';
		bar = null;
		announce = unlinking ? 'Link removed' : 'Link added';
	}

	function returnToText() {
		editor.focus();
		sync();
	}

	/* Keyboard. Enter, Backspace at a block edge, and history go through beforeinput so mobile keyboards behave the same. */
	function deleteBackward(event: InputEvent) {
		const selection = window.getSelection();
		if (!selection?.rangeCount || !selection.getRangeAt(0).collapsed) return;
		busy = true;
		let handled = false;
		try {
			handled = backspaceAtStart(editor);
		} finally {
			busy = false;
		}
		if (!handled) return;
		event.preventDefault();
		tidy(editor);
		record('command');
		emit();
		sync();
	}

	function typeIntoEmpty(event: InputEvent) {
		const selection = window.getSelection();
		const hasBlocks = !!editor.querySelector(TEXT_BLOCK_SELECTOR);
		if (!selection?.rangeCount || blockAt(editor, selection.anchorNode) || hasBlocks) return;
		event.preventDefault();
		typeIntoEmptyEditor(editor, event.data ?? '');
		record('type');
		emit();
		sync();
	}

	function onbeforeinput(event: InputEvent) {
		if (readOnly) return;
		switch (event.inputType) {
			case 'historyUndo':
				event.preventDefault();
				undo();
				return;
			case 'historyRedo':
				event.preventDefault();
				redo();
				return;
			case 'insertParagraph':
			case 'insertLineBreak':
				event.preventDefault();
				if (slash) return;
				run(() => enterKey(editor, event.inputType === 'insertLineBreak'));
				return;
			case 'deleteContentBackward':
				deleteBackward(event);
				return;
			case 'insertText':
				typeIntoEmpty(event);
				return;
			case 'insertFromDrop':
			case 'formatUnderline':
				event.preventDefault();
		}
	}

	function oninput(event: Event) {
		if (busy) return;
		const native = event as InputEvent;
		if (native.isComposing) return;
		busy = true;
		let converted = false;
		try {
			tidy(editor);
			if (native.inputType === 'insertText') converted = applyMarkdownShortcut(editor, native.data);
		} finally {
			busy = false;
		}
		if (converted) {
			tidy(editor);
			record('command');
			announce = 'Formatted';
		} else record('type', native.data === ' ' || native.inputType !== lastInput);
		lastInput = native.inputType;
		emit();
		if (!converted && native.inputType === 'insertText') openSlashIfTyped(native.data);
		sync();
	}

	const focusToolbar = () =>
		root.querySelector<HTMLElement>(`[data-toolbar="${uid}"] button`)?.focus();

	function slashKey(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			slashActive = (slashIndex + step + slashResults.length) % slashResults.length;
			return true;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			chooseSlash(slashResults[slashIndex]);
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			slash = null;
			return true;
		}
		return false;
	}

	/** Shortcuts with Cmd or Ctrl. Underline is swallowed: the editor has no underline mark. */
	function shortcutKey(event: KeyboardEvent) {
		const key = event.key.toLowerCase();
		const shift = event.shiftKey;
		const actions: [boolean, () => void][] = [
			[key === 'z', () => (shift ? redo() : undo())],
			[key === 'y', redo],
			[!shift && key === 'b', () => toggleMark('bold')],
			[!shift && key === 'i', () => toggleMark('italic')],
			[shift && key === 'x', () => toggleMark('strike')],
			[key === 'e', () => toggleMark('code')],
			[key === 'k', openLink],
			[key === 'u', () => {}]
		];
		const action = actions.find(([matches]) => matches)?.[1];
		if (!action) return false;
		event.preventDefault();
		action();
		return true;
	}

	function tabKey(event: KeyboardEvent) {
		const selection = window.getSelection();
		const block = selection?.rangeCount ? blockAt(editor, selection.anchorNode) : null;
		if (block?.nodeName === 'LI') {
			event.preventDefault();
			run(() => {
				const offsets = readOffsets(editor);
				if (event.shiftKey) outdent(block);
				else indent(block);
				writeOffsets(editor, offsets);
			});
		} else if (block?.nodeName === 'PRE' && !event.shiftKey) {
			event.preventDefault();
			run(() => insertCodeIndent(block));
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (readOnly) return;
		if (slashOpen && slashKey(event)) return;
		if ((event.metaKey || event.ctrlKey) && shortcutKey(event)) return;
		if (event.altKey && event.key === 'F10' && bar) {
			event.preventDefault();
			focusToolbar();
			return;
		}
		if (event.key === 'Tab') tabKey(event);
	}

	function onpaste(event: ClipboardEvent) {
		if (readOnly) return;
		event.preventDefault();
		const html = event.clipboardData?.getData('text/html') ?? '';
		const text = event.clipboardData?.getData('text/plain') ?? '';
		run(() => paste(editor, html, text));
	}

	/* Selection events. */
	$effect(() => {
		let frame = 0;
		const schedule = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(sync);
		};
		const release = () => {
			if (!dragging) return;
			dragging = false;
			schedule();
		};
		document.addEventListener('selectionchange', schedule);
		document.addEventListener('pointerup', release);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener('selectionchange', schedule);
			document.removeEventListener('pointerup', release);
		};
	});

	/* A press outside the toolbar drops the link field without applying it. */
	$effect(() => {
		if (face !== 'link') return;
		const dismiss = (event: PointerEvent) => {
			if (root.querySelector(`[data-toolbar="${uid}"]`)?.contains(event.target as Node)) return;
			savedRange = null;
			face = 'format';
			bar = null;
		};
		document.addEventListener('pointerdown', dismiss);
		return () => document.removeEventListener('pointerdown', dismiss);
	});

	export function focus() {
		editor.focus();
	}
	export const getHTML = () => cleanClone(editor).innerHTML;
	export const getMarkdown = () => htmlToMarkdown(cleanClone(editor));
	export const getText = () => plainOutput(cleanClone(editor));
	export const setHTML = (html: string) => replaceContent(html);
	export const setMarkdown = (markdown: string) => replaceContent(markdownToHtml(markdown));
	export const clear = () => replaceContent(EMPTY_DOCUMENT);

	$effect(() => {
		element = editor;
	});
</script>

<div bind:this={root} class={['root', className]} {...rest}>
	<!-- contentEditable is focusable on its own; a tabindex would keep read-only text in the tab order. -->
	<!-- svelte-ignore a11y_interactive_supports_focus, a11y_aria_activedescendant_has_tabindex -->
	<div
		bind:this={editor}
		class="editor"
		style:--rich-text-editor-placeholder={JSON.stringify(placeholder)}
		style:--rich-text-editor-hint={JSON.stringify(blockHint)}
		contenteditable={readOnly ? 'false' : 'true'}
		role="textbox"
		aria-multiline="true"
		aria-label={ariaLabel}
		aria-readonly={readOnly || undefined}
		aria-controls={slashOpen ? `${uid}-slash` : undefined}
		aria-activedescendant={slashOpen ? optionId(slashIndex) : undefined}
		data-empty={empty || undefined}
		spellcheck="true"
		{onbeforeinput}
		{oninput}
		{onkeydown}
		{onpaste}
		ondrop={(event) => event.preventDefault()}
		onpointerdown={() => (dragging = true)}
		oncompositionend={() => {
			record('type', true);
			emit();
		}}
	></div>
	<span class="sr-only" aria-live="polite">{announce}</span>

	{#if toolbarOpen && bar}
		<EditorToolbar
			id={uid}
			anchor={bar}
			{face}
			{formats}
			container={root}
			bind:linkDraft
			bind:linkInput
			onmark={toggleMark}
			onblock={applyToolbarBlock}
			onopenlink={openLink}
			onapplylink={applyLink}
			oncloselink={closeLink}
			onreturn={returnToText}
		/>
	{/if}

	{#if slashOpen && slash}
		{#key `${slash.offset}-${slash.y}`}
			<SlashMenu
				{slash}
				items={slashResults}
				activeIndex={slashIndex}
				listId="{uid}-slash"
				{optionId}
				onchoose={chooseSlash}
				onactivate={(index) => (slashActive = index)}
			/>
		{/key}
	{/if}
</div>

<style>
	.root {
		position: relative;
		width: 100%;
		container-type: inline-size;
		color: var(--arc-foreground);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
	}

	/* The writing surface. Everything inside is plain semantic HTML, styled here so pasted and typed content look the same. */
	.editor {
		min-height: 8rem;
		padding: 2px 0;
		outline: none;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		line-height: 1.65;
		overflow-wrap: break-word;
		white-space: pre-wrap;
		word-break: break-word;
		caret-color: var(--arc-accent);
	}
	.editor[contenteditable='false'] {
		caret-color: transparent;
	}
	.editor::selection,
	.editor :global(*::selection) {
		background: color-mix(in oklch, var(--arc-accent) 22%, transparent);
	}

	.editor > :global(*) {
		margin: 0;
	}
	.editor > :global(* + *) {
		margin-top: 0.6em;
	}
	.editor :global(p) {
		margin: 0;
	}
	.editor :global(:is(h1, h2, h3)) {
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.25;
	}
	.editor :global(h1) {
		font-size: var(--arc-text-2xl);
	}
	.editor :global(h2) {
		font-size: var(--arc-text-xl);
	}
	.editor :global(h3) {
		font-size: var(--arc-text-lg);
	}
	.editor > :global(:is(h1, h2, h3)) {
		margin-top: 1.1em;
	}
	.editor > :global(:is(h1, h2, h3):first-child) {
		margin-top: 0;
	}
	.editor > :global(:is(h1, h2, h3) + *) {
		margin-top: 0.45em;
	}

	.editor :global(strong) {
		font-weight: 600;
	}
	.editor :global(s) {
		color: var(--arc-text-secondary);
		text-decoration-thickness: 1px;
	}
	.editor :global(a) {
		color: var(--arc-accent-strong);
		text-decoration: underline;
		text-decoration-color: color-mix(in oklch, var(--arc-accent) 45%, transparent);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
		cursor: text;
	}
	.editor :global(code) {
		padding: 0.12em 0.38em;
		border-radius: 6px;
		background: var(--arc-surface-muted);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 0.86em;
	}

	.editor :global(blockquote) {
		padding-left: 14px;
		border-left: 2px solid var(--arc-border-strong);
		color: var(--arc-text-secondary);
	}

	.editor :global(:is(ul, ol)) {
		margin-block: 0;
		padding-left: 1.45em;
	}
	.editor :global(ul) {
		list-style: disc;
	}
	.editor :global(ol) {
		list-style: decimal;
	}
	.editor :global(li) {
		padding-left: 0.2em;
	}
	.editor :global(li + li) {
		margin-top: 0.2em;
	}
	.editor :global(li > :is(ul, ol)) {
		margin-top: 0.2em;
	}
	.editor :global(li::marker) {
		color: var(--arc-text-muted);
	}
	.editor :global(ol > li::marker) {
		font-variant-numeric: tabular-nums;
	}

	.editor :global(pre) {
		padding: 12px 14px;
		overflow-x: auto;
		border: 1px solid var(--arc-border-subtle);
		border-radius: 14px;
		background: var(--arc-surface-muted);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: 13px;
		line-height: 1.6;
		tab-size: 2;
		white-space: pre;
	}

	.editor :global(hr) {
		height: 1px;
		margin-block: 1.1em;
		border: 0;
		background: var(--arc-border);
	}

	/* Placeholders: the whole document when empty, and a quiet hint on the empty line holding the caret. */
	.editor[data-empty] > :global(:first-child::before),
	.editor:focus :global([data-hint]::before) {
		float: left;
		height: 0;
		color: var(--arc-text-muted);
		pointer-events: none;
		content: var(--rich-text-editor-placeholder);
	}
	.editor:focus:not([data-empty]) :global([data-hint]::before) {
		content: var(--rich-text-editor-hint);
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
