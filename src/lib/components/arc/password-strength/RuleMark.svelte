<script lang="ts">
	let { met, delay }: { met: boolean; delay: number } = $props();
</script>

<!-- The tint grows under the tick while the tick draws from its short stroke; unchecking retracts it faster than it drew. -->
<span class={['mark', met && 'met']} style:--mark-delay={`${delay}s`} aria-hidden="true">
	<span class="mark-fill"></span>
	<svg
		class="tick"
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M4.75 8.25 7 10.5l4.25-4.75" pathLength="1" />
	</svg>
</span>

<style>
	/* The outline hands over to a faint tint while the tick draws on top; most of the color sits on the tick. */
	.mark {
		--tick-lag: 0.06s;
		position: relative;
		display: block;
		width: 16px;
		height: 16px;
		flex: 0 0 16px;
		border: 1.25px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-pill);
		color: var(--arc-success);
		transition: border-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.met {
		border-color: transparent;
	}
	.mark-fill {
		position: absolute;
		inset: -1.25px;
		border-radius: inherit;
		background: color-mix(in oklch, var(--arc-success) 16%, transparent);
		opacity: 0;
		transform: scale(0.5);
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring) var(--mark-delay),
			opacity var(--arc-duration-instant) linear var(--mark-delay);
	}
	.met .mark-fill {
		opacity: 1;
		transform: scale(1);
		transition:
			transform var(--arc-duration-spring) var(--arc-ease-spring) var(--mark-delay),
			opacity var(--arc-duration-fast) linear var(--mark-delay);
	}
	.tick {
		position: absolute;
		inset: -1.25px;
		width: 16px;
		height: 16px;
	}
	.tick path {
		opacity: 0;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		transition:
			stroke-dashoffset var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) linear var(--tick-lag);
	}
	.met .tick path {
		opacity: 1;
		stroke-dashoffset: 0;
		transition:
			stroke-dashoffset var(--arc-duration-standard) var(--arc-ease-enter)
				calc(var(--mark-delay) + var(--tick-lag)),
			opacity 0.05s linear calc(var(--mark-delay) + var(--tick-lag));
	}
	@media (prefers-reduced-motion: reduce) {
		.mark,
		.mark-fill,
		.met .mark-fill,
		.tick path,
		.met .tick path {
			transition: none;
		}
	}
</style>
