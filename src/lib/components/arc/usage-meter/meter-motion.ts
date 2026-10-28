import {
	calcGeneratorDuration,
	cancelFrame,
	frame,
	spring,
	type ValueAnimationOptions
} from 'motion';
import type { TransitionConfig } from 'svelte/transition';
import { isReducedMotion, motionTokens } from '../motion';

type SpringShape = { visualDuration: number; bounce: number };
type SpringOptions = Omit<ValueAnimationOptions<number>, 'keyframes'>;

const DEFAULT_REST_DELTA = 0.001;
/** Rest thresholds for a spring normalised to run from 0 to 1. */
const NORMALISED_REST = 0.001;

/** Motion drops inherited velocity on time-defined springs, so values that retarget mid-flight run the same springs written as stiffness and damping. */
export function physical({ visualDuration, bounce }: SpringShape, restDelta = DEFAULT_REST_DELTA) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring' as const,
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		restDelta,
		restSpeed: restDelta * 2
	};
}

export const fit = physical(motionTokens.spring.morph, 0.01);

/** A spring as a duration (ms) and an easing curve, for Svelte transitions that cannot run Motion's springs themselves. */
export function springTiming(options: SpringOptions) {
	const generator = spring({
		...options,
		restDelta: NORMALISED_REST,
		restSpeed: NORMALISED_REST * 2,
		keyframes: [0, 1]
	});
	const duration = calcGeneratorDuration(generator);
	return { duration, easing: (progress: number) => generator.next(progress * duration).value };
}

/** Starts animations on the next frame, so the update that caused them never swallows a spring's first frames. Returns a cleanup. */
export function soon(start: () => { stop: () => void }) {
	let controls: { stop: () => void } | null = null;
	const run = () => {
		controls = start();
	};
	frame.update(run);
	return () => {
		cancelFrame(run);
		controls?.stop();
	};
}

const fitTiming = springTiming(fit);

/** New ticker columns open from zero width and removed ones close, on the width spring. */
export function openColumn(node: HTMLElement): TransitionConfig {
	if (isReducedMotion()) return { duration: 0 };
	const width = node.getBoundingClientRect().width;
	return {
		...fitTiming,
		css: (t) => `width:${Math.max(0, t) * width}px;opacity:${Math.min(1, Math.max(0, t))}`
	};
}
