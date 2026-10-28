export type Grid = { base: number; step: number; decimals: number };
export type NumberSymbols = { group: string; decimal: string };

const SAMPLE_NUMBER = -1234.5;

export function decimalsOf(value: number) {
	return (String(value).split('.')[1] ?? '').length;
}

export function readSymbols(locale: string): NumberSymbols {
	const parts = new Intl.NumberFormat(locale).formatToParts(SAMPLE_NUMBER);
	return {
		group: parts.find((part) => part.type === 'group')?.value ?? ',',
		decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.'
	};
}

export function roundTo(value: number, decimals: number) {
	return Number(value.toFixed(decimals)) || 0;
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** The nearest value on the grid that starts at `min` and moves by `step`. */
export function snapToGrid(value: number, { base, step, decimals }: Grid) {
	return roundTo(base + Math.round((value - base) / step) * step, decimals);
}

/** Off-grid values move to the next grid line in the direction of travel, then whole steps from there. */
export function stepFrom(from: number, steps: number, { base, step, decimals }: Grid) {
	const index = (from - base) / step;
	const whole = steps > 0 ? Math.floor(index + 1e-7) : Math.ceil(index - 1e-7);
	return roundTo(base + (whole + steps) * step, decimals);
}

/** A number from typed text, or null when it holds no digits. */
export function parseNumber(text: string, { group, decimal }: NumberSymbols) {
	const normalized = text
		.split(group)
		.join('')
		.replace(decimal, '.')
		.replace(/[^\d.-]/g, '');
	if (!/\d/.test(normalized)) return null;
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function escapeForClass(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** Keeps digits, the locale's separators, and a minus sign only when negatives are allowed. */
export function stripDisallowed(
	text: string,
	symbols: NumberSymbols,
	{ allowDecimal, allowNegative }: { allowDecimal: boolean; allowNegative: boolean }
) {
	const kept = `0-9${escapeForClass(symbols.group)}${allowDecimal ? escapeForClass(symbols.decimal) : ''}${allowNegative ? '\\-' : ''}`;
	return text.replace(new RegExp(`[^${kept}]`, 'g'), '');
}
