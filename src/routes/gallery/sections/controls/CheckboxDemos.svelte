<script lang="ts">
	import { Checkbox, type CheckedState } from '$lib/components/arc/checkbox';
	import Demo from '../../Demo.svelte';

	const CHANNELS = [
		{ id: 'email', label: 'Email' },
		{ id: 'push', label: 'Push' },
		{ id: 'sms', label: 'SMS' }
	];

	let channels = $state<Record<string, CheckedState>>({ email: true, push: false, sms: false });
	let terms = $state<CheckedState>(false);

	const onCount = $derived(CHANNELS.filter((channel) => channels[channel.id] === true).length);
	const allState = $derived<CheckedState>(
		onCount === CHANNELS.length ? true : onCount === 0 ? false : 'indeterminate'
	);

	function setAll(next: CheckedState) {
		for (const channel of CHANNELS) channels[channel.id] = next === true;
	}
</script>

<Demo title="Checkbox · select all with indeterminate">
	<div class="stack">
		<Checkbox label="All channels" checked={allState} onCheckedChange={setAll} />
		<div class="children">
			{#each CHANNELS as channel (channel.id)}
				<Checkbox label={channel.label} bind:checked={channels[channel.id]} />
			{/each}
		</div>
		<p class="output">{onCount} of {CHANNELS.length} on · all: {String(allState)}</p>
	</div>
</Demo>

<Demo title="Checkbox · description and disabled">
	<div class="stack">
		<Checkbox
			label="Accept the terms"
			description="Required before you invite teammates."
			bind:checked={terms}
		/>
		<Checkbox label="Weekly digest" defaultChecked disabled />
		<Checkbox label="Beta features" disabled />
		<p class="output">Terms: {terms ? 'accepted' : 'not accepted'}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-3);
	}
	.children {
		display: grid;
		gap: var(--arc-space-3);
		padding-left: var(--arc-space-6);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
