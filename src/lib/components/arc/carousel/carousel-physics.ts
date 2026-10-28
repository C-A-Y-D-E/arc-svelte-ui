export type PointerSample = [time: number, clientX: number];
export type TrackBounds = { min: number; max: number };

const MS_PER_SECOND = 1000;
const PAGING_DECELERATION = 0.995;
const ELASTIC_RESISTANCE = 0.55;
/** Only the last stretch of a drag counts toward its release speed. */
const VELOCITY_WINDOW_MS = 90;
/** A pointer that rested this long before letting go was placed, not flicked. */
const RESTING_RELEASE_MS = 50;

export const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/** Momentum projection with a paging deceleration rate: where a flick would come to rest. */
export const projectMomentum = (velocity: number, rate = PAGING_DECELERATION) =>
	((velocity / MS_PER_SECOND) * rate) / (1 - rate);

/** Past an edge every pixel costs more, like pulling against elastic. */
const rubber = (overshoot: number, dimension: number) =>
	(overshoot * dimension * ELASTIC_RESISTANCE) / (dimension + ELASTIC_RESISTANCE * overshoot);

const unrubber = (distance: number, dimension: number) =>
	(distance * dimension) / (ELASTIC_RESISTANCE * Math.max(1, dimension - distance));

/** Where the track shows a raw drag offset, with elastic resistance past either end. */
export function band(raw: number, { min, max }: TrackBounds, size: number) {
	if (raw > max) return max + rubber(raw - max, size);
	if (raw < min) return min - rubber(min - raw, size);
	return raw;
}

/** The raw drag offset that puts the track where it is shown now. */
export function unband(shown: number, { min, max }: TrackBounds, size: number) {
	if (shown > max) return max + unrubber(shown - max, size);
	if (shown < min) return min - unrubber(min - shown, size);
	return shown;
}

/** Release speed in px/s over the last few pointer samples. */
export function velocityOf(samples: PointerSample[], now: number) {
	const recent = samples.filter(([time]) => now - time <= VELOCITY_WINDOW_MS);
	if (recent.length < 2 || now - recent[recent.length - 1][0] > RESTING_RELEASE_MS) return 0;
	const [firstTime, firstX] = recent[0];
	const [lastTime, lastX] = recent[recent.length - 1];
	return lastTime > firstTime ? (lastX - firstX) / ((lastTime - firstTime) / MS_PER_SECOND) : 0;
}
