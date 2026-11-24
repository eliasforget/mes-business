/**
 * vr-clips : transforme tes captures PS5 en vidéos Vice Radar prêtes à rendre.
 *
 *   .\clips.cmd --dry-run              → montre quelle capture va avec quelle expérience, sans rien copier
 *   .\clips.cmd                        → crée un dossier de vidéo par capture dans tools\vr-video\videos
 *   .\clips.cmd --produire             → idem, puis voix (vr-voix) et rendu (vr-video) de chaque vidéo
 *   .\clips.cmd --sauter E03,E07       → expériences pas tournées : on ne leur donne pas de capture
 *   .\clips.cmd --associer E04=2031    → force une association (morceau du nom de fichier)
 *   .\clips.cmd --liste                → où en est la liste de tournage
 *
 * Relançable : une capture déjà importée n'est jamais réimportée, une vidéo déjà rendue n'est pas refaite.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, parseArgs } from 'node:util';
import { createLogger, loadEnv, REPO_ROOT } from '../../shared/index.ts';
import {
  associationsForcees, associer, cleCapture, horodatage, listeIds, nomDossier, prochainNumero, scriptVideo,
  textesPublication, verifierTournage, type Capture, type Tournage, idDansNom,
} from './lib.ts';

const ICI = import.meta.dirname;
const EXTENSIONS_VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);

/** Ce qui a déjà été fait, pour pouvoir relancer sans rien casser ni refaire. */
interface Registre {
  captures: Record<string, { experience: string; dossier: string; importeLe: string }>;
  experiences: Record<string, { dossier: string; capture: string; rendu?: boolean }>;
}

function lireJson<T>(fichier: string): T {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8').replace(/^﻿/, '')) as T;
  } catch (err) {
    throw new Error(`${path.basename(fichier)} : JSON invalide (${(err as Error).message})`);
  }
}

function ecrireAtomique(fichier: string, contenu: string): void {
  writeFileSync(`${fichier}.tmp`, contenu);
  renameSync(`${fichier}.tmp`, fichier);
}

function lireRegistre(fichier: string): Registre {
  if (!existsSync(fichier)) return { captures: {}, experiences: {} };
  const r = lireJson<Partial<Registre>>(fichier);
  return { captures: r.captures ?? {}, experiences: r.experiences ?? {} };
}

function listerCaptures(dossier: string): Capture[] {
  if (!existsSync(dossier)) throw new Error(`Dossier des captures introuvable : ${dossier} (CLIPS_ENTREE dans le .env)`);
  return readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isFile() && EXTENSIONS_VIDEO.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const fichier = path.join(dossier, e.name);
      const st = statSync(fichier);
      return { fichier, nom: e.name, taille: st.size, horodatage: horodatage(e.name, st.mtimeMs) };
    });
}

function mo(octets: number): string {
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

/**
 * PowerShell supprime le « -- » de « npm run x -- --option » : npm garde alors l'option pour lui et la
 * transmet seulement en variable d'environnement npm_config_<option>. On la récupère ici pour ne jamais
 * perdre un --dry-run.
 */
function optionNpm(nom: string): string | undefined {
  const v = process.env[`npm_config_${nom.replace(/-/g, '_')}`];
  return v === undefined || v === '' ? undefined : v;
}

/** Lance un autre outil du dépôt (vr-voix, vr-video) et renvoie true s'il a réussi. */
function lancer(script: string, args: string[]): boolean {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', script, ...args], { stdio: 'inherit', cwd: path.dirname(script) });
  return r.status === 0;
}

async function main(): Promise<number> {
  const journal = createLogger('vr-clips');
  const log = {
    info: (...a: unknown[]) => journal.info(format(...a)),
    warn: (...a: unknown[]) => journal.warn(format(...a)),
    error: (...a: unknown[]) => journal.error(format(...a)),
  };
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      produire: { type: 'boolean', default: false },
      liste: { type: 'boolean', default: false },
      sauter: { type: 'string' },
      associer: { type: 'string', multiple: true, default: [] },
    },
  });
  for (const nom of ['dry-run', 'produire', 'liste'] as const) if (!values[nom] && optionNpm(nom) === 'true') values[nom] = true;

  const env = loadEnv({ toolDir: ICI, defaults: { CLIPS_ENTREE: '', TOURNAGE: '', DOSSIER_VIDEOS: '' } });
  const entree = env.CLIPS_ENTREE ? path.resolve(env.CLIPS_ENTREE) : path.join(ICI, 'entree');
  const fichierTournage = env.TOURNAGE ? path.resolve(env.TOURNAGE) : path.join(ICI, 'tournage.json');
  const dossierVideos = env.DOSSIER_VIDEOS ? path.resolve(env.DOSSIER_VIDEOS) : path.join(REPO_ROOT, 'tools', 'vr-video', 'videos');
  const fichierRegistre = path.join(ICI, '.importes.json');
  const dryRun = values['dry-run'];

  if (!existsSync(fichierTournage)) throw new Error(`Liste de tournage introuvable : ${fichierTournage}`);
  const tournage = lireJson<Tournage>(fichierTournage);
  const erreursListe = verifierTournage(tournage);
  if (erreursListe.length) {
    erreursListe.forEach((e) => log.error(e));
    return 1;
  }
  const registre = lireRegistre(fichierRegistre);

  if (values.liste) {
    log.info('Liste de tournage %s (%d expériences)', tournage.semaine ?? '', tournage.experiences.length);
    for (const e of tournage.experiences) {
      const r = registre.experiences[e.id];
      const etat = !r ? 'à tourner' : r.rendu ? `vidéo rendue (${r.dossier})` : `importée, pas encore rendue (${r.dossier})`;
      console.log(`  ${e.id.padEnd(5)} ${e.titre.padEnd(45)} ${etat}`);
    }
    return 0;
  }

  // ── Import des nouvelles captures ──
  const captures = listerCaptures(entree).filter((c) => !registre.captures[cleCapture(c)]);
  const aTourner = tournage.experiences.filter((e) => !registre.experiences[e.id]);
  const { forces, erreurs: erreursForces } = associationsForcees(values.associer ?? []);
  const asso = associer(aTourner, captures, { sauter: listeIds(values.sauter), forces });
  const erreurs = [...erreursForces, ...asso.erreurs];
  if (erreurs.length) {
    erreurs.forEach((e) => log.error(e));
    return 1;
  }

  if (!captures.length) {
    log.info('Aucune nouvelle capture dans %s.', entree);
  } else {
    log.info('%d nouvelle(s) capture(s) dans %s, %d expérience(s) encore à tourner.', captures.length, entree, aTourner.length);
    for (const p of asso.paires) {
      const quand = new Date(p.capture.horodatage).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`  ${p.experience.id.padEnd(5)} ${p.experience.titre.padEnd(40)} ← ${p.capture.nom} (${quand}, ${mo(p.capture.taille)})`);
    }
    for (const c of asso.nomsInconnus) log.warn('Capture « %s » : son identifiant (%s) n\'est pas dans la liste ou est déjà tourné. Laissée de côté : corrige le nom ou la liste.', c.nom, idDansNom(c.nom));
    for (const c of asso.capturesEnTrop) log.warn('Capture sans expérience (ignorée cette fois) : %s. Ajoute une expérience à la liste, ou --associer.', c.nom);
    if (asso.paires.length && asso.experiencesSansCapture.length) {
      log.info('Pas encore de capture pour : %s', asso.experiencesSansCapture.map((e) => e.id).join(', '));
    }
    log.info('Captures nommées « E01 · … » : associées par leur nom. Les autres : la 1re va à la 1re expérience pas encore tournée (sinon --sauter <id>).');
  }

  if (dryRun) {
    log.info('[dry-run] Rien n\'est copié ni créé.');
    return 0;
  }

  mkdirSync(dossierVideos, { recursive: true });
  for (const p of asso.paires) {
    const nom = nomDossier(prochainNumero(readdirSync(dossierVideos)), p.experience);
    const dossier = path.join(dossierVideos, nom);
    mkdirSync(dossier, { recursive: true });
    const fichierJeu = `gameplay${path.extname(p.capture.nom).toLowerCase()}`;
    // La capture d'origine reste dans le dossier d'entrée : on travaille sur une copie.
    if (!existsSync(path.join(dossier, fichierJeu))) copyFileSync(p.capture.fichier, path.join(dossier, fichierJeu));
    const fichierScript = path.join(dossier, 'script.json');
    if (!existsSync(fichierScript)) ecrireAtomique(fichierScript, `${JSON.stringify(scriptVideo(p.experience, tournage, fichierJeu), null, 2)}\n`);
    ecrireAtomique(path.join(dossier, 'publication.txt'), textesPublication(p.experience, tournage));
    registre.captures[cleCapture(p.capture)] = { experience: p.experience.id, dossier: nom, importeLe: new Date().toISOString() };
    registre.experiences[p.experience.id] = { dossier: nom, capture: p.capture.nom };
    ecrireAtomique(fichierRegistre, JSON.stringify(registre, null, 2));
    log.info('%s → %s', p.experience.id, dossier);
  }

  if (!values.produire) {
    if (asso.paires.length) log.info('Prochaine étape : .\\clips.cmd --produire (voix + rendu de chaque vidéo).');
    return 0;
  }

  // ── Production : voix puis rendu, pour chaque vidéo importée pas encore rendue ──
  const voix = path.join(REPO_ROOT, 'tools', 'vr-voix', 'voix.ts');
  const rendu = path.join(REPO_ROOT, 'tools', 'vr-video', 'rendu.ts');
  const aProduire = Object.entries(registre.experiences).filter(([, r]) => !r.rendu && existsSync(path.join(dossierVideos, r.dossier)));
  if (!aProduire.length) {
    log.info('Rien à produire : toutes les vidéos importées sont déjà rendues.');
    return 0;
  }
  let echecs = 0;
  for (const [id, r] of aProduire) {
    const dossier = path.join(dossierVideos, r.dossier);
    log.info('── %s : voix', id);
    if (!lancer(voix, [dossier])) {
      log.error('%s : échec de la voix, vidéo suivante.', id);
      echecs++;
      continue;
    }
    log.info('── %s : rendu', id);
    if (!lancer(rendu, [dossier])) {
      log.error('%s : échec du rendu, vidéo suivante.', id);
      echecs++;
      continue;
    }
    registre.experiences[id] = { ...r, rendu: true };
    ecrireAtomique(fichierRegistre, JSON.stringify(registre, null, 2));
    log.info('%s prête. Textes à publier : %s', id, path.join(dossier, 'publication.txt'));
  }
  log.info('%d vidéo(s) produite(s), %d échec(s).', aProduire.length - echecs, echecs);
  return echecs ? 1 : 0;
}

// Lancé en ligne de commande (pas importé par les tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      createLogger('vr-clips').error((err as Error).message);
      process.exit(1);
    },
  );
}
