<script lang="ts">
	import { Select, type SelectOption } from '$lib/components/arc/select';
	import Demo from '../../Demo.svelte';

	const TIMEZONES: SelectOption[] = [
		{ value: 'utc', label: 'UTC' },
		{ value: 'america-new-york', label: 'New York (UTC−5)' },
		{ value: 'europe-london', label: 'London (UTC+0)' },
		{ value: 'europe-berlin', label: 'Berlin (UTC+1)' },
		{ value: 'asia-tokyo', label: 'Tokyo (UTC+9)' }
	];
	const PAGE_SIZES: SelectOption[] = [
		{ value: '10', label: '10 rows' },
		{ value: '25', label: '25 rows' },
		{ value: '50', label: '50 rows' },
		{ value: '100', label: '100 rows', disabled: true }
	];

	let timezone = $state('');
	let pageSize = $state('25');
</script>

<Demo title="Select · placeholder and description">
	<div class="stack">
		<Select
			label="Time zone"
			options={TIMEZONES}
			placeholder="Choose a time zone"
			description="Reports are sent at 9:00 in this zone."
			bind:value={timezone}
		/>
		<Select label="Language" options={[{ value: 'en', label: 'English' }]} value="en" disabled />
		<p class="output">Time zone: {timezone || 'not set'}</p>
	</div>
</Demo>

<Demo title="Select · small, hidden label, disabled option">
	<div class="stack">
		<div class="row">
			<span class="row-label">Rows per page</span>
			<Select
				label="Rows per page"
				hideLabel
				size="sm"
				options={PAGE_SIZES}
				bind:value={pageSize}
			/>
		</div>
		<p class="output">Page size: {pageSize}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-4);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
	}
	.row-label {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
