/**
 * Every word the components show or announce, in English. Change them here, or swap this module
 * for your own i18n: each entry is a function so texts with values (counts, dates) read the same
 * way as plain ones.
 */
export const strings = {
	calendarNextMonth: () => 'Next month',
	calendarPreviousMonth: () => 'Previous month',
	calendarToday: () => 'Today',
	calendarTodayDate: ({ date }: { date: string | number }) => `Today, ${date}`,
	checkbox: () => 'Checkbox',
	close: () => 'Close',
	comboboxClear: () => 'Clear selection',
	comboboxEmpty: () => 'No matches found',
	comboboxPlaceholder: () => 'Search or select…',
	copy: () => 'Copy',
	copyAnnounceCopied: ({ label }: { label: string | number }) => `${label}: Copied`,
	copyAnnounceFailed: ({ label }: { label: string | number }) => `${label}: Could not copy`,
	copyCopied: () => 'Copied',
	copyFailed: () => 'Failed',
	dialogClose: () => 'Close dialog',
	drawerClose: () => 'Close drawer',
	holdDone: () => 'Done',
	holdHint: ({ seconds }: { seconds: string | number }) =>
		`Press and hold for ${seconds} seconds to confirm. With a keyboard, hold Space or Enter.`,
	inlineEditActivate: () => 'Activate to edit.',
	inlineEditCancel: () => 'Cancel editing',
	inlineEditFailed: ({ value, name }: { value: string | number; name: string | number }) =>
		`Couldn’t save “${value}”, so the last saved ${name} is back.`,
	inlineEditHint: () => 'Enter saves, Escape cancels.',
	inlineEditHintMultiline: () => 'Enter saves, Shift+Enter adds a line break, Escape cancels.',
	inlineEditSave: ({ name }: { name: string | number }) => `Save ${name}`,
	inlineEditSaving: ({ name }: { name: string | number }) => `Saving ${name}`,
	loadingContent: () => 'Loading content',
	numberFieldDecrease: ({ label }: { label: string | number }) => `Decrease ${label}`,
	numberFieldIncrease: ({ label }: { label: string | number }) => `Increase ${label}`,
	numberFieldMax: ({ value }: { value: string | number }) => `Max ${value}`,
	numberFieldMin: ({ value }: { value: string | number }) => `Min ${value}`,
	passwordHide: () => 'Hide password',
	passwordShow: () => 'Show password',
	selectPlaceholder: () => 'Select an option',
	sheetCollapse: () => 'Collapse sheet',
	sheetCollapsed: () => 'Sheet collapsed',
	sheetExpand: () => 'Expand sheet',
	sheetExpanded: () => 'Sheet expanded',
	sheetPercent: ({ percent }: { percent: string | number }) => `Sheet at ${percent} percent height`,
	stepperComplete: () => 'All steps complete',
	stepperLabel: () => 'Progress',
	stepperStatusComplete: () => 'Completed',
	stepperStatusError: () => 'Error',
	stepperStatusUpcoming: () => 'Not started',
	stepperStepOf: ({
		step,
		total,
		label
	}: {
		step: string | number;
		total: string | number;
		label: string | number;
	}) => `Step ${step} of ${total}: ${label}`,
	tabsScrollLeft: () => 'Scroll tabs left',
	tabsScrollRight: () => 'Scroll tabs right',
	toastDismiss: () => 'Dismiss notification',
	toastError: () => 'Error',
	toastInfo: () => 'Info',
	toastLoading: () => 'In progress',
	toastStackHotkey: ({ label }: { label: string | number }) => `${label} (Alt+T)`,
	toastStackLabel: () => 'Notifications',
	toastSuccess: () => 'Success',
	toastWarning: () => 'Warning',
	tryAgain: () => 'Try again'
};
