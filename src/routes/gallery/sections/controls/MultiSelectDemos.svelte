<script lang="ts">
	import { MultiSelect, type MultiSelectOption } from '$lib/components/arc/multi-select';
	import Demo from '../../Demo.svelte';

	const LABELS: MultiSelectOption[] = [
		{ value: 'bug', label: 'Bug' },
		{ value: 'feature', label: 'Feature' },
		{ value: 'design', label: 'Design' },
		{ value: 'docs', label: 'Docs' },
		{ value: 'performance', label: 'Performance' },
		{ value: 'security', label: 'Security', disabled: true }
	];

	let labels = $state<string[]>(['bug', 'design', 'docs']);
</script>

<Demo title="Multi-select · issue labels">
	<div class="stack">
		<MultiSelect
			label="Labels"
			options={LABELS}
			placeholder="Add labels"
			maxVisible={2}
			bind:value={labels}
		/>
		<p class="output">Selected: {labels.length ? labels.join(', ') : 'none'}</p>
	</div>
</Demo>

<Demo title="Multi-select · empty and disabled">
	<div class="stack">
		<MultiSelect label="Reviewers" options={LABELS} placeholder="Pick reviewers" />
		<MultiSelect label="Watchers" options={LABELS} defaultValue={['feature']} disabled />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-4);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
