/**
 * vr-voix : génère la voix off d'une vidéo Vice Radar avec ElevenLabs, à partir du script.json de vr-video.
 *
 *   .\voix.cmd 05-nouvelle-video            → voix.mp3 + voix.alignement.json dans le dossier de la vidéo
 *   .\voix.cmd 05-nouvelle-video --dry-run  → affiche le texte et le coût estimé, sans rien dépenser
 *   .\voix.cmd 05-nouvelle-video --forcer   → régénère même si rien n'a changé
 *   .\voix.cmd --lister                     → tes voix ElevenLabs + crédits restants
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, parseArgs } from 'node:util';
import { createLogger, envBool, loadEnv, REPO_ROOT } from '../../shared/index.ts';
import { ClientElevenLabs, ErreurElevenLabs, type Fetch, type ReglagesVoix } from './elevenlabs.ts';

const ICI = import.meta.dirname;

export interface Config {
  cle: string;
  voixId: string;
  modele: string;
  reglages: ReglagesVoix;
}

/** Trouve le dossier de la vidéo : chemin donné, sinon tools/vr-video/videos/<nom>, sinon les exemples. */
export function dossierVideo(arg: string, racine = REPO_ROOT): string {
  const candidats = [
    path.resolve(arg),
    path.join(racine, 'tools', 'vr-video', 'videos', arg),
    path.join(racine, 'tools', 'vr-video', 'exemples', arg),
  ];
  const trouve = candidats.find((c) => existsSync(path.join(c, 'script.json')));
  if (!trouve) throw new Error(`Aucun script.json trouvé pour « ${arg} » (cherché dans : ${candidats.join(' ; ')})`);
  return trouve;
}

/** Texte lu par la voix : les « voix » des scènes bout à bout (c'est ce que vr-video recale sur les scènes). */
export function texteDuScript(script: unknown): string {
  const scenes = (script as { scenes?: { voix?: unknown }[] })?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('script.json : « scenes » doit être une liste non vide.');
  const morceaux = scenes.map((s, i) => {
    if (typeof s?.voix !== 'string' || !s.voix.trim()) throw new Error(`script.json : scenes[${i}].voix est vide.`);
    return s.voix.trim();
  });
  return morceaux.join(' ').replace(/\s+/g, ' ');
}

/** Phrases calées des vidéos gameplay (« commentaires » du script) : une voix par phrase. */
export function textesCommentaires(script: unknown): string[] {
  const c = (script as { commentaires?: { texte?: unknown }[] })?.commentaires;
  if (!Array.isArray(c)) return [];
  return c.map((x, i) => {
    if (typeof x?.texte !== 'string' || !x.texte.trim()) throw new Error(`script.json : commentaires[${i}].texte est vide.`);
    return x.texte.trim().replace(/\s+/g, ' ');
  });
}

/** Empreinte de tout ce qui change l'audio : si elle est identique, inutile de repayer une génération. */
export function empreinte(texte: string, cfg: Omit<Config, 'cle'>): string {
  return createHash('sha256').update(JSON.stringify({ texte, voix: cfg.voixId, modele: cfg.modele, reglages: cfg.reglages })).digest('hex').slice(0, 16);
}

/** Coût estimé : 1 crédit par caractère pour les modèles multilingual/v3, 0,5 pour flash/turbo. */
export function coutEstime(texte: string, modele: string): number {
  return Math.ceil(texte.length * (/flash|turbo/.test(modele) ? 0.5 : 1));
}

/**
 * Durée parlée estimée, en secondes. Étalonnée sur une vraie voix ElevenLabs en français :
 * ~2,7 mots/s à vitesse 1 (63 mots ≈ 22 s à 1,05).
 */
export function dureeEstimee(texte: string, vitesse = 1): number {
  const mots = texte.split(/\s+/).filter(Boolean).length;
  return mots / (2.7 * vitesse);
}

/** Mots à ajouter pour atteindre la durée visée (0 si c'est déjà bon). */
export function motsManquants(texte: string, vitesse: number, cible: number): number {
  const manque = cible - dureeEstimee(texte, vitesse);
  return manque > 0 ? Math.ceil(manque * 2.7 * vitesse) : 0;
}

function ecrireAtomique(fichier: string, contenu: string | Buffer): void {
  const tmp = `${fichier}.tmp`;
  writeFileSync(tmp, contenu);
  renameSync(tmp, fichier);
}

export interface Resultat {
  statut: 'genere' | 'inchange' | 'dry-run';
  texte: string;
  cout: number;
  /** Voix des commentaires (vidéos gameplay) générées à ce passage. */
  commentaires?: number;
}

interface Piste { texte: string; base: string; cle: string }

/** Une piste est à refaire si son mp3, son alignement ou son empreinte manquent ou ont changé. */
function aRefaire(dossier: string, p: Piste): boolean {
  const meta = path.join(dossier, `${p.base}.meta.json`);
  if (!existsSync(path.join(dossier, `${p.base}.mp3`)) || !existsSync(path.join(dossier, `${p.base}.alignement.json`)) || !existsSync(meta)) return true;
  try {
    return (JSON.parse(readFileSync(meta, 'utf8')) as { empreinte?: string }).empreinte !== p.cle;
  } catch {
    return true;
  }
}

export async function genererVoix(dossier: string, cfg: Config, opts: { dryRun?: boolean; forcer?: boolean; fetchImpl?: Fetch; log?: (m: string) => void; dureeMinCible?: number } = {}): Promise<Resultat> {
  const log = opts.log ?? (() => {});
  const fichierScript = path.join(dossier, 'script.json');
  let script: unknown;
  try {
    script = JSON.parse(readFileSync(fichierScript, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    throw new Error(`script.json illisible : ${(err as Error).message}`);
  }
  const texte = texteDuScript(script);
  const cout = coutEstime(texte, cfg.modele);
  const cle = empreinte(texte, cfg);
  const fichierMeta = path.join(dossier, 'voix.meta.json');
  const fichierAudio = path.join(dossier, 'voix.mp3');
  const fichierAlignement = path.join(dossier, 'voix.alignement.json');

  log(`Texte (${texte.length} caractères, ~${cout} crédits) : « ${texte} »`);
  const vitesse = cfg.reglages.speed ?? 1;
  const duree = dureeEstimee(texte, vitesse);
  // Vidéo de gameplay : la voix ne fait que l'accroche, la durée vient de la capture de jeu.
  const gameplay = !!(script as { gameplay?: unknown }).gameplay;
  const manque = opts.dureeMinCible && !gameplay ? motsManquants(texte, vitesse, opts.dureeMinCible) : 0;
  if (gameplay) log(`Accroche d'une vidéo de gameplay : ~${Math.round(duree)} s de voix (la durée de la vidéo vient de la capture).`);
  else log(manque
    ? `ATTENTION : ~${Math.round(duree)} s estimées, sous les ${opts.dureeMinCible} s visées. Ajoute ~${manque} mots dans les « voix » du script avant de générer (sinon tu paies une voix trop courte).`
    : `Durée estimée : ~${Math.round(duree)} s.`);

  // Vidéo gameplay commentée : une voix par phrase (voix-c1.mp3…), chacune avec son empreinte.
  const pistes: Piste[] = textesCommentaires(script).map((t, i) => ({ texte: t, base: `voix-c${i + 1}`, cle: empreinte(t, cfg) }));
  const pistesAFaire = pistes.filter((p) => opts.forcer || aRefaire(dossier, p));
  const coutPistes = pistesAFaire.reduce((n, p) => n + coutEstime(p.texte, cfg.modele), 0);
  if (pistes.length) log(`${pistes.length} commentaire(s) calé(s) : ${pistesAFaire.length} à générer (~${coutPistes} crédits).`);

  let principaleAFaire = true;
  if (!opts.forcer && existsSync(fichierAudio) && existsSync(fichierAlignement) && existsSync(fichierMeta)) {
    const meta = JSON.parse(readFileSync(fichierMeta, 'utf8')) as { empreinte?: string };
    if (meta.empreinte === cle) principaleAFaire = false;
  }
  if (!principaleAFaire && !pistesAFaire.length) {
    log('Voix déjà générée pour ce texte et ces réglages : rien à faire (--forcer pour régénérer).');
    return { statut: 'inchange', texte, cout: 0 };
  }
  if (opts.dryRun) {
    log('[dry-run] Aucun appel de synthèse, aucun crédit dépensé.');
    return { statut: 'dry-run', texte, cout: (principaleAFaire ? cout : 0) + coutPistes, commentaires: pistesAFaire.length };
  }

  const client = new ClientElevenLabs(cfg.cle, opts.fetchImpl);
  const abo = await client.abonnement();
  const restant = abo.character_limit - abo.character_count;
  const total = (principaleAFaire ? cout : 0) + coutPistes;
  if (total > restant) throw new Error(`Crédits insuffisants : ${restant} restants, ~${total} nécessaires.`);

  for (const p of pistesAFaire) {
    const r = await client.synthese(cfg.voixId, p.texte, cfg.modele, cfg.reglages);
    ecrireAtomique(path.join(dossier, `${p.base}.mp3`), r.audio);
    ecrireAtomique(path.join(dossier, `${p.base}.alignement.json`), JSON.stringify({ alignment: r.alignement }));
    ecrireAtomique(path.join(dossier, `${p.base}.meta.json`), JSON.stringify({ empreinte: p.cle, texte: p.texte, genere_le: new Date().toISOString() }, null, 2));
  }
  if (pistesAFaire.length) log(`${pistesAFaire.length} voix de commentaire enregistrée(s).`);
  if (!principaleAFaire) {
    log(`Accroche inchangée. Crédits restants : ~${restant - total}.`);
    return { statut: 'genere', texte, cout: total, commentaires: pistesAFaire.length };
  }

  const { audio, alignement } = await client.synthese(cfg.voixId, texte, cfg.modele, cfg.reglages);
  if (existsSync(fichierAudio)) renameSync(fichierAudio, path.join(dossier, 'voix.precedente.mp3')); // jamais d'écrasement silencieux
  ecrireAtomique(fichierAudio, audio);
  ecrireAtomique(fichierAlignement, JSON.stringify({ alignment: alignement }));
  ecrireAtomique(fichierMeta, JSON.stringify({
    empreinte: cle, voix: cfg.voixId, modele: cfg.modele, reglages: cfg.reglages, caracteres: texte.length,
    genere_le: new Date().toISOString(), offre: abo.tier,
  }, null, 2));
  log(`Voix enregistrée : ${fichierAudio} (${Math.round(audio.length / 1024)} Ko). Crédits restants : ~${restant - total}.`);
  if (abo.tier === 'free') log('Offre gratuite ElevenLabs : pas d\'usage commercial et mention « ElevenLabs » obligatoire (ex. « Voix : ElevenLabs » en description). Passe en Starter avant de monétiser.');
  return { statut: 'genere', texte, cout: total, commentaires: pistesAFaire.length };
}

function nombre(env: Record<string, string>, nom: string, min: number, max: number): number {
  const v = Number((env[nom] ?? '').replace(',', '.'));
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${nom} doit être entre ${min} et ${max} (reçu : "${env[nom]}")`);
  return v;
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
  const journal = createLogger('vr-voix');
  const log = { info: (...a: unknown[]) => journal.info(format(...a)), warn: (...a: unknown[]) => journal.warn(format(...a)) };
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean', default: false }, forcer: { type: 'boolean', default: false }, lister: { type: 'boolean', default: false } },
  });
  if (!values['dry-run'] && optionNpm('dry-run') === 'true') values['dry-run'] = true;
  if (!values['forcer'] && optionNpm('forcer') === 'true') values['forcer'] = true;
  if (!values['lister'] && optionNpm('lister') === 'true') values['lister'] = true;

  const env = loadEnv({
    toolDir: ICI,
    defaults: {
      ELEVENLABS_API_KEY: '', ELEVENLABS_VOIX_ID: '', ELEVENLABS_MODELE: 'eleven_multilingual_v2',
      STABILITE: '0.45', SIMILARITE: '0.8', STYLE: '0.35', VITESSE: '1.05', DUREE_MIN_CIBLE: '30',
    },
  });
  const besoinCle = values.lister || !values['dry-run'];
  if (besoinCle && !env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY manquante : copie .env.example en .env et colle ta clé (ElevenLabs > Developers > API Keys ; accès Text to Speech, Voix : Lire, Utilisateur).');

  if (values.lister) {
    const client = new ClientElevenLabs(env.ELEVENLABS_API_KEY);
    const abo = await client.abonnement();
    log.info('Offre %s : %d / %d crédits utilisés (%d restants)', abo.tier, abo.character_count, abo.character_limit, abo.character_limit - abo.character_count);
    if (abo.tier === 'free') log.warn('Offre gratuite : pas de droits d\'usage commercial.');
    for (const v of await client.voix()) {
      const labels = Object.values(v.labels ?? {}).join(', ');
      console.log(`${v.voice_id}  ${v.name.padEnd(28)} ${labels}`);
    }
    console.log('\nPour une voix française de la Voice Library : ajoute-la à « My Voices » sur elevenlabs.io, elle apparaîtra ici.');
    return 0;
  }

  if (positionals.length !== 1) {
    log.warn('Usage : .\\voix.cmd <dossier-ou-nom-de-video> [--dry-run] [--forcer]   |   .\\voix.cmd --lister');
    return 1;
  }
  if (!values['dry-run'] && !env.ELEVENLABS_VOIX_ID) throw new Error('ELEVENLABS_VOIX_ID manquant dans le .env (liste : .\\voix.cmd --lister).');

  const cfg: Config = {
    cle: env.ELEVENLABS_API_KEY,
    voixId: env.ELEVENLABS_VOIX_ID || 'non-defini',
    modele: env.ELEVENLABS_MODELE,
    reglages: {
      stability: nombre(env, 'STABILITE', 0, 1), similarity_boost: nombre(env, 'SIMILARITE', 0, 1), style: nombre(env, 'STYLE', 0, 1),
      use_speaker_boost: envBool('BOOST_LOCUTEUR', true), speed: nombre(env, 'VITESSE', 0.7, 1.2),
    },
  };
  const dossier = dossierVideo(positionals[0]!);
  log.info('Vidéo : %s', dossier);
  await genererVoix(dossier, cfg, { dryRun: values['dry-run'], forcer: values.forcer, log: (m) => log.info(m), dureeMinCible: nombre(env, 'DUREE_MIN_CIBLE', 0, 180) });
  return 0;
}

// Lancé en ligne de commande (pas importé par les tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      createLogger('vr-voix').error(err instanceof ErreurElevenLabs ? err.message : (err as Error).message);
      process.exit(1);
    },
  );
}
