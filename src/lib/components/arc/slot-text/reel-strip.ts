const DIGITS = '0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const DIGIT_COUNT = 10;
const FILLERS_PER_SPIN = 5;
const MIN_FILLERS = 2;

const classOf = (char: string) =>
	DIGITS.includes(char)
		? DIGITS
		: LOWER.includes(char)
			? LOWER
			: UPPER.includes(char)
				? UPPER
				: null;

/** Deterministic shuffle so the same change always spins the same letters. */
function seeded(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function digitStrip(from: string, to: string, spins: number, rising: boolean) {
	const start = Number(from);
	const end = Number(to);
	const distance = rising
		? (end - start + DIGIT_COUNT) % DIGIT_COUNT
		: (start - end + DIGIT_COUNT) % DIGIT_COUNT;
	const steps = spins * DIGIT_COUNT + distance;
	return Array.from({ length: steps + 1 }, (_, i) =>
		String((start + (rising ? i : -i) + 100) % DIGIT_COUNT)
	);
}

/** The reel's cells, from what is visible now to the target. */
export function buildStrip(from: string, to: string, spins: number, rising: boolean, seed: number) {
	if (from === to) return [to];
	const set = classOf(to);
	if (!set) return [from, to];
	if (set === DIGITS && classOf(from) === DIGITS) return digitStrip(from, to, spins, rising);
	const random = seeded(seed);
	const fillers = Array.from(
		{ length: Math.max(MIN_FILLERS, spins * FILLERS_PER_SPIN + MIN_FILLERS) },
		() => set[Math.floor(random() * set.length)]
	);
	return [from, ...fillers, to];
}
