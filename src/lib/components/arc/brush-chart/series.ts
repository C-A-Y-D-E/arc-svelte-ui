export type Point = { t: number; value: number };
export type SmoothPoint = Point & { low: number; high: number };

export const DAY = 86_400_000;
const AVERAGE_DAYS_PER_MONTH = 30.44;
const TICK_SPACING = 76;
const MAX_VALUE_ROWS = 4;
/** Half of the seven point window used for the rolling average. */
const HALF_WINDOW = 3;

const utc = (options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options });
const dayTick = utc({ month: 'short', day: 'numeric' });
const monthTick = utc({ month: 'short' });
const yearTick = utc({ year: 'numeric' });

export const clean = (value: number) => Number(value.toPrecision(12));

/** Clean gridlines from zero: the smallest step of 1, 2, 2.5, or 5 that covers the data in four rows or fewer. */
export function niceTop(high: number) {
	const hi = Math.max(high, 1);
	const magnitude = 10 ** Math.floor(Math.log10(hi / MAX_VALUE_ROWS));
	for (const factor of [1, 2, 2.5, 5, 10]) {
		const step = factor * magnitude;
		const top = Math.ceil(hi / step) * step;
		if (top / step <= MAX_VALUE_ROWS + 1e-9) return { top: clean(top), step: clean(step) };
	}
	return { top: hi, step: hi / MAX_VALUE_ROWS };
}

/** Calendar ticks that fit the width: days, weeks, then months, quarters, and years, each landing on a real boundary. */
export function timeTicks(start: number, end: number, width: number) {
	const room = Math.max(2, Math.floor(width / TICK_SPACING));
	const span = end - start;
	for (const days of [1, 2, 7, 14]) {
		if (span / (days * DAY) > room) continue;
		const ticks: { t: number; label: string }[] = [];
		let t = Math.ceil(start / DAY) * DAY;
		if (days >= 7) while (new Date(t).getUTCDay() !== 1) t += DAY;
		for (; t <= end; t += days * DAY) ticks.push({ t, label: dayTick.format(t) });
		return ticks;
	}
	for (const months of [1, 2, 3, 6, 12]) {
		if (span / (months * AVERAGE_DAYS_PER_MONTH * DAY) > room) continue;
		const ticks: { t: number; label: string }[] = [];
		const first = new Date(start);
		let y = first.getUTCFullYear();
		let m = first.getUTCMonth() + (first.getUTCDate() > 1 || first.getUTCHours() > 0 ? 1 : 0);
		for (;;) {
			y += Math.floor(m / 12);
			m %= 12;
			const t = Date.UTC(y, m, 1);
			if (t > end) break;
			if (m % months === 0)
				ticks.push({ t, label: m === 0 ? yearTick.format(t) : monthTick.format(t) });
			m += 1;
		}
		return ticks;
	}
	const ticks: { t: number; label: string }[] = [];
	for (let y = new Date(start).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= end; y++)
		ticks.push({ t: Date.UTC(y, 0, 1), label: String(y) });
	return ticks;
}

/** First index at or after t. */
export function lowerBound(points: Point[], t: number) {
	let low = 0;
	let high = points.length;
	while (low < high) {
		const middle = (low + high) >> 1;
		if (points[middle].t < t) low = middle + 1;
		else high = middle;
	}
	return low;
}

/** A line through the points in view. Past two points per pixel, each pixel column keeps only its low and high so spikes survive. */
export function linePath(
	points: Point[],
	from: number,
	to: number,
	x: (t: number) => number,
	y: (value: number) => number,
	width: number
) {
	const slice = points.slice(Math.max(0, from), Math.min(points.length, to));
	if (!slice.length) return '';
	const parts: string[] = [];
	const push = (point: Point) =>
		parts.push(`${x(point.t).toFixed(1)},${y(point.value).toFixed(1)}`);
	if (slice.length <= width * 2) {
		slice.forEach(push);
		return `M${parts.join('L')}`;
	}
	let column = -1;
	let low: Point | null = null;
	let high: Point | null = null;
	const flush = () => {
		if (!low || !high) return;
		const pair = low.t < high.t ? [low, high] : [high, low];
		pair.forEach(push);
	};
	for (const point of slice) {
		const at = Math.floor(x(point.t));
		if (at !== column) {
			flush();
			column = at;
			low = high = point;
			continue;
		}
		if (point.value < low!.value) low = point;
		if (point.value > high!.value) high = point;
	}
	flush();
	return `M${parts.join('L')}`;
}

/** A centred seven point average with its low to high band; the band is averaged once more so its edges ease instead of stepping. */
export function smoothSeries(points: Point[]): SmoothPoint[] {
	const around = <T>(index: number, read: (at: number) => T) => {
		const out: T[] = [];
		const last = Math.min(points.length - 1, index + HALF_WINDOW);
		for (let at = Math.max(0, index - HALF_WINDOW); at <= last; at++) out.push(read(at));
		return out;
	};
	const raw = points.map((_, index) => {
		const values = around(index, (at) => points[at].value);
		return {
			value: values.reduce((sum, value) => sum + value, 0) / values.length,
			low: Math.min(...values),
			high: Math.max(...values)
		};
	});
	return points.map((point, index) => {
		const near = around(index, (at) => raw[at]);
		return {
			t: point.t,
			value: raw[index].value,
			low: near.reduce((sum, entry) => sum + entry.low, 0) / near.length,
			high: near.reduce((sum, entry) => sum + entry.high, 0) / near.length
		};
	});
}
