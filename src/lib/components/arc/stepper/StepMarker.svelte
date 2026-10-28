<script module lang="ts">
	export type GlyphKind = 'number' | 'check' | 'error';
</script>

<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { springTiming } from '../alert/swap';

	type Props = {
		number: number;
		kind: GlyphKind;
		current: boolean;
		/** Seconds before a new glyph pops in. */
		glyphDelay: number;
		/** Seconds before the ring grows in. */
		ringDelay: number;
	};

	let { number, kind, current, glyphDelay, ringDelay }: Props = $props();

	const RING_SCALE = 0.6;
	const GLYPH_SCALE = 0.5;
	const DRAW_SECONDS = 0.32;
	const DRAW_LAG = 0.04;
	const DOT_LAG = 0.16;
	const { blur, duration, spring } = motionTokens;
	const snappy = springTiming(spring.snappy);
	const leave = { duration: duration.fast, easing: ease.standard };

	/** Glyphs present on first render are already drawn; only later ones draw their stroke. */
	let settled = false;
	$effect(() => {
		const frame = requestAnimationFrame(() => (settled = true));
		return () => cancelAnimationFrame(frame);
	});

	function drawStroke(path: SVGPathElement) {
		const delay = untrack(() => glyphDelay) + DRAW_LAG;
		if (!settled || untrack(isReducedMotion)) return;
		animate(
			path,
			{ strokeDashoffset: [1, 0] },
			{ duration: DRAW_SECONDS, ease: motionTokens.ease.enter, delay }
		);
	}

	function popDot(dot: SVGCircleElement) {
		const delay = untrack(() => glyphDelay) + DOT_LAG;
		if (!settled || untrack(isReducedMotion)) return;
		animate(dot, { scale: [0, 1] }, { ...spring.snappy, delay });
	}
</script>

<!-- The ring grows out from behind the disc once progress arrives, so the eye lands on the new step after the connector fills. -->
<span class="marker" aria-hidden="true">
	{#if current}
		<span
			class="ring"
			in:presence={{ scale: RING_SCALE, delay: ringDelay, ...snappy }}
			out:presence={{ scale: RING_SCALE, ...leave }}
		></span>
	{/if}
	<!-- The number, check, and alert share one spot: the outgoing glyph shrinks away while the next one pops in and draws its stroke. -->
	<span class="disc">
		{#key kind}
			<span
				class="glyph"
				in:presence={{ scale: GLYPH_SCALE, blur: blur.subtle, delay: glyphDelay, ...snappy }}
				out:presence={{ scale: GLYPH_SCALE, blur: blur.subtle, ...leave }}
			>
				{#if kind === 'number'}
					{number}
				{:else}
					<svg
						class="icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						{#if kind === 'check'}
							<path
								{@attach drawStroke}
								d="M5.5 12.5l4.25 4.25L18.5 8"
								pathLength="1"
								stroke-dasharray="1"
							/>
						{:else}
							<path {@attach drawStroke} d="M12 6.75v6.5" pathLength="1" stroke-dasharray="1" />
							<circle
								{@attach popDot}
								class="dot"
								cx="12"
								cy="17.4"
								r="1.4"
								fill="currentColor"
								stroke="none"
							/>
						{/if}
					</svg>
				{/if}
			</span>
		{/key}
	</span>
</span>

<style>
	.marker {
		position: relative;
		display: grid;
		width: var(--marker);
		height: var(--marker);
		flex: none;
		place-items: center;
	}
	/* The ring sits behind the disc and grows out of it; the disc carries the state color and the glyph. */
	.ring {
		position: absolute;
		inset: calc(var(--halo) * -1);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-accent-subtle);
		transition: background-color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.disc {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface);
		box-shadow: inset 0 0 0 1px var(--arc-border-strong);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard),
			color var(--arc-duration-standard) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.glyph {
		display: grid;
		grid-area: 1 / 1;
		place-items: center;
	}
	.icon {
		width: 0.875rem;
		height: 0.875rem;
	}
	.dot {
		transform-box: fill-box;
		transform-origin: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.disc,
		.ring {
			transition: none;
		}
	}
</style>
