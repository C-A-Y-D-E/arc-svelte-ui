export interface TreemapNode {
	/** Stable identity, unique in the tree. A tile that survives a data change morphs to its new size. */
	id: string;
	label: string;
	/** Leaf size. A branch's size is the sum of its children. */
	value?: number;
	/** Optional second measure for shading, such as growth. A branch uses the size weighted mean of its children. */
	color?: number;
	children?: TreemapNode[];
}

export type Rect = { x: number; y: number; w: number; h: number };
export type FlatNode = {
	id: string;
	label: string;
	value: number;
	color: number | null;
	depth: number;
	parent: string | null;
	children: string[];
	path: string[];
};

const GAP = 2;
const PAD = 3;
const HEADER = 22;
const MIN_HEADER_HEIGHT = 48;
const MIN_HEADER_WIDTH = 64;

const inset = (r: Rect, top: number, side: number): Rect => ({
	x: r.x + side,
	y: r.y + top,
	w: Math.max(0, r.w - side * 2),
	h: Math.max(0, r.h - top - side)
});

export function flatten(root: TreemapNode) {
	const flat = new Map<string, FlatNode>();
	const visit = (node: TreemapNode, depth: number, parent: string | null, path: string[]) => {
		const kids = node.children ?? [];
		let value = 0;
		let weighted = 0;
		let colored = 0;
		if (kids.length) {
			for (const kid of kids) {
				const sums = visit(kid, depth + 1, node.id, depth === 0 ? [] : [...path, node.label]);
				value += sums.value;
				weighted += sums.weighted;
				colored += sums.colored;
			}
		} else {
			value = Math.max(0, node.value ?? 0);
			if (node.color !== undefined && Number.isFinite(node.color)) {
				weighted = node.color * value;
				colored = value;
			}
		}
		flat.set(node.id, {
			id: node.id,
			label: node.label,
			value,
			color: colored ? weighted / colored : null,
			depth,
			parent,
			children: kids.map((kid) => kid.id),
			path: depth === 0 ? [node.label] : [...path, node.label]
		});
		return { value, weighted, colored };
	};
	visit(root, 0, null, []);
	return flat;
}

/** Squarified layout: rows of tiles along the short side, each row closed when adding a tile would make the worst aspect ratio worse. */
function squarify(items: { id: string; value: number }[], rect: Rect, out: Map<string, Rect>) {
	const list = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
	const total = list.reduce((sum, item) => sum + item.value, 0);
	const collapsed = { x: rect.x, y: rect.y, w: 0, h: 0 };
	if (!total || rect.w <= 0 || rect.h <= 0) {
		for (const item of items) out.set(item.id, collapsed);
		return;
	}
	const scale = (rect.w * rect.h) / total;
	let { x, y, w, h } = rect;
	let i = 0;
	const worst = (row: number[], side: number) => {
		const sum = row.reduce((a, b) => a + b, 0);
		const max = Math.max(...row);
		const min = Math.min(...row);
		return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
	};
	while (i < list.length) {
		const side = Math.min(w, h);
		const row: number[] = [list[i].value * scale];
		let j = i + 1;
		while (j < list.length) {
			const next = [...row, list[j].value * scale];
			if (worst(next, side) > worst(row, side)) break;
			row.push(list[j].value * scale);
			j++;
		}
		const sum = row.reduce((a, b) => a + b, 0);
		if (w >= h) {
			const cw = sum / h;
			let cy = y;
			for (let k = i; k < j; k++) {
				const th = (list[k].value * scale) / cw;
				out.set(list[k].id, { x, y: cy, w: cw, h: th });
				cy += th;
			}
			x += cw;
			w -= cw;
		} else {
			const rh = sum / w;
			let cx = x;
			for (let k = i; k < j; k++) {
				const tw = (list[k].value * scale) / rh;
				out.set(list[k].id, { x: cx, y, w: tw, h: rh });
				cx += tw;
			}
			y += rh;
			h -= rh;
		}
		i = j;
	}
	for (const item of items) if (!out.has(item.id)) out.set(item.id, collapsed);
}

/** Rects of every descendant when `focus` fills the view: its children fill the view, and each branch holds its own children under a header. */
export function layoutFrom(flat: Map<string, FlatNode>, focus: string, view: Rect) {
	const out = new Map<string, Rect>();
	const nest = (id: string, rect: Rect, top: boolean) => {
		const node = flat.get(id)!;
		if (!node.children.length) return;
		const hasHeader = rect.h > MIN_HEADER_HEIGHT && rect.w > MIN_HEADER_WIDTH;
		const room = top ? rect : inset(rect, hasHeader ? HEADER : PAD, PAD);
		const placed = new Map<string, Rect>();
		squarify(
			node.children.map((child) => ({ id: child, value: flat.get(child)!.value })),
			room,
			placed
		);
		for (const [child, r] of placed) {
			const gapped = {
				x: r.x + GAP / 2,
				y: r.y + GAP / 2,
				w: Math.max(0, r.w - GAP),
				h: Math.max(0, r.h - GAP)
			};
			out.set(child, gapped);
			nest(child, gapped, false);
		}
	};
	nest(focus, view, true);
	return out;
}

/** The affine map that carries rect `from` onto rect `to`, applied to `r`. */
export function carry(r: Rect, from: Rect, to: Rect): Rect {
	const sx = to.w / (from.w || 1);
	const sy = to.h / (from.h || 1);
	return { x: to.x + (r.x - from.x) * sx, y: to.y + (r.y - from.y) * sy, w: r.w * sx, h: r.h * sy };
}

export function isUnder(flat: Map<string, FlatNode>, id: string, ancestor: string) {
	for (let at = flat.get(id); at; at = at.parent ? flat.get(at.parent) : undefined) {
		if (at.id === ancestor) return true;
	}
	return false;
}
