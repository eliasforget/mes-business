/**
 * Choix automatique du passage gardé dans une capture de jeu (vidéos gameplay), sans IA et sans quota :
 * ffmpeg (fourni par Remotion) décode le son et des miniatures, on mesure le volume et le mouvement par seconde,
 * on repère le moment fort (choc, explosion, sirène, cris, action rapide) et on garde la fenêtre autour.
 *
 * Utilisé par rendu.ts quand le script n'impose ni « debut » ni « duree » (PASSAGE_AUTO=true).
 * trouverFfmpeg / lancerFfmpeg servent aussi à l'usine (compilation de la semaine).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ICI = import.meta.dirname;

export interface Mesure {
  t: number; // secondes
  v: number;
}

export interface ChoixPassage {
  debut: number;
  duree: number;
  /** Seconde du moment fort repéré. */
  pic: number;
  /** Contraste du pic par rapport au reste (0 à 1) : plus c'est haut, plus le choix est sûr. */
  nettete: number;
}

/** ffmpeg livré avec Remotion (node_modules/@remotion/compositor-<plateforme>/). */
export function trouverFfmpeg(): { ffmpeg: string; dossier: string } | null {
  const base = path.join(ICI, 'node_modules', '@remotion');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (!d.startsWith('compositor-')) continue;
    const dossier = path.join(base, d);
    for (const nom of ['ffmpeg.exe', 'ffmpeg']) {
      const f = path.join(dossier, nom);
      if (existsSync(f)) return { ffmpeg: f, dossier };
    }
  }
  return null;
}

/** Lance ffmpeg ; stdout brut (Buffer) pour les décodages, stderr en texte. */
export function lancerFfmpeg(args: string[], timeoutMs = 10 * 60_000): { ok: boolean; donnees: Buffer; journal: string } {
  const f = trouverFfmpeg();
  if (!f) throw new Error('ffmpeg de Remotion introuvable : lance « npm ci » dans tools\\vr-video.');
  const r = spawnSync(f.ffmpeg, ['-hide_banner', '-nostats', '-loglevel', 'error', ...args], {
    cwd: f.dossier,
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
    // Linux : les bibliothèques de ffmpeg sont à côté de l'exécutable (Windows les trouve tout seul).
    env: { ...process.env, LD_LIBRARY_PATH: [f.dossier, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter) },
  });
  return { ok: r.status === 0, donnees: (r.stdout as Buffer | null) ?? Buffer.alloc(0), journal: String(r.stderr ?? '') };
}

export const TAUX_AUDIO = 8000; // Hz, mono : largement assez pour mesurer un volume
export const IMAGES_PAR_S = 4;
export const MINI = { l: 32, h: 18 }; // images miniatures en niveaux de gris pour mesurer le mouvement

/** Partie « data » d'un WAV (l'en-tête peut contenir d'autres blocs, ex. LIST). */
export function donneesWav(wav: Buffer): Buffer {
  let i = 12;
  while (i + 8 <= wav.length) {
    const id = wav.toString('ascii', i, i + 4);
    const taille = wav.readUInt32LE(i + 4);
    if (id === 'data') return wav.subarray(i + 8); // taille souvent inconnue en sortie pipe : on prend tout le reste
    i += 8 + taille + (taille % 2);
  }
  return Buffer.alloc(0);
}

/** Volume (dB) par quart de seconde depuis du PCM 16 bits mono. */
export function volumes(pcm: Buffer, taux = TAUX_AUDIO): Mesure[] {
  const n = Math.floor(pcm.length / 2);
  const bloc = Math.max(1, Math.floor(taux / 4));
  const mesures: Mesure[] = [];
  for (let debut = 0; debut + bloc <= n; debut += bloc) {
    let somme = 0;
    for (let i = debut; i < debut + bloc; i++) {
      const x = pcm.readInt16LE(i * 2) / 32768;
      somme += x * x;
    }
    const rms = Math.sqrt(somme / bloc);
    mesures.push({ t: debut / taux, v: rms > 0 ? Math.max(-90, 20 * Math.log10(rms)) : -90 });
  }
  return mesures;
}

/** Mouvement (0 à 1) entre images miniatures successives (différence moyenne des pixels). */
export function mouvements(brut: Buffer, taille = MINI.l * MINI.h, ips = IMAGES_PAR_S): Mesure[] {
  const n = Math.floor(brut.length / taille);
  const mesures: Mesure[] = [];
  for (let k = 1; k < n; k++) {
    let somme = 0;
    for (let i = 0; i < taille; i++) somme += Math.abs(brut[k * taille + i]! - brut[(k - 1) * taille + i]!);
    mesures.push({ t: k / ips, v: somme / taille / 255 });
  }
  return mesures;
}

/** Une valeur par seconde (fonction d'agrégat au choix), NaN si la seconde n'a pas de mesure. */
function parSeconde(mesures: Mesure[], n: number, agreger: (vs: number[]) => number): number[] {
  const seaux: number[][] = Array.from({ length: n }, () => []);
  for (const m of mesures) {
    const s = Math.floor(m.t);
    if (s >= 0 && s < n) seaux[s]!.push(m.v);
  }
  return seaux.map((vs) => (vs.length ? agreger(vs) : Number.NaN));
}

function centile(vs: number[], p: number): number {
  const tri = vs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!tri.length) return 0;
  return tri[Math.min(tri.length - 1, Math.max(0, Math.round((tri.length - 1) * p)))]!;
}

/** Normalise entre le « fond » (20e centile) et le maximum ; renvoie aussi l'écart (0 si tout est plat). */
function normaliser(vs: number[], ecartMin: number): { n: number[]; ecart: number } {
  const bas = centile(vs, 0.2);
  const haut = Math.max(...vs.filter(Number.isFinite), bas);
  const ecart = haut - bas;
  if (ecart < ecartMin) return { n: vs.map(() => 0), ecart: 0 };
  return { n: vs.map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, (v - bas) / ecart)) : 0)), ecart };
}

/**
 * Fenêtre de « garder » secondes autour du moment fort : le pic tombe aux 70 % de la fenêtre (on voit ce
 * qui mène à l'action, puis la réaction). Léger avantage aux moments tardifs : avec la touche Créer, le
 * résultat est souvent vers la fin. null si rien ne ressort (son et image plats) : on garde alors la fin.
 */
export function meilleurPassage(audio: Mesure[], mouvement: Mesure[], dureeClip: number, garder: number): ChoixPassage | null {
  const n = Math.max(1, Math.floor(dureeClip));
  const duree = Math.min(garder, dureeClip);
  if (dureeClip - duree < 1) return null; // capture à peine plus longue que le passage voulu : rien à choisir
  const a = normaliser(parSeconde(audio, n, (vs) => Math.max(...vs)), 3); // dB : 3 dB d'écart minimum
  const m = normaliser(parSeconde(mouvement, n, (vs) => vs.reduce((s, x) => s + x, 0) / vs.length), 0.02);
  const pa = a.ecart ? (m.ecart ? 0.6 : 1) : 0;
  const pm = m.ecart ? (a.ecart ? 0.4 : 1) : 0;
  if (!pa && !pm) return null;
  const brut = Array.from({ length: n }, (_, s) => pa * a.n[s]! + pm * m.n[s]!);
  const lisse = brut.map((_, s) => {
    const fen = brut.slice(Math.max(0, s - 1), Math.min(n, s + 2));
    return fen.reduce((x, y) => x + y, 0) / fen.length;
  });
  let pic = 0;
  let meilleur = -1;
  lisse.forEach((v, s) => {
    const pondere = v * (0.85 + (0.3 * s) / n);
    if (pondere > meilleur) {
      meilleur = pondere;
      pic = s;
    }
  });
  const fond = centile(lisse, 0.5);
  const nettete = Math.max(0, Math.min(1, (lisse[pic]! - fond) / Math.max(1e-6, 1 - fond)));
  const debut = Math.min(Math.max(0, pic + 0.5 - 0.7 * duree), Math.max(0, dureeClip - duree - 0.05));
  return { debut: Math.round(debut * 10) / 10, duree, pic, nettete: Math.round(nettete * 100) / 100 };
}

/**
 * Analyse une capture et choisit le passage (quelques secondes pour une minute de jeu). ffmpeg ne fait que
 * décoder : le son en PCM 8 kHz mono, l'image en miniatures 32×18 grises à 4 images/s ; les mesures sont
 * calculées ici. null si ffmpeg est absent ou si rien ne ressort.
 */
export function choisirPassage(fichier: string, dureeClip: number, garder: number): ChoixPassage | null {
  if (!trouverFfmpeg()) return null;
  // Le ffmpeg de Remotion n'a que quelques formats de sortie : WAV pour le son, image2pipe + rawvideo pour l'image.
  const son = lancerFfmpeg(['-i', fichier, '-vn', '-ac', '1', '-ar', String(TAUX_AUDIO), '-c:a', 'pcm_s16le', '-f', 'wav', '-']);
  const image = lancerFfmpeg(['-i', fichier, '-an', '-vf', `scale=${MINI.l}:${MINI.h},format=gray`, '-r', String(IMAGES_PAR_S), '-c:v', 'rawvideo', '-f', 'image2pipe', '-']);
  const audio = son.ok ? volumes(donneesWav(son.donnees)) : [];
  const mouvement = image.ok ? mouvements(image.donnees) : [];
  return meilleurPassage(audio, mouvement, dureeClip, garder);
}
