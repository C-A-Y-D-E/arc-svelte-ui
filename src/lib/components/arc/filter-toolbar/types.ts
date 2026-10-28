import type { Snippet } from 'svelte';

export interface FilterChip {
	id: string;
	label: string;
	value?: string;
}

/** One value a field can take. `hint` sits at the end of the row, for example a count. */
export interface FilterOption {
	value: string;
	label?: string;
	hint?: string | number;
	icon?: Snippet;
}

export interface FilterField {
	id: string;
	label: string;
	icon?: Snippet;
	options: (string | FilterOption)[];
}

/** The trigger edge the panel lines up with. It flips or shifts when the viewport, or a clipping ancestor, has no room. */
export type FilterMenuAlign = 'start' | 'end';

/** Adds an Add filter trigger that morphs into a two step field and value menu. */
export interface AddFilterConfig {
	fields: FilterField[];
	onAdd: (filter: FilterChip, field: FilterField) => void;
	label?: string;
	/** Accessible name of the back button on the value step. */
	backLabel?: string;
	align?: FilterMenuAlign;
}

/** A menu row: a field that drills into its values, or a value that can be checked. */
export interface MenuRow {
	key: string;
	label: string;
	icon?: Snippet;
	drill?: boolean;
	/** A field's applied value, shown at the end of its row. */
	current?: string;
	hint?: string | number;
	checked?: boolean;
}
