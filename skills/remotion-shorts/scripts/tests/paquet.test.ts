// Contrôle que le dossier de la skill est publiable tel quel comme dépôt public (racine = ce dossier parent).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { verifierScript } from '../src/plan.ts';

const SKILL = path.join(import.meta.dirname, '..', '..');
const IGNORES = new Set(['node_modules', 'sortie', '.rendu', '.git', 'musique', 'bibliotheque']);

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    if (IGNORES.has(e.name) || e.name === '.env') return [];
    const chemin = path.join(dossier, e.name);
    return e.isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const lire = (...p: string[]) => readFileSync(path.join(SKILL, ...p), 'utf8');

test('paquet : README, licence et .gitignore à la racine', () => {
  for (const f of ['README.md', 'LICENSE', '.gitignore', 'SKILL.md']) assert.ok(existsSync(path.join(SKILL, f)), `${f} manquant`);
  assert.match(lire('LICENSE'), /MIT License/);
  assert.match(lire('.gitignore'), /^\.env$/m);
});

test('paquet : frontmatter du SKILL.md (name = remotion-shorts, description de 1024 caractères au plus)', () => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(lire('SKILL.md'));
  assert.ok(m, 'frontmatter absent');
  assert.match(m[1]!, /^name: remotion-shorts$/m);
  const description = /^description: (.+)$/m.exec(m[1]!)?.[1] ?? '';
  assert.ok(description.length > 100 && description.length <= 1024, `description : ${description.length} caractères`);
});

test('paquet : la licence de Remotion est annoncée là où l’utilisateur la lit', () => {
  for (const f of [['README.md'], ['SKILL.md'], ['references', 'commandes.md']]) {
    assert.match(lire(...f), /remotion\.dev\/docs\/license/, `${f.join('/')} ne renvoie pas vers la licence Remotion`);
  }
});

test('paquet : les liens et images locaux des documents existent', () => {
  for (const f of fichiers(SKILL).filter((x) => x.endsWith('.md'))) {
    for (const [, cible] of readFileSync(f, 'utf8').matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
      assert.ok(existsSync(path.resolve(path.dirname(f), cible!)), `${path.relative(SKILL, f)} → ${cible} introuvable`);
    }
  }
  for (const ref of ['references/commandes.md', 'references/script-schema.md']) assert.ok(lire('SKILL.md').includes(ref), ref);
});

test('paquet : rien de personnel, ni média son ou vidéo', () => {
  const interdits = /vice[ _-]?radar|C:\\Users\\|\/home\/[a-z]|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/i;
  for (const f of fichiers(SKILL)) {
    assert.doesNotMatch(f, /\.(mp3|wav|m4a|ogg|mp4|mov|webm)$/i, path.relative(SKILL, f));
    if (/\.(md|ts|tsx|json|cmd|example)$|LICENSE$/.test(f) && !f.endsWith('paquet.test.ts')) {
      assert.doesNotMatch(readFileSync(f, 'utf8'), interdits, path.relative(SKILL, f));
    }
  }
});

test('paquet : rien que « npx skills add » écarterait en copiant le dossier', () => {
  // Règles lues dans le CLI skills 1.9.0 : il copie tout le dossier du SKILL.md sauf ces noms.
  const verifier = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      if (IGNORES.has(e.name)) continue;
      const chemin = path.join(dossier, e.name);
      assert.notEqual(e.name, 'metadata.json', `${path.relative(SKILL, chemin)} ne serait pas copié`);
      assert.ok(!['__pycache__', '__pypackages__'].includes(e.name), `${path.relative(SKILL, chemin)} ne serait pas copié`);
      assert.ok(!e.isSymbolicLink(), `${path.relative(SKILL, chemin)} : pas de lien symbolique dans le paquet`);
      if (e.isDirectory()) verifier(chemin);
    }
  };
  verifier(SKILL);
});

test('paquet : tous les exemples sont valides', () => {
  const exemples = path.join(import.meta.dirname, '..', 'exemples');
  const noms = readdirSync(exemples);
  assert.ok(noms.includes('demo-shortcuts'), 'exemple en anglais manquant');
  for (const n of noms) assert.deepEqual(verifierScript(JSON.parse(readFileSync(path.join(exemples, n, 'script.json'), 'utf8'))), [], n);
});
