<script lang="ts">
	import { CopyButton } from '$lib/components/arc/copy-button';
	import Demo from '../../Demo.svelte';

	const API_KEY = 'sk_live_51H8c2eZvKYlo2C0x9';
	const INSTALL_COMMAND = 'npx shadcn@latest add @uiarc/copy-button';
</script>

<Demo title="Copy button · label">
	<CopyButton value={INSTALL_COMMAND} />
	<CopyButton value={INSTALL_COMMAND} label="Copy command" variant="plain" />
	<CopyButton value={INSTALL_COMMAND} disabled />
</Demo>

<Demo title="Copy button · icon only">
	<div class="key-row">
		<code>{API_KEY}</code>
		<CopyButton value={API_KEY} label="Copy key" iconOnly />
	</div>
</Demo>

<style>
	.key-row {
		display: flex;
		align-items: center;
		gap: var(--arc-space-3);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		padding: var(--arc-space-1) var(--arc-space-1) var(--arc-space-1) var(--arc-space-3);
		color: var(--arc-text-secondary);
		font-size: var(--arc-text-sm);
	}
</style>
