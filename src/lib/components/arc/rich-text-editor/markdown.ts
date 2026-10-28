/* Markdown and HTML. Small, dependency free converters for the subset the editor writes. */

import { BLOCK_TAGS, EMPTY_DOCUMENT, ZWSP, isText, parseHtml, replaceNode } from './dom';

const MAX_HEADING_LEVEL = 3;

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (url: string) => /^(https?:|mailto:|tel:|\/|#)/i.test(url.trim());

/** Adds a scheme to bare domains so `example.com/docs` becomes a working link. */
export function normalizeUrl(input: string) {
	const url = input.trim();
	if (!url) return '';
	if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
	return `https://${url}`;
}

function inlineMarkdown(text: string) {
	const codes: string[] = [];
	let out = escapeHtml(text).replace(
		/`([^`]+)`/g,
		(_, code: string) => `\u0000${codes.push(code) - 1}\u0000`
	);
	out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
		safeUrl(url) ? `<a href="${url}">${label}</a>` : label
	);
	out = out.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
	out = out.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
	out = out.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
	out = out.replace(/(^|[^\w_])_(?=\S)([^_]*?\S)_(?![\w_])/g, '$1<em>$2</em>');
	return out.replace(
		/\u0000(\d+)\u0000/g,
		(_, index: string) => `<code>${codes[Number(index)]}</code>`
	);
}

function listMarkdown(lines: string[]) {
	const items = lines.map((line) => {
		const match = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)!;
		return {
			indent: match[1].replace(/\t/g, '  ').length,
			tag: /\d/.test(match[2]) ? 'ol' : 'ul',
			text: match[3]
		};
	});
	let html = '';
	const stack: { indent: number; tag: string }[] = [];
	for (const item of items) {
		while (stack.length > 1 && item.indent < stack[stack.length - 1].indent)
			html += `</li></${stack.pop()!.tag}>`;
		const top = stack[stack.length - 1];
		if (!top || item.indent > top.indent) {
			html += `<${item.tag}><li>`;
			stack.push({ indent: item.indent, tag: item.tag });
		} else if (top.tag !== item.tag) {
			html += `</li></${top.tag}><${item.tag}><li>`;
			top.tag = item.tag;
		} else html += '</li><li>';
		html += inlineMarkdown(item.text);
	}
	while (stack.length) html += `</li></${stack.pop()!.tag}>`;
	return html;
}

const FENCE = /^\s*```/;
const QUOTE = /^\s*>/;
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const isListItem = (line: string) => /^\s*([-*+]|\d+[.)])\s+/.test(line);

/** Converts Markdown to the editor's HTML: headings (three levels), lists, quotes, fenced code, rules, and inline marks. */
export function markdownToHtml(markdown: string) {
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	const paragraph: string[] = [];
	const flush = () => {
		if (!paragraph.length) return;
		out.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
		paragraph.length = 0;
	};
	const takeWhile = (index: number, test: (line: string) => boolean) => {
		const taken: string[] = [];
		while (index < lines.length && test(lines[index])) taken.push(lines[index++]);
		return taken;
	};
	for (let index = 0; index < lines.length;) {
		const line = lines[index];
		if (FENCE.test(line)) {
			flush();
			const code = takeWhile(index + 1, (candidate) => !FENCE.test(candidate));
			index += code.length + 2;
			out.push(`<pre>${escapeHtml(code.join('\n')) || '<br>'}</pre>`);
			continue;
		}
		if (!line.trim()) {
			flush();
			index++;
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			flush();
			const level = Math.min(MAX_HEADING_LEVEL, heading[1].length);
			out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
			index++;
			continue;
		}
		if (RULE.test(line)) {
			flush();
			out.push('<hr>');
			index++;
			continue;
		}
		if (QUOTE.test(line)) {
			flush();
			const quote = takeWhile(index, (candidate) => QUOTE.test(candidate));
			index += quote.length;
			const body = quote.map((entry) => inlineMarkdown(entry.replace(/^\s*>\s?/, '')));
			out.push(`<blockquote>${body.join('<br>')}</blockquote>`);
			continue;
		}
		if (isListItem(line)) {
			flush();
			const items = takeWhile(index, isListItem);
			index += items.length;
			out.push(listMarkdown(items));
			continue;
		}
		paragraph.push(line.trim());
		index++;
	}
	flush();
	return out.join('') || EMPTY_DOCUMENT;
}

function wrapMark(inner: string, mark: string) {
	const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
	return match[2] ? `${match[1]}${mark}${match[2]}${mark}${match[3]}` : inner;
}

function inlineToMarkdown(node: Node): string {
	let out = '';
	node.childNodes.forEach((child) => {
		if (isText(child)) {
			out += child.data.replace(ZWSP, '');
			return;
		}
		if (child.nodeType !== Node.ELEMENT_NODE) return;
		const element = child as HTMLElement;
		switch (element.nodeName) {
			case 'BR':
				out += '\n';
				break;
			case 'STRONG':
			case 'B':
				out += wrapMark(inlineToMarkdown(element), '**');
				break;
			case 'EM':
			case 'I':
				out += wrapMark(inlineToMarkdown(element), '_');
				break;
			case 'S':
			case 'STRIKE':
			case 'DEL':
				out += wrapMark(inlineToMarkdown(element), '~~');
				break;
			case 'CODE':
				out += `\`${(element.textContent ?? '').replace(ZWSP, '')}\``;
				break;
			case 'A':
				out += `[${inlineToMarkdown(element)}](${element.getAttribute('href') ?? ''})`;
				break;
			case 'UL':
			case 'OL':
				break;
			default:
				out += inlineToMarkdown(element);
		}
	});
	return out;
}

function listToMarkdown(list: Element, indent: string): string {
	let number = 1;
	return Array.from(list.children)
		.filter((item) => item.nodeName === 'LI')
		.map((item) => {
			const marker = list.nodeName === 'OL' ? `${number++}. ` : '- ';
			const nested = Array.from(item.children)
				.filter((child) => child.nodeName === 'UL' || child.nodeName === 'OL')
				.map((child) => listToMarkdown(child, indent + ' '.repeat(marker.length)));
			return [`${indent}${marker}${inlineToMarkdown(item).trim()}`, ...nested].join('\n');
		})
		.join('\n');
}

function quoteToMarkdown(element: HTMLElement) {
	const hasBlocks = Array.from(element.children).some((child) => BLOCK_TAGS.has(child.nodeName));
	const body = hasBlocks
		? Array.from(element.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n')
		: inlineToMarkdown(element).trim();
	return body
		.split('\n')
		.map((line) => (line ? `> ${line}` : '>'))
		.join('\n');
}

function blockToMarkdown(node: Node): string {
	if (isText(node)) return node.data.replace(ZWSP, '').trim();
	if (node.nodeType !== Node.ELEMENT_NODE) return '';
	const element = node as HTMLElement;
	switch (element.nodeName) {
		case 'H1':
			return `# ${inlineToMarkdown(element).trim()}`;
		case 'H2':
			return `## ${inlineToMarkdown(element).trim()}`;
		case 'H3':
			return `### ${inlineToMarkdown(element).trim()}`;
		case 'HR':
			return '---';
		case 'PRE':
			return `\`\`\`\n${(element.textContent ?? '').replace(ZWSP, '').replace(/\n$/, '')}\n\`\`\``;
		case 'UL':
		case 'OL':
			return listToMarkdown(element, '');
		case 'BLOCKQUOTE':
			return quoteToMarkdown(element);
		default:
			return inlineToMarkdown(element).trim();
	}
}

/** Converts editor HTML (or an element) to Markdown. */
export function htmlToMarkdown(input: string | HTMLElement) {
	const root = typeof input === 'string' ? parseHtml(input) : input;
	return Array.from(root.childNodes).map(blockToMarkdown).filter(Boolean).join('\n\n');
}

const INLINE_MAP: Record<string, string> = {
	B: 'strong',
	STRONG: 'strong',
	I: 'em',
	EM: 'em',
	S: 's',
	STRIKE: 's',
	DEL: 's',
	CODE: 'code',
	A: 'a',
	BR: 'br'
};
const BLOCK_MAP: Record<string, string> = {
	P: 'p',
	H1: 'h1',
	H2: 'h2',
	H3: 'h3',
	H4: 'h3',
	H5: 'h3',
	H6: 'h3',
	UL: 'ul',
	OL: 'ol',
	LI: 'li',
	BLOCKQUOTE: 'blockquote',
	PRE: 'pre',
	HR: 'hr'
};
const DROP = new Set([
	'SCRIPT',
	'STYLE',
	'META',
	'LINK',
	'TITLE',
	'TEMPLATE',
	'IFRAME',
	'OBJECT',
	'EMBED',
	'SVG',
	'CANVAS',
	'IMG',
	'VIDEO',
	'AUDIO',
	'INPUT',
	'BUTTON',
	'SELECT',
	'TEXTAREA',
	'HEAD'
]);

/** The tag a pasted element becomes, or an empty string to keep only its children. */
function canonicalTag(element: HTMLElement) {
	const style = element.getAttribute('style') ?? '';
	if (element.nodeName === 'B' && /font-weight:\s*(normal|[1-4]00)/.test(style)) return '';
	if (element.nodeName === 'SPAN') {
		if (/font-weight:\s*(bold|[6-9]00)/.test(style)) return 'strong';
		if (/font-style:\s*italic/.test(style)) return 'em';
		return /line-through/.test(style) ? 's' : '';
	}
	return INLINE_MAP[element.nodeName] ?? BLOCK_MAP[element.nodeName] ?? '';
}

function convertAllowed(from: Node, into: Node) {
	from.childNodes.forEach((child) => {
		if (isText(child)) {
			into.appendChild(document.createTextNode(child.data));
			return;
		}
		if (child.nodeType !== Node.ELEMENT_NODE) return;
		const element = child as HTMLElement;
		if (DROP.has(element.nodeName)) return;
		const tag = canonicalTag(element);
		if (!tag) {
			convertAllowed(element, into);
			return;
		}
		const next = document.createElement(tag);
		if (tag === 'a') {
			const href = element.getAttribute('href') ?? '';
			if (!safeUrl(href)) {
				convertAllowed(element, into);
				return;
			}
			next.setAttribute('href', href);
		}
		if (tag === 'pre') next.textContent = element.textContent ?? '';
		else if (tag !== 'br' && tag !== 'hr') convertAllowed(element, next);
		into.appendChild(next);
	});
}

/** Inline runs at the top level become paragraphs; whitespace between blocks disappears. */
function groupIntoBlocks(source: HTMLElement) {
	const fixed = document.createElement('div');
	let run: HTMLElement | null = null;
	Array.from(source.childNodes).forEach((node) => {
		const block = node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.nodeName);
		if (block) {
			run = null;
			fixed.appendChild(node);
			return;
		}
		if (isText(node) && !node.data.trim() && !run) return;
		if (!run) {
			run = document.createElement('p');
			fixed.appendChild(run);
		}
		run.appendChild(node);
	});
	return fixed;
}

const isBlockNode = (node: Node | null) => !!node && BLOCK_TAGS.has(node.nodeName);

/** Keeps only the tags the editor understands and drops every attribute except safe link targets. Bold and italic spans from other editors become marks. */
export function sanitizeHtml(html: string) {
	const source = new DOMParser().parseFromString(html, 'text/html').body;
	const out = document.createElement('div');
	convertAllowed(source, out);
	const fixed = groupIntoBlocks(out);
	fixed
		.querySelectorAll('li > p')
		.forEach((paragraph) => replaceNode(paragraph, ...Array.from(paragraph.childNodes)));
	// The editor keeps typed whitespace, so formatting whitespace between blocks and list items has to go.
	[fixed, ...Array.from(fixed.querySelectorAll('ul, ol, blockquote, li'))].forEach((parent) =>
		Array.from(parent.childNodes).forEach((node) => {
			const listParent = parent === fixed || parent.nodeName === 'UL' || parent.nodeName === 'OL';
			const besideBlock = isBlockNode(node.previousSibling) || isBlockNode(node.nextSibling);
			if (isText(node) && !node.data.trim() && (listParent || besideBlock)) node.remove();
		})
	);
	return fixed.innerHTML;
}
