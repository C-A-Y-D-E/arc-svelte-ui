<script lang="ts">
	import { ease, motionTokens, presence } from '../motion';

	/** Rank change arrow: up, down, or level. The number rolls in when it changes. */
	let { move }: { move: number } = $props();

	const ROLL_PX = 6;
	const text = $derived(move === 0 ? '=' : `${Math.abs(move)}`);
	const direction = $derived(move > 0 ? 'up' : move < 0 ? 'down' : 'level');
	const roll = $derived(move >= 0 ? ROLL_PX : -ROLL_PX);
	const duration = motionTokens.spring.snappy.visualDuration;
</script>

<span class="rank" data-move={direction} aria-hidden="true">
	{#if move !== 0}
		<svg width="8" height="8" viewBox="0 0 8 8">
			<path
				d={move > 0 ? 'M4 7V1M1.5 3.5 4 1l2.5 2.5' : 'M4 1v6M1.5 4.5 4 7l2.5-2.5'}
				fill="none"
				stroke="currentColor"
				stroke-width="1.3"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	{/if}
	<span class="rank-swap">
		{#key text}
			<span
				in:presence={{ y: roll, duration, easing: ease.enter }}
				out:presence={{ y: -roll, duration, easing: ease.enter, pop: true }}>{text}</span
			>
		{/key}
	</span>
</span>

<style>
	.rank {
		display: inline-flex;
		min-width: 30px;
		align-items: center;
		gap: 2px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
	.rank[data-move='up'] {
		color: var(--arc-text-secondary);
	}
	.rank-swap {
		position: relative;
		display: inline-flex;
		overflow: hidden;
	}
</style>
