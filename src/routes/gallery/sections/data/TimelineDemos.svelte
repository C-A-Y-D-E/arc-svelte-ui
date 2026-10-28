<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import GitMergeIcon from '@lucide/svelte/icons/git-merge';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import { Button } from '$lib/components/arc/button';
	import { Timeline, type TimelineEvent } from '$lib/components/arc/timeline';
	import Demo from '../../Demo.svelte';

	const MINUTE_MS = 60_000;
	const HOUR_MS = 60 * MINUTE_MS;
	const CLOCK_TICK_MS = 30_000;

	/** Flat initials portraits, so the demo needs no network images. */
	function portrait(initial: string, fill: string) {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" fill="${fill}"/><text x="14" y="18.5" font-family="system-ui" font-size="12" font-weight="600" fill="#fff" text-anchor="middle">${initial}</text></svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}

	const startedAt = Date.now();
	let now = $state(startedAt);
	let events = $state<TimelineEvent[]>([
		{
			id: 'e1',
			at: startedAt - 4 * MINUTE_MS,
			actor: 'Maya',
			title: 'merged Checkout redesign into main',
			meta: 'PR #482',
			avatar: portrait('M', '#6b5bd6')
		},
		{
			id: 'e2',
			at: startedAt - 38 * MINUTE_MS,
			title: 'Deploy failed on production',
			meta: 'Build 1289',
			tone: 'danger',
			icon: failedIcon,
			detail: failedDetail
		},
		{
			id: 'e3',
			at: startedAt - 2 * HOUR_MS,
			title: 'Preview deployed',
			meta: 'checkout-redesign.example.dev',
			tone: 'success',
			icon: deployedIcon,
			detail: deployedDetail
		},
		{
			id: 'e4',
			at: startedAt - 26 * HOUR_MS,
			actor: 'Leo',
			title: 'opened Checkout redesign',
			meta: 'PR #482',
			avatar: portrait('L', '#2f7d6b')
		},
		{
			id: 'e5',
			at: startedAt - 27 * HOUR_MS,
			actor: 'Maya',
			title: 'merged Pricing copy updates',
			meta: 'PR #479',
			icon: mergeIcon
		}
	]);

	const NEW_UPDATES = [
		{
			title: 'Deploy succeeded on production',
			meta: 'Build 1290',
			tone: 'success' as const,
			icon: deployedIcon
		},
		{
			actor: 'Leo',
			title: 'approved Checkout redesign',
			meta: 'PR #482',
			avatar: portrait('L', '#2f7d6b')
		},
		{ title: 'Release v2.4.0 started', meta: 'Pipeline 88', icon: rocketIcon }
	];
	let added = 0;

	function addUpdate() {
		now = Date.now();
		const update = NEW_UPDATES[added % NEW_UPDATES.length];
		added += 1;
		events = [...events, { id: `new-${added}`, at: now, ...update }];
	}

	$effect(() => {
		const clock = setInterval(() => (now = Date.now()), CLOCK_TICK_MS);
		return () => clearInterval(clock);
	});
</script>

{#snippet failedIcon()}<CircleXIcon />{/snippet}
{#snippet deployedIcon()}<CircleCheckIcon />{/snippet}
{#snippet mergeIcon()}<GitMergeIcon />{/snippet}
{#snippet rocketIcon()}<RocketIcon />{/snippet}
{#snippet failedDetail()}
	<pre class="log">Build step "bundle" exited with code 1
Cannot resolve "./checkout/summary"</pre>
{/snippet}
{#snippet deployedDetail()}
	The preview is live and passed all 42 checks. It stays up until the pull request is merged or
	closed.
{/snippet}

<Demo title="Timeline · activity feed" wide>
	<div class="stack">
		<Button variant="secondary" size="sm" onclick={addUpdate}>Add update</Button>
		<Timeline {events} {now} label="Project activity" maxHeight={420} defaultExpanded={['e2']} />
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 36rem);
		justify-items: start;
		gap: var(--arc-space-4);
	}
	.stack > :global(:last-child) {
		width: 100%;
	}
	.log {
		margin: 0;
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: var(--arc-text-xs);
		white-space: pre-wrap;
	}
</style>
