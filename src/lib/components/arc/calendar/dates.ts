export const MS_PER_DAY = 864e5;
const DAYS_PER_WEEK = 7;
const WEEKS_SHOWN = 6;
const MONTHS_PER_YEAR = 12;

export const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
export const monthEnd = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
export const addDays = (date: Date, amount: number) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
export const addMonths = (date: Date, amount: number) =>
	new Date(date.getFullYear(), date.getMonth() + amount, 1);

/** Moves by whole months and keeps the day, clamped to the shorter month: January 31 plus one month is February 28. */
export function shiftMonths(date: Date, amount: number) {
	const lastDay = new Date(date.getFullYear(), date.getMonth() + amount + 1, 0).getDate();
	return new Date(date.getFullYear(), date.getMonth() + amount, Math.min(date.getDate(), lastDay));
}

export const dayDiff = (a: Date, b: Date) =>
	Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
export const monthDiff = (a: Date, b: Date) =>
	(a.getFullYear() - b.getFullYear()) * MONTHS_PER_YEAR + a.getMonth() - b.getMonth();
export const sameDay = (a?: Date | null, b?: Date | null) => Boolean(a && b && dayDiff(a, b) === 0);
export const sameMonth = (a?: Date, b?: Date) => Boolean(a && b && monthDiff(a, b) === 0);
export const isBefore = (a: Date, b?: Date) => Boolean(b && dayDiff(a, b) < 0);
export const isAfter = (a: Date, b?: Date) => Boolean(b && dayDiff(a, b) > 0);

export const dateKey = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function fromKey(key: string) {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export const monthIndex = (date: Date) => date.getFullYear() * MONTHS_PER_YEAR + date.getMonth();
export const fromIndex = (index: number) =>
	new Date(
		Math.floor(index / MONTHS_PER_YEAR),
		((index % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR,
		1
	);

/** Every month shows six weeks, so the grid keeps one height and never jumps while months change. */
export function makeWeeks(month: Date, weekStartsOn = 0) {
	const start = addDays(month, -((month.getDay() - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK));
	return Array.from({ length: WEEKS_SHOWN }, (_, week) =>
		Array.from({ length: DAYS_PER_WEEK }, (_, day) => addDays(start, week * DAYS_PER_WEEK + day))
	);
}
