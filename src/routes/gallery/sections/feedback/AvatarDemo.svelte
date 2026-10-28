<script lang="ts">
	import { Avatar, type AvatarStatus } from '$lib/components/arc/avatar';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../../Demo.svelte';
	import { PORTRAITS } from './portraits';

	const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
	const STATUS_CYCLE: (AvatarStatus | undefined)[] = [undefined, 'online', 'offline'];

	let statusIndex = $state(0);
</script>

<Demo title="Avatar · sizes">
	<div class="row">
		{#each SIZES as size (size)}
			<Avatar name="Maya Ortiz" src={PORTRAITS.maya} {size} />
		{/each}
	</div>
</Demo>

<Demo title="Avatar · initials fallback">
	<div class="row">
		{#each SIZES as size (size)}
			<Avatar name="Jonas Weber" {size} />
		{/each}
	</div>
</Demo>

<Demo title="Avatar · status">
	<div class="row">
		<Avatar name="Priya Nair" src={PORTRAITS.priya} size="lg" status="online" />
		<Avatar name="Leo Martin" src={PORTRAITS.leo} size="lg" status="offline" />
		<Avatar name="Sam Lee" size="lg" status={STATUS_CYCLE[statusIndex]} />
		<Button
			variant="secondary"
			size="sm"
			onclick={() => (statusIndex = (statusIndex + 1) % STATUS_CYCLE.length)}
		>
			Toggle status
		</Button>
	</div>
</Demo>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-4);
	}
</style>
