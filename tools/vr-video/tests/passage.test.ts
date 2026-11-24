import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesWav, meilleurPassage, mouvements, volumes, type Mesure } from '../passage.ts';

/** Mesures toutes les 0,25 s : niveau de fond, avec un pic entre a et b. */
const serie = (duree: number, fond: number, pic: number, a: number, b: number): Mesure[] =>
  Array.from({ length: duree * 4 }, (_, k) => ({ t: k / 4, v: k / 4 >= a && k / 4 < b ? pic : fond }));

test('le moment fort au milieu est gardé, placé vers les 70 % de la fenêtre', () => {
  const c = meilleurPassage(serie(60, -40, -10, 20, 24), serie(60, 0.01, 0.3, 20, 24), 60, 35)!;
  assert.ok(c.pic >= 20 && c.pic <= 24, `pic ${c.pic}`);
  assert.ok(c.debut <= 20 && c.debut + c.duree >= 24, `fenêtre ${c.debut}-${c.debut + c.duree}`);
  assert.equal(c.duree, 35);
});

test('un moment fort à la fin donne la fin de la capture', () => {
  const c = meilleurPassage(serie(60, -40, -8, 55, 59), [], 60, 35)!;
  assert.ok(Math.abs(c.debut + c.duree - 60) < 0.2, `fin ${c.debut + c.duree}`);
});

test('son et image plats, ou capture courte : pas de choix (on garde la fin)', () => {
  assert.equal(meilleurPassage(serie(60, -40, -40, 0, 0), serie(60, 0.01, 0.01, 0, 0), 60, 35), null);
  assert.equal(meilleurPassage(serie(35, -40, -5, 10, 12), [], 35.5, 35), null);
});

test('volumes et mouvements depuis les données brutes', () => {
  const pcm = Buffer.alloc(8000 * 2 * 2); // 2 s de silence puis…
  for (let i = 8000; i < 16000; i++) pcm.writeInt16LE(i % 2 ? 16000 : -16000, i * 2);
  const v = volumes(pcm);
  assert.equal(v.length, 8);
  assert.ok(v[0]!.v <= -89 && v[7]!.v > -7);
  const img = Buffer.concat([Buffer.alloc(576, 0), Buffer.alloc(576, 0), Buffer.alloc(576, 255)]);
  assert.deepEqual(mouvements(img).map((m) => m.v), [0, 1]);
  const wav = Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE', 'ascii'), Buffer.from('LIST', 'ascii'), Buffer.from([4, 0, 0, 0]), Buffer.from('abcd'), Buffer.from('data', 'ascii'), Buffer.from([2, 0, 0, 0]), Buffer.from([7, 0])]);
  assert.deepEqual([...donneesWav(wav)], [7, 0]);
});
