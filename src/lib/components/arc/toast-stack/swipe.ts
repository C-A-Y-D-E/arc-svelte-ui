import { animate, type MotionValue } from 'motion';
import type { Attachment } from 'svelte/attachments';
import { isReducedMotion, motionTokens } from '../motion';

export type SwipeOptions = {
	x: MotionValue<number>;
	/** A leaving toast ignores new gestures. */
	canStart: () => boolean;
	onDragChange: (dragging: boolean) => void;
	/** Called once the card has been thrown off to the right. */
	onSwipeAway: () => void;
	/** A tap on the card itself (not a button) from touch or pen. */
	onTap: () => void;
};

type Gesture = {
	pointerId: number;
	startX: number;
	startY: number;
	origin: number;
	active: boolean;
	samples: { t: number; x: number }[];
};

const SLOP_PX = 6;
/** Velocity is read from the last this-many milliseconds of movement. */
const SAMPLE_WINDOW_MS = 100;
/** A finger that stopped this long before lifting carries no throw. */
const STALE_RELEASE_MS = 60;
/** Past this fraction of the card width (after the throw is projected), the swipe dismisses. */
const DISMISS_FRACTION = 0.4;
/** A throw back to the left faster than this keeps the toast, however far it was pulled. */
const KEEP_VELOCITY = -200;
const THROW_OVERSHOOT_PX = 40;
/** A release from the rubber band springs back with only part of its velocity. */
const RUBBER_RETURN_DAMPING = 0.3;
const RUBBER_BAND_STIFFNESS = 0.55;
const SCROLL_DECELERATION = 0.99;
const MS_PER_SECOND = 1000;
const throwAway = { type: 'spring', visualDuration: 0.32, bounce: 0 } as const;

/** Where a release at this velocity would come to rest, using a fast scroll deceleration. */
const project = (velocity: number) =>
	((velocity / MS_PER_SECOND) * SCROLL_DECELERATION) / (1 - SCROLL_DECELERATION);
/** Resistance past an edge: the pull keeps moving, but less and less, the way a scroll view overscrolls. */
const rubberBand = (distance: number, dimension: number) =>
	(1 - 1 / ((distance * RUBBER_BAND_STIFFNESS) / dimension + 1)) * dimension;
const isControl = (target: EventTarget | null) =>
	target instanceof Element && !!target.closest('button, a');

function releaseVelocity(gesture: Gesture, event: PointerEvent, cancelled: boolean) {
	const first = gesture.samples[0];
	const last = gesture.samples[gesture.samples.length - 1];
	if (
		cancelled ||
		!first ||
		!last ||
		last.t === first.t ||
		event.timeStamp - last.t > STALE_RELEASE_MS
	)
		return 0;
	return ((last.x - first.x) / (last.t - first.t)) * MS_PER_SECOND;
}

/** Swipe right to dismiss: right follows the finger 1:1, left rubber-bands, and a release throws with its velocity. */
export function swipeToDismiss({
	x,
	canStart,
	onDragChange,
	onSwipeAway,
	onTap
}: SwipeOptions): Attachment<HTMLElement> {
	return (card) => {
		let gesture: Gesture | null = null;
		let suppressClick = false;
		let pointerType = 'mouse';

		function onPointerDown(event: PointerEvent) {
			pointerType = event.pointerType;
			suppressClick = false;
			if (event.button !== 0 || !canStart() || isControl(event.target)) return;
			// Catch a toast that is still springing back, from exactly where it is.
			x.stop();
			gesture = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				origin: x.get(),
				active: false,
				samples: []
			};
		}

		function activate(current: Gesture, event: PointerEvent) {
			const dx = event.clientX - current.startX;
			const dy = event.clientY - current.startY;
			if (Math.hypot(dx, dy) < SLOP_PX) return false;
			if (Math.abs(dy) > Math.abs(dx)) {
				gesture = null;
				return false;
			}
			// Start following from here, so crossing the slop never makes the toast jump.
			current.active = true;
			current.startX = event.clientX;
			suppressClick = true;
			card.setPointerCapture(event.pointerId);
			card.dataset.dragging = '';
			window.getSelection()?.removeAllRanges();
			onDragChange(true);
			return true;
		}

		function onPointerMove(event: PointerEvent) {
			const current = gesture;
			if (!current || current.pointerId !== event.pointerId) return;
			if (!current.active && !activate(current, event)) return;
			const raw = current.origin + event.clientX - current.startX;
			x.set(raw >= 0 ? raw : -rubberBand(-raw, card.offsetWidth));
			current.samples.push({ t: event.timeStamp, x: raw });
			while (
				current.samples.length > 2 &&
				event.timeStamp - current.samples[0].t > SAMPLE_WINDOW_MS
			) {
				current.samples.shift();
			}
		}

		function onPointerEnd(event: PointerEvent) {
			const current = gesture;
			if (!current || current.pointerId !== event.pointerId) return;
			gesture = null;
			if (!current.active) return;
			const cancelled = event.type === 'pointercancel';
			delete card.dataset.dragging;
			onDragChange(false);
			const velocity = releaseVelocity(current, event, cancelled);
			const width = card.offsetWidth;
			const offset = x.get();
			const reduce = isReducedMotion();
			if (
				!cancelled &&
				offset > 0 &&
				velocity > KEEP_VELOCITY &&
				offset + project(velocity) > width * DISMISS_FRACTION
			) {
				if (!reduce)
					animate(x, width + THROW_OVERSHOOT_PX, { ...throwAway, velocity: Math.max(velocity, 0) });
				onSwipeAway();
				return;
			}
			if (reduce) x.jump(0);
			else
				animate(x, 0, {
					...motionTokens.spring.snappy,
					velocity: offset < 0 ? velocity * RUBBER_RETURN_DAMPING : velocity
				});
		}

		function onClick(event: MouseEvent) {
			if (suppressClick) {
				suppressClick = false;
				return;
			}
			// Touch has no hover, so a tap on the card opens or closes the stack instead.
			if (pointerType !== 'mouse' && !isControl(event.target)) onTap();
		}

		card.addEventListener('pointerdown', onPointerDown);
		card.addEventListener('pointermove', onPointerMove);
		card.addEventListener('pointerup', onPointerEnd);
		card.addEventListener('pointercancel', onPointerEnd);
		card.addEventListener('click', onClick);
		return () => {
			card.removeEventListener('pointerdown', onPointerDown);
			card.removeEventListener('pointermove', onPointerMove);
			card.removeEventListener('pointerup', onPointerEnd);
			card.removeEventListener('pointercancel', onPointerEnd);
			card.removeEventListener('click', onClick);
		};
	};
}
