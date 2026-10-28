<script module lang="ts">
	/** Which edges still have content beyond them. */
	export type ScrollAreaEdges = { top: boolean; bottom: boolean; left: boolean; right: boolean };
	export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';
	export type ScrollAreaScrollbars = 'auto' | 'always';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes, UIEventHandler } from 'svelte/elements';
	import { isReducedMotion } from '../motion';

	type Axis = 'y' | 'x';
	type ThumbDrag = { axis: Axis; start: number; scroll: number; ratio: number };

	/**
	 * A native scroll container with thin overlay scrollbars that appear while scrolling or on hover and fade away at rest.
	 * Each edge fades out only when there is more content beyond it, in proportion to how much. Scrolling stays native, so
	 * keyboard, touch momentum, and scroll snap all behave as the platform expects.
	 */
	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'onscroll'> & {
		children?: Snippet;
		/** Axes that scroll. Defaults to vertical. */
		orientation?: ScrollAreaOrientation;
		/** Length of the edge fade in px. 0 turns the fades off. */
		fade?: number;
		/** "auto" shows scrollbars while scrolling or hovering; "always" keeps them visible when content overflows. */
		scrollbars?: ScrollAreaScrollbars;
		/** How long scrollbars linger after scrolling stops, in ms. */
		hideDelay?: number;
		/** Maximum height of the viewport, for vertical areas that should grow with their content. Numbers are px. */
		maxHeight?: number | string;
		/** Passed to the viewport's `scroll-snap-type`, for example "x mandatory". Children set their own `scroll-snap-align`. */
		snap?: string;
		/** Accessible name. The viewport becomes a labelled, focusable region that arrow and page keys scroll. */
		label?: string;
		/** Turns vertical wheel movement into horizontal scrolling for horizontal areas. Defaults to true. */
		wheelToHorizontal?: boolean;
		viewportClass?: string;
		viewportStyle?: string;
		ref?: HTMLDivElement | null;
		viewportRef?: HTMLDivElement | null;
		onscroll?: UIEventHandler<HTMLDivElement>;
		/** Called when content starts or stops extending past an edge. */
		onEdgeChange?: (edges: ScrollAreaEdges) => void;
	};

	let {
		children,
		orientation = 'vertical',
		fade = 28,
		scrollbars = 'auto',
		hideDelay = 900,
		maxHeight,
		snap,
		label,
		wheelToHorizontal = true,
		viewportClass,
		viewportStyle,
		ref = $bindable(null),
		viewportRef = $bindable(null),
		onscroll,
		onEdgeChange,
		class: className,
		...rest
	}: Props = $props();

	const MIN_THUMB = 28;
	const SUBPIXEL = 0.5;
	/** Pressing the track pages by this share of the viewport. */
	const TRACK_PAGE_RATIO = 0.9;

	const tracks: Record<Axis, HTMLDivElement | null> = $state({ x: null, y: null });
	const thumbs: Record<Axis, HTMLDivElement | null> = $state({ x: null, y: null });
	let hideTimer: number | undefined;
	let lastEdges = '';
	let thumbDrag: ThumbDrag | null = null;

	const vertical = $derived(orientation !== 'horizontal');
	const horizontal = $derived(orientation !== 'vertical');
	const maxHeightCss = $derived(typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight);

	/* Everything visual is written straight to the DOM on each scroll frame, so scrolling never re-renders. */
	function sync() {
		const node = viewportRef;
		const root = ref;
		if (!node || !root) return;
		const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = node;
		const maxY = Math.max(0, scrollHeight - clientHeight);
		const maxX = Math.max(0, scrollWidth - clientWidth);
		// RTL layouts report negative scrollLeft; distance from the start edge is its magnitude.
		const left = Math.abs(scrollLeft);

		if (fade > 0)
			writeFades(node, { top: scrollTop, bottom: maxY - scrollTop, left, right: maxX - left });
		if (vertical) placeThumb('y', scrollTop, maxY, clientHeight, scrollHeight);
		if (horizontal) placeThumb('x', left, maxX, clientWidth, scrollWidth);
		root.toggleAttribute('data-overflow', maxY > SUBPIXEL || maxX > SUBPIXEL);

		reportEdges({
			top: vertical && scrollTop > SUBPIXEL,
			bottom: vertical && maxY - scrollTop > SUBPIXEL,
			left: horizontal && left > SUBPIXEL,
			right: horizontal && maxX - left > SUBPIXEL
		});
	}

	/** Each fade is as long as the content hidden past its edge, up to the fade size. */
	function writeFades(node: HTMLElement, hidden: Record<keyof ScrollAreaEdges, number>) {
		const length = (edge: keyof ScrollAreaEdges) => {
			const onAxis = edge === 'top' || edge === 'bottom' ? vertical : horizontal;
			return `${onAxis ? Math.min(fade, hidden[edge]) : 0}px`;
		};
		for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
			node.style.setProperty(`--scroll-area-fade-${edge}`, length(edge));
		}
	}

	function placeThumb(axis: Axis, scroll: number, max: number, client: number, total: number) {
		const track = tracks[axis];
		const thumb = thumbs[axis];
		if (!track || !thumb) return;
		const overflowing = max > SUBPIXEL;
		track.toggleAttribute('data-hidden', !overflowing);
		if (!overflowing) return;
		const length = axis === 'y' ? track.clientHeight : track.clientWidth;
		const size = Math.max(MIN_THUMB, (length * client) / total);
		const offset = (length - size) * (scroll / max);
		thumb.style[axis === 'y' ? 'height' : 'width'] = `${size}px`;
		thumb.style.transform =
			axis === 'y' ? `translate3d(0, ${offset}px, 0)` : `translate3d(${offset}px, 0, 0)`;
	}

	function reportEdges(edges: ScrollAreaEdges) {
		const key = `${edges.top}${edges.bottom}${edges.left}${edges.right}`;
		if (key === lastEdges) return;
		lastEdges = key;
		onEdgeChange?.(edges);
	}

	$effect(() => {
		const node = viewportRef;
		if (!node) return;
		sync();
		const resizes = new ResizeObserver(() => sync());
		const observeAll = () => {
			resizes.disconnect();
			resizes.observe(node);
			Array.from(node.children).forEach((child) => resizes.observe(child));
		};
		observeAll();
		const mutations = new MutationObserver(() => {
			observeAll();
			sync();
		});
		mutations.observe(node, { childList: true });
		return () => {
			resizes.disconnect();
			mutations.disconnect();
		};
	});

	$effect(() => () => window.clearTimeout(hideTimer));

	function wake() {
		const root = ref;
		if (!root) return;
		root.setAttribute('data-scrolling', '');
		window.clearTimeout(hideTimer);
		hideTimer = window.setTimeout(() => root.removeAttribute('data-scrolling'), hideDelay);
	}

	const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
		sync();
		wake();
		onscroll?.(event);
	};

	// A mouse wheel over a horizontal strip moves it sideways, but only while there is room, so the page still scrolls at the ends.
	$effect(() => {
		const node = viewportRef;
		if (!node || orientation !== 'horizontal' || !wheelToHorizontal) return;
		const wheel = (event: WheelEvent) => {
			if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
			const max = node.scrollWidth - node.clientWidth;
			const at = Math.abs(node.scrollLeft);
			const atStart = event.deltaY < 0 && at <= 0;
			const atEnd = event.deltaY > 0 && at >= max - SUBPIXEL;
			if (max <= 0 || atStart || atEnd) return;
			event.preventDefault();
			node.scrollLeft += event.deltaY * (getComputedStyle(node).direction === 'rtl' ? -1 : 1);
		};
		node.addEventListener('wheel', wheel, { passive: false });
		return () => node.removeEventListener('wheel', wheel);
	});

	/* Dragging a thumb maps pointer travel to scroll distance; pressing the track pages toward the pointer. */
	function onThumbDown(event: PointerEvent & { currentTarget: HTMLDivElement }, axis: Axis) {
		const node = viewportRef;
		const track = tracks[axis];
		const thumb = thumbs[axis];
		if (!node || !track || !thumb || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const length = axis === 'y' ? track.clientHeight : track.clientWidth;
		const size = axis === 'y' ? thumb.offsetHeight : thumb.offsetWidth;
		const max =
			axis === 'y' ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
		thumbDrag = {
			axis,
			start: axis === 'y' ? event.clientY : event.clientX,
			scroll: axis === 'y' ? node.scrollTop : node.scrollLeft,
			ratio: max / Math.max(1, length - size)
		};
		ref?.setAttribute('data-dragging', axis);
		node.style.scrollSnapType = 'none';
	}

	function onThumbMove(event: PointerEvent) {
		const node = viewportRef;
		if (!thumbDrag || !node) return;
		const { axis, start, scroll, ratio } = thumbDrag;
		const delta = ((axis === 'y' ? event.clientY : event.clientX) - start) * ratio;
		if (axis === 'y') node.scrollTop = scroll + delta;
		else node.scrollLeft = scroll + delta;
	}

	function onThumbUp(event: PointerEvent & { currentTarget: HTMLDivElement }) {
		if (!thumbDrag) return;
		thumbDrag = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		ref?.removeAttribute('data-dragging');
		if (viewportRef) viewportRef.style.scrollSnapType = snap ?? '';
		wake();
	}

	function onTrackDown(event: PointerEvent, axis: Axis) {
		const node = viewportRef;
		const thumb = thumbs[axis];
		if (!node || !thumb || event.button !== 0 || event.target !== event.currentTarget) return;
		const rect = thumb.getBoundingClientRect();
		const before = axis === 'y' ? event.clientY < rect.top : event.clientX < rect.left;
		const page =
			(axis === 'y' ? node.clientHeight : node.clientWidth) * TRACK_PAGE_RATIO * (before ? -1 : 1);
		node.scrollBy({
			[axis === 'y' ? 'top' : 'left']: page,
			behavior: isReducedMotion() ? 'auto' : 'smooth'
		});
	}
</script>

{#snippet bar(axis: Axis)}
	<div
		bind:this={tracks[axis]}
		class="track"
		data-axis={axis}
		data-hidden=""
		aria-hidden="true"
		onpointerdown={(event) => onTrackDown(event, axis)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions (the hidden native scrollbar stays the accessible control) -->
		<div
			bind:this={thumbs[axis]}
			class="thumb"
			onpointerdown={(event) => onThumbDown(event, axis)}
			onpointermove={onThumbMove}
			onpointerup={onThumbUp}
			onpointercancel={onThumbUp}
		></div>
	</div>
{/snippet}

<div
	bind:this={ref}
	class={['root', className]}
	data-orientation={orientation}
	data-scrollbars={scrollbars}
	{...rest}
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		bind:this={viewportRef}
		class={['viewport', viewportClass]}
		data-fade={fade > 0 ? orientation : undefined}
		style={viewportStyle}
		style:max-height={maxHeightCss}
		style:scroll-snap-type={snap}
		tabindex={0}
		role={label ? 'region' : undefined}
		aria-label={label}
		onscroll={handleScroll}
	>
		{@render children?.()}
	</div>
	{#if vertical}{@render bar('y')}{/if}
	{#if horizontal}{@render bar('x')}{/if}
</div>

<style>
	.root {
		position: relative;
		display: flex;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		overflow: hidden;
	}

	/* Native scrolling with the platform scrollbars hidden; the overlay bars below replace them. */
	.viewport {
		--scroll-area-fade-top: 0px;
		--scroll-area-fade-bottom: 0px;
		--scroll-area-fade-left: 0px;
		--scroll-area-fade-right: 0px;
		min-width: 0;
		min-height: 0;
		flex: 1 1 auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.viewport::-webkit-scrollbar {
		display: none;
	}
	.root[data-orientation='vertical'] > .viewport {
		overflow-x: hidden;
		overflow-y: auto;
	}
	.root[data-orientation='horizontal'] > .viewport {
		overflow-x: auto;
		overflow-y: hidden;
	}
	.root[data-orientation='both'] > .viewport {
		overflow: auto;
	}

	/* Each fade is exactly as long as the content hidden past that edge, up to the fade size, so it grows in with the first pixels of scroll. */
	.viewport[data-fade='vertical'] {
		-webkit-mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 var(--scroll-area-fade-top),
			#000 calc(100% - var(--scroll-area-fade-bottom)),
			transparent
		);
		mask-image: linear-gradient(
			to bottom,
			transparent,
			#000 var(--scroll-area-fade-top),
			#000 calc(100% - var(--scroll-area-fade-bottom)),
			transparent
		);
	}
	.viewport[data-fade='horizontal'] {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--scroll-area-fade-left),
			#000 calc(100% - var(--scroll-area-fade-right)),
			transparent
		);
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 var(--scroll-area-fade-left),
			#000 calc(100% - var(--scroll-area-fade-right)),
			transparent
		);
	}
	.viewport[data-fade='both'] {
		-webkit-mask-image:
			linear-gradient(
				to bottom,
				transparent,
				#000 var(--scroll-area-fade-top),
				#000 calc(100% - var(--scroll-area-fade-bottom)),
				transparent
			),
			linear-gradient(
				to right,
				transparent,
				#000 var(--scroll-area-fade-left),
				#000 calc(100% - var(--scroll-area-fade-right)),
				transparent
			);
		-webkit-mask-composite: source-in;
		mask-image:
			linear-gradient(
				to bottom,
				transparent,
				#000 var(--scroll-area-fade-top),
				#000 calc(100% - var(--scroll-area-fade-bottom)),
				transparent
			),
			linear-gradient(
				to right,
				transparent,
				#000 var(--scroll-area-fade-left),
				#000 calc(100% - var(--scroll-area-fade-right)),
				transparent
			);
		mask-composite: intersect;
	}

	/* Overlay scrollbars: a generous hit area around a thin pill that thickens under the pointer. */
	.track {
		position: absolute;
		z-index: 1;
		opacity: 0;
		pointer-events: none;
		touch-action: none;
		transition: opacity var(--arc-duration-considered) var(--arc-ease-standard);
	}
	.track[data-axis='y'] {
		top: 3px;
		right: 1px;
		bottom: 3px;
		width: 11px;
	}
	.track[data-axis='x'] {
		right: 3px;
		bottom: 1px;
		left: 3px;
		height: 11px;
	}
	.root[data-orientation='both'] > .track[data-axis='y'] {
		bottom: 13px;
	}
	.root[data-orientation='both'] > .track[data-axis='x'] {
		right: 13px;
	}
	.track[data-hidden] {
		display: none;
	}

	.thumb {
		position: absolute;
		top: 0;
		left: 0;
		will-change: transform;
	}
	.track[data-axis='y'] .thumb {
		width: 100%;
	}
	.track[data-axis='x'] .thumb {
		height: 100%;
	}
	.thumb::after {
		content: '';
		position: absolute;
		border-radius: var(--arc-radius-pill);
		background: color-mix(in oklch, var(--arc-foreground) 30%, transparent);
		transition:
			width var(--arc-duration-fast) var(--arc-ease-standard),
			height var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.track[data-axis='y'] .thumb::after {
		top: 0;
		right: 3px;
		bottom: 0;
		width: 5px;
	}
	.track[data-axis='x'] .thumb::after {
		right: 0;
		bottom: 3px;
		left: 0;
		height: 5px;
	}

	/* Visible while scrolling, while the pointer is over the area, and always when asked. Appearing is quick; leaving lingers. */
	.root[data-scrolling] > .track,
	.root[data-dragging] > .track,
	.root[data-scrollbars='always'] > .track {
		opacity: 1;
		pointer-events: auto;
		transition-duration: var(--arc-duration-fast);
	}

	@media (hover: hover) and (pointer: fine) {
		.root:hover > .track {
			opacity: 1;
			pointer-events: auto;
			transition-duration: var(--arc-duration-fast);
		}
		.track:hover .thumb::after,
		.root[data-dragging] .thumb::after {
			background: color-mix(in oklch, var(--arc-foreground) 46%, transparent);
		}
		.track[data-axis='y']:hover .thumb::after,
		.root[data-dragging='y'] .track[data-axis='y'] .thumb::after {
			width: 7px;
			right: 2px;
		}
		.track[data-axis='x']:hover .thumb::after,
		.root[data-dragging='x'] .track[data-axis='x'] .thumb::after {
			height: 7px;
			bottom: 2px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.track,
		.thumb::after {
			transition: none;
		}
	}
	.viewport:focus-visible {
		outline: 2px solid var(--arc-control-on);
		outline-offset: -2px;
	}
</style>
