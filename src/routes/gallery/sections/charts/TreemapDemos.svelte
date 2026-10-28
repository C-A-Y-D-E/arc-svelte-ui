<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Treemap, type TreemapNode } from '$lib/components/arc/treemap';
	import Demo from '../../Demo.svelte';

	const GB_PER_TB = 1000;

	const storageByTeam: TreemapNode = {
		id: 'storage',
		label: 'All teams',
		children: [
			{
				id: 'engineering',
				label: 'Engineering',
				children: [
					{
						id: 'eng-platform',
						label: 'Platform',
						children: [
							{ id: 'eng-platform-logs', label: 'Logs', value: 1840, color: 0.32 },
							{ id: 'eng-platform-backups', label: 'Backups', value: 1260, color: 0.08 },
							{ id: 'eng-platform-artifacts', label: 'Build artifacts', value: 620, color: 0.21 }
						]
					},
					{
						id: 'eng-web',
						label: 'Web',
						children: [
							{ id: 'eng-web-assets', label: 'Static assets', value: 410, color: 0.05 },
							{ id: 'eng-web-previews', label: 'Preview deploys', value: 290, color: 0.44 }
						]
					},
					{
						id: 'eng-mobile',
						label: 'Mobile',
						children: [
							{ id: 'eng-mobile-builds', label: 'App builds', value: 380, color: 0.12 },
							{ id: 'eng-mobile-crash', label: 'Crash reports', value: 140, color: -0.06 }
						]
					}
				]
			},
			{
				id: 'data',
				label: 'Data',
				children: [
					{ id: 'data-warehouse', label: 'Warehouse', value: 2210, color: 0.18 },
					{ id: 'data-lake', label: 'Event lake', value: 1580, color: 0.38 },
					{ id: 'data-models', label: 'Model snapshots', value: 520, color: 0.27 }
				]
			},
			{
				id: 'design',
				label: 'Design',
				children: [
					{ id: 'design-files', label: 'Source files', value: 640, color: 0.04 },
					{ id: 'design-video', label: 'Video', value: 470, color: 0.15 },
					{ id: 'design-exports', label: 'Exports', value: 180, color: -0.12 }
				]
			},
			{
				id: 'support',
				label: 'Support',
				children: [
					{ id: 'support-attachments', label: 'Ticket attachments', value: 360, color: 0.09 },
					{ id: 'support-recordings', label: 'Call recordings', value: 290, color: -0.03 }
				]
			}
		]
	};

	const cloudSpend: TreemapNode = {
		id: 'spend',
		label: 'Monthly spend',
		children: [
			{
				id: 'compute',
				label: 'Compute',
				children: [
					{ id: 'compute-vms', label: 'Virtual machines', value: 18400 },
					{ id: 'compute-functions', label: 'Functions', value: 4200 },
					{ id: 'compute-containers', label: 'Containers', value: 9600 }
				]
			},
			{
				id: 'storage',
				label: 'Storage',
				children: [
					{ id: 'storage-objects', label: 'Object storage', value: 6100 },
					{ id: 'storage-blocks', label: 'Block volumes', value: 3800 }
				]
			},
			{
				id: 'network',
				label: 'Network',
				children: [
					{ id: 'network-cdn', label: 'CDN', value: 5200 },
					{ id: 'network-egress', label: 'Egress', value: 2900 }
				]
			},
			{ id: 'database', label: 'Managed databases', value: 7300 }
		]
	};

	const usd = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	function formatStorage(gigabytes: number) {
		return gigabytes >= GB_PER_TB
			? `${(gigabytes / GB_PER_TB).toFixed(1)} TB`
			: `${Math.round(gigabytes)} GB`;
	}

	function formatGrowth(share: number) {
		return `${share >= 0 ? '+' : '−'}${Math.round(Math.abs(share) * 100)}%`;
	}

	const SHORTCUTS = [
		{ id: 'storage', label: 'All teams' },
		{ id: 'engineering', label: 'Engineering' },
		{ id: 'data', label: 'Data' }
	];
	let storageFocus = $state('storage');
</script>

<Demo title="Treemap · Storage by team, shaded by growth" wide>
	<div class="stack">
		<div class="controls" role="group" aria-label="Zoom">
			{#each SHORTCUTS as shortcut (shortcut.id)}
				<Button
					size="sm"
					variant={storageFocus === shortcut.id ? 'secondary' : 'ghost'}
					aria-pressed={storageFocus === shortcut.id}
					onclick={() => (storageFocus = shortcut.id)}>{shortcut.label}</Button
				>
			{/each}
		</div>
		<Treemap
			data={storageByTeam}
			label="Storage"
			formatValue={formatStorage}
			colorLabel="Growth"
			formatColor={formatGrowth}
			bind:focus={storageFocus}
			height={380}
		/>
	</div>
</Demo>

<Demo title="Treemap · Cloud spend by service" wide>
	<div class="stack">
		<Treemap
			data={cloudSpend}
			label="Cloud spend"
			formatValue={(value) => usd.format(value)}
			height={300}
		/>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		min-width: 0;
		gap: var(--arc-space-4);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--arc-space-1);
	}
</style>
