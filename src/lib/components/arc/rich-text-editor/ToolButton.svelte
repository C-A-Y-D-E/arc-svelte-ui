<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		pressed,
		shortcut,
		onpress,
		children
	}: {
		label: string;
		pressed: boolean;
		shortcut?: string;
		onpress: () => void;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	class="tool"
	aria-label={label}
	aria-pressed={pressed}
	title={shortcut ? `${label} (${shortcut})` : label}
	onmousedown={(event) => event.preventDefault()}
	onclick={onpress}
>
	{@render children()}
</button>
