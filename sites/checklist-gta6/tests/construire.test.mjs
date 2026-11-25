import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balise, construire, echapper, lireEnv, lireReglages, remplacerBloc } from '../scripts/construire.mjs';
import { lienUtm, tousLesLiens } from '../scripts/liens-utm.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = '123e4567-e89b-12d3-a456-426614174000';

function sortieTmp() {
  return path.join(mkdtempSync(path.join(tmpdir(), 'cl-')), 'dist');
}

test('sans réglages : site construit, brouillons et notes absents, pas de script de mesure', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: {} });
  assert.equal(r.ok, true, r.erreurs.join('\n'));
  const pub = JSON.parse(readFileSync(path.join(sortie, 'secrets.json'), 'utf8'));
  assert.ok(pub.secrets.length >= 5);
  assert.ok(pub.secrets.every((s) => ['recoupe', 'verifie_en_jeu'].includes(s.statut)), 'un brouillon est public');
  assert.ok(pub.secrets.every((s) => !('notes' in s)), 'une note interne est publique');
  assert.equal(pub.meta.total_affiche, pub.secrets.length);
  const html = readFileSync(path.join(sortie, 'index.html'), 'utf8');
  assert.ok(!html.includes('<script defer'), 'script de mesure présent sans UMAMI_WEBSITE_ID');
  assert.ok(!html.includes('<!--'), 'marqueur de bloc resté dans la page');
  assert.match(html, /Aucune mesure d.audience/);
  assert.match(html, /adresse de contact bientôt disponible/);
  assert.equal(existsSync(path.join(sortie, 'optout.js')), false);
  assert.equal(existsSync(path.join(sortie, 'scripts')), false);
  assert.equal(existsSync(path.join(sortie, '_headers')), true);
});

test('avec Umami et contact : balise, domaine surveillé, opt-out et e-mail échappé', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: { SITE_URL: 'https://exemple.pages.dev/', UMAMI_WEBSITE_ID: ID, CONTACT_EMAIL: 'contact@exemple.fr' } });
  assert.equal(r.ok, true, r.erreurs.join('\n'));
  const html = readFileSync(path.join(sortie, 'index.html'), 'utf8');
  assert.ok(html.includes(`data-website-id="${ID}"`));
  assert.ok(html.includes('data-domains="exemple.pages.dev"'));
  assert.ok(html.includes('mailto:contact@exemple.fr'));
  const legal = readFileSync(path.join(sortie, 'mentions-legales.html'), 'utf8');
  assert.ok(legal.includes('optout.js'));
  assert.equal(existsSync(path.join(sortie, 'optout.js')), true);
  assert.equal((html.match(/<script defer/g) ?? []).length, 1);
});

test('réglages invalides : refus clair, rien n’est écrit', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: { SITE_URL: 'http://x', UMAMI_WEBSITE_ID: 'pas-un-uuid', CONTACT_EMAIL: 'a b' } });
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.length >= 3);
  assert.equal(existsSync(sortie), false);
  assert.ok(lireReglages({ UMAMI_WEBSITE_ID: ID }).erreurs.some((e) => e.includes('SITE_URL')));
});

test('--dry-run (ecrire:false) n’écrit rien', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: {}, ecrire: false });
  assert.equal(r.ok, true);
  assert.equal(existsSync(sortie), false);
});

test('helpers : échappement, blocs, .env', () => {
  assert.equal(echapper('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(remplacerBloc('a<!--X-->b<!--/X-->c', 'X', '$&'), 'a$&c');
  assert.equal(balise({ umamiId: '' }), '');
});

test('lireEnv : le fichier complète sans écraser l’environnement', async () => {
  const { writeFileSync } = await import('node:fs');
  const dir = mkdtempSync(path.join(tmpdir(), 'env-'));
  const f = path.join(dir, '.env');
  writeFileSync(f, '# commentaire\nSITE_URL="https://a.example"\nCONTACT_EMAIL=moi@a.example\n');
  const env = lireEnv(f, { CONTACT_EMAIL: 'deja@la.example' });
  assert.equal(env.SITE_URL, 'https://a.example');
  assert.equal(env.CONTACT_EMAIL, 'deja@la.example');
  assert.deepEqual(lireEnv(path.join(dir, 'absent.env'), { A: '1' }), { A: '1' });
});

test('liens UTM : une source par réseau, convention figée, entrées contrôlées', () => {
  const l = tousLesLiens('https://exemple.pages.dev');
  assert.equal(l.tiktok, 'https://exemple.pages.dev/?utm_source=tiktok&utm_medium=bio&utm_campaign=lancement');
  assert.equal(l.youtube, 'https://exemple.pages.dev/?utm_source=youtube&utm_medium=description&utm_campaign=lancement');
  assert.equal(lienUtm('https://exemple.pages.dev', 'instagram', 'v08'), 'https://exemple.pages.dev/?utm_source=instagram&utm_medium=video&utm_campaign=v08');
  assert.throws(() => lienUtm('https://exemple.pages.dev', 'facebook'));
  assert.throws(() => lienUtm('http://exemple.pages.dev', 'tiktok'));
  assert.throws(() => lienUtm('https://exemple.pages.dev', 'tiktok', 'V 8!'));
  assert.ok(RACINE);
});
