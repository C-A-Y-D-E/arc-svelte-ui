import { animate, cubicBezier, press } from 'motion';
import { prefersReducedMotion } from 'svelte/motion';
import type { Attachment } from 'svelte/attachments';
import type { TransitionConfig } from 'svelte/transition';

/** UI Arc's motion presets. Durations are in seconds, as Motion's animate() expects. */
export const motionTokens = {
	duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24, considered: 0.48 },
	ease: {
		enter: [0.16, 1, 0.3, 1],
		exit: [0.7, 0, 0.84, 0],
		standard: [0.22, 1, 0.36, 1],
		/** For elements that move while already on screen. */
		inOut: [0.65, 0, 0.35, 1]
	},
	spring: {
		responsive: { type: 'spring', stiffness: 520, damping: 38 },
		gentle: { type: 'spring', stiffness: 340, damping: 34 },
		/** Presses, toggles, thumbs, and small indicators. */
		snappy: { type: 'spring', visualDuration: 0.26, bounce: 0.12 },
		/** Panels, height changes, and layout shifts. Never overshoots. */
		smooth: { type: 'spring', visualDuration: 0.4, bounce: 0 },
		/** Shape morphs, shared highlights, and widths that follow new content. */
		morph: { type: 'spring', visualDuration: 0.42, bounce: 0.16 }
	},
	/** Stagger steps in seconds. Keep total stagger under roughly 0.4s. */
	stagger: { char: 0.016, word: 0.04, line: 0.08, item: 0.035 },
	/** Blur radii in px for text and content crossfades. */
	blur: { subtle: 2, soft: 4, text: 8 }
} as const;

/** The same curves as easing functions, for Svelte transitions and Tween. */
export const ease = {
	enter: cubicBezier(...motionTokens.ease.enter),
	exit: cubicBezier(...motionTokens.ease.exit),
	standard: cubicBezier(...motionTokens.ease.standard),
	inOut: cubicBezier(...motionTokens.ease.inOut)
};

const MS_PER_SECOND = 1000;

export function isReducedMotion() {
	return prefersReducedMotion.current;
}

export type PresenceParams = {
	opacity?: number;
	x?: number;
	y?: number;
	scale?: number;
	blur?: number;
	/** Seconds. */
	duration?: number;
	/** Seconds. */
	delay?: number;
	easing?: (t: number) => number;
	/** Takes the element out of flow while it leaves, like Motion's AnimatePresence mode="popLayout". Needs a positioned parent. */
	pop?: boolean;
};

/**
 * Svelte stand-in for Motion's initial/exit props. The params describe the hidden state; the element
 * animates from it on enter and to it on exit. Reduced motion keeps a short fade only.
 */
export function presence(node: Element, params: PresenceParams = {}): TransitionConfig {
	const {
		opacity = 0,
		x = 0,
		y = 0,
		scale = 1,
		blur = 0,
		duration = motionTokens.duration.standard,
		delay = 0,
		easing = ease.enter,
		pop = false
	} = params;
	const hiddenOpacity = opacity;
	if (isReducedMotion()) {
		return {
			duration: motionTokens.duration.instant * MS_PER_SECOND,
			css: (t) => `opacity:${hiddenOpacity + (1 - hiddenOpacity) * t}`
		};
	}
	const existing = getComputedStyle(node).transform;
	const baseTransform = existing === 'none' ? '' : existing;
	return {
		delay: delay * MS_PER_SECOND,
		duration: duration * MS_PER_SECOND,
		easing,
		css: (t, u) =>
			`${pop ? 'position:absolute;' : ''}opacity:${hiddenOpacity + (1 - hiddenOpacity) * t};` +
			`transform:${baseTransform} translate(${x * u}px, ${y * u}px) scale(${scale + (1 - scale) * t});` +
			(blur ? `filter:blur(${blur * u}px);` : '')
	};
}

/** Motion's whileTap scale on a spring. Pass a function to pick the depth per press. */
export function pressScale(
	depth: number | ((node: HTMLElement) => number) = 0.97
): Attachment<HTMLElement> {
	return (node) =>
		press(node, () => {
			if (isReducedMotion()) return;
			const scale = typeof depth === 'function' ? depth(node) : depth;
			if (scale === 1) return;
			animate(node, { scale }, motionTokens.spring.snappy);
			return () => animate(node, { scale: 1 }, motionTokens.spring.snappy);
		});
}

type IndicatorOptions = { instant?: boolean; transition?: object };

/**
 * Stand-in for Motion's shared layoutId highlight: slides one indicator element onto the target.
 * The indicator and the target must share the same positioned parent (offsetParent).
 */
export function moveIndicator(
	indicator: HTMLElement,
	target: HTMLElement | null | undefined,
	{ instant = false, transition = motionTokens.spring.morph }: IndicatorOptions = {}
) {
	if (!target) {
		animate(indicator, { opacity: 0 }, { duration: motionTokens.duration.fast });
		return;
	}
	const frame = {
		x: target.offsetLeft,
		y: target.offsetTop,
		width: target.offsetWidth,
		height: target.offsetHeight,
		opacity: 1
	};
	const jump = instant || isReducedMotion();
	animate(indicator, frame, jump ? { duration: 0 } : transition);
}
