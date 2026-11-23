/** Client minimal de l'API ElevenLabs (fetch natif de Node, aucune dépendance). */

export const API = 'https://api.elevenlabs.io';

export type Fetch = typeof fetch;

export interface ReglagesVoix {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

export interface Alignement {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface ReponseVoix {
  audio: Buffer;
  alignement: Alignement;
}

export interface Abonnement {
  tier: string;
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix?: number;
}

export interface Voix {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export class ErreurElevenLabs extends Error {
  readonly statut: number;
  constructor(statut: number, message: string) {
    super(message);
    this.name = 'ErreurElevenLabs';
    this.statut = statut;
  }
}

async function detailErreur(rep: Response): Promise<string> {
  try {
    const corps = (await rep.json()) as { detail?: { message?: string; status?: string } | string };
    if (typeof corps.detail === 'string') return corps.detail;
    return corps.detail?.message ?? corps.detail?.status ?? '';
  } catch {
    return '';
  }
}

export class ClientElevenLabs {
  readonly cle: string;
  readonly fetch: Fetch;

  constructor(cle: string, fetchImpl: Fetch = fetch) {
    this.cle = cle;
    this.fetch = fetchImpl;
  }

  private async appel(chemin: string, init: RequestInit = {}): Promise<Response> {
    const rep = await this.fetch(`${API}${chemin}`, {
      ...init,
      headers: { 'xi-api-key': this.cle, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(120_000),
    });
    if (rep.ok) return rep;
    const detail = await detailErreur(rep);
    const messages: Record<number, string> = {
      401: 'Clé API ElevenLabs refusée (401) : vérifie ELEVENLABS_API_KEY dans le .env.',
      402: 'Crédits ElevenLabs insuffisants ou fonction réservée à un abonnement payant (402).',
      404: 'Voix introuvable (404) : vérifie ELEVENLABS_VOIX_ID (liste : .\\voix.cmd --lister).',
      422: 'Requête refusée par ElevenLabs (422)',
      429: 'Trop de requêtes ou quota atteint (429) : réessaie dans quelques minutes.',
    };
    throw new ErreurElevenLabs(rep.status, `${messages[rep.status] ?? `Erreur ElevenLabs ${rep.status}`}${detail ? ` : ${detail}` : ''}`);
  }

  async abonnement(): Promise<Abonnement> {
    return (await (await this.appel('/v1/user/subscription')).json()) as Abonnement;
  }

  async voix(): Promise<Voix[]> {
    const corps = (await (await this.appel('/v1/voices')).json()) as { voices: Voix[] };
    return corps.voices;
  }

  /** Synthèse avec l'alignement caractère par caractère (endpoint « with-timestamps »). */
  async synthese(voixId: string, texte: string, modele: string, reglages: ReglagesVoix, format = 'mp3_44100_128'): Promise<ReponseVoix> {
    const rep = await this.appel(`/v1/text-to-speech/${encodeURIComponent(voixId)}/with-timestamps?output_format=${format}`, {
      method: 'POST',
      body: JSON.stringify({ text: texte, model_id: modele, voice_settings: reglages, apply_text_normalization: 'auto' }),
    });
    const corps = (await rep.json()) as { audio_base64?: string; alignment?: Alignement | null };
    if (!corps.audio_base64 || !corps.alignment) throw new ErreurElevenLabs(500, 'Réponse ElevenLabs incomplète (audio ou alignement manquant).');
    return { audio: Buffer.from(corps.audio_base64, 'base64'), alignement: corps.alignment };
  }
}
