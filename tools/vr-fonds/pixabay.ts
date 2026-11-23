/**
 * Client minimal de l'API vidéo Pixabay (fetch natif, aucune dépendance).
 *
 * Règles Pixabay respectées ici :
 * - résultats de recherche mis en cache 24 h (obligatoire) ;
 * - 100 requêtes / 60 s : on attend la fin de la fenêtre au lieu de marteler l'API ;
 * - la clé passe en paramètre d'URL : elle n'apparaît jamais dans un message d'erreur ou un log.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const API = 'https://pixabay.com/api/videos/';
export const CACHE_MS = 24 * 3600 * 1000;
export type Fetch = typeof fetch;

export interface RenduPixabay {
  url: string;
  width: number;
  height: number;
  size: number; // octets (approximatif), 0 si indisponible
  thumbnail?: string;
}

export interface VideoPixabay {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  user_id: number;
  user: string;
  videos: Partial<Record<'large' | 'medium' | 'small' | 'tiny', RenduPixabay>>;
}

export class ErreurPixabay extends Error {
  readonly statut: number;
  constructor(statut: number, message: string) {
    super(message);
    this.name = 'ErreurPixabay';
    this.statut = statut;
  }
}

type Cache = Record<string, { date: number; hits: VideoPixabay[] }>;

export interface OptionsClient {
  fetchImpl?: Fetch;
  /** Fichier du cache des recherches (absent = cache en mémoire seulement). */
  cacheFichier?: string;
  maintenant?: () => number;
  attendre?: (ms: number) => Promise<void>;
}

export class ClientPixabay {
  readonly fetch: Fetch;
  /** Requêtes réellement envoyées à Pixabay / servies par le cache (pour le bilan). */
  requetesReseau = 0;
  depuisCache = 0;
  readonly #cle: string;
  readonly #cacheFichier?: string;
  readonly #maintenant: () => number;
  readonly #attendre: (ms: number) => Promise<void>;
  #cache: Cache;
  #pauseAvantProchaine = 0;

  constructor(cle: string, opts: OptionsClient = {}) {
    this.#cle = cle;
    this.fetch = opts.fetchImpl ?? fetch;
    this.#cacheFichier = opts.cacheFichier;
    this.#maintenant = opts.maintenant ?? Date.now;
    this.#attendre = opts.attendre ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#cache = this.#lireCache();
  }

  #lireCache(): Cache {
    if (!this.#cacheFichier || !existsSync(this.#cacheFichier)) return {};
    try {
      const brut = JSON.parse(readFileSync(this.#cacheFichier, 'utf8')) as Cache;
      const limite = this.#maintenant() - CACHE_MS;
      return Object.fromEntries(Object.entries(brut).filter(([, v]) => v.date > limite)); // purge des entrées périmées
    } catch {
      return {}; // cache illisible : on repart de zéro, ce n'est qu'un cache
    }
  }

  #ecrireCache(): void {
    if (!this.#cacheFichier) return;
    mkdirSync(path.dirname(this.#cacheFichier), { recursive: true });
    const tmp = `${this.#cacheFichier}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#cache));
    renameSync(tmp, this.#cacheFichier);
  }

  async rechercher(requete: string, parPage = 50, langue = 'fr'): Promise<VideoPixabay[]> {
    const q = requete.trim().slice(0, 100);
    const params = new URLSearchParams({ q, lang: langue, video_type: 'all', safesearch: 'true', order: 'popular', per_page: String(parPage) });
    const cleCache = params.toString(); // sans la clé API
    const enCache = this.#cache[cleCache];
    if (enCache && enCache.date > this.#maintenant() - CACHE_MS) {
      this.depuisCache += 1;
      return enCache.hits;
    }

    for (let essai = 0; ; essai++) {
      if (this.#pauseAvantProchaine > 0) {
        await this.#attendre(this.#pauseAvantProchaine);
        this.#pauseAvantProchaine = 0;
      }
      let rep: Response;
      try {
        rep = await this.fetch(`${API}?key=${encodeURIComponent(this.#cle)}&${params}`, { signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        // Ne jamais remonter l'erreur brute : elle peut contenir l'URL, donc la clé.
        throw new ErreurPixabay(0, `Pixabay injoignable (${(err as Error).name}) sur la recherche « ${q} ».`);
      }
      this.requetesReseau += 1;
      const reset = Math.min(65, Math.max(1, Number(rep.headers.get('x-ratelimit-reset') ?? 60) || 60));
      const reste = rep.headers.get('x-ratelimit-remaining');
      if (reste !== null && Number(reste) <= 0) this.#pauseAvantProchaine = reset * 1000;

      if (rep.status === 429) {
        if (essai >= 1) throw new ErreurPixabay(429, 'Limite Pixabay atteinte (100 requêtes/minute) : réessaie dans une minute.');
        this.#pauseAvantProchaine = reset * 1000;
        continue;
      }
      if (!rep.ok) {
        const texte = (await rep.text().catch(() => '')).slice(0, 200);
        if (rep.status === 401 || rep.status === 403 || /key/i.test(texte)) {
          throw new ErreurPixabay(rep.status, 'Clé API Pixabay refusée : vérifie PIXABAY_API_KEY dans le .env.');
        }
        throw new ErreurPixabay(rep.status, `Erreur Pixabay ${rep.status} sur la recherche « ${q} ».`);
      }
      const hits = ((await rep.json()) as { hits?: VideoPixabay[] }).hits ?? [];
      this.#cache[cleCache] = { date: this.#maintenant(), hits };
      this.#ecrireCache();
      return hits;
    }
  }
}

export interface FichierChoisi {
  url: string;
  largeur: number;
  hauteur: number;
  octets: number;
  /** false = vidéo horizontale, recadrée en 9:16 par vr-video (objectFit cover). */
  vertical: boolean;
}

/**
 * Meilleur rendu pour un Short 1080×1920.
 * - Vidéo verticale : le plus léger d'au moins 1080 px de large, sinon le plus grand.
 * - Vidéo horizontale (si acceptée) : seulement en 4K (≥ 1920 px de haut), pour que le recadrage 9:16
 *   garde au moins ~1080 px de large et reste net. Pixabay a peu de verticales, d'où ce repli.
 * Les rendus plus lourds que maxMo sont écartés.
 */
export function choisirFichier(v: VideoPixabay, accepterPaysage: boolean, maxMo = Infinity): FichierChoisi | null {
  const max = maxMo * 1024 * 1024;
  const rendus = Object.values(v.videos ?? {}).filter(
    (r): r is RenduPixabay => !!r && !!r.url && r.width > 0 && r.height > 0 && (!r.size || r.size <= max),
  );
  const surface = (r: RenduPixabay) => r.width * r.height;
  const verticaux = rendus.filter((r) => r.height > r.width);
  let choix: RenduPixabay | undefined;
  if (verticaux.length) {
    choix = verticaux.filter((r) => r.width >= 1080).sort((a, b) => surface(a) - surface(b))[0]
      ?? [...verticaux].sort((a, b) => surface(b) - surface(a))[0];
  } else if (accepterPaysage) {
    choix = rendus.filter((r) => r.height >= 1920).sort((a, b) => surface(a) - surface(b))[0];
  }
  if (!choix) return null;
  return { url: choix.url, largeur: choix.width, hauteur: choix.height, octets: choix.size || 0, vertical: choix.height > choix.width };
}
