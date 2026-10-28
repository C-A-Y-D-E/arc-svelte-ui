<script module lang="ts">
	export type HoverCardStat = { label: string; value: string | number };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { motionTokens, presence } from '../motion';

	/** A person preview for `HoverCard`: portrait, name, role, a short bio, a couple of numbers, and a quiet footer line. Its rows settle in with a tiny stagger. */
	type Props = {
		name: string;
		/** Role and team, such as "Product designer, Payments". */
		role?: string;
		/** A portrait URL, or your own image markup. Initials show when it is missing. */
		avatar?: string | Snippet;
		bio?: string;
		stats?: HoverCardStat[];
		/** A footer line, such as a location and local time. */
		meta?: string | Snippet;
	};

	let { name, role, avatar, bio, stats = [], meta }: Props = $props();

	const PORTRAIT_PX = 48;
	const SETTLE_LEAD_SECONDS = 0.04;
	const SETTLE_RISE_PX = 4;

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('')
	);

	function settle(order: number) {
		return {
			y: SETTLE_RISE_PX,
			duration: motionTokens.duration.standard,
			delay: SETTLE_LEAD_SECONDS + order * motionTokens.stagger.item
		};
	}

	// A cached portrait shows at once; one still downloading fades in from a soft blur.
	const markLoading: Attachment<HTMLImageElement> = (image) => {
		if (!image.complete) image.dataset.loading = '';
	};
</script>

<div class="profile">
	<div class="head" in:presence|global={settle(0)}>
		<span class="avatar" aria-hidden="true">
			{#if typeof avatar === 'string'}
				<img
					src={avatar}
					alt=""
					width={PORTRAIT_PX}
					height={PORTRAIT_PX}
					decoding="async"
					{@attach markLoading}
					onload={(event) => delete (event.currentTarget as HTMLImageElement).dataset.loading}
				/>
			{:else if avatar}
				{@render avatar()}
			{:else}
				<span>{initials}</span>
			{/if}
		</span>
		<span class="identity">
			<span class="name">{name}</span>
			{#if role}<span class="role">{role}</span>{/if}
		</span>
	</div>
	{#if bio}<p class="bio" in:presence|global={settle(1)}>{bio}</p>{/if}
	{#if stats.length > 0}
		<dl class="stats" in:presence|global={settle(2)}>
			{#each stats as stat (stat.label)}
				<div class="stat">
					<dt>{stat.label}</dt>
					<dd>{stat.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{#if meta}
		<div class="meta" in:presence|global={settle(3)}>
			{#if typeof meta === 'string'}{meta}{:else}{@render meta()}{/if}
		</div>
	{/if}
</div>

<style>
	.profile {
		display: grid;
		gap: var(--arc-space-3);
	}
	.head {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--arc-space-3);
	}
	.avatar {
		position: relative;
		display: grid;
		width: 48px;
		height: 48px;
		flex: none;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.avatar img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition:
			opacity var(--arc-duration-standard) var(--arc-ease-enter),
			filter var(--arc-duration-standard) var(--arc-ease-enter);
	}
	.avatar img:global([data-loading]) {
		opacity: 0;
		filter: blur(4px);
		transition: none;
	}
	.identity {
		display: grid;
		min-width: 0;
	}
	.name,
	.role {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.role {
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}
	.bio {
		margin: 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: 1.5;
	}
	/* Numbers lead and labels follow, while the markup keeps label then value for screen readers. */
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--arc-space-2) var(--arc-space-6);
		margin: 0;
		padding-top: var(--arc-space-3);
		border-top: 1px solid var(--arc-border-subtle);
	}
	.stat {
		display: flex;
		flex-direction: column-reverse;
	}
	.stat dt {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.stat dd {
		margin: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-base);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.meta :global(svg) {
		flex: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.avatar img {
			transition: none;
		}
		.avatar img:global([data-loading]) {
			filter: none;
		}
	}
</style>
