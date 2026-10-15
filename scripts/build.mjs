import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('public/dist', { recursive: true });
await build({ entryPoints: ['public/src/app.js'], outfile: 'public/dist/app.js', bundle: true, minify: true, loader: { '.js': 'jsx', '.png': 'file' }, assetNames: 'assets/[name]-[hash]', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'linked', target: ['es2022'], metafile: true });
await mkdir('public/textures', { recursive: true });
for (const filename of ['earth-night.jpg', 'earth-blue-marble.jpg', 'earth-topology.png']) {
  await copyFile(`node_modules/three-globe/example/img/${filename}`, `public/textures/${filename}`);
}
// Keep source out of the browser transform path; dependencies are pinned in package-lock.json.
let commit = 'unknown';
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
await writeFile('public/build-info.json', JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2));
