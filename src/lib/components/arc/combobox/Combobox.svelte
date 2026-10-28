<script module lang="ts">
	export type ComboboxOption = {
		value: string;
		label: string;
		disabled?: boolean;
		keywords?: string[];
		/** Muted text on the right of the option, e.g. a short address. Not in Arc. */
		detail?: string;
		/** Small round image before the label; the fallback's first letter stands in when there is no image. Not in Arc. */
		avatar?: { src: string | null; fallback: string; badge?: string; color?: string };
		/** Small outlined pill after the label, in the list and in the closed input. Not in Arc. */
		tag?: string;
		/** Text for the closed input when it differs from the row's label. Not in Arc. */
		selectedLabel?: string;
	};
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { animate } from 'motion';
	import { untrack, type Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { strings } from '../strings';
	import { springEasing } from '../animated-counter/motion-extras';
	import FieldMessage from '../input/FieldMessage.svelte';
	import OptionAvatar from './OptionAvatar.svelte';
	import { ease, isReducedMotion, motionTokens, presence, pressScale } from '../motion';

	type Props = Omit<HTMLInputAttributes, 'value' | 'defaultValue' | 'placeholder' | 'class'> & {
		label: string;
		options: ComboboxOption[];
		/** Label and avatar for the closed input when `value` isn't in `options`, e.g. a filtered list. Not in Arc. */
		selectedOption?: ComboboxOption;
		/** Content at the top of the popup, above the options, such as filters. Clicking it keeps the field focused. Not in Arc. */
		header?: Snippet;
		/** Content between the input and the clear button, such as a paste button. Gets a function that sets the value and closes the popup. Clicks keep the field focused. Not in Arc. */
		trailing?: Snippet<[(next: string) => void]>;
		value?: string;
		defaultValue?: string;
		onValueChange?: (value: string) => void;
		description?: string;
		placeholder?: string;
		emptyMessage?: string;
		error?: string;
		/** Typed or pasted text becomes the value, so the options are suggestions, not the only choices. Not in Arc. */
		freeform?: boolean;
		/** Keeps the label for screen readers only, for rows that show their own label beside the field. Not in Arc. */
		hideLabel?: boolean;
		/** Added to the control wrapper. */
		class?: string;
		ref?: HTMLInputElement | null;
	};

	let {
		label,
		options,
		selectedOption: selectedOptionOutsideList,
		header,
		trailing,
		defaultValue = '',
		value = $bindable(defaultValue),
		onValueChange,
		description,
		placeholder,
		emptyMessage,
		error,
		freeform = false,
		hideLabel = false,
		id,
		class: className,
		disabled,
		onfocus,
		ref = $bindable(null),
		...inputProps
	}: Props = $props();

	const CLEAR_PRESS_SCALE = 0.96;
	const POPOVER_EXIT_SECONDS = 0.13;
	const EMPTY_RISE_PX = 4;
	/** Rows are a fixed height so only the ones in view need to exist. */
	const ROW_HEIGHT_PX = 36;
	const OVERSCAN_ROWS = 6;
	const DEFAULT_VIEWPORT_PX = 300;
	const { blur, duration, spring } = motionTokens;
	const snappy = springEasing(spring.snappy);

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const listboxId = $derived(`${controlId}-listbox`);
	const hintId = $derived(description ? `${controlId}-description` : undefined);
	const errorId = $derived(error ? `${controlId}-error` : undefined);
	const describedBy = $derived([hintId, errorId].filter(Boolean).join(' ') || undefined);
	let root: HTMLDivElement;
	let open = $state(false);
	let query = $state('');
	let activeIndex = $state(-1);
	let listbox = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);
	let viewportHeight = $state(DEFAULT_VIEWPORT_PX);

	const selectedOption = $derived(
		options.find((option) => option.value === value) ??
			(selectedOptionOutsideList?.value === value ? selectedOptionOutsideList : undefined)
	);
	const filteredOptions = $derived.by(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) return options;
		return options.filter((option) =>
			[option.label, ...(option.keywords ?? [])].some((term) =>
				term.toLocaleLowerCase().includes(normalizedQuery)
			)
		);
	});
	const enabledIndices = $derived(
		filteredOptions.flatMap((option, index) => (option.disabled ? [] : [index]))
	);
	const activeOption = $derived(activeIndex >= 0 ? filteredOptions[activeIndex] : undefined);
	const selectedText = $derived(selectedOption?.selectedLabel ?? selectedOption?.label);
	const closedText = $derived(selectedText ?? (freeform ? value : ''));
	const inputValue = $derived(open ? query : closedText);
	const canClear = $derived(Boolean(selectedOption || (freeform && value)));
	// A freeform field the user is typing into has no "no matches" state: the text itself is the answer.
	// Only a header (a hint, say) keeps the popup open with nothing listed.
	const showPopover = $derived(
		open && (filteredOptions.length > 0 || !freeform || Boolean(header))
	);
	const firstRow = $derived(
		Math.min(
			Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS),
			filteredOptions.length
		)
	);
	const endRow = $derived(
		Math.min(
			filteredOptions.length,
			Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT_PX) + OVERSCAN_ROWS
		)
	);
	const visibleRows = $derived(
		filteredOptions
			.slice(firstRow, endRow)
			.map((option, offset) => ({ option, index: firstRow + offset }))
	);

	// A chosen label settles into the field: it rises in from below with a soft blur. Clearing fades the
	// placeholder in instead of snapping from the old label.
	let settledValue = untrack(() => value);
	$effect(() => {
		if (settledValue === value) return;
		settledValue = value;
		const input = ref;
		if (!input || isReducedMotion() || (value && untrack(() => open))) return;
		const settle = value
			? animate(
					input,
					{ opacity: [0, 1], y: ['0.35em', '0em'], filter: [`blur(${blur.soft}px)`, 'blur(0px)'] },
					{ duration: duration.standard, ease: motionTokens.ease.enter }
				)
			: animate(
					input,
					{ opacity: [0, 1] },
					{ duration: duration.fast, ease: motionTokens.ease.enter }
				);
		return () => settle.complete();
	});

	// A new list starts from the top with nothing highlighted.
	$effect(() => {
		void filteredOptions;
		untrack(() => {
			activeIndex = -1;
			scrollTop = 0;
			if (listbox) listbox.scrollTop = 0;
		});
	});

	$effect(() => {
		const closeOutside = (event: PointerEvent) => {
			if (root.contains(event.target as Node)) return;
			closeMenu();
		};
		document.addEventListener('pointerdown', closeOutside);
		return () => document.removeEventListener('pointerdown', closeOutside);
	});

	/** Follows the listbox height with a critically damped spring, so filtering never snaps the menu. */
	function autoHeight(frame: HTMLDivElement) {
		const inner = frame.firstElementChild as HTMLElement;
		let measured = false;
		const observer = new ResizeObserver(() => {
			const height = inner.offsetHeight;
			const instant = !measured || isReducedMotion();
			measured = true;
			animate(frame, { height }, instant ? { duration: 0 } : spring.smooth);
		});
		observer.observe(inner);
		return () => observer.disconnect();
	}

	function setValue(next: string) {
		value = next;
		onValueChange?.(next);
	}

	function choose(option: ComboboxOption) {
		if (option.disabled) return;
		setValue(option.value);
		query = '';
		open = false;
		ref?.focus();
	}

	function commitValue(next: string) {
		setValue(next.trim());
		query = '';
		open = false;
	}

	function clear(event: MouseEvent) {
		event.preventDefault();
		setValue('');
		query = '';
		open = true;
		ref?.focus();
	}

	function openMenu() {
		if (disabled) return;
		open = true;
		query = freeform && !selectedOption ? value : '';
		activeIndex = -1;
	}

	function closeMenu() {
		open = false;
		query = '';
		// A long pasted value otherwise stays scrolled to its tail once the field settles.
		if (ref) ref.scrollLeft = 0;
	}

	function scrollRowIntoView(index: number) {
		if (!listbox) return;
		const top = index * ROW_HEIGHT_PX;
		const bottom = top + ROW_HEIGHT_PX;
		if (top < listbox.scrollTop) listbox.scrollTop = top;
		else if (bottom > listbox.scrollTop + listbox.clientHeight)
			listbox.scrollTop = bottom - listbox.clientHeight;
		scrollTop = listbox.scrollTop;
	}

	function moveActive(key: string) {
		if (!enabledIndices.length) return;
		const count = enabledIndices.length;
		const position = enabledIndices.indexOf(activeIndex);
		const next = key === 'ArrowDown' ? (position + 1) % count : (position - 1 + count) % count;
		activeIndex = enabledIndices[next];
		scrollRowIntoView(activeIndex);
	}

	/** Focus leaving the whole field, not just moving between the input and the header, closes the popup. */
	function onFocusOut(event: FocusEvent) {
		if (root.contains(event.relatedTarget as Node | null)) return;
		closeMenu();
	}

	function onHeaderKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		ref?.focus();
		closeMenu();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (open) moveActive(event.key);
			else openMenu();
			return;
		}
		if (event.key === 'Enter' && open && activeOption) {
			event.preventDefault();
			choose(activeOption);
			return;
		}
		if (event.key === 'Enter' && open && freeform) {
			event.preventDefault();
			closeMenu();
			return;
		}
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			closeMenu();
		}
	}
</script>

<div bind:this={root} class="field" onfocusout={onFocusOut}>
	<label class={hideLabel ? 'sr-only' : undefined} for={controlId}>{label}</label>
	<div class={['control', open && 'open', disabled && 'disabled', className]}>
		{#if selectedOption?.avatar && !open}
			<OptionAvatar {...selectedOption.avatar} />
		{:else}
			<SearchIcon class="search-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
		{/if}
		<input
			{...inputProps}
			bind:this={ref}
			id={controlId}
			type="text"
			role="combobox"
			value={inputValue}
			placeholder={selectedText ?? placeholder ?? strings.comboboxPlaceholder()}
			{disabled}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy}
			aria-expanded={open}
			aria-controls={open ? listboxId : undefined}
			aria-autocomplete="list"
			aria-activedescendant={open && activeOption
				? `${controlId}-option-${activeOption.value}`
				: undefined}
			onfocus={(event) => {
				onfocus?.(event);
				if (!open) openMenu();
			}}
			onclick={() => !open && openMenu()}
			oninput={(event) => {
				query = event.currentTarget.value;
				open = true;
				activeIndex = -1;
				if (freeform) setValue(query.trim());
			}}
			onkeydown={onKeyDown}
		/>
		{#if selectedOption?.tag && !open}
			<span class="tag">{selectedOption.tag}</span>
		{/if}
		{#if trailing && !disabled}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="trailing" onmousedown={(event) => event.preventDefault()}>
				{@render trailing(commitValue)}
			</span>
		{/if}
		{#if canClear && !disabled}
			<button
				type="button"
				class="clear"
				aria-label={strings.comboboxClear()}
				{@attach pressScale(CLEAR_PRESS_SCALE)}
				onmousedown={(event) => event.preventDefault()}
				onclick={clear}
				in:presence={{ scale: 0.6, blur: blur.subtle, ...snappy }}
				out:presence={{
					scale: 0.6,
					blur: blur.subtle,
					duration: duration.instant,
					easing: ease.standard
				}}
			>
				<XIcon size={15} strokeWidth={1.9} aria-hidden="true" />
			</button>
		{/if}
		<span class="chevron"><ChevronDownIcon size={16} strokeWidth={1.8} aria-hidden="true" /></span>
	</div>
	{#if description}<span id={hintId} class="hint">{description}</span>{/if}
	<FieldMessage id={errorId} text={error} tone="error" alert />
	{#if showPopover}
		<div
			class="popover"
			role="presentation"
			in:presence={{ y: -6, scale: 0.97, ...snappy }}
			out:presence={{ y: -4, scale: 0.98, duration: POPOVER_EXIT_SECONDS, easing: ease.standard }}
		>
			{#if header}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="header"
					onmousedown={(event) => event.preventDefault()}
					onkeydown={onHeaderKeyDown}
				>
					{@render header()}
				</div>
			{/if}
			<div class="auto-height" {@attach autoHeight}>
				<div>
					<div
						bind:this={listbox}
						bind:clientHeight={viewportHeight}
						id={listboxId}
						class="listbox"
						role="listbox"
						aria-label="{label} options"
						onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
					>
						<div
							class="rows"
							style:padding-top="{firstRow * ROW_HEIGHT_PX}px"
							style:padding-bottom="{(filteredOptions.length - endRow) * ROW_HEIGHT_PX}px"
						>
							{#each visibleRows as { option, index } (option.value)}
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
								<div
									id="{controlId}-option-{option.value}"
									class="option"
									data-active={index === activeIndex ? 'true' : undefined}
									data-disabled={option.disabled ? 'true' : undefined}
									role="option"
									aria-selected={option.value === value}
									aria-setsize={filteredOptions.length}
									aria-posinset={index + 1}
									aria-disabled={option.disabled || undefined}
									onmousedown={(event) => event.preventDefault()}
									onmouseenter={() => !option.disabled && (activeIndex = index)}
									onclick={() => choose(option)}
								>
									<span class="main">
										{#if option.avatar}<OptionAvatar {...option.avatar} />{/if}
										<span class="label">{option.label}</span>
										{#if option.tag}<span class="tag">{option.tag}</span>{/if}
									</span>
									{#if option.detail}<span class="detail">{option.detail}</span>{/if}
									{#if option.value === value}
										<CheckIcon class="check" size={15} strokeWidth={2} aria-hidden="true" />
									{/if}
								</div>
							{/each}
						</div>
						{#if filteredOptions.length === 0 && !freeform}
							<div class="empty" role="status" in:presence={{ y: EMPTY_RISE_PX, blur: blur.soft }}>
								{emptyMessage ?? strings.comboboxEmpty()}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.field {
		position: relative;
		display: grid;
		align-content: start;
		gap: var(--arc-space-2);
		min-width: 0;
	}
	.field label {
		font-size: var(--arc-text-sm);
		font-weight: 500;
	}
	.control {
		position: relative;
		z-index: 2;
		display: flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		gap: var(--arc-space-2);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: 0 var(--arc-space-3);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			box-shadow var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.control:hover:not(.disabled) {
			border-color: var(--arc-border-strong);
			background: var(--arc-surface-muted);
		}
	}
	.control:focus-within {
		border-color: var(--arc-border-strong);
		box-shadow: 0 0 0 3px var(--arc-focus-ring);
	}
	.control:has(input[aria-invalid='true']) {
		border-color: var(--arc-danger);
	}
	.control.open {
		border-color: var(--arc-border-strong);
		background: var(--arc-surface-muted);
	}
	.control.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	/* Margin matches the 20px avatar that replaces it, so the text never shifts. */
	.control :global(.search-icon) {
		flex: 0 0 auto;
		margin: 0 2px;
		color: var(--arc-text-muted);
	}
	.control input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		padding: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
	}
	.control input:focus-visible {
		outline: none;
	}
	.control input::placeholder {
		color: var(--arc-text-muted);
	}
	.chevron {
		display: inline-flex;
		flex: 0 0 auto;
		color: var(--arc-text-muted);
		transition: transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.open .chevron {
		transform: rotate(180deg);
	}
	.clear {
		display: grid;
		width: 22px;
		height: 22px;
		flex: 0 0 auto;
		place-items: center;
		border: 0;
		border-radius: var(--arc-radius-control);
		background: transparent;
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	@media (hover: hover) and (pointer: fine) {
		.clear:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
	}
	.clear:focus-visible {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 1px;
	}
	.trailing {
		display: inline-flex;
		flex: 0 0 auto;
	}
	.tag {
		flex: 0 0 auto;
		border: 1px solid var(--arc-border-strong);
		border-radius: var(--arc-radius-control);
		padding: 1px 6px;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: 1.4;
		white-space: nowrap;
	}
	.hint {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
	}
	.popover {
		position: absolute;
		z-index: 80;
		top: calc(100% + 8px);
		right: 0;
		left: 0;
		overflow: hidden;
		transform-origin: top center;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		padding: 5px;
		background: var(--arc-surface-raised);
		color: var(--arc-foreground);
		box-shadow: var(--arc-shadow-floating);
		will-change: transform, opacity;
	}
	.header {
		padding: 3px 3px 8px;
	}
	.auto-height {
		overflow: hidden;
	}
	.listbox {
		max-height: min(300px, 40vh);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Arrow keys move the highlight often, so it changes almost instantly. */
	.option {
		display: flex;
		height: 36px;
		box-sizing: border-box;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
		border-radius: calc(var(--arc-radius-control) - 6px);
		padding: 0 12px;
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		cursor: pointer;
		outline: none;
		user-select: none;
		transition:
			background-color 80ms var(--arc-ease-standard),
			color 80ms var(--arc-ease-standard);
	}
	.option .main {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--arc-space-2);
	}
	.option .label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.option .detail {
		margin-left: auto;
		color: var(--arc-text-muted);
		font-variant-numeric: tabular-nums;
	}
	.option[data-active='true'] {
		background: var(--arc-surface-muted);
	}
	.option[data-disabled='true'] {
		opacity: 0.42;
		cursor: not-allowed;
	}
	.option :global(.check) {
		flex: 0 0 auto;
		color: var(--arc-foreground);
	}
	.empty {
		padding: var(--arc-space-3);
		color: var(--arc-text-muted);
		font-size: var(--arc-text-sm);
	}
	@media (prefers-reduced-motion: reduce) {
		.control,
		.chevron,
		.clear,
		.option {
			transition: none;
		}
	}
</style>
