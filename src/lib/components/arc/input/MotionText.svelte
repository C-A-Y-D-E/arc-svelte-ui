<script lang="ts">
	import { ease, motionTokens, presence } from '../motion';
	import RollingNumber from './RollingNumber.svelte';

	type Props = {
		text: string;
		/** Counts in the copy, such as "12 characters", roll digit by digit. */
		rollNumbers?: boolean;
	};

	let { text, rollNumbers = true }: Props = $props();

	/** About .35em of the small helper copy. */
	const WORD_TRAVEL_PX = 4;
	const WORD_EXIT_S = 0.14;
	const { blur } = motionTokens;

	const words = $derived(text.split(' '));

	function isNumber(word: string) {
		return rollNumbers && /^\d[\d.,/:]*%?$/.test(word);
	}
</script>

<!-- Changed words rise in and unblur while unchanged words hold still, and numbers roll. Assistive tech reads the plain copy. -->
<span class="sr-only">{text}</span>
<span class="words" aria-hidden="true">
	{#each words as word, index (`${index}:${isNumber(word) ? '#' : word}`)}
		<span
			class="word"
			in:presence={{ y: WORD_TRAVEL_PX, blur: blur.soft }}
			out:presence={{
				y: -WORD_TRAVEL_PX,
				blur: blur.subtle,
				duration: WORD_EXIT_S,
				easing: ease.standard,
				pop: true
			}}
			>{#if isNumber(word)}<RollingNumber value={word} />{:else}{word}{/if}{index < words.length - 1
				? ' '
				: ''}</span
		>
	{/each}
</span>

<style>
	/* Words are measured against this box when they pop out to leave, so it must be the positioned parent. */
	.words {
		position: relative;
		display: block;
	}
	.word {
		display: inline-block;
		white-space: pre-wrap;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
