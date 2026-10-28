<script module lang="ts">
	type Part = { key: string; digit: number } | { key: string; text: string };

	const isDigit = (char: string) => char >= '0' && char <= '9';

	/** Digits are keyed by place value and the text around them by side, so $950 → $1,000 opens a column and a comma while the rest roll. */
	function partsOf(text: string): Part[] {
		const chars = [...text];
		const first = chars.findIndex(isDigit);
		const last = chars.length - 1 - [...chars].reverse().findIndex(isDigit);
		let place = chars.filter(isDigit).length;
		return chars.map((char, index): Part => {
			if (first < 0 || index < first) return { key: `p${index}${char}`, text: char };
			if (index > last) return { key: `s${chars.length - index}${char}`, text: char };
			if (isDigit(char)) return { key: `d${--place}`, digit: Number(char) };
			return { key: `g${place}${char}`, text: char };
		});
	}
</script>

<script lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import { changeDirection } from '../animated-counter/direction.svelte';
	import { springEasing } from '../animated-counter/motion-extras';
	import { isReducedMotion, motionTokens } from '../motion';
	import RollingWheel from './RollingWheel.svelte';

	let { value, text }: { value: number; text: string } = $props();

	const MS_PER_SECOND = 1000;
	const SHIFT_EM = 0.3;
	const HIDDEN_SCALE = 0.6;
	const { blur, duration, spring } = motionTokens;
	const morph = springEasing(spring.morph);
	const smooth = springEasing(spring.smooth);

	const direction = changeDirection(() => value);
	const parts = $derived(partsOf(text));

	/* A new column opens its width while it rises in the direction of change; a leaving one closes on a spring that never passes zero. */
	function slot(node: HTMLElement, { entering }: { entering: boolean }): TransitionConfig {
		if (isReducedMotion()) {
			return entering
				? { duration: duration.instant * MS_PER_SECOND, css: (t) => `opacity:${t}` }
				: { duration: 0 };
		}
		const width = node.offsetWidth;
		const { duration: seconds, easing } = entering ? morph : smooth;
		const shift = (entering ? SHIFT_EM : -SHIFT_EM) * direction.current;
		const blurPx = entering ? blur.soft : blur.subtle;
		return {
			duration: seconds * MS_PER_SECOND,
			easing,
			css: (t, u) =>
				`width:${Math.max(0, t * width)}px;opacity:${Math.min(1, Math.max(0, t))};` +
				`transform:translateY(${u * shift}em) scale(${HIDDEN_SCALE + (1 - HIDDEN_SCALE) * t});` +
				`filter:blur(${Math.max(0, u) * blurPx}px)`
		};
	}
</script>

<span class="number">
	{#each parts as part (part.key)}
		<span
			class={'digit' in part ? 'column' : 'symbol'}
			in:slot={{ entering: true }}
			out:slot={{ entering: false }}
		>
			{#if 'digit' in part}
				<RollingWheel digit={part.digit} direction={direction.current} />
			{:else}
				{part.text}
			{/if}
		</span>
	{/each}
</span>

<style>
	.number {
		display: inline-flex;
		align-items: center;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	/* Rolling digits: each is a wheel whose window reaches a little past the line box and feathers out, so a turning digit fades at the edge. */
	.column {
		--feather: 0.2em;
		position: relative;
		display: inline-block;
		overflow-x: visible;
		overflow-y: clip;
		margin-block: calc(var(--feather) * -1);
		padding-block: var(--feather);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 calc(var(--feather) * 1.5),
			#000 calc(100% - var(--feather) * 1.5),
			transparent
		);
	}
	.symbol {
		display: inline-block;
		overflow-x: clip;
		white-space: pre;
	}
</style>
