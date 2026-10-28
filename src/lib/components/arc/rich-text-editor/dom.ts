/*
 * DOM helpers. Positions are stored as character offsets where every block start and line break
 * counts as one character, so the caret survives any rewrite that keeps the text.
 */

export const ZWSP = /​/g;
export const EMPTY_DOCUMENT = '<p><br></p>';
export const BLOCK_TAGS = new Set([
	'P',
	'H1',
	'H2',
	'H3',
	'LI',
	'PRE',
	'BLOCKQUOTE',
	'DIV',
	'UL',
	'OL',
	'HR'
]);
export const TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, li, blockquote, pre';
const COUNTED = new Set(['P', 'H1', 'H2', 'H3', 'LI', 'PRE', 'BLOCKQUOTE', 'DIV']);

export type Offsets = { start: number; end: number };

export const isElement = (node: Node | null): node is HTMLElement =>
	!!node && node.nodeType === Node.ELEMENT_NODE;
export const isText = (node: Node | null): node is Text =>
	!!node && node.nodeType === Node.TEXT_NODE;
export const visibleText = (element: Node) => (element.textContent ?? '').replace(ZWSP, '');
export const elementOf = (node: Node) => (isElement(node) ? node : node.parentElement);

export function insertAfter(reference: Node, ...nodes: Node[]) {
	let at = reference;
	nodes.forEach((node) => {
		at.parentNode!.insertBefore(node, at.nextSibling);
		at = node;
	});
}

export function insertBefore(reference: Node, ...nodes: Node[]) {
	nodes.forEach((node) => reference.parentNode!.insertBefore(node, reference));
}

export function replaceNode(old: Node, ...nodes: Node[]) {
	insertBefore(old, ...nodes);
	old.parentNode!.removeChild(old);
}

export function appendNodes(parent: Node, ...nodes: Node[]) {
	nodes.forEach((node) => parent.appendChild(node));
}

export function moveChildren(from: Node, to: Node) {
	while (from.firstChild) to.appendChild(from.firstChild);
}

export function parseHtml(html: string) {
	const template = document.createElement('template');
	template.innerHTML = html;
	const root = document.createElement('div');
	root.appendChild(template.content);
	return root;
}

function pointToOffset(root: Node, container: Node, offset: number) {
	let count = 0;
	let found = -1;
	const visit = (node: Node) => {
		if (found >= 0) return;
		if (isText(node)) {
			if (node === container) found = count + offset;
			else count += node.data.length;
			return;
		}
		if (!isElement(node)) return;
		if (node !== root && COUNTED.has(node.nodeName)) count += 1;
		if (node.nodeName === 'BR' || node.nodeName === 'HR') count += 1;
		const children = node.childNodes;
		for (let index = 0; index < children.length; index++) {
			if (node === container && index === offset) {
				found = count;
				return;
			}
			visit(children[index]);
			if (found >= 0) return;
		}
		if (node === container) found = count;
	};
	visit(root);
	return found < 0 ? count : found;
}

function offsetToPoint(root: Node, target: number): [Node, number] {
	let count = 0;
	let result: [Node, number] | null = null;
	const visit = (node: Node) => {
		if (result) return;
		if (isText(node)) {
			if (target <= count + node.data.length) {
				result = [node, Math.max(0, target - count)];
				return;
			}
			count += node.data.length;
			return;
		}
		if (!isElement(node)) return;
		if (node !== root && COUNTED.has(node.nodeName)) count += 1;
		if (node.nodeName === 'BR' || node.nodeName === 'HR') {
			if (count === target && node.parentNode) {
				result = [node.parentNode, Array.prototype.indexOf.call(node.parentNode.childNodes, node)];
				return;
			}
			count += 1;
			return;
		}
		node.childNodes.forEach(visit);
		if (!result && count === target && node !== root && COUNTED.has(node.nodeName)) {
			result = [node, node.childNodes.length];
		}
	};
	visit(root);
	if (result) return result;
	const last = root.lastChild;
	return last && isElement(last) && last.nodeName !== 'HR'
		? [last, last.childNodes.length]
		: [root, root.childNodes.length];
}

export function readOffsets(root: HTMLElement): Offsets | null {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	return {
		start: pointToOffset(root, range.startContainer, range.startOffset),
		end: pointToOffset(root, range.endContainer, range.endOffset)
	};
}

export function writeOffsets(root: HTMLElement, offsets: Offsets | null) {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	if (!offsets) {
		range.selectNodeContents(root.lastElementChild ?? root);
		range.collapse(false);
	} else {
		const [startNode, startOffset] = offsetToPoint(root, offsets.start);
		const [endNode, endOffset] =
			offsets.end === offsets.start ? [startNode, startOffset] : offsetToPoint(root, offsets.end);
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
	}
	selectRange(range);
}

export function selectRange(range: Range) {
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

export function selectContents(node: Node) {
	const range = document.createRange();
	range.selectNodeContents(node);
	selectRange(range);
}

export function placeCaret(node: Node, offset: number) {
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	selectRange(range);
}

export function placeAfter(node: Node) {
	const range = document.createRange();
	range.setStartAfter(node);
	range.collapse(true);
	selectRange(range);
}

export function placeAtStart(element: HTMLElement) {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const first = walker.nextNode();
	if (first) placeCaret(first, 0);
	else placeCaret(element, 0);
}

/** The visible band of the nearest scrolling or clipping ancestor, so floating layers flip before they get cut off. */
export function clipBand(element: HTMLElement) {
	let top = 0;
	let bottom = window.innerHeight;
	for (let node = element.parentElement; node; node = node.parentElement) {
		const style = getComputedStyle(node);
		if (style.overflowY !== 'visible' || style.overflowX !== 'visible') {
			const rect = node.getBoundingClientRect();
			top = Math.max(top, rect.top);
			bottom = Math.min(bottom, rect.bottom);
		}
	}
	return { top, bottom };
}

/** The nearest block around a node: a paragraph, heading, list item, quote, or code block. */
export function blockAt(root: HTMLElement, node: Node | null): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== root) {
		if (isElement(current) && COUNTED.has(current.nodeName)) return current;
		current = current.parentNode;
	}
	return null;
}

export function ensureFilled(element: HTMLElement) {
	if (element.nodeName === 'HR') return;
	if (!visibleText(element) && !element.querySelector('br, hr, ul, ol')) {
		element.appendChild(document.createElement('br'));
	}
}

function rangeFromBlockStart(block: HTMLElement, range: Range) {
	const before = document.createRange();
	before.setStart(block, 0);
	before.setEnd(range.startContainer, range.startOffset);
	return before;
}

export function textBefore(block: HTMLElement, range: Range) {
	return rangeFromBlockStart(block, range).toString().replace(ZWSP, '').replace(/ /g, ' ');
}

export function atBlockStart(block: HTMLElement, range: Range) {
	if (!range.collapsed) return false;
	const before = rangeFromBlockStart(block, range);
	return !before.toString().replace(ZWSP, '') && !before.cloneContents().querySelector('br, hr');
}

/** The range from the caret to the end of its block. */
export function rangeToBlockEnd(block: HTMLElement, range: Range) {
	const tail = document.createRange();
	tail.setStart(range.startContainer, range.startOffset);
	tail.setEnd(block, block.childNodes.length);
	return tail;
}

/** Plain text of a block, with line breaks for `<br>`, for moving content into a code block. */
export function plainText(element: HTMLElement) {
	let out = '';
	const walk = (node: Node) =>
		node.childNodes.forEach((child) => {
			if (isText(child)) out += child.data.replace(ZWSP, '');
			else if (child.nodeName === 'BR') out += '\n';
			else walk(child);
		});
	walk(element);
	return out.replace(/\n$/, '');
}

export function linesToNodes(text: string) {
	const nodes: Node[] = [];
	text
		.replace(/\n$/, '')
		.split('\n')
		.forEach((line, index) => {
			if (index) nodes.push(document.createElement('br'));
			if (line) nodes.push(document.createTextNode(line));
		});
	return nodes;
}

const BOLD_STYLE = /font-weight:\s*(bold|[6-9]00)/;

function wrapLooseInline(root: HTMLElement) {
	let run: HTMLElement | null = null;
	Array.from(root.childNodes).forEach((node) => {
		if (isElement(node) && BLOCK_TAGS.has(node.nodeName)) {
			run = null;
			return;
		}
		if (isText(node) && !node.data.trim() && !run) {
			node.remove();
			return;
		}
		if (!run) {
			run = document.createElement('p');
			insertBefore(node, run);
		}
		run.appendChild(node);
	});
}

function renameAll(root: HTMLElement, selector: string, tag: string) {
	root.querySelectorAll(selector).forEach((element) => {
		const next = document.createElement(tag);
		moveChildren(element, next);
		replaceNode(element, next);
	});
}

/** Repairs what browsers leave behind: styled spans from merges, stray inline content at the top level, and an empty root. */
export function tidy(root: HTMLElement) {
	const loose = Array.from(root.childNodes).some(
		(node) =>
			(isText(node) && node.data.trim()) || (isElement(node) && !BLOCK_TAGS.has(node.nodeName))
	);
	const dirty =
		loose || !root.firstChild || root.querySelector('span, font, [style], div, b, i, strike');
	if (!dirty) return;
	const offsets = readOffsets(root);
	root.querySelectorAll('[style]').forEach((element) => {
		const style = element.getAttribute('style') ?? '';
		if (element.nodeName === 'SPAN' && BOLD_STYLE.test(style)) {
			replaceNode(
				element,
				Object.assign(document.createElement('strong'), { innerHTML: element.innerHTML })
			);
		} else element.removeAttribute('style');
	});
	renameAll(root, 'b', 'strong');
	renameAll(root, 'i', 'em');
	renameAll(root, 'strike', 's');
	renameAll(root, ':scope > div', 'p');
	root
		.querySelectorAll('span, font, div')
		.forEach((element) => replaceNode(element, ...Array.from(element.childNodes)));
	wrapLooseInline(root);
	if (!root.firstChild) root.innerHTML = EMPTY_DOCUMENT;
	if (root.contains(document.activeElement) || document.activeElement === root)
		writeOffsets(root, offsets);
}

/** A clean copy for output: canonical tags, no attributes but links, no invisible helpers, no trailing empty lines. */
export function cleanClone(root: HTMLElement) {
	const clone = root.cloneNode(true) as HTMLElement;
	clone.querySelectorAll('*').forEach((element) => {
		Array.from(element.attributes).forEach((attribute) => {
			if (!(element.nodeName === 'A' && attribute.name === 'href'))
				element.removeAttribute(attribute.name);
		});
	});
	const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
	const empty: Text[] = [];
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		node.data = node.data.replace(ZWSP, '');
		if (!node.data) empty.push(node);
	}
	empty.forEach((node) => node.remove());
	clone.querySelectorAll('p, h1, h2, h3, li, blockquote').forEach((block) => {
		const last = block.lastChild;
		if (last?.nodeName === 'BR' && visibleText(block)) last.remove();
	});
	clone.querySelectorAll('pre').forEach((pre) => {
		pre.textContent = (pre.textContent ?? '').replace(/\n$/, '');
	});
	while (
		clone.lastElementChild &&
		clone.lastElementChild.nodeName !== 'HR' &&
		!visibleText(clone.lastElementChild) &&
		clone.children.length > 1
	) {
		clone.lastElementChild.remove();
	}
	return clone;
}

export function plainOutput(clone: HTMLElement) {
	return Array.from(clone.querySelectorAll(TEXT_BLOCK_SELECTOR))
		.filter((block) => !block.querySelector('p, li'))
		.map((block) => (block.textContent ?? '').trim())
		.filter(Boolean)
		.join('\n');
}
