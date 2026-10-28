<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { ease, motionTokens, presence } from '../motion';
	import type { PanelGroup } from './panel-group.svelte';

	/** The divider between pane `handle` and pane `handle + 1`. */
	let { group, handle }: { group: PanelGroup; handle: number } = $props();

	const TAB_ICON_SIZE = 14;
	const TAB_ICON_STROKE = 1.75;
	const TAB_HIDDEN_SCALE = 0.6;
	const { blur, duration, spring } = motionTokens;

	const before = $derived(group.configs[handle]);
	const after = $derived(group.configs[handle + 1]);
	const mode = $derived(group.modeOf(handle));
	const share = $derived(group.shares[handle] ?? 0);
	const valueNow = $derived(Math.round(share));
	const hiddenLabel = $derived(
		mode === 'before' ? before.label : mode === 'after' ? after.label : null
	);
	const range = $derived.by(() => {
		const { available, shares } = group;
		if (!available) return { min: 0, max: 100 };
		const toPx = (percent: number) => (percent / 100) * available;
		const { lo, hi } = group.limits(handle, toPx(shares[handle]), toPx(shares[handle + 1]));
		return { min: Math.round((lo / available) * 100), max: Math.round((hi / available) * 100) };
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	role="separator"
	tabindex={0}
	aria-orientation="vertical"
	aria-controls={before.id}
	aria-label={before.label}
	aria-valuenow={valueNow}
	aria-valuemin={Math.min(range.min, valueNow)}
	aria-valuemax={Math.max(range.max, valueNow)}
	aria-valuetext={hiddenLabel ? `${hiddenLabel} hidden, press Enter to show` : `${valueNow}%`}
	class="handle"
	data-collapsed={mode === 'open' ? undefined : mode}
	data-active={group.resizing === handle || undefined}
	onpointerdown={(event) => group.pointerDown(handle, event)}
	onpointermove={(event) => group.pointerMove(event)}
	onpointerup={(event) => group.pointerEnd(event, false)}
	onpointercancel={(event) => group.pointerEnd(event, true)}
	onkeydown={(event) => group.keyDown(handle, event)}
	ondblclick={() => group.reset()}
>
	<span class="grip" aria-hidden="true"></span>
	{#if mode !== 'open'}
		{#key mode}
			<span
				class="restore"
				data-side={mode}
				aria-hidden="true"
				in:presence|global={{
					scale: TAB_HIDDEN_SCALE,
					blur: blur.subtle,
					duration: spring.snappy.visualDuration
				}}
				out:presence|global={{
					scale: TAB_HIDDEN_SCALE,
					blur: blur.subtle,
					duration: duration.fast,
					easing: ease.standard
				}}
			>
				{#if mode === 'before'}
					<ChevronRightIcon size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} />
				{:else}
					<ChevronLeftIcon size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} />
				{/if}
			</span>
		{/key}
	{/if}
</div>

<style>
	/* The divider is a one pixel line with a 13px grab area, and a grip that forms while it is hovered, focused, or dragged. */
	.handle {
		position: relative;
		z-index: 2;
		flex: 0 0 1px;
		background: var(--arc-border);
		cursor: col-resize;
		touch-action: none;
		outline: none;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.handle::before {
		position: absolute;
		inset: 0 -6px;
		content: '';
	}
	.handle[data-collapsed] {
		background: transparent;
		cursor: pointer;
	}
	.grip {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 4px;
		height: 32px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-border-strong);
		opacity: 0;
		pointer-events: none;
		transform: translate(-50%, -50%) scaleY(0.6);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	@media (hover: hover) and (pointer: fine) {
		.handle:not([data-collapsed]):hover {
			background: var(--arc-border-strong);
		}
		.handle:not([data-collapsed]):hover .grip {
			opacity: 1;
			transform: translate(-50%, -50%) scaleY(1);
		}
		.handle[data-collapsed]:hover .restore {
			border-color: var(--arc-border-strong);
			color: var(--arc-foreground);
		}
	}
	.handle[data-active] {
		background: var(--arc-border-strong);
	}
	.handle[data-active] .grip {
		background: var(--arc-foreground);
		opacity: 1;
		transform: translate(-50%, -50%) scaleY(1);
	}
	.handle:focus-visible:not([data-collapsed]) .grip {
		opacity: 1;
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
		transform: translate(-50%, -50%) scaleY(1);
	}
	.handle[data-collapsed]:focus-visible .restore {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}

	/* Once a neighbour is hidden, a tab on the divider points the way it will come back. */
	.restore {
		position: absolute;
		top: 50%;
		display: grid;
		width: 18px;
		height: 40px;
		margin-top: -20px;
		place-items: center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
		color: var(--arc-text-secondary);
		pointer-events: none;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.restore[data-side='before'] {
		left: 5px;
		transform-origin: 0 50%;
	}
	.restore[data-side='after'] {
		right: 5px;
		transform-origin: 100% 50%;
	}
	.handle[data-collapsed]::before {
		inset: 0 -30px;
	}
	.handle[data-collapsed='before']::before {
		left: 0;
	}
	.handle[data-collapsed='after']::before {
		right: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.handle,
		.grip,
		.restore {
			transition: none;
		}
	}
</style>
