<script lang="ts">
	type Props = {
		/** Image address. Null, or an image that fails to load, shows the fallback letter instead. */
		src: string | null;
		/** Shown on the neutral placeholder; only the first character is used. */
		fallback: string;
		/** Short text drawn over the image, such as a number. Not in Arc. */
		badge?: string;
		/** A flat disc in this colour with the badge on it, instead of an image. Not in Arc. */
		color?: string;
	};

	let { src, fallback, badge, color }: Props = $props();

	let failedSrc = $state<string | null>(null);
	const showImage = $derived(Boolean(src) && failedSrc !== src);
</script>

<span class="avatar" class:disc={Boolean(color)} style:--disc-color={color} aria-hidden="true">
	{#if color}
		{badge ?? ''}
	{:else if showImage}
		<img {src} alt="" loading="lazy" decoding="async" onerror={() => (failedSrc = src)} />
		{#if badge}<span class="badge">{badge}</span>{/if}
	{:else}
		{fallback.trim().charAt(0).toLocaleUpperCase()}
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: 50%;
		background: var(--arc-surface-muted);
		color: var(--arc-text-muted);
		font-size: 10px;
		font-weight: 500;
		line-height: 1;
	}
	.avatar:has(.badge) {
		position: relative;
	}
	.disc {
		border-color: var(--disc-color);
		background: var(--disc-color);
		color: var(--ctp-on-accent);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.badge {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 2px rgb(0 0 0 / 0.55);
	}
</style>
