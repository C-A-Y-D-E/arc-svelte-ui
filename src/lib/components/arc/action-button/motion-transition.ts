import { animate, calcGeneratorDuration, spring } from 'motion';
import type { AnimationOptions, DOMKeyframesDefinition } from 'motion';
import type { TransitionConfig } from 'svelte/transition';

const MS_PER_SECOND = 1000;
/** Motion's own default tween length. */
const DEFAULT_DURATION_S = 0.3;

type Timing = {
	type?: unknown;
	duration?: number;
	delay?: number;
	visualDuration?: number;
	bounce?: number;
	stiffness?: number;
	damping?: number;
	mass?: number;
};

function settleMs({ type, delay = 0, duration, ...springOptions }: Timing) {
	const delayMs = delay * MS_PER_SECOND;
	if (type !== 'spring') return delayMs + (duration ?? DEFAULT_DURATION_S) * MS_PER_SECOND;
	return delayMs + calcGeneratorDuration(spring({ ...springOptions, keyframes: [0, 1] }));
}

/** How long a Motion transition runs, counting per-value overrides such as `{ scale: spring, opacity: { duration } }`. */
function transitionMs(transition: AnimationOptions) {
	const perValue = Object.values(transition).filter(
		(value): value is Timing => typeof value === 'object' && value !== null && !Array.isArray(value)
	);
	return Math.max(settleMs(transition as Timing), ...perValue.map(settleMs));
}

export type MotionTransitionParams = {
	keyframes: DOMKeyframesDefinition;
	transition: AnimationOptions;
};

/**
 * Runs a Motion animation from an in:/out: directive, so Arc's springs and per-value timing carry over as they are.
 * Svelte keeps a leaving node until the slowest value settles.
 */
export function motionTransition(
	node: Element,
	{ keyframes, transition }: MotionTransitionParams
): TransitionConfig {
	animate(node, keyframes, transition);
	return { duration: transitionMs(transition) };
}
