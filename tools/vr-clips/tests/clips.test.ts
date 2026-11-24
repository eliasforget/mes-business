// Tests : npm test   (node --test, sans dépendance ni accès disque)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  associationsForcees, associer, cleCapture, horodatage, listeIds, nomDossier, prochainNumero, question, scriptVideo, slug,
  textesPublication, verifierTournage, type Capture, type Experience, type Tournage,
} from '../lib.ts';

const tournage = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'tournage.json'), 'utf8')) as Tournage;

const exp = (id: string): Experience => ({ id, titre: `Titre ${id}`, accroche: `Que se passe-t-il pour ${id} ? Regarde.`, lignes: [{ texte: id }] });
const cap = (nom: string, h: number): Capture => ({ fichier: `/x/${nom}`, nom, taille: 1000 + h, horodatage: h });

test('la liste de tournage fournie est valide', () => {
  assert.deepEqual(verifierTournage(tournage), []);
});

test('liste de tournage : erreurs lisibles (id en double, champs manquants)', () => {
  const e = verifierTournage({ experiences: [exp('E01'), { ...exp('e01') }, { id: 'E 3', titre: '', accroche: '', lignes: [] }] });
  assert.equal(e.length, 5);
  assert.deepEqual(verifierTournage({ experiences: [] }), ['« experiences » doit être une liste non vide.']);
});

test('horodatage : date du nom de fichier PS5, sinon date de modification', () => {
  assert.equal(horodatage('Grand Theft Auto VI_20261123203015.mp4', 5), Date.UTC(2026, 10, 23, 20, 30, 15));
  assert.equal(horodatage('GTA6_2026-11-23_20-30-15.mp4', 5), Date.UTC(2026, 10, 23, 20, 30, 15));
  assert.equal(horodatage('clip.mp4', 1234), 1234);
  // Chiffres qui ne forment pas une date valide : on retombe sur la date du fichier.
  assert.equal(horodatage('video_20269999999999.mp4', 42), 42);
});

test('association dans l\'ordre d\'enregistrement, captures et expériences en trop signalées', () => {
  const a = associer([exp('E01'), exp('E02'), exp('E03')], [cap('b.mp4', 2), cap('a.mp4', 1)]);
  assert.deepEqual(a.paires.map((p) => [p.experience.id, p.capture.nom]), [['E01', 'a.mp4'], ['E02', 'b.mp4']]);
  assert.deepEqual(a.experiencesSansCapture.map((e) => e.id), ['E03']);
  const b = associer([exp('E01')], [cap('a.mp4', 1), cap('b.mp4', 2)]);
  assert.deepEqual(b.capturesEnTrop.map((c) => c.nom), ['b.mp4']);
});

test('--sauter : l\'expérience sautée ne prend pas de capture, les suivantes se décalent', () => {
  const a = associer([exp('E01'), exp('E02'), exp('E03')], [cap('a.mp4', 1), cap('b.mp4', 2)], { sauter: listeIds('e02') });
  assert.deepEqual(a.paires.map((p) => [p.experience.id, p.capture.nom]), [['E01', 'a.mp4'], ['E03', 'b.mp4']]);
  assert.match(associer([exp('E01')], [], { sauter: ['E09'] }).erreurs[0]!, /E09/);
});

test('--associer : force une capture par un morceau de son nom, le reste suit l\'ordre', () => {
  const { forces, erreurs } = associationsForcees(['e03=2031', 'mauvais']);
  assert.equal(erreurs.length, 1);
  const a = associer([exp('E01'), exp('E02'), exp('E03')], [cap('x_2015.mp4', 1), cap('x_2031.mp4', 2), cap('x_2040.mp4', 3)], { forces });
  assert.deepEqual(a.paires.map((p) => [p.experience.id, p.capture.nom]), [['E01', 'x_2015.mp4'], ['E02', 'x_2040.mp4'], ['E03', 'x_2031.mp4']]);
  const ambigu = associer([exp('E01')], [cap('x_20.mp4', 1), cap('x_20b.mp4', 2)], { forces: new Map([['E01', 'x_20']]) });
  assert.match(ambigu.erreurs[0]!, /2 captures/);
});

test('noms de dossiers : numéro suivant, slug sans accents', () => {
  assert.equal(prochainNumero(['04-easter-eggs', '06-secrets-partie-2', 'notes']), '07');
  assert.equal(prochainNumero([]), '01');
  assert.equal(slug('Rouler dans l’eau à contresens !'), 'rouler-dans-l-eau-a-contresens');
  assert.equal(nomDossier('07', exp('E05')), '07-e05-titre-e05');
  assert.equal(cleCapture({ nom: 'a.mp4', taille: 12 }), 'a.mp4|12');
});

test('script vr-video : accroche en voix, section gameplay, valeurs par défaut de la liste', () => {
  const e = { ...tournage.experiences[0]!, gameplay: { duree: 40 } };
  const s = scriptVideo(e, tournage, 'gameplay.mp4') as { gameplay: Record<string, unknown>; scenes: { tag: string; voix: string }[]; fin: string };
  assert.deepEqual(s.gameplay, { fichier: 'gameplay.mp4', duree: 40 });
  assert.equal(s.scenes.length, 1);
  assert.equal(s.scenes[0]!.tag, tournage.tag);
  assert.equal(s.scenes[0]!.voix, e.accroche);
  assert.equal(s.fin, tournage.fin);
});

test('textes de publication : titre YouTube ≤ 100 caractères, hashtags sans doublon', () => {
  assert.equal(question('Que se passe-t-il ? Regarde.'), 'Que se passe-t-il ?');
  const longue = { ...exp('E01'), accroche: `${'Très '.repeat(30)}longue question ? Fin.`, hashtags: ['#GTA6', '#police'] };
  const t = textesPublication(longue, tournage);
  const titre = t.split('\n')[3]!;
  assert.ok(titre.length <= 100, `titre de ${titre.length} caractères`);
  assert.ok(titre.endsWith('#GTA6 #Shorts'));
  assert.equal(t.match(/#GTA6 #GTAVI #gaming #jeuxvideo #police/g)?.length, 2);
});
