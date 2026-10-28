/* Editing commands that rewrite the document at the current selection. */

import { convertBlock, emptyParagraph, outdent, paragraphAfter, blockTypeOf } from './blocks';
import type { BlockType, TextBlockType } from './blocks';
import {
	TEXT_BLOCK_SELECTOR,
	ZWSP,
	atBlockStart,
	blockAt,
	elementOf,
	ensureFilled,
	insertAfter,
	isElement,
	isText,
	parseHtml,
	placeAfter,
	placeAtStart,
	placeCaret,
	rangeToBlockEnd,
	readOffsets,
	replaceNode,
	selectContents,
	selectRange,
	textBefore,
	visibleText,
	writeOffsets
} from './dom';
import { markdownToHtml, sanitizeHtml } from './markdown';

const BLOCK_SHORTCUTS: [RegExp, TextBlockType][] = [
	[/^# $/, 'h1'],
	[/^## $/, 'h2'],
	[/^### $/, 'h3'],
	[/^[-*+] $/, 'ul'],
	[/^\d+[.)] $/, 'ol'],
	[/^> $/, 'blockquote']
];

type InlineShortcut = { pattern: RegExp; tag: string; whole: number; inner: number };
const INLINE_SHORTCUTS: InlineShortcut[] = [
	{ pattern: /(\*\*|__)([^*_\s](?:[^*_]*[^*_\s])?)\1$/, tag: 'strong', whole: 0, inner: 2 },
	{ pattern: /~~([^~\s](?:[^~]*[^~\s])?)~~$/, tag: 's', whole: 0, inner: 1 },
	{ pattern: /`([^`]+)`$/, tag: 'code', whole: 0, inner: 1 },
	{ pattern: /(?:^|[^*\w])(\*([^*\s](?:[^*]*[^*\s])?)\*)$/, tag: 'em', whole: 1, inner: 2 },
	{ pattern: /(?:^|[^_\w])(_([^_\s](?:[^_]*[^_\s])?)_)$/, tag: 'em', whole: 1, inner: 2 }
];

const MARKDOWNISH = /(^|\n)\s*(#{1,3}\s|[-*+]\s|\d+[.)]\s|>|```)|\*\*|`[^`]+`|\[[^\]]+\]\(/;
const CODE_INDENT = '  ';

function collapsedRange() {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	const range = selection.getRangeAt(0);
	return range.collapsed ? range : null;
}

function currentRange() {
	const selection = window.getSelection();
	return selection?.rangeCount ? selection.getRangeAt(0) : null;
}

function applyBlockShortcut(block: HTMLElement, range: Range, before: string) {
	const match = BLOCK_SHORTCUTS.find(([pattern]) => pattern.test(before));
	if (!match) return false;
	const prefix = document.createRange();
	prefix.setStart(block, 0);
	prefix.setEnd(range.startContainer, range.startOffset);
	prefix.deleteContents();
	placeAtStart(convertBlock(block, match[1]));
	return true;
}

function applyInlineShortcut(range: Range) {
	const node = range.startContainer;
	if (!isText(node) || node.parentElement?.closest('code')) return false;
	const text = node.data.slice(0, range.startOffset);
	for (const { pattern, tag, whole, inner } of INLINE_SHORTCUTS) {
		const match = pattern.exec(text);
		if (!match) continue;
		const from = range.startOffset - match[whole].length;
		node.splitText(range.startOffset);
		const middle = node.splitText(from);
		const element = document.createElement(tag);
		element.textContent = match[inner];
		replaceNode(middle, element);
		// A zero width space after the mark keeps the next keystroke outside it; output strips it.
		const exit = document.createTextNode('​');
		insertAfter(element, exit);
		placeCaret(exit, 1);
		return true;
	}
	return false;
}

/** Markdown shortcuts, applied right after the character that completes them. */
export function applyMarkdownShortcut(editor: HTMLElement, data: string | null) {
	const range = collapsedRange();
	if (!data || !range) return false;
	const block = blockAt(editor, range.startContainer);
	if (!block || block.nodeName === 'PRE') return false;
	const before = textBefore(block, range);
	const topLevelParagraph =
		(block.nodeName === 'P' || block.nodeName === 'DIV') && block.parentElement === editor;

	if (data === ' ' && topLevelParagraph && applyBlockShortcut(block, range, before)) return true;
	if (data === '-' && topLevelParagraph && before === '---' && visibleText(block) === '---') {
		const rule = document.createElement('hr');
		replaceNode(block, rule);
		placeAtStart(paragraphAfter(rule));
		return true;
	}
	if (data === '`' && topLevelParagraph && before === '```' && visibleText(block) === '```') {
		block.textContent = '';
		placeAtStart(convertBlock(block, 'pre'));
		return true;
	}
	return applyInlineShortcut(range);
}

/** Inserts a divider after the block, or in place of an empty one, and moves the caret below it. */
function insertRule(block: HTMLElement) {
	const top = block.nodeName === 'LI' ? block.closest('ul, ol')! : block;
	const rule = document.createElement('hr');
	if (!visibleText(block) && block.nodeName !== 'LI') replaceNode(block, rule);
	else insertAfter(top, rule);
	placeAtStart(paragraphAfter(rule));
}

function selectedBlocks(editor: HTMLElement, range: Range) {
	return Array.from(editor.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR)).filter(
		(candidate) => range.intersectsNode(candidate) && !candidate.querySelector('p, li')
	);
}

export function applyBlock(editor: HTMLElement, type: BlockType, target?: HTMLElement | null) {
	const range = currentRange();
	if (!range) return;
	const offsets = readOffsets(editor);
	const block = target ?? blockAt(editor, range.startContainer);
	if (!block) return;
	if (type === 'hr') {
		insertRule(block);
		return;
	}
	// Several selected blocks turn together; if every one already has the type, they all turn back into paragraphs.
	const blocks = range.collapsed ? [block] : selectedBlocks(editor, range);
	const allSame = blocks.every((candidate) => blockTypeOf(candidate) === type);
	blocks.forEach((candidate) => {
		if (allSame || blockTypeOf(candidate) !== type) convertBlock(candidate, type);
	});
	writeOffsets(editor, offsets);
	if (type === 'pre') {
		const pre = blockAt(editor, window.getSelection()?.anchorNode ?? null);
		if (pre && !pre.nextElementSibling) paragraphAfter(pre);
	}
}

function enterInCode(block: HTMLElement, range: Range, soft: boolean) {
	const full = block.textContent ?? '';
	const caret = textBefore(block, range).length;
	const head = full.slice(0, caret);
	const tail = full.slice(caret);
	const exitsCode = !tail.replace(/\n$/, '') && head.endsWith('\n') && !soft;
	if (exitsCode) {
		block.textContent = head.slice(0, -1) || '';
		ensureFilled(block);
		const paragraph = emptyParagraph();
		insertAfter(block, paragraph);
		placeAtStart(paragraph);
		return;
	}
	block.textContent = head + '\n' + (tail || '\n');
	placeCaret(block.firstChild!, caret + 1);
}

function insertLineBreak(range: Range) {
	const br = document.createElement('br');
	range.insertNode(br);
	const next = br.nextSibling;
	if (!next || (isText(next) && !next.data && !next.nextSibling))
		insertAfter(br, document.createElement('br'));
	placeAfter(br);
}

function splitBlock(block: HTMLElement, range: Range) {
	const tail = rangeToBlockEnd(block, range);
	const atEnd = !tail.toString().replace(ZWSP, '') && !tail.cloneContents().querySelector('ul, ol');
	const leavesHeading = /^H[1-3]$/.test(block.nodeName) && atEnd;
	const fragment = tail.extractContents();
	const next = document.createElement(leavesHeading ? 'p' : block.nodeName.toLowerCase());
	if (!leavesHeading) next.appendChild(fragment);
	if (leavesHeading) next.appendChild(document.createElement('br'));
	insertAfter(block, next);
	block.querySelectorAll(':scope > br:last-child').forEach((br) => {
		if (visibleText(block)) br.remove();
	});
	ensureFilled(block);
	ensureFilled(next);
	// Formatting open at the caret carries into the new line only when there is text to carry.
	if (!visibleText(next)) {
		next.querySelectorAll('strong, em, s, code, a').forEach((element) => {
			if (!visibleText(element)) element.remove();
		});
	}
	ensureFilled(next);
	placeAtStart(next);
}

export function enterKey(editor: HTMLElement, soft: boolean) {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return;
	let range = selection.getRangeAt(0);
	if (!range.collapsed) {
		range.deleteContents();
		range = selection.getRangeAt(0);
	}
	const block = blockAt(editor, range.startContainer);
	if (!block) return;
	if (block.nodeName === 'PRE') return enterInCode(block, range, soft);
	if (soft) return insertLineBreak(range);
	if (block.nodeName === 'LI' && !visibleText(block) && !block.querySelector('ul, ol')) {
		return placeAtStart(outdent(block));
	}
	if (block.nodeName === 'BLOCKQUOTE' && !visibleText(block))
		return placeAtStart(convertBlock(block, 'p'));
	splitBlock(block, range);
}

export function backspaceAtStart(editor: HTMLElement) {
	const range = currentRange();
	if (!range) return false;
	const block = blockAt(editor, range.startContainer);
	if (!block || !atBlockStart(block, range)) return false;
	if (/^(H[1-3]|BLOCKQUOTE|PRE)$/.test(block.nodeName)) {
		placeAtStart(convertBlock(block, 'p'));
		return true;
	}
	if (block.nodeName === 'LI') {
		placeAtStart(outdent(block));
		return true;
	}
	const previous = block.previousElementSibling;
	if (previous?.nodeName === 'HR') {
		previous.remove();
		return true;
	}
	if (!previous && !visibleText(block) && block.nextElementSibling) {
		const next = block.nextElementSibling as HTMLElement;
		block.remove();
		placeAtStart(next);
		return true;
	}
	return false;
}

/** Typing into an emptied editor lands in a paragraph, never loose at the root. */
export function typeIntoEmptyEditor(editor: HTMLElement, data: string) {
	const paragraph = document.createElement('p');
	const text = document.createTextNode(data);
	paragraph.appendChild(text);
	editor.replaceChildren(paragraph);
	placeCaret(text, text.length);
}

export function insertCodeIndent(block: HTMLElement) {
	const range = currentRange();
	if (!range) return;
	range.deleteContents();
	const spaces = document.createTextNode(CODE_INDENT);
	range.insertNode(spaces);
	placeCaret(spaces, CODE_INDENT.length);
	block.normalize();
}

/** Inline code toggles on its own: execCommand has no code mark. */
export function toggleInlineCode(editor: HTMLElement) {
	const range = currentRange();
	if (!range) return;
	const code = elementOf(range.startContainer)?.closest('code');
	if (code && editor.contains(code) && !code.closest('pre')) {
		const text = document.createTextNode(code.textContent ?? '');
		replaceNode(code, text);
		selectContents(text);
		return;
	}
	if (
		range.collapsed ||
		blockAt(editor, range.startContainer) !== blockAt(editor, range.endContainer)
	)
		return;
	const element = document.createElement('code');
	element.textContent = range.toString();
	range.deleteContents();
	range.insertNode(element);
	selectContents(element);
}

/** The link under the start of a range, if it sits inside the editor. */
export function linkAt(editor: HTMLElement, range: Range) {
	const anchor = elementOf(range.startContainer)?.closest('a');
	return anchor && editor.contains(anchor) ? anchor : null;
}

export function removeLink(editor: HTMLElement, range: Range) {
	const existing = linkAt(editor, range);
	if (existing) replaceNode(existing, ...Array.from(existing.childNodes));
	else document.execCommand('unlink');
}

export function setLink(editor: HTMLElement, range: Range, url: string) {
	const existing = linkAt(editor, range);
	if (existing && range.toString() === existing.textContent) {
		existing.setAttribute('href', url);
		return;
	}
	if (blockAt(editor, range.startContainer) !== blockAt(editor, range.endContainer)) {
		document.execCommand('createLink', false, url);
		return;
	}
	const contents = range.extractContents();
	contents
		.querySelectorAll('a')
		.forEach((anchor) => replaceNode(anchor, ...Array.from(anchor.childNodes)));
	const anchor = document.createElement('a');
	anchor.setAttribute('href', url);
	anchor.appendChild(contents);
	range.insertNode(anchor);
	placeAfter(anchor);
}

function pasteSource(html: string, text: string) {
	if (html) return sanitizeHtml(html);
	return MARKDOWNISH.test(text) || text.includes('\n\n') ? markdownToHtml(text) : '';
}

function pasteAsText(range: Range, block: HTMLElement | null, text: string) {
	const plain = block?.nodeName === 'PRE' ? text : text.replace(/\s*\n\s*/g, ' ');
	const node = document.createTextNode(plain);
	range.insertNode(node);
	placeCaret(node, node.length);
}

function pasteInline(range: Range, paragraph: Element) {
	const nodes = Array.from(paragraph.childNodes);
	const last = nodes[nodes.length - 1];
	const holder = document.createDocumentFragment();
	nodes.forEach((node) => holder.appendChild(node));
	range.insertNode(holder);
	if (last) placeAfter(last);
}

function pasteBlocks(range: Range, block: HTMLElement, fragment: HTMLElement) {
	const rest = document.createElement(block.nodeName === 'LI' ? 'p' : block.nodeName.toLowerCase());
	rest.appendChild(rangeToBlockEnd(block, range).extractContents());
	const top = block.nodeName === 'LI' ? block.closest('ul, ol')! : block;
	let anchor: Element = top;
	Array.from(fragment.childNodes).forEach((node) => {
		insertAfter(anchor, node);
		if (isElement(node)) anchor = node;
	});
	if (visibleText(rest) || rest.querySelector('br')) {
		insertAfter(anchor, rest);
		ensureFilled(rest);
	}
	if (!visibleText(block) && block.nodeName === 'P') block.remove();
	const end = document.createRange();
	end.selectNodeContents(anchor);
	end.collapse(false);
	selectRange(end);
}

export function paste(editor: HTMLElement, html: string, text: string) {
	const range = currentRange();
	if (!range) return;
	range.deleteContents();
	const block = blockAt(editor, range.startContainer);
	const source = pasteSource(html, text);
	const fragment = source ? parseHtml(source) : null;
	const single =
		!!fragment && fragment.children.length === 1 && fragment.firstElementChild!.nodeName === 'P';
	// Plain text, code blocks, and list items take the text as it is; everything else keeps its structure.
	if (!fragment || !block || block.nodeName === 'PRE' || (block.nodeName === 'LI' && !single)) {
		pasteAsText(range, block, text);
	} else if (single) pasteInline(range, fragment.firstElementChild!);
	else pasteBlocks(range, block, fragment);
}
