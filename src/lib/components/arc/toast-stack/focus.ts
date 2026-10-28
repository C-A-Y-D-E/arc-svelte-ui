/** Whether the element shows keyboard focus. Engines without :focus-visible count every focus as keyboard focus. */
export function focusVisible(element: Element) {
	try {
		return element.matches(':focus-visible');
	} catch {
		return true;
	}
}
