import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balise, construire, echapper, enTeteSeo, lireEnv, lireReglages, listeStatique, remplacerBloc } from '../scripts/construire.mjs';
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

test('référencement : la liste publiée est écrite dans le HTML, brouillons absents', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: {} });
  assert.equal(r.ok, true, r.erreurs.join('\n'));
  const html = readFileSync(path.join(sortie, 'index.html'), 'utf8');
  assert.equal((html.match(/<li class="secret">/g) ?? []).length, r.affichables);
  for (const s of r.publicData.secrets) assert.ok(html.includes(echapper(s.nom)), `absent du HTML : ${s.nom}`);
  const source = JSON.parse(readFileSync(path.join(RACINE, 'secrets.json'), 'utf8'));
  const brouillons = source.secrets.filter((s) => s.statut === 'a_verifier');
  for (const s of brouillons) assert.ok(!html.includes(echapper(s.nom)), `brouillon dans le HTML : ${s.nom}`);
  assert.ok(!html.includes('<!--'), 'marqueur de bloc resté dans la page');
  assert.ok(html.includes(`<p id="compteur-texte">${r.affichables} secrets à cocher</p>`), 'compteur figé sur « Chargement… » sans JavaScript');
});

test('référencement : texte d’une fiche échappé, y compris dans le JSON-LD', () => {
  const s = { id: 'references-001', nom: '</script><img src=x onerror=alert(1)>', categorie: 'references', zone: 'A & B', description: '"x" <b>', statut: 'recoupe', date_verification: '2026-11-26', version_jeu: '1', sources: [{ site: '<s>', url: 'https://a.example/?q="><x' }] };
  const liste = listeStatique([s]);
  assert.ok(!liste.includes('<img'));
  assert.ok(!liste.includes('"><x'));
  assert.ok(liste.includes('A &amp; B'));
  const tete = enTeteSeo({ siteUrl: '' }, [s]);
  assert.equal((tete.match(/<\/script>/g) ?? []).length, 1, 'le JSON-LD peut être fermé par une donnée');
  const json = JSON.parse(tete.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(json.itemListElement[0].name, s.nom);
});

test('référencement avec SITE_URL : adresse canonique, sitemap daté et robots.txt', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: { SITE_URL: 'https://exemple.pages.dev/' } });
  assert.equal(r.ok, true, r.erreurs.join('\n'));
  const html = readFileSync(path.join(sortie, 'index.html'), 'utf8');
  assert.ok(html.includes('<link rel="canonical" href="https://exemple.pages.dev/">'));
  assert.ok(html.includes('<meta property="og:url" content="https://exemple.pages.dev/">'));
  const sitemap = readFileSync(path.join(sortie, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('<loc>https://exemple.pages.dev/</loc>'));
  assert.ok(sitemap.includes(`<lastmod>${r.publicData.meta.mis_a_jour}</lastmod>`));
  assert.ok(!sitemap.includes('mentions-legales'), 'page en noindex dans le sitemap');
  assert.match(readFileSync(path.join(sortie, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/exemple\.pages\.dev\/sitemap\.xml/);
  assert.ok(r.fichiers.includes('sitemap.xml') && r.fichiers.includes('robots.txt'));
});

test('référencement sans SITE_URL : pas d’adresse inventée', () => {
  const sortie = sortieTmp();
  const r = construire({ sortie, env: {} });
  const html = readFileSync(path.join(sortie, 'index.html'), 'utf8');
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(!html.includes('og:url'));
  assert.ok(html.includes('<meta property="og:title"'));
  assert.equal(existsSync(path.join(sortie, 'sitemap.xml')), false);
  assert.ok(!r.fichiers.includes('sitemap.xml'));
  assert.doesNotMatch(readFileSync(path.join(sortie, 'robots.txt'), 'utf8'), /Sitemap/);
});
