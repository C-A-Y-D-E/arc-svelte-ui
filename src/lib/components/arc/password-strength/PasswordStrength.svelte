<script lang="ts">
	import { animate } from 'motion';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { closeRow, followCopyHeight, motionTransition, openRow, RollingNumber } from '../input';
	import { EyeMorph } from '../password-field';
	import { isReducedMotion, motionTokens } from '../motion';
	import RuleMark from './RuleMark.svelte';
	import {
		defaultPasswordRules,
		estimateStrength,
		TOO_SHORT,
		type PasswordRule,
		type PasswordStrengthResult,
		type StrengthLevel
	} from './strength';

	/**
	 * A new password field that shows how strong the password is while it is typed: four segments fill and change tone,
	 * each rule checks off with a drawn tick, and the strength word morphs in place. Use it when creating or changing a
	 * password; use a plain password field for sign in. Scoring happens on the device, nothing is sent anywhere.
	 */
	type Props = Omit<HTMLInputAttributes, 'type' | 'value' | 'defaultValue' | 'children'> & {
		label: string;
		value?: string;
		defaultValue?: string;
		onValueChange?: (value: string, strength: PasswordStrengthResult) => void;
		/** Rules to check. Strength is the share of rules met, spread over four steps. */
		rules?: PasswordRule[];
		/** Error copy tied to the field. The field shakes once each time a new error appears. */
		error?: string;
		revealed?: boolean;
		onRevealedChange?: (revealed: boolean) => void;
		ref?: HTMLInputElement | null;
	};

	let {
		label,
		defaultValue = '',
		value = $bindable(defaultValue),
		onValueChange,
		oninput,
		rules = defaultPasswordRules,
		error,
		revealed = $bindable(false),
		onRevealedChange,
		id,
		class: className,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	type Track = {
		rank: number;
		level: StrengthLevel;
		previousLevel: StrengthLevel;
		direction: number;
		metKey: string;
		previousMet: string;
	};

	const SEGMENTS = [0, 1, 2, 3];
	const FILL_STAGGER_S = 0.05;
	const EMPTY_STAGGER_S = 0.03;
	const TICK_STAGGER_S = 0.05;
	/** About .3em of the strength word and error copy. */
	const RISE_PX = 4;
	/** About .45em of the small rule copy. */
	const DIGIT_TRAVEL_PX = 5;
	const RISE_IN_S = 0.22;
	const RISE_OUT_S = 0.15;
	const FADE_IN_S = 0.15;
	const FADE_OUT_S = 0.1;
	/** A spring released with sideways velocity rings out on its own, the way a refused field shakes on a phone. */
	const SHAKE = {
		type: 'spring',
		velocity: -240,
		stiffness: 900,
		damping: 15,
		restDelta: 0.1
	} as const;
	const { blur, spring } = motionTokens;

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const rulesId = $derived(`${controlId}-rules`);
	const errorId = $derived(`${controlId}-error`);

	const strength = $derived(estimateStrength(value, rules));
	const met = $derived(new Set(strength.met));

	let lastTrack: Track | undefined;
	/** The previous level and rule states tell which way the word moves and which segments and ticks join a staggered wave. */
	const track = $derived.by(() => (lastTrack = advanceTrack(lastTrack, strength)));
	const changedRules = $derived.by(() => {
		const previousMet = new Set(track.previousMet.split(' ').filter(Boolean));
		return rules
			.filter((rule) => met.has(rule.id) !== previousMet.has(rule.id))
			.map((rule) => rule.id);
	});

	const summary = $derived(
		strength.level
			? `Strength: ${strength.label}. ${strength.met.length} of ${rules.length} requirements met.`
			: ''
	);
	const describedBy = $derived(
		[rest['aria-describedby'], error ? errorId : undefined, rulesId].filter(Boolean).join(' ')
	);

	function advanceTrack(previous: Track | undefined, next: PasswordStrengthResult): Track {
		const rank = next.label === TOO_SHORT ? 0.5 : next.level;
		const metKey = next.met.join(' ');
		if (!previous) {
			return {
				rank,
				level: next.level,
				previousLevel: next.level,
				direction: 1,
				metKey,
				previousMet: metKey
			};
		}
		if (previous.rank === rank && previous.metKey === metKey) return previous;
		const rankChanged = previous.rank !== rank;
		return {
			rank,
			level: next.level,
			previousLevel: rankChanged ? previous.level : previous.previousLevel,
			direction: rankChanged ? (rank > previous.rank ? 1 : -1) : previous.direction,
			metKey,
			previousMet: previous.metKey !== metKey ? previous.metKey : previous.previousMet
		};
	}

	function remainingFor(rule: PasswordRule) {
		return value && !met.has(rule.id) ? (rule.remaining?.(value) ?? 0) : 0;
	}

	function tickDelay(rule: PasswordRule) {
		const order = changedRules.indexOf(rule.id);
		return order > 0 ? order * TICK_STAGGER_S : 0;
	}

	function handleInput(event: Event & { currentTarget: EventTarget & HTMLInputElement }) {
		oninput?.(event);
		onValueChange?.(event.currentTarget.value, estimateStrength(event.currentTarget.value, rules));
	}

	// Only a change after mount resolves the text, so the field never blurs in on first paint.
	let revealChanged = $state(false);
	function toggleReveal() {
		revealed = !revealed;
		revealChanged = true;
		onRevealedChange?.(revealed);
	}

	/** The word rises when strength improves and drops when it falls, so the direction reads without looking at the meter. */
	function riseIn(node: Element, direction: number) {
		return motionTransition(node, {
			keyframes: isReducedMotion()
				? { opacity: [0, 1] }
				: {
						opacity: [0, 1],
						y: [RISE_PX * direction, 0],
						filter: [`blur(${blur.soft}px)`, 'blur(0px)']
					},
			transition: isReducedMotion()
				? { duration: FADE_IN_S }
				: { duration: RISE_IN_S, ease: motionTokens.ease.enter }
		});
	}

	function riseOut(node: Element, direction: number) {
		return motionTransition(node, {
			keyframes: isReducedMotion()
				? { opacity: 0 }
				: { opacity: 0, y: -RISE_PX * direction, filter: `blur(${blur.subtle}px)` },
			transition: isReducedMotion()
				? { duration: FADE_OUT_S }
				: { duration: RISE_OUT_S, ease: motionTokens.ease.standard },
			pop: true
		});
	}

	let shell: HTMLDivElement;
	const fills: HTMLElement[] = $state([]);
	let fillsPlaced = false;

	/** A pasted password fills left to right; clearing empties right to left. */
	$effect(() => {
		const { level } = strength;
		const { previousLevel } = track;
		const jump = !fillsPlaced || isReducedMotion();
		fills.forEach((fill, index) => {
			const on = index < level;
			const wave = on ? index - previousLevel : previousLevel - 1 - index;
			const delay = Math.max(0, wave) * (on ? FILL_STAGGER_S : EMPTY_STAGGER_S);
			animate(
				fill,
				{ x: on ? '0%' : '-101%' },
				jump ? { duration: 0 } : { ...spring.smooth, delay }
			);
		});
		fillsPlaced = true;
	});

	let lastError: string | undefined;
	$effect(() => {
		const previous = lastError;
		lastError = error;
		if (!error || error === previous || isReducedMotion()) return;
		const shaking = animate(0, 0, {
			...SHAKE,
			onUpdate: (x) => (shell.style.translate = `${x}px`)
		});
		return () => shaking.stop();
	});
</script>

<div class="field" data-level={strength.level}>
	<label class="label" for={controlId}>{label}</label>
	<div bind:this={shell} class="shell">
		<input
			autocomplete="new-password"
			autocapitalize="off"
			autocorrect="off"
			spellcheck={false}
			{...rest}
			bind:this={ref}
			bind:value
			oninput={handleInput}
			id={controlId}
			type={revealed ? 'text' : 'password'}
			aria-invalid={error ? true : rest['aria-invalid']}
			aria-describedby={describedBy}
			data-reveal={revealChanged ? (revealed ? 'shown' : 'hidden') : undefined}
			class={['input', className]}
		/>
		<button
			type="button"
			class="reveal"
			onclick={toggleReveal}
			aria-label="Show password"
			aria-pressed={revealed}
			aria-controls={controlId}
		>
			<EyeMorph slashed={revealed} slashInset={3} />
		</button>
	</div>
	{#if error}
		<!-- Error copy opens its row on a spring, then the words settle in. -->
		<span class="error-slot" {@attach followCopyHeight} in:openRow out:closeRow>
			<span id={errorId} class="error">
				{#key error}
					<span class="error-text" in:riseIn={1} out:riseOut={1}>{error}</span>
				{/key}
			</span>
		</span>
	{/if}
	<div class="meter-row">
		<div
			class="meter"
			role="meter"
			aria-label="Password strength"
			aria-valuemin={0}
			aria-valuemax={4}
			aria-valuenow={strength.level}
			aria-valuetext={strength.level ? strength.label : 'No password yet'}
		>
			{#each SEGMENTS as index (index)}
				<!-- Each fill slides in from the left inside its clipped track, so the rounded ends keep their shape at every frame. -->
				<span class="segment"><span bind:this={fills[index]} class="fill"></span></span>
			{/each}
		</div>
		<span class="word" aria-hidden="true">
			{#key strength.label}
				<span class="word-text" in:riseIn={track.direction} out:riseOut={track.direction}
					>{strength.label}</span
				>
			{/key}
		</span>
	</div>
	<ul id={rulesId} class="rules" aria-label="Password requirements">
		{#each rules as rule (rule.id)}
			{@const ok = met.has(rule.id)}
			{@const remaining = remainingFor(rule)}
			<li class="rule" data-met={ok || undefined}>
				<RuleMark met={ok} delay={tickDelay(rule)} />
				<span class="rule-label"
					>{rule.label}<span class="sr-only">{ok ? ', met' : ', not met'}</span></span
				>
				<span class="remaining" aria-hidden="true">
					{#if remaining > 0}
						<span class="remaining-text" in:riseIn={1} out:riseOut={1}
							><span class="number"
								><RollingNumber value={String(remaining)} travel={DIGIT_TRAVEL_PX} /></span
							> more</span
						>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	<span class="sr-only" role="status">{summary}</span>
</div>

<style>
	/* No row gap: a closing error row would still pay it. Each row carries its own space instead. */
	.field {
		--password-tone: var(--arc-border-strong);
		display: grid;
		min-width: 0;
	}
	.field[data-level='1'] {
		--password-tone: var(--arc-danger);
	}
	.field[data-level='2'] {
		--password-tone: var(--arc-warning);
	}
	.field[data-level='3'],
	.field[data-level='4'] {
		--password-tone: var(--arc-success);
	}
	.label {
		margin-bottom: var(--arc-space-2);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	/* The shell only transitions color and ring; its sideways shake is a spring on translate, so the two never fight. */
	.shell {
		display: flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: var(--arc-space-1);
		padding: 0 5px 0 var(--arc-space-4);
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		box-shadow: 0 0 0 6px transparent;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.shell:hover:not(:focus-within) {
			border-color: var(--arc-border-strong);
		}
	}
	.shell:focus-within {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
	}
	.shell:has(.input[aria-invalid='true']) {
		border-color: var(--arc-danger);
	}
	.shell:has(.input[aria-invalid='true']):focus-within {
		box-shadow: 0 0 0 3px color-mix(in oklch, var(--arc-danger) 24%, transparent);
	}
	.input {
		width: 100%;
		min-width: 0;
		height: calc(var(--arc-control-height-md) - 2px);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		outline: 0;
	}
	.input:focus-visible {
		outline: 0;
	}
	.input::placeholder {
		color: var(--arc-text-muted);
	}
	/* Touch keyboards zoom into fields under 16px, so coarse pointers get the larger size. */
	@media (pointer: coarse) {
		.input {
			font-size: var(--arc-text-base);
		}
	}
	/* Dots and characters resolve into each other instead of snapping. Swapping the keyframe name restarts it. */
	.input[data-reveal='shown'] {
		animation: resolve-shown var(--arc-duration-standard) var(--arc-ease-enter);
	}
	.input[data-reveal='hidden'] {
		animation: resolve-hidden var(--arc-duration-standard) var(--arc-ease-enter);
	}
	@keyframes resolve-shown {
		from {
			opacity: 0.35;
			filter: blur(2px);
		}
	}
	@keyframes resolve-hidden {
		from {
			opacity: 0.35;
			filter: blur(2px);
		}
	}
	.reveal {
		display: grid;
		width: 34px;
		height: 34px;
		flex: 0 0 auto;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: calc(var(--arc-radius-control) - 5px);
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.reveal:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.reveal:active {
		transform: scale(0.94);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 100ms var(--arc-ease-standard);
	}
	.reveal[aria-pressed='true'] {
		color: var(--arc-foreground);
	}
	.reveal:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 1px;
	}
	/* The row's space is padding inside the clipped slot, so its height opens from a true zero. */
	.error-slot {
		display: block;
		overflow: hidden;
	}
	.error {
		position: relative;
		display: block;
		padding-top: var(--arc-space-2);
		color: var(--arc-danger);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.error-text {
		display: block;
	}
	.meter-row {
		display: flex;
		align-items: center;
		gap: var(--arc-space-3);
		margin-top: var(--arc-space-3);
	}
	.meter {
		display: grid;
		flex: 1 1 auto;
		min-width: 0;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 5px;
	}
	.segment {
		position: relative;
		height: 4px;
		overflow: hidden;
		isolation: isolate;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border);
	}
	.fill {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background: var(--password-tone);
		transform: translateX(-101%);
		transition: background-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* A fixed slot: the meter never resizes when the word changes, and the word stays flush with the field's edge. */
	.word {
		position: relative;
		display: block;
		flex: 0 0 4.5rem;
		height: 1.4em;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		text-align: right;
		white-space: nowrap;
	}
	.word-text {
		display: inline-block;
	}
	.rules {
		display: grid;
		gap: 6px;
		margin: var(--arc-space-4) 0 0;
		padding: 0;
		list-style: none;
	}
	.rule {
		display: flex;
		min-height: 1.25rem;
		align-items: center;
		gap: 10px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		transition: color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.rule[data-met] {
		color: var(--arc-foreground);
	}
	.rule-label {
		min-width: 0;
	}
	.remaining {
		position: relative;
		display: block;
		margin-left: auto;
		padding-left: var(--arc-space-2);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		white-space: nowrap;
	}
	.remaining-text {
		display: inline-flex;
		align-items: baseline;
		gap: 0.28em;
	}
	.number {
		display: inline-flex;
		font-variant-numeric: tabular-nums;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.shell,
		.reveal,
		.fill,
		.rule {
			transition: none;
		}
		.reveal:active {
			transform: none;
		}
		.input[data-reveal] {
			animation: none;
		}
	}
</style>
