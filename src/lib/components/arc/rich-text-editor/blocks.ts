import {
	appendNodes,
	ensureFilled,
	insertAfter,
	linesToNodes,
	moveChildren,
	plainText,
	replaceNode
} from './dom';

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'blockquote' | 'pre' | 'hr';
export type TextBlockType = Exclude<BlockType, 'hr'>;

const isList = (node: Node) => node.nodeName === 'UL' || node.nodeName === 'OL';
const isListType = (type: TextBlockType): type is 'ul' | 'ol' => type === 'ul' || type === 'ol';

/** The block type as the toolbar and slash menu name it: list items report their list. */
export const blockTypeOf = (block: HTMLElement) =>
	(block.nodeName === 'LI' ? block.parentElement!.nodeName : block.nodeName).toLowerCase();

function mergeAdjacentLists(list: HTMLElement) {
	const next = list.nextElementSibling;
	if (next && next.nodeName === list.nodeName) {
		moveChildren(next, list);
		next.remove();
	}
	const previous = list.previousElementSibling;
	if (previous && previous.nodeName === list.nodeName) {
		moveChildren(list, previous);
		list.remove();
		return previous as HTMLElement;
	}
	return list;
}

function outdentNested(
	item: HTMLElement,
	list: HTMLElement,
	parentItem: HTMLElement,
	following: Node[]
) {
	if (following.length) {
		const sub = document.createElement(list.nodeName.toLowerCase());
		following.forEach((node) => sub.appendChild(node));
		item.appendChild(sub);
	}
	insertAfter(parentItem, item);
	if (!list.children.length) list.remove();
	return item;
}

/** Moves a list item one level out. A top level item leaves the list and becomes a paragraph between its halves. */
export function outdent(item: HTMLElement): HTMLElement {
	const list = item.parentElement!;
	const parentItem = list.parentElement;
	const following: Node[] = [];
	for (let node = item.nextSibling; node; node = node.nextSibling) following.push(node);
	if (parentItem?.nodeName === 'LI') return outdentNested(item, list, parentItem, following);

	const paragraph = document.createElement('p');
	const nested: Node[] = [];
	Array.from(item.childNodes).forEach((child) => {
		if (isList(child)) nested.push(child);
		else paragraph.appendChild(child);
	});
	ensureFilled(paragraph);
	const tail =
		following.length || nested.length ? document.createElement(list.nodeName.toLowerCase()) : null;
	if (tail) {
		nested.forEach((sub) => Array.from(sub.childNodes).forEach((node) => tail.appendChild(node)));
		following.forEach((node) => tail.appendChild(node));
	}
	insertAfter(list, paragraph);
	if (tail) insertAfter(paragraph, tail);
	item.remove();
	if (!list.children.length) list.remove();
	return paragraph;
}

export function indent(item: HTMLElement) {
	const previous = item.previousElementSibling as HTMLElement | null;
	if (!previous || previous.nodeName !== 'LI') return false;
	const listTag = item.parentElement!.nodeName;
	let sub = previous.lastElementChild as HTMLElement | null;
	if (!sub || !isList(sub)) {
		sub = document.createElement(listTag.toLowerCase());
		previous.appendChild(sub);
	}
	sub.appendChild(item);
	return true;
}

function convertListItem(item: HTMLElement, type: TextBlockType): HTMLElement {
	const list = item.parentElement!;
	if (isListType(type)) {
		if (list.nodeName.toLowerCase() === type) return outdent(item);
		const swapped = document.createElement(type);
		moveChildren(list, swapped);
		replaceNode(list, swapped);
		return item;
	}
	const paragraph = outdent(item);
	return paragraph.nodeName === 'P' && type !== 'p' ? convertBlock(paragraph, type) : paragraph;
}

function wrapInList(block: HTMLElement, type: 'ul' | 'ol') {
	const item = document.createElement('li');
	if (block.nodeName === 'PRE') appendNodes(item, ...linesToNodes(block.textContent ?? ''));
	else moveChildren(block, item);
	ensureFilled(item);
	const list = document.createElement(type);
	list.appendChild(item);
	replaceNode(block, list);
	mergeAdjacentLists(list);
	return item;
}

/** Turns one block into another type, keeping its content. Choosing the type a block already has turns it back into a paragraph. */
export function convertBlock(block: HTMLElement, type: TextBlockType): HTMLElement {
	if (block.nodeName === 'LI') return convertListItem(block, type);
	if (isListType(type)) return wrapInList(block, type);
	const tag = block.nodeName.toLowerCase() === type ? 'p' : type;
	const next = document.createElement(tag);
	if (tag === 'pre') next.textContent = plainText(block);
	else if (block.nodeName === 'PRE') appendNodes(next, ...linesToNodes(block.textContent ?? ''));
	else moveChildren(block, next);
	ensureFilled(next);
	replaceNode(block, next);
	return next;
}

/** Makes sure a paragraph follows a block the caret cannot type after, such as a rule or a code block at the end. */
export function paragraphAfter(block: Element) {
	const next = block.nextElementSibling;
	if (next && next.nodeName === 'P') return next as HTMLElement;
	const paragraph = emptyParagraph();
	insertAfter(block, paragraph);
	return paragraph;
}

export function emptyParagraph() {
	const paragraph = document.createElement('p');
	paragraph.appendChild(document.createElement('br'));
	return paragraph;
}
