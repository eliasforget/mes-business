// Tests : npm test   (aucun appel réseau : fetch simulé)
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ErreurElevenLabs, type Fetch } from '../elevenlabs.ts';
import { coutEstime, dossierVideo, empreinte, genererVoix, texteDuScript, type Config } from '../voix.ts';

const CFG: Config = {
  cle: 'CLE-SECRETE', voixId: 'voix123', modele: 'eleven_multilingual_v2',
  reglages: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.05 },
};
const SCRIPT = { scenes: [{ voix: 'Rockstar a caché un œuf.' }, { voix: '  Six minutes   d’escalade.' }] };

function dossierTemp(script: unknown = SCRIPT): string {
  const d = mkdtempSync(path.join(os.tmpdir(), 'vr-voix-'));
  writeFileSync(path.join(d, 'script.json'), JSON.stringify(script));
  return d;
}

/** Faux ElevenLabs : enregistre les appels, renvoie un alignement cohérent avec le texte reçu. */
function fauxFetch(opts: { restant?: number; statutSynthese?: number; tier?: string } = {}) {
  const appels: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith('/v1/user/subscription')) {
      return Response.json({ tier: opts.tier ?? 'free', character_count: 10_000 - (opts.restant ?? 9_000), character_limit: 10_000 });
    }
    if (u.includes('/with-timestamps')) {
      if (opts.statutSynthese) return Response.json({ detail: { message: 'voice_not_found' } }, { status: opts.statutSynthese });
      const texte = (JSON.parse(String(init?.body)) as { text: string }).text;
      const chars = [...texte];
      return Response.json({
        audio_base64: Buffer.from('ID3-faux-mp3').toString('base64'),
        alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.04) },
      });
    }
    return new Response('inconnu', { status: 404 });
  }) as Fetch;
  return { f, appels };
}

test('texte du script : voix des scènes bout à bout, espaces normalisés', () => {
  assert.equal(texteDuScript(SCRIPT), 'Rockstar a caché un œuf. Six minutes d’escalade.');
  assert.throws(() => texteDuScript({ scenes: [] }), /non vide/);
  assert.throws(() => texteDuScript({ scenes: [{ voix: ' ' }] }), /scenes\[0\]\.voix/);
});

test('coût estimé et empreinte', () => {
  assert.equal(coutEstime('a'.repeat(100), 'eleven_multilingual_v2'), 100);
  assert.equal(coutEstime('a'.repeat(100), 'eleven_flash_v2_5'), 50);
  const { cle: _c, ...sansCle } = CFG;
  assert.equal(empreinte('x', sansCle), empreinte('x', sansCle));
  assert.notEqual(empreinte('x', sansCle), empreinte('y', sansCle));
  assert.notEqual(empreinte('x', sansCle), empreinte('x', { ...sansCle, voixId: 'autre' }));
});

test('dossier de la vidéo : chemin direct, puis tools/vr-video/videos/<nom>', () => {
  const racine = mkdtempSync(path.join(os.tmpdir(), 'vr-racine-'));
  const d = path.join(racine, 'tools', 'vr-video', 'videos', '05-test');
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'script.json'), '{}');
  assert.equal(dossierVideo('05-test', racine), d);
  assert.throws(() => dossierVideo('inexistant', racine), /Aucun script\.json/);
  rmSync(racine, { recursive: true, force: true });
});

test('génération : mp3 + alignement + méta, relance sans dépense, --forcer garde une copie', async () => {
  const d = dossierTemp();
  const { f, appels } = fauxFetch();
  const r1 = await genererVoix(d, CFG, { fetchImpl: f });
  assert.equal(r1.statut, 'genere');
  assert.equal(readFileSync(path.join(d, 'voix.mp3'), 'utf8'), 'ID3-faux-mp3');
  const al = JSON.parse(readFileSync(path.join(d, 'voix.alignement.json'), 'utf8'));
  assert.equal(al.alignment.characters.join(''), r1.texte);
  const synthese = appels.find((a) => a.url.includes('with-timestamps'))!;
  assert.ok(synthese.url.includes('/v1/text-to-speech/voix123/with-timestamps'));
  assert.equal((synthese.init!.headers as Record<string, string>)['xi-api-key'], 'CLE-SECRETE');
  assert.equal(JSON.parse(String(synthese.init!.body)).model_id, 'eleven_multilingual_v2');

  const avant = appels.length;
  assert.equal((await genererVoix(d, CFG, { fetchImpl: f })).statut, 'inchange');
  assert.equal(appels.length, avant, 'aucun appel réseau si rien n\'a changé');

  assert.equal((await genererVoix(d, CFG, { fetchImpl: f, forcer: true })).statut, 'genere');
  assert.ok(existsSync(path.join(d, 'voix.precedente.mp3')));
  rmSync(d, { recursive: true, force: true });
});

test('texte modifié → régénération ; dry-run → aucun appel', async () => {
  const d = dossierTemp();
  const { f, appels } = fauxFetch();
  await genererVoix(d, CFG, { fetchImpl: f });
  writeFileSync(path.join(d, 'script.json'), JSON.stringify({ scenes: [{ voix: 'Nouveau texte.' }] }));
  const n = appels.length;
  assert.equal((await genererVoix(d, CFG, { fetchImpl: f, dryRun: true })).statut, 'dry-run');
  assert.equal(appels.length, n);
  assert.equal((await genererVoix(d, CFG, { fetchImpl: f })).statut, 'genere');
  rmSync(d, { recursive: true, force: true });
});

test('crédits insuffisants : arrêt avant la synthèse ; erreurs lisibles sans la clé', async () => {
  const d = dossierTemp();
  const pauvre = fauxFetch({ restant: 10 });
  await assert.rejects(genererVoix(d, CFG, { fetchImpl: pauvre.f }), /Crédits insuffisants/);
  assert.ok(!pauvre.appels.some((a) => a.url.includes('with-timestamps')));

  const erreur = fauxFetch({ statutSynthese: 404 });
  await assert.rejects(genererVoix(d, CFG, { fetchImpl: erreur.f }), (e: unknown) => {
    assert.ok(e instanceof ErreurElevenLabs);
    assert.match(e.message, /Voix introuvable.*voice_not_found/);
    assert.ok(!e.message.includes('CLE-SECRETE'));
    return true;
  });
  assert.ok(!existsSync(path.join(d, 'voix.mp3')), 'rien d\'écrit en cas d\'erreur');
  rmSync(d, { recursive: true, force: true });
});

test('alerte offre gratuite (droits commerciaux)', async () => {
  const d = dossierTemp();
  const messages: string[] = [];
  await genererVoix(d, CFG, { fetchImpl: fauxFetch({ tier: 'free' }).f, log: (m) => messages.push(m) });
  assert.ok(messages.some((m) => m.includes('pas d\'usage commercial') && m.includes('ElevenLabs')));
  rmSync(d, { recursive: true, force: true });
});
