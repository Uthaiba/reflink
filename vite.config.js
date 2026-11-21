import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function staticOfflineShell() {
  return {
    name: 'reflink-static-offline-shell',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => name.startsWith('assets/') && /\.(js|css)$/.test(name));
      const paths = ['/index.html', '/manifest.webmanifest', '/reflink-icon.svg', ...assets.map(name => '/' + name)].sort();
      const version = createHash('sha256').update(paths.join('\n') + readFileSync(new URL('./index.html', import.meta.url), 'utf8') + readFileSync(new URL('./public/manifest.webmanifest', import.meta.url), 'utf8')).digest('hex').slice(0, 16);
      const template = readFileSync(new URL('./src/offline-worker.template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'reflink-sw.js', source: template
        .replace('__VERSION__', version).replace('__STATIC_PATHS__', JSON.stringify(paths)) });
    },
  };
}
export default defineConfig({ plugins: [react(), staticOfflineShell()] })
