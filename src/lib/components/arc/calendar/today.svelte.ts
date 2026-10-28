import { addDays, dateKey, fromKey } from './dates';

/** A second past midnight, so the timer never fires a hair early and reads yesterday again. */
const MIDNIGHT_SLACK_MS = 1000;

/** Today turns over at local midnight; returning to the tab or waking the device reads it again. */
function subscribeToday(notify: () => void) {
	let timer = 0;
	const schedule = () => {
		const now = new Date();
		const untilTomorrow = addDays(now, 1).getTime() - now.getTime() + MIDNIGHT_SLACK_MS;
		timer = window.setTimeout(() => {
			notify();
			schedule();
		}, untilTomorrow);
	};
	const onVisible = () => {
		if (document.visibilityState === 'visible') notify();
	};
	schedule();
	document.addEventListener('visibilitychange', onVisible);
	window.addEventListener('focus', notify);
	return () => {
		window.clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisible);
		window.removeEventListener('focus', notify);
	};
}

/**
 * The viewer's local date. Undefined on the server and until the component mounts, so markup never depends on the
 * server clock or time zone; afterwards it follows the real date across midnight. Create it during component init.
 */
export class Today {
	#key = $state('');
	readonly current = $derived(this.#key ? fromKey(this.#key) : undefined);

	constructor() {
		$effect(() => {
			const read = () => {
				this.#key = dateKey(new Date());
			};
			read();
			return subscribeToday(read);
		});
	}
}
