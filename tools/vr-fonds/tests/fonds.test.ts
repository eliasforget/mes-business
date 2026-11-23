// Tests : npm test   (aucun appel réseau : fetch simulé)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { lireIndex, nomFichier, recherchesDuScript, remplirBibliotheque, type Reglages } from '../fonds.ts';
import { ClientPexels, choisirFichier, ErreurPexels, type Fetch, type VideoPexels } from '../pexels.ts';

const REGLAGES: Reglages = { dureeMin: 5, dureeMax: 60, maxMo: 80, reserveRequetes: 50 };

function video(id: number, o: Partial<VideoPexels> = {}): VideoPexels {
  return {
    id, width: 1080, height: 1920, duration: 12, url: `https://www.pexels.com/video/${id}/`, user: { name: `Auteur ${id}`, url: `https://www.pexels.com/@a${id}` },
    video_files: [
      { id: id * 10 + 1, quality: 'uhd', file_type: 'video/mp4', width: 2160, height: 3840, link: `https://videos.pexels.com/${id}-4k.mp4` },
      { id: id * 10 + 2, quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: `https://videos.pexels.com/${id}-hd.mp4` },
      { id: id * 10 + 3, quality: 'sd', file_type: 'video/mp4', width: 540, height: 960, link: `https://videos.pexels.com/${id}-sd.mp4` },
    ],
    ...o,
  };
}

/** Faux Pexels : résultats par requête, téléchargements qui renvoient un petit contenu. */
function fauxPexels(resultats: Record<string, VideoPexels[]>, restantes = 19_000) {
  const requetes: string[] = [];
  const telechargements: string[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.hostname === 'api.pexels.com') {
      assert.equal((init?.headers as Record<string, string>).Authorization, 'CLE-PEXELS');
      assert.equal(u.searchParams.get('orientation'), 'portrait');
      const q = u.searchParams.get('query')!;
      requetes.push(q);
      return Response.json({ videos: resultats[q] ?? [] }, { headers: { 'X-Ratelimit-Remaining': String(restantes - requetes.length) } });
    }
    telechargements.push(String(url));
    if (String(url).includes('casse')) return new Response('non', { status: 403 });
    return new Response(`contenu ${url}`, { headers: { 'content-length': String(`contenu ${url}`.length) } });
  }) as Fetch;
  return { f, requetes, telechargements };
}

test('choix du fichier : le plus léger ≥ 1080 px de large, vertical, MP4', () => {
  assert.equal(choisirFichier(video(1))!.link, 'https://videos.pexels.com/1-hd.mp4');
  const petit = video(2, { video_files: [{ id: 1, quality: 'sd', file_type: 'video/mp4', width: 540, height: 960, link: 'sd' }, { id: 2, quality: 'sd', file_type: 'video/mp4', width: 720, height: 1280, link: '720' }] });
  assert.equal(choisirFichier(petit)!.link, '720');
  const paysage = video(3, { video_files: [{ id: 1, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'l' }] });
  assert.equal(choisirFichier(paysage), null);
});

test('nom de fichier lisible par vr-video', () => {
  assert.equal(nomFichier(['Miami', 'nuit néons'], 42), 'miami-nuit-neons-pexels-42.mp4');
  assert.equal(nomFichier(['Œuf de Pâques'], 7), 'oeuf-de-paques-pexels-7.mp4');
});

test('recherches du script : motsCles de chaque scène, sinon mots-clés par défaut en rotation', () => {
  const r = recherchesDuScript({ scenes: [{ motsCles: ['miami', 'nuit'] }, {}, {}] }, 3, ['plage', 'neons']);
  assert.deepEqual(r.map((x) => x.motsCles), [['miami', 'nuit'], ['neons'], ['plage']]);
  assert.throws(() => recherchesDuScript({ scenes: [] }, 3, []), /non vide/);
});

test('téléchargement : bons fichiers, index + crédits, pas de doublon, relance sans re-télécharger', async () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  const { f, requetes, telechargements } = fauxPexels({
    'miami nuit': [video(1), video(2, { duration: 3 }), video(3, { width: 1920, height: 1080 }), video(4)],
    miami: [video(4), video(5)],
    nuit: [video(6)],
  });
  const client = new ClientPexels('CLE-PEXELS', f);
  const recherche = [{ motsCles: ['miami', 'nuit'], nombre: 3, etiquette: 'scène 1' }];

  const b = await remplirBibliotheque(recherche, dossier, client, REGLAGES);
  // 1 et 4 conviennent dans « miami nuit » (2 trop court, 3 horizontal), puis 5 trouvé via « miami » seul.
  assert.deepEqual(b.telecharges, ['miami-nuit-pexels-1.mp4', 'miami-nuit-pexels-4.mp4', 'miami-nuit-pexels-5.mp4']);
  assert.deepEqual(requetes, ['miami nuit', 'miami']);
  assert.ok(telechargements.every((u) => u.endsWith('-hd.mp4')));
  const index = lireIndex(dossier);
  assert.deepEqual(index['miami-nuit-pexels-1.mp4']!.motsCles, ['miami', 'nuit']);
  assert.equal(index['miami-nuit-pexels-1.mp4']!.auteur, 'Auteur 1');
  assert.match(readFileSync(path.join(dossier, 'CREDITS.md'), 'utf8'), /Auteur 4/);
  assert.equal(client.restantes, 19_000 - 2);

  const n = telechargements.length;
  const b2 = await remplirBibliotheque(recherche, dossier, client, REGLAGES);
  assert.deepEqual(b2.telecharges, ['miami-nuit-pexels-6.mp4'], 'seule une vidéo jamais téléchargée est ajoutée');
  assert.equal(telechargements.length, n + 1);
  rmSync(dossier, { recursive: true, force: true });
});

test('dry-run : aucune écriture ; erreur de téléchargement : pas de fichier partiel', async () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  const casse = video(9, { video_files: [{ id: 1, quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/casse.mp4' }] });
  const { f, telechargements } = fauxPexels({ plage: [video(8), casse] });
  const client = new ClientPexels('CLE-PEXELS', f);
  const r = [{ motsCles: ['plage'], nombre: 2, etiquette: 'test' }];

  const d = await remplirBibliotheque(r, dossier, client, REGLAGES, { dryRun: true });
  assert.equal(d.telecharges.length, 2);
  assert.equal(telechargements.length, 0);
  assert.deepEqual(readdirSync(dossier), []);

  const b = await remplirBibliotheque(r, dossier, client, REGLAGES);
  assert.equal(b.erreurs, 1);
  assert.deepEqual(readdirSync(dossier).sort(), ['CREDITS.md', 'index.json', 'plage-pexels-8.mp4']);
  assert.ok(!existsSync(path.join(dossier, 'plage-pexels-9.mp4.part')));
  rmSync(dossier, { recursive: true, force: true });
});

test('réserve de requêtes et clé refusée', async () => {
  const presqueVide = fauxPexels({ a: [video(1)] }, 52);
  const client = new ClientPexels('CLE-PEXELS', presqueVide.f);
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'vr-fonds-'));
  await assert.rejects(remplirBibliotheque([{ motsCles: ['a', 'b'], nombre: 5, etiquette: 't' }], dossier, client, REGLAGES), /réserve 50/);

  const refus = new ClientPexels('MAUVAISE', (async () => new Response('', { status: 401 })) as Fetch);
  await assert.rejects(refus.rechercher('x'), (e: unknown) => e instanceof ErreurPexels && /PEXELS_API_KEY/.test(e.message));
  rmSync(dossier, { recursive: true, force: true });
});
