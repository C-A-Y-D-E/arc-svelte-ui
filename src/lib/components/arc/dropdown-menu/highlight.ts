import { animate } from 'motion';
import { isReducedMotion, motionTokens } from '../motion';

export type Highlight = { top: number; height: number; tone?: string; glide: boolean };

const DEFAULT_FADE_S = 0.08;

/** Places a menu's single highlight on a row: it glides for the pointer, jumps for the keyboard, and fades when cleared. */
export function moveHighlight(
	node: HTMLElement,
	highlight: Highlight | null,
	fade = DEFAULT_FADE_S
) {
	const reduced = isReducedMotion();
	const target = highlight
		? { y: highlight.top, height: highlight.height, opacity: 1 }
		: { opacity: 0 };
	animate(node, target, {
		default: highlight?.glide && !reduced ? motionTokens.spring.snappy : { duration: 0 },
		opacity: { duration: reduced ? 0 : fade }
	});
}

/** Reads a row's placement inside its positioned list, for the highlight to move onto. */
export function measureRow(row: HTMLElement, glide: boolean): Highlight {
	return { top: row.offsetTop, height: row.offsetHeight, tone: row.dataset.tone, glide };
}
