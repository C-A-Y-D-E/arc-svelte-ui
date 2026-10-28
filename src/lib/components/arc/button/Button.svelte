<script module lang="ts">
	/** `buy` and `sell` are not in Arc: Arc's primary shape in the trading colours. */
	export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'buy' | 'sell';
	export type ButtonSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import { animate } from 'motion';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { ease, isReducedMotion, motionTokens, presence, pressScale } from '../motion';

	type Props = HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		loading?: boolean;
		/** Renders a link with the same look; stands in for Arc's `asChild` + Link pattern. */
		href?: string;
		ref?: HTMLButtonElement | HTMLAnchorElement | null;
		children?: Snippet;
	};

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		href,
		disabled,
		class: className,
		ref = $bindable(null),
		children,
		onclick,
		...rest
	}: Props = $props();

	const WIDE_BUTTON_PX = 220;
	const ICON_BUTTON_PX = 48;
	/** Label changes within this window morph the width; other resizes (late fonts, reflow) jump. */
	const MORPH_WINDOW_MS = 700;
	const NON_SCALING =
		'[aria-haspopup]:not([aria-haspopup="false"]), [data-state], [role="combobox"]';

	const { blur, duration, spring } = motionTokens;
	const standardFast = { duration: duration.fast, ease: motionTokens.ease.standard };
	const enterFast = { duration: duration.fast, ease: motionTokens.ease.enter };

	let slot: HTMLSpanElement;
	let content: HTMLSpanElement;
	let phase: HTMLSpanElement;

	/** Icon buttons press a little deeper, wide buttons a little less, so every size reads as the same push. */
	function pressDepth(node: HTMLElement) {
		const inert =
			node.matches(':disabled, [aria-disabled="true"], [aria-busy="true"]') ||
			node.matches(NON_SCALING);
		if (inert) return 1;
		const width = node.offsetWidth;
		if (width > WIDE_BUTTON_PX) return 0.985;
		return width && width <= ICON_BUTTON_PX ? 0.96 : 0.97;
	}

	function isIconOnly(node: Element) {
		return !/\S/.test(node.textContent ?? '');
	}

	/** The outgoing label pops out of flow against the slot and lifts away while the new one rises in. */
	function swapLabel(outgoing: HTMLElement) {
		const icon = isIconOnly(outgoing);
		outgoing.setAttribute('aria-hidden', 'true');
		Object.assign(outgoing.style, {
			position: 'absolute',
			insetBlock: '0',
			left: '0',
			width: `${slot.offsetWidth}px`
		});
		slot.append(outgoing);

		if (isReducedMotion()) {
			animate(outgoing, { opacity: 0 }, { duration: duration.instant }).then(() =>
				outgoing.remove()
			);
			animate(phase, { opacity: [0, 1] }, { duration: duration.instant });
			return;
		}
		const exit = icon
			? { opacity: 0, scale: 0.6, filter: `blur(${blur.subtle}px)` }
			: { opacity: 0, y: -3, filter: `blur(${blur.soft}px)` };
		animate(outgoing, exit, standardFast).then(() => outgoing.remove());

		if (icon) {
			animate(
				phase,
				{ opacity: [0, 1], scale: [0.6, 1], filter: [`blur(${blur.subtle}px)`, 'blur(0px)'] },
				{ ...spring.snappy, opacity: enterFast, filter: enterFast }
			);
		} else {
			animate(
				phase,
				{ opacity: [0, 1], y: [4, 0], filter: [`blur(${blur.soft}px)`, 'blur(0px)'] },
				{ duration: duration.standard, ease: motionTokens.ease.enter }
			);
		}
	}

	$effect(() => {
		let snapshot = phase.cloneNode(true) as HTMLElement;
		let armedUntil = 0;
		let measured = false;
		let widthAnimation: ReturnType<typeof animate> | undefined;

		const labelWatcher = new MutationObserver(() => {
			if (phase.innerHTML === snapshot.innerHTML) return;
			armedUntil = performance.now() + MORPH_WINDOW_MS;
			swapLabel(snapshot);
			snapshot = phase.cloneNode(true) as HTMLElement;
		});
		labelWatcher.observe(phase, { subtree: true, childList: true, characterData: true });

		const widthWatcher = new ResizeObserver(([entry]) => {
			const next = entry.contentRect.width;
			const morph = next && measured && !isReducedMotion() && performance.now() <= armedUntil;
			widthAnimation?.stop();
			if (!morph) {
				measured = next > 0;
				slot.style.width = next ? `${next}px` : 'auto';
				delete slot.dataset.morphing;
				return;
			}
			slot.dataset.morphing = '';
			widthAnimation = animate(slot, { width: next }, spring.morph);
			widthAnimation.then(() => delete slot.dataset.morphing);
		});
		widthWatcher.observe(content);

		return () => {
			labelWatcher.disconnect();
			widthWatcher.disconnect();
			widthAnimation?.stop();
		};
	});
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	bind:this={ref}
	{@attach pressScale(pressDepth)}
	{href}
	tabindex={0}
	class={['button', variant, size, className]}
	disabled={href ? undefined : disabled}
	aria-busy={loading || undefined}
	{...rest}
	aria-disabled={loading || rest['aria-disabled'] || undefined}
	onclick={loading ? (event: Event) => event.preventDefault() : onclick}
>
	{#if loading}
		<span
			class="loader"
			aria-hidden="true"
			in:presence={{ scale: 0.6, duration: duration.fast }}
			out:presence={{
				scale: 0.8,
				blur: blur.subtle,
				duration: duration.fast,
				easing: ease.standard
			}}
		>
			<span class="spinner"></span>
		</span>
	{/if}
	<span bind:this={slot} class={['label-slot', loading && 'loading-label']}>
		<span bind:this={content} class="label-content">
			<span bind:this={phase} class="label-phase">{@render children?.()}</span>
		</span>
	</span>
</svelte:element>

<style>
	/* Press scale is driven by Motion alone, so transform never gets a CSS transition here. */
	.button {
		position: relative;
		display: inline-flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
		border: 1px solid transparent;
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-4);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		white-space: nowrap;
		text-decoration: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background var(--arc-duration-fast) var(--arc-ease-standard),
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.button:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}
	.button[aria-busy='true'] {
		cursor: progress;
	}
	/* Anchors of floating layers never scale: the layer would measure a shrunken trigger. */
	.button:is([aria-haspopup]:not([aria-haspopup='false']), [data-state], [role='combobox']) {
		transform: none !important;
	}
	/* The slot's width follows the incoming label on a spring; the label stays centered and may overflow evenly meanwhile. */
	.label-slot {
		position: relative;
		display: inline-flex;
		min-width: 0;
		align-items: center;
		justify-content: center;
		transition: opacity var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.label-slot[data-morphing] {
		clip-path: inset(-50% calc(var(--arc-space-3) * -1));
	}
	.label-content {
		display: inline-flex;
		flex: none;
		align-items: center;
	}
	.label-phase {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
		white-space: nowrap;
	}
	.label-phase :global(svg) {
		flex: none;
	}
	.primary {
		color: var(--arc-primary-ink);
		background: var(--arc-primary-fill);
		border-color: var(--arc-primary-fill);
	}
	.buy {
		color: var(--buy-foreground);
		background: var(--buy);
		border-color: var(--buy);
	}
	.sell {
		color: var(--sell-foreground);
		background: var(--sell);
		border-color: var(--sell);
	}
	.secondary {
		color: var(--arc-foreground);
		background: var(--arc-surface);
		border-color: var(--arc-border);
	}
	.ghost {
		color: var(--arc-text-secondary);
		background: transparent;
		border-color: transparent;
	}
	.danger {
		color: var(--arc-danger);
		background: var(--arc-surface);
		border-color: var(--arc-border);
	}
	@media (hover: hover) and (pointer: fine) {
		.primary:hover:not(:disabled),
		.buy:hover:not(:disabled),
		.sell:hover:not(:disabled) {
			opacity: 0.91;
			box-shadow: var(--arc-shadow-resting);
		}
		.secondary:hover:not(:disabled) {
			background: var(--arc-surface-muted);
			box-shadow: var(--arc-shadow-resting);
		}
		.ghost:hover:not(:disabled) {
			color: var(--arc-foreground);
			background: var(--arc-surface-muted);
		}
		.danger:hover:not(:disabled) {
			border-color: var(--arc-danger);
			background: var(--arc-surface-muted);
		}
	}
	/* Color feedback on press, so touch and menu triggers (which never scale) still answer the finger. */
	.primary:active:not(:disabled),
	.buy:active:not(:disabled),
	.sell:active:not(:disabled) {
		opacity: 0.84;
	}
	.secondary:active:not(:disabled),
	.ghost:active:not(:disabled) {
		color: var(--arc-foreground);
		background: var(--arc-surface-muted);
	}
	.danger:active:not(:disabled) {
		border-color: var(--arc-danger);
		background: var(--arc-surface-muted);
	}
	.sm {
		min-height: var(--arc-control-height-sm);
		padding-inline: var(--arc-space-3);
		font-size: var(--arc-text-sm);
	}
	.md {
		min-height: var(--arc-control-height-md);
	}
	.lg {
		min-height: var(--arc-control-height-lg);
		padding-inline: var(--arc-space-5);
		font-size: var(--arc-text-sm);
	}
	.loader {
		position: absolute;
		left: 50%;
		top: 50%;
		display: grid;
		width: var(--arc-space-4);
		height: var(--arc-space-4);
		margin: calc(var(--arc-space-4) / -2);
	}
	.spinner {
		border: 1.5px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	.loading-label {
		opacity: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
		.label-slot {
			transition: opacity var(--arc-duration-instant) linear;
		}
		.spinner {
			animation-duration: 0.01ms;
			animation-iteration-count: 1;
		}
	}
</style>
