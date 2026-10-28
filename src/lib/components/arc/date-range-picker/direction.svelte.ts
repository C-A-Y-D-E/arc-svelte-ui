import { untrack } from 'svelte';

/** Remembers which way a value moved in time, so labels roll in time's direction: 1 for later or new, -1 for earlier. */
export class TimeDirection {
	current = $state(1);
	#last: number | null;

	constructor(readTime: () => number | null) {
		this.#last = untrack(readTime);
		$effect.pre(() => {
			const next = readTime();
			if (next === this.#last) return;
			const later = next === null || this.#last === null || next >= this.#last;
			this.current = later ? 1 : -1;
			this.#last = next;
		});
	}
}
