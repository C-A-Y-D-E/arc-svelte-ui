<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { strings } from '../strings';
	import { isReducedMotion, moveIndicator } from '../motion';
	import { getTabsContext } from './tabs-context';

	/**
	 * `line` is not in Arc (Arc documents only the pill): no track, and the active tab is
	 * marked by a bar under it instead of a raised pill.
	 */
	type Props = Omit<TabsPrimitive.ListProps, 'child'> & { variant?: 'pill' | 'line' };

	let {
		ref = $bindable(null),
		variant = 'pill',
		class: className,
		children,
		...rest
	}: Props = $props();

	const tabs = getTabsContext();
	/** Room kept clear of the scroll buttons when revealing a tab. */
	const SCROLL_BUTTON_PX = 34;
	const EDGE_TOLERANCE_PX = 1;
	const PAGE_FRACTION = 0.75;

	let shell: HTMLDivElement;
	let viewport: HTMLDivElement;
	let indicator: HTMLSpanElement;
	let edges = $state({ overflow: false, left: false, right: false });

	const scrollBehavior = (): ScrollBehavior => (isReducedMotion() ? 'instant' : 'smooth');

	function maxScroll() {
		return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
	}

	function updateEdges() {
		const max = maxScroll();
		const next = {
			overflow: viewport.scrollWidth > shell.clientWidth + EDGE_TOLERANCE_PX,
			left: viewport.scrollLeft > EDGE_TOLERANCE_PX,
			right: viewport.scrollLeft < max - EDGE_TOLERANCE_PX
		};
		if (next.overflow !== edges.overflow || next.left !== edges.left || next.right !== edges.right)
			edges = next;
	}

	function reveal(tab: HTMLElement | null) {
		if (!tab) return;
		const frame = viewport.getBoundingClientRect();
		const item = tab.getBoundingClientRect();
		const max = maxScroll();
		const left = frame.left + (viewport.scrollLeft > EDGE_TOLERANCE_PX ? SCROLL_BUTTON_PX : 0);
		const right =
			frame.right - (viewport.scrollLeft < max - EDGE_TOLERANCE_PX ? SCROLL_BUTTON_PX : 0);
		const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
		if (delta) viewport.scrollBy({ left: delta, behavior: scrollBehavior() });
	}

	function scrollTabs(direction: number) {
		viewport.scrollBy({
			left: direction * viewport.clientWidth * PAGE_FRACTION,
			behavior: scrollBehavior()
		});
	}

	function activeTab() {
		return ref?.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? null;
	}

	$effect(() => {
		const observer = new ResizeObserver(updateEdges);
		observer.observe(shell);
		observer.observe(viewport);
		if (ref) observer.observe(ref);
		updateEdges();
		return () => observer.disconnect();
	});

	// One highlight glides between the triggers of this list, standing in for Motion's shared layoutId.
	let placed = false;
	$effect(() => {
		void tabs.active;
		const tab = activeTab();
		moveIndicator(indicator, tab, { instant: !placed });
		placed = true;
		reveal(tab);
	});

	$effect(() => {
		if (!ref) return;
		const observer = new ResizeObserver(() =>
			moveIndicator(indicator, activeTab(), { instant: true })
		);
		observer.observe(ref);
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={shell}
	class="list-shell"
	data-variant={variant}
	data-overflow={edges.overflow}
	data-left={edges.left}
	data-right={edges.right}
>
	{#if edges.overflow}
		<button
			type="button"
			class="scroll-button scroll-left"
			aria-label={strings.tabsScrollLeft()}
			disabled={!edges.left}
			onclick={() => scrollTabs(-1)}
		>
			<ChevronLeftIcon size={17} aria-hidden="true" />
		</button>
	{/if}
	<div
		bind:this={viewport}
		class="viewport"
		onscroll={updateEdges}
		onfocusin={(event) => {
			if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'tab')
				reveal(event.target);
		}}
	>
		<TabsPrimitive.List {...rest}>
			{#snippet child({ props })}
				<div {...props} bind:this={ref} class={['list', className]}>
					<span bind:this={indicator} class="selection" aria-hidden="true"></span>
					{@render children?.()}
				</div>
			{/snippet}
		</TabsPrimitive.List>
	</div>
	{#if edges.overflow}
		<button
			type="button"
			class="scroll-button scroll-right"
			aria-label={strings.tabsScrollRight()}
			disabled={!edges.right}
			onclick={() => scrollTabs(1)}
		>
			<ChevronRightIcon size={17} aria-hidden="true" />
		</button>
	{/if}
</div>

<style>
	.list-shell {
		position: relative;
		display: inline-flex;
		max-width: 100%;
		min-width: 0;
		align-items: center;
		isolation: isolate;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface-muted);
	}
	.viewport {
		min-width: 0;
		overflow-x: auto;
		border-radius: inherit;
		scrollbar-width: none;
	}
	.viewport::-webkit-scrollbar {
		display: none;
	}
	.list-shell[data-left='true'] .viewport {
		mask-image: linear-gradient(to right, transparent, black 35px, black);
	}
	.list-shell[data-right='true'] .viewport {
		mask-image: linear-gradient(to right, black, black calc(100% - 35px), transparent);
	}
	.list-shell[data-left='true'][data-right='true'] .viewport {
		mask-image: linear-gradient(
			to right,
			transparent,
			black 35px,
			black calc(100% - 35px),
			transparent
		);
	}
	/* The list owns the stacking context so the gliding highlight passes under every label, not over earlier ones.
	   It is also the positioned parent the highlight measures its triggers against. */
	.list {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		width: max-content;
		align-items: center;
		gap: var(--arc-space-1);
		padding: var(--arc-space-1);
	}
	.scroll-button {
		position: absolute;
		z-index: 2;
		top: 0;
		bottom: 0;
		display: grid;
		width: 33px;
		place-items: center;
		border: 0;
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	.scroll-left {
		left: 0;
		border-radius: var(--arc-radius-control) 0 0 var(--arc-radius-control);
	}
	.scroll-right {
		right: 0;
		border-radius: 0 var(--arc-radius-control) var(--arc-radius-control) 0;
	}
	.scroll-button:disabled {
		opacity: 0;
		pointer-events: none;
	}
	.scroll-button:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -3px;
	}
	.selection {
		position: absolute;
		z-index: -1;
		top: 0;
		left: 0;
		box-sizing: border-box;
		border: 1px solid var(--arc-border);
		border-radius: calc(var(--arc-radius-control) - 3px);
		background: var(--arc-surface);
		box-shadow: var(--arc-shadow-resting);
		opacity: 0;
		pointer-events: none;
		will-change: transform;
	}
	.list-shell[data-variant='line'] {
		border: 0;
		border-radius: 0;
		background: transparent;
	}
	.list-shell[data-variant='line'] .list {
		padding-block: 0;
	}
	.list-shell[data-variant='line'] .scroll-button {
		background: var(--arc-surface);
	}
	.list-shell[data-variant='line'] .selection {
		border: 0;
		border-bottom: 2px solid var(--arc-highlight-strong);
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}
</style>
