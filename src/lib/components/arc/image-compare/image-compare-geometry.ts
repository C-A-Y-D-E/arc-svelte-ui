/** Frame size and caption chip sizes, in px. */
export type FrameMetrics = {
	width: number;
	height: number;
	beforeChipWidth: number;
	beforeChipHeight: number;
	afterChipWidth: number;
	afterChipHeight: number;
};
export type Point = [x: number, y: number];

/** Rubber-band travel past an edge, in px. */
const STRETCH_PX = 9;
const STRETCH_RESISTANCE = 0.55;
/** The handle's inset from the frame, and how far it gives inside that inset. */
const HANDLE_MARGIN_PX = 42;
const HANDLE_GIVE_PX = 12;
/** Room over which a caption fades out as the divider reaches it. */
const CAPTION_FADE_PX = 28;
/** A spring period of 1.2x the visual duration matches Motion's time-defined springs. */
const PERIOD_PER_VISUAL_DURATION = 1.2;
const SPRING_REST_DELTA = 0.002;
const SPRING_REST_SPEED = 0.02;

export const clamp = (value: number, low: number, high: number) =>
	Math.min(high, Math.max(low, value));
export const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** Motion drops velocity on time-defined springs, so hand-offs run the same springs written as stiffness and damping, settling far below a pixel. */
export function physicalSpring({
	visualDuration,
	bounce
}: {
	visualDuration: number;
	bounce: number;
}) {
	const angularFrequency = (2 * Math.PI) / (visualDuration * PERIOD_PER_VISUAL_DURATION);
	return {
		type: 'spring' as const,
		stiffness: angularFrequency * angularFrequency,
		damping: 2 * (1 - bounce) * angularFrequency,
		restDelta: SPRING_REST_DELTA,
		restSpeed: SPRING_REST_SPEED
	};
}

/** iOS style resistance: travel past a limit gives less and less, and never more than `limit` pixels. */
export const rubber = (distance: number, limit = STRETCH_PX) =>
	Math.sign(distance) * (1 - 1 / ((Math.abs(distance) * STRETCH_RESISTANCE) / limit + 1)) * limit;

/** The handle keeps the line's pace in the middle and slows smoothly near an edge, so it is never cut off and never stops dead. */
const give = (distance: number) => HANDLE_GIVE_PX * (1 - 1 / (distance / HANDLE_GIVE_PX + 1));

export function soften(at: number, size: number) {
	if (at < HANDLE_MARGIN_PX) return HANDLE_MARGIN_PX - give(HANDLE_MARGIN_PX - at);
	if (at > size - HANDLE_MARGIN_PX)
		return size - HANDLE_MARGIN_PX + give(at - size + HANDLE_MARGIN_PX);
	return at;
}

export const fade = (room: number) => clamp(room / CAPTION_FADE_PX, 0, 1);

/** The before side of a line through `center` at `angle`, cut from the frame: the clip while the divider turns. */
export function halfPlane(width: number, height: number, center: Point, angle: number) {
	const normalX = -Math.cos(angle);
	const normalY = -Math.sin(angle);
	const side = ([x, y]: Point) => (x - center[0]) * normalX + (y - center[1]) * normalY;
	const corners: Point[] = [
		[0, 0],
		[width, 0],
		[width, height],
		[0, height]
	];
	const points: Point[] = [];
	corners.forEach((corner, cornerIndex) => {
		const next = corners[(cornerIndex + 1) % corners.length];
		const a = side(corner);
		const b = side(next);
		if (a >= 0) points.push(corner);
		if (a >= 0 !== b >= 0) {
			const t = a / (a - b);
			points.push([corner[0] + (next[0] - corner[0]) * t, corner[1] + (next[1] - corner[1]) * t]);
		}
	});
	if (!points.length) return 'inset(50%)';
	return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(', ')})`;
}
