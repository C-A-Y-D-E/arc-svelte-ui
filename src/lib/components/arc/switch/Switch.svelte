<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { animate, type AnimationOptions } from 'motion';
	import { untrack } from 'svelte';
	import { on } from 'svelte/events';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = Omit<SwitchPrimitive.RootProps, 'child' | 'children'> & {
		label?: string;
		defaultChecked?: boolean;
	};

	let {
		label,
		class: className,
		defaultChecked = false,
		checked = $bindable(defaultChecked),
		onCheckedChange,
		disabled,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	/** Track inner width (42 - 6 padding) minus the 18px thumb; keep in sync with the styles below. */
	const THUMB_SIZE = 18;
	const TRAVEL = 18;
	/** How far the thumb widens toward the other side while pressed. */
	const STRETCH = 5;
	/** Critically damped: the thumb lands on its end without overshooting the state it reports. */
	const GLIDE = { type: 'spring', visualDuration: 0.3, bounce: 0 } as const;
	/** A brief stretch along the travel, so the thumb reads as moving mass rather than a sliding dot. */
	const PULSE: AnimationOptions = {
		duration: 0.34,
		times: [0, 0.4, 1],
		ease: ['easeOut', 'easeInOut']
	};
	const PULSE_SCALE = 1.16;

	const initialX = untrack(() => (checked ? TRAVEL : 0));
	let thumb: HTMLSpanElement;
	let pressed = $state(false);
	let placed = false;
	let shownChecked = untrack(() => checked);
	const extra = $derived(pressed && !isReducedMotion() && !disabled ? STRETCH : 0);

	/** The thumb stretches like a held finger and keeps its far edge anchored, then travels on a spring. */
	$effect(() => {
		const target = { x: checked ? TRAVEL - extra : 0, width: THUMB_SIZE + extra };
		const instant = !placed || isReducedMotion();
		placed = true;
		animate(
			thumb,
			target,
			instant ? { duration: 0 } : { x: GLIDE, width: motionTokens.spring.snappy }
		);
	});

	$effect(() => {
		if (shownChecked === checked) return;
		shownChecked = checked;
		if (isReducedMotion()) return;
		const pulse = animate(thumb, { scaleX: [1, PULSE_SCALE, 1] }, PULSE);
		return () => pulse.stop();
	});

	function trackPress(node: HTMLElement) {
		const release = () => (pressed = false);
		const cleanups = [
			on(node, 'pointerdown', (event) => event.button === 0 && (pressed = true)),
			on(node, 'keydown', (event) => event.key === ' ' && (pressed = true)),
			...(['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'] as const).map((type) =>
				on(node, type, release)
			)
		];
		return () => cleanups.forEach((cleanup) => cleanup());
	}

	function change(next: boolean) {
		checked = next;
		onCheckedChange?.(next);
	}
</script>

<SwitchPrimitive.Root
	bind:ref
	{checked}
	onCheckedChange={change}
	{disabled}
	aria-label={rest['aria-label'] ?? label}
	{...rest}
>
	{#snippet child({ props })}
		<button {...props} {@attach trackPress} class={['switch', className]}>
			<span class="track">
				<span bind:this={thumb} class="thumb" style="transform: translateX({initialX}px)"></span>
			</span>
			{#if label}<span class="label">{label}</span>{/if}
		</button>
	{/snippet}
</SwitchPrimitive.Root>

<style>
	.switch {
		display: inline-flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: var(--arc-space-3);
		padding: 0;
		border: 0;
		color: var(--arc-foreground);
		background: transparent;
		font: inherit;
		font-size: var(--arc-text-sm);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.switch:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	/* Fixed box: the thumb moves inside it with transforms, so nothing around the switch shifts. The track crossfades between the two fills. */
	.track {
		position: relative;
		box-sizing: border-box;
		display: flex;
		flex: 0 0 auto;
		width: 42px;
		height: 24px;
		align-items: center;
		padding: 3px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-control-track);
		isolation: isolate;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.track::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: var(--arc-control-on);
		opacity: 0;
		transition: opacity var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.switch[data-state='checked'] .track::before {
		opacity: 1;
	}
	.thumb {
		flex: 0 0 auto;
		width: 18px;
		height: 18px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-control-thumb);
		box-shadow: var(--arc-control-thumb-shadow);
		will-change: transform;
		transition: background-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.switch[data-state='checked'] .thumb {
		background: var(--arc-control-thumb-on);
	}
	@media (hover: hover) and (pointer: fine) {
		.switch[data-state='unchecked']:hover:not(:disabled) .track {
			background: var(--arc-control-track-hover);
		}
	}
	.switch:focus-visible {
		outline: none;
	}
	.switch:focus-visible .track {
		box-shadow:
			0 0 0 2px var(--arc-background),
			0 0 0 4px var(--arc-focus-ring);
	}
	.label {
		line-height: var(--arc-leading-body);
	}
	@media (prefers-reduced-motion: reduce) {
		.track,
		.track::before,
		.thumb {
			transition: none;
		}
	}
</style>
