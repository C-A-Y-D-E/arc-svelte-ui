<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import {
		Drawer,
		DrawerClose,
		DrawerContent,
		DrawerTrigger,
		type DrawerSide
	} from '$lib/components/arc/drawer';
	import Demo from '../../Demo.svelte';

	const EDGE_SIDES: DrawerSide[] = ['left', 'top', 'bottom'];
	const FILTERS = ['Active projects', 'Shared with me', 'Archived'];

	let panelHost = $state<HTMLElement | null>(null);
	let step = $state(1);
</script>

<Demo title="Drawer · filters">
	<Drawer>
		<DrawerTrigger>
			{#snippet child({ props })}
				<Button variant="secondary" {...props}>Filters</Button>
			{/snippet}
		</DrawerTrigger>
		<DrawerContent title="Filters" description="Narrow the list of projects.">
			<ul class="filter-list">
				{#each FILTERS as filter (filter)}
					<li><label><input type="checkbox" checked={filter !== 'Archived'} /> {filter}</label></li>
				{/each}
			</ul>
			<DrawerClose>
				{#snippet child({ props })}
					<Button {...props}>Apply</Button>
				{/snippet}
			</DrawerClose>
		</DrawerContent>
	</Drawer>
</Demo>

<Demo title="Drawer · sides">
	{#each EDGE_SIDES as side (side)}
		<Drawer>
			<DrawerTrigger>
				{#snippet child({ props })}
					<Button variant="secondary" {...props}>From {side}</Button>
				{/snippet}
			</DrawerTrigger>
			<DrawerContent
				{side}
				title="Activity"
				description="Drag the header toward the edge to dismiss."
			>
				<p>Recent changes to this workspace appear here.</p>
			</DrawerContent>
		</Drawer>
	{/each}
</Demo>

<Demo title="Drawer · title swap">
	<Drawer onOpenChange={(open) => open && (step = 1)}>
		<DrawerTrigger>
			{#snippet child({ props })}
				<Button variant="secondary" {...props}>New project</Button>
			{/snippet}
		</DrawerTrigger>
		<DrawerContent
			title={`Step ${step} of 3`}
			description={step === 3 ? 'Review and create.' : 'Fill in the details.'}
		>
			<div class="actions">
				<Button variant="secondary" disabled={step === 1} onclick={() => step--}>Back</Button>
				<Button disabled={step === 3} onclick={() => step++}>Next</Button>
			</div>
		</DrawerContent>
	</Drawer>
</Demo>

<Demo title="Drawer · inside a container" wide>
	<div class="host" bind:this={panelHost}>
		<Drawer>
			<DrawerTrigger>
				{#snippet child({ props })}
					<Button variant="secondary" {...props}>Open details</Button>
				{/snippet}
			</DrawerTrigger>
			<DrawerContent container={panelHost} title="Invoice 1042" description="Due in 14 days.">
				<p>The drawer anchors to this panel instead of the page.</p>
			</DrawerContent>
		</Drawer>
	</div>
</Demo>

<style>
	.filter-list {
		display: grid;
		gap: var(--arc-space-3);
		margin: 0 0 var(--arc-space-6);
		padding: 0;
		list-style: none;
	}
	.filter-list label {
		display: flex;
		align-items: center;
		gap: var(--arc-space-2);
	}
	.actions {
		display: flex;
		gap: var(--arc-space-2);
	}
	.host {
		position: relative;
		display: grid;
		width: 100%;
		height: 22rem;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-background);
	}
</style>
