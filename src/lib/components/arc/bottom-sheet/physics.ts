export type DragSample = { time: number; y: number };

/** The limit an upward stretch approaches past the tallest detent. */
const STRETCH = 120;
const RESISTANCE = 0.55;
const VELOCITY_WINDOW_MS = 80;
const RELEASE_PAUSE_MS = 60;
const MS_PER_SECOND = 1000;

/** iOS-style resistance: follows the finger at first, then approaches STRETCH. */
export function rubber(distance: number) {
	return (1 - 1 / ((distance * RESISTANCE) / STRETCH + 1)) * STRETCH;
}

export function unrubber(stretch: number) {
	return ((1 / (1 - Math.min(stretch, STRETCH - 1) / STRETCH) - 1) * STRETCH) / RESISTANCE;
}

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function velocityOf(samples: DragSample[], now: number) {
	const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW_MS);
	const first = recent[0];
	const last = recent[recent.length - 1];
	// A pause before letting go drops the momentum, so a slow, deliberate release settles where it is.
	if (!first || !last || last === first || now - last.time > RELEASE_PAUSE_MS) return 0;
	return (last.y - first.y) / ((last.time - first.time) / MS_PER_SECOND);
}
