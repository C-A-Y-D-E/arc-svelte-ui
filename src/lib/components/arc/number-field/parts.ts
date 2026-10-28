export type Part = { key: string; digit: number } | { key: string; text: string };

/** A formatted number as columns keyed by place value, so 9 → 10 keeps the ones column the ones column. */
export function numberParts(value: number, format: Intl.NumberFormat): Part[] {
	const parts = format.formatToParts(value);
	let place = parts.reduce(
		(count, part) => count + (part.type === 'integer' ? part.value.length : 0),
		0
	);
	let fraction = 0;
	return parts.flatMap((part, index): Part[] => {
		if (part.type === 'integer')
			return [...part.value].map((char) => ({ key: `i${--place}`, digit: Number(char) }));
		if (part.type === 'fraction')
			return [...part.value].map((char) => ({ key: `f${fraction++}`, digit: Number(char) }));
		return [{ key: symbolKey(part.type, place, index), text: part.value }];
	});
}

function symbolKey(type: string, place: number, index: number) {
	if (type === 'group') return `g${place}`;
	if (type === 'decimal') return 'd';
	if (type === 'minusSign') return 'm';
	return `${type}${index}`;
}

/** Prefix and suffix characters are keyed by position, so "seat" → "seats" only opens the new "s" and the rest holds still. */
export function affixParts(text: string): Part[] {
	return [...text].map((char, index) => ({ key: `${index}:${char}`, text: char }));
}
