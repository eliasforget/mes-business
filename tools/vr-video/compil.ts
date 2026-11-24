/**
 * compil : assemble des Shorts verticaux déjà rendus en une vidéo 16:9 pour YouTube (compilation de la semaine).
 * Chaque Short est centré sur un fond flouté de lui-même, avec « Partie N » et son titre au début.
 *
 *   .\compil.cmd liste.json --sortie C:\...\compilation.mp4 [--apercu 3]
 *
 * liste.json : { "theme": "vice-radar", "videos": [{ "fichier": "C:\\...\\08-x.mp4", "titre": "4 secrets de plus" }, ...] }
 * Écrit aussi <sortie sans .mp4>.chapitres.json : [{ "titre", "debut" (s) }] pour la description YouTube.
 * Lancé par l'usine le dimanche ; utilisable à la main.
 */
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { format, parseArgs } from 'node:util';
import { createLogger, loadEnv } from '../../shared/index.ts';
import { estTheme, theme as themeDe } from './src/themes.ts';

const ICI = import.meta.dirname;
const env = loadEnv({ toolDir: ICI, defaults: { CRF: '20', CONCURRENCE: '', NAVIGATEUR: '', MARQUE_NOM: 'VICE', MARQUE_ACCENT: 'RADAR' } });
const journal = createLogger('vr-video');
// Le logger partagé n'interprète pas les %s : on formate avant.
const log = { info: (...a: unknown[]) => journal.info(format(...a)), warn: (...a: unknown[]) => journal.warn(format(...a)), error: (...a: unknown[]) => journal.error(format(...a)) };
const FPS = 30;

interface Liste {
  theme?: string;
  videos: { fichier: string; titre: string }[];
}

async function dureeMedia(fichier: string): Promise<number> {
  const { parseMedia } = await import('@remotion/media-parser');
  const { nodeReader } = await import('@remotion/media-parser/node');
  const res = await parseMedia({ src: fichier, reader: nodeReader, fields: { slowDurationInSeconds: true }, acknowledgeRemotionLicense: true });
  return res.slowDurationInSeconds;
}

function placer(source: string, cible: string): void {
  mkdirSync(path.dirname(cible), { recursive: true });
  try {
    linkSync(source, cible);
  } catch {
    copyFileSync(source, cible); // autre disque (ex. Google Drive) : copie
  }
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { sortie: { type: 'string' }, apercu: { type: 'string' } } });
  const fichierListe = positionals[0];
  if (!fichierListe || !values.sortie) {
    log.error('Usage : .\\compil.cmd liste.json --sortie chemin\\compilation.mp4 [--apercu 3]');
    return 1;
  }
  const liste = JSON.parse(readFileSync(path.resolve(fichierListe), 'utf8').replace(/^﻿/, '')) as Liste;
  const videos = (liste.videos ?? []).filter((v) => {
    if (existsSync(v.fichier)) return true;
    log.warn('Vidéo introuvable, ignorée : %s', v.fichier);
    return false;
  });
  if (videos.length < 2) {
    log.error('Il faut au moins 2 vidéos pour une compilation (%d trouvée).', videos.length);
    return 1;
  }

  const nomTheme = estTheme(liste.theme) ? liste.theme : 'vice-radar';
  const marque = nomTheme === 'vice-radar' ? { nom: env.MARQUE_NOM, accent: env.MARQUE_ACCENT } : themeDe(nomTheme).marque;
  const travail = path.join(ICI, '.rendu', `compil-${Date.now()}`);
  const publicDir = path.join(travail, 'public');
  const elements: { src: string; duree: number; titre: string }[] = [];
  const chapitres: { titre: string; debut: number }[] = [];
  let t = 0;
  for (const [i, v] of videos.entries()) {
    const duree = await dureeMedia(v.fichier);
    const src = `compil/${String(i + 1).padStart(2, '0')}${path.extname(v.fichier)}`;
    placer(v.fichier, path.join(publicDir, src));
    elements.push({ src, duree, titre: v.titre });
    chapitres.push({ titre: v.titre, debut: Math.round(t) });
    t += Math.max(1, Math.round(duree * FPS)) / FPS;
  }
  log.info('Compilation %s : %d vidéos, %s s au total.', themeDe(nomTheme).chaine, elements.length, t.toFixed(1));

  try {
    const { bundle } = await import('@remotion/bundler');
    const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
    const inputProps = { videos: elements, marque, theme: nomTheme };
    const serveUrl = await bundle({ entryPoint: path.join(ICI, 'src', 'index.ts'), publicDir });
    const browserExecutable = env.NAVIGATEUR || null;
    const composition = await selectComposition({ serveUrl, id: 'Compilation', inputProps, browserExecutable });
    const sortie = path.resolve(values.sortie);
    mkdirSync(path.dirname(sortie), { recursive: true });
    if (values.apercu) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(values.apercu.replace(',', '.')) * FPS));
      const png = sortie.replace(/\.mp4$/i, '') + `-${values.apercu}s.png`;
      await renderStill({ composition, serveUrl, output: png, frame, inputProps, browserExecutable });
      log.info('Aperçu : %s', png);
      return 0;
    }
    const concurrence = env.CONCURRENCE ? Math.max(1, Number(env.CONCURRENCE)) : Math.max(1, Math.floor(os.cpus().length / 2));
    let palier = -1;
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: sortie, inputProps, crf: Number(env.CRF) || 20, x264Preset: 'veryfast',
      concurrency: concurrence, browserExecutable,
      onProgress: ({ progress }) => {
        const p = Math.floor(progress * 10);
        if (p > palier) {
          palier = p;
          log.info('Compilation : %d %%', p * 10);
        }
      },
    });
    writeFileSync(sortie.replace(/\.mp4$/i, '') + '.chapitres.json', JSON.stringify(chapitres, null, 2) + '\n');
    log.info('Compilation prête : %s', sortie);
    return 0;
  } finally {
    rmSync(travail, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error((err as Error).message);
    process.exit(1);
  },
);
