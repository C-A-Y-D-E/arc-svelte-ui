<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import {
		MentionInput,
		serializeMentions,
		type MentionInputHandle,
		type MentionValue
	} from '$lib/components/arc/mention-input';
	import {
		RichTextEditor,
		type HistoryState,
		type RichTextEditorHandle,
		type RichTextValue
	} from '$lib/components/arc/rich-text-editor';
	import Demo from '../Demo.svelte';

	const RELEASE_NOTES = '# Release notes\n\n- Faster search\n- New **dark** theme';

	let post = $state<RichTextValue | null>(null);
	let published = $state('');

	let undoable: RichTextEditorHandle | undefined = $state();
	let draftHtml = $state('<p>Draft</p>');
	let history = $state<HistoryState>({ canUndo: false, canRedo: false });

	const people = [
		{ id: 'u1', name: 'Maya Chen', role: 'Design lead' },
		{ id: 'u2', name: 'Theo Park', role: 'Engineer' },
		{ id: 'u3', name: 'Priya Nair', role: 'Product manager' },
		{ id: 'u4', name: 'Jonas Weber', role: 'Engineer' }
	];
	const channels = [
		{ id: 'c1', name: 'launch', description: 'Release planning', members: 14 },
		{ id: 'c2', name: 'design-crit', description: 'Weekly critique', members: 9 }
	];

	let comment = $state<MentionValue>({ text: '', mentions: [] });
	let posted = $state('');
	let composer: MentionInputHandle | undefined = $state();
</script>

<Demo title="Rich text editor · markdown shortcuts" wide>
	<div class="stack">
		<RichTextEditor
			aria-label="Post body"
			placeholder="Write your update"
			defaultMarkdown={RELEASE_NOTES}
			onChange={(value) => (post = value)}
		/>
		<div class="row">
			<Button
				size="sm"
				disabled={!post || post.empty}
				onclick={() => (published = post?.markdown ?? '')}
			>
				Publish
			</Button>
		</div>
		{#if published}<pre class="output">{published}</pre>{/if}
	</div>
</Demo>

<Demo title="Rich text editor · controlled HTML with custom undo" wide>
	<div class="stack">
		<div class="row">
			<Button
				variant="secondary"
				size="sm"
				disabled={!history.canUndo}
				onclick={() => undoable?.undo()}>Undo</Button
			>
			<Button
				variant="secondary"
				size="sm"
				disabled={!history.canRedo}
				onclick={() => undoable?.redo()}>Redo</Button
			>
		</div>
		<RichTextEditor
			bind:this={undoable}
			value={draftHtml}
			onChange={(value) => (draftHtml = value.html)}
			onHistoryChange={(state) => (history = state)}
		/>
		<code class="output">{draftHtml}</code>
	</div>
</Demo>

<Demo title="Mention input · people and channels">
	<div class="stack">
		<MentionInput
			aria-label="Comment"
			placeholder="Write a comment, @ to mention"
			{people}
			{channels}
			bind:value={comment}
			submitOnEnter
			onSubmit={(next) => {
				posted = serializeMentions(next);
				comment = { text: '', mentions: [] };
			}}
		/>
		{#if posted}<code class="output">{posted}</code>{/if}
	</div>
</Demo>

<Demo title="Mention input · mention button and rows">
	<div class="stack">
		<MentionInput
			bind:this={composer}
			aria-label="Task description"
			placeholder="Describe the task"
			{people}
			minRows={3}
			maxRows={5}
		/>
		<div class="row">
			<Button variant="secondary" size="sm" onclick={() => composer?.openSuggestions('person')}
				>@ Mention</Button
			>
		</div>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		gap: var(--arc-space-3);
	}
	.row {
		display: flex;
		gap: var(--arc-space-2);
	}
	.output {
		overflow-x: auto;
		margin: 0;
		padding: var(--arc-space-3);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface-muted);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-xs);
		white-space: pre-wrap;
	}
</style>
