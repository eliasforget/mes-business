/**
 * Client minimal de l'API TikTok (Login Kit pour ordinateur + Display API), sans dépendance.
 * fetch injectable pour les tests. Les jetons ne sont jamais écrits dans les journaux ni les erreurs.
 */
import { createHash, randomBytes } from 'node:crypto';

export type Fetch = typeof fetch;

export const URL_AUTORISATION = 'https://www.tiktok.com/v2/auth/authorize/';
export const URL_JETON = 'https://open.tiktokapis.com/v2/oauth/token/';
export const URL_API = 'https://open.tiktokapis.com/v2';
export const PORTEES = 'user.info.basic,user.info.stats,video.list';

export const CHAMPS_PROFIL = ['open_id', 'display_name', 'avatar_url', 'follower_count', 'following_count', 'likes_count', 'video_count'];
export const CHAMPS_PROFIL_BASE = ['open_id', 'display_name', 'avatar_url'];
export const CHAMPS_VIDEO = ['id', 'title', 'video_description', 'create_time', 'duration', 'share_url', 'view_count', 'like_count', 'comment_count', 'share_count'];

export interface Jetons {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  /** Échéances absolues (ms depuis 1970), calculées à la réception. */
  expire: number;
  expireRafraichissement: number;
}

export interface Profil {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

export interface VideoTikTok {
  id: string;
  title?: string;
  video_description?: string;
  create_time?: number;
  duration?: number;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export class ErreurTikTok extends Error {
  readonly code?: string;
  readonly statut?: number;
  constructor(message: string, code?: string, statut?: number) {
    super(message);
    this.code = code;
    this.statut = statut;
  }
}

/** PKCE : TikTok veut le SHA-256 du vérificateur en hexadécimal (pas en base64url). */
export function pkce(): { verificateur: string; defi: string } {
  const verificateur = randomBytes(48).toString('base64url').slice(0, 64);
  return { verificateur, defi: createHash('sha256').update(verificateur).digest('hex') };
}

export function urlAutorisation(cle: string, redirection: string, etat: string, defi: string): string {
  const u = new URL(URL_AUTORISATION);
  u.search = new URLSearchParams({ client_key: cle, response_type: 'code', scope: PORTEES, redirect_uri: redirection, state: etat, code_challenge: defi, code_challenge_method: 'S256', disable_auto_auth: '1' }).toString();
  return u.toString();
}

function versJetons(r: Record<string, unknown>, maintenant = Date.now()): Jetons {
  if (typeof r.access_token !== 'string' || typeof r.refresh_token !== 'string') {
    throw new ErreurTikTok(`Réponse de jeton inattendue : ${String(r.error_description ?? r.error ?? 'champ manquant')}`, String(r.error ?? ''));
  }
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    open_id: String(r.open_id ?? ''),
    scope: String(r.scope ?? ''),
    expire: maintenant + Number(r.expires_in ?? 0) * 1000,
    expireRafraichissement: maintenant + Number(r.refresh_expires_in ?? 0) * 1000,
  };
}

async function postFormulaire(f: Fetch, corps: Record<string, string>): Promise<Record<string, unknown>> {
  const rep = await f(URL_JETON, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(corps).toString() });
  const json = (await rep.json().catch(() => ({}))) as Record<string, unknown>;
  if (!rep.ok || json.error) throw new ErreurTikTok(`TikTok refuse le jeton (${rep.status}) : ${String(json.error_description ?? json.error ?? 'erreur inconnue')}`, String(json.error ?? ''), rep.status);
  return json;
}

export async function echangerCode(f: Fetch, p: { cle: string; secret: string; code: string; redirection: string; verificateur: string }): Promise<Jetons> {
  return versJetons(await postFormulaire(f, { client_key: p.cle, client_secret: p.secret, code: p.code, grant_type: 'authorization_code', redirect_uri: p.redirection, code_verifier: p.verificateur }));
}

export async function rafraichir(f: Fetch, p: { cle: string; secret: string; jetons: Jetons }): Promise<Jetons> {
  return versJetons(await postFormulaire(f, { client_key: p.cle, client_secret: p.secret, grant_type: 'refresh_token', refresh_token: p.jetons.refresh_token }));
}

/** Rafraîchit si le jeton expire dans moins de 10 minutes. */
export function aRafraichir(j: Jetons, maintenant = Date.now()): boolean {
  return j.expire - maintenant < 10 * 60_000;
}

async function appel<T>(f: Fetch, jeton: string, methode: 'GET' | 'POST', chemin: string, champs: string[], corps?: unknown): Promise<T> {
  const rep = await f(`${URL_API}${chemin}?fields=${champs.join(',')}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const json = (await rep.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string; log_id?: string } };
  const code = json.error?.code;
  if (!rep.ok || (code && code !== 'ok')) throw new ErreurTikTok(`API TikTok ${chemin} (${rep.status}) : ${json.error?.message || code || 'erreur inconnue'}${json.error?.log_id ? ` [log_id ${json.error.log_id}]` : ''}`, code, rep.status);
  return json.data as T;
}

/** Profil avec statistiques ; sans la portée user.info.stats, retombe sur le profil de base. */
export async function lireProfil(f: Fetch, jeton: string): Promise<Profil> {
  try {
    return (await appel<{ user: Profil }>(f, jeton, 'GET', '/user/info/', CHAMPS_PROFIL)).user;
  } catch (err) {
    if (err instanceof ErreurTikTok && err.statut === 401) throw err;
    return (await appel<{ user: Profil }>(f, jeton, 'GET', '/user/info/', CHAMPS_PROFIL_BASE)).user;
  }
}

/** Champs minimaux, si TikTok refuse la liste complète (certains comptes ou le mode sandbox). */
export const CHAMPS_VIDEO_MINI = ['id', 'create_time', 'view_count', 'like_count', 'comment_count', 'share_count'];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dernières vidéos publiques (au plus « max »). TikTok renvoie parfois une erreur 500 sur /video/list/ :
 * on réessaie, puis avec moins de champs et des pages plus petites, avant d'abandonner.
 */
export async function lireVideos(f: Fetch, jeton: string, max = 60, attente = 1500): Promise<VideoTikTok[]> {
  const essais: { champs: string[]; parPage: number }[] = [
    { champs: CHAMPS_VIDEO, parPage: 20 },
    { champs: CHAMPS_VIDEO, parPage: 20 },
    { champs: CHAMPS_VIDEO_MINI, parPage: 20 },
    { champs: CHAMPS_VIDEO_MINI, parPage: 10 },
  ];
  let derniere: unknown;
  for (const [i, e] of essais.entries()) {
    try {
      const videos: VideoTikTok[] = [];
      let curseur: number | undefined;
      while (videos.length < max) {
        const d = await appel<{ videos?: VideoTikTok[]; cursor?: number; has_more?: boolean }>(f, jeton, 'POST', '/video/list/', e.champs, { max_count: e.parPage, ...(curseur ? { cursor: curseur } : {}) });
        videos.push(...(d.videos ?? []));
        if (!d.has_more || !d.cursor || !(d.videos ?? []).length) break;
        curseur = d.cursor;
      }
      return videos.slice(0, max);
    } catch (err) {
      derniere = err;
      // Seules les erreurs passagères ou de serveur valent un nouvel essai (pas 401 ou portée manquante).
      if (!(err instanceof ErreurTikTok) || (err.statut !== undefined && err.statut < 500 && err.statut !== 429)) throw err;
      if (i < essais.length - 1) await pause(attente * (i + 1));
    }
  }
  throw derniere;
}

/** Résumé lisible pour le tableau de bord. */
export function resumer(profil: Profil, videos: VideoTikTok[], maintenant = Date.now()) {
  const recentes = videos.filter((v) => v.create_time && maintenant / 1000 - v.create_time < 30 * 86400);
  const vues = (vs: VideoTikTok[]) => vs.reduce((s, v) => s + (v.view_count ?? 0), 0);
  const tri = [...videos].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
  return {
    nom: profil.display_name ?? '',
    abonnes: profil.follower_count ?? null,
    likes: profil.likes_count ?? null,
    nbVideos: profil.video_count ?? videos.length,
    vues30j: vues(recentes),
    videos30j: recentes.length,
    mediane30j: recentes.length ? [...recentes].map((v) => v.view_count ?? 0).sort((a, b) => a - b)[Math.floor(recentes.length / 2)]! : 0,
    meilleures: tri.slice(0, 5).map((v) => ({ titre: (v.title || v.video_description || '').slice(0, 120), vues: v.view_count ?? 0, likes: v.like_count ?? 0, lien: v.share_url ?? '' })),
    dernieres: videos.slice(0, 12).map((v) => ({ titre: (v.title || v.video_description || '').slice(0, 120), vues: v.view_count ?? 0, likes: v.like_count ?? 0, commentaires: v.comment_count ?? 0, partages: v.share_count ?? 0, le: v.create_time ? new Date(v.create_time * 1000).toISOString() : '' })),
  };
}

/** Historique quotidien d'un compte : [jour (AAAA-MM-JJ, heure de Paris), abonnés, likes, vues sur 30 jours, nombre de vidéos]. */
export type Point = [jour: string, abonnes: number | null, likes: number | null, vues30j: number, nbVideos: number | null];
export type Historique = Record<string, Point[]>;
export const COLONNES_HISTORIQUE = ['jour', 'abonnes', 'likes', 'vues30j', 'nbVideos'];

export function jourParis(d = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Lit tiktok-historique.txt ; un fichier absent, vide ou abîmé donne un historique vide (on repart de zéro sans planter). */
export function lireHistorique(texte: string): Historique {
  try {
    const v = JSON.parse(texte) as { comptes?: unknown };
    if (!v || typeof v.comptes !== 'object' || v.comptes === null) return {};
    const out: Historique = {};
    for (const [k, l] of Object.entries(v.comptes as Record<string, unknown>)) {
      if (Array.isArray(l)) out[k] = l.filter((p): p is Point => Array.isArray(p) && typeof p[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p[0]));
    }
    return out;
  } catch {
    return {};
  }
}

/** Ajoute (ou remplace) le point du jour d'un compte, garde les `max` derniers jours, du plus ancien au plus récent. */
export function ajouterPoint(h: Historique, compte: string, point: Point, max = 180): Historique {
  const liste = (h[compte] ?? []).filter((p) => p[0] !== point[0]);
  liste.push(point);
  liste.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { ...h, [compte]: liste.slice(-max) };
}
