<script lang="ts">
	import { ScrollArea, type ScrollAreaEdges } from '$lib/components/arc/scroll-area';
	import Demo from '../../Demo.svelte';

	const ACTIVITY_COUNT = 24;
	const TEMPLATE_COUNT = 10;
	const GRID_SIZE = 12;

	const events = Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({
		id: `event-${index}`,
		text: `Payment ${index + 1} settled`
	}));
	const templates = Array.from({ length: TEMPLATE_COUNT }, (_, index) => ({
		id: `template-${index}`,
		name: `Template ${index + 1}`
	}));
	const grid = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index + 1);

	let activityEdges = $state<ScrollAreaEdges>({
		top: false,
		bottom: false,
		left: false,
		right: false
	});
</script>

<Demo title="Scroll area · vertical with edge fades">
	<div class="panel">
		<ScrollArea
			maxHeight={240}
			label="Recent activity"
			onEdgeChange={(edges) => (activityEdges = edges)}
		>
			<ul class="events">
				{#each events as event (event.id)}
					<li class="event">{event.text}</li>
				{/each}
			</ul>
		</ScrollArea>
		<p class="caption" data-testid="activity-edges">
			{activityEdges.bottom ? 'More below' : 'End of list'}
		</p>
	</div>
</Demo>

<Demo title="Scroll area · horizontal strip with snap">
	<div class="panel">
		<ScrollArea orientation="horizontal" snap="x mandatory" label="Templates">
			<div class="strip">
				{#each templates as template (template.id)}
					<div class="card">{template.name}</div>
				{/each}
			</div>
		</ScrollArea>
	</div>
</Demo>

<Demo title="Scroll area · both axes, scrollbars always">
	<div class="panel">
		<ScrollArea orientation="both" scrollbars="always" label="Grid" style="height: 220px">
			<div class="grid" style:--grid-size={GRID_SIZE}>
				{#each grid as cell (cell)}
					<span class="cell">{cell}</span>
				{/each}
			</div>
		</ScrollArea>
	</div>
</Demo>

<style>
	.panel {
		display: flex;
		width: 100%;
		flex-direction: column;
		gap: var(--arc-space-2);
	}
	.events {
		display: flex;
		flex-direction: column;
		padding: var(--arc-space-2) 0;
		list-style: none;
	}
	.event {
		padding: var(--arc-space-2) var(--arc-space-3);
		border-bottom: 1px solid var(--arc-border-subtle);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.strip {
		display: flex;
		gap: 12px;
		padding: var(--arc-space-2) 0;
	}
	.card {
		display: grid;
		width: 160px;
		height: 96px;
		flex: none;
		place-items: center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		scroll-snap-align: start;
	}
	.grid {
		display: grid;
		width: max-content;
		grid-template-columns: repeat(var(--grid-size), 64px);
		gap: var(--arc-space-2);
		padding: var(--arc-space-2);
	}
	.cell {
		display: grid;
		height: 48px;
		place-items: center;
		border: 1px solid var(--arc-border-subtle);
		border-radius: var(--arc-radius-control);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.caption {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
</style>
