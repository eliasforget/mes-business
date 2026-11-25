import test from 'node:test';
import assert from 'node:assert/strict';
import { erreursSecret, estAffichable, sourcesIndependantes, validerFichier } from '../regles.js';

const src = (site, url = `https://${site.toLowerCase().replace(/\s/g, '')}.example/g`) => ({ site, url, consulte_le: '2026-11-25' });

function secret(sur = {}) {
  return {
    id: 'rencontres-001', nom: 'Test', categorie: 'rencontres', zone: 'Quelque part', description: 'Une description.',
    statut: 'recoupe', spoiler: false, sources: [src('GTASide'), src('LeonidaVerse')],
    date_verification: '2026-11-25', version_jeu: '01.002.002', capture: null, ...sur,
  };
}
const meta = { version_jeu: '01.002.002', mis_a_jour: '2026-11-25', avertissement: 'Aucun secret n’est confirmé par Rockstar.' };

test('un secret recoupé complet est affichable', () => {
  assert.equal(estAffichable(secret()), true);
  assert.deepEqual(erreursSecret(secret()), []);
});

test('statuts a_verifier, retire ou inconnus : jamais affichés (liste blanche)', () => {
  for (const statut of ['a_verifier', 'retire', 'recoupee', '', undefined]) assert.equal(estAffichable(secret({ statut })), false, String(statut));
});

test('spoiler absent ou true : non affiché', () => {
  assert.equal(estAffichable(secret({ spoiler: true })), false);
  const s = secret();
  delete s.spoiler;
  assert.equal(estAffichable(s), false);
  assert.ok(erreursSecret(s).some((e) => e.includes('spoiler')));
});

test('champs manquants : non affiché', () => {
  for (const champ of ['nom', 'zone', 'description', 'date_verification']) assert.equal(estAffichable(secret({ [champ]: '' })), false, champ);
  assert.equal(estAffichable(secret({ categorie: 'inconnue' })), false);
});

test('gta6wiki.eu et Beebom comptent pour une seule source indépendante', () => {
  assert.equal(sourcesIndependantes([src('gta6wiki.eu'), src('Beebom')]), 1);
  assert.equal(sourcesIndependantes([src('gta6wiki.eu'), src('Beebom'), src('Kotaku')]), 2);
  assert.equal(sourcesIndependantes([src('GTASide'), src('GTASide')]), 1);
  assert.equal(estAffichable(secret({ sources: [src('gta6wiki.eu'), src('Beebom')] })), false);
  assert.ok(erreursSecret(secret({ sources: [src('gta6wiki.eu'), src('Beebom')] })).some((e) => e.includes('2 sources indépendantes')));
});

test('vu en jeu : exige une capture, une date et une version', () => {
  assert.equal(estAffichable(secret({ statut: 'verifie_en_jeu', sources: [], capture: null })), false);
  assert.equal(estAffichable(secret({ statut: 'verifie_en_jeu', sources: [], capture: 'captures/rencontres-001.jpg' })), true);
});

test('un secret lié à l’histoire ne peut pas être publié', () => {
  const s = secret({ nom: 'Le bunker Russo' });
  assert.ok(erreursSecret(s).some((e) => e.includes('histoire')));
  assert.equal(erreursSecret(secret({ nom: 'Le bunker Russo', statut: 'a_verifier' })).some((e) => e.includes('histoire')), false);
});

test('URL non https et date invalide sont refusées', () => {
  assert.ok(erreursSecret(secret({ sources: [{ site: 'X', url: 'http://x.example', consulte_le: '2026-11-25' }, src('Y')] })).some((e) => e.includes('url https')));
  assert.ok(erreursSecret(secret({ date_verification: '2026-13-40' })).some((e) => e.includes('AAAA-MM-JJ')));
});

test('validerFichier : ids en double, meta absente, liste vide', () => {
  const dbl = validerFichier({ meta, secrets: [secret(), secret()] });
  assert.ok(dbl.erreurs.some((e) => e.includes('en double')));
  assert.ok(validerFichier({ secrets: [] }).erreurs.some((e) => e.includes('meta')));
  const vide = validerFichier({ meta, secrets: [] });
  assert.deepEqual(vide.erreurs, []);
  assert.ok(vide.avertissements.some((a) => a.includes('vide')));
  assert.ok(validerFichier(null).erreurs.length > 0);
});
