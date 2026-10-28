<script module lang="ts">
	export type HoldToConfirmTone = 'danger' | 'neutral';
</script>

<script lang="ts">
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { animate, motionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { strings } from '../strings';
	import { motionTransition } from '../action-button/motion-transition';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';

	/**
	 * A button that commits only after it is held, for destructive or hard to undo actions where a stray tap must not count. A fill tracks the hold on a
	 * linear timeline; letting go early rewinds it on a spring, and finishing morphs the label and icon into a done state. Space and Enter can be held too.
	 * Prefer a regular confirmation dialog when people need to read consequences first; use this when the consequence is already on screen.
	 */
	type Props = Omit<HTMLButtonAttributes, 'children' | 'onclick'> & {
		/** The instruction and the action, for example “Hold to delete project”. */
		label: string;
		/** Shown once the hold completes, for example “Deleted”. */
		confirmedLabel?: string;
		/** Called once when the hold completes. */
		onConfirm: () => void;
		/** Hold length in milliseconds. */
		duration?: number;
		icon?: Snippet;
		tone?: HoldToConfirmTone;
		/** Controls the done state. Set it back to false to reset the button; leave it undefined to let the button keep its own state. */
		confirmed?: boolean;
		/** Reports when a hold starts and ends, for surrounding hints such as “Keep holding”. */
		onHoldChange?: (holding: boolean) => void;
		ref?: HTMLButtonElement | null;
	};

	let {
		label,
		confirmedLabel: confirmedLabelProp,
		onConfirm,
		duration = 1200,
		icon,
		tone = 'danger',
		confirmed,
		onHoldChange,
		class: className,
		disabled,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	const hintId = $props.id();
	const WIDE_BUTTON_PX = 220;
	/** Sliding this far off the button cancels the hold, the way a native press does. */
	const POINTER_SLACK_PX = 24;
	const HAPTIC_MS = 12;
	const TEXT_TRAVEL_PX = 4;
	const MS_PER_SECOND = 1000;
	const { blur, spring } = motionTokens;
	const blurSubtle = `blur(${blur.subtle}px)`;
	/** Scale rides the spring; opacity and blur tween so the blur never overshoots below zero. */
	const iconEnter = {
		...spring.snappy,
		opacity: { duration: motionTokens.duration.fast, ease: motionTokens.ease.enter },
		filter: { duration: motionTokens.duration.fast, ease: motionTokens.ease.enter }
	};

	let ownDone = $state(false);
	let completions = $state(0);
	let holding = $state(false);
	let labelWidth = $state<number>();
	let fillNode: HTMLSpanElement;

	const done = $derived(confirmed ?? ownDone);
	const confirmedLabel = $derived(confirmedLabelProp ?? strings.holdDone());
	const text = $derived(done ? confirmedLabel : label);
	const seconds = $derived(
		(duration / MS_PER_SECOND).toLocaleString('en-US', { maximumFractionDigits: 1 })
	);

	const progress = motionValue(0);
	let source: 'pointer' | 'key' | null = null;
	let pointerType = 'mouse';
	let fill: ReturnType<typeof animate> | undefined;
	let press: ReturnType<typeof animate> | undefined;

	$effect(() => {
		const paintFill = (value: number) => {
			const hidden = (1 - Math.min(1, Math.max(0, value))) * 100;
			fillNode.style.clipPath = `inset(0 ${hidden.toFixed(3)}% 0 0)`;
		};
		paintFill(progress.get());
		const unsubscribe = progress.on('change', paintFill);
		return () => {
			unsubscribe();
			fill?.stop();
			press?.stop();
		};
	});

	// A reset rewinds the fill as the label morphs back; a confirmation the parent declined rewinds too.
	$effect(() => {
		void done;
		void completions;
		untrack(syncFill);
	});

	function syncFill() {
		if (source) return;
		if (done && progress.get() < 1) {
			fill?.stop();
			if (isReducedMotion()) progress.jump(1);
			else fill = animate(progress, 1, spring.smooth);
		}
		if (!done && progress.get() > 0) rewind();
	}

	function pressTo(pressed: boolean) {
		if (!ref) return;
		press?.stop();
		if (isReducedMotion()) {
			press = animate(ref, { scale: 1 }, { duration: 0 });
			return;
		}
		const depth = ref.offsetWidth > WIDE_BUTTON_PX ? 0.985 : 0.97;
		press = animate(ref, { scale: pressed ? depth : 1 }, spring.snappy);
	}

	function rewind() {
		fill?.stop();
		if (isReducedMotion()) progress.jump(0);
		else fill = animate(progress, 0, { ...spring.smooth, velocity: 0 });
	}

	function stopHolding() {
		source = null;
		holding = false;
		onHoldChange?.(false);
		pressTo(false);
	}

	function complete() {
		if (!source) return;
		stopHolding();
		if (pointerType === 'touch') navigator.vibrate?.(HAPTIC_MS);
		ownDone = true;
		completions += 1;
		onConfirm();
	}

	/** Starts or resumes the fill from wherever it is, so a quick re-press after letting go carries on instead of starting over. */
	function begin(from: 'pointer' | 'key') {
		if (done || disabled || source) return;
		source = from;
		holding = true;
		onHoldChange?.(true);
		pressTo(true);
		fill?.stop();
		const remaining = ((1 - progress.get()) * duration) / MS_PER_SECOND;
		fill = animate(progress, 1, { duration: remaining, ease: 'linear', onComplete: complete });
	}

	function release() {
		if (!source) return;
		stopHolding();
		rewind();
	}

	function onpointerdown(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (!event.isPrimary || event.button !== 0) return;
		pointerType = event.pointerType;
		event.currentTarget.setPointerCapture(event.pointerId);
		begin('pointer');
	}

	function onpointermove(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
		if (source !== 'pointer') return;
		const box = event.currentTarget.getBoundingClientRect();
		const outside =
			event.clientX < box.left - POINTER_SLACK_PX ||
			event.clientX > box.right + POINTER_SLACK_PX ||
			event.clientY < box.top - POINTER_SLACK_PX ||
			event.clientY > box.bottom + POINTER_SLACK_PX;
		if (outside) release();
	}

	const isHoldKey = (event: KeyboardEvent) => event.key === ' ' || event.key === 'Enter';

	function onkeydown(event: KeyboardEvent) {
		if (!isHoldKey(event)) return;
		event.preventDefault();
		if (!event.repeat) begin('key');
	}

	function onkeyup(event: KeyboardEvent) {
		if (!isHoldKey(event)) return;
		event.preventDefault();
		if (source === 'key') release();
	}

	/** Springs the label frame to the width of new text, so the button morphs instead of snapping. A late web font or a reflow follows instantly. */
	const measureLabel: Attachment<HTMLSpanElement> = (measure) => {
		let lastText: string | null = null;
		let sizing: ReturnType<typeof animate> | undefined;
		const observer = new ResizeObserver(([entry]) => {
			// Layout width, not the painted box: the done label is measured while the pressed button is still scaled down.
			const next = entry?.borderBoxSize?.[0]?.inlineSize ?? measure.offsetWidth;
			const current = measure.textContent;
			const morph =
				lastText !== null && lastText !== current && !isReducedMotion() && labelWidth !== undefined;
			lastText = current;
			sizing?.stop();
			if (!morph || labelWidth === undefined) {
				labelWidth = next;
				return;
			}
			sizing = animate(labelWidth, next, {
				...spring.morph,
				onUpdate: (width) => (labelWidth = width)
			});
		});
		observer.observe(measure);
		return () => {
			observer.disconnect();
			sizing?.stop();
		};
	};

	function iconIn() {
		if (isReducedMotion())
			return { keyframes: { opacity: [0, 1] }, transition: { duration: 0.15 } };
		return {
			keyframes: { opacity: [0, 1], scale: [0.6, 1], filter: [blurSubtle, 'blur(0px)'] },
			transition: iconEnter
		};
	}

	function iconOut() {
		if (isReducedMotion()) return { keyframes: { opacity: 0 }, transition: { duration: 0.1 } };
		return {
			keyframes: { opacity: 0, scale: 0.6, filter: blurSubtle },
			transition: { duration: 0.15, ease: motionTokens.ease.standard }
		};
	}
</script>

<!-- Icon and label. The button renders it twice: once on the surface and once inside the fill, so the text changes colour exactly at the fill edge. -->
{#snippet face(measured: boolean)}
	<span class="face">
		<span class="icon-slot">
			{#each [done] as shownDone (shownDone)}
				<span class="icon-phase" in:motionTransition={iconIn()} out:motionTransition={iconOut()}>
					{#if shownDone}
						<!-- The tick draws itself from its short stroke, the way a hand would write it. -->
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path class="drawn" pathLength="1" d="M4 12.5l5 5L20 6.5" />
						</svg>
					{:else if icon}
						{@render icon()}
					{:else}
						<Trash2Icon strokeWidth={1.75} />
					{/if}
				</span>
			{/each}
		</span>
		<span
			class="label-frame"
			style:width={labelWidth === undefined ? undefined : `${labelWidth}px`}
		>
			{#if measured}<span class="measure" {@attach measureLabel}>{text}</span>{/if}
			{#key text}
				<span
					class="label"
					in:presence={{ y: TEXT_TRAVEL_PX, blur: blur.soft, duration: 0.22 }}
					out:presence={{
						y: -TEXT_TRAVEL_PX,
						blur: blur.subtle,
						duration: 0.15,
						easing: ease.standard,
						pop: true
					}}>{text}</span
				>
			{/key}
		</span>
	</span>
{/snippet}

<button
	{...rest}
	bind:this={ref}
	type="button"
	class={['button', className]}
	data-tone={tone}
	data-state={done ? 'done' : holding ? 'holding' : 'idle'}
	{disabled}
	aria-disabled={done || undefined}
	aria-label={text}
	aria-describedby={done ? undefined : hintId}
	{onpointerdown}
	{onpointermove}
	onpointerup={release}
	onpointercancel={release}
	onlostpointercapture={release}
	{onkeydown}
	{onkeyup}
	onblur={release}
	oncontextmenu={(event) => event.preventDefault()}
>
	{@render face(true)}
	<span bind:this={fillNode} class="fill" aria-hidden="true">
		{@render face(false)}
	</span>
</button>
<span id={hintId} class="sr-only">{strings.holdHint({ seconds })}</span>
<span class="sr-only" role="status">{done ? confirmedLabel : ''}</span>

<style>
	/* The button hugs its label; the fill is a second, inverted copy of the face revealed by clip-path, so the text flips colour exactly at the edge. */
	.button {
		--hold-ink: var(--arc-danger);
		--hold-fill: var(--arc-danger);
		--hold-on-fill: var(--arc-background);
		--hold-border: color-mix(in oklch, var(--arc-danger) 32%, var(--arc-border));
		position: relative;
		display: inline-flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		justify-content: center;
		padding: 0 var(--arc-space-5);
		border: 1px solid var(--hold-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		color: var(--hold-ink);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.button[data-tone='neutral'] {
		--hold-ink: var(--arc-foreground);
		--hold-fill: var(--arc-foreground);
		--hold-border: var(--arc-border-strong);
	}
	@media (hover: hover) and (pointer: fine) {
		.button:not(:disabled):not([aria-disabled='true']):hover {
			background: color-mix(in oklch, var(--hold-fill) 6%, var(--arc-surface));
		}
	}
	.button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.button[aria-disabled='true'] {
		cursor: default;
	}
	.button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.face {
		display: inline-flex;
		align-items: center;
		gap: var(--arc-space-2);
		white-space: nowrap;
	}
	/* Covers the border too, and keeps its own rounded corners; the clip only ever cuts a straight leading edge. */
	.fill {
		position: absolute;
		inset: -1px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--arc-radius-control);
		background: var(--hold-fill);
		color: var(--hold-on-fill);
		clip-path: inset(0 100% 0 0);
		pointer-events: none;
	}
	.icon-slot {
		display: grid;
		width: 18px;
		height: 18px;
		flex: none;
		place-items: center;
	}
	.icon-phase {
		display: grid;
		grid-area: 1 / 1;
		place-items: center;
	}
	.icon-phase :global(svg) {
		width: 18px;
		height: 18px;
	}
	.drawn {
		stroke-dasharray: 1;
		animation: draw 0.32s var(--arc-ease-enter) 0.08s both;
	}
	/* Clips the outgoing label while the frame narrows, with room for the rise and the soft blur. */
	.label-frame {
		position: relative;
		display: inline-flex;
		min-width: 0;
		clip-path: inset(-0.6em -3px);
	}
	.label {
		display: block;
		white-space: nowrap;
	}
	.measure {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		white-space: nowrap;
		pointer-events: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
			opacity: 0;
		}
		16% {
			opacity: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
		.drawn {
			animation: none;
		}
	}
</style>
