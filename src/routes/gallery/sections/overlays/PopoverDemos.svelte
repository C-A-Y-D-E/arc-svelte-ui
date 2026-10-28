<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import {
		Popover,
		PopoverClose,
		PopoverContent,
		PopoverTrigger
	} from '$lib/components/arc/popover';
	import Demo from '../../Demo.svelte';
</script>

<Demo title="Popover · share">
	<Popover>
		<PopoverTrigger>
			{#snippet child({ props })}<Button variant="secondary" {...props}>Share</Button>{/snippet}
		</PopoverTrigger>
		<PopoverContent>
			<p class="note">Anyone with the link can view.</p>
		</PopoverContent>
	</Popover>
	<Popover>
		<PopoverTrigger>
			{#snippet child({ props })}<Button variant="ghost" {...props}>Details above</Button>{/snippet}
		</PopoverTrigger>
		<PopoverContent side="top" align="center">
			<p class="note">Last edited 2 hours ago by Maya.</p>
			<PopoverClose>
				{#snippet child({ props })}<Button size="sm" variant="secondary" {...props}>Done</Button
					>{/snippet}
			</PopoverClose>
		</PopoverContent>
	</Popover>
</Demo>

<style>
	.note {
		margin: 0 0 var(--arc-space-3);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.note:last-child {
		margin-bottom: 0;
	}
</style>
