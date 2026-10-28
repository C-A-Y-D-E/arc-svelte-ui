<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { TransitionConfig } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';
	import AlertBox, { type AlertTone } from './AlertBox.svelte';
	import { springTiming } from './swap';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		tone?: AlertTone;
		title: string;
		children?: Snippet;
		/** Controls presence. Hiding the alert collapses its height and fades it out. */
		open?: boolean;
		/** Shows a dismiss button. An uncontrolled alert collapses first, then calls this. */
		onDismiss?: () => void;
	};

	let { open, onDismiss, ...rest }: Props = $props();

	const MS = 1000;
	const heightSpring = springTiming(motionTokens.spring.smooth);
	const { duration } = motionTokens;

	let dismissed = $state(false);
	/** Only an alert shown after the first render settles its icon in. */
	let mounted = $state(false);
	$effect(() => {
		const frame = requestAnimationFrame(() => (mounted = true));
		return () => cancelAnimationFrame(frame);
	});

	const managed = $derived(open !== undefined || Boolean(onDismiss));
	const isOpen = $derived(open ?? !dismissed);
	const dismiss = $derived(
		onDismiss && (() => (open === undefined ? (dismissed = true) : onDismiss()))
	);

	/**
	 * Presence collapses the height with the fade, so the content below closes the gap instead of jumping.
	 * Height rides the smooth spring while opacity keeps its own shorter tween.
	 */
	function presenceFrame(node: HTMLElement, entering: boolean): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		const height = node.offsetHeight;
		const fade = entering
			? { seconds: duration.standard, easing: ease.enter }
			: { seconds: duration.fast, easing: ease.standard };
		const total = heightSpring.duration;
		return {
			duration: total * MS,
			css: (t) => {
				const elapsed = (entering ? t : 1 - t) * total;
				const grown = heightSpring.easing(elapsed / total);
				const faded = fade.easing(Math.min(elapsed / fade.seconds, 1));
				const shown = entering
					? { height: grown, opacity: faded }
					: { height: 1 - grown, opacity: 1 - faded };
				return `overflow:hidden;height:${height * shown.height}px;opacity:${shown.opacity};`;
			}
		};
	}
</script>

{#if !managed}
	<AlertBox {...rest} />
{:else if isOpen}
	<div
		class="presence"
		in:presenceFrame={true}
		out:presenceFrame={false}
		onoutroend={() => {
			if (open === undefined) onDismiss?.();
		}}
	>
		<AlertBox {...rest} onDismiss={dismiss} animateIcon={mounted} />
	</div>
{/if}

<style>
	.presence {
		min-width: 0;
	}
</style>
