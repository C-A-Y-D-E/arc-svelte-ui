<script module lang="ts">
	export type UsageMeterStatus = 'ok' | 'near' | 'over';
</script>

<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { animate, motionValue, styleEffect } from 'motion';
	import { swapIn, swapOut } from '../alert/swap';
	import { isReducedMotion, motionTokens } from '../motion';
	import { fit } from './meter-motion';
	import Swap from './Swap.svelte';

	/** The plan status as a compact mark. Its width springs to each new message and the warning icon grows in beside the words. */
	let { status, text }: { status: UsageMeterStatus; text: string } = $props();

	const ICON_SWAP = { kind: 'icon', exitDuration: motionTokens.duration.instant } as const;

	const width = motionValue<number | string>('auto');
	/** A keyed list of zero or one icon, so the icon pops out and a new one pops in whenever the status changes. */
	const alertIcons = $derived(status === 'ok' ? [] : [status]);

	function springWidth(badge: HTMLElement) {
		return styleEffect(badge, { width });
	}

	function followContentWidth(inner: HTMLElement) {
		let measured = false;
		const observer = new ResizeObserver(() => {
			const next = inner.offsetWidth;
			if (measured && !isReducedMotion()) animate(width, next, fit);
			else width.jump(next);
			measured = next > 0;
		});
		observer.observe(inner);
		return () => observer.disconnect();
	}
</script>

<span class="badge" data-status={status} {@attach springWidth}>
	<span class="badge-inner" {@attach followContentWidth}>
		{#each alertIcons as iconStatus (iconStatus)}
			<span class="badge-icon" in:swapIn={ICON_SWAP} out:swapOut={ICON_SWAP}>
				{#if iconStatus === 'over'}
					<TriangleAlertIcon size={14} strokeWidth={2} aria-hidden="true" />
				{:else}
					<CircleAlertIcon size={14} strokeWidth={2} aria-hidden="true" />
				{/if}
			</span>
		{/each}
		<Swap {text} />
	</span>
</span>

<style>
	/* The status mark hugs its words: its width springs to each message and grows from the right edge, so the text never slides. */
	.badge {
		display: inline-flex;
		flex: none;
		height: 28px;
		justify-content: flex-end;
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: 1;
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			color var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.badge-inner {
		position: relative;
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 5px;
		padding: 0 10px;
		white-space: nowrap;
	}
	.badge-icon {
		display: grid;
		place-items: center;
	}
	.badge[data-status='near'] {
		background: color-mix(in oklch, var(--arc-warning) 14%, var(--arc-surface));
		color: var(--arc-foreground);
	}
	.badge[data-status='near'] .badge-icon {
		color: var(--arc-warning);
	}
	.badge[data-status='over'] {
		background: color-mix(in oklch, var(--arc-danger) 12%, var(--arc-surface));
		color: var(--arc-foreground);
	}
	.badge[data-status='over'] .badge-icon {
		color: var(--arc-danger);
	}
	@media (prefers-reduced-motion: reduce) {
		.badge {
			transition: none;
		}
	}
</style>
