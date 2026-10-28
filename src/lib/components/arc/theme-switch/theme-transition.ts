import { isReducedMotion } from '../motion';
import type { ThemeSwitchVariant } from './ThemeSwitch.svelte';

type PageTransition = { clipPath: [string, string]; durationMs: number };

/** UI Arc's own page transitions, one per switch variant: the new appearance is clipped in over the old one. */
const PAGE_TRANSITIONS: Record<ThemeSwitchVariant, PageTransition> = {
	reveal: { clipPath: ['inset(0 100% 0 0)', 'inset(0)'], durationMs: 380 },
	eclipse: { clipPath: ['ellipse(0 110%)', 'ellipse(80% 110%)'], durationMs: 430 },
	split: { clipPath: ['inset(50% 0)', 'inset(0)'], durationMs: 390 },
	rise: { clipPath: ['inset(100% 0 0)', 'inset(0)'], durationMs: 360 }
};
const EASE_STANDARD = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Holds a snapshot fully opaque and unblended, overriding the browser's default cross-fade. */
const OPAQUE = { opacity: [1, 1], mixBlendMode: ['normal', 'normal'] };

/**
 * Applies a theme inside a view transition that plays the variant's page animation. Browsers without view
 * transitions, and reduced motion, swap the theme directly.
 */
export function runThemeTransition(variant: ThemeSwitchVariant, applyTheme: () => void) {
	if (!document.startViewTransition || isReducedMotion()) {
		applyTheme();
		return;
	}
	const { clipPath, durationMs } = PAGE_TRANSITIONS[variant];
	const root = document.documentElement;
	document.startViewTransition(applyTheme).ready.then(() => {
		root.animate(OPAQUE, { duration: durationMs, pseudoElement: '::view-transition-old(root)' });
		root.animate(
			{ ...OPAQUE, clipPath },
			{
				duration: durationMs,
				easing: EASE_STANDARD,
				fill: 'both',
				pseudoElement: '::view-transition-new(root)'
			}
		);
	});
}
