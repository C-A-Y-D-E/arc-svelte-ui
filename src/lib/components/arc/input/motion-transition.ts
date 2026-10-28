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

function settleMs(timing: Timing) {
	const delay = (timing.delay ?? 0) * MS_PER_SECOND;
	if (timing.type !== 'spring')
		return delay + (timing.duration ?? DEFAULT_DURATION_S) * MS_PER_SECOND;
	return delay + springCurve(timing).duration;
}

/** How long a Motion transition runs, counting per-value overrides such as `{ height: spring, opacity: { duration } }`. */
function transitionMs(transition: AnimationOptions) {
	const perValue = Object.values(transition).filter(
		(value): value is Timing => typeof value === 'object' && value !== null && !Array.isArray(value)
	);
	return Math.max(settleMs(transition as Timing), ...perValue.map(settleMs));
}

export type MotionTransitionParams = {
	keyframes: DOMKeyframesDefinition;
	transition: AnimationOptions;
	/** Takes the node out of flow while it leaves, like AnimatePresence mode="popLayout". Needs a positioned parent. */
	pop?: boolean;
};

/**
 * Runs a Motion animation from an in:/out: directive, so Arc's springs and per-value timing carry over as they are.
 * Svelte keeps a leaving node until the slowest value settles.
 */
export function motionTransition(
	node: Element,
	{ keyframes, transition, pop = false }: MotionTransitionParams
): TransitionConfig {
	if (pop && node instanceof HTMLElement) popOutOfFlow(node);
	animate(node, keyframes, transition);
	return { duration: transitionMs(transition) };
}

function popOutOfFlow(node: HTMLElement) {
	const { offsetLeft, offsetTop, offsetWidth } = node;
	Object.assign(node.style, {
		position: 'absolute',
		left: `${offsetLeft}px`,
		top: `${offsetTop}px`,
		width: `${offsetWidth}px`
	});
}

/** A Motion spring as a Svelte duration (ms) and easing curve, for animate:flip and CSS-driven transitions. */
export function springCurve({ visualDuration, bounce, stiffness, damping, mass }: Timing) {
	const generator = spring({ keyframes: [0, 1], visualDuration, bounce, stiffness, damping, mass });
	const duration = calcGeneratorDuration(generator);
	return { duration, easing: (t: number) => generator.next(t * duration).value };
}
