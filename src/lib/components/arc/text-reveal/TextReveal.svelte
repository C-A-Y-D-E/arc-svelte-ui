<script module lang="ts">
	export type TextRevealTag = 'h1' | 'h2' | 'h3' | 'p';
</script>

<script lang="ts">
	import { motionTokens } from '../motion';

	/**
	 * Reveals a short headline or sentence once, as it mounts: each word rises out of its own clip while it sharpens from a soft blur.
	 * The entrance runs in CSS, so it starts on first paint and never leaves text hidden when scripts are slow.
	 * Use `\n` in `text` for a deliberate line break and wrap the component in `{#key}` to replay it.
	 */
	type Props = {
		text: string;
		as?: TextRevealTag;
		class?: string;
		id?: string;
		/** Seconds to wait before the first word rises. */
		delay?: number;
	};

	let { text, as = 'h2', class: className, id, delay = 0 }: Props = $props();

	/** Total stagger stays under this many seconds, however long the text is. */
	const MAX_STAGGER = motionTokens.duration.considered;

	const lines = $derived(text.split('\n').map((line) => line.split(' ').filter(Boolean)));
	const wordCount = $derived(lines.reduce((total, words) => total + words.length, 0));
	const step = $derived(Math.min(motionTokens.stagger.word, MAX_STAGGER / Math.max(wordCount, 1)));
	const blur = $derived(as === 'p' ? motionTokens.blur.soft : motionTokens.blur.text);
	const placed = $derived.by(() => {
		let position = 0;
		return lines.map((words, lineIndex) =>
			words.map((word) => ({ word, delay: delay + position++ * step + lineIndex * step }))
		);
	});
</script>

<svelte:element this={as} {id} class={['reveal', className]} style:--reveal-blur={`${blur}px`}>
	<span class="sr-only">{text.replace(/\n/g, ' ')}</span>
	<!-- prettier-ignore -->
	{#each placed as words, lineIndex (lineIndex)}<span class="line" aria-hidden="true">{#each words as { word, delay: wordDelay }, wordIndex (wordIndex)}<span class="clip"><span class="word" style:--reveal-delay={`${wordDelay}s`}>{word}</span></span>{wordIndex < words.length - 1 ? ' ' : ''}{/each}</span>{lineIndex < placed.length - 1 ? ' ' : ''}{/each}
</svelte:element>

<style>
	.reveal {
		max-width: 24ch;
		margin: 0;
		overflow: visible;
		color: var(--arc-foreground);
		text-wrap: balance;
	}
	.line {
		display: block;
	}
	/* The clip hides the rise below the line through a feathered bottom edge, so a blurred word surfaces softly instead of being cut by a hard line.
	   Padding with matching negative margins leaves room for descenders and the blur without changing layout; the feather sits below the descenders, so resting words are never dimmed. */
	.clip {
		display: inline-block;
		vertical-align: top;
		padding: 0.1em 0.16em 0.24em;
		margin: -0.1em -0.16em -0.24em;
		mask-image: linear-gradient(#000 calc(100% - 0.18em), transparent);
	}
	/* Three tracks: the rise settles longest, the fade finishes first, and the blur clears between them.
	   Backwards fill holds the hidden start through each word's delay, then lets go at the end, so resting words keep no transform or filter layer. */
	.word {
		display: inline-block;
		animation:
			rise 0.76s var(--arc-ease-enter) var(--reveal-delay, 0s) backwards,
			fade 0.44s var(--arc-ease-standard) var(--reveal-delay, 0s) backwards,
			focus 0.58s var(--arc-ease-enter) var(--reveal-delay, 0s) backwards;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
		user-select: none;
	}
	@keyframes rise {
		from {
			transform: translateY(0.62em);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes focus {
		from {
			filter: blur(var(--reveal-blur, 4px));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.clip {
			mask-image: none;
		}
		.word {
			animation: fade 0.15s linear backwards;
		}
	}
</style>
