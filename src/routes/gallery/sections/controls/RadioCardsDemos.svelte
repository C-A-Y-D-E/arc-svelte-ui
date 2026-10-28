<script lang="ts">
	import BuildingIcon from '@lucide/svelte/icons/building-2';
	import UserIcon from '@lucide/svelte/icons/user';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { RadioCards, type RadioCardOption } from '$lib/components/arc/radio-cards';
	import Demo from '../../Demo.svelte';

	const PLANS: RadioCardOption[] = [
		{
			value: 'starter',
			label: 'Starter',
			description: 'For one person getting set up.',
			meta: '$0 / month',
			icon: userIcon
		},
		{
			value: 'team',
			label: 'Team',
			description: 'Shared projects and roles.',
			meta: '$12 / seat',
			icon: usersIcon
		},
		{
			value: 'enterprise',
			label: 'Enterprise',
			meta: 'Custom',
			icon: buildingIcon,
			disabled: true,
			disabledReason: 'Talk to sales to enable.'
		}
	];
	const REGIONS: RadioCardOption[] = [
		{ value: 'us-east', label: 'US East', description: 'Virginia', meta: '24 ms' },
		{ value: 'eu-west', label: 'EU West', description: 'Dublin', meta: '88 ms' },
		{ value: 'ap-south', label: 'Asia Pacific', description: 'Singapore', meta: '190 ms' }
	];

	let plan = $state<string | null>('team');
	let region = $state<string | null>(null);
</script>

{#snippet userIcon()}<UserIcon size={16} />{/snippet}
{#snippet usersIcon()}<UsersIcon size={16} />{/snippet}
{#snippet buildingIcon()}<BuildingIcon size={16} />{/snippet}

<Demo title="Radio cards · plan grid" wide>
	<div class="stack wide">
		<RadioCards aria-label="Plan" options={PLANS} bind:value={plan} />
		<p class="output">Plan: {plan}</p>
	</div>
</Demo>

<Demo title="Radio cards · region list">
	<div class="stack">
		<RadioCards aria-label="Region" layout="list" options={REGIONS} bind:value={region} />
		<p class="output">Region: {region ?? 'none yet'}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		max-width: 22rem;
		gap: var(--arc-space-3);
	}
	.stack.wide {
		max-width: 44rem;
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
