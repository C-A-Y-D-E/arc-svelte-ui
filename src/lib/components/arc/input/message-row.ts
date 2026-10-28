import { animate } from 'motion';
import { isReducedMotion, motionTokens } from '../motion';
import { motionTransition } from './motion-transition';

const { duration, spring } = motionTokens;
const instant = { duration: 0 };

/**
 * A helper or error row that opens its height on a spring. The row is a clipped slot whose first child is the copy.
 * Reduced motion mounts the row at full height in one frame.
 */
export function openRow(slot: HTMLElement) {
	const copy = slot.firstElementChild as HTMLElement;
	return motionTransition(slot, {
		keyframes: { height: [0, copy.offsetHeight], opacity: [0, 1] },
		transition: isReducedMotion()
			? instant
			: { height: spring.smooth, opacity: { duration: duration.fast } }
	});
}

export function closeRow(slot: HTMLElement) {
	return motionTransition(slot, {
		keyframes: { height: 0, opacity: 0 },
		transition: isReducedMotion()
			? instant
			: { height: spring.smooth, opacity: { duration: duration.instant } }
	});
}

/** The row tracks the measured copy, so a longer message that wraps opens its next line instead of snapping. */
export function followCopyHeight(slot: HTMLElement) {
	const copy = slot.firstElementChild as HTMLElement;
	let measured = false;
	const observer = new ResizeObserver(([entry]) => {
		// The first measurement is the mount: the row is already at its height, or opening towards it.
		if (!measured) return void (measured = true);
		const height = entry.borderBoxSize?.[0]?.blockSize ?? copy.offsetHeight;
		animate(slot, { height }, isReducedMotion() ? instant : spring.smooth);
	});
	observer.observe(copy);
	return () => observer.disconnect();
}
