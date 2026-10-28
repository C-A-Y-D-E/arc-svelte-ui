<script module lang="ts">
	export type HoverCardSide = 'top' | 'bottom' | 'left' | 'right';
	export type HoverCardAlign = 'start' | 'center' | 'end';

	/** Moving to another trigger within this window opens its card almost at once. */
	const SKIP_WINDOW_MS = 300;

	type Snapshot = { id: string | null; instant: boolean };
	const IDLE: Snapshot = { id: null, instant: false };
	let closedAt = -Infinity;

	/** One hover card is open at a time on the page. While one is open, or just after it closes, the next one opens without waiting and only fades. */
	const cards = $state({ current: IDLE });

	function isWarm() {
		return cards.current.id !== null || performance.now() - closedAt < SKIP_WINDOW_MS;
	}

	function openCard(id: string) {
		if (cards.current.id === id) return;
		cards.current = { id, instant: isWarm() };
	}

	function closeCard(id: string) {
		if (cards.current.id !== id) return;
		cards.current = IDLE;
		closedAt = performance.now();
	}
</script>

<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { animate, motionValue } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import { createAttachmentKey, type Attachment } from 'svelte/attachments';
	import { isReducedMotion, motionTokens } from '../motion';

	/**
	 * A rich preview of a person or link that opens after a short hover or keyboard focus, for mentions, avatars, and references where a click should stay free for navigation.
	 * It waits half a second, opens almost at once when moving between triggers, stays open while the pointer travels into it, and closes fast on leave or Escape.
	 * On touch, a tap toggles it. Keep the content read only; anything actionable belongs behind the trigger itself.
	 */
	type Props = {
		/** The trigger, such as a mention button or a link. Spread `props` onto a focusable element. */
		children: Snippet<[{ props: Record<string | symbol, unknown> }]>;
		/** The preview. `HoverCardProfile` covers people; any read only content works. */
		content: Snippet;
		side?: HoverCardSide;
		align?: HoverCardAlign;
		/** Milliseconds of hover before the first card opens. */
		openDelay?: number;
		/** Milliseconds of grace after the pointer leaves, so it can travel into the card. */
		closeDelay?: number;
		class?: string;
	};

	let {
		children,
		content,
		side = 'bottom',
		align = 'start',
		openDelay = 500,
		closeDelay = 140,
		class: className
	}: Props = $props();

	/** Even warm, a trigger waits this long, so a pointer crossing it on the way into an open card does not steal the card. */
	const INTENT_MS = 80;
	/** How far the card starts toward its trigger, in px. */
	const TRAVEL_PX = 4;
	const GROW_FROM = 0.96;
	const SIDE_OFFSET = 8;
	const COLLISION_PADDING = 12;
	const { ease, spring } = motionTokens;

	const id = $props.id();
	const cardId = `${id}-card`;
	const open = $derived(cards.current.id === id);

	let trigger = $state<HTMLElement | null>(null);
	let card = $state<HTMLElement | null>(null);
	let mounted = $state(false);

	const timers = { open: 0, close: 0 };
	const inside = { trigger: false, card: false, focus: false };
	/** Set by Escape, so a pointer resting on the trigger does not reopen what was just dismissed. */
	let dismissed = false;
	let pointerType = '';

	$effect(() => () => {
		clearTimers();
		closeCard(id);
	});

	function clearTimers() {
		window.clearTimeout(timers.open);
		window.clearTimeout(timers.close);
	}

	function show() {
		clearTimers();
		dismissed = false;
		openCard(id);
	}

	function hide() {
		clearTimers();
		closeCard(id);
	}

	function scheduleOpen() {
		window.clearTimeout(timers.close);
		if (dismissed || cards.current.id === id) return;
		window.clearTimeout(timers.open);
		timers.open = window.setTimeout(() => openCard(id), isWarm() ? INTENT_MS : openDelay);
	}

	function scheduleClose() {
		window.clearTimeout(timers.open);
		if (inside.trigger || inside.card || inside.focus) return;
		window.clearTimeout(timers.close);
		timers.close = window.setTimeout(() => closeCard(id), closeDelay);
	}

	const isMouse = (event: PointerEvent) => event.pointerType !== 'touch';

	const anchorKey = createAttachmentKey();
	const anchor: Attachment<HTMLElement> = (node) => {
		trigger = node;
		return () => (trigger = null);
	};

	const triggerProps = $derived({
		'aria-describedby': open ? cardId : undefined,
		'data-hover-card': open ? 'open' : 'closed',
		[anchorKey]: anchor,
		onpointerenter(event: PointerEvent) {
			if (!isMouse(event)) return;
			inside.trigger = true;
			scheduleOpen();
		},
		onpointerleave(event: PointerEvent) {
			if (!isMouse(event)) return;
			inside.trigger = false;
			dismissed = false;
			scheduleClose();
		},
		onpointerdown(event: PointerEvent) {
			pointerType = event.pointerType;
		},
		onclick() {
			// A tap toggles the card on touch; a click or Enter opens it without the wait.
			const isOpen = cards.current.id === id;
			if (pointerType === 'touch') {
				if (isOpen) hide();
				else show();
			} else if (!isOpen) show();
			pointerType = '';
		},
		onfocus(event: FocusEvent) {
			if (!(event.currentTarget as HTMLElement).matches(':focus-visible')) return;
			inside.focus = true;
			show();
		},
		onblur() {
			inside.focus = false;
			dismissed = false;
			scheduleClose();
		}
	});

	/** Grows from the trigger edge: scale from .96 around the placed origin and a 4px offset toward the trigger on one smooth spring, with its own fade.
	 *  Both retarget from where they are if the pointer comes back mid-exit, so the card turns around instead of jumping. */
	const progress = motionValue(0);
	const fade = motionValue(0);
	// Decided when the card mounts: a card revived mid-exit keeps the path it came in on, even though the page is now warm.
	let still = false;

	// The side is read from the placed card every frame, so a card that flips above its trigger still grows from the trigger edge.
	function paintSurface() {
		if (!card) return;
		const side = card.dataset.side;
		const travel = still ? 0 : (1 - progress.get()) * TRAVEL_PX;
		const x = side === 'left' ? travel : side === 'right' ? -travel : 0;
		const y = side === 'top' ? travel : side === 'bottom' ? -travel : 0;
		const scale = still ? 1 : GROW_FROM + (1 - GROW_FROM) * progress.get();
		card.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
		card.style.opacity = String(fade.get());
	}

	$effect(() => {
		const stopProgress = progress.on('change', paintSurface);
		const stopFade = fade.on('change', paintSurface);
		return () => {
			stopProgress();
			stopFade();
		};
	});

	$effect(() => {
		if (!open || untrack(() => mounted)) return;
		still = untrack(() => cards.current.instant) || isReducedMotion();
		progress.jump(0);
		fade.jump(0);
		mounted = true;
	});

	$effect(() => {
		if (!card) return;
		const present = open;
		const reduced = isReducedMotion();
		paintSurface();
		const grow = present
			? animate(progress, 1, still ? { duration: 0.14, ease: ease.enter } : spring.smooth)
			: animate(progress, 0, { duration: 0.12, ease: ease.standard });
		// The fade leads the grow on the way in and runs alongside it on the way out; it starts from the current opacity either way.
		const fading = present
			? animate(fade, 1, { duration: reduced ? 0.15 : still ? 0.09 : 0.16, ease: ease.enter })
			: animate(fade, 0, { duration: reduced ? 0.1 : 0.12, ease: ease.standard });
		let cancelled = false;
		if (!present) fading.then(() => !cancelled && (mounted = false));
		return () => {
			cancelled = true;
			grow.stop();
			fading.stop();
		};
	});
</script>

<PopoverPrimitive.Root bind:open={() => open, (next) => !next && hide()}>
	{@render children({ props: triggerProps })}
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			forceMount
			customAnchor={trigger}
			id={cardId}
			role="tooltip"
			{side}
			{align}
			sideOffset={SIDE_OFFSET}
			collisionPadding={COLLISION_PADDING}
			trapFocus={false}
			onOpenAutoFocus={(event) => event.preventDefault()}
			onCloseAutoFocus={(event) => event.preventDefault()}
			onEscapeKeydown={() => (dismissed = true)}
			onInteractOutside={(event) => {
				if (trigger?.contains(event.target as Node)) event.preventDefault();
			}}
		>
			{#snippet child({ wrapperProps, props })}
				{#if mounted}
					<div {...wrapperProps}>
						<div
							{...props}
							bind:this={card}
							class={['card', className]}
							onpointerenter={(event) => {
								if (!isMouse(event)) return;
								inside.card = true;
								window.clearTimeout(timers.close);
							}}
							onpointerleave={(event) => {
								if (!isMouse(event)) return;
								inside.card = false;
								scheduleClose();
							}}
						>
							{@render content()}
						</div>
					</div>
				{/if}
			{/snippet}
		</PopoverPrimitive.Content>
	</PopoverPrimitive.Portal>
</PopoverPrimitive.Root>

<style>
	/* A floating layer, so it earns the floating shadow. Transforms pivot on the placed origin, the corner nearest the trigger. */
	.card {
		z-index: 60;
		box-sizing: border-box;
		width: 18.5rem;
		max-width: min(18.5rem, var(--bits-popover-content-available-width, calc(100vw - 24px)));
		padding: var(--arc-space-4);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		font-family: var(--arc-font-body);
		letter-spacing: var(--arc-tracking-body);
		transform-origin: var(--bits-popover-content-transform-origin);
		outline: none;
		opacity: 0;
	}
</style>
