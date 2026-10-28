<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Skeleton, SkeletonBlock } from '$lib/components/arc/skeleton';
	import Demo from '../../Demo.svelte';

	let loading = $state(true);
</script>

<Demo title="Skeleton · lines and avatar">
	<div class="stack">
		<Skeleton avatar label="Loading comment" />
		<Skeleton lines={2} label="Loading summary" />
		<Skeleton lines={5} label="Loading article" />
	</div>
</Demo>

<Demo title="Skeleton · reveal content">
	<div class="stack">
		<Skeleton avatar lines={2} {loading} label="Loading teammate">
			<div class="profile">
				<span class="initials" aria-hidden="true">MO</span>
				<div>
					<strong>Maya Ortiz</strong>
					<p>Design lead · joined in March</p>
				</div>
			</div>
		</Skeleton>
		<div>
			<Button variant="secondary" size="sm" onclick={() => (loading = !loading)}>
				{loading ? 'Finish loading' : 'Load again'}
			</Button>
		</div>
	</div>
</Demo>

<Demo title="Skeleton block · stats">
	<div class="stats">
		{#each { length: 3 }, index (index)}
			<div class="stat">
				<SkeletonBlock class="label-block" {index} />
				<SkeletonBlock class="value-block" index={index + 1} />
			</div>
		{/each}
		<SkeletonBlock class="chart-block" index={4} />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 420px);
		gap: var(--arc-space-6);
	}
	.profile {
		display: flex;
		align-items: center;
		gap: var(--arc-space-4);
	}
	.profile p {
		margin: var(--arc-space-1) 0 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
	}
	.initials {
		display: grid;
		width: var(--arc-control-height-md);
		height: var(--arc-control-height-md);
		place-items: center;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		font-size: var(--arc-text-xs);
		font-weight: 500;
	}
	.stats {
		display: grid;
		width: min(100%, 420px);
		grid-template-columns: repeat(3, 1fr);
		gap: var(--arc-space-4);
	}
	.stat {
		display: grid;
		gap: var(--arc-space-2);
	}
	.stats :global(.label-block) {
		width: 60%;
		height: var(--arc-space-3);
	}
	.stats :global(.value-block) {
		width: 80%;
		height: var(--arc-space-6);
	}
	.stats :global(.chart-block) {
		grid-column: 1 / -1;
		height: 96px;
	}
</style>
