import { calcGeneratorDuration, spring } from 'motion';

type SpringOptions = {
	visualDuration?: number;
	bounce?: number;
	stiffness?: number;
	damping?: number;
	mass?: number;
};

const MS_PER_SECOND = 1000;

/**
 * A Motion spring as a Svelte easing, for transitions and `animate:` directives that need the spring's shape.
 * Duration is the time the spring takes to settle, in seconds; the curve may overshoot 1 when the spring bounces.
 */
export function springEasing(options: SpringOptions) {
	const generator = spring({ ...options, keyframes: [0, 1] });
	const settleMs = calcGeneratorDuration(generator);
	return {
		duration: settleMs / MS_PER_SECOND,
		easing: (t: number) => generator.next(t * settleMs).value
	};
}
