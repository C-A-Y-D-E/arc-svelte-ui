<script module lang="ts">
	type Phase = 'closed' | 'open' | 'closing';
	type FocusRequest = 'first' | 'last' | 'checked' | 'panel' | { key: string };
	type Room = { left: number; top: number; right: number; bottom: number };

	/** The room the panel may use: the viewport, narrowed on each axis by any ancestor that clips that axis, so a panel
	 *  inside a scrolling or clipped container flips and shifts within what is actually visible. */
	function roomFor(node: HTMLElement): Room {
		const room = {
			left: 0,
			top: 0,
			right: document.documentElement.clientWidth,
			bottom: window.innerHeight
		};
		for (
			let parent = node.parentElement;
			parent && parent !== document.body;
			parent = parent.parentElement
		) {
			const style = getComputedStyle(parent);
			if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
			const box = parent.getBoundingClientRect();
			if (style.overflowX !== 'visible') {
				room.left = Math.max(room.left, box.left);
				room.right = Math.min(room.right, box.right);
			}
			if (style.overflowY !== 'visible') {
				room.top = Math.max(room.top, box.top);
				room.bottom = Math.min(room.bottom, box.bottom);
			}
		}
		return room;
	}

	function pickRow(items: HTMLElement[], request: Exclude<FocusRequest, 'panel'>) {
		if (request === 'first') return items[0];
		if (request === 'last') return items.at(-1);
		if (request === 'checked')
			return items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0];
		return items.find((item) => item.dataset.row === request.key) ?? items[0];
	}

	const toOption = (entry: string | FilterOption): FilterOption =>
		typeof entry === 'string' ? { value: entry } : entry;
	const optionText = (entry: FilterOption) => entry.label ?? entry.value;
	const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
	const blur = (px: number) => `blur(${px}px)`;
</script>

<script lang="ts">
	import { animate, motionValue, styleEffect, transformValue, type MotionValue } from 'motion';
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { isReducedMotion, motionTokens } from '../motion';
	import MenuList from './MenuList.svelte';
	import { backIn, backOut, stepIn, stepOut, textIn, textOut } from './transitions';
	import type { FilterChip, FilterField, FilterMenuAlign, FilterOption, MenuRow } from './types';

	type Props = HTMLAttributes<HTMLDivElement> & {
		fields: FilterField[];
		/** Receives a chip whose id is the field id, so a second pick for a field replaces the first. */
		onSelect: (filter: FilterChip, field: FilterField) => void;
		/** Applied filters. Each field shows its current value and the value step marks it. */
		active?: FilterChip[];
		label?: string;
		/** Accessible name of the back button on the value step. */
		backLabel?: string;
		align?: FilterMenuAlign;
	};

	let {
		fields,
		onSelect,
		active = [],
		label = 'Add filter',
		backLabel = 'Back to fields',
		align = 'end',
		class: className,
		...rest
	}: Props = $props();

	const VIEWPORT_GUTTER_PX = 16;
	/** The surface's 1px border on both sides wraps the panel. */
	const SURFACE_BORDER_PX = 2;
	const FACE_FADE_END = 0.35;
	const FACE_SHRINK = 0.04;
	const CONTENT_FADE_START = 0.4;
	const CONTENT_FADE_SPAN = 0.5;
	const CONTENT_GROWTH = 0.04;
	const CONTENT_RISE_PX = 6;
	const FIELDS_STEP = 'fields';
	const still = { duration: 0 };

	const uid = $props.id();
	const panelId = `${uid}panel`;
	const titleId = `${uid}title`;

	let root: HTMLDivElement;
	let trigger: HTMLButtonElement;
	let face: HTMLSpanElement;
	let surface: HTMLDivElement;
	let panel: HTMLDivElement;
	let content: HTMLDivElement;
	let run = 0;

	let phase = $state<Phase>('closed');
	let fieldId = $state<string | null>(null);
	let direction = $state(1);
	let up = $state(false);
	// The content scales up from the trigger's center, so it reads as growing out of the button.
	let origin = $state('100% 0');
	let focusRequest = $state<FocusRequest | null>(null);

	// The surface is the button's own rounded rectangle. At rest it fills the trigger; while open it springs to the panel.
	const width = motionValue<number | string>('100%');
	const height = motionValue<number | string>('100%');
	const left = motionValue(0);
	const target = motionValue(0);
	// The panel content stays put at its final position while the surface edge travels across it.
	const panelX = transformValue(() => target.get() - left.get());
	// How far the shape has grown from the button (0) to the panel (1). The label and the content read it, so they
	// reveal with the morph, never ahead of the growing edge, and reverse with it when a close interrupts an open.
	const from = motionValue(0);
	const to = motionValue(0);
	const rise = motionValue(CONTENT_RISE_PX);
	const progress = transformValue(() => {
		const now = width.get();
		const start = from.get();
		const end = to.get();
		if (typeof now !== 'number') return 0;
		return end > start ? clamp01((now - start) / (end - start)) : 1;
	});
	const faceOut = transformValue(() => clamp01(progress.get() / FACE_FADE_END));
	const contentIn = transformValue(() =>
		clamp01((progress.get() - CONTENT_FADE_START) / CONTENT_FADE_SPAN)
	);
	// Reduced motion jumps the shape, so progress goes 0 to 1 in one frame and these in-between values never paint.
	const faceOpacity = transformValue(() => 1 - faceOut.get());
	const faceScale = transformValue(() => 1 - faceOut.get() * FACE_SHRINK);
	const faceFilter = transformValue(() =>
		faceOut.get() ? blur(faceOut.get() * motionTokens.blur.subtle) : 'none'
	);
	const contentScale = transformValue(() => 1 - CONTENT_GROWTH + contentIn.get() * CONTENT_GROWTH);
	const contentY = transformValue(() => (1 - contentIn.get()) * rise.get());
	const contentFilter = transformValue(() =>
		contentIn.get() === 1 ? 'none' : blur((1 - contentIn.get()) * motionTokens.blur.soft)
	);

	const reduced = $derived(isReducedMotion());
	const open = $derived(phase === 'open');
	const field = $derived(fields.find((entry) => entry.id === fieldId) ?? null);
	const stepKey = $derived(field?.id ?? FIELDS_STEP);

	const currentValue = (entry: FilterField) =>
		active.find((filter) => filter.id === entry.id)?.value;
	const fieldRows: MenuRow[] = $derived(
		fields.map((entry) => ({
			key: entry.id,
			label: entry.label,
			icon: entry.icon,
			drill: true,
			current: currentValue(entry)
		}))
	);
	const valueRows: MenuRow[] = $derived.by(() => {
		if (!field) return [];
		const applied = currentValue(field);
		return field.options.map(toOption).map((entry) => ({
			key: entry.value,
			label: optionText(entry),
			icon: entry.icon,
			hint: entry.hint,
			checked: applied === optionText(entry)
		}));
	});

	$effect(() => {
		const stops = [
			styleEffect(surface, { left, width, height }),
			styleEffect(panel, { x: panelX }),
			styleEffect(face, { opacity: faceOpacity, scale: faceScale, filter: faceFilter }),
			styleEffect(content, {
				opacity: contentIn,
				scale: contentScale,
				y: contentY,
				filter: contentFilter
			})
		];
		return () => stops.forEach((stop) => stop());
	});

	function panelOffset(rect: DOMRect, panelWidth: number, room: Room) {
		const min = room.left + VIEWPORT_GUTTER_PX - rect.left;
		const max = room.right - VIEWPORT_GUTTER_PX - rect.left - panelWidth;
		const end = rect.width - panelWidth;
		const fitsEnd = end >= min;
		const fitsStart = 0 <= max;
		const x = align === 'end' ? (fitsEnd || !fitsStart ? end : 0) : fitsStart || !fitsEnd ? 0 : end;
		return Math.round(Math.min(Math.max(x, min), Math.max(min, max)));
	}

	function opensUp(rect: DOMRect, panelHeight: number, room: Room) {
		const below = room.bottom - rect.top;
		const above = rect.bottom - room.top;
		return below < panelHeight + VIEWPORT_GUTTER_PX && above > below;
	}

	function openMenu(focus: FocusRequest) {
		const rect = trigger.getBoundingClientRect();
		const panelWidth = panel.offsetWidth + SURFACE_BORDER_PX;
		const panelHeight = panel.offsetHeight + SURFACE_BORDER_PX;
		const room = roomFor(root);
		const x = panelOffset(rect, panelWidth, room);
		const nextUp = opensUp(rect, panelHeight, room);
		if (phase === 'closed') {
			width.jump(rect.width);
			height.jump(rect.height);
			left.jump(0);
		}
		target.jump(x);
		from.jump(rect.width);
		to.jump(panelWidth);
		rise.jump(nextUp ? -CONTENT_RISE_PX : CONTENT_RISE_PX);
		run += 1;
		phase = 'open';
		focusRequest = focus;
		up = nextUp;
		fieldId = null;
		direction = -1;
		origin = `${Math.round(rect.width / 2 - x)}px ${nextUp ? '100%' : '0'}`;
		const transition = reduced ? still : motionTokens.spring.morph;
		animate(left, x, transition);
		animate(width as MotionValue<number>, panelWidth, transition);
		animate(height as MotionValue<number>, panelHeight, transition);
	}

	function closeMenu(restore: false | 'keyboard' | 'pointer') {
		if (phase !== 'open') return;
		phase = 'closing';
		const token = (run += 1);
		// Focus returns to the trigger; its ring shows only when the menu was closed from the keyboard.
		if (restore) trigger.focus({ preventScroll: true, focusVisible: restore === 'keyboard' });
		// Closing is quicker than opening: the snappy spring lands the shape back on the button.
		const transition = reduced ? still : motionTokens.spring.snappy;
		const rect = trigger.getBoundingClientRect();
		animate(left, 0, transition);
		animate(height as MotionValue<number>, rect.height, transition);
		animate(width as MotionValue<number>, rect.width, {
			...transition,
			onComplete: () => {
				if (token !== run) return;
				width.jump('100%');
				height.jump('100%');
				phase = 'closed';
				fieldId = null;
			}
		});
	}

	// A new step changes the panel height; the surface follows on the smooth spring instead of snapping.
	$effect(() => {
		const observer = new ResizeObserver(() => {
			if (phase !== 'open') return;
			const transition = isReducedMotion() ? still : motionTokens.spring.smooth;
			animate(height as MotionValue<number>, panel.offsetHeight + SURFACE_BORDER_PX, transition);
		});
		observer.observe(panel);
		return () => observer.disconnect();
	});

	// Focus moves into the panel once it is interactive: an item for keyboard users, the dialog itself for the pointer.
	$effect(() => {
		const request = focusRequest;
		if (!request || phase !== 'open') return;
		focusRequest = null;
		if (request === 'panel') focusPanel();
		else pickRow(currentRows(), request)?.focus({ preventScroll: true });
	});

	$effect(() => {
		if (phase !== 'open') return;
		const onPointerDown = (event: PointerEvent) => {
			const hit = event.target as Element | null;
			if (hit && root.contains(hit)) return;
			closeMenu(false);
			// A press on empty space hands focus back to the trigger; a press on another control keeps its own focus.
			if (hit?.closest?.('button, a[href], input, select, textarea, [tabindex], [contenteditable]'))
				return;
			window.setTimeout(() => {
				const focused = document.activeElement;
				if (!focused || focused === document.body || root.contains(focused))
					trigger.focus({ preventScroll: true, focusVisible: false });
			}, 0);
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		return () => document.removeEventListener('pointerdown', onPointerDown, true);
	});

	const currentRows = () =>
		Array.from(panel.querySelectorAll<HTMLElement>('[data-current] [data-row]'));

	function focusPanel() {
		panel.focus({ preventScroll: true });
	}

	function goBack(keyboard: boolean) {
		if (!field) return;
		focusRequest = keyboard ? { key: field.id } : 'panel';
		direction = -1;
		fieldId = null;
	}

	function chooseField(row: MenuRow, keyboard: boolean) {
		focusRequest = keyboard ? 'checked' : 'panel';
		direction = 1;
		fieldId = row.key;
	}

	function chooseValue(row: MenuRow, keyboard: boolean) {
		if (!field) return;
		onSelect({ id: field.id, label: field.label, value: row.label }, field);
		closeMenu(keyboard ? 'keyboard' : 'pointer');
	}

	function onRootKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || phase !== 'open') return;
		event.preventDefault();
		event.stopPropagation();
		closeMenu('keyboard');
	}

	function onRootFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (phase === 'open' && next && !root.contains(next)) closeMenu(false);
	}

	function onTriggerClick(event: MouseEvent) {
		if (phase !== 'open') openMenu(event.detail === 0 ? 'first' : 'panel');
	}

	function onTriggerKeyDown(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		event.preventDefault();
		openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
	}

	function onPanelKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			pickRow(currentRows(), event.key === 'ArrowDown' ? 'first' : 'last')?.focus({
				preventScroll: true
			});
		}
		if (event.key === 'ArrowLeft' && field) {
			event.preventDefault();
			goBack(true);
		}
	}
</script>

<!-- An Add filter button that grows into its own menu: pick a field, then a value. The shape springs between the
     button and the panel, and the panel renders in place, so keep its ancestors free of overflow clipping. -->
<div
	{...rest}
	bind:this={root}
	class={['menu', className]}
	data-state={phase}
	data-y={up ? 'up' : 'down'}
	role="presentation"
	onkeydown={onRootKeyDown}
	onfocusout={onRootFocusOut}
>
	<button
		bind:this={trigger}
		type="button"
		class="trigger"
		data-filter-trigger=""
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={panelId}
		tabindex={open ? -1 : undefined}
		onclick={onTriggerClick}
		onkeydown={onTriggerKeyDown}
	>
		<span bind:this={face} class="face">
			<PlusIcon size={15} strokeWidth={1.8} aria-hidden="true" />{label}
		</span>
	</button>
	<div bind:this={surface} class="surface">
		<div
			bind:this={panel}
			id={panelId}
			class="panel"
			role="dialog"
			aria-labelledby={titleId}
			tabindex="-1"
			inert={!open}
			onkeydown={onPanelKeyDown}
		>
			<div bind:this={content} style:transform-origin={origin}>
				<div class="head">
					{#if field}
						<button
							type="button"
							class="back"
							aria-label={backLabel}
							onclick={(event) => goBack(event.detail === 0)}
							in:backIn
							out:backOut
						>
							<ChevronLeftIcon size={16} strokeWidth={1.8} aria-hidden="true" />
						</button>
					{/if}
					<span class="title" id={titleId}>
						{#key stepKey}
							<span class="title-text" in:textIn out:textOut={{ pop: true }}
								>{field ? field.label : label}</span
							>
						{/key}
					</span>
				</div>
				<div class="stage">
					{#key stepKey}
						<div class="step" data-current="" in:stepIn={{ direction }} out:stepOut={{ direction }}>
							{#if field}
								<MenuList
									rows={valueRows}
									labelledBy={titleId}
									radio
									onChoose={chooseValue}
									onBack={goBack}
									onLeave={focusPanel}
								/>
							{:else}
								<MenuList
									rows={fieldRows}
									labelledBy={titleId}
									onChoose={chooseField}
									onLeave={focusPanel}
								/>
							{/if}
						</div>
					{/key}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Add filter: the trigger is transparent and the surface behind it is the button's rounded rectangle.
	   Opening springs that same surface to the panel size, so the button itself becomes the menu. */
	.menu {
		position: relative;
		display: inline-flex;
		flex: none;
		isolation: isolate;
	}
	.menu:not([data-state='closed']) {
		z-index: 30;
	}
	.trigger {
		position: relative;
		z-index: 1;
		display: inline-flex;
		min-height: var(--arc-control-height-sm);
		align-items: center;
		padding: 0 var(--arc-space-3);
		border: 1px solid transparent;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		letter-spacing: var(--arc-tracking-body);
		white-space: nowrap;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	.trigger:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	.menu[data-state='open'] .trigger {
		pointer-events: none;
	}
	.face {
		display: inline-flex;
		align-items: center;
		gap: var(--arc-space-2);
	}
	.face :global(svg) {
		flex: none;
	}
	/* clip, not hidden: focus and scripts cannot scroll the panel inside the growing shape. */
	.surface {
		position: absolute;
		top: 0;
		z-index: 0;
		box-sizing: border-box;
		overflow: clip;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			border-radius var(--arc-duration-spring) var(--arc-ease-spring),
			box-shadow var(--arc-duration-standard) var(--arc-ease-standard);
	}
	.menu[data-y='up'] .surface {
		top: auto;
		bottom: 0;
	}
	.menu[data-state='open'] .surface {
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
	}
	/* The trigger anchors the panel, so a press answers in color and never scales. */
	.menu[data-state='closed'] .trigger:active + .surface {
		background: color-mix(in oklch, var(--arc-surface-muted), var(--arc-border) 55%);
	}
	@media (hover: hover) and (pointer: fine) {
		.menu[data-state='closed'] .trigger:hover + .surface {
			background: var(--arc-surface-muted);
			box-shadow: var(--arc-shadow-resting);
		}
	}
	.panel {
		position: absolute;
		top: 0;
		left: 0;
		width: min(var(--filter-menu-width, 16rem), calc(100vw - var(--arc-space-8)));
		padding: 2px 6px 6px;
		outline: none;
	}
	.menu[data-y='up'] .panel {
		top: auto;
		bottom: 0;
	}
	.menu[data-state='closed'] .panel {
		visibility: hidden;
	}
	.head {
		display: flex;
		height: 32px;
		align-items: center;
		padding: 0 var(--arc-space-2) 0 10px;
	}
	.menu[data-y='up'] .head {
		margin-top: 4px;
	}
	.back {
		display: grid;
		width: 28px;
		height: 28px;
		flex: none;
		place-items: center;
		margin-right: 2px;
		margin-left: -6px;
		padding: 0;
		border: 0;
		border-radius: var(--arc-radius-pill);
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	.back:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 1px;
	}
	.back:active {
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	.title {
		position: relative;
		display: flex;
		min-width: 0;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		white-space: nowrap;
	}
	.title-text {
		display: block;
	}
	.stage {
		position: relative;
		margin-top: 2px;
	}
	.step {
		width: 100%;
	}
	@media (hover: hover) and (pointer: fine) {
		.back:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.surface,
		.back {
			transition: none;
		}
	}
</style>
