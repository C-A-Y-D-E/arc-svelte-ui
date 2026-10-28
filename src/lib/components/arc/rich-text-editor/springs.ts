import { motionTokens } from '../motion';

/** Arc's springs by feel: a visual duration and bounce turned into stiffness and damping. */
export function physicalSpring(visualDuration: number, bounce: number) {
	const root = (2 * Math.PI) / (visualDuration * 1.2);
	return {
		type: 'spring',
		stiffness: root * root,
		damping: 2 * (1 - bounce) * root,
		mass: 1
	} as const;
}

export const MORPH = physicalSpring(motionTokens.spring.morph.visualDuration, 0.12);
export const GLIDE = physicalSpring(0.3, 0.08);
export const GROW = physicalSpring(motionTokens.spring.smooth.visualDuration, 0);
