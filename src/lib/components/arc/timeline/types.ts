import type { Snippet } from 'svelte';

export type TimelineTone = 'neutral' | 'success' | 'danger';

export interface TimelineEvent {
	id: string;
	/** When it happened, as an ISO string or epoch milliseconds. */
	at: string | number;
	/** Who did it, shown first in the foreground color. */
	actor?: string;
	/** What happened, completing the actor: "merged Checkout redesign into main". */
	title: string;
	/** Short context under the title, such as a pull request or a build. */
	meta?: string;
	/** Revealed in place when the row is expanded. Rows without detail are not interactive. */
	detail?: Snippet;
	/** Portrait for an event by a person. */
	avatar?: string;
	/** Icon for a system event, used when there is no avatar. */
	icon?: Snippet;
	/** Status of a system event. Always say the outcome in the title too, so it never rests on color. */
	tone?: TimelineTone;
}

export type TimelineRow = TimelineEvent & { time: number; day: string };
