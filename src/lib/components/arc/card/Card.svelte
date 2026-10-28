<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog } from 'bits-ui';
	import { animate } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { ease, isReducedMotion, motionTokens, presence, pressScale } from '../motion';
	import CardStatus from './CardStatus.svelte';
	import { fly, land, morphParts, readFrame, type MorphParts } from './quick-look';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		title: string;
		description?: string;
		media?: Snippet;
		action?: Snippet;
		/** A small leading visual for the footer, such as the owner's avatar. */
		avatar?: Snippet;
		/** Who the card belongs to, such as the owner's name. */
		meta?: string | Snippet;
		/** A short status under the meta, such as "Updated 2 hours ago". Changed words rise in and are announced politely. */
		status?: string;
		/** Content for a quick look. When set, the whole card opens and grows into a larger view; Escape or the close control morphs it back. */
		details?: Snippet;
		open?: boolean;
		defaultOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		children?: Snippet;
	};

	let {
		title,
		description,
		media,
		action,
		avatar,
		meta,
		status,
		details,
		defaultOpen = false,
		open = $bindable(defaultOpen),
		onOpenChange,
		children,
		class: className,
		...rest
	}: Props = $props();

	const { duration, spring } = motionTokens;
	/** One critically damped spring carries the surface both ways, so it never overshoots and can reverse mid-flight. Closing is a touch quicker. */
	const GROW = { ...spring.smooth, visualDuration: 0.3 };
	const SETTLE = { ...spring.smooth, visualDuration: 0.26 };
	/** Once the surface has visually landed, the card takes over. */
	const RETURN_MS = 300;
	const FADE = { duration: duration.instant };
	const LIFT_PX = -2;
	/** The photo drifts in slowly while the card is pointed at, and eases back a little faster. */
	const ZOOM = 1.04;
	const zoomIn = { duration: duration.considered * 2, ease: motionTokens.ease.standard };
	const zoomOut = { duration: duration.considered, ease: motionTokens.ease.standard };
	/** Quick look extras arrive once the surface has mostly grown, so they never ride the stretch. */
	const reveal = {
		delay: duration.instant,
		duration: duration.standard,
		ease: motionTokens.ease.enter
	};
	const closeIn = {
		delay: duration.instant,
		duration: duration.fast,
		ease: motionTokens.ease.enter
	};
	const DETAILS_RISE_PX = 6;
	const CLOSE_SCALE = 0.9;
	const CLOSE_PRESS = 0.94;
	const overlayOut = { duration: duration.exit, easing: ease.standard };

	let card = $state<HTMLElement>();
	let zoom = $state<HTMLElement>();
	let panel = $state<HTMLElement | null>(null);
	let hovered = $state(false);
	let panelShown = $state(false);
	/** Closing keeps the quick look mounted and sends it back to the card's box, so the surface never drops behind the page. */
	let returning = $state(false);
	let flightCount = 0;
	let returnTimer: ReturnType<typeof setTimeout> | undefined;

	const reduced = $derived(isReducedMotion());
	const isOpen = $derived(Boolean(details) && open);
	const cardHidden = $derived(Boolean(details) && !reduced && panelShown);

	function setOpen(next: boolean) {
		open = next;
		onOpenChange?.(next);
	}

	function hoverWithMouse(event: PointerEvent) {
		if (event.pointerType === 'mouse') hovered = true;
	}

	/** Title size, padding, and box travel with the surface; the close control and details arrive after it. */
	function grow(parts: MorphParts, cardParts: MorphParts) {
		const fresh = !returning;
		const flight = ++flightCount;
		returning = false;
		revealExtras(parts.surface, fresh);
		if (reduced) {
			animate(parts.surface, { opacity: fresh ? [0, 1] : 1 }, FADE);
			return;
		}
		// The quick look keeps the card's line length, so the description never rewraps while it travels.
		const measure = card?.querySelector<HTMLElement>('[data-part="description"]')?.offsetWidth;
		if (measure) parts.surface.style.setProperty('--card-measure', `${measure}px`);
		const from = readFrame(fresh ? cardParts : parts);
		land(parts);
		const to = readFrame(parts);
		const [surfaceFlight] = fly(parts, from, to, GROW);
		surfaceFlight.then(() => {
			if (flight === flightCount) land(parts);
		});
	}

	function revealExtras(surface: HTMLElement, fresh: boolean) {
		const closeSlot = surface.querySelector<HTMLElement>('[data-part="close"]');
		const detailsBlock = surface.querySelector<HTMLElement>('[data-part="details"]');
		const panelZoom = surface.querySelector<HTMLElement>('[data-part="zoom"]');
		if (closeSlot) {
			const scale = reduced ? 1 : fresh ? [CLOSE_SCALE, 1] : 1;
			animate(closeSlot, { opacity: fresh ? [0, 1] : 1, scale }, reduced ? FADE : closeIn);
		}
		if (detailsBlock) {
			const y = reduced ? 0 : fresh ? [DETAILS_RISE_PX, 0] : 0;
			animate(detailsBlock, { opacity: fresh ? [0, 1] : 1, y }, reduced ? { duration: 0 } : reveal);
		}
		if (panelZoom && fresh)
			animate(panelZoom, { scale: [hovered && !reduced ? ZOOM : 1, 1] }, GROW);
	}

	function sendBack(parts: MorphParts, cardParts: MorphParts) {
		returning = true;
		++flightCount;
		const closeSlot = parts.surface.querySelector<HTMLElement>('[data-part="close"]');
		const detailsBlock = parts.surface.querySelector<HTMLElement>('[data-part="details"]');
		if (closeSlot) animate(closeSlot, { opacity: 0, scale: CLOSE_SCALE }, FADE);
		if (detailsBlock) animate(detailsBlock, { opacity: 0, y: 0 }, FADE);
		if (reduced) animate(parts.surface, { opacity: 0 }, FADE);
		else fly(parts, readFrame(parts), readFrame(cardParts), SETTLE);
		returnTimer = setTimeout(() => {
			panelShown = false;
			returning = false;
		}, RETURN_MS);
	}

	$effect(() => {
		const opening = isOpen;
		const surface = panel;
		untrack(() => {
			const parts = surface ? morphParts(surface) : undefined;
			const cardParts = card ? morphParts(card) : undefined;
			if (opening) {
				clearTimeout(returnTimer);
				panelShown = true;
				if (parts && cardParts) grow(parts, cardParts);
			} else if (parts && cardParts) {
				sendBack(parts, cardParts);
			}
		});
	});

	$effect(() => () => clearTimeout(returnTimer));

	$effect(() => {
		if (card) animate(card, { y: hovered && !reduced ? LIFT_PX : 0 }, spring.snappy);
	});

	$effect(() => {
		if (zoom) animate(zoom, { scale: hovered && !reduced ? ZOOM : 1 }, hovered ? zoomIn : zoomOut);
	});

	function fadeInOverlay(overlay: HTMLElement) {
		const enter = reduced ? FADE : { duration: duration.standard, ease: motionTokens.ease.enter };
		animate(overlay, { opacity: [0, 1] }, enter);
	}
</script>

{#snippet footer()}
	{#if avatar || meta || status || action}
		<div class="footer">
			{#if avatar || meta || status}
				<div class="byline">
					{#if avatar}<span class="avatar">{@render avatar()}</span>{/if}
					<span class="byline-text">
						{#if meta}
							<span class="meta">
								{#if typeof meta === 'string'}{meta}{:else}{@render meta()}{/if}
							</span>
						{/if}
						{#if status}<CardStatus text={status} />{/if}
					</span>
				</div>
			{/if}
			{#if action}<div class="action">{@render action()}</div>{/if}
		</div>
	{/if}
{/snippet}

{#snippet cardView()}
	<article
		{...rest}
		bind:this={card}
		class={['card', className]}
		data-hover={hovered || undefined}
		style:opacity={cardHidden ? 0 : undefined}
		onpointerenter={hoverWithMouse}
		onpointerleave={() => (hovered = false)}
	>
		{#if media}
			<div class="media"><div class="zoom" bind:this={zoom}>{@render media()}</div></div>
		{/if}
		<div class="content" data-part="content">
			<h3 class="title" data-part="title">
				{#if details}
					<Dialog.Trigger>
						{#snippet child({ props })}
							<button {...props} type="button" class="trigger">{title}</button>
						{/snippet}
					</Dialog.Trigger>
				{:else}
					{title}
				{/if}
			</h3>
			{#if description}<p class="description" data-part="description">{description}</p>{/if}
			{@render children?.()}
			{@render footer()}
		</div>
	</article>
{/snippet}

{#if details}
	<!-- The quick look grows out of the card: the surface, photo, and copy travel on one spring while the details settle in beneath them. -->
	<Dialog.Root open={isOpen} onOpenChange={setOpen}>
		{@render cardView()}
		{#if panelShown}
			<Dialog.Portal>
				<Dialog.Overlay forceMount>
					{#snippet child({ props, open: overlayOpen })}
						{#if overlayOpen}
							<div
								{...props}
								class="overlay"
								{@attach fadeInOverlay}
								out:presence={overlayOut}
							></div>
						{/if}
					{/snippet}
				</Dialog.Overlay>
				<Dialog.Content forceMount>
					{#snippet child({ props })}
						<div {...props} bind:this={panel} class="panel" data-returning={returning || undefined}>
							{#if media}
								<div class="media"><div class="zoom" data-part="zoom">{@render media()}</div></div>
							{/if}
							<span class="close-slot" data-part="close" style="opacity: 0">
								<Dialog.Close>
									{#snippet child({ props: closeProps })}
										<button
											{...closeProps}
											type="button"
											class="close"
											aria-label="Close quick look"
											{@attach pressScale(CLOSE_PRESS)}
										>
											<XIcon size={16} strokeWidth={1.75} aria-hidden="true" />
										</button>
									{/snippet}
								</Dialog.Close>
							</span>
							<div class="content" data-part="content">
								<Dialog.Title>
									{#snippet child({ props: titleProps })}
										<h2 {...titleProps} class="title" data-part="title">{title}</h2>
									{/snippet}
								</Dialog.Title>
								{#if description}
									<Dialog.Description>
										{#snippet child({ props: descriptionProps })}
											<p {...descriptionProps} class="description">{description}</p>
										{/snippet}
									</Dialog.Description>
								{/if}
								{@render children?.()}
								{@render footer()}
								<div class="details" data-part="details" style="opacity: 0">
									{@render details?.()}
								</div>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</Dialog.Portal>
		{/if}
	</Dialog.Root>
{:else}
	{@render cardView()}
{/if}

<style>
	/* Isolation keeps the rounded clip on the media while the card lifts on its own layer (Safari drops it otherwise).
	   Motion drives the lift and the quick look morph, so transform never gets a CSS transition here. */
	.card {
		position: relative;
		min-width: 0;
		overflow: hidden;
		isolation: isolate;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	/* A pointed-at card floats a little, so the shadow arrives with the lift. Touch and pen never lift. */
	.card[data-hover] {
		border-color: var(--arc-border-strong);
		box-shadow: var(--arc-shadow-raised);
	}
	.card:has(.trigger:focus-visible) {
		border-color: var(--arc-border-strong);
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.media {
		position: relative;
		overflow: hidden;
		background: var(--arc-surface-muted);
	}
	.zoom {
		display: grid;
		min-height: 112px;
		place-items: center;
	}
	.content {
		padding: var(--arc-space-5);
	}
	/* Fit-content width keeps the title's box the shape of its text, so it grows evenly into the quick look. */
	.title {
		width: fit-content;
		max-width: 100%;
		margin: 0;
		font-size: var(--arc-text-lg);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		line-height: 1.3;
		text-wrap: balance;
	}
	.trigger {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-align: inherit;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	/* The title's hit area stretches over the whole card, so pointing anywhere opens the quick look while the action stays on top. */
	.trigger::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.trigger:focus-visible {
		outline: none;
	}
	.description {
		max-width: 34ch;
		margin: var(--arc-space-2) 0 0;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
		text-wrap: pretty;
	}
	.footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
		margin-top: var(--arc-space-5);
	}
	.byline {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		gap: var(--arc-space-3);
		min-width: 0;
	}
	.avatar {
		display: grid;
		flex: none;
		width: var(--arc-space-8);
		height: var(--arc-space-8);
		overflow: hidden;
		border-radius: var(--arc-radius-pill);
		background: var(--arc-surface-muted);
	}
	.avatar > :global(*) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	/* A shrinkable column, so a narrow footer truncates the byline instead of sliding it under the action. */
	.byline-text {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.meta {
		overflow: hidden;
		color: var(--arc-foreground);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.action {
		position: relative;
		z-index: 1;
		display: flex;
		flex: none;
		flex-wrap: wrap;
		gap: var(--arc-space-3);
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: oklch(10% 0 0 / 0.46);
		backdrop-filter: blur(7px);
	}
	/* Centered with auto margins; while it flies, the quick look pins its box inline and follows the animated one. */
	.panel {
		position: fixed;
		inset: 0;
		z-index: 51;
		width: min(calc(100vw - var(--arc-space-8)), 30rem);
		height: fit-content;
		max-height: calc(100dvh - var(--arc-space-8));
		margin: auto;
		overflow: hidden auto;
		overscroll-behavior: contain;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-surface);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.panel:focus {
		outline: none;
	}
	/* Closing: the panel takes the card's look on its way back, so it lands exactly where the card sits and hands back without a seam. */
	.panel[data-returning] {
		border-color: var(--arc-border);
		background: var(--arc-surface);
		box-shadow: none;
		pointer-events: none;
	}
	.panel .content {
		padding: var(--arc-space-6);
	}
	.panel .title {
		font-size: var(--arc-text-xl);
	}
	.panel .description {
		max-width: var(--card-measure, 34ch);
	}
	/* The slot carries the entrance, so the button's own press answers instantly. */
	.close-slot {
		position: absolute;
		top: var(--arc-space-4);
		right: var(--arc-space-4);
		z-index: 2;
		display: grid;
	}
	.close {
		display: grid;
		width: var(--arc-space-8);
		height: var(--arc-space-8);
		place-items: center;
		padding: 0;
		border: 1px solid color-mix(in oklch, var(--arc-border) 70%, transparent);
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-surface-raised) 74%, transparent);
		backdrop-filter: blur(12px);
		color: var(--arc-foreground);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition: background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.close:hover {
			background: var(--arc-surface-raised);
		}
	}
	.close:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
	}
	.details {
		margin-top: var(--arc-space-6);
		padding-top: var(--arc-space-5);
		border-top: 1px solid var(--arc-border);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
		line-height: var(--arc-leading-body);
	}

	@media (prefers-reduced-motion: reduce) {
		.card,
		.close {
			transition-duration: var(--arc-duration-instant);
		}
	}
</style>
