/**
 * vr-video : planche contact d'une vidéo de gameplay, pour que l'Agent web écrive les commentaires calés.
 *
 *   .\planche.cmd videos\12-e01-plante-au-milieu-de-la-route            → planche.jpg dans le dossier
 *   .\planche.cmd videos\12-e01-plante-au-milieu-de-la-route --dry-run  → montre le passage gardé, sans rien écrire
 *
 * Fige le passage gardé dans script.json (gameplay.debut et gameplay.duree : le rendu gardera exactement
 * celui-là, donc les secondes de la planche sont celles de la vidéo finale), rend une image par seconde de
 * ce passage dans planche.jpg, et met « commentaire »: « a_ecrire » (l'usine attend alors les commentaires).
 */
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, parseArgs } from 'node:util';
import { createLogger, envBool, loadEnv } from '../../shared/index.ts';
import { fenetreGameplay, type FenetreGameplay, type Gameplay, type ScriptVideo } from './src/plan.ts';
import { choisirPassage } from './passage.ts';

const ICI = import.meta.dirname;

/**
 * Ce que planche.ts écrit dans le script : le passage figé et l'attente des commentaires. Ne touche à rien
 * si les commentaires sont déjà là (ou si le script dit « sans »).
 */
export function scriptAvecPassage(script: ScriptVideo, fenetre: FenetreGameplay): ScriptVideo {
  const debut = Math.round(fenetre.depuis * 10) / 10;
  const duree = Math.round(fenetre.duree * 10) / 10;
  const dejaCommente = script.commentaire === 'fait' || script.commentaire === 'sans' || (script.commentaires?.length ?? 0) > 0;
  return { ...script, gameplay: { ...(script.gameplay as Gameplay), debut, duree }, ...(dejaCommente ? {} : { commentaire: 'a_ecrire' as const }) };
}

async function dureeMedia(fichier: string): Promise<number> {
  const { parseMedia } = await import('@remotion/media-parser');
  const { nodeReader } = await import('@remotion/media-parser/node');
  const res = await parseMedia({ src: fichier, reader: nodeReader, fields: { slowDurationInSeconds: true }, acknowledgeRemotionLicense: true });
  return res.slowDurationInSeconds;
}

async function main(): Promise<number> {
  const env = loadEnv({ toolDir: ICI, defaults: { GARDER_S: '35', PASSAGE_AUTO: 'true', NAVIGATEUR: '' } });
  const journal = createLogger('vr-video');
  const log = { info: (...a: unknown[]) => journal.info(format(...a)), warn: (...a: unknown[]) => journal.warn(format(...a)), error: (...a: unknown[]) => journal.error(format(...a)) };
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'dry-run': { type: 'boolean', default: false } } });
  if (!values['dry-run'] && process.env.npm_config_dry_run === 'true') values['dry-run'] = true;
  if (positionals.length !== 1) {
    log.warn('Usage : .\\planche.cmd <dossier-de-video> [--dry-run]');
    return 1;
  }
  const dossier = path.resolve(positionals[0]!);
  const fichierScript = path.join(dossier, 'script.json');
  const script = JSON.parse(readFileSync(fichierScript, 'utf8').replace(/^﻿/, '')) as ScriptVideo;
  if (!script.gameplay) {
    log.error('%s n\'est pas une vidéo de gameplay (pas de section « gameplay »).', path.basename(dossier));
    return 1;
  }
  const g = script.gameplay;
  const fichierJeu = path.join(dossier, g.fichier ?? 'gameplay.mp4');
  if (!existsSync(fichierJeu)) throw new Error(`Capture de jeu introuvable : ${fichierJeu}`);
  const dureeClip = await dureeMedia(fichierJeu);
  const garder = Math.max(3, Math.min(600, Number(env.GARDER_S) || 35));
  let reglage: Gameplay = g;
  if (g.debut === undefined && g.duree === undefined && envBool('PASSAGE_AUTO', true)) {
    const choix = choisirPassage(fichierJeu, dureeClip, garder);
    if (choix) reglage = { ...g, debut: choix.debut, duree: choix.duree };
  }
  const fenetre = fenetreGameplay(dureeClip, reglage, garder);
  log.info('%s : passage gardé de %ss à %ss (%ss sur %ss de capture).', path.basename(dossier), fenetre.depuis.toFixed(1), (fenetre.depuis + fenetre.duree).toFixed(1), fenetre.duree.toFixed(1), dureeClip.toFixed(1));
  if (values['dry-run']) {
    log.info('[dry-run] Rien n\'est écrit.');
    return 0;
  }

  const nom = path.basename(dossier);
  const racine = path.join(ICI, '.rendu', `planche-${nom}`);
  const publicDir = path.join(racine, 'public');
  rmSync(racine, { recursive: true, force: true });
  const publicJeu = `jeu/gameplay${path.extname(fichierJeu)}`;
  mkdirSync(path.dirname(path.join(publicDir, publicJeu)), { recursive: true });
  try { linkSync(fichierJeu, path.join(publicDir, publicJeu)); } catch { copyFileSync(fichierJeu, path.join(publicDir, publicJeu)); }

  const { bundle } = await import('@remotion/bundler');
  const { renderStill, selectComposition } = await import('@remotion/renderer');
  const inputProps = { src: publicJeu, depuis: fenetre.depuis, duree: fenetre.duree, pas: 1, titre: script.titre ?? nom };
  const serveUrl = await bundle({ entryPoint: path.join(ICI, 'src', 'index.ts'), publicDir });
  const browserExecutable = env.NAVIGATEUR || null;
  const composition = await selectComposition({ serveUrl, id: 'Planche', inputProps, browserExecutable });
  const sortie = path.join(dossier, 'planche.jpg');
  await renderStill({ composition, serveUrl, output: `${sortie}.tmp.jpeg`, frame: 0, inputProps, browserExecutable, imageFormat: 'jpeg', jpegQuality: 72 });
  renameSync(`${sortie}.tmp.jpeg`, sortie);
  rmSync(racine, { recursive: true, force: true });

  writeFileSync(`${fichierScript}.tmp`, JSON.stringify(scriptAvecPassage(script, fenetre), null, 2) + '\n');
  renameSync(`${fichierScript}.tmp`, fichierScript);
  log.info('Planche écrite : %s (le passage est figé dans script.json).', sortie);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      createLogger('vr-video').error((err as Error).message);
      process.exit(1);
    },
  );
}
