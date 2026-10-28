<script lang="ts">
	import {
		ThemeSwitch,
		runThemeTransition,
		type Theme,
		type ThemeSwitchVariant
	} from '$lib/components/arc/theme-switch';
	import { ThemeSwitch as EclipseThemeSwitch } from '$lib/components/arc/theme-switch-eclipse';
	import { ThemeSwitch as RiseThemeSwitch } from '$lib/components/arc/theme-switch-rise';
	import { ThemeSwitch as SplitThemeSwitch } from '$lib/components/arc/theme-switch-split';
	import Demo from '../../Demo.svelte';

	const STORAGE_KEY = 'arc-svelte-mode';
	const DARK_CLASS = 'dark';

	let theme = $state<Theme>('dark');

	const readPageTheme = (): Theme =>
		document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light';

	// The site header can also flip the class, so the switches follow <html> rather than keep their own copy.
	$effect(() => {
		theme = readPageTheme();
		const observer = new MutationObserver(() => (theme = readPageTheme()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	/** Mirrors the layout's toggle: the class drives the tokens, the stored mode survives a reload. */
	function applyTheme(next: Theme) {
		document.documentElement.classList.toggle(DARK_CLASS, next === 'dark');
		localStorage.setItem(STORAGE_KEY, next);
	}

	function changeTheme(next: Theme, variant: ThemeSwitchVariant) {
		runThemeTransition(variant, () => applyTheme(next));
	}
</script>

<Demo title="Theme switch · reveal">
	<ThemeSwitch {theme} onThemeChange={changeTheme} />
	<output class="readout">{theme}</output>
</Demo>

<Demo title="Theme switch eclipse">
	<EclipseThemeSwitch {theme} variant="eclipse" onThemeChange={changeTheme} />
	<EclipseThemeSwitch {theme} variant="eclipse" iconOnly onThemeChange={changeTheme} />
</Demo>

<Demo title="Theme switch rise">
	<RiseThemeSwitch {theme} variant="rise" onThemeChange={changeTheme} />
	<RiseThemeSwitch {theme} variant="rise" iconOnly onThemeChange={changeTheme} />
</Demo>

<Demo title="Theme switch split">
	<SplitThemeSwitch {theme} variant="split" onThemeChange={changeTheme} />
	<SplitThemeSwitch {theme} variant="split" iconOnly onThemeChange={changeTheme} />
</Demo>

<style>
	.readout {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
