import { motionTokens } from '../motion';

/**
 * Motion drops velocity on time-defined springs, so anything a gesture hands off to runs the same spring written as
 * stiffness and damping. Positions are percentages of the track, so the rest thresholds are set far below a pixel.
 */
function physical({ visualDuration, bounce }: { visualDuration: number; bounce: number }) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring',
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		restDelta: 0.002,
		restSpeed: 0.02
	} as const;
}

export const thumbSpring = physical(motionTokens.spring.snappy);
export const kickSpring = physical(motionTokens.spring.morph);
