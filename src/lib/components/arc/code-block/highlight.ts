export type TokenKind =
	| 'comment'
	| 'string'
	| 'number'
	| 'keyword'
	| 'type'
	| 'function'
	| 'property'
	| 'tag'
	| 'punctuation';

export type CodeToken = { key: string; text: string; kind?: TokenKind };

const keywordPattern =
	/^(?:abstract|as|async|await|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|private|protected|public|readonly|return|set|static|switch|throw|try|type|typeof|var|void|while|with|yield|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE)$/;
const literalPattern = /^(?:true|false|null|undefined|NaN|Infinity)$/;
const typePattern =
	/^(?:Array|Boolean|Date|Error|Map|Number|Promise|Record|Set|String|ReactNode|HTMLElement|HTMLButtonElement|Event|unknown|never|void|any|boolean|number|string|object)$/;
const punctuationPattern = /^[{}[\]();,.<>:=+*/!?|&-]$/;
const tokenPattern =
	/\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b|[{}[\]();,.<>:=+*/!?|&-]/g;

const MARKUP_LANGUAGES = new Set(['tsx', 'jsx', 'html', 'vue']);
const PROPERTY_LANGUAGES = new Set(['css', 'tsx', 'jsx']);

export function normaliseLanguage(language: string) {
	return language.toLowerCase().replace(/^\./, '');
}

function isComment(value: string) {
	return value.startsWith('//') || value.startsWith('/*') || value.startsWith('<!--');
}

function isQuoted(value: string) {
	return value.startsWith('"') || value.startsWith("'") || value.startsWith('`');
}

function tokenKind(
	value: string,
	source: string,
	index: number,
	language: string
): TokenKind | undefined {
	const after = source.slice(index + value.length);
	if (isComment(value)) return 'comment';
	if (isQuoted(value)) return language === 'json' && /^\s*:/.test(after) ? 'property' : 'string';
	if (/^\d/.test(value)) return 'number';
	if (keywordPattern.test(value) || literalPattern.test(value)) return 'keyword';
	if (typePattern.test(value)) return 'type';
	if (punctuationPattern.test(value)) return 'punctuation';
	if (MARKUP_LANGUAGES.has(language) && /<\/?$/.test(source.slice(0, index))) return 'tag';
	if (/^\s*\(/.test(after) && language !== 'json') return 'function';
	if (PROPERTY_LANGUAGES.has(language) && /^\s*[:=]/.test(after)) return 'property';
	return undefined;
}

/** A small regex pass with no language bundles: good enough to give source a legible hierarchy. */
export function highlight(code: string, language: string): CodeToken[] {
	const tokens: CodeToken[] = [];
	let cursor = 0;
	for (const match of code.matchAll(tokenPattern)) {
		const value = match[0];
		const index = match.index ?? 0;
		if (cursor < index) tokens.push({ key: `${cursor}`, text: code.slice(cursor, index) });
		tokens.push({
			key: `${index}-${value}`,
			text: value,
			kind: tokenKind(value, code, index, language)
		});
		cursor = index + value.length;
	}
	if (cursor < code.length) tokens.push({ key: `${cursor}`, text: code.slice(cursor) });
	return tokens;
}
