import type { Snippet } from 'svelte';

export interface ExpandingSearchItem {
	id: string;
	title: string;
	/** One short line under the title, such as the type, owner, or last edit. */
	meta?: string;
	/** Results gather under this heading, in the order groups first appear in `items`. */
	group?: string;
	icon?: Snippet;
	/** Extra words that should also find this item. */
	keywords?: string[];
}

export type SearchGroup = { name: string; items: ExpandingSearchItem[] };

const NO_MATCH = -1;

function score(item: ExpandingSearchItem, query: string) {
	const title = item.title.toLocaleLowerCase();
	const at = title.indexOf(query);
	if (at === 0) return 0;
	if (at > 0) return /[\s\-/]/.test(title[at - 1]) ? 1 : 2;
	const extra = [item.meta ?? '', ...(item.keywords ?? [])].some((word) =>
		word.toLocaleLowerCase().includes(query)
	);
	return extra ? 3 : NO_MATCH;
}

/** Title starts beat word starts, which beat matches inside a word, which beat keyword and meta matches. Ties keep the original order. */
export function rank(items: ExpandingSearchItem[], query: string, limit: number) {
	const needle = query.toLocaleLowerCase();
	return items
		.map((item, order) => ({ item, order, score: score(item, needle) }))
		.filter((entry) => entry.score !== NO_MATCH)
		.sort((a, b) => a.score - b.score || a.order - b.order)
		.slice(0, limit)
		.map((entry) => entry.item);
}

/** Groups keep the order in which they first appear in the full item list. */
export function groupBy(list: ExpandingSearchItem[], source: ExpandingSearchItem[]): SearchGroup[] {
	const firstSeen = new Map<string, number>();
	source.forEach((item, index) => {
		const name = item.group ?? '';
		if (!firstSeen.has(name)) firstSeen.set(name, index);
	});
	const groups = new Map<string, ExpandingSearchItem[]>();
	list.forEach((item) => {
		const name = item.group ?? '';
		groups.set(name, [...(groups.get(name) ?? []), item]);
	});
	return [...groups]
		.sort((a, b) => (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0))
		.map(([name, items]) => ({ name, items }));
}

/** Splits a title around the first match, for highlighting. */
export function splitMatch(text: string, query: string) {
	const at = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
	if (at < 0) return { before: text, match: '', after: '' };
	return {
		before: text.slice(0, at),
		match: text.slice(at, at + query.length),
		after: text.slice(at + query.length)
	};
}

/** Offsets ignore transforms, so they describe where rows sit in the list, not where a gliding row happens to be mid-flight. */
export function offsetWithin(node: HTMLElement, container: HTMLElement) {
	let top = 0;
	let current: HTMLElement | null = node;
	while (current && current !== container) {
		top += current.offsetTop;
		current = current.offsetParent as HTMLElement | null;
	}
	return top;
}
