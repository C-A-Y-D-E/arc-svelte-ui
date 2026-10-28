import type { TransitionConfig } from 'svelte/transition';
import { ease, isReducedMotion, motionTokens, presence } from '../motion';
import { springEasing } from './spring-easing';

type SpringOptions = Parameters<typeof springEasing>[0];

export type SpringPopParams = {
	/** Hidden scale, grown from on the spring. */
	scale?: number;
	/** Hidden blur in px; it clears with the fade. */
	blur?: number;
	spring?: SpringOptions;
	/** Seconds for opacity and blur, which tween so blur never overshoots below zero. */
	fadeDuration?: number;
	fadeDelay?: number;
};

const MS_PER_SECOND = 1000;

function clamp01(progress: number) {
	return Math.min(1, Math.max(0, progress));
}

/**
 * Enter transition for glyphs that grow out of a blur: scale rides a Motion spring while opacity and blur tween,
 * the pairing Arc uses for icon swaps. Reduced motion keeps a short fade only.
 */
export function springPop(node: Element, params: SpringPopParams = {}): TransitionConfig {
	const {
		scale = 0.6,
		blur = motionTokens.blur.subtle,
		spring = motionTokens.spring.snappy,
		fadeDuration = motionTokens.duration.fast,
		fadeDelay = 0
	} = params;
	if (isReducedMotion()) return presence(node);
	const grow = springEasing(spring);
	const total = Math.max(grow.duration, fadeDelay + fadeDuration);
	return {
		duration: total * MS_PER_SECOND,
		css: (t) => {
			const elapsed = t * total;
			const size = scale + (1 - scale) * grow.easing(clamp01(elapsed / grow.duration));
			const fade = ease.enter(clamp01((elapsed - fadeDelay) / fadeDuration));
			return `opacity:${fade};transform:scale(${size});filter:blur(${blur * (1 - fade)}px)`;
		}
	};
}
