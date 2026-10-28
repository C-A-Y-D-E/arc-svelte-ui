<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Toast } from '$lib/components/arc/toast';
	import Demo from '../../Demo.svelte';

	const UPDATES = [
		{ title: 'Changes saved', description: 'Your profile is up to date.' },
		{ title: 'Invite sent', description: 'Maya will get an email in a moment.' },
		{ title: 'Invoice exported', description: 'INV-2041.pdf is in your downloads.' }
	];

	let savedOpen = $state(false);
	let stickyOpen = $state(true);
	let updateIndex = $state(0);
	const update = $derived(UPDATES[updateIndex]);

	function showNextUpdate() {
		updateIndex = (updateIndex + 1) % UPDATES.length;
		stickyOpen = true;
	}
</script>

<Demo title="Toast · auto dismiss">
	<div class="stage">
		<Button variant="secondary" size="sm" onclick={() => (savedOpen = true)}>Save changes</Button>
		<Toast
			title="Changes saved"
			description="Your profile is up to date."
			open={savedOpen}
			onOpenChange={(open) => (savedOpen = open)}
		/>
	</div>
</Demo>

<Demo title="Toast · copy swap, stays open">
	<div class="stage">
		<Button variant="secondary" size="sm" onclick={showNextUpdate}>Next message</Button>
		<Toast
			title={update.title}
			description={update.description}
			open={stickyOpen}
			duration={0}
			onOpenChange={(open) => (stickyOpen = open)}
		/>
	</div>
</Demo>

<style>
	.stage {
		display: grid;
		width: min(100%, 26rem);
		min-height: 140px;
		align-content: start;
		justify-items: center;
		gap: var(--arc-space-4);
	}
</style>
