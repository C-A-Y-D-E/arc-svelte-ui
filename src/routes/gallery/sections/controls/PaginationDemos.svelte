<script lang="ts">
	import { Pagination } from '$lib/components/arc/pagination';
	import Demo from '../../Demo.svelte';

	const ROWS_PER_PAGE = 20;
	const TOTAL_ROWS = 236;
	const PAGE_COUNT = Math.ceil(TOTAL_ROWS / ROWS_PER_PAGE);
	const SHORT_PAGE_COUNT = 3;

	let page = $state(1);
	let shortPage = $state(2);

	const firstRow = $derived((page - 1) * ROWS_PER_PAGE + 1);
	const lastRow = $derived(Math.min(page * ROWS_PER_PAGE, TOTAL_ROWS));
</script>

<Demo title="Pagination · many pages">
	<div class="stack">
		<Pagination {page} pageCount={PAGE_COUNT} onPageChange={(next) => (page = next)} />
		<p class="output">Rows {firstRow}–{lastRow} of {TOTAL_ROWS}</p>
	</div>
</Demo>

<Demo title="Pagination · few pages">
	<div class="stack">
		<Pagination
			page={shortPage}
			pageCount={SHORT_PAGE_COUNT}
			onPageChange={(next) => (shortPage = next)}
			label="Invoices pages"
		/>
		<p class="output">Page {shortPage} of {SHORT_PAGE_COUNT}</p>
	</div>
</Demo>

<style>
	.stack {
		display: grid;
		justify-items: center;
		gap: var(--arc-space-3);
	}
	.output {
		color: var(--arc-text-muted);
		font-size: var(--arc-text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
