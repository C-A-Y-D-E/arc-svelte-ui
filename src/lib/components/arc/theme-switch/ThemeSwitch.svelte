<script module lang="ts">
	export type ThemeSwitchVariant = 'reveal' | 'eclipse' | 'split' | 'rise';
	export type Theme = 'light' | 'dark';
</script>

<script lang="ts">
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { Button } from '../button';
	import { motionTransition } from '../action-button/motion-transition';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = {
		/** The current theme. Drives the icon and aria-pressed. */
		theme: Theme;
		/** Names the page transition and sets the small icon nudge that matches it. */
		variant?: ThemeSwitchVariant;
		/** Called on press with the opposite theme, the variant, and the button, so the page transition can start from it. */
		onThemeChange: (next: Theme, variant: ThemeSwitchVariant, trigger: HTMLElement) => void;
		label?: string;
		iconOnly?: boolean;
	};

	let { theme, variant = 'reveal', onThemeChange, label, iconOnly = false }: Props = $props();

	const ICON_PX = 15;
	const TURN_DEG = 30;
	const { duration } = motionTokens;
	const blur = `blur(${motionTokens.blur.subtle}px)`;
	/** Rotation and scale ride the spring; opacity and blur tween so the blur never overshoots below zero. */
	const iconSpring = {
		...motionTokens.spring.snappy,
		opacity: { duration: duration.fast, ease: motionTokens.ease.enter },
		filter: { duration: duration.fast, ease: motionTokens.ease.enter }
	};
	const iconExit = { duration: duration.fast, ease: motionTokens.ease.standard };
	const instant = { duration: duration.instant };

	const next = $derived<Theme>(theme === 'light' ? 'dark' : 'light');

	/** A stored preference usually reaches the theme prop just after hydration. That correction swaps the icon in place;
	 *  only changes after the first painted frames animate, so a page that loads in dark mode never spins its switches. */
	let settled = $state(false);
	$effect(() => {
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => (settled = true));
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	});

	/** Both icons turn the same way (clockwise into dark, back out of it), so the swap reads as one rotation rather than two fades. */
	function turnAngle(icon: Theme) {
		return icon === 'light' ? TURN_DEG : -TURN_DEG;
	}

	function iconIn(icon: Theme) {
		if (!settled) return { keyframes: {}, transition: { duration: 0 } };
		if (isReducedMotion()) return { keyframes: { opacity: [0, 1] }, transition: instant };
		return {
			keyframes: {
				opacity: [0, 1],
				scale: [0.7, 1],
				rotate: [turnAngle(icon), 0],
				filter: [blur, 'blur(0px)']
			},
			transition: iconSpring
		};
	}

	function iconOut(icon: Theme) {
		if (!settled) return { keyframes: { opacity: 0 }, transition: { duration: 0 } };
		if (isReducedMotion()) return { keyframes: { opacity: 0 }, transition: instant };
		return {
			keyframes: { opacity: 0, scale: 0.7, rotate: turnAngle(icon), filter: blur },
			transition: iconExit
		};
	}
</script>

<!-- `data-mode` rather than Arc's `data-theme`, so it never clashes with theme palettes keyed on data-theme. -->
<Button
	type="button"
	size="sm"
	variant="secondary"
	class="arc-theme-switch"
	data-variant={variant}
	data-icon-only={iconOnly || undefined}
	data-settled={settled || undefined}
	data-mode={theme}
	aria-label={label ?? `Switch to ${next} mode`}
	aria-pressed={theme === 'dark'}
	onclick={(event) => onThemeChange(next, variant, event.currentTarget)}
>
	<span class="icon-wrap">
		{#each [theme] as shown (shown)}
			<span
				class="icon"
				aria-hidden="true"
				in:motionTransition={iconIn(shown)}
				out:motionTransition={iconOut(shown)}
			>
				{#if shown === 'light'}
					<SunIcon size={ICON_PX} strokeWidth={1.9} />
				{:else}
					<MoonIcon size={ICON_PX} strokeWidth={1.9} />
				{/if}
			</span>
		{/each}
	</span>
	{#if !iconOnly}<span class="label">Switch theme</span>{/if}
</Button>

<style>
	/* Every variant uses the same library Button, which owns the press scale; this file only animates the icon in place.
	   The element selector outranks the Button's own scoped size rules, as Arc's module order does. */
	:global(button.arc-theme-switch) {
		position: relative;
		width: auto;
		padding-inline: var(--arc-space-3);
	}
	:global(button.arc-theme-switch[data-icon-only]) {
		width: 38px;
		min-width: 38px;
		height: 38px;
		min-height: 38px;
		border-radius: 12px;
		padding: 0;
	}
	@media (hover: hover) and (pointer: fine) {
		:global(button.arc-theme-switch:hover:not(:disabled)) {
			border-color: var(--arc-border-strong);
		}
		:global(button.arc-theme-switch[data-icon-only]:hover:not(:disabled)) {
			background: var(--arc-surface-muted);
			box-shadow: none;
		}
	}
	:global(button.arc-theme-switch:focus-visible) {
		outline-offset: 3px;
	}
	.icon-wrap {
		position: relative;
		display: inline-grid;
		width: 20px;
		height: 20px;
		flex: 0 0 20px;
		place-items: center;
	}
	/* The nudge only eases once the switch has settled, so a theme that arrives during hydration lands without motion. */
	:global(.arc-theme-switch[data-settled]) .icon-wrap {
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.icon {
		position: absolute;
		display: grid;
		width: 18px;
		height: 18px;
		place-items: center;
	}
	.label {
		white-space: nowrap;
	}
	/* Each variant nudges the icon the way its page transition travels, and eases back when the theme returns. */
	:global(.arc-theme-switch[data-variant='reveal'][data-mode='dark']) .icon-wrap {
		transform: scale(1.08);
	}
	:global(.arc-theme-switch[data-variant='eclipse'][data-mode='dark']) .icon-wrap {
		transform: translateX(-2px);
	}
	:global(.arc-theme-switch[data-variant='split'][data-mode='dark']) .icon-wrap {
		transform: translateX(1px);
	}
	:global(.arc-theme-switch[data-variant='rise'][data-mode='dark']) .icon-wrap {
		transform: translateY(-2px);
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.arc-theme-switch[data-settled]) .icon-wrap {
			transition: none;
		}
	}
</style>
