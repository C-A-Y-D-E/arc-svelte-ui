<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { Sparkline } from '$lib/components/arc/sparkline';
	import Demo from '../../Demo.svelte';

	const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const weeks = {
		'This week': [12, 18, 15, 22, 30, 27, 34],
		'Last week': [20, 16, 19, 14, 17, 12, 15]
	};
	type Week = keyof typeof weeks;

	let week = $state<Week>('This week');
	const signups = $derived(weeks[week]);
	const change = $derived(week === 'This week' ? '+26%' : '−11%');
</script>

<Demo title="Sparkline · scrub and morph">
	<div class="stack">
		<Sparkline
			label="Signups"
			data={signups}
			labels={DAYS}
			value={String(signups.at(-1))}
			{change}
			tone={week === 'This week' ? 'success' : 'danger'}
		/>
		<div class="switch">
			{#each Object.keys(weeks) as name (name)}
				<Button
					size="sm"
					variant={week === name ? 'secondary' : 'ghost'}
					onclick={() => (week = name as Week)}>{name}</Button
				>
			{/each}
		</div>
	</div>
</Demo>

<Demo title="Sparkline · tones">
	<div class="stack">
		<Sparkline
			label="Revenue"
			data={[4.2, 4.6, 4.4, 5.1, 5.3, 5.2, 5.8]}
			value="$5.8k"
			change="+4.1%"
		/>
		<Sparkline
			label="Latency"
			data={[180, 175, 190, 240, 260, 230, 250]}
			value="250 ms"
			change="+18%"
			tone="warning"
		/>
		<Sparkline
			label="Errors"
			data={[3, 4, 2, 6, 9, 12, 14]}
			change="+40%"
			tone="danger"
			area={false}
			interactive={false}
		/>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: min(100%, 280px);
		gap: var(--arc-space-6);
	}
	.switch {
		display: flex;
		gap: var(--arc-space-1);
	}
</style>
