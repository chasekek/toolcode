// Publishes the same build to GitHub Packages. GitHub only accepts packages scoped to the
// repository owner, so package.json is rewritten to `@chasekek/toolcode` for the duration of
// the publish and always restored afterwards. Needs `npm login --registry=https://npm.pkg.github.com`.
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const FILE = new URL('../package.json', import.meta.url);
const original = readFileSync(FILE, 'utf8');
const pkg = JSON.parse(original);
pkg.name = '@chasekek/toolcode';
pkg.publishConfig = {registry: 'https://npm.pkg.github.com'};

writeFileSync(FILE, JSON.stringify(pkg, null, 2) + '\n');
let status = 1;
try {
	status = spawnSync('npm', ['publish'], {stdio: 'inherit', shell: process.platform === 'win32'}).status ?? 1;
} finally {
	writeFileSync(FILE, original);
}
process.exit(status);
