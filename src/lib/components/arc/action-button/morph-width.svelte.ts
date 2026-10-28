import { animate } from 'motion';
import type { Attachment } from 'svelte/attachments';
import { isReducedMotion, motionTokens } from '../motion';

/** Text changes within this window morph the width; other resizes (a late web font, a parent reflow) jump. */
const MORPH_WINDOW_MS = 700;

/**
 * Springs the content's parent to the natural width of the content when `key` changes, so new text never snaps the
 * layout. Other resizes jump straight to the new width, so nothing wobbles on first paint. The parent carries
 * `data-morphing` while it springs, for a clip that lets the content overflow evenly meanwhile.
 */
export function morphWidth(key: () => unknown): Attachment<HTMLElement> {
	return (content) => {
		const slot = content.parentElement;
		if (!slot) return;
		let armedUntil = 0;
		let keyed = false;
		let measured = false;
		let sizing: ReturnType<typeof animate> | undefined;

		$effect.pre(() => {
			key();
			if (keyed) armedUntil = performance.now() + MORPH_WINDOW_MS;
			keyed = true;
		});

		const observer = new ResizeObserver(([entry]) => {
			const next = entry.contentRect.width;
			sizing?.stop();
			if (!next || !measured || isReducedMotion() || performance.now() > armedUntil) {
				measured = next > 0;
				slot.style.width = next ? `${next}px` : 'auto';
				delete slot.dataset.morphing;
				return;
			}
			slot.dataset.morphing = '';
			sizing = animate(slot, { width: next }, motionTokens.spring.morph);
			sizing.then(() => delete slot.dataset.morphing);
		});
		observer.observe(content);

		return () => {
			observer.disconnect();
			sizing?.stop();
		};
	};
}
