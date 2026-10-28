<script lang="ts">
	import RiseText from './RiseText.svelte';

	let { value }: { value: number } = $props();

	let previous: number | undefined;
	let lastDirection = 1;
	const direction = $derived.by(() => {
		if (previous !== undefined && previous !== value) lastDirection = value > previous ? 1 : -1;
		previous = value;
		return lastDirection;
	});
	const chars = $derived([...String(value)]);
</script>

<!-- The day's update count rolls digit by digit in the direction it moved. -->
<span class="rolling" aria-hidden="true">
	{#each chars as char, index (chars.length - index)}
		<span class="place"><RiseText text={char} {direction} /></span>
	{/each}
</span>

<style>
	.rolling {
		display: inline-flex;
	}
	.place {
		position: relative;
		display: inline-flex;
		overflow: clip;
		overflow-clip-margin: 0.15em;
	}
</style>
