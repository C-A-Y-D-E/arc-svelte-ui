import { mix } from '../brush-chart/chart-motion.svelte';

export type Stats = {
	q1: number;
	median: number;
	q3: number;
	min: number;
	max: number;
	n: number;
	sorted: number[];
};
export type Shape = {
	xs: number[];
	ys: number[];
	row: number;
	q1: number;
	median: number;
	q3: number;
};

export const SAMPLES = 96;
/** The kernel is cut off this many bandwidths out, where it no longer adds anything visible. */
const KERNEL_REACH = 5;

function quantile(sorted: number[], q: number) {
	if (!sorted.length) return 0;
	const at = (sorted.length - 1) * q;
	const low = Math.floor(at);
	const high = Math.ceil(at);
	return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

export function statsOf(values: number[]): Stats {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	return {
		sorted,
		n: sorted.length,
		min: sorted[0] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		q1: quantile(sorted, 0.25),
		median: quantile(sorted, 0.5),
		q3: quantile(sorted, 0.75)
	};
}

/** Silverman's rule of thumb for the kernel bandwidth. */
export function silverman(stats: Stats) {
	if (stats.n < 2) return 1;
	const mean = stats.sorted.reduce((sum, value) => sum + value, 0) / stats.n;
	const sd = Math.sqrt(
		stats.sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (stats.n - 1)
	);
	const spread = Math.min(sd, (stats.q3 - stats.q1) / 1.34 || sd);
	return Math.max(1e-6, 0.9 * (spread || 1) * Math.pow(stats.n, -0.2));
}

export function niceStep(span: number, count: number) {
	const raw = span / Math.max(1, count) || 1;
	const power = Math.pow(10, Math.floor(Math.log10(raw)));
	const unit = raw / power;
	// Round up, so the axis never gets more ticks than asked for and its labels never collide.
	const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
	return nice * power;
}

export function sampleXs(lo: number, hi: number) {
	return Array.from({ length: SAMPLES }, (_, i) => lo + ((hi - lo) * i) / (SAMPLES - 1));
}

/** Samples a Gaussian kernel density across the domain. */
export function density(stats: Stats, lo: number, hi: number, bandwidth: number) {
	const xs = sampleXs(lo, hi);
	const norm = 1 / (Math.max(1, stats.n) * bandwidth * Math.sqrt(2 * Math.PI));
	const ys = xs.map((x) => {
		let sum = 0;
		for (const value of stats.sorted) {
			const u = (x - value) / bandwidth;
			if (u > -KERNEL_REACH && u < KERNEL_REACH) sum += Math.exp(-0.5 * u * u);
		}
		return sum * norm;
	});
	return { xs, ys };
}

export function heightAt(shape: Shape, x: number) {
	const { xs, ys } = shape;
	if (x <= xs[0] || x >= xs[xs.length - 1]) return 0;
	let i = 1;
	while (i < xs.length - 1 && xs[i] < x) i++;
	const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
	return mix(ys[i - 1], ys[i], t);
}

const NICE_TICKS = 5;
const ROOM_BANDWIDTHS = 2.5;

/** One density per series on a shared domain, scaled so the tallest peak of all reaches 1. */
export function buildRidges(
	series: { id: string; values: number[] }[],
	domain: [number, number] | undefined,
	bandwidth: number | undefined
) {
	const stats = series.map((entry) => statsOf(entry.values));
	const widths = stats.map((entry) => bandwidth ?? silverman(entry));
	const filled = stats
		.map((entry, index) => ({ entry, room: ROOM_BANDWIDTHS * widths[index] }))
		.filter(({ entry }) => entry.n);
	let lo = domain?.[0] ?? Math.min(...filled.map(({ entry, room }) => entry.min - room));
	let hi = domain?.[1] ?? Math.max(...filled.map(({ entry, room }) => entry.max + room));
	if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
		lo = 0;
		hi = 1;
	}
	if (!domain) {
		const step = niceStep(hi - lo, NICE_TICKS);
		lo = Math.floor(lo / step) * step;
		hi = Math.ceil(hi / step) * step;
	}
	const curves = stats.map((entry, index) =>
		entry.n
			? density(entry, lo, hi, widths[index])
			: { xs: sampleXs(lo, hi), ys: new Array<number>(SAMPLES).fill(0) }
	);
	const peak = Math.max(1e-9, ...curves.flatMap((curve) => curve.ys));
	const shapes = new Map<string, Shape>(
		series.map((entry, index) => [
			entry.id,
			{
				xs: curves[index].xs,
				ys: curves[index].ys.map((y) => y / peak),
				row: index,
				q1: stats[index].q1,
				median: stats[index].median,
				q3: stats[index].q3
			}
		])
	);
	return { stats: new Map(series.map((entry, index) => [entry.id, stats[index]])), shapes, lo, hi };
}
