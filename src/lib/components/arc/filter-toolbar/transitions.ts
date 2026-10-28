import type { TransitionConfig } from 'svelte/transition';
import { springEasing } from '../copy-button';
import { ease, isReducedMotion, motionTokens } from '../motion';

const MS_PER_SECOND = 1000;
const { blur, duration, spring } = motionTokens;
const smooth = springEasing(spring.smooth);
const snappy = springEasing(spring.snappy);

const TEXT_SHIFT_EM = 0.3;
const CHIP_SCALE = 0.9;
const STEP_SHIFT_PX = 18;
const BACK_SCALE = 0.6;
const BACK_WIDTH_PX = 28;
const BACK_GAP_PX = 2;
const POP_STYLES = ['position', 'left', 'top', 'width', 'height'] as const;

const still: TransitionConfig = { duration: 0 };

function clamp01(value: number) {
	return Math.min(1, Math.max(0, value));
}

/** Eased progress of one timed part of a longer transition, for values that move on different curves. */
function segment(elapsed: number, seconds: number, easing: (t: number) => number) {
	return easing(clamp01(elapsed / seconds));
}

function fade(): TransitionConfig {
	return { duration: duration.instant * MS_PER_SECOND, css: (t) => `opacity:${t}` };
}

/** Motion's popLayout: the leaving element holds its box out of the flow, so its replacement takes the place at once. */
function popOut(node: HTMLElement) {
	const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = node;
	Object.assign(node.style, {
		position: 'absolute',
		left: `${offsetLeft}px`,
		top: `${offsetTop}px`,
		width: `${offsetWidth}px`,
		height: `${offsetHeight}px`
	});
}

/** An element that comes back before its exit finished returns to the flow. */
function unpop(node: HTMLElement) {
	for (const property of POP_STYLES) node.style.removeProperty(property);
}

/** Text rises in out of a soft blur. */
export function textIn(node: HTMLElement, { delay = 0 } = {}): TransitionConfig {
	unpop(node);
	if (isReducedMotion()) return fade();
	return {
		delay: delay * MS_PER_SECOND,
		duration: duration.standard * MS_PER_SECOND,
		easing: ease.enter,
		css: (t, u) =>
			`opacity:${t};transform:translateY(${TEXT_SHIFT_EM * u}em);filter:blur(${blur.soft * u}px)`
	};
}

/** Text lifts away quicker than it arrives. */
export function textOut(node: HTMLElement, { pop = false } = {}): TransitionConfig {
	if (isReducedMotion()) return still;
	if (pop) popOut(node);
	return {
		duration: duration.instant * MS_PER_SECOND,
		easing: ease.standard,
		css: (t, u) =>
			`opacity:${t};transform:translateY(${-TEXT_SHIFT_EM * u}em);filter:blur(${blur.subtle * u}px)`
	};
}

function markSlotMoving(node: HTMLElement, moving: boolean) {
	node.style.overflow = moving ? 'clip' : '';
	node.style.setProperty('--slot-moving', moving ? '1' : '0');
}

/** A slot grows from nothing, or collapses to nothing, on the smooth spring, pulling its neighbors along in the flow. */
export function slotResize(node: HTMLElement, { gap }: { gap: number }): TransitionConfig {
	if (isReducedMotion()) return still;
	const width = node.offsetWidth;
	return {
		duration: smooth.duration * MS_PER_SECOND,
		easing: smooth.easing,
		css: (t, u) => `width:${width * t}px;margin-right:${-gap * u}px`,
		tick: (t) => markSlotMoving(node, t < 1)
	};
}

export function chipIn(_node?: HTMLElement): TransitionConfig {
	if (isReducedMotion()) return still;
	const total = Math.max(duration.standard, snappy.duration);
	return {
		duration: total * MS_PER_SECOND,
		css: (t) => {
			const elapsed = t * total;
			const shown = segment(elapsed, duration.standard, ease.enter);
			const scale =
				CHIP_SCALE + (1 - CHIP_SCALE) * segment(elapsed, snappy.duration, snappy.easing);
			return `opacity:${shown};transform:scale(${scale});filter:blur(${blur.soft * (1 - shown)}px)`;
		}
	};
}

export function chipOut(_node?: HTMLElement): TransitionConfig {
	if (isReducedMotion()) return still;
	return {
		duration: duration.instant * MS_PER_SECOND,
		easing: ease.standard,
		css: (t, u) =>
			`opacity:${t};transform:scale(${CHIP_SCALE + (1 - CHIP_SCALE) * t});filter:blur(${blur.subtle * u}px)`
	};
}

type StepParams = { direction: number };

/** Steps travel in the direction of the move: forward slides in from the end edge, back from the start edge. */
export function stepIn(node: HTMLElement, { direction }: StepParams): TransitionConfig {
	unpop(node);
	node.dataset.current = '';
	if (isReducedMotion()) return fade();
	const total = Math.max(duration.standard, smooth.duration);
	return {
		duration: total * MS_PER_SECOND,
		css: (t) => {
			const elapsed = t * total;
			const shown = segment(elapsed, duration.standard, ease.enter);
			const x = direction * STEP_SHIFT_PX * (1 - segment(elapsed, smooth.duration, smooth.easing));
			return `opacity:${shown};transform:translateX(${x}px);filter:blur(${blur.soft * (1 - shown)}px)`;
		}
	};
}

/** The leaving step stops being the current one at once, so focus and keys only ever reach the new step. */
export function stepOut(node: HTMLElement, { direction }: StepParams): TransitionConfig {
	delete node.dataset.current;
	if (isReducedMotion()) return still;
	popOut(node);
	return {
		duration: duration.instant * MS_PER_SECOND,
		easing: ease.standard,
		css: (t, u) =>
			`opacity:${t};transform:translateX(${-direction * STEP_SHIFT_PX * u}px);filter:blur(${blur.subtle * u}px)`
	};
}

function backFrame(grown: number, shown: number) {
	const scale = BACK_SCALE + (1 - BACK_SCALE) * grown;
	return `opacity:${shown};width:${BACK_WIDTH_PX * grown}px;margin-right:${BACK_GAP_PX * grown}px;transform:scale(${scale})`;
}

/** The back button opens its own room in the header on the snappy spring while it fades in. */
export function backIn(_node?: HTMLElement): TransitionConfig {
	if (isReducedMotion()) return fade();
	const total = Math.max(duration.standard, snappy.duration);
	return {
		duration: total * MS_PER_SECOND,
		css: (t) => {
			const elapsed = t * total;
			return backFrame(
				segment(elapsed, snappy.duration, snappy.easing),
				segment(elapsed, duration.standard, ease.enter)
			);
		}
	};
}

export function backOut(_node?: HTMLElement): TransitionConfig {
	if (isReducedMotion()) return still;
	const total = Math.max(duration.instant, snappy.duration);
	return {
		duration: total * MS_PER_SECOND,
		css: (_t, u) => {
			const elapsed = u * total;
			return backFrame(
				1 - segment(elapsed, snappy.duration, snappy.easing),
				1 - segment(elapsed, duration.instant, ease.standard)
			);
		}
	};
}
