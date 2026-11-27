/**
 * Logique pure de l'usine (sans accès disque ni réseau) : testée dans tests/lib.test.ts.
 */
import { createHash } from 'node:crypto';
import { theme } from '../vr-video/src/themes.ts';

export interface EntreeEtat {
  empreinte: string;
  statut: 'prete' | 'deja' | 'erreur';
  le: string; // ISO
  erreur?: string;
  essais?: number;
}

export interface Compil {
  nom: string;
  chaine: string;
  le: string;
  titre: string;
  description: string;
}

export interface Etat {
  videos: Record<string, EntreeEtat>;
  /** Dernière compilation par chaîne (AAAA-MM-JJ) et les compilations faites (les 10 dernières). */
  compilations?: Record<string, string>;
  compilationsFaites?: Compil[];
  /** Compteur du jour, pour ne pas vider tous les crédits ElevenLabs d'un coup. */
  jour: string; // AAAA-MM-JJ
  faitesAujourdhui: number;
}

export const ETAT_VIDE: Etat = { videos: {}, jour: '', faitesAujourdhui: 0 };

export type Decision =
  | { action: 'fabriquer'; raison: string }
  | { action: 'passer'; raison: 'deja_faite' | 'ignoree' | 'auto_off' | 'attend_capture' | 'attend_commentaire' | 'trop_d_erreurs' | 'deja_rendue_avant_usine' };

export interface InfosVideo {
  nom: string;
  script: { theme?: unknown; auto?: unknown; gameplay?: { fichier?: string } | undefined; commentaire?: unknown; commentaires?: unknown };
  empreinte: string;
  /** La capture de jeu demandée par le script est présente (vidéos gameplay). */
  captureOk: boolean;
  /** Un MP4 plus récent que le script existe déjà dans tools\vr-video\sortie (rendu fait à la main). */
  dejaRendue: boolean;
  /** Date (ms) de la planche envoyée à l'Agent web, si la vidéo attend ses commentaires. */
  plancheLe?: number;
}

/** Heures d'attente des commentaires de l'Agent web avant de rendre quand même (accroche seule). */
export const ATTENTE_COMMENTAIRE_H = 48;

const nbCommentaires = (script: InfosVideo['script']): number => (Array.isArray(script.commentaires) ? script.commentaires.length : 0);

/**
 * Vidéo gameplay qui a besoin d'une planche (pour que l'Agent web écrive les commentaires calés) : capture
 * présente, pas encore de commentaires, et ni « fait » ni « sans ». Si elle attend déjà (« a_ecrire »), on
 * refait la planche seulement si elle manque.
 */
export function aBesoinDePlanche(v: InfosVideo): boolean {
  if (!v.script.gameplay || !v.captureOk || nbCommentaires(v.script) > 0) return false;
  if (v.script.commentaire === 'fait' || v.script.commentaire === 'sans') return false;
  return v.script.commentaire !== 'a_ecrire' || v.plancheLe === undefined;
}

export const MAX_ESSAIS = 3;

/** Empreinte du contenu qui change la vidéo : script et textes de publication. */
export function empreinte(script: string, publication = ''): string {
  return createHash('sha256').update(script.replace(/\r\n/g, '\n')).update('\0').update(publication.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

export function decider(v: InfosVideo, etat: Etat, ignorees: Set<string>, maintenant = Date.now(), attenteH = ATTENTE_COMMENTAIRE_H): Decision {
  if (ignorees.has(v.nom)) return { action: 'passer', raison: 'ignoree' };
  if (v.script.auto === false) return { action: 'passer', raison: 'auto_off' };
  // Vidéo gameplay en attente des commentaires de l'Agent web : on patiente, puis on rend quand même.
  let raisonAttente = '';
  if (v.script.gameplay && v.script.commentaire === 'a_ecrire' && nbCommentaires(v.script) === 0) {
    if (v.plancheLe === undefined || maintenant - v.plancheLe < attenteH * 3_600_000) return { action: 'passer', raison: 'attend_commentaire' };
    raisonAttente = `sans commentaires (attendus plus de ${attenteH} h)`;
  }
  const e = etat.videos[v.nom];
  if (e && e.empreinte === v.empreinte) {
    if (e.statut === 'erreur' && (e.essais ?? 1) < MAX_ESSAIS) return { action: 'fabriquer', raison: `nouvel essai (${(e.essais ?? 1) + 1}/${MAX_ESSAIS})` };
    if (e.statut === 'erreur') return { action: 'passer', raison: 'trop_d_erreurs' };
    return { action: 'passer', raison: 'deja_faite' };
  }
  if (!e && v.dejaRendue) return { action: 'passer', raison: 'deja_rendue_avant_usine' };
  if (v.script.gameplay && !v.captureOk) return { action: 'passer', raison: 'attend_capture' };
  return { action: 'fabriquer', raison: raisonAttente || (e ? 'script modifié' : 'nouvelle vidéo') };
}

/** Remet le compteur à zéro quand le jour change. */
export function compteurDuJour(etat: Etat, aujourdhui: string): Etat {
  return etat.jour === aujourdhui ? etat : { ...etat, jour: aujourdhui, faitesAujourdhui: 0 };
}

/** Nom de la chaîne d'une vidéo (thème du script). */
export function chaineDe(script: { theme?: unknown }): string {
  return theme(script.theme).chaine;
}

/** Nom de dossier sûr sous Windows. */
export function nomSur(s: string): string {
  return s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim() || 'video';
}

/**
 * Ordre de fabrication : Vice Radar d'abord (dossiers « 07-… », l'actu GTA 6 n'attend pas), puis les autres
 * chaînes (dossiers préfixés d'une lettre, « F01-… »), chacun par numéro croissant.
 */
export function trier(noms: string[]): string[] {
  const cle = (n: string): [number, number] => [/^\d/.test(n) ? 0 : 1, Number(n.match(/\d+/)?.[0] ?? 9999)];
  return [...noms].sort((a, b) => {
    const [ga, na] = cle(a);
    const [gb, nb] = cle(b);
    return ga - gb || na - nb || a.localeCompare(b);
  });
}

/**
 * Ordre de fabrication du passage : une vidéo de chaque chaîne à tour de rôle (Vice Radar, Faits animés,
 * Vice Radar…), chaque chaîne dans l'ordre de trier(). Avant (2026-11-27), Vice Radar passait entièrement
 * devant et prenait toute la limite du jour : F04 et F05 ont attendu 3 jours.
 */
export function ordreDeFabrication<T extends { nom: string; chaine: string }>(videos: T[]): T[] {
  const parNom = new Map(videos.map((v) => [v.nom, v]));
  const files = new Map<string, T[]>();
  for (const nom of trier(videos.map((v) => v.nom))) {
    const v = parNom.get(nom)!;
    files.set(v.chaine, [...(files.get(v.chaine) ?? []), v]);
  }
  const ordre: T[] = [];
  for (let i = 0; ordre.length < videos.length; i++) {
    for (const file of files.values()) {
      const v = file[i];
      if (v) ordre.push(v);
    }
  }
  return ordre;
}

/**
 * Les voix ont-elles été (re)générées pendant la fabrication ? Compare les signatures (nom, date, taille)
 * des fichiers *.meta.json de vr-voix avant et après. Un rendu refait sans nouvelle voix (code ou textes de
 * publication modifiés) ne coûte aucun crédit ElevenLabs : il ne compte pas dans la limite du jour.
 */
export function voixRegeneree(avant: string[], apres: string[]): boolean {
  const a = new Set(avant);
  return apres.some((s) => !a.has(s));
}

/** Ligne de journal lisible pour le rapport. */
export function resumeRapport(etat: Etat): { prete: string[]; erreur: string[] } {
  const prete: string[] = [];
  const erreur: string[] = [];
  for (const [nom, e] of Object.entries(etat.videos)) {
    if (e.statut === 'prete') prete.push(nom);
    if (e.statut === 'erreur') erreur.push(nom);
  }
  return { prete: trier(prete), erreur: trier(erreur) };
}

// ─────────────── Compilation de la semaine ───────────────

/** Titre court d'un Short pour un chapitre : sans « GTA 6 : » ni « E01 — ». */
export function titreChapitre(titre: string): string {
  return titre.replace(/^E\d+\s*[—–-]\s*/i, '').replace(/^GTA\s*6\s*:\s*/i, '').trim() || titre;
}

/** m:ss (ou h:mm:ss) pour les chapitres YouTube. */
export function horodatage(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Titre et description YouTube d'une compilation (chapitres : 1er à 0:00, au moins 3, 10 s minimum chacun). */
export function textesCompilation(chaine: string, chapitres: { titre: string; debut: number }[], dureeTotale: number): { titre: string; description: string } {
  const n = chapitres.length;
  const minutes = Math.max(1, Math.round(dureeTotale / 60));
  const vr = chaine === 'Vice Radar';
  const titre = vr ? `GTA 6 : ${n} secrets et expériences de la semaine (compilation)` : `${n} faits incroyables en ${minutes} minutes`;
  const intro = vr ? `Les ${n} vidéos Vice Radar de la semaine réunies : secrets, records et expériences dans GTA 6.` : `${n} faits étonnants expliqués en animation, réunis en ${minutes} minutes.`;
  const chap = chapitres.map((c) => `${horodatage(c.debut)} ${titreChapitre(c.titre)}`).join('\n');
  const tags = vr ? '#GTA6 #GTAVI #ViceCity #Compilation' : '#Faits #LeSaviezVous #Science #Compilation';
  return { titre, description: `${intro}\nLaquelle tu préfères ? Dis-le en commentaire.\n\nChapitres :\n${chap}\n\nVoix générée par IA.\n${tags}` };
}
