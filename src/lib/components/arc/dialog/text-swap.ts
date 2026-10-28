import { ease, motionTokens, presence, type PresenceParams } from '../motion';

type TextSwapParams = Omit<PresenceParams, 'y' | 'pop'> & {
	/** Vertical travel in em of the element's own font size, like Motion's y: "0.3em". */
	riseEm?: number;
};

/** Where the leaving copy stood, relative to its positioned parent. */
export type TextSpot = { top: number; left: number; width: number };

export function measureSpot(node: HTMLElement): TextSpot {
	return { top: node.offsetTop, left: node.offsetLeft, width: node.offsetWidth };
}

const DEFAULT_RISE_EM = 0.3;

function emToPx(node: Element, em: number) {
	return em * parseFloat(getComputedStyle(node).fontSize);
}

/** New copy rises in out of a soft blur. */
export function textSwapIn(
	node: Element,
	{ riseEm = DEFAULT_RISE_EM, ...params }: TextSwapParams = {}
) {
	return presence(node, {
		blur: motionTokens.blur.soft,
		duration: motionTokens.duration.standard,
		...params,
		y: emToPx(node, riseEm)
	});
}

/**
 * Old copy lifts away. Like AnimatePresence mode="popLayout", it is pinned out of flow where it stood,
 * so the incoming copy takes its place at once. Needs a positioned parent.
 */
export function textSwapOut(
	node: HTMLElement,
	{ riseEm = DEFAULT_RISE_EM, spot, ...params }: TextSwapParams & { spot?: TextSpot } = {}
) {
	const { top, left, width } = spot ?? measureSpot(node);
	Object.assign(node.style, {
		position: 'absolute',
		top: `${top}px`,
		left: `${left}px`,
		width: `${width}px`
	});
	node.setAttribute('aria-hidden', 'true');
	return presence(node, {
		blur: motionTokens.blur.subtle,
		duration: motionTokens.duration.fast,
		easing: ease.standard,
		...params,
		y: -emToPx(node, riseEm)
	});
}
