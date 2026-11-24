import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { aRafraichir, echangerCode, ErreurTikTok, lireProfil, lireVideos, pkce, resumer, urlAutorisation, type Fetch } from '../tiktok.ts';

const reponse = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

test('PKCE : défi = SHA-256 hexadécimal du vérificateur, URL complète', () => {
  const { verificateur, defi } = pkce();
  assert.match(verificateur, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(defi, createHash('sha256').update(verificateur).digest('hex'));
  const u = new URL(urlAutorisation('cle', 'http://localhost:3455/callback/', 'etat', defi));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('scope'), 'user.info.basic,user.info.stats,video.list');
});

test('échange du code : formulaire attendu, échéances calculées', async () => {
  let corps = '';
  const f: Fetch = async (_u, init) => { corps = String(init?.body); return reponse({ access_token: 'act.x', refresh_token: 'rft.y', open_id: 'o', scope: 'video.list', expires_in: 86400, refresh_expires_in: 31536000 }); };
  const j = await echangerCode(f, { cle: 'k', secret: 's', code: 'c', redirection: 'http://localhost:3455/callback/', verificateur: 'v' });
  const p = new URLSearchParams(corps);
  assert.equal(p.get('grant_type'), 'authorization_code');
  assert.equal(p.get('code_verifier'), 'v');
  assert.ok(j.expire > Date.now() && !aRafraichir(j));
});

test('une erreur TikTok ne laisse jamais passer le jeton dans le message', async () => {
  const f: Fetch = async () => reponse({ error: 'invalid_grant', error_description: 'Authorization code is expired.' }, 400);
  await assert.rejects(echangerCode(f, { cle: 'k', secret: 'SECRET', code: 'c', redirection: 'r', verificateur: 'v' }), (e: Error) => e instanceof ErreurTikTok && !e.message.includes('SECRET'));
});

test('profil : retombe sur les champs de base sans la portée stats', async () => {
  const appels: string[] = [];
  const f: Fetch = async (u) => { appels.push(String(u)); return String(u).includes('follower_count') ? reponse({ error: { code: 'scope_not_authorized', message: 'no' } }, 403) : reponse({ data: { user: { open_id: 'o', display_name: 'Actu Flash' } }, error: { code: 'ok' } }); };
  const p = await lireProfil(f, 'act.x');
  assert.equal(p.display_name, 'Actu Flash');
  assert.equal(appels.length, 2);
});

test('vidéos : pagination par curseur, puis résumé', async () => {
  let n = 0;
  const now = Date.now() / 1000;
  const f: Fetch = async () => { n++; return reponse({ data: n === 1 ? { videos: [{ id: '1', title: 'A', view_count: 500, create_time: now - 3600 }], cursor: 9, has_more: true } : { videos: [{ id: '2', title: 'B', view_count: 100, create_time: now - 86400 * 40 }], has_more: false }, error: { code: 'ok' } }); };
  const v = await lireVideos(f, 'act.x', 60);
  assert.equal(v.length, 2);
  const r = resumer({ open_id: 'o', follower_count: 700 }, v);
  assert.equal(r.abonnes, 700);
  assert.equal(r.vues30j, 500);
  assert.equal(r.meilleures[0]!.titre, 'A');
});
