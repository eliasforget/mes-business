// Tests : npm test   (node --test, sans dépendance)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync as lire, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import {
  construirePlan, decouperMots, grouperSousTitres, motsDepuisElevenLabs, motsSynthetiques, placerScenes,
  planifierFonds, verifierScript, type ClipDisponible, type Mot, type Scene, type ScriptVideo,
} from '../src/plan.ts';
import { THEMES, theme } from '../src/themes.ts';

const exemple = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'exemples', 'demo-raccourcis', 'script.json'), 'utf8')) as ScriptVideo;

test('découpage des mots : ponctuation collée, symboles seuls ignorés', () => {
  assert.deepEqual(decouperMots('  Six minutes —  et  l’œuf t’attend !  '), ['Six', 'minutes', 'et', 'l’œuf', 't’attend']);
});

test('alignement ElevenLabs caractère par caractère → mots', () => {
  const texte = 'Un œuf, ici.';
  const chars = [...texte];
  const mots = motsDepuisElevenLabs({
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => i * 0.1),
    character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.08),
  });
  assert.deepEqual(mots.map((m) => m.mot), ['Un', 'œuf,', 'ici.']);
  assert.ok(Math.abs(mots[1]!.debut - 0.3) < 1e-9);
  assert.ok(Math.abs(mots[1]!.fin - 0.68) < 1e-9);
});

test('minutage synthétique : croissant, pause plus longue après un point', () => {
  const mots = motsSynthetiques([{ voix: 'Un deux. Trois quatre' }]);
  assert.equal(mots.length, 4);
  for (let i = 1; i < mots.length; i++) assert.ok(mots[i]!.debut > mots[i - 1]!.debut);
  assert.ok(mots[2]!.debut - mots[1]!.debut > mots[1]!.debut - mots[0]!.debut);
});

test('scènes calées sur le premier mot de chacune, la 1re à 0, la dernière couvre la fin', () => {
  const scenes: Scene[] = [{ voix: 'a b c' }, { voix: 'd e' }, { voix: 'f' }];
  const mots: Mot[] = 'a b c d e f'.split(' ').map((m, i) => ({ mot: m, debut: 0.5 + i, fin: 1.2 + i }));
  const { scenes: p, duree } = placerScenes(scenes, mots);
  assert.deepEqual(p.map((s) => s.debut), [0, 3.5, 5.5]);
  assert.deepEqual(p.map((s) => s.fin), [3.5, 5.5, duree]);
  assert.ok(Math.abs(duree - (6.2 + 0.6)) < 1e-9);
});

test('minutage plus court que le texte : répartition proportionnelle, scènes toujours croissantes', () => {
  const { scenes } = placerScenes([{ voix: 'a b c d' }, { voix: 'e f g h' }], [{ mot: 'a', debut: 0, fin: 4 }]);
  assert.ok(scenes[1]!.debut > scenes[0]!.debut);
});

test('sous-titres : 3 mots max, coupure sur la ponctuation, pas de trou entre deux groupes', () => {
  const g = grouperSousTitres(motsSynthetiques([{ voix: 'Un raccourci caché, tout en haut du menu de VS Code.' }]));
  assert.ok(g.every((x) => x.mots.length <= 3));
  assert.ok(g.some((x) => x.mots[x.mots.length - 1]!.mot === 'caché,'));
  for (let i = 0; i < g.length - 1; i++) assert.ok(g[i]!.fin >= g[i + 1]!.debut);
});

test('fonds : un plan toutes les ~2 s, clips de la scène prioritaires, déterministe, pas deux fois de suite le même', () => {
  const clips: ClipDisponible[] = [
    { chemin: 'biblio/miami-nuit-01.mp4', duree: 12, motsCles: ['miami', 'nuit'] },
    { chemin: 'biblio/marais-01.mp4', duree: 10, motsCles: ['marais'] },
    { chemin: 'biblio/plage-01.mp4', duree: 8, motsCles: ['plage'] },
    { chemin: 'fonds/tour.mp4', duree: 6, motsCles: ['tour'] },
  ];
  const scenes = [
    { voix: 'x', fonds: ['tour.mp4'], debut: 0, fin: 4.4 },
    { voix: 'y', motsCles: ['marais'], debut: 4.4, fin: 8.8 },
    { voix: 'z', debut: 8.8, fin: 15.4 },
  ];
  const segs = planifierFonds(scenes, clips, 2.2);
  assert.equal(segs.length, 2 + 2 + 3);
  assert.ok(Math.abs(segs[0]!.fin - 1.3) < 1e-9, 'premier plan de la vidéo court');
  assert.ok(segs.slice(0, 2).every((s) => s.clip === 'fonds/tour.mp4'));
  assert.ok(segs.slice(2, 4).every((s) => s.clip === 'biblio/marais-01.mp4'));
  for (let i = 5; i < segs.length; i++) assert.notEqual(segs[i]!.clip, segs[i - 1]!.clip);
  assert.deepEqual(planifierFonds(scenes, clips, 2.2), segs);
  for (const s of segs) {
    const clip = clips.find((c) => c.chemin === s.clip)!;
    assert.ok(s.depuis + (s.fin - s.debut) <= clip.duree + 1e-9, 'le plan ne dépasse pas la fin du clip');
  }
});

test('sans clip : plans sans vidéo (fond animé)', () => {
  const plan = construirePlan(exemple, motsSynthetiques(exemple.scenes), []);
  assert.ok(plan.fonds.length >= plan.scenes.length);
  assert.ok(plan.fonds.every((f) => f.clip === null));
  assert.equal(plan.scenes[0]!.debut, 0);
});

test('vérification du script : exemple valide, erreurs lisibles sinon', () => {
  assert.deepEqual(verifierScript(exemple), []);
  assert.deepEqual(verifierScript({ scenes: [] }), ['« scenes » doit être une liste non vide.']);
  const e = verifierScript({ scenes: [{ voix: '', lignes: [{ texte: 'x', style: 'énorme' }], chiffre: { valeur: '3' } }] });
  assert.equal(e.length, 3);
});

test('vérification du script : « lignes » mal formé ou élément null donne des erreurs lisibles, jamais une exception', () => {
  const e = verifierScript({ scenes: [{ voix: 'a', lignes: 'pas une liste' }, { voix: 'b', lignes: [null, { texte: 'x', style: 'enorme' }] }, null] });
  assert.ok(e.some((x) => x.startsWith('scenes[0].lignes')), e.join('\n'));
  assert.ok(e.some((x) => x.startsWith('scenes[1].lignes')), e.join('\n'));
  assert.ok(e.some((x) => x.startsWith('scenes[2].voix')), e.join('\n'));
});

test('couleurs : valeurs #rrggbb et noms connus seulement', () => {
  assert.deepEqual(verifierScript({ scenes: [{ voix: 'a' }], couleurs: { menthe: '#38bdf8' } }), []);
  const e = verifierScript({ scenes: [{ voix: 'a' }], couleurs: { menthe: 'bleu', fluo: '#ffffff' } });
  assert.equal(e.length, 2);
  assert.equal(verifierScript({ scenes: [{ voix: 'a' }], couleurs: 'rouge' }).length, 1);
});

test('thème : « defaut » par défaut, couleurs du script prioritaires, aucune trace de marque tierce', () => {
  assert.equal(theme('inconnu').couleurs.menthe, THEMES.defaut.couleurs.menthe);
  assert.equal(theme('defaut', { menthe: '#38bdf8' }).couleurs.menthe, '#38bdf8');
  assert.equal(theme('defaut', { menthe: '#38bdf8' }).couleurs.rose, THEMES.defaut.couleurs.rose);
  assert.deepEqual(THEMES.defaut.marque, { nom: 'MA', accent: 'CHAINE' });
});

test('rendu --dry-run sur l\'exemple : code 0, plan écrit, aucun rendu', { timeout: 60000 }, () => {
  const sortie = mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  try {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings=ExperimentalWarning',
      path.join(import.meta.dirname, '..', 'rendu.ts'), path.join(import.meta.dirname, '..', 'exemples', 'demo-raccourcis'), '--dry-run'],
    { encoding: 'utf8', env: { ...process.env, DOSSIER_SORTIE: sortie } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /\[dry-run\]/);
    assert.match(r.stdout, /Logo : CODE ASTUCES/);
    assert.ok(existsSync(path.join(sortie, 'demo-raccourcis.plan.json')));
    assert.ok(!existsSync(path.join(sortie, 'demo-raccourcis.mp4')));
    const plan = JSON.parse(lire(path.join(sortie, 'demo-raccourcis.plan.json'), 'utf8')) as { duree: number; scenes: unknown[] };
    assert.equal(plan.scenes.length, 4);
    assert.ok(plan.duree > 25);
  } finally {
    rmSync(sortie, { recursive: true, force: true });
  }
});

test('rendu --dry-run : script invalide, code 1 et message lisible', { timeout: 60000 }, () => {
  const dossier = mkdtempSync(path.join(os.tmpdir(), 'rs-'));
  try {
    writeFileSync(path.join(dossier, 'script.json'), JSON.stringify({ scenes: [{ voix: '' }] }));
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings=ExperimentalWarning',
      path.join(import.meta.dirname, '..', 'rendu.ts'), dossier, '--dry-run'], { encoding: 'utf8', env: { ...process.env, DOSSIER_SORTIE: dossier } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /scenes\[0\]\.voix/);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
