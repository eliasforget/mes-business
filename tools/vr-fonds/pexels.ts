/** Client minimal de l'API vidéo Pexels (fetch natif, aucune dépendance). */

export const API = 'https://api.pexels.com/v1';
export type Fetch = typeof fetch;

export interface FichierPexels {
  id: number;
  quality: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  fps?: number | null;
  link: string;
}

export interface VideoPexels {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image?: string;
  user: { name: string; url: string };
  video_files: FichierPexels[];
}

export class ErreurPexels extends Error {
  readonly statut: number;
  constructor(statut: number, message: string) {
    super(message);
    this.name = 'ErreurPexels';
    this.statut = statut;
  }
}

export class ClientPexels {
  readonly cle: string;
  readonly fetch: Fetch;
  /** Requêtes restantes ce mois-ci (en-tête X-Ratelimit-Remaining), null tant qu'on ne sait pas. */
  restantes: number | null = null;

  constructor(cle: string, fetchImpl: Fetch = fetch) {
    this.cle = cle;
    this.fetch = fetchImpl;
  }

  async rechercher(requete: string, parPage = 15, locale = 'fr-FR'): Promise<VideoPexels[]> {
    const params = new URLSearchParams({ query: requete, orientation: 'portrait', size: 'medium', per_page: String(parPage), locale });
    const rep = await this.fetch(`${API}/videos/search?${params}`, {
      headers: { Authorization: this.cle },
      signal: AbortSignal.timeout(30_000),
    });
    const reste = rep.headers.get('x-ratelimit-remaining');
    if (reste !== null && Number.isFinite(Number(reste))) this.restantes = Number(reste);
    if (rep.status === 401 || rep.status === 403) throw new ErreurPexels(rep.status, 'Clé API Pexels refusée : vérifie PEXELS_API_KEY dans le .env.');
    if (rep.status === 429) throw new ErreurPexels(429, 'Limite Pexels atteinte (200 requêtes/heure, 20 000/mois) : réessaie plus tard.');
    if (!rep.ok) throw new ErreurPexels(rep.status, `Erreur Pexels ${rep.status} sur la recherche « ${requete} ».`);
    return ((await rep.json()) as { videos?: VideoPexels[] }).videos ?? [];
  }
}

/**
 * Meilleur fichier pour un Short : MP4 vertical d'au moins 1080 px de large, le plus léger possible
 * (inutile de télécharger de la 4K pour une vidéo 1080×1920). À défaut, le plus grand disponible.
 */
export function choisirFichier(v: VideoPexels): FichierPexels | null {
  const verticaux = v.video_files.filter((f) => f.file_type === 'video/mp4' && f.width && f.height && f.height > f.width && f.link);
  if (!verticaux.length) return null;
  const surface = (f: FichierPexels) => (f.width ?? 0) * (f.height ?? 0);
  const suffisants = verticaux.filter((f) => (f.width ?? 0) >= 1080).sort((a, b) => surface(a) - surface(b));
  return suffisants[0] ?? [...verticaux].sort((a, b) => surface(b) - surface(a))[0]!;
}
