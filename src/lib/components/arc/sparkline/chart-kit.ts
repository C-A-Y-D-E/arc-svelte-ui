import { inView } from 'motion';

/**
 * Shared by the Arc chart ports (sparkline, gauge, bar-chart, line-chart, donut-chart, streamgraph).
 * Arc repeats these inline in every chart; here they live once.
 */

type TimedSpring = { visualDuration: number; bounce: number };

/** Motion drops inherited velocity on time-defined springs, so values that retarget mid-flight run the same springs written as stiffness and damping. */
export function physicalSpring({ visualDuration, bounce }: TimedSpring, restDelta = 0.01) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring' as const,
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		restDelta,
		restSpeed: restDelta * 2
	};
}

export const clamp = (value: number, low: number, high: number) =>
	Math.min(high, Math.max(low, value));

/** Calls `onSeen` the first time `amount` of the node is on screen, like Motion's useInView({ once: true }). */
export function onceInView(node: Element, amount: number, onSeen: () => void) {
	const stop = inView(
		node,
		() => {
			onSeen();
			stop();
		},
		{ amount }
	);
	return stop;
}

/** A focus that came from the keyboard, not a pointer. */
export const isKeyboardFocus = (node: Element) => node.matches(':focus-visible');

/** Arc's charts name each generated id from the component id; SVG ids must not contain colons. */
export const svgId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');
