import type { DonutChartDatum } from './DonutChart.svelte';

export type Slice = {
	key: string;
	label: string;
	value: number;
	color?: string;
	members?: DonutChartDatum[];
};
/** Turns of the ring, clockwise from the top. */
export type SegmentArc = { start: number; end: number };

export const OTHER_KEY = '__other';
export const TAU = Math.PI * 2;

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const TINY_SHARE = 0.01;

export const formatGrouped = (value: number) => grouped.format(value);
export const shareText = (share: number) =>
	share > 0 && share < TINY_SHARE ? '<1%' : percent.format(share);
export const round2 = (value: number) => (Math.round(value * 100) / 100).toString();

/** Small parts join one "Other" segment, but only when at least two would; grouping a single part hides it for nothing. */
export function sliceData(
	data: DonutChartDatum[],
	groupBelow: number,
	maxSegments: number,
	otherLabel: string
): Slice[] {
	const parts = data.filter((item) => item.value > 0);
	const total = parts.reduce((sum, item) => sum + item.value, 0);
	if (!total) return [];
	const ranked = [...parts].sort((a, b) => b.value - a.value);
	const keep = new Set(
		ranked
			.filter((item, rank) => item.value / total >= groupBelow && rank < maxSegments - 1)
			.map((item) => item.key)
	);
	const rest = parts.filter((item) => !keep.has(item.key));
	if (rest.length < 2) return parts.map((item) => ({ ...item }));
	const other = {
		key: OTHER_KEY,
		label: otherLabel,
		value: rest.reduce((sum, item) => sum + item.value, 0),
		members: rest
	};
	return [...parts.filter((item) => keep.has(item.key)).map((item) => ({ ...item })), other];
}

/** Turns of the ring for each slice in data order; a hidden slice closes to a point where it sits. */
export function layout(slices: Slice[], hidden: Set<string>) {
	const total = slices.reduce((sum, item) => sum + (hidden.has(item.key) ? 0 : item.value), 0) || 1;
	let at = 0;
	return new Map<string, SegmentArc>(
		slices.map((item) => {
			const arc = { start: at, end: at + (hidden.has(item.key) ? 0 : item.value / total) };
			at = arc.end;
			return [item.key, arc];
		})
	);
}

/** Half the width, in pixels, of a sector's outer edge once the gap is cut; below a couple of pixels a segment fades rather than drawing a hairline. */
export function breadth(R: number, t0: number, t1: number, gap: number) {
	const turns = t1 - t0;
	if (turns >= 1 - 1e-6) return Infinity;
	return (
		Math.sin(Math.min(turns * Math.PI, Math.PI / 2)) * R -
		Math.min(gap / 2, ((1 - turns) * TAU * R) / 2)
	);
}

/**
 * An annular sector between two turns of the ring, measured clockwise from the top, with rounded corners.
 * Its sides run parallel to the radius at a fixed distance, so the gap between neighbours is the same number of pixels from the inner edge to the outer one.
 * A thin sector narrows to a wedge and then to nothing, so a closing segment never pops.
 */
export function sector(
	c: number,
	R: number,
	r: number,
	t0: number,
	t1: number,
	gap: number,
	corner: number
) {
	const turns = t1 - t0;
	if (turns <= 1e-6) return '';
	const at = (radius: number, angle: number) =>
		`${round2(c + radius * Math.cos(angle))} ${round2(c + radius * Math.sin(angle))}`;
	if (turns >= 1 - 1e-6)
		return `M${at(R, -Math.PI / 2)}A${round2(R)} ${round2(R)} 0 1 1 ${at(R, Math.PI / 2)}A${round2(R)} ${round2(R)} 0 1 1 ${at(R, -Math.PI / 2)}ZM${at(r, -Math.PI / 2)}A${round2(r)} ${round2(r)} 0 1 0 ${at(r, Math.PI / 2)}A${round2(r)} ${round2(r)} 0 1 0 ${at(r, -Math.PI / 2)}Z`;
	// Half the gap on each side; a lone segment closes its gap as the rest of the ring empties, so it becomes a whole ring without a jump.
	const p = Math.min(gap / 2, ((1 - turns) * TAU * R) / 2);
	const a0 = t0 * TAU - Math.PI / 2,
		a1 = t1 * TAU - Math.PI / 2,
		half = (a1 - a0) / 2,
		s = Math.sin(Math.min(half, Math.PI / 2));
	if (s * R <= p + 1e-6) return '';
	const side = (t: number, angle: number, sign: number) =>
		`${round2(c + t * Math.cos(angle) - sign * p * Math.sin(angle))} ${round2(c + t * Math.sin(angle) + sign * p * Math.cos(angle))}`;
	const band = (R - r) / 2;
	const ro = Math.max(0, Math.min(corner, band, s >= 0.9999 ? Infinity : (s * R - p) / (1 + s)));
	const dO = Math.asin(Math.min(1, (p + ro) / (R - ro))),
		tO = Math.sqrt(Math.max(0, (R - ro) ** 2 - (p + ro) ** 2));
	const bigO = a1 - a0 - 2 * dO > Math.PI ? 1 : 0;
	let d = `M${side(tO, a0, 1)}`;
	if (ro > 0.01) d += `A${round2(ro)} ${round2(ro)} 0 0 1 ${at(R, a0 + dO)}`;
	d += `A${round2(R)} ${round2(R)} 0 ${bigO} 1 ${at(R, a1 - dO)}`;
	if (ro > 0.01) d += `A${round2(ro)} ${round2(ro)} 0 0 1 ${side(tO, a1, -1)}`;
	if (s * r > p + 1e-6 || s >= 0.9999) {
		const ri = Math.max(0, Math.min(corner, band, s >= 0.9999 ? Infinity : (s * r - p) / (1 - s)));
		const dI = Math.asin(Math.min(1, (p + ri) / (r + ri))),
			tI = Math.sqrt(Math.max(0, (r + ri) ** 2 - (p + ri) ** 2));
		const bigI = a1 - a0 - 2 * dI > Math.PI ? 1 : 0;
		d += `L${side(tI, a1, -1)}`;
		if (ri > 0.01) d += `A${round2(ri)} ${round2(ri)} 0 0 1 ${at(r, a1 - dI)}`;
		d += `A${round2(r)} ${round2(r)} 0 ${bigI} 0 ${at(r, a0 + dI)}`;
		if (ri > 0.01) d += `A${round2(ri)} ${round2(ri)} 0 0 1 ${side(tI, a0, 1)}`;
	} else d += `L${at(p / s, (a0 + a1) / 2)}`;
	return `${d}Z`;
}

/** Leaving slices stay in their old place (after the nearest survivor before them) so they can close there. */
export function keepLeaving(drawn: Slice[], slices: Slice[]) {
	const next = [...slices];
	drawn.forEach((item, index) => {
		if (next.some((slice) => slice.key === item.key)) return;
		const before = drawn
			.slice(0, index)
			.reverse()
			.find((prior) => next.some((slice) => slice.key === prior.key));
		next.splice(before ? next.findIndex((slice) => slice.key === before.key) + 1 : 0, 0, {
			...item,
			value: 0
		});
	});
	return next;
}

export function memberSummary(item: Slice) {
	if (!item.members) return null;
	const names = item.members.map((member) => member.label);
	return names.length > 2
		? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
		: names.join(' and ');
}
