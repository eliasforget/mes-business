import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { controler, FICHIER_PAR_DEFAUT } from '../scripts/valider-secrets.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'valider-secrets.mjs');

test('le secrets.json du dépôt est valide et publiable', () => {
  const r = controler(FICHIER_PAR_DEFAUT);
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.affichables.length >= 5, `seulement ${r.affichables.length} secrets affichables`);
});

test('chaque secret publiable du dépôt a ≥ 2 sources indépendantes et aucune note interne n’est publique', () => {
  const data = JSON.parse(readFileSync(FICHIER_PAR_DEFAUT, 'utf8'));
  const r = controler(FICHIER_PAR_DEFAUT);
  for (const s of r.affichables) assert.ok(s.sources.length >= 2, s.id);
  assert.ok(data.secrets.some((s) => s.statut === 'a_verifier'), 'le brouillon garde des a_verifier');
});

test('la commande sort en code 1 sur un fichier invalide et en 0 sur le bon', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vsec-'));
  const mauvais = path.join(dir, 'mauvais.json');
  writeFileSync(mauvais, JSON.stringify({ meta: {}, secrets: [{ id: 'x' }] }));
  const ko = spawnSync(process.execPath, [SCRIPT, mauvais], { encoding: 'utf8' });
  assert.equal(ko.status, 1);
  assert.match(ko.stderr, /ERREUR/);
  const ok = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /publiable/);
  const illisible = path.join(dir, 'casse.json');
  writeFileSync(illisible, '{ pas du json');
  assert.equal(spawnSync(process.execPath, [SCRIPT, illisible], { encoding: 'utf8' }).status, 1);
});

test('--min fait échouer si pas assez de secrets affichables', () => {
  const ko = spawnSync(process.execPath, [SCRIPT, '--min', '99'], { encoding: 'utf8' });
  assert.equal(ko.status, 1);
});
