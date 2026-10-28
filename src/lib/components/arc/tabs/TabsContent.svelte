<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { TransitionConfig } from 'svelte/transition';
	import { isReducedMotion, motionTokens } from '../motion';
	import { getTabsContext } from './tabs-context';

	type Props = Omit<TabsPrimitive.ContentProps, 'child'> & {
		/** Keeps the panel mounted and skips the enter and exit animation. */
		forceMount?: boolean;
	};

	let {
		ref = $bindable(null),
		value,
		forceMount = false,
		class: className,
		children,
		...rest
	}: Props = $props();

	const tabs = getTabsContext();
	const { duration, spring } = motionTokens;
	const ENTER_TRAVEL_PX = 8;
	const EXIT_TRAVEL_PX = 6;
	const HEIGHT_TOLERANCE_PX = 1;
	const REDUCED_EXIT_SECONDS = 0.1;
	const MS_PER_SECOND = 1000;

	const selected = $derived(tabs.active === value);
	let stopTracking: (() => void) | undefined;

	function unpin(node: HTMLElement) {
		Object.assign(node.style, { position: '', top: '', left: '', width: '', margin: '' });
		node.inert = false;
	}

	/** The tab root may have changed size around the outgoing panel, so pin it where it was on screen while it fades. */
	function pin(node: HTMLElement) {
		const root = tabs.root;
		const before = tabs.leavingRect ?? node.getBoundingClientRect();
		const frame = root?.getBoundingClientRect() ?? before;
		Object.assign(node.style, {
			position: 'absolute',
			top: `${before.top - frame.top}px`,
			left: `${before.left - frame.left}px`,
			width: `${before.width}px`,
			margin: '0'
		});
		node.inert = true;
	}

	/** Panels slide the way the selection moved. Motion drives both directions, so a quick switch back retargets mid-flight. */
	function panelIn(node: HTMLElement): TransitionConfig {
		const revived = node.inert;
		unpin(node);
		if (isReducedMotion()) {
			animate(node, { opacity: revived ? 1 : [0, 1], x: 0 }, { duration: duration.instant });
			return {};
		}
		const x = revived ? 0 : [tabs.direction * ENTER_TRAVEL_PX, 0];
		animate(
			node,
			{ opacity: revived ? 1 : [0, 1], x },
			{ opacity: { duration: duration.standard, ease: motionTokens.ease.enter }, x: spring.smooth }
		);
		return {};
	}

	function panelOut(node: HTMLElement): TransitionConfig {
		stopTracking?.();
		pin(node);
		const reduced = isReducedMotion();
		const seconds = reduced ? REDUCED_EXIT_SECONDS : duration.instant;
		const exit = reduced ? { opacity: 0 } : { opacity: 0, x: tabs.direction * -EXIT_TRAVEL_PX };
		animate(node, exit, { duration: seconds, ease: motionTokens.ease.standard });
		return { duration: seconds * MS_PER_SECOND };
	}

	/** The incoming panel starts at the outgoing panel's height and settles at its own, so content below glides instead of jumping. */
	const morphHeight: Attachment<HTMLElement> = (node) => {
		const from = tabs.panelHeight;
		const to = node.offsetHeight;
		const release = () => Object.assign(node.style, { height: '', overflow: '' });
		const morph =
			from !== null && Math.abs(from - to) > HEIGHT_TOLERANCE_PX && !untrack(isReducedMotion);
		if (morph && to > from) node.style.overflow = 'clip';
		const controls = morph
			? animate(node, { height: [from, to] }, { ...spring.smooth, onComplete: release })
			: undefined;
		tabs.panelHeight = morph ? from : to;
		const observer = new ResizeObserver(() => (tabs.panelHeight = node.offsetHeight));
		observer.observe(node);
		stopTracking = () => observer.disconnect();
		return () => {
			observer.disconnect();
			controls?.stop();
			release();
		};
	};
</script>

<TabsPrimitive.Content {value} {...rest}>
	{#snippet child({ props })}
		{#if forceMount}
			<div {...props} bind:this={ref} class={['content', className]}>{@render children?.()}</div>
		{:else if selected}
			<div
				{...props}
				bind:this={ref}
				class={['content', className]}
				{@attach morphHeight}
				in:panelIn
				out:panelOut
			>
				{@render children?.()}
			</div>
		{/if}
	{/snippet}
</TabsPrimitive.Content>

<style>
	.content {
		margin-top: var(--arc-space-4);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.content[data-state='inactive'] {
		pointer-events: none;
	}
	.content:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
		border-radius: var(--arc-radius-control);
	}
</style>
