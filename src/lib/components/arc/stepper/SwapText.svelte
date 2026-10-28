<script lang="ts">
	import { sizeMorph, swapIn, swapOut } from '../alert/swap';

	let { text, class: className }: { text?: string; class: string } = $props();

	/** A wrapped message may land a little after the text changes, so the slot stays armed longer than usual. */
	const MORPH_WINDOW_MS = 700;
</script>

<!--
	Text that rises in with a small blur when it changes. Its slot springs to the new height, so a message that wraps
	eases the steps below it down instead of pushing them; unrelated resizes (fonts, container width) follow exactly.
-->
<span class="slot" {@attach sizeMorph({ window: MORPH_WINDOW_MS, clip: false })}>
	<span class="slot-inner">
		{#each text ? [text] : [] as current (`${className}:${current}`)}
			<span class={className} in:swapIn out:swapOut>{current}</span>
		{/each}
	</span>
</span>

<style>
	.slot {
		display: block;
	}
	/* Changing text pops out of flow against this box while it leaves, so it must be the positioned parent. */
	.slot-inner {
		position: relative;
		display: block;
	}
	.description,
	.error {
		display: block;
		padding-top: 2px;
		font-size: var(--arc-text-xs);
		font-weight: 400;
		line-height: var(--arc-leading-body);
		overflow-wrap: break-word;
	}
	.description {
		color: var(--arc-text-muted);
	}
	.error {
		color: var(--arc-danger);
	}
	.caption-label {
		display: block;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: 1.25rem;
	}
</style>
