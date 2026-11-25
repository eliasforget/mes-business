// Mini serveur statique pour tester en local (aucune dépendance) :  node scripts/serveur.mjs [dossier] [--port 8080]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

export function demarrer(dossier, port = 8080) {
  const racine = path.resolve(dossier);
  const serveur = createServer(async (req, rep) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let chemin = path.resolve(racine, '.' + decodeURIComponent(url.pathname));
      if (chemin !== racine && !chemin.startsWith(racine + path.sep)) { rep.writeHead(403).end('Interdit'); return; }
      if ((await stat(chemin).catch(() => null))?.isDirectory()) chemin = path.join(chemin, 'index.html');
      const contenu = await readFile(chemin);
      rep.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      rep.end(contenu);
    } catch {
      rep.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
    }
  });
  return new Promise((resolve) => serveur.listen(port, '127.0.0.1', () => resolve(serveur)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { port: { type: 'string', default: '8080' } } });
  const dossier = positionals[0] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const s = await demarrer(dossier, Number(values.port));
  console.log(`http://localhost:${values.port}  (Ctrl+C pour arrêter)  dossier : ${path.resolve(dossier)}`);
  process.on('SIGINT', () => s.close(() => process.exit(0)));
}
