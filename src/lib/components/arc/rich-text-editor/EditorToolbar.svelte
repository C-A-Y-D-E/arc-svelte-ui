<script module lang="ts">
	import type { TextBlockType } from './blocks';

	export type Formats = {
		bold: boolean;
		italic: boolean;
		strike: boolean;
		code: boolean;
		link: string | null;
		block: string;
	};
	export type Mark = 'bold' | 'italic' | 'strike' | 'code';
	export type ToolbarAnchor = { x: number; y: number; below: boolean };
	export type ToolbarFaceName = 'format' | 'link';
	export type ToolbarBlock = Extract<TextBlockType, 'h1' | 'h2' | 'blockquote'>;
</script>

<script lang="ts">
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CodeIcon from '@lucide/svelte/icons/code';
	import Heading1Icon from '@lucide/svelte/icons/heading-1';
	import Heading2Icon from '@lucide/svelte/icons/heading-2';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import LinkIcon from '@lucide/svelte/icons/link';
	import QuoteIcon from '@lucide/svelte/icons/quote';
	import StrikethroughIcon from '@lucide/svelte/icons/strikethrough';
	import UnlinkIcon from '@lucide/svelte/icons/unlink';
	import { animate, motionValue, styleEffect } from 'motion';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { GLIDE, MORPH } from './springs';
	import ToolbarFace from './ToolbarFace.svelte';
	import ToolButton from './ToolButton.svelte';

	type Props = {
		id: string;
		anchor: ToolbarAnchor;
		face: ToolbarFaceName;
		formats: Formats;
		container: HTMLElement;
		linkDraft: string;
		linkInput?: HTMLInputElement | null;
		onmark: (mark: Mark) => void;
		onblock: (type: ToolbarBlock) => void;
		onopenlink: () => void;
		onapplylink: (remove?: boolean) => void;
		oncloselink: () => void;
		onreturn: () => void;
	};

	let {
		id,
		anchor,
		face,
		formats,
		container,
		linkDraft = $bindable(),
		linkInput = $bindable(null),
		onmark,
		onblock,
		onopenlink,
		onapplylink,
		oncloselink,
		onreturn
	}: Props = $props();

	const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;
	/** Stands in for the face width until the first face has measured itself. */
	const FALLBACK_WIDTH = 280;
	const EDGE_INSET = 4;

	const { duration } = motionTokens;
	const left = motionValue(0);
	const top = motionValue(0);
	const width = motionValue(0);
	const height = motionValue(0);
	let toolbar: HTMLDivElement;
	let placed = false;
	let faceWidth = $state(0);

	const direction = $derived(face === 'link' ? 1 : -1);

	$effect(() => styleEffect(toolbar, { left, top, width, height }));

	/** One surface whose size springs between faces; only the current face may resize it. */
	function sizeTo(name: ToolbarFaceName, nextWidth: number, nextHeight: number) {
		if (name !== face) return;
		faceWidth = nextWidth;
		if (!placed || isReducedMotion() || width.get() === 0) {
			width.jump(nextWidth);
			height.jump(nextHeight);
			return;
		}
		animate(width, nextWidth, MORPH);
		animate(height, nextHeight, MORPH);
	}

	/** The position glides with the selection, clamped inside the editor. */
	$effect(() => {
		const half = (faceWidth || FALLBACK_WIDTH) / 2;
		const x = Math.max(
			half + EDGE_INSET,
			Math.min(anchor.x, container.offsetWidth - half - EDGE_INSET)
		);
		if (!placed || isReducedMotion()) {
			left.jump(x);
			top.jump(anchor.y);
			placed = true;
			return;
		}
		animate(left, x, GLIDE);
		animate(top, anchor.y, GLIDE);
	});

	function onkeydown(event: KeyboardEvent & { currentTarget: HTMLDivElement }) {
		if (face !== 'format') return;
		const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const step = event.key === 'ArrowRight' ? 1 : -1;
			buttons[(at + step + buttons.length) % buttons.length]?.focus();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			onreturn();
		}
	}

	function onLinkKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		oncloselink();
	}
</script>

<!-- Focus lives on the buttons; the toolbar only routes arrow keys between them. -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
	bind:this={toolbar}
	data-toolbar={id}
	role="toolbar"
	aria-label="Formatting"
	class="toolbar"
	data-below={anchor.below || undefined}
	style:transform-origin={anchor.below ? '50% 0' : '50% 100%'}
	in:presence|global={{
		scale: 0.94,
		y: anchor.below ? -4 : 4,
		duration: motionTokens.spring.snappy.visualDuration
	}}
	out:presence|global={{ scale: 0.96, duration: duration.exit * 0.8, easing: ease.standard }}
	{onkeydown}
>
	{#if face === 'format'}
		<ToolbarFace {direction} onsize={(w, h) => sizeTo('format', w, h)}>
			<div class="row">
				<ToolButton
					label="Bold"
					pressed={formats.bold}
					shortcut="⌘B"
					onpress={() => onmark('bold')}
				>
					<BoldIcon {...ICON} />
				</ToolButton>
				<ToolButton
					label="Italic"
					pressed={formats.italic}
					shortcut="⌘I"
					onpress={() => onmark('italic')}
				>
					<ItalicIcon {...ICON} />
				</ToolButton>
				<ToolButton
					label="Strikethrough"
					pressed={formats.strike}
					shortcut="⌘⇧X"
					onpress={() => onmark('strike')}
				>
					<StrikethroughIcon {...ICON} />
				</ToolButton>
				<ToolButton
					label="Inline code"
					pressed={formats.code}
					shortcut="⌘E"
					onpress={() => onmark('code')}
				>
					<CodeIcon {...ICON} />
				</ToolButton>
				<ToolButton
					label={formats.link ? 'Edit link' : 'Link'}
					pressed={!!formats.link}
					shortcut="⌘K"
					onpress={onopenlink}
				>
					<LinkIcon {...ICON} />
				</ToolButton>
				<span class="block-tools">
					<span class="divider" aria-hidden="true"></span>
					<ToolButton
						label="Heading 1"
						pressed={formats.block === 'h1'}
						onpress={() => onblock('h1')}
					>
						<Heading1Icon {...ICON} />
					</ToolButton>
					<ToolButton
						label="Heading 2"
						pressed={formats.block === 'h2'}
						onpress={() => onblock('h2')}
					>
						<Heading2Icon {...ICON} />
					</ToolButton>
					<ToolButton
						label="Quote"
						pressed={formats.block === 'blockquote'}
						onpress={() => onblock('blockquote')}
					>
						<QuoteIcon {...ICON} />
					</ToolButton>
				</span>
			</div>
		</ToolbarFace>
	{:else}
		<ToolbarFace {direction} onsize={(w, h) => sizeTo('link', w, h)}>
			<form
				class="link-row"
				onsubmit={(event) => {
					event.preventDefault();
					onapplylink();
				}}
			>
				<button type="button" class="tool" aria-label="Back to formatting" onclick={oncloselink}>
					<ArrowLeftIcon {...ICON} />
				</button>
				<input
					bind:this={linkInput}
					bind:value={linkDraft}
					class="link-input"
					onkeydown={onLinkKeydown}
					placeholder="Paste or type a link"
					aria-label="Link address"
					inputmode="url"
					autocomplete="off"
					spellcheck={false}
				/>
				{#if formats.link}
					<button
						type="button"
						class="tool"
						aria-label="Remove link"
						onclick={() => onapplylink(true)}
					>
						<UnlinkIcon {...ICON} />
					</button>
				{/if}
				<button
					type="submit"
					class="apply"
					aria-label="Apply link"
					data-ready={!!linkDraft.trim() || undefined}
				>
					<CheckIcon size={16} strokeWidth={2} aria-hidden="true" />
				</button>
			</form>
		</ToolbarFace>
	{/if}
</div>

<style>
	.toolbar {
		position: absolute;
		z-index: 40;
		translate: -50% -100%;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: 16px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
	}
	.toolbar[data-below] {
		translate: -50% 0;
	}

	.row,
	.link-row {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
	}
	.block-tools {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	/* Narrow editors keep the inline marks; block types stay one slash away. */
	@container (max-width: 330px) {
		.block-tools {
			display: none;
		}
	}
	.divider {
		width: 1px;
		height: 18px;
		margin: 0 4px;
		background: var(--arc-border);
	}

	.toolbar :global(.tool) {
		display: grid;
		width: 32px;
		height: 32px;
		flex: none;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 11px;
		background: transparent;
		color: var(--arc-text-secondary);
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		transition:
			background-color var(--arc-duration-fast) var(--arc-ease-standard),
			color var(--arc-duration-fast) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.toolbar :global(.tool:active) {
		transform: scale(0.92);
	}
	.toolbar :global(.tool[aria-pressed='true']) {
		background: var(--arc-accent-subtle);
		color: var(--arc-accent-strong);
	}
	.toolbar :global(.tool:focus-visible) {
		background: var(--arc-surface-muted);
		color: var(--arc-foreground);
	}
	@media (hover: hover) and (pointer: fine) {
		.toolbar :global(.tool:hover) {
			background: var(--arc-surface-muted);
			color: var(--arc-foreground);
		}
		.toolbar :global(.tool[aria-pressed='true']:hover) {
			background: var(--arc-accent-subtle);
			color: var(--arc-accent-strong);
		}
	}

	.link-input {
		width: min(15rem, 60vw);
		height: 32px;
		min-width: 0;
		padding: 0 8px;
		border: 0;
		background: transparent;
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		outline: none;
	}
	.link-input::placeholder {
		color: var(--arc-text-muted);
	}
	.apply {
		display: grid;
		width: 32px;
		height: 32px;
		flex: none;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 11px;
		background: var(--arc-surface-muted);
		color: var(--arc-text-muted);
		cursor: pointer;
		transition:
			background-color var(--arc-duration-standard) var(--arc-ease-standard),
			color var(--arc-duration-standard) var(--arc-ease-standard),
			transform var(--arc-duration-instant) var(--arc-ease-standard);
	}
	.apply[data-ready] {
		background: var(--arc-accent);
		color: var(--arc-accent-foreground);
	}
	.apply:active {
		transform: scale(0.92);
	}
</style>
