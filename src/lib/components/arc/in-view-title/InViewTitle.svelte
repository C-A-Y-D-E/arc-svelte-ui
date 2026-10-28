<script module lang="ts">
	export type InViewTitleVariant = 'word' | 'line' | 'blur' | 'tracking' | 'wipe';
	export type InViewTitleTag = 'h1' | 'h2' | 'h3';
</script>

<script lang="ts">
	import { inView } from 'motion';
	import { isReducedMotion, motionTokens } from '../motion';

	/**
	 * A section title that reveals itself once it scrolls into view. `blur` sharpens word by word and suits most headings; `word` and `line`
	 * rise out of a clip for editorial pages; `tracking` opens tight letter spacing; `wipe` uncovers the title from left to right through a soft edge.
	 * Titles already above the viewport show immediately, and server rendered titles appear on their own if scripts are slow.
	 */
	type Props = {
		text: string;
		variant?: InViewTitleVariant;
		as?: InViewTitleTag;
		/** Line breaks for the `line` variant. */
		lines?: string[];
		class?: string;
		id?: string;
		/** Set false to replay the reveal on every entry. */
		once?: boolean;
	};

	let {
		text,
		variant = 'blur',
		as = 'h2',
		lines,
		class: className,
		id,
		once = true
	}: Props = $props();

	const VISIBLE_AMOUNT = 0.45;
	const WORD_STAGGER_BUDGET = 0.4;
	/** Horizontal distance each letter travels per step from its word's center in the tracking variant. */
	const TRACK_EM = 0.06;
	/** How long each variant's transform takes to settle, in seconds. Blur and opacity finish sooner, in proportion. */
	const SETTLE = { word: 0.8, line: 0.86, blur: 0.8, tracking: 0.9, wipe: 0.9 };
	const { stagger } = motionTokens;

	let wrap: HTMLDivElement;
	let seen = $state(false);
	let passed = $state(false);
	let hydrated = $state(false);
	let late = $state(false);

	const reduced = $derived(hydrated && isReducedMotion());
	const visible = $derived(reduced || late || seen || passed);
	const instant = $derived(reduced || late);
	const words = $derived(text.split(' ').filter(Boolean));
	const wordStep = $derived(
		Math.min(stagger.word * 1.5, WORD_STAGGER_BUDGET / Math.max(words.length, 1))
	);
	const titleLines = $derived(lines?.length ? lines : [text]);

	// When scripts arrive after the stylesheet fallback has already shown the title, it stays put instead of animating again.
	$effect(() => {
		const firstPart = wrap.querySelector('.part');
		late = firstPart !== null && getComputedStyle(firstPart).opacity === '1' && !isReducedMotion();
		hydrated = true;
	});

	$effect(() => {
		const stop = inView(
			wrap,
			() => {
				seen = true;
				if (once) {
					stop();
					return;
				}
				return () => (seen = false);
			},
			{ amount: VISIBLE_AMOUNT }
		);
		return stop;
	});

	// A title that is already above the viewport shows at once.
	$effect(() => {
		if (seen || passed) return;
		const revealPassedTitle = () => {
			if (wrap.getBoundingClientRect().top < 0) passed = true;
		};
		revealPassedTitle();
		window.addEventListener('scroll', revealPassedTitle, { passive: true });
		return () => window.removeEventListener('scroll', revealPassedTitle);
	});

	function letterShift(letterCount: number, index: number) {
		return `${((letterCount - 1) / 2 - index) * TRACK_EM}em`;
	}
</script>

<div
	bind:this={wrap}
	class={['wrap', variant, !hydrated && 'pending', className]}
	data-visible={visible || undefined}
	data-instant={instant || undefined}
	style:--settle={SETTLE[variant]}
>
	{#if variant === 'wipe'}
		<!-- A soft edged mask sweeps across the title instead of a hard clip, so no letter is ever cut mid stroke. -->
		<div class="wipe part">
			<svelte:element this={as} {id}>{text}</svelte:element>
		</div>
	{:else if variant === 'line'}
		<svelte:element this={as} {id} aria-label={text}>
			{#each titleLines as line, index (index)}
				<span class="line-clip" aria-hidden="true"
					><span class="part" style:--delay={`${index * stagger.line}s`}>{line}</span></span
				>
			{/each}
		</svelte:element>
	{:else}
		<!-- prettier-ignore -->
		<svelte:element this={as} {id} aria-label={text}>{#each words as word, index (index)}{#if variant === 'word'}<span class="clip" aria-hidden="true"><span class="part" style:--delay={`${index * wordStep}s`}>{word}</span></span>{:else if variant === 'blur'}<span class="blur-word part" aria-hidden="true" style:--delay={`${index * wordStep}s`}>{word}</span>{:else}{@const letters = Array.from(word)}<span class="track-word part" aria-hidden="true" style:--delay={`${index * stagger.char * 2}s`}>{#each letters as letter, letterIndex (letterIndex)}<span class="letter part" style:--shift={letterShift(letters.length, letterIndex)} style:--delay={`${index * stagger.char * 2}s`}>{letter}</span>{/each}</span>{/if}{index < words.length - 1 ? ' ' : ''}{/each}</svelte:element>
	{/if}
</div>

<style>
	.wrap {
		min-width: 0;
		color: var(--arc-foreground);
	}
	/* Clips hide the rise; padding with matching negative margins leaves room for descenders and blur without changing layout. */
	.clip {
		display: inline-block;
		overflow: hidden;
		vertical-align: top;
		padding: 0.08em 0.14em 0.2em;
		margin: -0.08em -0.14em -0.2em;
	}
	.line-clip {
		display: block;
		overflow: hidden;
		padding: 0.06em 0.12em 0.18em;
		margin: -0.06em -0.12em -0.18em;
	}
	.clip > span,
	.line-clip > span,
	.blur-word,
	.track-word,
	.letter {
		display: inline-block;
	}
	.track-word {
		white-space: nowrap;
	}
	/* The wipe mask is 2.3 times the title's width with a feathered middle, so the soft edge sits fully outside the title at both ends of the sweep.
	   Padding with matching negative margins keeps descenders and overhangs inside the masked box without changing layout. */
	.wipe {
		padding: 0.1em 0.12em 0.22em;
		margin: -0.1em -0.12em -0.22em;
		mask-image: linear-gradient(90deg, #000 44%, transparent 56%);
		mask-size: 230% 100%;
		mask-repeat: no-repeat;
		mask-position: 0% 0;
	}

	/* Transform settles longest, blur clears sooner, and opacity leads, so text is readable before it has fully arrived. */
	.part {
		transition:
			transform calc(var(--settle) * 1s) var(--arc-ease-enter) var(--delay, 0s),
			mask-position calc(var(--settle) * 1s) var(--arc-ease-standard) var(--delay, 0s),
			filter calc(var(--settle) * 0.78s) var(--arc-ease-enter) var(--delay, 0s),
			opacity calc(var(--settle) * 0.56s) var(--arc-ease-standard) var(--delay, 0s);
	}
	/* Hiding is a quick fade with no stagger. */
	.wrap:not([data-visible]) .part {
		transition:
			transform 0.18s var(--arc-ease-standard),
			mask-position 0.18s var(--arc-ease-standard),
			filter 0.18s var(--arc-ease-standard),
			opacity 0.18s var(--arc-ease-standard);
	}
	.wrap[data-instant] .part {
		transition: none;
	}
	.word:not([data-visible]) .part {
		opacity: 0;
		transform: translateY(0.9em);
	}
	.line:not([data-visible]) .part {
		opacity: 0;
		transform: translateY(112%);
	}
	.blur:not([data-visible]) .part {
		opacity: 0;
		transform: translateY(0.2em);
		filter: blur(8px);
	}
	.tracking:not([data-visible]) .track-word {
		opacity: 0;
		filter: blur(4px);
	}
	.tracking:not([data-visible]) .letter {
		transform: translateX(var(--shift));
	}
	.tracking .letter {
		--settle: 1;
	}
	.wipe:is(.wrap:not([data-visible]) *) {
		mask-position: 100% 0;
		transform: translateX(-0.12em);
	}

	/* Server rendered titles start hidden. If scripts have not taken over after 2.4s, show them anyway; the class is removed on hydration. */
	.pending .part {
		animation: settle 0.4s var(--arc-ease-enter) 2.4s forwards;
	}
	@keyframes settle {
		to {
			opacity: 1;
			transform: none;
			filter: none;
			mask-position: 0% 0;
			mask-image: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.part {
			opacity: 1 !important;
			transform: none !important;
			filter: none !important;
			mask-image: none !important;
		}
		.pending .part {
			animation: none;
		}
	}
</style>
