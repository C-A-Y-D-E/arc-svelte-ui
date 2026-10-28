<script lang="ts">
	import { Button } from '$lib/components/arc/button';
	import { CodeBlock } from '$lib/components/arc/code-block';
	import Demo from '../../Demo.svelte';

	const HELLO = `export function hello() {
  return "world";
}`;

	const SOURCES = [
		{
			filename: 'use-debounce.ts',
			language: 'ts',
			code: `import { useEffect, useState } from "react";

// Returns the value once it has stopped changing for the given delay.
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export const DEFAULT_DELAY = 300;
const enabled = true;
const retries = null;
const label = 'debounce';
const attempts = 3;
const limit = 12;
const factor = 1.5;
const message = \`waiting \${delay}ms\`;`
		},
		{
			filename: 'package.json',
			language: 'json',
			code: `{
  "name": "arc-svelte",
  "private": true,
  "version": "0.4.2",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build"
  }
}`
		}
	];

	let sourceIndex = $state(0);
	const source = $derived(SOURCES[sourceIndex]);
</script>

<Demo title="Code block · basic" wide>
	<CodeBlock code={HELLO} filename="hello.ts" language="ts" maxLines={12} />
</Demo>

<Demo title="Code block · collapsed and swapping files" wide>
	<div class="stack">
		<Button
			variant="secondary"
			size="sm"
			onclick={() => (sourceIndex = (sourceIndex + 1) % SOURCES.length)}
		>
			Show {SOURCES[(sourceIndex + 1) % SOURCES.length].filename}
		</Button>
		<CodeBlock
			code={source.code}
			filename={source.filename}
			language={source.language}
			maxLines={8}
		/>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		width: 100%;
		justify-items: start;
		gap: var(--arc-space-3);
	}
</style>
