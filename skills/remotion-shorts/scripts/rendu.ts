/**
 * remotion-shorts : rendu d'une vidéo verticale (1080x1920) à partir d'un dossier de vidéo.
 *
 *   node --experimental-strip-types rendu.ts <dossier-de-la-video> [--dry-run] [--apercu 0,1.5,6] [--sortie fichier.mp4]
 *
 * Contenu d'un dossier de vidéo :
 *   script.json                       obligatoire (scènes, textes, voix)
 *   voix.mp3 | voix.wav               voix off (sinon vidéo muette au rythme de lecture)
 *   voix.mots.json                    minutage [{ mot, debut, fin }]
 *   voix.alignement.json              ou alignement brut ElevenLabs (characters + start/end times)
 *   musique.mp3                       musique propre à la vidéo (sinon MUSIQUE du .env)
 *   fonds/*.mp4                       clips propres à la vidéo (prioritaires sur la bibliothèque)
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { format, parseArgs } from 'node:util';
import {
  construirePlan, motsDepuisElevenLabs, motsSynthetiques, normaliser, verifierScript,
  type AlignementElevenLabs, type ClipDisponible, type Mot, type ScriptVideo,
} from './src/plan.ts';
import { estTheme, theme as themeDe } from './src/themes.ts';

const ICI = import.meta.dirname;
const EXTENSIONS_VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const EXTENSIONS_AUDIO = new Set(['.mp3', '.wav', '.m4a', '.ogg']);

const log = {
  info: (...a: unknown[]) => console.log(format(...a)),
  warn: (...a: unknown[]) => console.warn('ATTENTION', format(...a)),
  error: (...a: unknown[]) => console.error('ERREUR', format(...a)),
};

/** Lit `.env` à côté du moteur (CLE=valeur, # pour un commentaire). Les variables déjà définies gagnent. */
function lireEnv(defaults: Record<string, string>): Record<string, string> {
  const valeurs: Record<string, string> = { ...defaults };
  const fichier = path.join(ICI, '.env');
  if (existsSync(fichier)) {
    for (const ligne of readFileSync(fichier, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(ligne);
      if (m && !ligne.trim().startsWith('#')) valeurs[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  for (const cle of Object.keys(defaults)) if (process.env[cle]) valeurs[cle] = process.env[cle]!;
  return valeurs;
}

const env = lireEnv({
  BIBLIOTHEQUE_FONDS: '', MUSIQUE: '', VOLUME_MUSIQUE: '0.12', DUREE_MIN_CIBLE: '30', RYTHME_FONDS: '2.2', CRF: '18', CONCURRENCE: '',
  NAVIGATEUR: '', MARQUE_NOM: 'MA', MARQUE_ACCENT: 'CHAINE', DOSSIER_SORTIE: '', BARRE_PROGRESSION: 'true', BOUCLE: 'true',
});

const bool = (nom: keyof typeof env): boolean => !['false', '0', 'non', 'no'].includes(env[nom]!.toLowerCase());

function nombre(nom: keyof typeof env, min: number, max: number): number {
  const v = Number(env[nom]!.replace(',', '.'));
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${nom} doit être un nombre entre ${min} et ${max} (reçu : "${env[nom]}")`);
  return v;
}

async function dureeMedia(fichier: string): Promise<number> {
  const { parseMedia } = await import('@remotion/media-parser');
  const { nodeReader } = await import('@remotion/media-parser/node');
  const res = await parseMedia({ src: fichier, reader: nodeReader, fields: { slowDurationInSeconds: true }, acknowledgeRemotionLicense: true });
  return res.slowDurationInSeconds;
}

function lireJson<T>(fichier: string): T {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8').replace(/^﻿/, '')) as T;
  } catch (err) {
    throw new Error(`${path.basename(fichier)} : JSON invalide (${(err as Error).message})`);
  }
}

function premierExistant(dossier: string, noms: string[]): string | null {
  for (const n of noms) if (existsSync(path.join(dossier, n))) return path.join(dossier, n);
  return null;
}

function listerClips(dossier: string): string[] {
  if (!dossier || !existsSync(dossier)) return [];
  return readdirSync(dossier, { withFileTypes: true })
    .filter((e) => e.isFile() && EXTENSIONS_VIDEO.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dossier, e.name));
}

/** Mots-clés d'un clip : tokens du nom de fichier (« ville-nuit-neons-01.mp4 » → ville, nuit, neons). */
function motsClesClip(fichier: string): string[] {
  const nom = path.basename(fichier, path.extname(fichier));
  return [...new Set(nom.split(/[-_\s.]+/).filter((t) => t && !/^\d+$/.test(t)).map(normaliser))];
}

/**
 * Musique : musique.* dans le dossier de la vidéo, sinon MUSIQUE du .env (fichier ou dossier). Dans un dossier,
 * le choix dépend du nom de la vidéo : même morceau à chaque rendu, morceaux différents d'une vidéo à l'autre.
 */
function choisirMusique(dossierVideo: string, nomVideo: string, reglage: string): string | null {
  const propre = premierExistant(dossierVideo, ['musique.mp3', 'musique.wav', 'musique.m4a']);
  if (propre) return propre;
  if (!reglage) return null;
  const source = path.resolve(reglage);
  if (!existsSync(source)) throw new Error(`MUSIQUE introuvable : ${source}`);
  if (!statSync(source).isDirectory()) return source;
  const morceaux = readdirSync(source).filter((f) => EXTENSIONS_AUDIO.has(path.extname(f).toLowerCase())).sort();
  if (!morceaux.length) return null;
  const h = createHash('sha256').update(nomVideo).digest().readUInt32BE(0);
  return path.join(source, morceaux[h % morceaux.length]!);
}

/** Copie (ou lien physique, instantané) d'un fichier dans le dossier public du rendu. */
function placer(source: string, cible: string): void {
  mkdirSync(path.dirname(cible), { recursive: true });
  if (existsSync(cible)) return;
  try {
    linkSync(source, cible);
  } catch {
    copyFileSync(source, cible);
  }
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
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      apercu: { type: 'string' },
      sortie: { type: 'string' },
    },
  });
  if (!values['dry-run'] && optionNpm('dry-run') === 'true') values['dry-run'] = true;
  if (!values.apercu && optionNpm('apercu')) values.apercu = optionNpm('apercu') === 'true' ? '' : optionNpm('apercu');
  // « --apercu 0,1.5,6 » tapé dans PowerShell arrive en « 0 1.5 6 » : les nombres en trop sont des instants d'aperçu.
  const nombres = positionals.slice(1).filter((p) => /^\d+([.,]\d+)?$/.test(p));
  if (nombres.length && (values.apercu !== undefined || optionNpm('apercu') !== undefined)) {
    values.apercu = [values.apercu, ...nombres].filter(Boolean).join(',');
    positionals.splice(1, nombres.length);
  }
  if (positionals.length !== 1) {
    log.error('Usage : rendu.ts <dossier-de-la-video> [--dry-run] [--apercu 0,3] [--sortie fichier.mp4]');
    return 1;
  }
  const dossier = path.resolve(positionals[0]!);
  const nom = path.basename(dossier);
  const fichierScript = path.join(dossier, 'script.json');
  if (!existsSync(fichierScript)) throw new Error(`script.json introuvable dans ${dossier}`);

  const script = lireJson<ScriptVideo>(fichierScript);
  const erreurs = verifierScript(script);
  if (erreurs.length) {
    erreurs.forEach((e) => log.error(e));
    return 1;
  }

  // ── Voix et minutage ──
  const voix = premierExistant(dossier, ['voix.mp3', 'voix.wav', 'voix.m4a']);
  let mots: Mot[];
  const fichierMots = premierExistant(dossier, ['voix.mots.json']);
  const fichierAlignement = premierExistant(dossier, ['voix.alignement.json']);
  if (fichierMots) {
    mots = lireJson<Mot[]>(fichierMots);
    log.info('Minutage : %s (%d mots)', path.basename(fichierMots), mots.length);
  } else if (fichierAlignement) {
    const brut = lireJson<{ alignment?: AlignementElevenLabs } & Partial<AlignementElevenLabs>>(fichierAlignement);
    mots = motsDepuisElevenLabs((brut.alignment ?? brut) as AlignementElevenLabs);
    log.info('Minutage ElevenLabs converti : %d mots', mots.length);
  } else {
    mots = motsSynthetiques(script.scenes);
    if (voix) {
      // Voix sans minutage : on étire le rythme de lecture sur la durée réelle de l'audio.
      const d = await dureeMedia(voix);
      const fin = mots[mots.length - 1]?.fin ?? d;
      const k = (d - 0.15) / fin;
      mots = mots.map((m) => ({ ...m, debut: m.debut * k, fin: m.fin * k }));
      log.warn('Pas de voix.mots.json : sous-titres calés approximativement sur la durée de la voix (%ss).', d.toFixed(1));
    } else {
      log.warn('Pas de voix : vidéo muette, rythme de lecture estimé (aperçu).');
    }
  }

  // ── Habillage et marque ──
  if (script.theme !== undefined && !estTheme(script.theme)) log.warn('Thème inconnu « %s » : thème « defaut ».', script.theme);
  const habillage = themeDe(script.theme, script.couleurs);
  const marque = script.marque ?? { nom: env.MARQUE_NOM!, accent: env.MARQUE_ACCENT! };
  const musique = choisirMusique(dossier, nom, env.MUSIQUE!);

  /** Fichiers à copier dans le dossier public du rendu : chemin public → fichier réel. */
  const publics = new Map<string, string>();
  if (voix) publics.set(`audio/voix${path.extname(voix)}`, voix);
  if (musique) publics.set(`audio/musique${path.extname(musique)}`, musique);
  const audio = voix ? `audio/voix${path.extname(voix)}` : null;
  const cheminMusique = musique ? `audio/musique${path.extname(musique)}` : null;

  // ── Clips de fond ──
  const dossierBiblio = env.BIBLIOTHEQUE_FONDS ? path.resolve(env.BIBLIOTHEQUE_FONDS) : '';
  const sources = new Map<string, string>(); // chemin public → fichier réel
  const clips: ClipDisponible[] = [];
  for (const [prefixe, liste] of [['fonds', listerClips(path.join(dossier, 'fonds'))], ['biblio', listerClips(dossierBiblio)]] as const) {
    for (const f of liste) {
      const chemin = `${prefixe}/${path.basename(f)}`;
      try {
        clips.push({ chemin, duree: await dureeMedia(f), motsCles: motsClesClip(f) });
        sources.set(chemin, f);
      } catch (err) {
        log.warn('Clip ignoré (illisible) : %s (%s)', path.basename(f), (err as Error).message);
      }
    }
  }
  const plan = construirePlan(script, mots, clips, nombre('RYTHME_FONDS', 0.8, 10));
  for (const c of new Set(plan.fonds.map((f) => f.clip).filter((c): c is string => !!c))) publics.set(c, sources.get(c)!);
  const inputProps: Record<string, unknown> = {
    plan,
    audio,
    musique: cheminMusique,
    volumeMusique: nombre('VOLUME_MUSIQUE', 0, 1),
    marque,
    appelAction: script.fin ?? null,
    barreProgression: bool('BARRE_PROGRESSION'),
    boucle: bool('BOUCLE'),
    theme: script.theme,
    couleurs: script.couleurs,
  };

  // ── Résumé du plan ──
  log.info('« %s » : %ss, %d scènes, %d sous-titres, %d plans de fond (%d avec clip), voix %s, musique %s',
    script.titre ?? nom, plan.duree.toFixed(1), plan.scenes.length, plan.sousTitres.length, plan.fonds.length,
    plan.fonds.filter((f) => f.clip).length, voix ? path.basename(voix) : 'aucune', musique ? path.basename(musique) : 'aucune');
  plan.scenes.forEach((s, i) => log.info('  scène %d  %s → %ss  %s', i + 1, s.debut.toFixed(2).padStart(6), s.fin.toFixed(2), s.tag ?? s.lignes?.[0]?.texte ?? ''));
  log.info('  Logo : %s %s, couleur d\'accent %s', marque.nom, marque.accent, habillage.couleurs.rose);
  if (!clips.length) log.info('  Aucun clip trouvé : fond animé sans vidéo.');
  if (!musique) log.warn('  Pas de musique : mets musique.mp3 dans le dossier de la vidéo, ou règle MUSIQUE dans .env.');

  const cible = nombre('DUREE_MIN_CIBLE', 0, 180);
  if (cible && plan.duree < cible) {
    const motsParSeconde = mots.length / Math.max(1, mots[mots.length - 1]?.fin ?? plan.duree);
    log.warn('  Vidéo de %ss, sous les %s s visées : ajoute ~%d mots dans les « voix » du script (une scène de plus, par exemple), puis régénère la voix.',
      plan.duree.toFixed(1), cible, Math.ceil((cible - plan.duree) * motsParSeconde));
  }

  const dossierSortie = env.DOSSIER_SORTIE ? path.resolve(env.DOSSIER_SORTIE) : path.join(ICI, 'sortie');
  mkdirSync(dossierSortie, { recursive: true });
  writeFileSync(path.join(dossierSortie, `${nom}.plan.json`), JSON.stringify(plan, null, 2));

  if (values['dry-run']) {
    log.info('[dry-run] Plan écrit dans %s, aucun rendu.', path.join(dossierSortie, `${nom}.plan.json`));
    return 0;
  }

  // ── Dossier public du rendu : uniquement les fichiers utilisés ──
  const publicDir = path.join(ICI, '.rendu', nom, 'public');
  rmSync(path.join(ICI, '.rendu', nom), { recursive: true, force: true });
  for (const [cible, source] of publics) placer(source, path.join(publicDir, cible));

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
  log.info('Préparation du rendu (la première fois prend plus longtemps)…');
  const serveUrl = await bundle({ entryPoint: path.join(ICI, 'src', 'index.ts'), publicDir });
  const browserExecutable = env.NAVIGATEUR || null;
  const composition = await selectComposition({ serveUrl, id: 'Short', inputProps, browserExecutable });

  if (values.apercu) {
    for (const s of values.apercu.split(/[,;\s]+/).filter(Boolean).map((x) => Number(x.replace(',', '.')))) {
      const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(s * composition.fps)));
      const sortie = path.join(dossierSortie, `${nom}-${s}s.png`);
      await renderStill({ composition, serveUrl, output: sortie, frame, inputProps, browserExecutable });
      log.info('Aperçu : %s', sortie);
    }
    return 0;
  }

  const sortie = values.sortie ? path.resolve(values.sortie) : path.join(dossierSortie, `${nom}.mp4`);
  const concurrence = env.CONCURRENCE ? Math.max(1, Number(env.CONCURRENCE)) : Math.max(1, Math.floor(os.cpus().length / 2));
  let dernierPalier = -1;
  await renderMedia({
    composition, serveUrl, codec: 'h264', outputLocation: sortie, inputProps, crf: nombre('CRF', 1, 51),
    concurrency: concurrence, browserExecutable,
    onProgress: ({ progress }) => {
      const palier = Math.floor(progress * 10);
      if (palier > dernierPalier) {
        dernierPalier = palier;
        log.info('Rendu : %d %%', palier * 10);
      }
    },
  });
  rmSync(path.join(ICI, '.rendu', nom), { recursive: true, force: true });
  log.info('Vidéo prête : %s', sortie);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error((err as Error).message);
    process.exit(1);
  },
);
