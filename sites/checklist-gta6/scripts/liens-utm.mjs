// Génère les liens UTM à mettre en bio / description, un par réseau.
//   node scripts/liens-utm.mjs [--video v08]   (SITE_URL vient de .env ou de l'environnement)
// Convention figée : utm_source = tiktok | instagram | youtube, en minuscules. Ne la change jamais après coup.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { lireEnv } from './construire.mjs';

export const RESEAUX = ['tiktok', 'instagram', 'youtube'];
const MEDIUM_BIO = { tiktok: 'bio', instagram: 'bio', youtube: 'description' };

export function lienUtm(siteUrl, reseau, video) {
  if (!RESEAUX.includes(reseau)) throw new Error(`Réseau inconnu : ${reseau} (${RESEAUX.join(', ')})`);
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(siteUrl)) throw new Error('SITE_URL doit être une adresse https sans chemin.');
  if (video !== undefined && !/^[a-z0-9-]{1,20}$/.test(video)) throw new Error('--video : minuscules, chiffres et tirets (ex. v08).');
  const u = new URL(siteUrl + '/');
  u.searchParams.set('utm_source', reseau);
  u.searchParams.set('utm_medium', video ? 'video' : MEDIUM_BIO[reseau]);
  u.searchParams.set('utm_campaign', video ?? 'lancement');
  return u.toString();
}

export function tousLesLiens(siteUrl, video) {
  return Object.fromEntries(RESEAUX.map((r) => [r, lienUtm(siteUrl, r, video)]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { video: { type: 'string' } } });
  const env = lireEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
  try {
    for (const [r, l] of Object.entries(tousLesLiens((env.SITE_URL ?? '').replace(/\/+$/, ''), values.video))) console.log(`${r.padEnd(10)} ${l}`);
  } catch (err) {
    console.error(`ERREUR : ${err.message}`);
    process.exitCode = 1;
  }
}
