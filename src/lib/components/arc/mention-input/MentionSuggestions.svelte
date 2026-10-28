<script module lang="ts">
	/** Where the popover hangs: measured from a marker at the trigger character in the mirrored text. */
	export type SuggestionAnchor = { x: number; y: number; line: number; above: boolean };
</script>

<script lang="ts">
	import HashIcon from '@lucide/svelte/icons/hash';
	import { animate, motionValue, styleEffect } from 'motion';
	import { ease, isReducedMotion, motionTokens, presence } from '../motion';
	import { initials, splitMatch, type Suggestion, type Trigger } from './mentions';
	import { GLIDE, GROW } from './springs';

	type Props = {
		trigger: Trigger;
		anchor: SuggestionAnchor;
		suggestions: Suggestion[];
		activeIndex: number;
		listId: string;
		optionId: (index: number) => string;
		onchoose: (suggestion: Suggestion) => void;
		onactivate: (index: number) => void;
	};

	let { trigger, anchor, suggestions, activeIndex, listId, optionId, onchoose, onactivate }: Props =
		$props();

	const POP_OFFSET_PX = 4;
	const AVATAR_PX = 28;
	const { duration, spring } = motionTokens;

	let body: HTMLDivElement;
	let list = $state<HTMLUListElement>();
	let highlight = $state<HTMLLIElement>();
	const panelHeight = motionValue<number | string>('auto');
	const highlightY = motionValue(0);
	const highlightHeight = motionValue(0);

	const person = $derived(trigger.kind === 'person');
	const query = $derived(trigger.query.trim());

	function panelStyles(panel: HTMLElement) {
		return styleEffect(panel, { height: panelHeight });
	}

	$effect(() => {
		if (highlight) return styleEffect(highlight, { y: highlightY, height: highlightHeight });
	});

	/** The list's highlight glides between rows. */
	$effect(() => {
		void suggestions;
		const row = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
		if (!row) return;
		if (isReducedMotion() || highlightHeight.get() === 0) {
			highlightY.jump(row.offsetTop);
			highlightHeight.jump(row.offsetHeight);
			return;
		}
		animate(highlightY, row.offsetTop, GLIDE);
		animate(highlightHeight, row.offsetHeight, GLIDE);
	});

	/** The panel springs its height as matches come and go. */
	$effect(() => {
		let sized = false;
		const fit = () => {
			const target = body.offsetHeight;
			if (!sized || isReducedMotion()) {
				panelHeight.jump(target);
				sized = true;
				return;
			}
			animate(panelHeight, target, GROW);
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(body);
		return () => observer.disconnect();
	});
</script>

<div
	{@attach panelStyles}
	class="popover"
	role="presentation"
	data-above={anchor.above || undefined}
	style:left="{anchor.x}px"
	style:top="{anchor.y}px"
	style:transform-origin={anchor.above ? '14px 100%' : '14px 0'}
	in:presence|global={{
		scale: 0.96,
		y: anchor.above ? POP_OFFSET_PX : -POP_OFFSET_PX,
		duration: spring.snappy.visualDuration
	}}
	out:presence|global={{
		scale: 0.96,
		y: anchor.above ? POP_OFFSET_PX : -POP_OFFSET_PX,
		duration: duration.exit * 0.7,
		easing: ease.standard
	}}
	onmousedown={(event) => event.preventDefault()}
>
	<div bind:this={body} class="popover-body">
		{#if suggestions.length}
			<ul
				bind:this={list}
				id={listId}
				role="listbox"
				aria-label={person ? 'People' : 'Channels'}
				class="list"
			>
				<li bind:this={highlight} aria-hidden="true" class="highlight"></li>
				{#each suggestions as suggestion, index (`${suggestion.kind}-${suggestion.item.id}`)}
					{@const label = splitMatch(suggestion.item.name, query)}
					<!-- The textarea keeps focus and drives the options with aria-activedescendant. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={optionId(index)}
						role="option"
						aria-selected={index === activeIndex}
						data-index={index}
						class="option"
						onpointermove={() => {
							if (index !== activeIndex) onactivate(index);
						}}
						onclick={() => onchoose(suggestion)}
					>
						{#if suggestion.kind === 'person'}
							<span class="avatar" aria-hidden="true">
								{#if suggestion.item.avatar}
									<img
										src={suggestion.item.avatar}
										alt=""
										width={AVATAR_PX}
										height={AVATAR_PX}
										loading="lazy"
									/>
								{:else}
									{initials(suggestion.item.name)}
								{/if}
							</span>
						{:else}
							<span class="glyph" aria-hidden="true"><HashIcon size={16} strokeWidth={1.75} /></span
							>
						{/if}
						<span class="option-text">
							<span class="option-label"
								>{label.before}{#if label.match}<mark class="match">{label.match}</mark
									>{/if}{label.after}</span
							>
							{#if suggestion.kind === 'person' && suggestion.item.role}
								<span class="option-meta">{suggestion.item.role}</span>
							{:else if suggestion.kind === 'channel' && suggestion.item.description}
								<span class="option-meta">{suggestion.item.description}</span>
							{/if}
						</span>
						{#if suggestion.kind === 'channel' && suggestion.item.members !== undefined}
							<span class="count">{suggestion.item.members}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No {person ? 'people' : 'channels'} match “{trigger.query}”</p>
		{/if}
	</div>
</div>

<style>
	.popover {
		position: absolute;
		z-index: 30;
		width: 272px;
		max-width: 100%;
		overflow: hidden;
		border: 1px solid var(--arc-border);
		border-radius: 18px;
		background: var(--arc-surface-raised);
		box-shadow: var(--arc-shadow-floating);
	}
	.popover[data-above] {
		translate: 0 -100%;
	}
	.popover-body {
		padding: 6px;
	}

	.list {
		position: relative;
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.highlight {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		border-radius: 12px;
		background: color-mix(in oklch, var(--arc-foreground) 6.5%, transparent);
		pointer-events: none;
	}

	.option {
		position: relative;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 10px;
		padding: 7px 10px 7px 8px;
		border-radius: 12px;
		cursor: pointer;
		font-size: var(--arc-text-sm);
		-webkit-tap-highlight-color: transparent;
	}

	.avatar {
		display: grid;
		width: 28px;
		height: 28px;
		flex: none;
		overflow: hidden;
		place-items: center;
		border-radius: 50%;
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: 11px;
		font-weight: 500;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.glyph {
		display: grid;
		width: 28px;
		height: 28px;
		flex: none;
		place-items: center;
		color: var(--arc-text-secondary);
	}

	.option-text {
		display: grid;
		min-width: 0;
		flex: 1;
	}
	.option-label {
		overflow: hidden;
		color: var(--arc-text-secondary);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.option[aria-selected='true'] .option-label {
		color: var(--arc-foreground);
	}
	.match {
		background: none;
		color: var(--arc-foreground);
	}
	.option-meta {
		overflow: hidden;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		flex: none;
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}

	.empty {
		margin: 0;
		padding: 10px 10px;
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
</style>
