<script lang="ts">
	import { animate, type AnimationPlaybackControls } from 'motion';
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import FileCode2Icon from '@lucide/svelte/icons/file-code-2';
	import { CopyButton } from '../copy-button';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { highlight, normaliseLanguage } from './highlight';
	import SwapText from './SwapText.svelte';

	type Props = HTMLAttributes<HTMLElement> & {
		/** Source shown in the block and copied by the action. */
		code: string;
		/** File name displayed in the header. */
		filename?: string;
		/** Used for the header label and lightweight syntax highlighting. */
		language?: string;
		/** Collapse longer sources to this many lines, with a toggle that expands the rest in place. */
		maxLines?: number;
	};

	let { code, filename, language = 'tsx', maxLines, class: className, ...rest }: Props = $props();

	const RISE_PX = 4;
	const SAME_WIDTH_PX = 1;

	const preId = $props.id();
	const displayLanguage = $derived(normaliseLanguage(language));
	const tokens = $derived(highlight(code, displayLanguage));
	const lineCount = $derived(code.split('\n').length);
	const collapsible = $derived(maxLines != null && maxLines > 0 && lineCount > maxLines);
	const expandLabels = $derived([`Show all ${lineCount} lines`, 'Show fewer lines']);
	const name = $derived(filename ?? 'Source code');
	const reduced = $derived(isReducedMotion());

	let expanded = $state(false);
	const open = $derived(!collapsible || expanded);
	const expandLabel = $derived(expandLabels[expanded ? 1 : 0]);

	let viewport: HTMLDivElement;
	let pre: HTMLPreElement;
	let chevron: HTMLSpanElement | undefined = $state();
	let fileBox: HTMLSpanElement;
	let fileSizer: HTMLSpanElement;

	// Before the first measurement the clip height comes from CSS, so the server render is already collapsed.
	const initialHeight = untrack(() => (open ? 'auto' : 'var(--code-collapsed)'));

	let measured: { full: number; collapsed: number } | null = null;
	let heightIsMeasured = false;

	/** The source area follows its content on a spring: expanding, collapsing, and new code all resize smoothly. */
	function settleHeight(instant: boolean) {
		if (!measured) return;
		const next = open ? measured.full : measured.collapsed;
		if (instant || reduced || !heightIsMeasured) {
			viewport.style.height = `${next}px`;
			heightIsMeasured = true;
			return;
		}
		animate(viewport, { height: next }, motionTokens.spring.smooth);
	}

	function collapsedHeight(full: number) {
		if (!maxLines) return full;
		const style = getComputedStyle(pre);
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		return Math.min(full, Math.round(maxLines * parseFloat(style.lineHeight) + padding));
	}

	$effect(() => {
		void maxLines;
		const observer = new ResizeObserver(() => {
			const full = pre.offsetHeight;
			const first = !measured;
			measured = { full, collapsed: collapsedHeight(full) };
			untrack(() => settleHeight(first));
		});
		observer.observe(pre);
		return () => observer.disconnect();
	});

	$effect(() => {
		void open;
		void reduced;
		untrack(() => settleHeight(false));
	});

	$effect(() => {
		if (!chevron) return;
		const transition = reduced ? { duration: 0 } : motionTokens.spring.snappy;
		animate(chevron, { rotate: expanded ? 180 : 0 }, transition);
	});

	/** A new file name swaps in while its box follows the new width on a spring, then returns to auto so it can still truncate. */
	let settledNameWidth = 0;
	let nameMorph: AnimationPlaybackControls | undefined;

	$effect(() => {
		const observer = new ResizeObserver(() => (settledNameWidth = fileSizer.offsetWidth));
		observer.observe(fileSizer);
		return () => observer.disconnect();
	});

	$effect(() => {
		void name;
		untrack(morphNameWidth);
	});

	function morphNameWidth() {
		const to = fileSizer.offsetWidth;
		const from = nameMorph ? fileBox.offsetWidth : settledNameWidth;
		nameMorph?.stop();
		nameMorph = undefined;
		settledNameWidth = to;
		if (reduced || !from || !to || Math.abs(from - to) < SAME_WIDTH_PX) {
			fileBox.style.width = '';
			return;
		}
		const morph = animate(fileBox, { width: [from, to] }, motionTokens.spring.morph);
		nameMorph = morph;
		morph.then(() => {
			if (nameMorph !== morph) return;
			nameMorph = undefined;
			fileBox.style.width = '';
		});
	}
</script>

<section
	class={['block', className]}
	aria-label={filename ? `${filename} source code` : `${displayLanguage} source code`}
	style:--code-lines={maxLines}
	{...rest}
>
	<header class="header">
		<div class="file">
			<FileCode2Icon size={16} strokeWidth={1.75} aria-hidden="true" />
			<span bind:this={fileBox} class="swap filename">
				<span bind:this={fileSizer} class="sizer" aria-hidden="true">{name}</span>
				<span class="swap-stack" aria-hidden="true"><SwapText value={name} /></span>
				<span class="sr-only">{name}</span>
			</span>
			<span class="language">{displayLanguage}</span>
		</div>
		<CopyButton value={code} label="Copy code" />
	</header>
	<div bind:this={viewport} class="viewport" style:height={initialHeight}>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<pre
			bind:this={pre}
			id={preId}
			class="pre"
			tabindex="0"
			aria-label="Selectable source code">{#key code}<code
					class="code"
					in:presence={{ y: RISE_PX }}
					out:presence={{
						duration: motionTokens.duration.instant,
						easing: ease.standard,
						pop: true
					}}
					>{#each tokens as token (token.key)}{#if token.kind}<span class={token.kind}
								>{token.text}</span
							>{:else}{token.text}{/if}{/each}</code
				>{/key}</pre>
	</div>
	{#if collapsible}
		<button
			type="button"
			class="expand"
			aria-expanded={expanded}
			aria-controls={preId}
			onclick={() => (expanded = !expanded)}
		>
			<!-- Both labels reserve the cell, so the chevron never moves when the words change. -->
			<span class="swap" aria-hidden="true">
				{#each expandLabels as text (text)}<span class="reserve">{text}</span>{/each}
				<span class="swap-stack"><SwapText value={expandLabel} /></span>
			</span>
			<span class="sr-only">{expandLabel}</span>
			<span bind:this={chevron} class="chevron" aria-hidden="true">
				<ChevronDownIcon size={16} strokeWidth={1.8} />
			</span>
		</button>
	{/if}
</section>

<style>
	.block {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-panel);
		background: var(--arc-surface);
	}
	.header {
		display: flex;
		min-height: 52px;
		align-items: center;
		justify-content: space-between;
		gap: var(--arc-space-3);
		border-bottom: 1px solid var(--arc-border-subtle);
		padding: var(--arc-space-2) var(--arc-space-3) var(--arc-space-2) var(--arc-space-4);
		background: var(--arc-surface-raised);
	}
	.file {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--arc-space-2);
		color: var(--arc-text-secondary);
		font-family: var(--arc-font-body);
		font-size: var(--arc-text-sm);
		font-weight: 500;
		letter-spacing: var(--arc-tracking-body);
		line-height: var(--arc-leading-body);
	}
	.file > :global(svg) {
		flex: none;
		color: var(--arc-text-muted);
	}
	.filename {
		position: relative;
		min-width: 0;
		overflow: hidden;
		color: var(--arc-foreground);
	}
	/* Changing text stacks old and new words in one cell; reserve spans hold the widest label so the cell never snaps. */
	.swap {
		display: inline-grid;
		min-width: 0;
		white-space: nowrap;
	}
	.swap > span,
	.swap-stack > :global(span) {
		grid-area: 1 / 1;
		min-width: 0;
	}
	.swap-stack {
		display: grid;
		min-width: 0;
	}
	.reserve {
		visibility: hidden;
	}
	.sizer {
		position: absolute;
		top: 0;
		left: 0;
		white-space: nowrap;
		visibility: hidden;
		pointer-events: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.language {
		flex: none;
		color: var(--arc-text-muted);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
		font-size: var(--arc-text-xs);
		font-weight: 400;
	}
	.language::before {
		content: '·';
		margin-right: var(--arc-space-2);
		color: var(--arc-border-strong);
	}
	/* The source area follows its content height on a spring. Before it measures, a collapsed block clips from CSS. */
	.viewport {
		--code-collapsed: calc(
			var(--code-lines, 0) * var(--arc-text-sm) * 1.7 + var(--arc-space-5) * 2
		);
		overflow: hidden;
	}
	.pre {
		position: relative;
		overflow: auto;
		margin: 0;
		padding: var(--arc-space-5);
		color: var(--arc-foreground);
		font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace;
		font-size: var(--arc-text-sm);
		font-variant-ligatures: none;
		line-height: 1.7;
		tab-size: 2;
		white-space: pre;
	}
	/* The focused source rings the whole block: an inset ring on the scroller would be cut off by the rounded corners. */
	.pre:focus-visible {
		outline: none;
	}
	.block:has(.pre:focus-visible) {
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: 3px;
	}
	/* Block so new source can rise in with a transform; inline code ignores transforms. */
	.code {
		display: block;
	}
	.expand {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		gap: var(--arc-space-2);
		border: 0;
		border-top: 1px solid var(--arc-border-subtle);
		padding: 0 var(--arc-space-4);
		background: var(--arc-surface-raised);
		color: var(--arc-text-secondary);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		cursor: pointer;
		transition:
			color var(--arc-duration-fast) var(--arc-ease-standard),
			background-color var(--arc-duration-fast) var(--arc-ease-standard);
	}
	/* Its bottom corners follow the block, so the inset ring curves with them instead of being clipped. */
	.expand:focus-visible {
		border-radius: 0 0 calc(var(--arc-radius-panel) - 1px) calc(var(--arc-radius-panel) - 1px);
		outline: 2px solid var(--arc-focus-ring);
		outline-offset: -2px;
	}
	.chevron {
		display: grid;
		flex: none;
		place-items: center;
		color: var(--arc-text-muted);
	}
	/* Each role has contrast in both themes; color supports, but never replaces, source text. */
	.comment {
		color: var(--arc-text-muted);
		font-style: italic;
	}
	.string {
		color: oklch(46% 0.13 150);
	}
	.number {
		color: oklch(50% 0.14 55);
	}
	.keyword {
		color: oklch(48% 0.15 285);
	}
	.type {
		color: oklch(46% 0.13 230);
	}
	.function {
		color: oklch(43% 0.12 25);
	}
	.property {
		color: oklch(44% 0.12 85);
	}
	.tag {
		color: oklch(46% 0.13 230);
	}
	.punctuation {
		color: var(--arc-text-secondary);
	}
	:global(.dark) .string {
		color: oklch(77% 0.15 150);
	}
	:global(.dark) .number {
		color: oklch(80% 0.14 75);
	}
	:global(.dark) .keyword {
		color: oklch(78% 0.16 285);
	}
	:global(.dark) .type {
		color: oklch(79% 0.13 230);
	}
	:global(.dark) .function {
		color: oklch(80% 0.13 25);
	}
	:global(.dark) .property {
		color: oklch(79% 0.12 85);
	}
	:global(.dark) .tag {
		color: oklch(79% 0.13 230);
	}
	@media (hover: hover) and (pointer: fine) {
		.expand:hover {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
		.expand:hover .chevron {
			color: var(--arc-foreground);
		}
	}
	@media (max-width: 420px) {
		.header {
			padding-left: var(--arc-space-3);
		}
		.header :global(button) {
			width: var(--arc-control-height-sm);
			padding-inline: 0;
		}
		.header :global(button > span:last-of-type) {
			display: none;
		}
		.viewport {
			--code-collapsed: calc(
				var(--code-lines, 0) * var(--arc-text-xs) * 1.7 + var(--arc-space-4) * 2
			);
		}
		.pre {
			padding: var(--arc-space-4);
			font-size: var(--arc-text-xs);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.expand {
			transition: none;
		}
	}
</style>
