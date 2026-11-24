/**
 * Calcul du « plan » de la vidéo : minutage des mots, découpage en scènes, groupes de sous-titres,
 * segments de fond. Fonctions pures, sans dépendance : utilisées par le rendu (Node) et par Remotion.
 */

export interface Mot {
  mot: string;
  debut: number; // secondes
  fin: number;
}

export interface Ligne {
  texte: string;
  style?: 'normal' | 'gros' | 'accent' | 'petit';
}

export interface Chiffre {
  valeur: number;
  decimales?: number;
  prefixe?: string;
  suffixe?: string;
}

export interface Scene {
  /** Petite étiquette au-dessus du titre, ex. « SECRET N°1 ». */
  tag?: string;
  /** Lignes du titre de la scène. */
  lignes?: Ligne[];
  /** Grand chiffre animé (compteur), affiché au-dessus des lignes. */
  chiffre?: Chiffre;
  /** Texte dit par la voix pendant cette scène (sert à caler la scène sur le minutage). */
  voix: string;
  /** Clips de fond propres à cette scène (noms de fichiers dans le dossier de la vidéo ou la bibliothèque). */
  fonds?: string[];
  /** Mots-clés pour choisir des clips dans la bibliothèque (ex. ["miami", "nuit"]). */
  motsCles?: string[];
  /** Durée en secondes, utilisée seulement sans minutage audio. */
  duree?: number;
}

/**
 * Vidéo de gameplay (capture PS5) : la vidéo dure le temps du passage de jeu gardé, la voix ne fait que
 * l'accroche du début. Sans « debut » ni « duree », on garde les dernières secondes du clip : avec la touche
 * Créer, le moment intéressant est à la fin de l'enregistrement.
 */
export interface Gameplay {
  /** Fichier vidéo dans le dossier de la vidéo (défaut : gameplay.mp4). */
  fichier?: string;
  /** Début du passage gardé, en secondes depuis le début du clip. */
  debut?: number;
  /** Durée gardée, en secondes (défaut : GARDER_S du .env). */
  duree?: number;
  /** Volume du son du jeu après l'accroche, de 0 à 1 (défaut : VOLUME_JEU du .env). */
  volume?: number;
  /** « flou » : image entière du jeu sur fond flouté (défaut). « remplir » : recadrée plein écran. */
  cadrage?: 'flou' | 'remplir';
}

export interface ScriptVideo {
  titre?: string;
  scenes: Scene[];
  /** Texte d'appel à l'action affiché sur la fin (ex. « Abonne-toi pour le secret n°5 »). */
  fin?: string;
  /** Présent : vidéo de gameplay (voir Gameplay) au lieu du motion design sur clips de fond. */
  gameplay?: Gameplay;
  /** Habillage de la chaîne (voir src/themes.ts) : « vice-radar » par défaut, ou « faits-animes ». */
  theme?: string;
  /** Logo propre à cette vidéo (sinon celui du thème). */
  marque?: { nom: string; accent: string };
}

export interface ScenePlanifiee extends Scene {
  debut: number;
  fin: number;
}

export interface GroupeSousTitre {
  mots: Mot[];
  debut: number;
  fin: number;
  couleur: number; // index de couleur d'accent, pour varier comme dans le modèle d'origine
}

export interface SegmentFond {
  debut: number;
  fin: number;
  /** Chemin relatif dans public/ (ex. "fonds/miami-01.mp4"), ou null pour le fond animé synthwave. */
  clip: string | null;
  /** Décalage de départ dans le clip, en secondes (évite de toujours montrer le même début). */
  depuis: number;
}

export interface PlanVideo {
  scenes: ScenePlanifiee[];
  mots: Mot[];
  sousTitres: GroupeSousTitre[];
  fonds: SegmentFond[];
  duree: number;
}

// ── Texte ──────────────────────────────────────────────────────────────────

/** Découpe un texte en mots « parlés » (la ponctuation reste collée au mot, comme dans un sous-titre). */
export function decouperMots(texte: string): string[] {
  return texte
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((m) => /[\p{L}\p{N}]/u.test(m));
}

export function normaliser(mot: string): string {
  return mot
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

// ── Minutage ───────────────────────────────────────────────────────────────

/** Alignement caractère par caractère renvoyé par ElevenLabs (endpoint « with-timestamps »). */
export interface AlignementElevenLabs {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export function motsDepuisElevenLabs(a: AlignementElevenLabs): Mot[] {
  const mots: Mot[] = [];
  let courant = '';
  let debut = 0;
  let fin = 0;
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (courant) mots.push({ mot: courant, debut, fin });
      courant = '';
      return;
    }
    if (!courant) debut = a.character_start_times_seconds[i] ?? fin;
    courant += c;
    fin = a.character_end_times_seconds[i] ?? debut;
  });
  if (courant) mots.push({ mot: courant, debut, fin });
  return mots.filter((m) => /[\p{L}\p{N}]/u.test(m.mot));
}

/** Minutage fictif quand il n'y a pas d'audio : rythme de lecture d'un Short (~2,8 mots/s). */
export function motsSynthetiques(scenes: Scene[], motsParSeconde = 2.8, depart = 0.1): Mot[] {
  const mots: Mot[] = [];
  let t = depart;
  for (const scene of scenes) {
    const liste = decouperMots(scene.voix);
    const pas = scene.duree && liste.length ? scene.duree / liste.length : 1 / motsParSeconde;
    for (const m of liste) {
      // Pause un peu plus longue après une ponctuation forte.
      const duree = pas * (/[.!?…]$/.test(m) ? 1.6 : /[,;:]$/.test(m) ? 1.25 : 1);
      mots.push({ mot: m, debut: t, fin: t + duree * 0.9 });
      t += duree;
    }
  }
  return mots;
}

/**
 * Cale chaque scène sur le minutage : la scène i couvre les N mots suivants, N = nombre de mots de sa voix.
 * Une scène commence au premier de ses mots ; la première commence à 0 ; la dernière se termine `queue` s
 * après le dernier mot.
 */
export function placerScenes(scenes: Scene[], mots: Mot[], queue = 0.6): { scenes: ScenePlanifiee[]; duree: number } {
  if (scenes.length === 0) throw new Error('Le script ne contient aucune scène.');
  const comptes = scenes.map((s) => Math.max(1, decouperMots(s.voix).length));
  const total = comptes.reduce((a, b) => a + b, 0);
  const finAudio = mots.length ? mots[mots.length - 1]!.fin : 0;
  const duree = Math.max(finAudio + queue, 1);

  let curseur = 0;
  const debuts: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    if (i === 0) {
      debuts.push(0);
    } else if (mots.length >= total) {
      debuts.push(mots[Math.min(curseur, mots.length - 1)]!.debut);
    } else {
      // Moins de mots minutés que prévu (texte modifié ?) : répartition proportionnelle.
      debuts.push((curseur / total) * duree);
    }
    curseur += comptes[i]!;
  }
  // Une scène ne peut pas commencer avant la précédente (minutage incohérent).
  for (let i = 1; i < debuts.length; i++) debuts[i] = Math.max(debuts[i]!, debuts[i - 1]! + 0.3);

  return {
    duree: Math.max(duree, debuts[debuts.length - 1]! + 0.8),
    scenes: scenes.map((s, i) => ({ ...s, debut: debuts[i]!, fin: i + 1 < debuts.length ? debuts[i + 1]! : Math.max(duree, debuts[i]! + 0.8) })),
  };
}

/** Groupes de 1 à 3 mots, coupés sur la ponctuation et les pauses, comme les sous-titres « karaoké ». */
export function grouperSousTitres(mots: Mot[], maxMots = 3, maxCaracteres = 18, pause = 0.35): GroupeSousTitre[] {
  const groupes: GroupeSousTitre[] = [];
  let courant: Mot[] = [];
  const pousser = () => {
    if (!courant.length) return;
    groupes.push({ mots: courant, debut: courant[0]!.debut, fin: courant[courant.length - 1]!.fin, couleur: groupes.length % 3 });
    courant = [];
  };
  for (const m of mots) {
    const precedent = courant[courant.length - 1];
    const longueur = courant.reduce((n, x) => n + x.mot.length + 1, 0) + m.mot.length;
    if (precedent && (courant.length >= maxMots || longueur > maxCaracteres || m.debut - precedent.fin > pause)) pousser();
    courant.push(m);
    if (/[.!?…,;:]$/.test(m.mot)) pousser();
  }
  pousser();
  // Chaque groupe reste affiché jusqu'au suivant (pas de trou noir entre deux sous-titres).
  for (let i = 0; i < groupes.length - 1; i++) groupes[i]!.fin = Math.max(groupes[i]!.fin, groupes[i + 1]!.debut);
  return groupes;
}

// ── Fonds ──────────────────────────────────────────────────────────────────

function hash(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface ClipDisponible {
  chemin: string; // relatif à public/, ex. "fonds/miami-01.mp4"
  duree: number;  // secondes
  motsCles: string[];
}

/**
 * Découpe chaque scène en plans de `rythme` secondes (un changement d'image toutes les ~2 s retient l'œil)
 * et choisit un clip pour chacun : clips de la scène, sinon bibliothèque filtrée par mots-clés, sinon tout.
 * Déterministe : le même script donne toujours la même vidéo. Jamais deux fois le même clip d'affilée
 * quand il y a le choix.
 */
export function planifierFonds(scenes: ScenePlanifiee[], clips: ClipDisponible[], rythme = 2.2): SegmentFond[] {
  const segments: SegmentFond[] = [];
  let dernier: string | null = null;
  scenes.forEach((scene, iScene) => {
    const propres = clips.filter((c) => scene.fonds?.some((f) => c.chemin.endsWith(`/${f}`) || c.chemin === f));
    const cles = (scene.motsCles ?? []).map(normaliser);
    const parCles = cles.length ? clips.filter((c) => c.motsCles.some((k) => cles.includes(normaliser(k)))) : [];
    const candidats = propres.length ? propres : parCles.length ? parCles : clips;

    // Découpage en plans. Le tout premier plan de la vidéo est court (~1,3 s) : c'est dans les premières
    // secondes que les spectateurs balaient, un changement d'image rapide les retient.
    const bornes: number[] = [scene.debut];
    let reste = scene.fin - scene.debut;
    if (iScene === 0 && reste > rythme + 1.3) {
      bornes.push(scene.debut + 1.3);
      reste -= 1.3;
    }
    const depart = bornes[bornes.length - 1]!;
    const n = Math.max(1, Math.round(reste / rythme));
    for (let k = 1; k <= n; k++) bornes.push(depart + (reste * k) / n);
    for (let k = 0; k < bornes.length - 1; k++) {
      const debut = bornes[k]!;
      const fin = bornes[k + 1]!;
      if (!candidats.length) {
        segments.push({ debut, fin, clip: null, depuis: 0 });
        continue;
      }
      let idx = hash(`${iScene}-${k}-${scene.voix}`) % candidats.length;
      if (candidats.length > 1 && candidats[idx]!.chemin === dernier) idx = (idx + 1) % candidats.length;
      const clip = candidats[idx]!;
      const marge = Math.max(0, clip.duree - (fin - debut) - 0.1);
      const depuis = marge > 0 ? (hash(`${clip.chemin}-${iScene}-${k}`) % Math.floor(marge * 10)) / 10 : 0;
      segments.push({ debut, fin, clip: clip.chemin, depuis });
      dernier = clip.chemin;
    }
  });
  return segments;
}

export function construirePlan(script: ScriptVideo, mots: Mot[], clips: ClipDisponible[], rythme = 2.2): PlanVideo {
  const { scenes, duree } = placerScenes(script.scenes, mots);
  return { scenes, mots, sousTitres: grouperSousTitres(mots), fonds: planifierFonds(scenes, clips, rythme), duree };
}

// ── Gameplay ───────────────────────────────────────────────────────────────

export interface FenetreGameplay {
  depuis: number; // secondes dans le clip
  duree: number;  // secondes gardées
}

/**
 * Passage du clip à garder. Par défaut les `garder` dernières secondes (le moment est à la fin d'un clip
 * enregistré avec la touche Créer). On s'arrête 0,05 s avant la fin réelle : la toute dernière image d'un
 * clip est parfois illisible.
 */
export function fenetreGameplay(dureeClip: number, g: Gameplay, garder = 35): FenetreGameplay {
  const utile = Math.max(0.5, dureeClip - 0.05);
  if (g.debut !== undefined) {
    const depuis = Math.min(Math.max(0, g.debut), Math.max(0, utile - 0.5));
    return { depuis, duree: Math.min(g.duree ?? utile - depuis, utile - depuis) };
  }
  const duree = Math.min(g.duree ?? garder, utile);
  return { depuis: utile - duree, duree };
}

/**
 * Plan d'une vidéo de gameplay : pas de clips de fond, la vidéo dure le passage gardé (ou la voix, si elle
 * est plus longue), et la dernière scène court jusqu'au bout.
 */
export function construirePlanJeu(script: ScriptVideo, mots: Mot[], fenetre: FenetreGameplay): PlanVideo {
  const plan = construirePlan(script, mots, []);
  const duree = Math.max(fenetre.duree, plan.duree);
  const scenes = plan.scenes.map((s, i) => (i === plan.scenes.length - 1 ? { ...s, fin: duree } : s));
  return { ...plan, scenes, duree, fonds: [] };
}

/** Vérifie un script et renvoie la liste des problèmes (vide si tout va bien). */
export function verifierScript(script: unknown): string[] {
  const erreurs: string[] = [];
  const s = script as Partial<ScriptVideo> | null;
  if (!s || typeof s !== 'object') return ['Le script doit être un objet JSON.'];
  if (!Array.isArray(s.scenes) || s.scenes.length === 0) return ['« scenes » doit être une liste non vide.'];
  s.scenes.forEach((sc, i) => {
    const n = `scenes[${i}]`;
    if (!sc || typeof sc.voix !== 'string' || !sc.voix.trim()) erreurs.push(`${n}.voix : texte obligatoire (ce que dit la voix pendant la scène).`);
    if (sc?.lignes && (!Array.isArray(sc.lignes) || sc.lignes.some((l) => typeof l?.texte !== 'string'))) erreurs.push(`${n}.lignes : liste de { "texte": "...", "style": "normal|gros|accent|petit" }.`);
    if (sc?.lignes?.some((l) => l.style && !['normal', 'gros', 'accent', 'petit'].includes(l.style))) erreurs.push(`${n}.lignes : style inconnu (normal, gros, accent ou petit).`);
    if (sc?.chiffre && typeof sc.chiffre.valeur !== 'number') erreurs.push(`${n}.chiffre.valeur : nombre obligatoire.`);
    if (sc?.duree !== undefined && !(typeof sc.duree === 'number' && sc.duree > 0)) erreurs.push(`${n}.duree : nombre de secondes > 0.`);
  });
  if (s.theme !== undefined && (typeof s.theme !== 'string' || !s.theme.trim())) erreurs.push('« theme » : nom de thème (vice-radar, faits-animes).');
  if (s.marque !== undefined && (typeof s.marque?.nom !== 'string' || typeof s.marque?.accent !== 'string')) erreurs.push('« marque » : { "nom": "...", "accent": "..." }.');
  const g = s.gameplay;
  if (g !== undefined) {
    if (!g || typeof g !== 'object') return [...erreurs, '« gameplay » doit être un objet ({ "fichier": "gameplay.mp4" }).'];
    if (g.fichier !== undefined && (typeof g.fichier !== 'string' || !g.fichier.trim())) erreurs.push('gameplay.fichier : nom de fichier vidéo.');
    if (g.debut !== undefined && !(typeof g.debut === 'number' && g.debut >= 0)) erreurs.push('gameplay.debut : nombre de secondes ≥ 0.');
    if (g.duree !== undefined && !(typeof g.duree === 'number' && g.duree > 0)) erreurs.push('gameplay.duree : nombre de secondes > 0.');
    if (g.volume !== undefined && !(typeof g.volume === 'number' && g.volume >= 0 && g.volume <= 1)) erreurs.push('gameplay.volume : nombre entre 0 et 1.');
    if (g.cadrage !== undefined && !['flou', 'remplir'].includes(g.cadrage)) erreurs.push('gameplay.cadrage : « flou » ou « remplir ».');
  }
  return erreurs;
}
