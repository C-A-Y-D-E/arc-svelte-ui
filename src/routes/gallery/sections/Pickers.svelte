<script lang="ts">
	import { Calendar } from '$lib/components/arc/calendar';
	import { DatePicker } from '$lib/components/arc/date-picker';
	import { DateRangePicker, type DateRange } from '$lib/components/arc/date-range-picker';
	import { TimePicker } from '$lib/components/arc/time-picker';
	import { TextMorph } from '$lib/components/arc/text-morph';
	import Demo from '../Demo.svelte';

	const PUBLISH_STATES = ['Publish', 'Publishing', 'Published'] as const;

	let deliveryDate = $state<Date>();
	let publishStep = $state(0);
	let startDate = $state<Date>();
	let meetingTime = $state('14:30');
	let reportRange = $state<DateRange | null>(null);
	const isSunday = (day: Date) => day.getDay() === 0;
</script>

<Demo title="Calendar · blocked days and Today">
	<Calendar bind:value={deliveryDate} minDate={new Date()} disabledDates={isSunday} showToday />
</Demo>

<Demo title="Date picker · form field">
	<div class="field-stage">
		<DatePicker
			label="Start date"
			bind:value={startDate}
			minDate={new Date()}
			description="The first day the plan is active."
			showToday
		/>
	</div>
</Demo>

<Demo title="Time picker · 30 minute steps">
	<div class="field-stage">
		<TimePicker label="Start time" bind:value={meetingTime} minuteStep={30} />
		<TimePicker label="Reminder" defaultValue="08:15" format="24h" minuteStep={15} />
	</div>
</Demo>

<Demo title="Date range picker · report period" wide>
	<div class="range-stage">
		<DateRangePicker
			label="Report period"
			bind:value={reportRange}
			weekStartsOn={1}
			maxDate={new Date()}
		/>
		<DateRangePicker
			label="Stay"
			months={1}
			placeholder="Check in, check out"
			minDate={new Date()}
		/>
	</div>
</Demo>

<Demo title="Text morph · status word">
	<button
		type="button"
		class="morph-button"
		onclick={() => (publishStep = (publishStep + 1) % PUBLISH_STATES.length)}
	>
		<TextMorph text={PUBLISH_STATES[publishStep]} />
	</button>
</Demo>

<style>
	.range-stage {
		display: flex;
		min-height: 480px;
		flex-wrap: wrap;
		align-items: flex-start;
		align-self: flex-start;
		gap: var(--arc-space-6);
	}
	.field-stage {
		display: grid;
		width: min(100%, 320px);
		gap: var(--arc-space-5);
		align-self: flex-start;
	}
	.morph-button {
		display: inline-flex;
		min-height: var(--arc-control-height-md);
		align-items: center;
		padding: 0 var(--arc-space-4);
		border: 1px solid var(--arc-border);
		border-radius: var(--arc-radius-control);
		background: var(--arc-surface);
		color: var(--arc-foreground);
		font: inherit;
		font-size: var(--arc-text-sm);
		font-weight: 500;
		cursor: pointer;
	}
</style>
