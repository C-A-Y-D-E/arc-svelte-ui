export interface PasswordRule {
	id: string;
	label: string;
	test: (password: string) => boolean;
	/** Characters still missing. Shown as a rolling count beside the rule while it is unmet. */
	remaining?: (password: string) => number;
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrengthResult {
	level: StrengthLevel;
	label: string;
	met: string[];
}

const MIN_LENGTH = 12;
/** Below this length a password stays at the first step, however varied its characters are. */
const SHORT = 8;
const STEPS = 4;
export const TOO_SHORT = 'Too short';
const LEVELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

const count = (password: string) => Array.from(password).length;

export const defaultPasswordRules: PasswordRule[] = [
	{
		id: 'length',
		label: `At least ${MIN_LENGTH} characters`,
		test: (password) => count(password) >= MIN_LENGTH,
		remaining: (password) => Math.max(0, MIN_LENGTH - count(password))
	},
	{
		id: 'case',
		label: 'Upper and lowercase letters',
		test: (password) => /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password)
	},
	{ id: 'number', label: 'At least one number', test: (password) => /\p{N}/u.test(password) },
	{
		id: 'symbol',
		label: 'At least one symbol',
		test: (password) => /[^\p{L}\p{N}\s]/u.test(password)
	}
];

/** Scores a password on the device: one step per share of rules met, capped at the first step while it is shorter than eight characters. */
export function estimateStrength(
	password: string,
	rules: PasswordRule[] = defaultPasswordRules
): PasswordStrengthResult {
	if (!password) return { level: 0, label: '', met: [] };
	const met = rules.filter((rule) => rule.test(password)).map((rule) => rule.id);
	if (count(password) < SHORT) return { level: 1, label: TOO_SHORT, met };
	const share = met.length / Math.max(rules.length, 1);
	const level = Math.min(STEPS, Math.max(1, Math.round(share * STEPS))) as StrengthLevel;
	return { level, label: LEVELS[level], met };
}
