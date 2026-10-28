<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import InViewTitle, {
		type InViewTitleVariant
	} from '$lib/components/arc/in-view-title/InViewTitle.svelte';
	import Demo from '../../Demo.svelte';

	type TitleExample = { variant: InViewTitleVariant; text: string; lines?: string[] };

	const EXAMPLES: TitleExample[] = [
		{ variant: 'blur', text: 'Plans that grow with your team' },
		{ variant: 'word', text: 'Every invoice in one place' },
		{
			variant: 'line',
			text: 'Faster deploys, calmer releases',
			lines: ['Faster deploys,', 'calmer releases']
		},
		{ variant: 'tracking', text: 'Built for busy teams' },
		{ variant: 'wipe', text: 'Reports your board will read' }
	];

	const runs = $state<Record<InViewTitleVariant, number>>({
		blur: 0,
		word: 0,
		line: 0,
		tracking: 0,
		wipe: 0
	});
</script>

{#each EXAMPLES as { variant, text, lines } (variant)}
	<Demo title="In-view title · {variant}">
		<div class="stack">
			{#key runs[variant]}
				<InViewTitle {text} {lines} {variant} as="h3" class="title" />
			{/key}
			<Button variant="secondary" size="sm" onclick={() => (runs[variant] += 1)}>Replay</Button>
		</div>
	</Demo>
{/each}

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-5);
		text-align: center;
	}
	.stack :global(.title h3) {
		margin: 0;
		font-size: var(--arc-text-xl);
		font-weight: 600;
		line-height: 1.25;
	}
</style>
