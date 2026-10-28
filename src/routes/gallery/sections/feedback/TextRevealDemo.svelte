<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { TextReveal } from '$lib/components/arc/text-reveal';
	import Demo from '../../Demo.svelte';

	let headlineRun = $state(0);
	let paragraphRun = $state(0);
</script>

<Demo title="Text reveal · headline with a line break">
	<div class="stack">
		{#key headlineRun}
			<TextReveal text={'Ship every release\nwith confidence'} as="h2" class="headline" />
		{/key}
		<Button variant="secondary" size="sm" onclick={() => (headlineRun += 1)}>Replay</Button>
	</div>
</Demo>

<Demo title="Text reveal · paragraph with delay">
	<div class="stack">
		{#key paragraphRun}
			<TextReveal
				text="Invoices, approvals and reports in one workspace your whole team can use."
				as="p"
				delay={0.2}
				class="lede"
			/>
		{/key}
		<Button variant="secondary" size="sm" onclick={() => (paragraphRun += 1)}>Replay</Button>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		max-width: 420px;
		justify-items: center;
		gap: var(--arc-space-5);
		text-align: center;
	}
	.stack :global(.headline) {
		margin: 0;
		font-size: var(--arc-text-2xl);
		font-weight: 600;
		line-height: 1.2;
	}
	.stack :global(.lede) {
		margin: 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-lg);
	}
</style>
