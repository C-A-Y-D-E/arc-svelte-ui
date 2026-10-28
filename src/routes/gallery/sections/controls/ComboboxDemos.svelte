<script lang="ts">
	import { Combobox, type ComboboxOption } from '$lib/components/arc/combobox';
	import Demo from '../../Demo.svelte';

	const COUNTRIES: ComboboxOption[] = [
		{ value: 'ca', label: 'Canada', detail: 'CA' },
		{ value: 'de', label: 'Germany', detail: 'DE', keywords: ['deutschland'] },
		{ value: 'in', label: 'India', detail: 'IN' },
		{ value: 'jp', label: 'Japan', detail: 'JP', keywords: ['nihon'] },
		{ value: 'gb', label: 'United Kingdom', detail: 'GB', keywords: ['uk', 'britain'] },
		{ value: 'us', label: 'United States', detail: 'US', keywords: ['usa', 'america'] },
		{ value: 'br', label: 'Brazil', detail: 'BR', disabled: true }
	];
	const ASSIGNEES: ComboboxOption[] = [
		{
			value: 'maya',
			label: 'Maya Chen',
			avatar: { src: null, fallback: 'Maya', color: '#6b5bd6', badge: 'M' },
			tag: 'Admin'
		},
		{
			value: 'leo',
			label: 'Leo Park',
			avatar: { src: null, fallback: 'Leo', color: '#2f7d6b', badge: 'L' }
		},
		{
			value: 'ana',
			label: 'Ana Ruiz',
			avatar: { src: null, fallback: 'Ana', color: '#b8573a', badge: 'A' }
		},
		{ value: 'sam', label: 'Sam Okafor', avatar: { src: null, fallback: 'Sam' }, tag: 'Guest' }
	];
	const DOMAINS: ComboboxOption[] = [
		{ value: 'app.example.com', label: 'app.example.com' },
		{ value: 'docs.example.com', label: 'docs.example.com' }
	];

	let country = $state('');
	let assignee = $state('maya');
	let domain = $state('');

	const domainError = $derived(domain && !domain.includes('.') ? 'Enter a full domain' : undefined);
</script>

<Demo title="Combobox · searchable list">
	<div class="stack">
		<Combobox
			label="Country"
			options={COUNTRIES}
			placeholder="Search countries"
			emptyMessage="No country matches"
			bind:value={country}
		/>
		<p class="output">Country: {country || 'none'}</p>
	</div>
</Demo>

<Demo title="Combobox · avatars and tags">
	<div class="stack">
		<Combobox label="Assignee" options={ASSIGNEES} bind:value={assignee} />
		<p class="output">Assignee: {assignee || 'unassigned'}</p>
	</div>
</Demo>

<Demo title="Combobox · freeform with error">
	<div class="stack">
		<Combobox
			label="Custom domain"
			options={DOMAINS}
			placeholder="Type or pick a domain"
			freeform
			error={domainError}
			bind:value={domain}
		/>
		<Combobox label="Workspace" options={DOMAINS} value="app.example.com" disabled />
		<p class="output">Domain: {domain || 'none'}</p>
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
