<script module lang="ts">
	import type { AvatarStatus } from '../avatar';

	export type AvatarGroupMember = { name: string; src?: string; status?: AvatarStatus };
	export type AvatarGroupSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import type { TransitionConfig } from 'svelte/transition';
	import { Avatar } from '../avatar';
	import { isReducedMotion, motionTokens } from '../motion';
	import { springTiming, swapOnChange } from '../alert/swap';

	type Props = {
		members: AvatarGroupMember[];
		max?: number;
		size?: AvatarGroupSize;
		label?: string;
	};

	let { members, max = 4, size = 'md', label = 'Team members' }: Props = $props();

	const SLOT_SCALE = 0.9;
	const COUNT_RISE_EM = 0.4;
	const slotTiming = springTiming(motionTokens.spring.morph);

	const visible = $derived(members.slice(0, Math.max(0, max)));
	const overflow = $derived(Math.max(0, members.length - visible.length));

	/** The overflow count rolls the way it moved: more people rise in from below, fewer drop in from above. */
	let countDirection = 1;
	let previousOverflow = 0;
	$effect.pre(() => {
		if (overflow === previousOverflow) return;
		countDirection = overflow < previousOverflow ? -1 : 1;
		previousOverflow = overflow;
	});

	/** A person joining or leaving opens or closes their slot, so the rest of the stack slides instead of jumping. */
	function slot(node: HTMLElement): TransitionConfig {
		if (isReducedMotion()) return { duration: 0 };
		const width = node.offsetWidth;
		return {
			duration: slotTiming.duration * 1000,
			easing: slotTiming.easing,
			css: (t) =>
				`width:${width * t}px;opacity:${Math.min(t, 1)};transform:scale(${SLOT_SCALE + (1 - SLOT_SCALE) * t});`
		};
	}
</script>

<div
	class={['group', size]}
	role="group"
	aria-label={label}
	style:--count={visible.length + (overflow > 0 ? 1 : 0)}
>
	{#each visible as member, index (member.name)}
		<span class="slot" style:--index={index} transition:slot>
			<span class="lift">
				<Avatar
					class="group-avatar"
					name={member.name}
					src={member.src}
					status={member.status}
					{size}
				/>
				<span class="tip" aria-hidden="true">{member.name}</span>
			</span>
		</span>
	{/each}
	{#if overflow > 0}
		<span class="slot" style:--index={visible.length} transition:slot>
			<span
				class={['lift', 'overflow', size]}
				role="img"
				aria-label={`${overflow} more ${label.toLowerCase()}`}
			>
				<span
					class="count"
					aria-hidden="true"
					{@attach swapOnChange({ rise: COUNT_RISE_EM, direction: () => countDirection })}
					>+{overflow}</span
				>
			</span>
		</span>
	{/if}
</div>

<style>
	.group {
		--avatar-size: 36px;
		display: inline-flex;
		height: var(--avatar-size);
		align-items: center;
		padding-left: 6px;
	}
	.group.sm {
		--avatar-size: 28px;
	}
	.group.lg {
		--avatar-size: 48px;
	}
	/* Each slot is the avatar's visible width, so a slot that opens or closes moves the rest of the stack smoothly. */
	.slot {
		position: relative;
		display: inline-flex;
		flex: 0 0 auto;
		height: var(--avatar-size);
		align-items: center;
	}
	/* One wrapper per person carries every hover move as a single translate, so the stack never changes size. */
	.lift {
		--fan: 0px;
		--aside: 0px;
		--rise: 0px;
		position: relative;
		display: inline-flex;
		margin-left: -6px;
		border-radius: var(--arc-radius-pill);
		transform: translate(calc(var(--fan) + var(--aside)), var(--rise));
		transition:
			transform 260ms var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.lift :global(.group-avatar),
	.overflow {
		border: 2px solid var(--arc-surface);
		box-shadow: 0 0 0 1px var(--arc-border);
		transition: box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.overflow {
		position: relative;
		display: inline-grid;
		place-items: center;
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.count {
		display: inline-block;
	}
	.overflow.sm {
		width: 28px;
		height: 28px;
		font-size: 10px;
	}
	.overflow.md {
		width: 36px;
		height: 36px;
	}
	.overflow.lg {
		width: 48px;
		height: 48px;
		font-size: var(--arc-text-sm);
	}
	/* The name floats above the stack, outside the layout, so showing it never moves anything. */
	.tip {
		position: absolute;
		z-index: 2;
		bottom: calc(100% + 8px);
		left: 50%;
		padding: 4px 8px;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-foreground);
		color: var(--arc-background);
		font-size: var(--arc-text-xs);
		font-weight: 500;
		line-height: 1.2;
		white-space: nowrap;
		pointer-events: none;
		opacity: 0;
		transform: translate(-50%, 3px);
		transition:
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* Pointing at the stack loosens its overlap from the center; the person under the pointer lifts with a crisp ring and names themselves, and their neighbors ease aside. */
	@media (hover: hover) and (pointer: fine) {
		.group:hover .lift {
			--fan: calc((var(--index) - (var(--count) - 1) / 2) * 4px);
		}
		.slot:hover {
			z-index: 1;
		}
		.slot:hover .lift {
			--rise: -2px;
		}
		.slot:hover ~ .slot .lift {
			--aside: 3px;
		}
		.slot:has(~ .slot:hover) .lift {
			--aside: -3px;
		}
		.slot:hover .lift :global(.group-avatar),
		.slot:hover .overflow {
			box-shadow: 0 0 0 1px var(--arc-border-strong);
		}
		.slot:hover .tip {
			opacity: 1;
			transform: translate(-50%, 0);
			transition-delay: 60ms;
		}
	}
	/* Reduced motion keeps the stack still; the ring and name still answer the pointer. */
	@media (prefers-reduced-motion: reduce) {
		.lift {
			transform: none !important;
			transition: none;
		}
		.tip {
			transform: translate(-50%, 0);
			transition: none;
		}
	}
</style>
