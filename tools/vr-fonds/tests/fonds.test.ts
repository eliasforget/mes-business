// Tests : npm test   (aucun appel réseau : fetch simulé)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lireIndex, nomFichier, recherchesDuScript, remplirBibliotheque, type Reglages } from '../fonds.ts';
import { CACHE_MS, ClientPixabay, choisirFichier, ErreurPixabay, type Fetch, type RenduPixabay, type VideoPixabay } from '../pixabay.ts';

const REGLAGES: Reglages = { dureeMin: 5, dureeMax: 60, maxMo: 120, accepterPaysage: true };
const sansAttente = { attendre: async () => {} };

const r = (id: number, nom: string, width: number, height: number, size = 5_000_000): RenduPixabay => ({ url: `https://cdn.pixabay.com/video/${id}-${nom}.mp4`, width, height, size });

/** Vidéo verticale par défaut (rendus 4K, 1080p, 720p, 540p). */
function video(id: number, o: Partial<VideoPixabay> = {}): VideoPixabay {
  return {
    id, pageURL: `https://pixabay.com/videos/clip-${id}/`, tags: 'ville, nuit', duration: 12, user_id: 100 + id, user: `Auteur${id}`,
    videos: { large: r(id, 'large', 2160, 3840, 60_000_000), medium: r(id, 'medium', 1080, 1920), small: r(id, 'small', 720, 1280), tiny: r(id, 'tiny', 540, 960) },
    ...o,
  };
}
/** Vidéo horizontale : 4K disponible ou non. */
function paysage(id: number, avec4k = true, o: Partial<VideoPixabay> = {}): VideoPixabay {
  return video(id, {
    videos: {
      large: avec4k ? r(id, 'large', 3840, 2160, 50_000_000) : { url: '', width: 0, height: 0, size: 0 },
      medium: r(id, 'medium', 1920, 1080), small: r(id, 'small', 1280, 720), tiny: r(id, 'tiny', 960, 540),
    },
    ...o,
  });
}

/** Faux Pixabay : résultats par requête, téléchargements qui renvoient un petit contenu. */
function fauxPixabay(resultats: Record<string, VideoPixabay[]>, entetes: Record<string, string> = {}) {
  const requetes: string[] = [];
  const telechargements: string[] = [];
  const f = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.hostname === 'pixabay.com') {
      assert.equal(u.searchParams.get('key'), 'CLE-PIXABAY');
      assert.equal(u.searchParams.get('lang'), 'fr');
      assert.equal(u.searchParams.get('safesearch'), 'true');
      const q = u.searchParams.get('q')!;
      requetes.push(q);
      return Response.json({ total: 1, totalHits: 1, hits: resultats[q] ?? [] }, { headers: { 'X-RateLimit-Remaining': '99', 'X-RateLimit-Reset': '60', ...entetes } });
    }
    telechargements.push(String(url));
    if (String(url).includes('casse')) return new Response('non', { status: 403 });
    return new Response(`contenu ${url}`, { headers: { 'content-length': String(`contenu ${url}`.length) } });
  }) as Fetch;
  return { f, requetes, telechargements };
}

test('choix du fichier : verticale ≥ 1080 la plus légère ; horizontale seulement en 4K ; poids max', () => {
  assert.equal(choisirFichier(video(1), true)!.url, 'https://cdn.pixabay.com/video/1-medium.mp4');
  const h = choisirFichier(paysage(2), true)!;
  assert.equal(h.url, 'https://cdn.pixabay.com/video/2-large.mp4');
  assert.equal(h.vertical, false);
  assert.equal(choisirFichier(paysage(2), false), null, 'horizontales refusées si ACCEPTER_PAYSAGE=non');
  assert.equal(choisirFichier(paysage(3, false), true), null, 'pas de 4K : recadrage trop flou');
  assert.equal(choisirFichier(paysage(2), true, 40), null, '4K trop lourde');
  const petiteVerticale = video(4, { videos: { medium: r(4, 'medium', 720, 1280), tiny: r(4, 'tiny', 540, 960) } });
  assert.equal(choisirFichier(petiteVerticale, true)!.url, 'https://cdn.pixabay.com/video/4-medium.mp4');
});

test('nom de fichier lisible par vr-video', () => {
  assert.equal(nomFichier(['Miami', 'nuit néons'], 42), 'miami-nuit-neons-pixabay-42.mp4');
  assert.equal(nomFichier(['Œuf de Pâques'], 7), 'oeuf-de-paques-pixabay-7.mp4');
});

test('recherches du script : motsCles de chaque scène, sinon mots-clés par défaut en rotation', () => {
  const rs = recherchesDuScript({ scenes: [{ motsCles: ['miami', 'nuit'] }, {}, {}] }, 3, ['plage', 'neons']);
  assert.deepEqual(rs.map((x) => x.motsCles), [['miami', 'nuit'], ['neons'], ['plage']]);
  assert.throws(() => recherchesDuScript({ scenes: [] }, 3, []), /non vide/);
});

test('téléchargement : verticales d\'abord, index + crédits, pas de doublon, relance sans re-télécharger', async () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  const { f, requetes, telechargements } = fauxPixabay({
    'miami nuit': [paysage(1), video(2, { duration: 3 }), paysage(3, false), video(4)],
    miami: [video(4), video(5)],
    nuit: [video(6), paysage(7)],
  });
  const client = new ClientPixabay('CLE-PIXABAY', { fetchImpl: f, ...sansAttente });
  const recherche = [{ motsCles: ['miami', 'nuit'], nombre: 3, etiquette: 'scène 1' }];

  const b = await remplirBibliotheque(recherche, dossier, client, REGLAGES);
  // Verticales retenues : 4, 5, 6 (2 trop courte). Les horizontales 4K (1, 7) ne servent qu'en complément.
  assert.deepEqual(b.telecharges, ['miami-nuit-pixabay-4.mp4', 'miami-nuit-pixabay-5.mp4', 'miami-nuit-pixabay-6.mp4']);
  assert.deepEqual(requetes, ['miami nuit', 'miami', 'nuit']);
  assert.ok(telechargements.every((u) => u.endsWith('-medium.mp4')));
  const index = lireIndex(dossier);
  assert.deepEqual(index['miami-nuit-pixabay-4.mp4']!.motsCles, ['miami', 'nuit']);
  assert.equal(index['miami-nuit-pixabay-4.mp4']!.auteurUrl, 'https://pixabay.com/users/Auteur4-104/');
  assert.equal(index['miami-nuit-pixabay-4.mp4']!.vertical, true);
  assert.match(readFileSync(path.join(dossier, 'CREDITS.md'), 'utf8'), /Auteur5.*Pixabay/);

  // Relance : plus de verticale neuve, on complète avec les horizontales 4K (1 puis 7), rien n'est re-téléchargé.
  const n = telechargements.length;
  const b2 = await remplirBibliotheque(recherche, dossier, client, REGLAGES);
  assert.deepEqual(b2.telecharges, ['miami-nuit-pixabay-1.mp4', 'miami-nuit-pixabay-7.mp4']);
  assert.equal(telechargements.length, n + 2);
  assert.ok(telechargements.slice(n).every((u) => u.endsWith('-large.mp4')));
  assert.equal(client.requetesReseau, 3, 'la relance est servie par le cache');
  rmSync(dossier, { recursive: true, force: true });
});

test('dry-run : aucune écriture ; erreur de téléchargement : pas de fichier partiel', async () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  const casse = video(9, { videos: { medium: { url: 'https://cdn.pixabay.com/casse.mp4', width: 1080, height: 1920, size: 1000 } } });
  const { f, telechargements } = fauxPixabay({ plage: [video(8), casse] });
  const client = new ClientPixabay('CLE-PIXABAY', { fetchImpl: f, ...sansAttente });
  const rs = [{ motsCles: ['plage'], nombre: 2, etiquette: 'test' }];

  const d = await remplirBibliotheque(rs, dossier, client, REGLAGES, { dryRun: true });
  assert.equal(d.telecharges.length, 2);
  assert.equal(telechargements.length, 0);
  assert.deepEqual(readdirSync(dossier), []);

  const b = await remplirBibliotheque(rs, dossier, client, REGLAGES);
  assert.equal(b.erreurs, 1);
  assert.deepEqual(readdirSync(dossier).sort(), ['CREDITS.md', 'index.json', 'plage-pixabay-8.mp4']);
  assert.ok(!existsSync(path.join(dossier, 'plage-pixabay-9.mp4.part')));
  rmSync(dossier, { recursive: true, force: true });
});

test('cache 24 h sur disque, sans la clé ; expiration', async () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  const cacheFichier = path.join(dossier, '.cache-pixabay.json');
  const { f, requetes } = fauxPixabay({ plage: [video(1)] });
  let t = 1_000_000;
  const opts = { fetchImpl: f, cacheFichier, maintenant: () => t, ...sansAttente };

  await new ClientPixabay('CLE-PIXABAY', opts).rechercher('plage');
  const c2 = new ClientPixabay('CLE-PIXABAY', opts); // nouveau lancement : relit le cache
  assert.equal((await c2.rechercher('plage'))[0]!.id, 1);
  assert.equal(requetes.length, 1);
  assert.equal(c2.depuisCache, 1);
  assert.ok(!readFileSync(cacheFichier, 'utf8').includes('CLE-PIXABAY'), 'la clé ne doit jamais être écrite');

  t += CACHE_MS + 1;
  await new ClientPixabay('CLE-PIXABAY', opts).rechercher('plage');
  assert.equal(requetes.length, 2, 'cache périmé : nouvelle requête');
  rmSync(dossier, { recursive: true, force: true });
});

test('limite de débit : attente puis nouvel essai ; clé refusée sans fuite de la clé', async () => {
  let appels = 0;
  const pauses: number[] = [];
  const limite = (async () => {
    appels += 1;
    if (appels === 1) return new Response('API rate limit exceeded', { status: 429, headers: { 'X-RateLimit-Reset': '7' } });
    return Response.json({ hits: [video(1)] });
  }) as Fetch;
  const c = new ClientPixabay('CLE-PIXABAY', { fetchImpl: limite, attendre: async (ms) => void pauses.push(ms) });
  assert.equal((await c.rechercher('x')).length, 1);
  assert.deepEqual(pauses, [7000]);

  const refus = new ClientPixabay('MAUVAISE-CLE', { fetchImpl: (async () => new Response('[ERROR 400] "key" is invalid', { status: 400 })) as Fetch });
  await assert.rejects(refus.rechercher('x'), (e: unknown) => e instanceof ErreurPixabay && /PIXABAY_API_KEY/.test(e.message) && !e.message.includes('MAUVAISE'));

  const panne = new ClientPixabay('CLE-SECRETE', { fetchImpl: (async (u: string) => { throw new TypeError(`fetch failed ${u}`); }) as unknown as Fetch });
  await assert.rejects(panne.rechercher('x'), (e: unknown) => e instanceof ErreurPixabay && !e.message.includes('CLE-SECRETE'));
});
