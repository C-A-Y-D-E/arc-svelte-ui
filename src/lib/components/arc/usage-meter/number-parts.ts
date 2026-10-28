export type NumberPart =
	{ key: string; kind: 'digit'; digit: number } | { key: string; kind: 'symbol'; text: string };

const formats = new Map<number, Intl.NumberFormat>();

function formatFor(decimals: number) {
	let format = formats.get(decimals);
	if (!format) {
		format = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
		formats.set(decimals, format);
	}
	return format;
}

/** Split a number into columns keyed by place value, so 9.8 → 10.4 keeps the ones column the ones column and a new tens column slides in. */
export function partsFor(value: number, decimals: number): NumberPart[] {
	const parts = formatFor(decimals).formatToParts(value);
	let place = parts.reduce(
		(count, part) => count + (part.type === 'integer' ? part.value.length : 0),
		0
	);
	let fraction = 0;
	return parts.flatMap((part, index): NumberPart[] => {
		if (part.type === 'integer')
			return [...part.value].map((char) => ({
				key: `i${--place}`,
				kind: 'digit',
				digit: Number(char)
			}));
		if (part.type === 'fraction')
			return [...part.value].map((char) => ({
				key: `f${fraction++}`,
				kind: 'digit',
				digit: Number(char)
			}));
		const key =
			part.type === 'group' ? `g${place}` : part.type === 'decimal' ? 'd' : `${part.type}${index}`;
		return [{ key, kind: 'symbol', text: part.value }];
	});
}

/** Remembers the last value so each change reports whether the number went up (1) or down (-1). */
export function createTrend(initial: number) {
	let last = initial;
	let direction = 1;
	return (next: number) => {
		if (next !== last) {
			direction = next > last ? 1 : -1;
			last = next;
		}
		return direction;
	};
}
