<script lang="ts">
	import { AvatarGroup, type AvatarGroupMember } from '$lib/components/arc/avatar-group';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';
	import { PORTRAITS } from './portraits';

	const TEAM: AvatarGroupMember[] = [
		{ name: 'Maya Ortiz', src: PORTRAITS.maya, status: 'online' },
		{ name: 'Jonas Weber', src: PORTRAITS.jonas },
		{ name: 'Priya Nair', src: PORTRAITS.priya, status: 'online' },
		{ name: 'Leo Martin', src: PORTRAITS.leo, status: 'offline' },
		{ name: 'Sam Lee' },
		{ name: 'Ana Costa' },
		{ name: 'Tom Becker' }
	];
	const SIZES = ['sm', 'md', 'lg'] as const;
	const STARTING_MEMBERS = 3;

	let memberCount = $state(STARTING_MEMBERS);
	const members = $derived(TEAM.slice(0, memberCount));
</script>

<Demo title="Avatar group · sizes and overflow">
	<div class="stack">
		{#each SIZES as size (size)}
			<AvatarGroup members={TEAM} {size} label="Project members" />
		{/each}
	</div>
</Demo>

<Demo title="Avatar group · join and leave">
	<div class="stack">
		<AvatarGroup {members} max={4} label="Teammates" />
		<div class="controls">
			<Button
				variant="ghost"
				size="sm"
				disabled={memberCount === 0}
				onclick={() => (memberCount -= 1)}
			>
				Remove
			</Button>
			<Button
				variant="secondary"
				size="sm"
				disabled={memberCount === TEAM.length}
				onclick={() => (memberCount += 1)}
			>
				Add teammate
			</Button>
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-5);
	}
	.controls {
		display: flex;
		gap: var(--arc-space-2);
	}
</style>
