<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { ImageCompare, type ImageCompareOrientation } from '$lib/components/arc/image-compare';
	import Demo from '../../Demo.svelte';

	/** Flat stand-in for a living room photo, drawn inline so the demo has no network dependency. */
	const ROOM_SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
		<rect width="600" height="450" fill="#ece1cf"/>
		<rect y="0" width="600" height="26" fill="#8a6446"/>
		<rect x="120" y="0" width="22" height="120" fill="#8a6446"/>
		<rect x="458" y="0" width="22" height="120" fill="#8a6446"/>
		<path d="M190 250V120a60 60 0 0 1 120 0v130z" fill="#bcd3dd"/>
		<path d="M330 250V120a60 60 0 0 1 120 0v130z" fill="#bcd3dd"/>
		<rect x="247" y="60" width="6" height="190" fill="#f6efe3"/>
		<rect x="387" y="60" width="6" height="190" fill="#f6efe3"/>
		<rect y="330" width="600" height="120" fill="#b3834f"/>
		<ellipse cx="300" cy="392" rx="210" ry="34" fill="#c9a37a"/>
		<rect x="150" y="262" width="300" height="70" rx="18" fill="#d9c7ad"/>
		<rect x="140" y="300" width="320" height="46" rx="14" fill="#cbb697"/>
		<rect x="200" y="270" width="70" height="40" rx="10" fill="#9c6b45"/>
		<rect x="330" y="270" width="70" height="40" rx="10" fill="#6f7c5a"/>
		<rect x="512" y="250" width="34" height="80" fill="#8c5f3e"/>
		<circle cx="529" cy="232" r="38" fill="#5f7a4e"/>
	</svg>`;
	const ROOM_PHOTO = `data:image/svg+xml,${encodeURIComponent(ROOM_SCENE)}`;
	/** Arc's "raw capture" grade: the same image, flat and muted. */
	const RAW_GRADE = 'saturate(.45) contrast(.78) brightness(1.1) sepia(.12)';

	let orientation = $state<ImageCompareOrientation>('horizontal');
	let position = $state(50);

	function toggleOrientation() {
		orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
	}
</script>

{#snippet rawRoom()}
	<img
		src={ROOM_PHOTO}
		alt="Raw capture of a bright living room with timber beams and arched windows, flat and muted"
		style:filter={RAW_GRADE}
	/>
{/snippet}

{#snippet gradedRoom()}
	<img
		src={ROOM_PHOTO}
		alt="Final grade of the same room, with warmer light and richer wood tones"
	/>
{/snippet}

<Demo title="Image compare · before and after" wide>
	<div class="stage">
		<ImageCompare before={rawRoom} after={gradedRoom} aspectRatio="4 / 3" />
	</div>
</Demo>

<Demo title="Image compare · orientation" wide>
	<div class="stage">
		<ImageCompare
			before={rawRoom}
			after={gradedRoom}
			{orientation}
			bind:position
			labels={['Raw', 'Graded']}
			label="Raw and graded"
		/>
		<div class="toolbar">
			<Button variant="secondary" size="sm" onclick={toggleOrientation}>
				{orientation === 'horizontal' ? 'Stack vertically' : 'Place side by side'}
			</Button>
			<span class="readout">Divider at {Math.round(position)}%</span>
		</div>
	</div>
</Demo>

<style>
	.stage {
		display: grid;
		width: 100%;
		max-width: 35rem;
		gap: var(--arc-space-3);
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
	}
	.readout {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
