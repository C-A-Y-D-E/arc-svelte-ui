<script lang="ts">
	import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import FlaskConicalIcon from '@lucide/svelte/icons/flask-conical';
	import type { Snippet } from 'svelte';
	import { SplitButton, type SplitButtonAction } from '$lib/components/arc/split-button';
	import Demo from '../../Demo.svelte';

	type DeployTarget = { label: string; icon: Snippet };

	const DEPLOY_TARGETS: DeployTarget[] = [
		{ label: 'Deploy to production', icon: rocketIcon },
		{ label: 'Deploy to staging', icon: flaskIcon },
		{ label: 'Schedule deploy', icon: calendarIcon }
	];

	let deployTarget = $state(DEPLOY_TARGETS[0]);
	let deployCount = $state(0);
	let exportFormat = $state('CSV');

	const deployActions: SplitButtonAction[] = $derived([
		...DEPLOY_TARGETS.filter((target) => target !== deployTarget).map((target) => ({
			label: target.label,
			icon: target.icon,
			onSelect: () => (deployTarget = target)
		})),
		{ label: 'Roll back', icon: undoIcon, destructive: true, onSelect: () => (deployCount = 0) }
	]);

	const exportActions: SplitButtonAction[] = [
		{ label: 'Export as CSV', icon: sheetIcon, onSelect: () => (exportFormat = 'CSV') },
		{ label: 'Export as PDF', icon: pdfIcon, onSelect: () => (exportFormat = 'PDF') },
		{ label: 'Export to Sheets', disabled: true }
	];
</script>

{#snippet rocketIcon()}<RocketIcon size={15} />{/snippet}
{#snippet flaskIcon()}<FlaskConicalIcon size={15} />{/snippet}
{#snippet calendarIcon()}<CalendarClockIcon size={15} />{/snippet}
{#snippet undoIcon()}<Undo2Icon size={15} />{/snippet}
{#snippet sheetIcon()}<FileSpreadsheetIcon size={15} />{/snippet}
{#snippet pdfIcon()}<FileTextIcon size={15} />{/snippet}

<Demo title="Split button · main action follows the menu">
	<div class="stack">
		<SplitButton
			label={deployTarget.label}
			icon={deployTarget.icon}
			actions={deployActions}
			onClick={() => (deployCount += 1)}
		/>
		<output class="readout">{deployCount} deploys</output>
	</div>
</Demo>

<Demo title="Split button · secondary">
	<SplitButton
		variant="secondary"
		label="Export {exportFormat}"
		icon={exportFormat === 'CSV' ? sheetIcon : pdfIcon}
		actions={exportActions}
	/>
</Demo>

<Demo title="Split button · disabled">
	<SplitButton label="Merge" actions={exportActions} disabled />
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-2);
	}
	.readout {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
