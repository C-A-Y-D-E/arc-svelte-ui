/** Which way a reactive number last moved: 1 when it grew, -1 when it shrank. Starts at 1. */
export function changeDirection(read: () => number) {
	let previous = read();
	let direction = 1;
	const current = $derived.by(() => {
		const next = read();
		if (next !== previous) {
			direction = next > previous ? 1 : -1;
			previous = next;
		}
		return direction;
	});
	return {
		get current() {
			return current;
		}
	};
}
