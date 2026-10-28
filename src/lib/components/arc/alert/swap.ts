import { animate, spring as springGenerator } from 'motion';
import type { Attachment } from 'svelte/attachments';
import type { TransitionConfig } from 'svelte/transition';
import { ease, isReducedMotion, motionTokens, presence } from '../motion';

/**
 * Shared content morphs for Arc's feedback components: the rising text swap, the icon pop, and the frame
 * that springs to its content's new size. Stand-ins for Motion's AnimatePresence mode="popLayout" + HeightFrame.
 */

const { blur, duration, spring } = motionTokens;

export type SwapKind = 'text' | 'icon';

export type SwapOptions = {
	kind?: SwapKind;
	/** Text travel in em while entering; the sign follows `direction`. */
	rise?: number;
	/** Text travel in em while leaving. Defaults to `rise`. */
	fall?: number;
	/** 1 rises from below and leaves upward; -1 runs the other way. */
	direction?: number | (() => number);
	/** Motion transition for the entering content. */
	enter?: object;
	/** Seconds for the leaving content. */
	exitDuration?: number;
	/** Seconds to wait before the entering content starts. */
	delay?: number;
};

const TEXT_RISE_EM = 0.3;
const ICON_SCALE = 0.6;
const SPRING_SAMPLE_MS = 10;
const SPRING_MAX_MS = 2000;
/** A content change arms the size morph for this long; resizes outside the window (fonts, reflow) follow instantly. */
const MORPH_WINDOW_MS = 120;

const textEnter = { duration: duration.standard, ease: motionTokens.ease.enter };
const enterFast = { duration: duration.fast, ease: motionTokens.ease.enter };
/** Scale rides the spring; opacity and blur tween so blur never overshoots below zero. */
const iconEnter = { ...spring.snappy, opacity: enterFast, filter: enterFast };

function emOf(node: Element) {
	return parseFloat(getComputedStyle(node).fontSize) || 16;
}

function resolveDirection(direction: SwapOptions['direction']) {
	return typeof direction === 'function' ? direction() : (direction ?? 1);
}

function hiddenFrame(node: Element, options: SwapOptions, leaving: boolean) {
	const { kind = 'text', rise = TEXT_RISE_EM, fall = rise } = options;
	if (kind === 'icon') return { opacity: 0, scale: ICON_SCALE, blur: blur.subtle };
	const travel = (leaving ? -fall : rise) * resolveDirection(options.direction) * emOf(node);
	return { opacity: 0, y: travel, blur: leaving ? blur.subtle : blur.soft };
}

/** Takes a leaving element out of flow at the box it holds now, like popLayout, and hides it from assistive tech. */
function pin(node: HTMLElement) {
	node.setAttribute('aria-hidden', 'true');
	return `position:absolute;top:${node.offsetTop}px;left:${node.offsetLeft}px;width:${node.offsetWidth}px;margin:0;`;
}

function animateIn(node: HTMLElement, options: SwapOptions) {
	if (isReducedMotion()) {
		animate(node, { opacity: [0, 1] }, { duration: duration.instant });
		return;
	}
	const hidden = hiddenFrame(node, options, false);
	const kind = options.kind ?? 'text';
	const transition = options.enter ?? (kind === 'icon' ? iconEnter : textEnter);
	animate(
		node,
		{
			opacity: [0, 1],
			y: [hidden.y ?? 0, 0],
			scale: [hidden.scale ?? 1, 1],
			filter: [`blur(${hidden.blur}px)`, 'blur(0px)']
		},
		{ ...transition, delay: options.delay ?? 0 }
	);
}

function animateOut(node: HTMLElement, options: SwapOptions) {
	if (isReducedMotion()) {
		animate(node, { opacity: 0 }, { duration: duration.instant }).then(() => node.remove());
		return;
	}
	const hidden = hiddenFrame(node, options, true);
	animate(
		node,
		{ opacity: 0, y: hidden.y ?? 0, scale: hidden.scale ?? 1, filter: `blur(${hidden.blur}px)` },
		{ duration: options.exitDuration ?? duration.fast, ease: motionTokens.ease.standard }
	).then(() => node.remove());
}

/**
 * Crossfades whatever renders inside the element whenever it changes: the old copy pops out of flow and
 * leaves while the new one rises in. Works for snippets and plain text alike. The parent should be positioned.
 */
export function swapOnChange(options: SwapOptions = {}): Attachment<HTMLElement> {
	return (node) => {
		let snapshot = node.cloneNode(true) as HTMLElement;
		const watcher = new MutationObserver(() => {
			if (node.innerHTML === snapshot.innerHTML) return;
			const outgoing = snapshot;
			outgoing.style.cssText += pin(node);
			outgoing.removeAttribute('id');
			node.before(outgoing);
			animateOut(outgoing, options);
			animateIn(node, options);
			snapshot = node.cloneNode(true) as HTMLElement;
		});
		watcher.observe(node, { subtree: true, childList: true, characterData: true });
		return () => watcher.disconnect();
	};
}

/** Svelte `in:` counterpart of the swap, for content that appears (`{#if}` / `{#key}`). */
export function swapIn(node: HTMLElement, options: SwapOptions = {}): TransitionConfig {
	const { opacity, y = 0, scale = 1, blur: radius } = hiddenFrame(node, options, false);
	const timing =
		options.kind === 'icon'
			? springTiming(spring.snappy)
			: { duration: duration.standard, easing: ease.enter };
	return presence(node, { opacity, y, scale, blur: radius, delay: options.delay, ...timing });
}

/** Svelte `out:` counterpart of the swap: the leaving copy pops out of flow where it stood. */
export function swapOut(node: HTMLElement, options: SwapOptions = {}): TransitionConfig {
	const pinned = pin(node);
	const { opacity, y = 0, scale = 1, blur: radius } = hiddenFrame(node, options, true);
	const config = presence(node, {
		opacity,
		y,
		scale,
		blur: radius,
		duration: options.exitDuration ?? duration.fast,
		easing: ease.standard
	});
	const css = config.css;
	return { ...config, css: (t, u) => pinned + (css?.(t, u) ?? '') };
}

export type SizeMorphOptions = {
	axis?: 'height' | 'width';
	transition?: object;
	/** Clip overflow while moving. Defaults to true for height. */
	clip?: boolean;
	/** Milliseconds after a content change in which a resize still morphs. */
	window?: number;
};

/**
 * Follows the size of its first child. After that child's content changes, the frame springs from the old size
 * to the new one and then returns to auto, so passive reflows (a resize, a font swap) follow instantly.
 * It clips only while moving, so focus rings stay visible at rest.
 */
export function sizeMorph({
	axis = 'height',
	transition = spring.smooth,
	clip = axis === 'height',
	window: morphWindow = MORPH_WINDOW_MS
}: SizeMorphOptions = {}): Attachment<HTMLElement> {
	return (frame) => {
		const content = frame.firstElementChild as HTMLElement | null;
		if (!content) return;
		let changedAt = 0;
		let last: number | undefined;
		let running: ReturnType<typeof animate> | undefined;

		const settle = () => {
			frame.style[axis] = '';
			if (clip) frame.style.overflow = '';
		};
		const contentWatcher = new MutationObserver(() => (changedAt = performance.now()));
		contentWatcher.observe(content, { subtree: true, childList: true, characterData: true });

		const sizeWatcher = new ResizeObserver(([entry]) => {
			const box = entry.borderBoxSize?.[0];
			const next =
				axis === 'height'
					? (box?.blockSize ?? content.offsetHeight)
					: (box?.inlineSize ?? content.offsetWidth);
			const pinned = parseFloat(frame.style[axis]);
			const from = Number.isNaN(pinned) ? last : pinned;
			last = next;
			running?.stop();
			running = undefined;
			const passive = performance.now() - changedAt > morphWindow;
			if (isReducedMotion() || from === undefined || from === next || passive) return settle();
			// Pin the old size before this frame paints, then spring to the new one.
			frame.style[axis] = `${from}px`;
			if (clip) frame.style.overflow = 'hidden';
			const run = animate(frame, { [axis]: [from, next] }, transition);
			running = run;
			run.then(() => {
				if (running === run) settle();
			});
		});
		sizeWatcher.observe(content);

		return () => {
			contentWatcher.disconnect();
			sizeWatcher.disconnect();
			running?.stop();
		};
	};
}

/** Samples a Motion spring into a duration (seconds) and easing, for Svelte transitions that should ride a spring. */
export function springTiming(options: {
	visualDuration?: number;
	bounce?: number;
	stiffness?: number;
	damping?: number;
}) {
	const generator = springGenerator({ keyframes: [0, 1], ...options });
	let settledMs = 0;
	while (!generator.next(settledMs).done && settledMs < SPRING_MAX_MS)
		settledMs += SPRING_SAMPLE_MS;
	return {
		duration: settledMs / 1000,
		easing: (t: number) => Number(generator.next(t * settledMs).value)
	};
}
