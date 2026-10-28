<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Dialog, DialogClose, DialogContent, DialogTrigger } from '$lib/components/arc/dialog';
	import Demo from '../../Demo.svelte';

	const INVITE_STEPS = [
		{ title: 'Invite teammates', description: 'Step 1 of 2. Add their work emails.' },
		{ title: 'Choose a role', description: 'Step 2 of 2. You can change it later.' }
	];

	let confirmOpen = $state(false);
	let deleted = $state(false);
	let inviteStep = $state(0);
	const invite = $derived(INVITE_STEPS[inviteStep]);

	function remove() {
		deleted = true;
		confirmOpen = false;
	}
</script>

<Demo title="Dialog · rename">
	<Dialog>
		<DialogTrigger>
			{#snippet child({ props })}<Button {...props}>Rename</Button>{/snippet}
		</DialogTrigger>
		<DialogContent title="Rename project" description="This changes the URL too.">
			<div class="form">
				<input class="field" value="Arc" aria-label="Project name" />
				<DialogClose>
					{#snippet child({ props })}<Button {...props}>Save</Button>{/snippet}
				</DialogClose>
			</div>
		</DialogContent>
	</Dialog>
</Demo>

<Demo title="Dialog · confirm with a custom cancel">
	<Button variant="danger" onclick={() => (confirmOpen = true)} disabled={deleted}>
		{deleted ? 'Project deleted' : 'Delete project'}
	</Button>
	<Dialog bind:open={confirmOpen}>
		<DialogContent title="Delete project?" description="This cannot be undone.">
			<div class="actions">
				<DialogClose>
					{#snippet child({ props })}<Button variant="secondary" {...props}>Cancel</Button
						>{/snippet}
				</DialogClose>
				<Button onclick={remove}>Delete</Button>
			</div>
		</DialogContent>
	</Dialog>
</Demo>

<Demo title="Dialog · title swaps between steps">
	<Dialog onOpenChange={(open) => open && (inviteStep = 0)}>
		<DialogTrigger>
			{#snippet child({ props })}<Button variant="secondary" {...props}>Invite</Button>{/snippet}
		</DialogTrigger>
		<DialogContent title={invite.title} description={invite.description}>
			<div class="actions">
				<Button variant="ghost" disabled={inviteStep === 0} onclick={() => (inviteStep = 0)}
					>Back</Button
				>
				{#if inviteStep === 0}
					<Button onclick={() => (inviteStep = 1)}>Next</Button>
				{:else}
					<DialogClose>
						{#snippet child({ props })}<Button {...props}>Send invites</Button>{/snippet}
					</DialogClose>
				{/if}
			</div>
		</DialogContent>
	</Dialog>
</Demo>

<style>
	.form {
		display: grid;
		gap: var(--arc-space-4);
		justify-items: start;
	}
	.field {
		width: 100%;
		height: var(--arc-control-height-md);
		padding: 0 var(--arc-space-4);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
	}
	.field:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--arc-space-2);
	}
</style>
