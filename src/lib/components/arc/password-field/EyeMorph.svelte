<script lang="ts">
	type Props = {
		slashed: boolean;
		/** Where the slash starts and ends, in the 24-unit icon grid. */
		slashInset?: number;
	};

	let { slashed, slashInset = 2 }: Props = $props();

	const ICON_GRID = 24;
	const uid = $props.id();
	const maskId = `eye-${uid}`;
	const slash = $derived(
		`M${slashInset} ${slashInset}L${ICON_GRID - slashInset} ${ICON_GRID - slashInset}`
	);
</script>

<!-- One eye that a slash draws across, cutting the outline beneath it, instead of swapping two icons. -->
<svg
	class={['eye', slashed && 'slashed']}
	width="18"
	height="18"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
		<rect width="24" height="24" fill="white" stroke="none" />
		<path class="slash" d={slash} pathLength="1" stroke="black" stroke-width="5" />
	</mask>
	<g mask={`url(#${maskId})`}>
		<path
			d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
		/>
		<circle cx="12" cy="12" r="3" />
	</g>
	<path class="slash" d={slash} pathLength="1" />
</svg>

<style>
	.slash {
		opacity: 0;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		transition:
			stroke-dashoffset var(--arc-duration-standard) var(--arc-ease-standard),
			opacity var(--arc-duration-instant) linear;
	}
	.slashed .slash {
		opacity: 1;
		stroke-dashoffset: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.slash {
			transition: none;
		}
	}
</style>
