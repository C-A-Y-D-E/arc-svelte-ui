/**
 * Builds the shadcn-svelte registry: one static/r/<name>.json per component folder in
 * src/lib/components/arc, plus core.json with what every component shares (the foundation and
 * theme CSS, the motion helpers, the strings and the locale). Each file installs at the same path
 * in the user's project (src/lib/components/arc/...), so the components' relative imports hold.
 * An item lists the npm packages its files import and the other components it uses.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SOURCE = join(ROOT, 'src/lib/components/arc');
const OUTPUT = join(ROOT, 'static/r');
const INSTALL_ROOT = '~/src/lib/components/arc';
const ITEM_SCHEMA = 'https://shadcn-svelte.com/schema/registry-item.json';
const REGISTRY_SCHEMA = 'https://shadcn-svelte.com/schema/registry.json';
const CORE = 'core';
const PACKAGES = ['bits-ui', 'motion', '@lucide/svelte'];
const AUTHOR = 'Arc (uiarc.dev), ported to Svelte';

/** Every file under `dir`, recursively. @param {string} dir @returns {string[]} */
function filesIn(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? filesIn(path) : [path];
	});
}

/** "date-range-picker" → "Date Range Picker". @param {string} name */
function titleOf(name) {
	return name.replace(/(^|-)(\w)/g, (_, dash, letter) => (dash ? ' ' : '') + letter.toUpperCase());
}

/** @param {string} path */
function fileEntry(path) {
	return {
		path: relative(ROOT, path),
		type: 'registry:file',
		target: `${INSTALL_ROOT}/${relative(SOURCE, path)}`,
		content: readFileSync(path, 'utf8')
	};
}

/** The npm packages and sibling components a component's files import. @param {string[]} files @param {string} self */
function importsOf(files, self) {
	const packages = new Set();
	const components = new Set();
	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		for (const [, spec] of source.matchAll(/from\s+'([^']+)'/g)) {
			const npm = PACKAGES.find((name) => spec === name || spec.startsWith(`${name}/`));
			if (npm) packages.add(npm);
			const sibling = spec.match(/^\.\.\/([a-z0-9-]+)(\/|$)/)?.[1];
			if (sibling && sibling !== self && statSync(join(SOURCE, sibling), { throwIfNoEntry: false })?.isDirectory()) {
				components.add(sibling);
			}
		}
	}
	return { packages: [...packages].sort(), components: [...components].sort() };
}

/** @param {{ name: string, files: string[], registryDependencies: string[], dependencies: string[] }} item */
function itemJson({ name, files, registryDependencies, dependencies }) {
	return {
		$schema: ITEM_SCHEMA,
		name,
		title: titleOf(name),
		type: 'registry:ui',
		author: AUTHOR,
		dependencies,
		registryDependencies,
		files: files.map(fileEntry)
	};
}

const coreFiles = readdirSync(SOURCE)
	.map((name) => join(SOURCE, name))
	.filter((path) => statSync(path).isFile());
const components = readdirSync(SOURCE)
	.filter((name) => statSync(join(SOURCE, name)).isDirectory())
	.sort();

const items = [
	{ name: CORE, files: coreFiles, registryDependencies: [], dependencies: importsOf(coreFiles, CORE).packages },
	...components.map((name) => {
		const files = filesIn(join(SOURCE, name));
		const { packages, components: uses } = importsOf(files, name);
		return {
			name,
			files,
			dependencies: packages,
			registryDependencies: [`./${CORE}.json`, ...uses.map((used) => `./${used}.json`)]
		};
	})
];

mkdirSync(OUTPUT, { recursive: true });
for (const item of items) {
	writeFileSync(join(OUTPUT, `${item.name}.json`), `${JSON.stringify(itemJson(item), null, '\t')}\n`);
}
const index = {
	$schema: REGISTRY_SCHEMA,
	name: 'arc-svelte',
	items: items.map(({ name, registryDependencies, dependencies, files }) => ({
		name,
		title: titleOf(name),
		type: 'registry:ui',
		dependencies,
		registryDependencies,
		files: files.map((path) => ({ path: relative(ROOT, path), type: 'registry:file', target: `${INSTALL_ROOT}/${relative(SOURCE, path)}` }))
	}))
};
writeFileSync(join(ROOT, 'registry.json'), `${JSON.stringify(index, null, '\t')}\n`);
writeFileSync(join(OUTPUT, 'index.json'), `${JSON.stringify(components, null, '\t')}\n`);
console.log(`Built ${items.length} registry items into static/r (${components.length} components + core).`);
