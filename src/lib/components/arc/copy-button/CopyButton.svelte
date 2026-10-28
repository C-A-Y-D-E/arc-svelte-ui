<script module lang="ts">
	export type CopyButtonVariant = 'outline' | 'plain';

	type Glyph = { id: string; char: string; order: number };
	type GlyphRun = { text: string; seq: number; glyphs: Glyph[] };

	/** Shorter shared runs than this re-render the whole word; keeping a single letter reads as a glitch. */
	const MIN_SHARED_RUN = 2;

	function toGlyphs(chars: string[], seq: number): Glyph[] {
		return chars.map((char, order) => ({ id: `${seq}:${order}`, char, order }));
	}

	function sharedPrefix(prev: string[], next: string[]) {
		let length = 0;
		while (length < prev.length && length < next.length && prev[length] === next[length]) length++;
		return length < MIN_SHARED_RUN ? 0 : length;
	}

	function sharedSuffix(prev: string[], next: string[], prefix: number) {
		let length = 0;
		while (
			length < prev.length - prefix &&
			length < next.length - prefix &&
			prev[prev.length - 1 - length] === next[next.length - 1 - length]
		)
			length++;
		return length < MIN_SHARED_RUN ? 0 : length;
	}

	/** Shared leading and trailing characters keep their identity, so "Copy" to "Copied" only replaces the changed letters. */
	function morphGlyphs(run: GlyphRun, text: string): GlyphRun {
		if (run.text === text) return run;
		const prev = [...run.text];
		const next = [...text];
		const start = sharedPrefix(prev, next);
		const end = sharedSuffix(prev, next, start);
		const seq = run.seq + 1;
		const glyphs = [
			...run.glyphs.slice(0, start),
			...toGlyphs(next.slice(start, next.length - end), seq),
			...run.glyphs.slice(run.glyphs.length - end)
		];
		return { text, seq, glyphs };
	}
</script>

<script lang="ts">
	import { strings } from '../strings';
	import { animate } from 'motion';
	import { flip } from 'svelte/animate';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { useCopyFeedback } from './copy-feedback.svelte';
	import { springEasing } from './spring-easing';
	import { springPop } from './spring-transitions';

	type Props = Omit<HTMLButtonAttributes, 'value'> & {
		value: string;
		label?: string;
		iconOnly?: boolean;
		variant?: CopyButtonVariant;
		onCopied?: () => void;
	};

	let {
		value,
		label: labelProp,
		iconOnly = false,
		variant = 'outline',
		disabled,
		onCopied,
		class: className,
		...rest
	}: Props = $props();

	const MS_PER_SECOND = 1000;
	/** Copy feedback is deliberately unhurried: a slow, almost critically damped spring and long, soft crossfades read as calm, never busy.
	 *  The same motion plays in reverse when the confirmation hands back to idle, so nothing ever snaps. */
	const SETTLE_SPRING = { visualDuration: 0.5, bounce: 0.06 };
	const settle = springEasing(SETTLE_SPRING);
	const ENTER_S = 0.36;
	const LEAVE_S = 0.2;
	const ICON_OUT_S = 0.24;
	const ICON_FADE_DELAY_S = 0.03;
	const GLYPH_STAGGER_S = 0.02;
	const MAX_GLYPH_DELAY_S = 0.12;
	const CHECK_DRAW_S = 0.5;
	const CHECK_DRAW_DELAY_S = 0.05;
	const soft = motionTokens.blur.soft;

	const label = $derived(labelProp ?? strings.copy());
	const feedback = useCopyFeedback();
	const reduced = $derived(isReducedMotion());
	const text = $derived(
		feedback.state === 'copied'
			? strings.copyCopied()
			: feedback.state === 'error'
				? strings.copyFailed()
				: label
	);
	const announcement = $derived(
		feedback.state === 'idle'
			? ''
			: feedback.state === 'error'
				? strings.copyAnnounceFailed({ label })
				: strings.copyAnnounceCopied({ label })
	);

	let glyphRun: GlyphRun = { text: '', seq: 0, glyphs: [] };
	const glyphs = $derived.by(() => {
		glyphRun = morphGlyphs(glyphRun, text);
		return glyphRun.glyphs;
	});

	async function handleCopy() {
		if (await feedback.copy(value)) onCopied?.();
	}

	/** The success tick draws itself from its short stroke, the way a hand would write it. */
	function drawStroke(path: SVGPathElement) {
		if (isReducedMotion()) return;
		const timing = {
			duration: CHECK_DRAW_S,
			ease: motionTokens.ease.standard,
			delay: CHECK_DRAW_DELAY_S
		};
		animate(path, { strokeDashoffset: [1, 0] }, timing);
		animate(path, { opacity: [0, 1] }, { duration: 0.01, delay: CHECK_DRAW_DELAY_S });
	}
</script>

<button
	type="button"
	class={['button', iconOnly && 'icon-only', variant === 'plain' && 'plain', className]}
	onclick={handleCopy}
	aria-label={label}
	data-copy-state={feedback.state}
	{disabled}
	{...rest}
>
	<span class="icon" aria-hidden="true">
		{#key feedback.state}
			<span
				class="icon-inner"
				data-state={feedback.state}
				in:springPop={{
					blur: soft,
					spring: SETTLE_SPRING,
					fadeDuration: ENTER_S,
					fadeDelay: ICON_FADE_DELAY_S
				}}
				out:presence={{ scale: 0.6, blur: soft, duration: ICON_OUT_S, easing: ease.standard }}
			>
				{#if feedback.state === 'copied'}
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path class="check" d="M4 12l5 5L20 6" pathLength="1" {@attach drawStroke} />
					</svg>
				{:else if feedback.state === 'error'}
					<CircleAlertIcon size={16} strokeWidth={1.8} />
				{:else}
					<CopyIcon size={16} strokeWidth={1.8} />
				{/if}
			</span>
		{/key}
	</span>
	{#if !iconOnly}
		<span class="label" aria-hidden="true">
			<span class="measure">{label}</span>
			<span class="measure">{strings.copyCopied()}</span>
			<span class="measure">{strings.copyFailed()}</span>
			<span class="glyphs">
				{#each glyphs as glyph (glyph.id)}
					<span
						class="glyph"
						animate:flip={{
							duration: reduced ? 0 : settle.duration * MS_PER_SECOND,
							easing: settle.easing
						}}
						in:presence={{
							y: 4,
							blur: soft,
							duration: ENTER_S,
							delay: Math.min(glyph.order * GLYPH_STAGGER_S, MAX_GLYPH_DELAY_S)
						}}
						out:presence={{ y: -3, blur: soft, duration: LEAVE_S, easing: ease.standard }}
						>{glyph.char}</span
					>
				{/each}
			</span>
		</span>
	{/if}
</button>
<span class="sr-only" role="status" aria-live="polite">{announcement}</span>

<style>
	/* Width never changes: the label cell reserves its widest state while icon and letters crossfade inside it. Press releases on the spring curve. */
	.button {
		display: inline-flex;
		width: max-content;
		max-width: 100%;
		min-height: var(--arc-control-height-sm);
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-3);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.button:active:not(:disabled) {
		transform: scale(0.97);
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-fast),
			var(--arc-duration-instant);
		transition-timing-function: var(--arc-ease-standard);
	}
	.icon-only:active:not(:disabled) {
		transform: scale(0.96);
	}
	@media (hover: hover) and (pointer: fine) {
		.button:hover:not(:disabled) {
			background: var(--arc-surface-muted);
			border-color: var(--arc-border-strong);
		}
		.plain:hover:not(:disabled) {
			border-color: transparent;
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	/* Each icon carries its own color, so the outgoing glyph never tints on its way out. */
	.icon {
		position: relative;
		display: grid;
		width: 16px;
		height: 16px;
		flex: none;
	}
	.icon-inner {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.icon-inner[data-state='copied'] {
		color: var(--arc-success);
	}
	.icon-inner[data-state='error'] {
		color: var(--arc-danger);
	}
	.check {
		stroke-dasharray: 1;
	}
	/* The inline padding gives blurred edge letters room before the horizontal clip; the negative margin keeps the box the same size. */
	.label {
		display: grid;
		min-width: 0;
		margin-inline: calc(var(--arc-space-1) * -1);
		padding-inline: var(--arc-space-1);
		overflow-x: clip;
		text-align: left;
		white-space: nowrap;
	}
	.measure,
	.glyphs {
		grid-area: 1 / 1;
	}
	.measure {
		visibility: hidden;
	}
	.glyphs {
		position: relative;
		display: inline-flex;
		justify-self: start;
		white-space: pre;
	}
	.glyph {
		display: inline-block;
	}
	.icon-only {
		width: var(--arc-control-height-sm);
		padding: 0;
	}
	.plain {
		border-color: transparent;
		background: transparent;
		color: var(--arc-text-secondary);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
		.button:active:not(:disabled) {
			transform: none;
		}
	}
</style>
