import Heading1Icon from '@lucide/svelte/icons/heading-1';
import Heading2Icon from '@lucide/svelte/icons/heading-2';
import Heading3Icon from '@lucide/svelte/icons/heading-3';
import ListIcon from '@lucide/svelte/icons/list';
import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
import MinusIcon from '@lucide/svelte/icons/minus';
import PilcrowIcon from '@lucide/svelte/icons/pilcrow';
import QuoteIcon from '@lucide/svelte/icons/quote';
import SquareCodeIcon from '@lucide/svelte/icons/square-code';
import type { BlockType } from './blocks';
import { clipBand, isText } from './dom';

export type SlashItem = {
	type: BlockType;
	label: string;
	hint: string;
	keywords: string;
	icon: typeof PilcrowIcon;
};
/** An open slash menu: the text node holding the slash, where it is, and where the panel hangs. */
export type Slash = {
	node: Text;
	offset: number;
	query: string;
	x: number;
	y: number;
	above: boolean;
	max: number;
};

export const SLASH_ITEMS: SlashItem[] = [
	{ type: 'p', label: 'Text', hint: '', keywords: 'paragraph plain body', icon: PilcrowIcon },
	{ type: 'h1', label: 'Heading 1', hint: '#', keywords: 'title h1 large', icon: Heading1Icon },
	{
		type: 'h2',
		label: 'Heading 2',
		hint: '##',
		keywords: 'subtitle h2 section',
		icon: Heading2Icon
	},
	{ type: 'h3', label: 'Heading 3', hint: '###', keywords: 'h3 small', icon: Heading3Icon },
	{
		type: 'ul',
		label: 'Bulleted list',
		hint: '-',
		keywords: 'bullet unordered ul points',
		icon: ListIcon
	},
	{
		type: 'ol',
		label: 'Numbered list',
		hint: '1.',
		keywords: 'ordered ol steps numbers',
		icon: ListOrderedIcon
	},
	{
		type: 'blockquote',
		label: 'Quote',
		hint: '>',
		keywords: 'blockquote citation callout',
		icon: QuoteIcon
	},
	{
		type: 'pre',
		label: 'Code block',
		hint: '```',
		keywords: 'pre snippet monospace',
		icon: SquareCodeIcon
	},
	{ type: 'hr', label: 'Divider', hint: '---', keywords: 'rule hr line separator', icon: MinusIcon }
];

const MAX_QUERY_LENGTH = 24;
const PANEL_WIDTH = 244;
const PANEL_ROOM = 330;
const PANEL_MIN_HEIGHT = 150;
const PANEL_GAP = 6;
const EDGE_GAP = 12;
const SLASH_INSET = 8;

export function filterSlashItems(query: string) {
	const term = query.trim().toLowerCase();
	if (!term) return SLASH_ITEMS;
	return SLASH_ITEMS.filter(
		(item) =>
			`${item.label} ${item.keywords}`
				.toLowerCase()
				.split(/\s+/)
				.some((word) => word.startsWith(term)) || item.label.toLowerCase().includes(term)
	);
}

/** The query typed after the slash, or null once the caret leaves it or the text stops looking like a query. */
export function slashQuery(slash: Slash, range: Range) {
	const valid =
		range.collapsed &&
		range.startContainer === slash.node &&
		range.startOffset > slash.offset &&
		slash.node.data[slash.offset] === '/';
	if (!valid) return null;
	const query = slash.node.data.slice(slash.offset + 1, range.startOffset);
	const looksLikeQuery =
		query.length <= MAX_QUERY_LENGTH && !/^\s/.test(query) && !/\s\s/.test(query);
	return looksLikeQuery ? query : null;
}

/** A slash typed after a space or at line start opens the menu at the slash, flipping above when there is no room below. */
export function slashAtCaret(root: HTMLElement): Slash | null {
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	const range = selection.getRangeAt(0);
	const node = range.startContainer;
	if (!range.collapsed || !isText(node) || node.parentElement?.closest('pre, code')) return null;
	const offset = range.startOffset - 1;
	if (node.data[offset] !== '/' || (offset > 0 && !/[\s ​]/.test(node.data[offset - 1])))
		return null;
	const mark = document.createRange();
	mark.setStart(node, offset);
	mark.setEnd(node, offset + 1);
	const rect = mark.getBoundingClientRect();
	const box = root.getBoundingClientRect();
	const band = clipBand(root);
	const roomBelow = band.bottom - rect.bottom;
	const above = roomBelow < PANEL_ROOM && rect.top - band.top > roomBelow;
	const room = above ? rect.top - band.top - EDGE_GAP : roomBelow - EDGE_GAP;
	return {
		node,
		offset,
		query: '',
		x: Math.max(0, Math.min(rect.left - box.left - SLASH_INSET, box.width - PANEL_WIDTH)),
		y: above ? rect.top - box.top - PANEL_GAP : rect.bottom - box.top + PANEL_GAP,
		above,
		max: Math.max(PANEL_MIN_HEIGHT, room)
	};
}
