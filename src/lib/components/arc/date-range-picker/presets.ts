import { addDays, addMonths, monthEnd, monthStart } from '../calendar/dates';

/** An inclusive range of whole days. */
export interface DateRange {
	start: Date;
	end: Date;
}

/** A shortcut in the preset rail. `range` receives the viewer's local today. */
export interface DateRangePreset {
	label: string;
	range: (today: Date) => DateRange;
}

const MONTHS_PER_QUARTER = 3;

export const defaultDateRangePresets: DateRangePreset[] = [
	{ label: 'Today', range: (today) => ({ start: today, end: today }) },
	{
		label: 'Yesterday',
		range: (today) => ({ start: addDays(today, -1), end: addDays(today, -1) })
	},
	{ label: 'Last 7 days', range: (today) => ({ start: addDays(today, -6), end: today }) },
	{ label: 'Last 30 days', range: (today) => ({ start: addDays(today, -29), end: today }) },
	{ label: 'This month', range: (today) => ({ start: monthStart(today), end: today }) },
	{
		label: 'Last month',
		range: (today) => ({ start: addMonths(today, -1), end: monthEnd(addMonths(today, -1)) })
	},
	{
		label: 'This quarter',
		range: (today) => {
			const quarterMonth = Math.floor(today.getMonth() / MONTHS_PER_QUARTER) * MONTHS_PER_QUARTER;
			return { start: new Date(today.getFullYear(), quarterMonth, 1), end: today };
		}
	},
	{
		label: 'Year to date',
		range: (today) => ({ start: new Date(today.getFullYear(), 0, 1), end: today })
	}
];
