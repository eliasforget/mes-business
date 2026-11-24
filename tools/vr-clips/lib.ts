/**
 * vr-clips : fonctions pures (sans accès disque), testées dans tests/clips.test.ts.
 * Liste de tournage → association des captures PS5 → script.json + textes de publication pour vr-video.
 */

export interface Ligne {
  texte: string;
  style?: 'normal' | 'gros' | 'accent' | 'petit';
}

/** Réglages du passage de jeu (mêmes clés que « gameplay » dans le script de vr-video). */
export interface ReglagesGameplay {
  debut?: number;
  duree?: number;
  volume?: number;
  cadrage?: 'flou' | 'remplir';
}

export interface Experience {
  /** Identifiant court, ex. « E01 » : c'est lui qu'on utilise dans --sauter et --associer. */
  id: string;
  /** Nom court, sert au nom du dossier et au suivi. */
  titre: string;
  /** Phrase dite par la voix au début : une question, sans annoncer le résultat (on ne le connaît pas). */
  accroche: string;
  /** Texte affiché en haut pendant toute la vidéo. */
  lignes: Ligne[];
  tag?: string;
  fin?: string;
  hashtags?: string[];
  gameplay?: ReglagesGameplay;
}

export interface Tournage {
  semaine?: string;
  /** Valeurs par défaut pour toutes les expériences. */
  tag?: string;
  fin?: string;
  hashtags?: string[];
  experiences: Experience[];
}

export interface Capture {
  fichier: string; // chemin complet
  nom: string;     // nom du fichier
  taille: number;  // octets
  horodatage: number; // ms, pour trier dans l'ordre d'enregistrement
}

export interface Paire {
  experience: Experience;
  capture: Capture;
}

export interface Association {
  paires: Paire[];
  capturesEnTrop: Capture[];
  experiencesSansCapture: Experience[];
  /** Captures dont le nom porte un identifiant absent de la liste (ou déjà tourné) : laissées de côté. */
  nomsInconnus: Capture[];
  erreurs: string[];
}

// ── Liste de tournage ─────────────────────────────────────────────────────

export function verifierTournage(t: unknown): string[] {
  const erreurs: string[] = [];
  const x = t as Partial<Tournage> | null;
  if (!x || typeof x !== 'object') return ['La liste de tournage doit être un objet JSON.'];
  if (!Array.isArray(x.experiences) || !x.experiences.length) return ['« experiences » doit être une liste non vide.'];
  const vus = new Set<string>();
  x.experiences.forEach((e, i) => {
    const n = `experiences[${i}]`;
    if (!e || typeof e.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(e.id)) erreurs.push(`${n}.id : identifiant court (lettres, chiffres, - ou _), ex. "E01".`);
    else if (vus.has(e.id.toUpperCase())) erreurs.push(`${n}.id : « ${e.id} » est en double.`);
    else vus.add(e.id.toUpperCase());
    if (typeof e?.titre !== 'string' || !e.titre.trim()) erreurs.push(`${n}.titre : texte obligatoire.`);
    if (typeof e?.accroche !== 'string' || !e.accroche.trim()) erreurs.push(`${n}.accroche : phrase de la voix obligatoire.`);
    if (!Array.isArray(e?.lignes) || !e.lignes.length || e.lignes.some((l) => typeof l?.texte !== 'string')) erreurs.push(`${n}.lignes : liste de { "texte": "...", "style": "normal|gros|accent|petit" }.`);
  });
  return erreurs;
}

// ── Captures ──────────────────────────────────────────────────────────────

const RE_HORODATAGE = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})[-_ T.]?(\d{2})[-_.:h]?(\d{2})[-_.:m]?(\d{2})/;

/**
 * Moment de l'enregistrement : la date-heure écrite dans le nom du fichier (les exports PS5 en ont une,
 * ex. « Grand Theft Auto VI_20261123203015.mp4 »), sinon la date de modification du fichier.
 */
export function horodatage(nom: string, mtimeMs: number): number {
  const m = RE_HORODATAGE.exec(nom);
  if (m) {
    const [a, mo, j, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
    if (mo >= 1 && mo <= 12 && j >= 1 && j <= 31 && h <= 23 && mi <= 59 && s <= 59) return Date.UTC(a, mo - 1, j, h, mi, s);
  }
  return mtimeMs;
}

export function cleCapture(c: Pick<Capture, 'nom' | 'taille'>): string {
  return `${c.nom}|${c.taille}`;
}

export function trierCaptures(captures: Capture[]): Capture[] {
  return [...captures].sort((a, b) => a.horodatage - b.horodatage || a.nom.localeCompare(b.nom));
}

/** « E03,E05 » → ["E03","E05"] (insensible à la casse). */
export function listeIds(texte: string | undefined): string[] {
  return (texte ?? '').split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
}

/** ["E04=1123203015", ...] → Map E04 → morceau du nom de fichier. */
export function associationsForcees(valeurs: string[]): { forces: Map<string, string>; erreurs: string[] } {
  const forces = new Map<string, string>();
  const erreurs: string[] = [];
  for (const v of valeurs) {
    const i = v.indexOf('=');
    if (i <= 0 || i === v.length - 1) {
      erreurs.push(`--associer « ${v} » : format attendu E04=morceau-du-nom-du-fichier`);
      continue;
    }
    forces.set(v.slice(0, i).trim().toUpperCase(), v.slice(i + 1).trim());
  }
  return { forces, erreurs };
}

/**
 * Identifiant d'expérience écrit dans le nom d'une capture : « E01 · Planté au milieu de la route.mp4 » → « E01 ».
 * Insensible à la casse ; « e7 » → « E07 ». Rien si le nom n'en contient pas.
 */
export function idDansNom(nom: string): string | undefined {
  const m = /(?:^|[^a-z0-9])e(\d{1,3})(?![0-9])/i.exec(nom.replace(/\.[^.]+$/, ''));
  return m ? `E${m[1]!.padStart(2, '0')}` : undefined;
}

/**
 * Associe une capture à chaque expérience, dans cet ordre de priorité :
 * 1. les associations forcées (--associer E04=morceau-du-nom) ;
 * 2. le nom du fichier : une capture nommée « E01 · … » va à E01 (une expérience déjà tournée ou inconnue
 *    est signalée, la capture est laissée de côté) ;
 * 3. le reste dans l'ordre : 1re capture → 1re expérience pas encore tournée, etc.
 * Les expériences « sautées » ne reçoivent rien.
 */
export function associer(experiences: Experience[], captures: Capture[], opts: { sauter?: string[]; forces?: Map<string, string> } = {}): Association {
  const sauter = new Set((opts.sauter ?? []).map((s) => s.toUpperCase()));
  const forces = opts.forces ?? new Map<string, string>();
  const erreurs: string[] = [];
  const libres = trierCaptures(captures);
  const prises = new Set<Capture>();
  const paires: Paire[] = [];
  const parId = new Map(experiences.map((e) => [e.id.toUpperCase(), e]));

  for (const s of sauter) if (!parId.has(s)) erreurs.push(`--sauter : « ${s} » n'est pas dans la liste (ou déjà importée).`);
  for (const [id, morceau] of forces) {
    const exp = parId.get(id);
    if (!exp) {
      erreurs.push(`--associer : « ${id} » n'est pas dans la liste (ou déjà importée).`);
      continue;
    }
    const trouvees = libres.filter((c) => !prises.has(c) && c.nom.toLowerCase().includes(morceau.toLowerCase()));
    if (trouvees.length !== 1) {
      erreurs.push(`--associer ${id}=${morceau} : ${trouvees.length ? `${trouvees.length} captures correspondent, précise` : 'aucune capture ne correspond'}.`);
      continue;
    }
    prises.add(trouvees[0]!);
    paires.push({ experience: exp, capture: trouvees[0]! });
  }

  // 2. Par le nom du fichier
  const parNom = new Set<string>();
  const nomsInconnus: Capture[] = [];
  for (const c of libres) {
    if (prises.has(c)) continue;
    const id = idDansNom(c.nom);
    if (!id) continue;
    const exp = parId.get(id);
    if (!exp || forces.has(id) || parNom.has(id)) {
      nomsInconnus.push(c);
      prises.add(c);
      continue;
    }
    prises.add(c);
    parNom.add(id);
    paires.push({ experience: exp, capture: c });
  }

  // 3. Dans l'ordre, pour les captures sans identifiant dans le nom
  const restantes = libres.filter((c) => !prises.has(c));
  const aFaire = experiences.filter((e) => !sauter.has(e.id.toUpperCase()) && !forces.has(e.id.toUpperCase()) && !parNom.has(e.id.toUpperCase()));
  const n = Math.min(restantes.length, aFaire.length);
  for (let i = 0; i < n; i++) paires.push({ experience: aFaire[i]!, capture: restantes[i]! });

  const ordre = new Map(experiences.map((e, i) => [e.id, i]));
  paires.sort((a, b) => ordre.get(a.experience.id)! - ordre.get(b.experience.id)!);
  return { paires, capturesEnTrop: restantes.slice(n), experiencesSansCapture: aFaire.slice(n), nomsInconnus, erreurs };
}

// ── Dossiers et scripts ───────────────────────────────────────────────────

export function slug(texte: string, max = 40): string {
  const s = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '') || 'video';
}

/** Numéro du prochain dossier de vidéo : un de plus que le plus grand « NN- » existant, sur 2 chiffres. */
export function prochainNumero(nomsDossiers: string[]): string {
  const max = Math.max(0, ...nomsDossiers.map((n) => /^(\d+)-/.exec(n)?.[1]).filter((x): x is string => !!x).map(Number));
  return String(max + 1).padStart(2, '0');
}

export function nomDossier(numero: string, exp: Experience): string {
  return `${numero}-${exp.id.toLowerCase()}-${slug(exp.titre)}`;
}

/** Script vr-video d'une expérience : une scène (l'accroche) et la section gameplay. */
export function scriptVideo(exp: Experience, tournage: Tournage, fichierJeu: string): Record<string, unknown> {
  return {
    titre: `${exp.id} — ${exp.titre}`,
    experience: exp.id,
    gameplay: { fichier: fichierJeu, ...(exp.gameplay ?? {}) },
    scenes: [{ tag: exp.tag ?? tournage.tag ?? 'EXPÉRIENCE GTA 6', lignes: exp.lignes, voix: exp.accroche.trim() }],
    fin: exp.fin ?? tournage.fin ?? 'Je teste quoi ensuite ? Dis-le en commentaire',
  };
}

/** Première phrase de l'accroche (jusqu'au premier « ? », « ! » ou « . »). */
export function question(accroche: string): string {
  const m = /^[^?!.]*[?!.]/.exec(accroche.trim());
  return (m ? m[0] : accroche).trim();
}

/** Textes à copier-coller au moment de publier, pour les trois réseaux. */
export function textesPublication(exp: Experience, tournage: Tournage): string {
  const tags = [...new Set([...(tournage.hashtags ?? ['#GTA6', '#GTAVI']), ...(exp.hashtags ?? [])])];
  const q = question(exp.accroche);
  const suffixe = ' #GTA6 #Shorts';
  const titre = (q.length + suffixe.length > 100 ? `${q.slice(0, 100 - suffixe.length - 1).trimEnd()}…` : q) + suffixe;
  const fin = exp.fin ?? tournage.fin ?? 'Je teste quoi ensuite ? Dis-le en commentaire';
  const legende = `${q} 😳 Regarde jusqu'à la fin.\n${fin} 👇\n\n${tags.join(' ')}`;
  return [
    `${exp.id} — ${exp.titre}`,
    '',
    'TITRE YOUTUBE',
    titre,
    '',
    'LÉGENDE TIKTOK ET INSTAGRAM',
    legende,
    '',
    'DESCRIPTION YOUTUBE',
    `${q}\n${fin} 👇\n\nUne expérience par jour sur GTA 6 : abonne-toi pour la prochaine.\n\n${tags.join(' ')}`,
    '',
  ].join('\n');
}
