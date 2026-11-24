import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chaineDe, compteurDuJour, decider, empreinte, ETAT_VIDE, horodatage, MAX_ESSAIS, nomSur, textesCompilation, titreChapitre, trier, type Etat, type InfosVideo } from '../lib.ts';

const video = (x: Partial<InfosVideo> = {}): InfosVideo => ({ nom: '08-x', script: {}, empreinte: 'e1', captureOk: true, dejaRendue: false, ...x });
const etat = (videos: Etat['videos'] = {}): Etat => ({ ...ETAT_VIDE, videos });

test('une nouvelle vidéo est fabriquée', () => {
  assert.equal(decider(video(), etat(), new Set()).action, 'fabriquer');
});

test('une vidéo déjà faite avec le même script est passée', () => {
  assert.deepEqual(decider(video(), etat({ '08-x': { empreinte: 'e1', statut: 'prete', le: '' } }), new Set()), { action: 'passer', raison: 'deja_faite' });
});

test('un script modifié par un agent est refabriqué', () => {
  const d = decider(video({ empreinte: 'e2' }), etat({ '08-x': { empreinte: 'e1', statut: 'prete', le: '' } }), new Set());
  assert.deepEqual(d, { action: 'fabriquer', raison: 'script modifié' });
});

test('les vidéos ignorées, en auto: false ou sans capture sont passées', () => {
  assert.equal(decider(video(), etat(), new Set(['08-x'])).action, 'passer');
  assert.deepEqual(decider(video({ script: { auto: false } }), etat(), new Set()), { action: 'passer', raison: 'auto_off' });
  assert.deepEqual(decider(video({ script: { gameplay: {} }, captureOk: false }), etat(), new Set()), { action: 'passer', raison: 'attend_capture' });
});

test('une vidéo rendue à la main avant l\'usine n\'est pas refaite', () => {
  assert.deepEqual(decider(video({ dejaRendue: true }), etat(), new Set()), { action: 'passer', raison: 'deja_rendue_avant_usine' });
});

test('une erreur est réessayée, puis abandonnée après MAX_ESSAIS', () => {
  assert.equal(decider(video(), etat({ '08-x': { empreinte: 'e1', statut: 'erreur', le: '', essais: 1 } }), new Set()).action, 'fabriquer');
  assert.deepEqual(decider(video(), etat({ '08-x': { empreinte: 'e1', statut: 'erreur', le: '', essais: MAX_ESSAIS } }), new Set()), { action: 'passer', raison: 'trop_d_erreurs' });
});

test('le compteur du jour repart à zéro le lendemain', () => {
  assert.equal(compteurDuJour({ ...ETAT_VIDE, jour: '2026-11-24', faitesAujourdhui: 3 }, '2026-11-24').faitesAujourdhui, 3);
  assert.equal(compteurDuJour({ ...ETAT_VIDE, jour: '2026-11-24', faitesAujourdhui: 3 }, '2026-11-25').faitesAujourdhui, 0);
});

test('empreinte stable malgré les fins de ligne Windows', () => {
  assert.equal(empreinte('a\r\nb', 'c'), empreinte('a\nb', 'c'));
  assert.notEqual(empreinte('a', 'c'), empreinte('a', 'd'));
});

test('chaîne, noms sûrs et ordre', () => {
  assert.equal(chaineDe({ theme: 'faits-animes' }), 'Faits animés');
  assert.equal(chaineDe({}), 'Vice Radar');
  assert.equal(nomSur('a:b?c. '), 'abc');
  assert.deepEqual(trier(['11-a', 'F01-b', '07-c', '10-d']), ['07-c', '10-d', '11-a', 'F01-b']);
});

test('textes de la compilation : chapitres YouTube à partir de 0:00', () => {
  assert.equal(titreChapitre('GTA 6 : 4 secrets de plus (partie 4)'), '4 secrets de plus (partie 4)');
  assert.equal(titreChapitre('E01 — Planté au milieu de la route'), 'Planté au milieu de la route');
  assert.equal(horodatage(75), '1:15');
  assert.equal(horodatage(3725), '1:02:05');
  const t = textesCompilation('Faits animés', [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 35 }, { titre: 'C', debut: 70 }], 105);
  assert.equal(t.titre, '3 faits incroyables en 2 minutes');
  assert.match(t.description, /0:00 A\n0:35 B\n1:10 C/);
});
