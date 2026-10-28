<script lang="ts">
	import { mapValue, styleEffect, type MotionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';

	type Props = {
		id: string;
		index: number;
		progress: MotionValue<number>;
		active: boolean;
		label: string;
		children: Snippet;
	};

	let { id, index, progress, active, label, children }: Props = $props();

	const NEIGHBOUR_SCALE = 0.9;
	const NEIGHBOUR_OPACITY = 0.5;

	/** Server-rendered resting look, so slides sit at their size before the motion values take over. */
	const restingStyle = untrack(() =>
		active ? undefined : `transform: scale(${NEIGHBOUR_SCALE}); opacity: ${NEIGHBOUR_OPACITY}`
	);

	let slide: HTMLDivElement;

	/** A slide shrinks and dims with its distance from the center, read straight from the track position so it never lags the finger. */
	$effect(() => {
		const around = [index - 1, index, index + 1];
		const scale = mapValue(progress, around, [NEIGHBOUR_SCALE, 1, NEIGHBOUR_SCALE]);
		const opacity = mapValue(progress, around, [NEIGHBOUR_OPACITY, 1, NEIGHBOUR_OPACITY]);
		const stop = styleEffect(slide, { scale, opacity });
		return () => {
			stop();
			scale.destroy();
			opacity.destroy();
		};
	});
</script>

<div
	bind:this={slide}
	{id}
	class="slide"
	role="tabpanel"
	aria-roledescription="slide"
	aria-label={label}
	inert={!active}
	style={restingStyle}
>
	{@render children()}
</div>

<style>
	.slide {
		flex: 0 0 var(--carousel-slide);
		min-width: 0;
		transform-origin: 50% 50%;
		will-change: transform, opacity;
	}
	.slide :global(img) {
		-webkit-user-drag: none;
	}
</style>
