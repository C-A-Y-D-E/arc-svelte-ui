<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/arc/button';
	import Demo from '../Demo.svelte';

	const SAVE_DELAY_MS = 1200;

	let saving = $state(false);
	let saved = $state(false);

	function save() {
		saving = true;
		setTimeout(() => {
			saving = false;
			saved = !saved;
		}, SAVE_DELAY_MS);
	}
</script>

<Demo title="Button · variants">
	<Button>Primary</Button>
	<Button variant="secondary">Secondary</Button>
	<Button variant="ghost">Ghost</Button>
	<Button variant="danger">Delete</Button>
	<Button disabled>Disabled</Button>
</Demo>

<Demo title="Button · sizes">
	<Button size="sm">Small</Button>
	<Button size="md">Medium</Button>
	<Button size="lg">Large</Button>
	<Button variant="secondary" size="sm" aria-label="Add"><PlusIcon size={16} /></Button>
</Demo>

<Demo title="Button · loading and label morph">
	<Button loading={saving} onclick={save} data-testid="morph-button">
		{#if saved}<CheckIcon size={16} /> Saved to library{:else}Save{/if}
	</Button>
</Demo>
