/**
 * vr-fonds : remplit la bibliothèque de clips de fond de vr-video avec des vidéos Pixabay
 * (licence Pixabay : usage commercial autorisé, attribution non obligatoire), choisies d'après
 * les mots-clés des scènes. Verticales en priorité, sinon horizontales 4K recadrées par vr-video.
 *
 *   .\fonds.cmd 05-nouvelle-video                     → clips pour chaque scène du script
 *   .\fonds.cmd 05-nouvelle-video --dry-run           → montre ce qui serait téléchargé
 *   .\fonds.cmd --requete "miami nuit" --nombre 5     → recherche libre
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { format, parseArgs } from 'node:util';
import { createLogger, loadEnv, REPO_ROOT } from '../../shared/index.ts';
import { ClientPixabay, choisirFichier, type Fetch, type FichierChoisi, type VideoPixabay } from './pixabay.ts';

const ICI = import.meta.dirname;

export interface EntreeIndex {
  motsCles: string[];
  source: 'pixabay';
  id: number;
  url: string;
  auteur: string;
  auteurUrl: string;
  duree: number;
  largeur: number | null;
  hauteur: number | null;
  vertical: boolean;
  telecharge_le: string;
}
export type Index = Record<string, EntreeIndex>;

export interface Recherche {
  motsCles: string[];
  nombre: number;
  etiquette: string; // pour les logs : « scène 2 », « recherche libre »
}

export interface Reglages {
  dureeMin: number;
  dureeMax: number;
  maxMo: number;
  accepterPaysage: boolean;
}

export function normaliser(mot: string): string {
  return mot.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Nom de fichier lisible par vr-video : les mots-clés deviennent les mots du nom. */
export function nomFichier(motsCles: string[], id: number): string {
  const slug = motsCles.map(normaliser).filter(Boolean).join('-').slice(0, 60) || 'clip';
  return `${slug}-pixabay-${id}.mp4`;
}

/** Identifiant unique d'une vidéo dans la bibliothèque, toutes sources confondues. */
function cleVideo(e: EntreeIndex): string {
  return `${e.source}-${e.id}`;
}

/** Une recherche par scène, à partir de ses motsCles (sinon les mots-clés par défaut du thème). */
export function recherchesDuScript(script: unknown, parScene: number, parDefaut: string[]): Recherche[] {
  const scenes = (script as { scenes?: { motsCles?: unknown }[] })?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('script.json : « scenes » doit être une liste non vide.');
  return scenes.map((s, i) => {
    const mots = Array.isArray(s?.motsCles) ? s.motsCles.filter((m): m is string => typeof m === 'string' && !!m.trim()) : [];
    // Sans motsCles : on fait tourner les mots-clés par défaut du thème pour varier les fonds d'une scène à l'autre.
    const defaut = parDefaut.length ? [parDefaut[i % parDefaut.length]!] : ['miami nuit'];
    return { motsCles: mots.length ? mots : defaut, nombre: parScene, etiquette: `scène ${i + 1}` };
  });
}

export function lireIndex(dossier: string): Index {
  const f = path.join(dossier, 'index.json');
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, '')) as Index;
  } catch {
    throw new Error(`${f} est corrompu : corrige-le ou supprime-le.`);
  }
}

export function ecrireIndex(dossier: string, index: Index): void {
  mkdirSync(dossier, { recursive: true });
  const tmp = path.join(dossier, 'index.json.tmp');
  writeFileSync(tmp, JSON.stringify(index, null, 2));
  renameSync(tmp, path.join(dossier, 'index.json'));
  // Crédits des vidéastes : non obligatoires avec la licence Pixabay, mais utiles (et appréciés) en description.
  const lignes = Object.entries(index)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([f, e]) => `- \`${f}\` : vidéo de [${e.auteur}](${e.auteurUrl}) sur [Pixabay](${e.url})`);
  writeFileSync(path.join(dossier, 'CREDITS.md'), `# Crédits des clips de fond\n\nVidéos : Pixabay (licence Pixabay, usage commercial autorisé, attribution non obligatoire).\n\n${lignes.join('\n')}\n`);
}

export interface Candidat {
  video: VideoPixabay;
  fichier: FichierChoisi;
}

/**
 * Candidats d'une recherche : requête complète, puis chaque mot-clé seul si pas assez de résultats.
 * Les vidéos verticales passent avant les horizontales (qui ne servent qu'à compléter).
 */
export async function trouverCandidats(client: ClientPixabay, r: Recherche, exclus: Set<string>, reglages: Reglages): Promise<Candidat[]> {
  const requetes = [r.motsCles.join(' '), ...(r.motsCles.length > 1 ? r.motsCles : [])];
  const verticaux: Candidat[] = [];
  const paysages: Candidat[] = [];
  const vus = new Set<string>();
  for (const q of requetes) {
    if (verticaux.length >= r.nombre) break;
    for (const v of await client.rechercher(q)) {
      const cle = `pixabay-${v.id}`;
      if (exclus.has(cle) || vus.has(cle) || v.duration < reglages.dureeMin || v.duration > reglages.dureeMax) continue;
      const fichier = choisirFichier(v, reglages.accepterPaysage, reglages.maxMo);
      if (!fichier) continue;
      vus.add(cle);
      (fichier.vertical ? verticaux : paysages).push({ video: v, fichier });
    }
  }
  const retenus = [...verticaux, ...paysages].slice(0, r.nombre);
  for (const c of retenus) exclus.add(`pixabay-${c.video.id}`);
  return retenus;
}

async function telecharger(url: string, cible: string, maxMo: number, fetchImpl: Fetch): Promise<number> {
  const rep = await fetchImpl(url, { signal: AbortSignal.timeout(180_000) });
  if (!rep.ok || !rep.body) throw new Error(`téléchargement refusé (${rep.status})`);
  const taille = Number(rep.headers.get('content-length') ?? 0);
  if (taille > maxMo * 1024 * 1024) throw new Error(`fichier trop lourd (${Math.round(taille / 1048576)} Mo > ${maxMo} Mo)`);
  const partiel = `${cible}.part`;
  try {
    await pipeline(Readable.fromWeb(rep.body as import('node:stream/web').ReadableStream), createWriteStream(partiel));
    renameSync(partiel, cible); // jamais de clip à moitié téléchargé dans la bibliothèque
  } catch (err) {
    rmSync(partiel, { force: true });
    throw err;
  }
  return taille;
}

export interface BilanFonds {
  telecharges: string[];
  ignores: number;
  erreurs: number;
}

export async function remplirBibliotheque(
  recherches: Recherche[], dossier: string, client: ClientPixabay, reglages: Reglages,
  opts: { dryRun?: boolean; fetchImpl?: Fetch; log?: (m: string) => void } = {},
): Promise<BilanFonds> {
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? client.fetch;
  const index = lireIndex(dossier);
  const exclus = new Set(Object.values(index).map(cleVideo)); // jamais deux fois la même vidéo
  const bilan: BilanFonds = { telecharges: [], ignores: 0, erreurs: 0 };

  for (const r of recherches) {
    const candidats = await trouverCandidats(client, r, exclus, reglages);
    const nbPaysage = candidats.filter((c) => !c.fichier.vertical).length;
    log(`${r.etiquette} « ${r.motsCles.join(' ')} » : ${candidats.length}/${r.nombre} clip(s) trouvé(s)${nbPaysage ? ` dont ${nbPaysage} horizontal(aux) 4K recadré(s)` : ''}`);
    for (const { video: v, fichier } of candidats) {
      const nom = nomFichier(r.motsCles, v.id);
      const desc = `${fichier.largeur}x${fichier.hauteur}${fichier.vertical ? '' : ' recadré'}, ${v.duration} s`;
      if (opts.dryRun) {
        log(`  [dry-run] ${nom}  (${desc}${fichier.octets ? `, ~${Math.round(fichier.octets / 1048576)} Mo` : ''}, par ${v.user})`);
        bilan.telecharges.push(nom);
        continue;
      }
      try {
        mkdirSync(dossier, { recursive: true });
        const octets = await telecharger(fichier.url, path.join(dossier, nom), reglages.maxMo, fetchImpl);
        index[nom] = {
          motsCles: r.motsCles.flatMap((m) => normaliser(m).split('-')).filter(Boolean), source: 'pixabay', id: v.id, url: v.pageURL,
          auteur: v.user, auteurUrl: `https://pixabay.com/users/${encodeURIComponent(v.user)}-${v.user_id}/`,
          duree: v.duration, largeur: fichier.largeur, hauteur: fichier.hauteur, vertical: fichier.vertical, telecharge_le: new Date().toISOString(),
        };
        ecrireIndex(dossier, index); // après chaque clip : relançable même si on coupe au milieu
        bilan.telecharges.push(nom);
        log(`  + ${nom}  (${desc}${octets ? `, ${Math.round(octets / 1048576)} Mo` : ''})`);
      } catch (err) {
        bilan.erreurs += 1;
        log(`  ! ${nom} ignoré : ${(err as Error).message}`);
      }
    }
    bilan.ignores += Math.max(0, r.nombre - candidats.length);
  }
  return bilan;
}

/** Même logique que vr-voix : chemin direct, sinon tools/vr-video/videos/<nom>, sinon les exemples. */
export function dossierVideo(arg: string, racine = REPO_ROOT): string {
  const candidats = [path.resolve(arg), path.join(racine, 'tools', 'vr-video', 'videos', arg), path.join(racine, 'tools', 'vr-video', 'exemples', arg)];
  const trouve = candidats.find((c) => existsSync(path.join(c, 'script.json')));
  if (!trouve) throw new Error(`Aucun script.json trouvé pour « ${arg} » (cherché dans : ${candidats.join(' ; ')})`);
  return trouve;
}

/**
 * PowerShell supprime le « -- » de « npm run x -- --option » : npm garde alors l'option pour lui et la
 * transmet seulement en variable d'environnement npm_config_<option>. On la récupère ici pour ne jamais
 * perdre un --dry-run (sinon une commande « à blanc » ferait le travail pour de vrai).
 */
function optionNpm(nom: string): string | undefined {
  const v = process.env[`npm_config_${nom.replace(/-/g, '_')}`];
  return v === undefined || v === '' ? undefined : v;
}

async function main(): Promise<number> {
  const journal = createLogger('vr-fonds');
  const info = (...a: unknown[]) => journal.info(format(...a));
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      requete: { type: 'string' },
      nombre: { type: 'string' },
      'par-scene': { type: 'string' },
    },
  });
  if (!values['dry-run'] && optionNpm('dry-run') === 'true') values['dry-run'] = true;
  if (!values.requete && optionNpm('requete') && optionNpm('requete') !== 'true') values.requete = optionNpm('requete');
  const env = loadEnv({
    toolDir: ICI,
    required: ['PIXABAY_API_KEY'],
    defaults: {
      BIBLIOTHEQUE_FONDS: '', CLIPS_PAR_SCENE: '3', MOTS_CLES_PAR_DEFAUT: 'miami nuit,neons ville,voiture de sport,palmiers floride',
      DUREE_MIN: '5', DUREE_MAX: '60', MAX_MO: '120', ACCEPTER_PAYSAGE: 'oui',
    },
  });
  const entier = (v: string, nom: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error(`${nom} doit être un entier entre 1 et 50 (reçu : "${v}")`);
    return n;
  };
  const dossier = env.BIBLIOTHEQUE_FONDS ? path.resolve(env.BIBLIOTHEQUE_FONDS) : path.join(REPO_ROOT, 'tools', 'vr-video', 'bibliotheque');
  const parDefaut = env.MOTS_CLES_PAR_DEFAUT.split(',').map((s) => s.trim()).filter(Boolean);

  let recherches: Recherche[];
  if (values.requete) {
    recherches = [{ motsCles: values.requete.split(/[\s,]+/).filter(Boolean), nombre: entier(values.nombre ?? '5', '--nombre'), etiquette: 'recherche libre' }];
  } else if (positionals.length === 1) {
    const video = dossierVideo(positionals[0]!);
    const script = JSON.parse(readFileSync(path.join(video, 'script.json'), 'utf8').replace(/^﻿/, '')) as unknown;
    recherches = recherchesDuScript(script, entier(values['par-scene'] ?? env.CLIPS_PAR_SCENE, '--par-scene'), parDefaut);
    info('Vidéo : %s (%d scènes)', video, recherches.length);
  } else {
    journal.warn('Usage : .\\fonds.cmd <dossier-ou-nom-de-video> [--dry-run] [--par-scene 3]   |   .\\fonds.cmd --requete "miami nuit" [--nombre 5]');
    return 1;
  }

  // Cache des recherches (24 h, exigé par Pixabay) : un --dry-run suivi du vrai lancement ne coûte qu'une série de requêtes.
  const client = new ClientPixabay(env.PIXABAY_API_KEY, { cacheFichier: path.join(dossier, '.cache-pixabay.json') });
  const bilan = await remplirBibliotheque(recherches, dossier, client, {
    dureeMin: Number(env.DUREE_MIN), dureeMax: Number(env.DUREE_MAX), maxMo: Number(env.MAX_MO),
    accepterPaysage: !/^(non|no|false|0)$/i.test(env.ACCEPTER_PAYSAGE.trim()),
  }, { dryRun: values['dry-run'], log: (m) => info(m) });
  info('%s : %d clip(s)%s, %d erreur(s). Bibliothèque : %s. Requêtes Pixabay : %d (+ %d depuis le cache)',
    values['dry-run'] ? '[dry-run] À télécharger' : 'Téléchargés', bilan.telecharges.length,
    bilan.ignores ? `, ${bilan.ignores} manquant(s) faute de résultat` : '', bilan.erreurs, dossier, client.requetesReseau, client.depuisCache);
  return bilan.erreurs && !bilan.telecharges.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      createLogger('vr-fonds').error((err as Error).message);
      process.exit(1);
    },
  );
}
