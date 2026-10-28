<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import type { TransitionConfig } from 'svelte/transition';
	import { ease, isReducedMotion, motionTokens } from '../motion';

	type Props = {
		page: number;
		pageCount: number;
		onPageChange: (page: number) => void;
		label?: string;
	};

	let { page, pageCount, onPageChange, label = 'Pagination' }: Props = $props();

	const { duration, spring } = motionTokens;
	const WINDOW_SIZE = 5;
	const WINDOW_LEAD = 2;
	/** One button plus the gap, as a fraction of the button width. */
	const SLOT = 1.112;
	const MS_PER_SECOND = 1000;
	/** Pages travel on roughly the smooth spring's visual duration. */
	const TRAVEL_MS = spring.smooth.visualDuration * MS_PER_SECOND;
	const EXIT_FADE_SHARE = duration.instant / spring.smooth.visualDuration;

	const safePageCount = $derived(Math.max(0, Math.floor(pageCount)));
	const currentPage = $derived(
		safePageCount > 0 ? Math.min(Math.max(1, Math.floor(page)), safePageCount) : 0
	);
	const start = $derived(
		safePageCount > 0
			? Math.max(1, Math.min(safePageCount - (WINDOW_SIZE - 1), currentPage - WINDOW_LEAD))
			: 1
	);
	const visible = $derived(
		Array.from({ length: Math.min(safePageCount, WINDOW_SIZE) }, (_, index) => start + index)
	);
	const travelMs = $derived(isReducedMotion() ? 0 : TRAVEL_MS);

	let nav = $state<HTMLElement | null>(null);
	let mark = $state<HTMLSpanElement>();
	let markReady = $state(false);
	/** The window start that is on screen, so a shift can tell how many slots the belt moves. */
	let renderedStart = untrack(() => start);

	const beltShift = () => start - renderedStart;

	/** When the five page window shifts, numbers travel like a belt: each one moves by the same number of slots. */
	function slideIn(node: HTMLElement): TransitionConfig {
		if (isReducedMotion()) return {};
		const offset = node.offsetWidth * SLOT * beltShift();
		animate(
			node,
			{ opacity: [0, 1], x: [offset, 0] },
			{ x: spring.smooth, opacity: { duration: duration.standard, ease: motionTokens.ease.enter } }
		);
		return {};
	}

	/** A CSS transition, so the leaving number composes with the position Svelte pins it at. */
	function slideOut(node: HTMLElement): TransitionConfig {
		if (isReducedMotion()) return {};
		const offset = -node.offsetWidth * SLOT * beltShift();
		const existing = getComputedStyle(node).transform;
		const base = existing === 'none' ? '' : existing;
		return {
			duration: TRAVEL_MS,
			css: (_, exitProgress) => {
				const fade = Math.min(1, exitProgress / EXIT_FADE_SHARE);
				return `opacity:${1 - ease.standard(fade)};transform:${base} translateX(${offset * ease.standard(exitProgress)}px);`;
			}
		};
	}

	// One mark travels to the current page's final slot. Until it has measured once (and during server render),
	// the current button draws its own border so nothing flashes before hydration.
	function placeMark(instant: boolean) {
		const current = nav?.querySelector<HTMLElement>("[aria-current='page']");
		if (!current || !mark) return;
		const frame = { x: current.offsetLeft, y: current.offsetTop };
		animate(mark, frame, instant || isReducedMotion() ? { duration: 0 } : spring.morph);
	}

	$effect(() => {
		void [currentPage, start, safePageCount];
		placeMark(!untrack(() => markReady));
		markReady = true;
		renderedStart = start;
	});

	$effect(() => {
		if (!nav) return;
		let size = `${nav.offsetWidth}x${nav.offsetHeight}`;
		const observer = new ResizeObserver(() => {
			const next = `${nav!.offsetWidth}x${nav!.offsetHeight}`;
			if (next === size) return;
			size = next;
			placeMark(true);
		});
		observer.observe(nav);
		return () => observer.disconnect();
	});
</script>

<nav bind:this={nav} class="nav" aria-label={label} data-mark-ready={markReady || undefined}>
	{#if safePageCount}
		<button
			type="button"
			class="step"
			onclick={() => onPageChange(currentPage - 1)}
			disabled={currentPage <= 1}
			aria-label="Previous page"
		>
			<ChevronLeftIcon size={16} aria-hidden="true" />
		</button>
		<span bind:this={mark} aria-hidden="true" class="mark"></span>
		{#each visible as number (number)}
			<button
				type="button"
				onclick={() => onPageChange(number)}
				aria-label={`Page ${number}`}
				aria-current={currentPage === number ? 'page' : undefined}
				animate:flip={{ duration: travelMs, easing: ease.standard }}
				in:slideIn
				out:slideOut
			>
				{number}
			</button>
		{/each}
		<button
			type="button"
			class="step"
			onclick={() => onPageChange(currentPage + 1)}
			disabled={currentPage >= safePageCount}
			aria-label="Next page"
		>
			<ChevronRightIcon size={16} aria-hidden="true" />
		</button>
	{/if}
</nav>

<style>
	.nav {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--arc-space-1);
	}
	.nav button {
		position: relative;
		display: grid;
		width: var(--arc-control-height-sm);
		height: var(--arc-control-height-sm);
		place-items: center;
		border: 1px solid transparent;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-text-secondary);
		font: inherit;
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.nav button[aria-current='page'] {
		color: var(--arc-foreground);
	}
	/* One shared mark travels between pages. Before it has measured (server render), the button draws its own. */
	.mark {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--arc-control-height-sm);
		height: var(--arc-control-height-sm);
		box-sizing: border-box;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
		opacity: 0;
		pointer-events: none;
	}
	.nav[data-mark-ready] .mark {
		opacity: 1;
	}
	.nav:not([data-mark-ready]) button[aria-current='page'] {
		border-color: var(--arc-border);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
	}
	/* Only the arrows press in. Page numbers move with Motion, so they keep CSS off transform and opacity. */
	.nav .step {
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			opacity var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.nav .step:active:not(:disabled) {
		transform: scale(0.96);
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-fast), 100ms;
		transition-timing-function:
			var(--arc-ease-standard), var(--arc-ease-standard), var(--arc-ease-standard), ease-out;
	}
	.nav button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	@media (hover: hover) and (pointer: fine) {
		.nav button:hover:not(:disabled) {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
		.nav[data-mark-ready] button[aria-current='page']:hover {
			background: transparent;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav button,
		.nav .step {
			transition: none;
		}
		.nav .step:active:not(:disabled) {
			transform: none;
		}
	}
</style>
