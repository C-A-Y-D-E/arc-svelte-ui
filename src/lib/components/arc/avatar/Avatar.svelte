<script module lang="ts">
	export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
	export type AvatarStatus = 'online' | 'offline';
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, motionTokens, presence } from '../motion';
	import { springTiming } from '../alert/swap';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		name: string;
		src?: string;
		size?: AvatarSize;
		status?: AvatarStatus;
	};

	let { name, src, size = 'md', status, class: className, ...rest }: Props = $props();

	const STATUS_SCALE = 0.6;
	const statusEnter = springTiming(motionTokens.spring.snappy);

	let failedSrc = $state<string>();

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('')
	);
	const showImage = $derived(Boolean(src) && failedSrc !== src);
	const label = $derived(`${name}${status ? `, ${status}` : ''}`);

	/** A photo that is already decoded shows at once. One that is still loading waits, then fades in from a soft blur. */
	function holdUntilLoaded(image: HTMLImageElement) {
		if (!image.complete) image.dataset.loading = '';
	}
</script>

<span {...rest} class={['avatar', size, className]} role="img" aria-label={label}>
	{#if showImage}
		{#key src}
			<img
				{@attach holdUntilLoaded}
				{src}
				alt=""
				onload={(event) => delete (event.currentTarget as HTMLImageElement).dataset.loading}
				onerror={() => (failedSrc = src)}
			/>
		{/key}
	{:else}
		<span class={[src && 'fallback']} aria-hidden="true">{initials}</span>
	{/if}
	{#each status ? [status] : [] as current (current)}
		<i
			class={['status', current]}
			aria-hidden="true"
			in:presence={{ scale: STATUS_SCALE, ...statusEnter }}
			out:presence={{
				scale: STATUS_SCALE,
				duration: motionTokens.duration.fast,
				easing: ease.standard
			}}
		></i>
	{/each}
</span>

<style>
	.avatar {
		position: relative;
		display: inline-grid;
		flex: 0 0 auto;
		place-items: center;
		overflow: visible;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
		font-size: var(--arc-text-xs);
		font-weight: 500;
	}
	/* Fills the circle like next/image's `fill`. */
	.avatar img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		border-radius: inherit;
		object-fit: cover;
		transition:
			opacity var(--arc-duration-standard) var(--arc-ease-enter),
			filter var(--arc-duration-standard) var(--arc-ease-enter);
	}
	/* Set only while a photo is still downloading after mount, so cached photos never fade. */
	.avatar img[data-loading] {
		opacity: 0;
		filter: blur(4px);
		transition: none;
	}
	.fallback {
		animation: avatar-fallback-in var(--arc-duration-standard) var(--arc-ease-enter) both;
	}
	.sm {
		width: 28px;
		height: 28px;
		font-size: 10px;
	}
	.md {
		width: 36px;
		height: 36px;
	}
	.lg {
		width: 48px;
		height: 48px;
		font-size: var(--arc-text-sm);
	}
	.xl {
		width: 88px;
		height: 88px;
		font-size: 23px;
	}
	.status {
		position: absolute;
		right: 0;
		bottom: 0;
		z-index: 2;
		width: 10px;
		height: 10px;
		border: 2px solid var(--arc-surface);
		border-radius: var(--arc-radius-pill);
		box-shadow: 0 0 0 1px color-mix(in oklch, var(--arc-border) 70%, transparent);
	}
	.sm .status {
		width: 8px;
		height: 8px;
		border-width: 1.5px;
	}
	.lg .status {
		width: 12px;
		height: 12px;
	}
	.xl .status {
		width: 14px;
		height: 14px;
		right: 4px;
		bottom: 4px;
	}
	.online {
		background: var(--arc-success);
	}
	.offline {
		background: var(--arc-text-muted);
	}
	@keyframes avatar-fallback-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.avatar img {
			transition: none;
		}
		.avatar img[data-loading] {
			filter: none;
		}
		.fallback {
			animation: none;
		}
	}
</style>
