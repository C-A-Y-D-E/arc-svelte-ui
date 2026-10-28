<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { animate, motionValue, styleEffect } from 'motion';
	import { flushSync } from 'svelte';
	import { motionTransition } from '../input';
	import { isReducedMotion, motionTokens } from '../motion';
	import { groupBy, rank, type ExpandingSearchItem, type SearchGroup } from './search';
	import SearchListbox from './SearchListbox.svelte';

	/**
	 * A search that waits as an icon button until it is needed. Use it in headers and toolbars where a full field would crowd the layout.
	 * The button morphs into the field, results unfold beneath it, and Escape, choosing a result, or leaving the field empty folds it back into the icon.
	 * Place it in the space the field may grow into; it fills that space's width and keeps the button on the `anchor` edge.
	 */
	type Props = {
		/** Names the button, the field, and the results, such as "Search projects and docs". */
		label: string;
		items: ExpandingSearchItem[];
		/** Shown before anything is typed, such as recent searches. */
		suggestions?: ExpandingSearchItem[];
		suggestionsLabel?: string;
		placeholder?: string;
		onSelect?: (item: ExpandingSearchItem) => void;
		onExpandedChange?: (expanded: boolean) => void;
		/** The widest the field grows. It never grows past its container. */
		expandedWidth?: number;
		maxResults?: number;
		/** The edge the button sits on; the field grows away from it. */
		anchor?: 'start' | 'end';
		/** A short tip under the empty state. */
		emptyHint?: string;
		class?: string;
	};

	let {
		label,
		items,
		suggestions = [],
		suggestionsLabel = 'Recent',
		placeholder,
		onSelect,
		onExpandedChange,
		expandedWidth = 360,
		maxResults = 6,
		anchor = 'end',
		emptyHint = 'Try a shorter word or check the spelling.',
		class: className
	}: Props = $props();

	type Mode = 'suggestions' | 'results' | 'empty';

	const FALLBACK_SIZE = 44;
	const PLACEHOLDER_DELAY_S = 0.08;
	const PLACEHOLDER_IN_S = 0.2;
	const PLACEHOLDER_OUT_S = 0.08;
	const REDUCED_IN_S = 0.15;
	const REDUCED_OUT_S = 0.1;
	const PANEL_OUT_S = 0.12;
	const VIEW_OUT_S = 0.1;
	const CLEAR_SCALE = 0.6;
	const { blur, duration, spring } = motionTokens;

	const id = $props.id();
	let root: HTMLDivElement;
	let shell: HTMLDivElement;
	let input: HTMLInputElement;
	let trigger: HTMLButtonElement;

	let expanded = $state(false);
	let focused = $state(false);
	let query = $state('');
	let active = $state(-1);
	/** Mirrors `expanded` without waiting for a render, so a second click in the same frame is ignored. */
	let open = false;
	let movedByKeyboard = false;
	let size = { collapsed: FALLBACK_SIZE, expanded: expandedWidth };
	const width = motionValue(FALLBACK_SIZE);

	const trimmed = $derived(query.trim());
	const results = $derived(trimmed ? rank(items, trimmed, maxResults) : []);
	const mode: Mode | null = $derived(
		!trimmed ? (suggestions.length ? 'suggestions' : null) : results.length ? 'results' : 'empty'
	);
	const groups: SearchGroup[] = $derived(
		mode === 'suggestions'
			? [{ name: suggestionsLabel, items: suggestions }]
			: mode === 'results'
				? groupBy(results, items)
				: []
	);
	const flat = $derived(groups.flatMap((group) => group.items));
	const activeIndex = $derived(Math.min(active, flat.length - 1));
	const activeItem = $derived(flat[activeIndex]);
	const listboxId = $derived(`${id}-${mode}-listbox`);
	const panelOpen = $derived(expanded && focused && mode !== null);
	const announcement = $derived(announce());

	function optionId(item: ExpandingSearchItem) {
		return `${id}-${mode}-${item.id}`;
	}

	function announce() {
		if (!panelOpen) return '';
		if (mode === 'empty') return `No results for ${trimmed}`;
		const count = flat.length;
		if (mode === 'results') return `${count} ${count === 1 ? 'result' : 'results'}`;
		return `${count} ${suggestionsLabel.toLocaleLowerCase()} ${count === 1 ? 'item' : 'items'}`;
	}

	// The corner radius follows the width: a circle while collapsed, the control radius once open. It rides the same spring, so the two never drift apart.
	function syncShape(value: number) {
		const { collapsed, expanded: full } = size;
		const progress = (value - collapsed) / Math.max(1, full - collapsed);
		shell.style.setProperty('--es-open', String(Math.min(1, Math.max(0, progress))));
	}

	$effect(() => {
		const stopStyles = styleEffect(shell, { width });
		const stopShape = width.on('change', syncShape);
		return () => {
			stopStyles();
			stopShape();
		};
	});

	// The field grows to its own limit or its container, whichever is smaller. Container resizes are followed at once; they are not the person's action.
	$effect(() => {
		const limit = expandedWidth;
		const measure = () => {
			const collapsed = shell.offsetHeight || FALLBACK_SIZE;
			const full = Math.max(collapsed, Math.min(limit, root.clientWidth));
			size = { collapsed, expanded: full };
			root.style.setProperty('--es-width', `${full}px`);
			const goal = open ? full : collapsed;
			if (width.isAnimating()) animate(width, goal, spring.morph);
			else width.jump(goal);
			syncShape(width.get());
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		return () => observer.disconnect();
	});

	let placeholderPlaced = false;
	// The placeholder waits for the shape to start moving, then fades in; on close it leaves first.
	$effect(() => {
		const reduced = isReducedMotion();
		const timing = expanded
			? {
					duration: reduced ? REDUCED_IN_S : PLACEHOLDER_IN_S,
					ease: motionTokens.ease.enter,
					delay: reduced ? 0 : PLACEHOLDER_DELAY_S
				}
			: { duration: reduced ? REDUCED_OUT_S : PLACEHOLDER_OUT_S, ease: motionTokens.ease.standard };
		animate(input, { opacity: expanded ? 1 : 0 }, placeholderPlaced ? timing : { duration: 0 });
		placeholderPlaced = true;
	});

	/** Opening grows on the morph spring with a hint of overshoot; folding back settles without one, so the circle never dips below its own size. */
	function morphTo(goal: number) {
		if (isReducedMotion()) return width.jump(goal);
		animate(width, goal, goal >= width.get() ? spring.morph : spring.smooth);
	}

	/** Focus moves inside the same click, so touch keyboards open; the field is inert until this flush makes it focusable. */
	function expand() {
		if (open) return;
		open = true;
		expanded = true;
		focused = true;
		flushSync();
		input.focus({ preventScroll: true });
		morphTo(size.expanded);
		onExpandedChange?.(true);
	}

	function collapse(returnFocus: boolean) {
		if (!open) return;
		open = false;
		expanded = false;
		focused = false;
		query = '';
		active = -1;
		flushSync();
		if (returnFocus) trigger.focus({ preventScroll: true });
		morphTo(size.collapsed);
		onExpandedChange?.(false);
	}

	function choose(item: ExpandingSearchItem) {
		collapse(true);
		onSelect?.(item);
	}

	function hover(index: number) {
		movedByKeyboard = false;
		active = index;
	}

	function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
		active = event.currentTarget.value.trim() ? 0 : -1;
		movedByKeyboard = false;
	}

	/** Switching windows keeps the search as it was; the field refocuses on return. */
	function handleBlur() {
		if (!document.hasFocus()) return;
		focused = false;
		if (open && !input.value.trim()) collapse(false);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			return collapse(true);
		}
		if (!panelOpen || !flat.length) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			moveActive(event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter' && activeItem) {
			event.preventDefault();
			choose(activeItem);
		}
	}

	function moveActive(step: 1 | -1) {
		movedByKeyboard = true;
		const count = flat.length;
		active = activeIndex < 0 ? (step > 0 ? 0 : count - 1) : (activeIndex + step + count) % count;
	}

	function clearQuery() {
		query = '';
		active = -1;
		input.focus({ preventScroll: true });
	}

	function showClear(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: [0, 1] }
				: {
						opacity: [0, 1],
						scale: [CLEAR_SCALE, 1],
						filter: [`blur(${blur.subtle}px)`, 'blur(0px)']
					},
			transition: reduced
				? { duration: REDUCED_IN_S }
				: {
						...spring.snappy,
						opacity: { duration: duration.fast },
						filter: { duration: duration.fast }
					}
		});
	}

	function hideClear(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: 0 }
				: { opacity: 0, scale: CLEAR_SCALE, filter: `blur(${blur.subtle}px)` },
			transition: {
				duration: reduced ? REDUCED_OUT_S : duration.instant,
				ease: motionTokens.ease.standard
			}
		});
	}

	/** The panel shares the field's width value, so on first open it unfolds out of the field; afterwards only its height follows the content. */
	function unfoldPanel(panel: HTMLElement) {
		const body = panel.firstElementChild as HTMLElement;
		// Reduced motion skips the unfold: the panel is its content's height from the first frame and only fades.
		if (isReducedMotion()) return styleEffect(panel, { width });
		const height = motionValue(0);
		const stopStyles = styleEffect(panel, { width, height });
		const observer = new ResizeObserver(() => {
			animate(height, body.offsetHeight + panel.offsetHeight - panel.clientHeight, spring.smooth);
		});
		observer.observe(body);
		return () => {
			observer.disconnect();
			stopStyles();
		};
	}

	function showPanel(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: [0, 1] },
			transition: {
				duration: isReducedMotion() ? REDUCED_IN_S : duration.fast,
				ease: motionTokens.ease.enter
			}
		});
	}

	function hidePanel(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0 },
			transition: {
				duration: isReducedMotion() ? REDUCED_OUT_S : PANEL_OUT_S,
				ease: motionTokens.ease.standard
			}
		});
	}

	function showView(node: Element) {
		const reduced = isReducedMotion();
		return motionTransition(node, {
			keyframes: reduced
				? { opacity: [0, 1] }
				: { opacity: [0, 1], filter: [`blur(${blur.subtle}px)`, 'blur(0px)'] },
			transition: {
				duration: reduced ? REDUCED_IN_S : duration.fast,
				ease: motionTokens.ease.enter
			}
		});
	}

	function hideView(node: Element) {
		return motionTransition(node, {
			keyframes: { opacity: 0 },
			transition: { duration: VIEW_OUT_S, ease: motionTokens.ease.standard },
			pop: true
		});
	}
</script>

<div bind:this={root} class={['root', className]} data-anchor={anchor}>
	<div bind:this={shell} class="shell" data-expanded={expanded || undefined}>
		<button
			bind:this={trigger}
			type="button"
			class="trigger"
			aria-label={label}
			hidden={expanded}
			onclick={expand}
		></button>
		<SearchIcon class="es-icon" size={18} strokeWidth={1.75} aria-hidden="true" />
		<input
			bind:this={input}
			bind:value={query}
			class="input"
			type="text"
			role="combobox"
			inert={!expanded}
			placeholder={placeholder ?? label}
			aria-label={label}
			aria-expanded={panelOpen}
			aria-controls={panelOpen && mode !== 'empty' ? listboxId : undefined}
			aria-autocomplete="list"
			aria-activedescendant={panelOpen && activeItem ? optionId(activeItem) : undefined}
			autocomplete="off"
			autocorrect="off"
			spellcheck={false}
			enterkeyhint="search"
			oninput={handleInput}
			onfocus={() => (focused = true)}
			onblur={handleBlur}
			onkeydown={handleKeydown}
		/>
		{#if expanded && query}
			<button
				type="button"
				tabindex={-1}
				class="clear"
				aria-label="Clear search"
				onmousedown={(event) => event.preventDefault()}
				onclick={clearQuery}
				in:showClear
				out:hideClear
			>
				<XIcon size={16} strokeWidth={1.75} aria-hidden="true" />
			</button>
		{/if}
	</div>
	{#if panelOpen}
		<div class="panel" {@attach unfoldPanel} in:showPanel out:hidePanel>
			<div class="body">
				{#key mode}
					<div class="view" in:showView out:hideView>
						{#if mode === 'empty'}
							<div class="empty">
								<p class="empty-title">No results for “{trimmed}”</p>
								<p class="empty-hint">{emptyHint}</p>
							</div>
						{:else}
							<SearchListbox
								id={listboxId}
								label={mode === 'suggestions' ? suggestionsLabel : `Results for ${trimmed}`}
								{groups}
								query={mode === 'results' ? trimmed : ''}
								{activeIndex}
								{optionId}
								movedByKeyboard={() => movedByKeyboard}
								onHover={hover}
								onChoose={choose}
							/>
						{/if}
					</div>
				{/key}
			</div>
		</div>
	{/if}
	<span class="sr-only" role="status" aria-live="polite">{announcement}</span>
</div>

<style>
	/* The root is the lane the field may grow into. Only the shell and the panel take pointer events, so an idle lane never blocks what sits under it. */
	.root {
		position: relative;
		width: 100%;
		min-width: var(--arc-control-height-md);
		height: var(--arc-control-height-md);
		pointer-events: none;
	}
	/* One shell is both the button and the field. Its width rides a spring and its radius follows the width, from a circle to the control radius. */
	.shell {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: calc(
			var(--arc-control-height-md) / 2 -
				(var(--arc-control-height-md) / 2 - var(--arc-radius-control)) * var(--es-open, 0)
		);
		background: var(--arc-surface);
		color: var(--arc-text-secondary);
		pointer-events: auto;
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.root[data-anchor='start'] .shell {
		right: auto;
		left: 0;
	}
	.shell[data-expanded] {
		border-color: var(--arc-border-strong);
		color: var(--arc-foreground);
	}
	.shell:has(> .trigger:focus-visible),
	.shell:has(> .input:focus) {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
		color: var(--arc-foreground);
	}
	@media (hover: hover) and (pointer: fine) {
		.shell:not([data-expanded]):hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
		.shell[data-expanded]:not(:has(> .input:focus)):hover {
			border-color: var(--arc-border-strong);
		}
		.clear:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	/* A compact press while it is still a button; the morph takes over on release. */
	.shell:not([data-expanded]):has(> .trigger:active) {
		transform: scale(0.97);
		transition-duration:
			var(--arc-duration-fast), var(--arc-duration-fast), var(--arc-duration-fast),
			var(--arc-duration-standard), 110ms;
	}
	.trigger {
		position: absolute;
		z-index: 1;
		inset: 0;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: inherit;
		background: transparent;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.trigger:focus-visible {
		outline: none;
	}
	/* The glass sits at the leading edge, so it is centered in the circle and rides that edge to its place in the open field. */
	.shell :global(.es-icon) {
		position: absolute;
		top: calc(50% - 9px);
		left: calc(var(--arc-control-height-md) / 2 - 10px);
		pointer-events: none;
	}
	.input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0 40px 0 38px;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		letter-spacing: var(--arc-tracking-body);
		text-overflow: ellipsis;
		outline: none;
		opacity: 0;
	}
	.input:focus-visible {
		outline: none;
	}
	.input::placeholder {
		color: var(--arc-text-muted);
		opacity: 1;
	}
	.input[inert] {
		pointer-events: none;
	}
	.clear {
		position: absolute;
		z-index: 1;
		top: calc(50% - 14px);
		right: 7px;
		display: grid;
		width: 28px;
		height: 28px;
		place-items: center;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
		-webkit-tap-highlight-color: transparent;
	}
	/* A floating layer: its width is the field's, so it unfolds from the field on first open; its content keeps the final width and rides the leading edge. */
	.panel {
		position: absolute;
		z-index: 40;
		top: calc(100% + 8px);
		right: 0;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
		pointer-events: auto;
	}
	.root[data-anchor='start'] .panel {
		right: auto;
		left: 0;
	}
	.body {
		position: relative;
		width: calc(var(--es-width, 360px) - 2px);
		max-height: min(22rem, 60vh);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px;
		scrollbar-width: thin;
	}
	.view {
		position: relative;
	}
	.empty {
		display: grid;
		gap: 2px;
		padding: 12px 12px 14px;
	}
	.empty-title {
		margin: 0;
		overflow-wrap: anywhere;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
	}
	.empty-hint {
		margin: 0;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@media (prefers-reduced-motion: reduce) {
		.shell,
		.clear {
			transition: none;
		}
		.shell:not([data-expanded]):has(> .trigger:active) {
			transform: none;
		}
	}
</style>
