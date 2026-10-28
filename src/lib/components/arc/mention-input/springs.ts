import { motionTokens } from '../motion';
import { physicalSpring } from '../rich-text-editor/springs';

export const GLIDE = physicalSpring(0.3, 0.1);
export const GROW = physicalSpring(motionTokens.spring.smooth.visualDuration, 0);
