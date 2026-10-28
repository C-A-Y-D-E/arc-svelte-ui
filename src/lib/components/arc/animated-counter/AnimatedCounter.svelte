<script module lang="ts">
	type Part = { key: string; digit: number; order: number } | { key: string; text: string };

	/** Split a formatted number into columns keyed by place value, so 999 → 1,000 keeps the ones column the ones column. */
	function partsFor(value: number, decimals: number, locale: string): Part[] {
		const parts = new Intl.NumberFormat(locale, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
			numberingSystem: 'latn'
		}).formatToParts(value);
		let place = parts.reduce(
			(count, part) => count + (part.type === 'integer' ? part.value.length : 0),
			0
		);
		let fraction = 0;
		let order = 0;
		return parts.flatMap((part, index): Part[] => {
			if (part.type === 'integer')
				return [...part.value].map((char) => ({
					key: `i${--place}`,
					digit: Number(char),
					order: order++
				}));
			if (part.type === 'fraction')
				return [...part.value].map((char) => ({
					key: `f${fraction++}`,
					digit: Number(char),
					order: order++
				}));
			const key =
				part.type === 'group'
					? `g${place}`
					: part.type === 'decimal'
						? 'd'
						: `${part.type}${index}`;
			return [{ key, text: part.value }];
		});
	}
</script>

<script lang="ts">
	import { inView } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, motionTokens } from '../motion';
	import Column from './AnimatedCounterColumn.svelte';
	import { changeDirection } from './direction.svelte';
	import { presenceEm, widthPresence } from './motion-extras';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		value: number;
		label?: string;
		prefix?: string;
		suffix?: string;
		decimals?: number;
		/** Roll every digit up from zero the first time the counter scrolls into view. */
		animateOnView?: boolean;
		/** Formatting locale. Fixed by default so server and client render the same digits. */
		locale?: string;
	};

	let {
		value,
		label,
		prefix = '',
		suffix = '',
		decimals = 0,
		animateOnView = false,
		locale = 'en-US',
		class: className,
		...rest
	}: Props = $props();

	const VISIBLE_AMOUNT = 0.6;
	const MAX_STAGGER = 0.25;
	const { blur, duration, stagger } = motionTokens;

	let root: HTMLSpanElement;
	let seen = $state(false);
	const direction = changeDirection(() => value);
	const parts = $derived(partsFor(value, decimals, locale));
	const text = $derived(
		`${prefix}${parts.map((part) => ('text' in part ? part.text : part.digit)).join('')}${suffix}`
	);
	const armed = $derived(animateOnView && !seen);

	$effect(() => {
		if (!animateOnView) return;
		const stop = inView(
			root,
			() => {
				seen = true;
				stop();
			},
			{ amount: VISIBLE_AMOUNT }
		);
		return stop;
	});
</script>

<span bind:this={root} class={['counter', className]} {...rest}>
	{#if label}
		<span class="label">
			<span class="label-swap">
				{#key label}
					<span
						class="label-text"
						in:presenceEm={{ y: 0.3, blur: blur.soft }}
						out:presenceEm={{
							y: -0.3,
							blur: blur.subtle,
							duration: duration.fast,
							easing: ease.standard
						}}>{label}</span
					>
				{/key}
			</span>
		</span>
	{/if}
	<span class="sr-only">{text}</span>
	<span class="value" aria-hidden="true">
		{#if prefix}<span class="symbol">{prefix}</span>{/if}
		{#each parts as part (part.key)}
			{#if 'digit' in part}
				<Column
					digit={part.digit}
					direction={direction.current}
					{armed}
					delay={Math.min(part.order * stagger.item, MAX_STAGGER)}
				/>
			{:else}
				<span class="symbol" transition:widthPresence>{part.text}</span>
			{/if}
		{/each}
		{#if suffix}<span class="symbol">{suffix}</span>{/if}
	</span>
</span>

<style>
	.counter {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		color: var(--arc-foreground);
		font-family: var(--arc-font-display);
		font-size: var(--arc-text-3xl);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-display);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.label {
		margin-bottom: 8px;
		color: var(--arc-text-muted);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-xs);
		font-weight: 400;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	/* Each digit is a clipped wheel; separators clip sideways only so a comma keeps its tail. */
	.value {
		display: inline-flex;
		align-items: flex-start;
		white-space: nowrap;
		user-select: none;
	}
	/* Old and new labels share one grid cell while they cross, so the swap never shifts the number below. */
	.label-swap {
		display: grid;
		justify-items: start;
	}
	.label-text {
		display: inline-block;
		grid-area: 1 / 1;
	}
	/* Keeps a spaced affix like " SOL": flex items trim leading and trailing spaces otherwise. */
	.symbol {
		display: inline-block;
		overflow-x: clip;
		white-space: pre;
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
