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

export interface Etat {
  videos: Record<string, EntreeEtat>;
  /** Compteur du jour, pour ne pas vider tous les crédits ElevenLabs d'un coup. */
  jour: string; // AAAA-MM-JJ
  faitesAujourdhui: number;
}

export const ETAT_VIDE: Etat = { videos: {}, jour: '', faitesAujourdhui: 0 };

export type Decision =
  | { action: 'fabriquer'; raison: string }
  | { action: 'passer'; raison: 'deja_faite' | 'ignoree' | 'auto_off' | 'attend_capture' | 'trop_d_erreurs' | 'deja_rendue_avant_usine' };

export interface InfosVideo {
  nom: string;
  script: { theme?: unknown; auto?: unknown; gameplay?: { fichier?: string } | undefined };
  empreinte: string;
  /** La capture de jeu demandée par le script est présente (vidéos gameplay). */
  captureOk: boolean;
  /** Un MP4 plus récent que le script existe déjà dans tools\vr-video\sortie (rendu fait à la main). */
  dejaRendue: boolean;
}

export const MAX_ESSAIS = 3;

/** Empreinte du contenu qui change la vidéo : script et textes de publication. */
export function empreinte(script: string, publication = ''): string {
  return createHash('sha256').update(script.replace(/\r\n/g, '\n')).update('\0').update(publication.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
}

export function decider(v: InfosVideo, etat: Etat, ignorees: Set<string>): Decision {
  if (ignorees.has(v.nom)) return { action: 'passer', raison: 'ignoree' };
  if (v.script.auto === false) return { action: 'passer', raison: 'auto_off' };
  const e = etat.videos[v.nom];
  if (e && e.empreinte === v.empreinte) {
    if (e.statut === 'erreur' && (e.essais ?? 1) < MAX_ESSAIS) return { action: 'fabriquer', raison: `nouvel essai (${(e.essais ?? 1) + 1}/${MAX_ESSAIS})` };
    if (e.statut === 'erreur') return { action: 'passer', raison: 'trop_d_erreurs' };
    return { action: 'passer', raison: 'deja_faite' };
  }
  if (!e && v.dejaRendue) return { action: 'passer', raison: 'deja_rendue_avant_usine' };
  if (v.script.gameplay && !v.captureOk) return { action: 'passer', raison: 'attend_capture' };
  return { action: 'fabriquer', raison: e ? 'script modifié' : 'nouvelle vidéo' };
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
