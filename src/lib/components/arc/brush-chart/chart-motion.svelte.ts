import { animate, inView, springValue } from 'motion';
import type { AnimationOptions, DOMKeyframesDefinition } from 'motion';
import type { Attachment } from 'svelte/attachments';
import { motionTokens } from '../motion';

/** Shared by the hand-built Arc charts (brush chart, ridgeline, treemap, waffle, slope chart). */

export const clamp = (value: number, low: number, high: number) =>
	Math.min(high, Math.max(low, value));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type SpringFeel = { visualDuration: number; bounce: number };
type FollowSpring = { stiffness: number; damping: number; restDelta: number };

/** A visual-duration spring as stiffness and damping, so it can drive a plain 0 to 1 progress with a tight rest threshold. */
export function physicalSpring({ visualDuration, bounce }: SpringFeel, restDelta = 0.0005) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring' as const,
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		restDelta,
		restSpeed: restDelta * 2
	};
}

const snappy = physicalSpring(motionTokens.spring.snappy, 0.01);
/** The tooltip follow spring most charts share: the snappy feel as stiffness and damping. */
export const snappyFollow: FollowSpring = {
	stiffness: snappy.stiffness,
	damping: snappy.damping,
	restDelta: 0.01
};

/** A tooltip on two springs: it jumps into place when it opens and glides between readings after that. */
export function createTooltipGlide(follow: FollowSpring = snappyFollow) {
	const x = springValue<number>(0, follow);
	const y = springValue<number>(0, follow);
	const attach: Attachment<HTMLElement> = (node) => {
		const paint = () => {
			node.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
		};
		paint();
		const stopX = x.on('change', paint);
		const stopY = y.on('change', paint);
		return () => {
			stopX();
			stopY();
		};
	};
	function place(left: number, top: number, instant: boolean) {
		if (instant) {
			x.jump(left);
			y.jump(top);
		} else {
			x.set(left);
			y.set(top);
		}
	}
	return { attach, place };
}

/** Calls onSeen once, the first time the given share of the element is on screen. */
export function onceInView(amount: number, onSeen: () => void): Attachment<Element> {
	return (node) => {
		const stop = inView(
			node,
			() => {
				onSeen();
				stop();
			},
			{ amount }
		);
		return stop;
	};
}

export type MotionTarget = {
	values: DOMKeyframesDefinition;
	transition?: AnimationOptions;
	/** Where the element starts on its first render; left out, it starts at `values`, like Motion's initial={false}. */
	initial?: DOMKeyframesDefinition | false;
};

/**
 * Stand-in for a motion element's `animate` prop: whenever the target read inside `read` changes,
 * the element animates there from wherever it is on screen.
 */
export function motionTo(read: () => MotionTarget): Attachment<Element> {
	return (node) => {
		let first = true;
		$effect(() => {
			const { values, transition, initial } = read();
			if (first) {
				first = false;
				if (!initial) {
					animate(node, values, { duration: 0 });
					return;
				}
				animate(node, initial, { duration: 0 });
			}
			animate(node, values, transition);
		});
	};
}
