/** The BCP 47 tag dates and numbers are formatted in: the browser's language, else US English. */
export function intlLocale(): string {
	return typeof navigator === 'undefined' ? 'en-US' : (navigator.language ?? 'en-US');
}
