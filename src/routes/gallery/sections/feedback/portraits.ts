/** Inline placeholder portraits, so avatar demos need no network or static assets. */
function portrait(background: string, skin: string, hair: string) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
		<rect width="64" height="64" fill="${background}"/>
		<circle cx="32" cy="27" r="13" fill="${hair}"/>
		<circle cx="32" cy="29" r="11" fill="${skin}"/>
		<path d="M10 64c2-13 11-20 22-20s20 7 22 20z" fill="${hair}"/>
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PORTRAITS = {
	maya: portrait('#c7d7f5', '#e8b996', '#3b2a20'),
	jonas: portrait('#d5ecd4', '#f1cfb0', '#a0612d'),
	priya: portrait('#f4d9c6', '#a86f4c', '#1f1a17'),
	leo: portrait('#e5d6f2', '#d39b74', '#5b4636')
};
