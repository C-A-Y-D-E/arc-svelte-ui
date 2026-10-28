<script lang="ts">
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import { HoverCard, HoverCardProfile } from '$lib/components/arc/hover-card';
	import Demo from '../../Demo.svelte';
</script>

{#snippet mayaCard()}
	<HoverCardProfile
		name="Maya Chen"
		role="Product designer, Payments"
		bio="Designs the checkout and invoicing flows. Ask her about the new refunds screen."
		stats={[
			{ label: 'Projects', value: 12 },
			{ label: 'Reviews', value: 48 }
		]}
	>
		{#snippet meta()}<MapPinIcon size={13} aria-hidden="true" /> Lisbon · 14:32 local time{/snippet}
	</HoverCardProfile>
{/snippet}

{#snippet leoCard()}
	<HoverCardProfile
		name="Leo Park"
		role="Engineer, Platform"
		stats={[{ label: 'Projects', value: 7 }]}
	/>
{/snippet}

<Demo title="Hover card · mentions">
	<p class="sentence">
		Reviewed by
		<HoverCard content={mayaCard}>
			{#snippet children({ props })}<button type="button" class="mention" {...props}>@maya</button
				>{/snippet}
		</HoverCard>
		and
		<HoverCard content={leoCard} side="top">
			{#snippet children({ props })}<button type="button" class="mention" {...props}>@leo</button
				>{/snippet}
		</HoverCard>
		before release.
	</p>
</Demo>

<style>
	.sentence {
		margin: 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
	.mention {
		padding: 0;
		border: 0;
		background: none;
		color: var(--arc-accent-strong);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	.mention:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>
