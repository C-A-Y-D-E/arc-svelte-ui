import { spring } from 'motion';
import type { TransitionConfig } from 'svelte/transition';
import { isReducedMotion, motionTokens, presence, type PresenceParams } from '../motion';

type SpringShape = { visualDuration: number; bounce: number };

const SAMPLE_MS = 10;
const MAX_SETTLE_MS = 3000;
const MS_PER_SECOND = 1000;
const FALLBACK_FONT_PX = 16;

/**
 * A Motion spring sampled into an easing curve, so Svelte transitions can ride the same spring
 * (overshoot included). Duration is in seconds, like the presence params.
 */
export function springEasing({ visualDuration, bounce }: SpringShape) {
	const generator = spring({ keyframes: [0, 1], visualDuration, bounce });
	let settleMs = 0;
	while (settleMs < MAX_SETTLE_MS && !generator.next(settleMs).done) settleMs += SAMPLE_MS;
	return {
		duration: settleMs / MS_PER_SECOND,
		easing: (t: number) => (t >= 1 ? 1 : generator.next(t * settleMs).value)
	};
}

export type WidthPresenceParams = {
	/** Seconds. */
	duration?: number;
	easing?: (t: number) => number;
	/** Seconds. */
	delay?: number;
};

const morph = springEasing(motionTokens.spring.morph);

/**
 * Motion's `width: 0 <-> "auto"` presence: the element opens and closes its own width while it fades,
 * so its neighbours travel with it. Reduced motion keeps a short fade only.
 */
export function widthPresence(
	node: HTMLElement,
	{ duration = morph.duration, easing = morph.easing, delay = 0 }: WidthPresenceParams = {}
): TransitionConfig {
	if (isReducedMotion()) {
		return { duration: motionTokens.duration.instant * MS_PER_SECOND, css: (t) => `opacity:${t}` };
	}
	const width = node.offsetWidth;
	return {
		delay: delay * MS_PER_SECOND,
		duration: duration * MS_PER_SECOND,
		easing,
		css: (t) => `width:${Math.max(0, t * width)}px;opacity:${Math.min(1, Math.max(0, t))}`
	};
}

/** `presence` with x/y travel in em of the element's own font size, like Motion's "0.3em" targets. */
export function presenceEm(node: Element, { x = 0, y = 0, ...params }: PresenceParams = {}) {
	const fontPx = parseFloat(getComputedStyle(node).fontSize) || FALLBACK_FONT_PX;
	return presence(node, { ...params, x: x * fontPx, y: y * fontPx });
}
