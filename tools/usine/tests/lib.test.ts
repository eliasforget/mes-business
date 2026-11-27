import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aBesoinDePlanche, ATTENTE_COMMENTAIRE_H, chaineDe, compteurDuJour, decider, empreinte, ETAT_VIDE, horodatage, MAX_ESSAIS, nomSur, ordreDeFabrication, textesCompilation, titreChapitre, trier, voixRegeneree, type Etat, type InfosVideo } from '../lib.ts';

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

test('vidéo de jeu : planche demandée tant qu’il n’y a pas de commentaires', () => {
  const jeu = (script: InfosVideo['script'], x: Partial<InfosVideo> = {}) => video({ script: { gameplay: {}, ...script }, ...x });
  assert.equal(aBesoinDePlanche(jeu({})), true);
  assert.equal(aBesoinDePlanche(jeu({}, { captureOk: false })), false, 'pas de capture, pas de planche');
  assert.equal(aBesoinDePlanche(jeu({ commentaire: 'a_ecrire' }, { plancheLe: 1 })), false, 'déjà envoyée');
  assert.equal(aBesoinDePlanche(jeu({ commentaire: 'a_ecrire' })), true, 'planche perdue : refaite');
  assert.equal(aBesoinDePlanche(jeu({ commentaires: [{ a: 2, texte: 'x' }] })), false);
  assert.equal(aBesoinDePlanche(jeu({ commentaire: 'sans' })), false);
  assert.equal(aBesoinDePlanche(video()), false, 'vidéo motion design');
});

test('vidéo de jeu : on attend les commentaires, puis on rend quand même après 48 h', () => {
  const v = video({ script: { gameplay: {}, commentaire: 'a_ecrire' }, plancheLe: 0 });
  assert.deepEqual(decider(v, etat(), new Set(), 3_600_000), { action: 'passer', raison: 'attend_commentaire' });
  const tard = decider(v, etat(), new Set(), (ATTENTE_COMMENTAIRE_H + 1) * 3_600_000);
  assert.equal(tard.action, 'fabriquer');
  assert.match((tard as { raison: string }).raison, /sans commentaires/);
  const commente = video({ script: { gameplay: {}, commentaire: 'fait', commentaires: [{ a: 3, texte: 'x' }] }, empreinte: 'e2' });
  assert.deepEqual(decider(commente, etat({ '08-x': { empreinte: 'e1', statut: 'prete', le: '' } }), new Set()), { action: 'fabriquer', raison: 'script modifié' });
});

test('ordreDeFabrication : une vidéo de chaque chaîne à tour de rôle', () => {
  const v = (nom: string) => ({ nom, chaine: /^\d/.test(nom) ? 'Vice Radar' : 'Faits animés' });
  const ordre = ordreDeFabrication([v('F05-e'), v('14-d'), v('F04-c'), v('09-a'), v('11-b'), v('13-x')]).map((x) => x.nom);
  assert.deepEqual(ordre, ['09-a', 'F04-c', '11-b', 'F05-e', '13-x', '14-d']);
  assert.deepEqual(ordreDeFabrication([]), []);
  assert.deepEqual(ordreDeFabrication([v('F01-a'), v('F02-b')]).map((x) => x.nom), ['F01-a', 'F02-b']);
});

test('voixRegeneree : vrai seulement si un fichier de voix a changé ou est apparu', () => {
  assert.equal(voixRegeneree(['voix.meta.json:1:10'], ['voix.meta.json:1:10']), false);
  assert.equal(voixRegeneree([], []), false);
  assert.equal(voixRegeneree(['voix.meta.json:1:10'], ['voix.meta.json:2:10']), true);
  assert.equal(voixRegeneree([], ['voix.meta.json:1:10']), true);
  assert.equal(voixRegeneree(['voix.meta.json:1:10'], ['voix.meta.json:1:10', 'voix-c1.meta.json:3:5']), true);
});
