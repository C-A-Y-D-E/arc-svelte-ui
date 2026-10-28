export type MentionKind = 'person' | 'channel';

export interface MentionPerson {
	id: string;
	name: string;
	/** One short line under the name, such as a job title. */
	role?: string;
	/** Portrait URL. Initials show when it is missing. */
	avatar?: string;
}

export interface MentionChannel {
	id: string;
	name: string;
	description?: string;
	members?: number;
}

/** A mention inside `text`. `start` and `end` are character offsets; the text between them is `@label` or `#label`. */
export interface Mention {
	kind: MentionKind;
	id: string;
	label: string;
	start: number;
	end: number;
}

export interface MentionValue {
	text: string;
	mentions: Mention[];
}

export type Suggestion =
	{ kind: 'person'; item: MentionPerson } | { kind: 'channel'; item: MentionChannel };
export type Trigger = { kind: MentionKind; start: number; query: string };

export const EMPTY_VALUE: MentionValue = { text: '', mentions: [] };
export const SYMBOL: Record<MentionKind, string> = { person: '@', channel: '#' };
/** How far back from the caret a trigger character is looked for. */
const TRIGGER_LOOKBACK = 48;

export const mentionText = (kind: MentionKind, label: string) => `${SYMBOL[kind]}${label}`;
export const byStart = (a: Mention, b: Mention) => a.start - b.start;

/** Turns a value into storage friendly text, `<@id>` for people and `<#id>` for channels by default. */
export function serializeMentions(
	value: MentionValue,
	format: (mention: Mention) => string = (mention) => `<${SYMBOL[mention.kind]}${mention.id}>`
) {
	let out = '';
	let at = 0;
	for (const mention of [...value.mentions].sort(byStart)) {
		out += value.text.slice(at, mention.start) + format(mention);
		at = mention.end;
	}
	return out + value.text.slice(at);
}

/** Moves mentions along with an edit and drops any the edit touched. `hint` is the caret before the edit, which settles repeated characters. */
export function reconcile(previous: MentionValue, text: string, hint: number): Mention[] {
	const before = previous.text;
	let prefix = 0;
	const maxPrefix = Math.min(before.length, text.length, Math.max(0, hint));
	while (prefix < maxPrefix && before[prefix] === text[prefix]) prefix++;
	let suffix = 0;
	while (
		suffix < before.length - prefix &&
		suffix < text.length - prefix &&
		before[before.length - 1 - suffix] === text[text.length - 1 - suffix]
	) {
		suffix++;
	}
	const oldEnd = before.length - suffix;
	const delta = text.length - before.length;
	return previous.mentions
		.flatMap((mention) => {
			if (mention.end <= prefix) return [mention];
			if (mention.start >= oldEnd)
				return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
			return [];
		})
		.filter(
			(mention) =>
				text.slice(mention.start, mention.end) === mentionText(mention.kind, mention.label)
		);
}

export function findTrigger(
	text: string,
	caret: number,
	mentions: Mention[],
	kinds: Record<MentionKind, boolean>
): Trigger | null {
	for (let index = caret - 1; index >= 0 && index >= caret - TRIGGER_LOOKBACK; index--) {
		const char = text[index];
		if (char === '\n') return null;
		if (char !== '@' && char !== '#') continue;
		const kind: MentionKind = char === '@' ? 'person' : 'channel';
		if (!kinds[kind]) return null;
		if (index > 0 && !/[\s([{"']/.test(text[index - 1])) return null;
		if (mentions.some((mention) => index >= mention.start && index < mention.end)) return null;
		const query = text.slice(index + 1, caret);
		const shape = kind === 'person' ? /^[^\s@#]*( [^\s@#]*)?$/ : /^[^\s@#]*$/;
		return shape.test(query) ? { kind, start: index, query } : null;
	}
	return null;
}

/** Prefix, then word start, then substring, then the extra line (role or description). Zero drops the entry. */
function rank(label: string, extra: string, query: string) {
	const name = label.toLowerCase();
	if (!query) return 1;
	if (name.startsWith(query)) return 4;
	if (name.split(/[\s\-_.]+/).some((word) => word.startsWith(query))) return 3;
	if (name.includes(query)) return 2;
	return extra.toLowerCase().includes(query) ? 1 : 0;
}

export function rankSuggestions(
	trigger: Trigger,
	people: MentionPerson[],
	channels: MentionChannel[],
	limit: number
): Suggestion[] {
	const query = trigger.query.toLowerCase().trim();
	const scored: { entry: Suggestion; score: number }[] =
		trigger.kind === 'person'
			? people.map((item) => ({
					entry: { kind: 'person', item },
					score: rank(item.name, item.role ?? '', query)
				}))
			: channels.map((item) => ({
					entry: { kind: 'channel', item },
					score: rank(item.name, item.description ?? '', query)
				}));
	return scored
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((entry) => entry.entry);
}

export function initials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');
}

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The mirror's markup: the same text as the textarea, with tokens drawn in place and a marker at the open trigger. */
export function mirrorHtml(value: MentionValue, markAt: number) {
	let html = '';
	let at = 0;
	const pushText = (from: number, to: number) => {
		if (markAt >= from && markAt < to) {
			html += `${escapeHtml(value.text.slice(from, markAt))}<span data-anchor=""></span>${escapeHtml(value.text.slice(markAt, to))}`;
		} else html += escapeHtml(value.text.slice(from, to));
	};
	for (const mention of value.mentions) {
		pushText(at, mention.start);
		const token = escapeHtml(value.text.slice(mention.start, mention.end));
		html += `<span class="token" data-kind="${mention.kind}">${token}</span>`;
		at = mention.end;
	}
	pushText(at, value.text.length);
	return html;
}

/** The matched part of a label, split out so it can read in full contrast. */
export function splitMatch(text: string, query: string) {
	const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
	if (at < 0) return { before: text, match: '', after: '' };
	return {
		before: text.slice(0, at),
		match: text.slice(at, at + query.length),
		after: text.slice(at + query.length)
	};
}
