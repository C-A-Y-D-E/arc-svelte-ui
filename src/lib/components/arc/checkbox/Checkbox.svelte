<script module lang="ts">
	export type CheckedState = boolean | 'indeterminate';
</script>

<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { strings } from '../strings';
	import { isReducedMotion, motionTokens } from '../motion';

	type Props = Omit<
		CheckboxPrimitive.RootProps,
		'checked' | 'indeterminate' | 'onCheckedChange' | 'onIndeterminateChange' | 'child' | 'children'
	> & {
		label?: string;
		description?: string;
		checked?: CheckedState;
		defaultChecked?: CheckedState;
		onCheckedChange?: (checked: CheckedState) => void;
	};

	let {
		label,
		description,
		id,
		class: className,
		defaultChecked = false,
		checked = $bindable(defaultChecked),
		onCheckedChange,
		ref = $bindable(null),
		...rest
	}: Props = $props();

	/** Both marks share three points, so the check morphs into the dash and back instead of swapping. */
	const CHECK_PATH = 'M4.25 9.25 L7.25 12.25 L13.75 5.75';
	const DASH_PATH = 'M4.75 9 L9 9 L13.25 9';
	const HIDDEN_FILL_SCALE = 0.6;
	const { duration, spring } = motionTokens;

	const generatedId = $props.id();
	const controlId = $derived(id ?? generatedId);
	const descriptionId = $derived(description ? `${controlId}-description` : undefined);
	const isOn = (state: CheckedState) => state !== false;
	const pathFor = (state: CheckedState) => (state === 'indeterminate' ? DASH_PATH : CHECK_PATH);

	const initial = untrack(() => checked);
	let fill: HTMLSpanElement;
	let mark: SVGPathElement;
	let settled = false;

	$effect(() => {
		const on = isOn(checked);
		const fade = {
			duration: on ? duration.instant : duration.fast,
			ease: motionTokens.ease.standard
		};
		const instant = !settled || isReducedMotion();
		settled = true;
		animate(
			fill,
			{ opacity: on ? 1 : 0, scale: on ? 1 : HIDDEN_FILL_SCALE },
			instant ? { duration: 0 } : { scale: spring.snappy, opacity: fade }
		);
		animate(
			mark,
			{ d: pathFor(checked), pathLength: on ? 1 : 0, opacity: on ? 1 : 0 },
			instant ? { duration: 0 } : { d: spring.morph, pathLength: spring.snappy, opacity: fade }
		);
	});

	function change(next: boolean) {
		checked = next;
		onCheckedChange?.(next);
	}
</script>

<div class="field">
	<CheckboxPrimitive.Root
		bind:ref
		id={controlId}
		checked={checked === true}
		indeterminate={checked === 'indeterminate'}
		onCheckedChange={change}
		aria-describedby={descriptionId}
		aria-label={rest['aria-label'] ?? (label ? undefined : strings.checkbox())}
		{...rest}
	>
		{#snippet child({ props })}
			<button {...props} class={['box', className]}>
				<span class="visual" aria-hidden="true">
					<span
						bind:this={fill}
						class="fill"
						style:opacity={isOn(initial) ? 1 : 0}
						style:transform="scale({isOn(initial) ? 1 : HIDDEN_FILL_SCALE})"
					></span>
					<svg class="mark" viewBox="0 0 18 18" fill="none" focusable="false">
						<path
							bind:this={mark}
							d={pathFor(initial)}
							opacity={isOn(initial) ? 1 : 0}
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
			</button>
		{/snippet}
	</CheckboxPrimitive.Root>
	{#if label || description}
		<div class="copy">
			{#if label}<label for={controlId}>{label}</label>{/if}
			{#if description}<span id={descriptionId}>{description}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.field {
		display: inline-flex;
		align-items: flex-start;
		gap: 0;
		min-width: 0;
	}
	.box {
		position: relative;
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: var(--arc-control-height-md);
		height: var(--arc-control-height-md);
		border: 0;
		border-radius: var(--arc-radius-control);
		padding: 0;
		background: transparent;
		color: var(--arc-control-glyph);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}
	/* The square is the only part that reacts to a press, so the hit area and label never move. */
	.visual {
		position: relative;
		display: block;
		width: 18px;
		height: 18px;
		border: 1px solid var(--arc-border-strong);
		border-radius: 5px;
		background: var(--arc-surface);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-spring) var(--arc-ease-spring);
	}
	.fill {
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		background: var(--arc-control-on);
	}
	.mark {
		position: absolute;
		inset: -1px;
		width: 18px;
		height: 18px;
		overflow: visible;
	}
	.box[data-state='checked'] .visual,
	.box[data-state='indeterminate'] .visual {
		border-color: var(--arc-control-on);
	}
	@media (hover: hover) and (pointer: fine) {
		.box[data-state='unchecked']:hover:not(:disabled) .visual {
			border-color: var(--arc-text-muted);
		}
	}
	.box:active:not(:disabled) .visual {
		transform: scale(0.95);
		transition:
			border-color var(--arc-duration-fast) var(--arc-ease-standard),
			transform 110ms var(--arc-ease-standard);
	}
	/* The ring hugs the square, not the 44px hit area, so it never runs into the label beside it. */
	.box:focus-visible {
		outline: none;
	}
	.box:focus-visible .visual {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 2px;
		box-shadow:
			0 0 0 2px var(--arc-background),
			0 0 0 4px var(--arc-focus-ring);
	}
	.box:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	/* The label's first line centers on the square: (44px box - 19.6px line) / 2. */
	.copy {
		display: grid;
		gap: 2px;
		min-width: 0;
		margin-left: 1px;
		padding-top: calc((var(--arc-control-height-md) - var(--arc-text-sm) * 1.4) / 2);
	}
	.copy label {
		color: var(--arc-foreground);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		line-height: var(--arc-leading-body);
		cursor: pointer;
	}
	.copy span {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		line-height: var(--arc-leading-body);
	}
	@media (prefers-reduced-motion: reduce) {
		.visual,
		.box:active:not(:disabled) .visual {
			transition: none;
			transform: none;
		}
	}
</style>
