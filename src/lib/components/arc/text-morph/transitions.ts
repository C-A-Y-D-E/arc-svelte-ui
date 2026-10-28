import { calcGeneratorDuration, spring } from 'motion';
import type { AnimationConfig } from 'svelte/animate';
import type { TransitionConfig } from 'svelte/transition';
import { ease, isReducedMotion, motionTokens } from '../motion';

export type SpringOptions = {
	visualDuration?: number;
	bounce?: number;
	stiffness?: number;
	damping?: number;
	mass?: number;
};

type SpringCurve = { durationMs: number; at: (elapsedMs: number) => number };

const MS_PER_SECOND = 1000;
const curves = new WeakMap<SpringOptions, SpringCurve>();

/** A Motion spring from 0 to 1 sampled over time, so Svelte transitions and animations can ride Arc's springs. It may overshoot 1. */
export function springCurve(options: SpringOptions): SpringCurve {
	let curve = curves.get(options);
	if (curve) return curve;
	const generator = spring({ ...options, keyframes: [0, 1] });
	curve = { durationMs: calcGeneratorDuration(generator), at: (ms) => generator.next(ms).value };
	curves.set(options, curve);
	return curve;
}

/** Duration springs restated as stiffness and damping, so every retarget keeps the velocity already in flight. */
export function physicalSpring(visualDuration: number, bounce: number) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring',
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		mass: 1
	} as const;
}

export type MotionPresenceParams = {
	opacity?: number;
	x?: number;
	y?: number;
	scale?: number;
	blur?: number;
	/** Reads x and y in em of the element's font size, like Motion's "0.3em" offsets. */
	em?: boolean;
	/** Seconds. Opacity and blur always use it; so do x, y and scale unless a spring is given. */
	duration?: number;
	/** Seconds. */
	delay?: number;
	easing?: (t: number) => number;
	/** Moves and scales on this spring while opacity and blur keep the duration. */
	spring?: SpringOptions;
	/** Takes the element out of flow while it leaves, like AnimatePresence mode="popLayout". Needs a positioned parent. */
	pop?: boolean;
	/** Seconds of the plain fade used under reduced motion. */
	reducedFade?: number;
};

/**
 * Presence with Motion's per-value transitions: the params describe the hidden state, transforms may ride a spring,
 * and offsets may be in em. Reduced motion keeps a short fade only.
 */
export function motionPresence(
	node: Element,
	params: MotionPresenceParams = {},
	options?: { direction?: 'in' | 'out' | 'both' }
): TransitionConfig {
	const {
		opacity = 0,
		x = 0,
		y = 0,
		scale = 1,
		blur = 0,
		em = false,
		duration = motionTokens.duration.standard,
		delay = 0,
		easing = ease.enter,
		spring: springOptions,
		pop = false,
		reducedFade = motionTokens.duration.instant
	} = params;
	const popStyle = pop ? 'position:absolute;' : '';
	if (isReducedMotion()) {
		return {
			duration: reducedFade * MS_PER_SECOND,
			css: (t) => `${popStyle}opacity:${opacity + (1 - opacity) * t}`
		};
	}
	const unit = em ? parseFloat(getComputedStyle(node).fontSize) || 16 : 1;
	const fadeMs = duration * MS_PER_SECOND;
	const curve = springOptions ? springCurve(springOptions) : undefined;
	const totalMs = Math.max(fadeMs, curve?.durationMs ?? 0);
	const leaving = options?.direction === 'out';
	/** How hidden the element is, from 1 (hidden state) to 0 (resting), at a point in the transition's own time. */
	const hiddenness = (elapsedMs: number, curveAt: (ms: number) => number) =>
		leaving ? curveAt(elapsedMs) : 1 - curveAt(elapsedMs);
	const fadeAt = (ms: number) => easing(Math.min(1, ms / fadeMs));
	const moveAt = curve ? curve.at : fadeAt;
	return {
		delay: delay * MS_PER_SECOND,
		duration: totalMs,
		css: (t) => {
			const elapsed = (leaving ? 1 - t : t) * totalMs;
			const faded = hiddenness(elapsed, fadeAt);
			const moved = hiddenness(elapsed, moveAt);
			return (
				`${popStyle}opacity:${1 + (opacity - 1) * faded};` +
				`transform:translate(${x * unit * moved}px, ${y * unit * moved}px) scale(${1 + (scale - 1) * moved});` +
				(blur ? `filter:blur(${blur * faded}px);` : '')
			);
		}
	};
}

/** Svelte's flip on one of Arc's springs, for keyed lists whose items glide to new places. */
export function springFlip(
	node: Element,
	{ from, to }: { from: DOMRect; to: DOMRect },
	params: { spring?: SpringOptions } = {}
): AnimationConfig {
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	if ((!dx && !dy) || isReducedMotion()) return { duration: 0 };
	const curve = springCurve(params.spring ?? motionTokens.spring.morph);
	const style = getComputedStyle(node);
	const base = style.transform === 'none' ? '' : style.transform;
	return {
		duration: curve.durationMs,
		css: (t) => {
			const remaining = 1 - curve.at(t * curve.durationMs);
			return `transform:${base} translate(${dx * remaining}px, ${dy * remaining}px);`;
		}
	};
}
