/**
 * usine : fabrique sur ton PC les vidéos que les agents ont poussées sur GitHub.
 *
 *   .\usine.cmd                 → git pull, puis voix + fonds + rendu de chaque nouvelle vidéo,
 *                                 rangée avec ses textes dans le dossier « À publier »
 *   .\usine.cmd --dry-run       → montre ce qui serait fabriqué, sans rien dépenser ni télécharger
 *   .\usine.cmd --video 08-x    → une seule vidéo (même si elle a déjà été faite)
 *   .\usine.cmd --sans-git      → ne touche pas à git (ni pull, ni rapport)
 *
 * Lancée toute seule par le Planificateur de tâches (voir installer.ps1).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createLogger, envBool, loadEnv, REPO_ROOT } from '../../shared/index.ts';
import { chaineDe, compteurDuJour, decider, empreinte, ETAT_VIDE, MAX_ESSAIS, nomSur, resumeRapport, textesCompilation, titreChapitre, trier, type Etat } from './lib.ts';

const ICI = import.meta.dirname;
const OUTILS = path.join(REPO_ROOT, 'tools');
const VIDEOS = path.join(OUTILS, 'vr-video', 'videos');
const FICHIER_ETAT = path.join(ICI, 'etat.local.json');
const FICHIER_VERROU = path.join(ICI, 'usine.lock');
const FICHIER_RAPPORT = path.join(ICI, 'rapport.json');

const env = loadEnv({
  toolDir: ICI,
  defaults: {
    USINE_ACTIVE: 'true',
    DOSSIER_A_PUBLIER: '',
    MAX_PAR_PASSAGE: '3',
    MAX_PAR_JOUR: '4',
    GIT_AUTO: 'true',
    POUSSER_RAPPORT: 'true',
    DOSSIER_CAPTURES: '',
    COMPILATION_AUTO: 'true',
    COMPILATION_JOUR: '0',
    COMPILATION_HEURE: '18',
    COMPILATION_MIN: '3',
  },
});
const log = createLogger('usine');

function entier(nom: keyof typeof env, min: number, max: number): number {
  const v = Number(env[nom]);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${nom} doit être un entier entre ${min} et ${max} (reçu : "${env[nom]}")`);
  return v;
}

const dossierAPublier = env.DOSSIER_A_PUBLIER ? path.resolve(env.DOSSIER_A_PUBLIER) : path.join(os.homedir(), 'Videos', 'A publier');

// ─────────────── Petits utilitaires ───────────────
function lireEtat(): Etat {
  try {
    return { ...ETAT_VIDE, ...JSON.parse(readFileSync(FICHIER_ETAT, 'utf8')) } as Etat;
  } catch {
    return structuredClone(ETAT_VIDE);
  }
}
function ecrireJson(fichier: string, data: unknown): void {
  const tmp = `${fichier}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, fichier);
}
function lireTexte(f: string): string {
  return existsSync(f) ? readFileSync(f, 'utf8').replace(/^﻿/, '') : '';
}
const aujourdhui = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale

/** Verrou : une seule usine à la fois (un rendu peut durer plus que l'intervalle du planificateur). */
function prendreVerrou(): boolean {
  if (existsSync(FICHIER_VERROU)) {
    const age = Date.now() - statSync(FICHIER_VERROU).mtimeMs;
    if (age < 3 * 3600_000) return false;
    log.warn('Ancien verrou de plus de 3 h ignoré (passage précédent interrompu).');
  }
  writeFileSync(FICHIER_VERROU, String(process.pid));
  return true;
}
function rendreVerrou(): void {
  rmSync(FICHIER_VERROU, { force: true });
}

function git(args: string[], timeout = 120_000): { ok: boolean; sortie: string } {
  const r = spawnSync('git', ['-C', REPO_ROOT, ...args], {
    encoding: 'utf8', timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true,
  });
  return { ok: r.status === 0, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** Lance un outil du dépôt (node + TypeScript), sortie dans la console et dans son propre journal. */
function lancerOutil(outil: string, fichier: string, args: string[], envEnPlus: Record<string, string> = {}): boolean {
  const script = path.join(OUTILS, outil, fichier);
  log.info(`  → ${outil} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', script, ...args], {
    cwd: path.join(OUTILS, outil), stdio: 'inherit', windowsHide: true, timeout: 2 * 3600_000, env: { ...process.env, ...envEnPlus },
  });
  return r.status === 0;
}

// ─────────────── Étape 1 : récupérer le travail des agents ───────────────
function recupererDepot(): void {
  const avant = git(['rev-parse', 'HEAD']).sortie;
  const pull = git(['pull', '--ff-only', '--autostash']);
  if (!pull.ok) {
    log.warn(`git pull impossible, je continue avec ce qui est déjà sur le PC :\n${pull.sortie}`);
    log.warn('Le plus souvent : un fichier modifié à la main entre en conflit. Lance « git status » dans le dépôt pour voir lequel.');
    return;
  }
  const apres = git(['rev-parse', 'HEAD']).sortie;
  if (avant === apres) {
    log.info('Dépôt à jour, rien de nouveau sur GitHub.');
    return;
  }
  const changes = git(['diff', '--name-only', avant, apres]).sortie.split(/\r?\n/).filter(Boolean);
  log.info(`Récupéré depuis GitHub : ${changes.length} fichier(s) modifié(s) (${avant.slice(0, 7)} → ${apres.slice(0, 7)}).`);
  installerDependances(changes);
}

/** npm ci dans un outil dont les dépendances ont changé (ou jamais installées). */
function installerDependances(changes: string[]): void {
  for (const outil of ['vr-video', 'vr-voix', 'vr-fonds']) {
    const dossier = path.join(OUTILS, outil);
    const pkg = path.join(dossier, 'package.json');
    if (!existsSync(pkg)) continue;
    const deps = Object.keys((JSON.parse(readFileSync(pkg, 'utf8')) as { dependencies?: object }).dependencies ?? {});
    if (!deps.length) continue;
    const verrouChange = changes.some((c) => c === `tools/${outil}/package-lock.json` || c === `tools/${outil}/package.json`);
    if (!verrouChange && existsSync(path.join(dossier, 'node_modules'))) continue;
    log.info(`Installation des dépendances de ${outil} (npm ci)…`);
    const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit', shell: true, windowsHide: true, timeout: 20 * 60_000 });
    if (r.status !== 0) log.error(`npm ci a échoué dans ${outil} : les rendus risquent d'échouer.`);
  }
}

// ─────────────── Étape 1 bis : captures PS5 déposées (vr-clips) ───────────────
const EXT_VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);
/** Dossier des captures : DOSSIER_CAPTURES de l'usine (ex. un dossier Google Drive), sinon celui de vr-clips. */
const dossierCaptures = env.DOSSIER_CAPTURES ? path.resolve(env.DOSSIER_CAPTURES) : '';

/** Crée un dossier de vidéo gameplay par nouvelle capture, dans l'ordre de la liste de tournage (vr-clips). */
function importerCaptures(dryRun: boolean): void {
  const entree = dossierCaptures || path.join(OUTILS, 'vr-clips', 'entree');
  if (dossierCaptures) mkdirSync(dossierCaptures, { recursive: true });
  if (!existsSync(entree)) return;
  const nb = readdirSync(entree).filter((f) => EXT_VIDEO.has(path.extname(f).toLowerCase())).length;
  if (!nb) return;
  log.info(`Captures PS5 trouvées dans ${entree} : import par vr-clips…`);
  const ok = lancerOutil('vr-clips', 'clips.ts', dryRun ? ['--dry-run'] : [], dossierCaptures ? { CLIPS_ENTREE: dossierCaptures } : {});
  if (!ok) log.warn('vr-clips a signalé un problème (voir logs\\vr-clips) : les captures seront réessayées au prochain passage.');
}

/** Expériences déjà importées par vr-clips (pour le tableau de bord). */
function experiencesImportees(): Record<string, { dossier: string; capture: string }> {
  try {
    return (JSON.parse(lireTexte(path.join(OUTILS, 'vr-clips', '.importes.json'))) as { experiences?: Record<string, { dossier: string; capture: string }> }).experiences ?? {};
  } catch {
    return {};
  }
}

// ─────────────── Étape 2 : quelles vidéos fabriquer ───────────────
function lireIgnorees(): Set<string> {
  return new Set(lireTexte(path.join(ICI, 'ignorer.txt')).split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean));
}

interface Video {
  nom: string;
  dossier: string;
  script: Record<string, unknown> & { titre?: string; theme?: unknown; auto?: unknown; gameplay?: { fichier?: string } };
  empreinte: string;
  chaine: string;
  captureOk: boolean;
  dejaRendue: boolean;
}

function listerVideos(): { videos: Video[]; illisibles: string[] } {
  const videos: Video[] = [];
  const illisibles: string[] = [];
  if (!existsSync(VIDEOS)) return { videos, illisibles };
  for (const e of readdirSync(VIDEOS, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dossier = path.join(VIDEOS, e.name);
    const fichierScript = path.join(dossier, 'script.json');
    if (!existsSync(fichierScript)) continue;
    const brut = lireTexte(fichierScript);
    try {
      const script = JSON.parse(brut) as Video['script'];
      const g = script.gameplay;
      const mp4Manuel = path.join(OUTILS, 'vr-video', 'sortie', `${e.name}.mp4`);
      videos.push({
        nom: e.name, dossier, script,
        empreinte: empreinte(brut, lireTexte(path.join(dossier, 'publication.txt'))),
        chaine: chaineDe(script),
        captureOk: !g || existsSync(path.join(dossier, g.fichier ?? 'gameplay.mp4')),
        dejaRendue: existsSync(mp4Manuel) && statSync(mp4Manuel).mtimeMs >= statSync(fichierScript).mtimeMs,
      });
    } catch {
      illisibles.push(e.name);
    }
  }
  return { videos, illisibles };
}

// ─────────────── Étape 3 : fabriquer une vidéo ───────────────
function fabriquer(v: Video): string {
  const cible = path.join(dossierAPublier, nomSur(v.chaine), nomSur(v.nom));
  mkdirSync(cible, { recursive: true });
  const mp4 = path.join(cible, `${nomSur(v.nom)}.mp4`);

  if (!lancerOutil('vr-voix', 'voix.ts', [v.nom])) throw new Error('voix (vr-voix) en échec : regarde logs\\vr-voix');
  if (!v.script.gameplay && !lancerOutil('vr-fonds', 'fonds.ts', [v.nom])) {
    log.warn('  Clips Pixabay en échec : rendu avec les clips déjà en bibliothèque (ou le fond animé).');
  }
  if (!lancerOutil('vr-video', 'rendu.ts', [v.dossier, '--sortie', mp4])) throw new Error('rendu (vr-video) en échec : regarde logs\\vr-video');
  if (!existsSync(mp4)) throw new Error(`rendu terminé mais ${mp4} est introuvable`);

  // Textes de publication à côté de la vidéo (écrits par les agents), sinon un minimum depuis le script.
  const pub = path.join(v.dossier, 'publication.txt');
  if (existsSync(pub)) copyFileSync(pub, path.join(cible, 'publication.txt'));
  else writeFileSync(path.join(cible, 'publication.txt'), `${v.script.titre ?? v.nom}\nChaîne : ${v.chaine}\n\n(Pas de textes de publication fournis par les agents pour cette vidéo.)\n`);
  return mp4;
}

// ─────────────── Étape 3 bis : compilation 16:9 de la semaine (le dimanche) ───────────────
function compilationsDeLaSemaine(etat: Etat, videos: Video[], dryRun: boolean): void {
  if (!envBool('COMPILATION_AUTO', true)) return;
  const maintenant = new Date();
  if (maintenant.getDay() !== entier('COMPILATION_JOUR', 0, 6) || maintenant.getHours() < entier('COMPILATION_HEURE', 0, 23)) return;
  const jour = aujourdhui();
  const parNom = new Map(videos.map((v) => [v.nom, v]));
  const chaines = new Set(Object.keys(etat.videos).map((n) => parNom.get(n)?.chaine).filter((c): c is string => !!c));
  for (const chaine of chaines) {
    if (etat.compilations?.[chaine] === jour) continue;
    const semaine = trier(Object.entries(etat.videos)
      .filter(([nom, e]) => e.statut === 'prete' && parNom.get(nom)?.chaine === chaine && Date.now() - Date.parse(e.le) < 7 * 864e5)
      .map(([nom]) => nom))
      .map((nom) => ({ nom, fichier: path.join(dossierAPublier, nomSur(chaine), nomSur(nom), `${nomSur(nom)}.mp4`), titre: titreChapitre(String(parNom.get(nom)?.script.titre ?? nom)) }))
      .filter((x) => existsSync(x.fichier));
    if (semaine.length < entier('COMPILATION_MIN', 2, 50)) {
      log.info(`Compilation ${chaine} : ${semaine.length} vidéo(s) cette semaine encore dans « A publier », pas assez.`);
      continue;
    }
    const nom = `Compilation-${jour}`;
    const cible = path.join(dossierAPublier, nomSur(chaine), nom);
    const mp4 = path.join(cible, `${nom}.mp4`);
    if (dryRun) {
      log.info(`[dry-run] compilerait ${semaine.length} vidéos ${chaine} → ${mp4}`);
      continue;
    }
    log.info(`▶ Compilation ${chaine} de la semaine (${semaine.length} vidéos)`);
    const theme = parNom.get(semaine[0]!.nom)?.script.theme;
    const liste = path.join(ICI, 'compilation.local.json');
    ecrireJson(liste, { theme: typeof theme === 'string' ? theme : 'vice-radar', videos: semaine.map(({ fichier, titre }) => ({ fichier, titre })) });
    if (!lancerOutil('vr-video', 'compil.ts', [liste, '--sortie', mp4])) {
      log.error(`✘ Compilation ${chaine} en échec (voir logs\\vr-video) : réessayée au prochain passage.`);
      continue;
    }
    let chapitres: { titre: string; debut: number }[] = [];
    try {
      chapitres = JSON.parse(lireTexte(path.join(cible, `${nom}.chapitres.json`)));
    } catch {
      /* pas de chapitres : description sans horodatage */
    }
    const duree = chapitres.length ? chapitres[chapitres.length - 1]!.debut + 35 : semaine.length * 35;
    const t = textesCompilation(chaine, chapitres, duree);
    writeFileSync(path.join(cible, 'publication.txt'), `${t.titre}\nChaîne : ${chaine} (YouTube, format 16:9)\n\n=== YOUTUBE ===\nTitre : ${t.titre}\n\n${t.description}\n`);
    etat.compilations = { ...etat.compilations, [chaine]: jour };
    etat.compilationsFaites = [{ nom, chaine, le: new Date().toISOString(), titre: t.titre, description: t.description }, ...(etat.compilationsFaites ?? [])].slice(0, 10);
    ecrireJson(FICHIER_ETAT, etat);
    log.info(`✔ Compilation ${chaine} prête : ${mp4}`);
  }
}

// ─────────────── Étape 3 ter : statistiques TikTok (toutes les 6 h, si un compte est connecté) ───────────────
function statsTikTok(etat: Etat & { statsLe?: string }): void {
  const outil = path.join(OUTILS, 'tiktok-stats');
  if (!existsSync(path.join(outil, 'jetons.local.json')) || !existsSync(path.join(outil, '.env'))) return;
  if (etat.statsLe && Date.now() - Date.parse(etat.statsLe) < 6 * 3600_000) return;
  log.info('Mise à jour des statistiques TikTok…');
  if (lancerOutil('tiktok-stats', 'stats.ts', ['--sortie', path.join(dossierAPublier, 'tiktok-stats.txt')])) etat.statsLe = new Date().toISOString();
  else log.warn('Statistiques TikTok en échec (voir logs\\tiktok-stats) : réessayées au prochain passage.');
}

// ─────────────── Étape 4 : rapport poussé sur GitHub (lu par les agents) ───────────────
interface Quota {
  faitesAujourdhui: number;
  maxParJour: number;
  maxParPassage: number;
  /** Vidéos prêtes à fabriquer mais retenues par la limite du jour (reprises toutes seules dès demain). */
  enAttente: string[];
}

function ecrireRapport(etat: Etat, videos: Video[], attente: string[], quota: Quota): void {
  const parNom = new Map(videos.map((v) => [v.nom, v]));
  const { prete, erreur } = resumeRapport(etat);
  const rapport = {
    majLe: new Date().toISOString(),
    pc: os.hostname(),
    pretes: prete.map((nom) => ({ nom, chaine: parNom.get(nom)?.chaine ?? '', le: etat.videos[nom]!.le })),
    erreurs: erreur.map((nom) => ({ nom, erreur: etat.videos[nom]!.erreur ?? '', essais: etat.videos[nom]!.essais ?? 1 })),
    enAttenteDeCapture: attente,
    enAttenteDeQuota: quota.enAttente,
    quota: { faitesAujourdhui: quota.faitesAujourdhui, maxParJour: quota.maxParJour, maxParPassage: quota.maxParPassage },
    tournage: experiencesImportees(),
    compilations: etat.compilationsFaites ?? [],
  };
  ecrireJson(FICHIER_RAPPORT, rapport);
  // Copie lisible par le tableau de bord (via Google Drive si « A publier » est dans Drive).
  try {
    mkdirSync(dossierAPublier, { recursive: true });
    writeFileSync(path.join(dossierAPublier, 'usine-rapport.txt'), JSON.stringify(rapport, null, 2) + '\n');
  } catch (err) {
    log.warn(`Copie du rapport dans ${dossierAPublier} impossible : ${(err as Error).message}`);
  }
}

function pousserRapport(n: number): void {
  if (!git(['status', '--porcelain', '--', FICHIER_RAPPORT]).sortie) return;
  git(['add', '--', FICHIER_RAPPORT]);
  const c = git(['commit', '-m', `usine : rapport (${n} vidéo(s) fabriquée(s))`, '--', FICHIER_RAPPORT]);
  if (!c.ok) return log.warn(`Commit du rapport impossible :\n${c.sortie}`);
  let p = git(['push']);
  if (!p.ok) {
    git(['pull', '--rebase', '--autostash']);
    p = git(['push']);
  }
  if (p.ok) log.info('Rapport poussé sur GitHub (les agents verront les vidéos prêtes).');
  else log.warn(`Push du rapport impossible (pas grave, réessayé au prochain passage) :\n${p.sortie}`);
}

// ─────────────── Programme principal ───────────────
async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'sans-git': { type: 'boolean', default: false },
      video: { type: 'string' },
    },
  });
  const dryRun = values['dry-run'];
  if (!envBool('USINE_ACTIVE', true)) {
    log.info('USINE_ACTIVE=false dans tools\\usine\\.env : rien à faire.');
    return 0;
  }
  if (!dryRun && !prendreVerrou()) {
    log.info('Une autre usine tourne déjà (rendu en cours) : je laisse faire.');
    return 0;
  }
  try {
    const avecGit = !values['sans-git'] && envBool('GIT_AUTO', true);
    if (avecGit && !dryRun) recupererDepot();
    importerCaptures(dryRun);

    const etat = compteurDuJour(lireEtat(), aujourdhui());
    const ignorees = lireIgnorees();
    const { videos, illisibles } = listerVideos();
    illisibles.forEach((n) => log.error(`${n} : script.json illisible (JSON invalide), vidéo ignorée.`));

    const aFaire: { v: Video; raison: string }[] = [];
    const attente: string[] = [];
    for (const v of trier(videos.map((x) => x.nom)).map((n) => videos.find((x) => x.nom === n)!)) {
      if (values.video && v.nom !== values.video) continue;
      const d = values.video ? { action: 'fabriquer' as const, raison: 'demandée' } : decider(v, etat, ignorees);
      if (d.action === 'fabriquer') aFaire.push({ v, raison: d.raison });
      else if (d.raison === 'attend_capture') attente.push(v.nom);
      else if (d.raison === 'deja_rendue_avant_usine' && !dryRun) {
        etat.videos[v.nom] = { empreinte: v.empreinte, statut: 'deja', le: new Date().toISOString() };
      } else if (d.raison === 'trop_d_erreurs') log.warn(`${v.nom} : ${MAX_ESSAIS} échecs de suite, je ne réessaie plus (corrige puis modifie le script, ou lance --video ${v.nom}).`);
    }
    if (values.video && !aFaire.length) log.error(`Vidéo « ${values.video} » introuvable dans ${VIDEOS}.`);
    if (attente.length) log.info(`En attente de ta capture PS5 : ${attente.join(', ')}`);

    const parPassage = entier('MAX_PAR_PASSAGE', 1, 50);
    const parJour = entier('MAX_PAR_JOUR', 1, 100);
    // --video = demande explicite de ta part : la limite du jour (garde-fou crédits) ne s'applique pas.
    const reste = values.video ? aFaire.length : Math.max(0, Math.min(parPassage, parJour - etat.faitesAujourdhui));
    if (values.video) log.info(`Fabrication demandée à la main : limites par passage (${parPassage}) et par jour (${parJour}) ignorées.`);
    if (!aFaire.length) log.info('Aucune nouvelle vidéo à fabriquer.');
    else log.info(`${aFaire.length} vidéo(s) à fabriquer, ${Math.min(reste, aFaire.length)} maintenant (max ${parPassage} par passage, ${parJour} par jour, ${etat.faitesAujourdhui} déjà faite(s) aujourd'hui).`);

    if (dryRun) {
      compilationsDeLaSemaine(etat, videos, true);
      aFaire.forEach(({ v, raison }, i) => log.info(`[dry-run] ${i < reste ? 'fabriquerait' : 'plus tard  '} ${v.nom} (${v.chaine}, ${raison}) → ${path.join(dossierAPublier, nomSur(v.chaine), nomSur(v.nom))}`));
      return 0;
    }

    let faites = 0;
    for (const { v, raison } of aFaire.slice(0, reste)) {
      log.info(`▶ ${v.nom} (${v.chaine}, ${raison})`);
      try {
        const mp4 = fabriquer(v);
        etat.videos[v.nom] = { empreinte: v.empreinte, statut: 'prete', le: new Date().toISOString() };
        etat.faitesAujourdhui++;
        faites++;
        log.info(`✔ ${v.nom} prête : ${mp4}`);
      } catch (err) {
        const precedent = etat.videos[v.nom];
        const essais = precedent?.statut === 'erreur' && precedent.empreinte === v.empreinte ? (precedent.essais ?? 1) + 1 : 1;
        etat.videos[v.nom] = { empreinte: v.empreinte, statut: 'erreur', le: new Date().toISOString(), erreur: (err as Error).message, essais };
        log.error(`✘ ${v.nom} : ${(err as Error).message}`);
      }
      ecrireJson(FICHIER_ETAT, etat); // sauvegarde après chaque vidéo : un arrêt du PC ne perd rien
    }
    compilationsDeLaSemaine(etat, videos, false);
    statsTikTok(etat);
    ecrireJson(FICHIER_ETAT, etat);
    ecrireRapport(etat, videos, attente, {
      faitesAujourdhui: etat.faitesAujourdhui,
      maxParJour: parJour,
      maxParPassage: parPassage,
      enAttente: aFaire.slice(reste).map(({ v }) => v.nom),
    });
    if (avecGit && envBool('POUSSER_RAPPORT', true)) pousserRapport(faites);
    if (faites) log.info(`${faites} vidéo(s) prête(s) dans ${dossierAPublier}`);
    return 0;
  } finally {
    if (!dryRun) rendreVerrou();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error((err as Error).message);
    rendreVerrou();
    process.exit(1);
  },
);
