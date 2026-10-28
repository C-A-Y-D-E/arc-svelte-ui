<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Gauge, type GaugeThreshold } from '$lib/components/arc/gauge';
	import Demo from '../../Demo.svelte';

	const DISK_GB = 500;
	const USAGE_STEPS = [36, 72, 94];
	const thresholds: GaugeThreshold[] = [
		{ from: 0, tone: 'success', label: 'Healthy' },
		{ from: 70, tone: 'warning', label: 'Filling up' },
		{ from: 90, tone: 'danger', label: 'Critical' }
	];

	let usage = $state(72);
	const usedGb = $derived(Math.round((usage / 100) * DISK_GB));
</script>

<Demo title="Gauge · thresholds">
	<div class="stack">
		<Gauge label="Disk usage" value={usage} detail={`${usedGb} of ${DISK_GB} GB`} {thresholds} />
		<div class="switch">
			{#each USAGE_STEPS as step (step)}
				<Button
					size="sm"
					variant={usage === step ? 'secondary' : 'ghost'}
					onclick={() => (usage = step)}>{step}%</Button
				>
			{/each}
		</div>
	</div>
</Demo>

<Demo title="Gauge · tones">
	<Gauge label="Health score" value={86} detail="Last 7 days" />
	<Gauge label="Memory" value={3.1} max={8} detail="3.1 of 8 GB" tone="warning" />
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-4);
	}
	.switch {
		display: flex;
		gap: var(--arc-space-1);
	}
</style>
