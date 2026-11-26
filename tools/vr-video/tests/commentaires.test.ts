// Tests : npm test   (vidéos gameplay commentées)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grouperSousTitres, intervallesVoix, placerCommentaires, verifierScript, type Mot } from '../src/plan.ts';
import { scriptAvecPassage } from '../planche.ts';

const mots = (texte: string, depart = 0, pas = 0.3): Mot[] => texte.split(' ').map((m, i) => ({ mot: m, debut: depart + i * pas, fin: depart + i * pas + 0.25 }));

test('commentaires : placés à leur seconde, jamais deux voix en même temps', () => {
  const accroche = mots('Combien de temps tu tiens'); // finit à 1,45 s
  const p = placerCommentaires(accroche, [
    { a: 1, mots: mots('Trop tôt') },          // l'accroche n'est pas finie : repoussé après
    { a: 10, mots: mots('La police arrive') }, // à l'heure
    { a: 10.2, mots: mots('Et repart') },      // chevauche le précédent : repoussé
  ]);
  assert.equal(p.departs[0], 1.45 + 0.25);
  assert.equal(p.departs[1], 10);
  assert.ok(p.departs[2]! >= 10 + 0.85 + 0.25 - 1e-9);
  assert.equal(p.mots.length, accroche.length + 2 + 3 + 2);
  assert.equal(p.mots[accroche.length + 2]!.debut, 10);
});

test('intervalles de voix : les mots proches sont regroupés, les silences séparent', () => {
  const m = [...mots('a b c'), ...mots('d e', 5)];
  assert.deepEqual(intervallesVoix(m), [{ debut: 0, fin: 0.85 }, { debut: 5, fin: 5.55 }]);
});

test('sous-titres : un long silence efface le sous-titre au lieu de le laisser affiché', () => {
  const g = grouperSousTitres([...mots('Bonjour.'), ...mots('Plus tard.', 10)]);
  assert.ok(g[0]!.fin < 2, 'effacé ~1,2 s après le dernier mot');
  const continu = grouperSousTitres(mots('un deux trois quatre cinq six'));
  assert.equal(continu[0]!.fin, continu[1]!.debut, 'voix continue : pas de trou');
});

test('vérification des commentaires', () => {
  const base = { scenes: [{ voix: 'Question ?' }], gameplay: {} };
  assert.deepEqual(verifierScript({ ...base, commentaires: [{ a: 3, texte: 'Ok.', zoom: true }], commentaire: 'fait', gameplay: { chrono: 'sans se faire écraser' } }), []);
  assert.ok(verifierScript({ ...base, commentaires: [{ a: 5, texte: 'B' }, { a: 2, texte: 'A' }] }).some((e) => e.includes('ordre')));
  assert.ok(verifierScript({ scenes: [{ voix: 'x' }], commentaires: [{ a: 1, texte: 'x' }] }).some((e) => e.includes('gameplay')));
  assert.ok(verifierScript({ ...base, commentaires: [{ a: -1, texte: '' }] }).length >= 2);
  assert.ok(verifierScript({ ...base, commentaire: 'peut-etre' }).length === 1);
});

test('planche : le passage est figé dans le script, et les commentaires sont demandés une seule fois', () => {
  const s = { scenes: [{ voix: 'Q ?' }], gameplay: { fichier: 'gameplay.mp4' } };
  const r = scriptAvecPassage(s, { depuis: 12.345, duree: 35 });
  assert.deepEqual(r.gameplay, { fichier: 'gameplay.mp4', debut: 12.3, duree: 35 });
  assert.equal(r.commentaire, 'a_ecrire');
  const fait = scriptAvecPassage({ ...s, commentaire: 'fait' as const, commentaires: [{ a: 2, texte: 'x' }] }, { depuis: 0, duree: 30 });
  assert.equal(fait.commentaire, 'fait');
  assert.equal(scriptAvecPassage({ ...s, commentaire: 'sans' as const }, { depuis: 0, duree: 30 }).commentaire, 'sans');
});
