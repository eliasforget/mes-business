// Contrôle secrets.json avant publication.
//   node scripts/valider-secrets.mjs [chemin\secrets.json] [--min N]
// Code de sortie 1 s'il y a une erreur (ou moins de N secrets affichables avec --min).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, STATUTS, validerFichier } from '../regles.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_PAR_DEFAUT = path.join(ICI, '..', 'secrets.json');

/** Lit et valide un fichier. Renvoie { erreurs, avertissements, affichables, total, parStatut }. */
export function controler(fichier = FICHIER_PAR_DEFAUT) {
  let data;
  try {
    data = JSON.parse(readFileSync(fichier, 'utf8').replace(/^﻿/, ''));
  } catch (err) {
    return { erreurs: [`${path.basename(fichier)} : JSON illisible (${err.message})`], avertissements: [], affichables: [], total: 0, parStatut: {} };
  }
  const r = validerFichier(data);
  const secrets = Array.isArray(data?.secrets) ? data.secrets : [];
  const parStatut = {};
  for (const s of secrets) parStatut[s?.statut ?? 'inconnu'] = (parStatut[s?.statut ?? 'inconnu'] ?? 0) + 1;
  return { ...r, total: secrets.length, parStatut };
}

function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { min: { type: 'string', default: '1' } } });
  const fichier = positionals[0] ? path.resolve(positionals[0]) : FICHIER_PAR_DEFAUT;
  const min = Number(values.min);
  const r = controler(fichier);
  console.log(`secrets.json : ${r.total} secret(s), ${r.affichables.length} affichable(s) sur la page.`);
  for (const [st, n] of Object.entries(r.parStatut)) console.log(`  ${STATUTS[st] ?? st} : ${n}`);
  const cats = {};
  for (const s of r.affichables) cats[s.categorie] = (cats[s.categorie] ?? 0) + 1;
  for (const [c, n] of Object.entries(cats)) console.log(`  catégorie ${CATEGORIES[c]} : ${n}`);
  for (const a of r.avertissements) console.warn(`ATTENTION : ${a}`);
  for (const e of r.erreurs) console.error(`ERREUR : ${e}`);
  if (r.affichables.length < min) r.erreurs.push(`moins de ${min} secret(s) affichable(s)`);
  if (r.erreurs.length) {
    console.error(`\n${r.erreurs.length} erreur(s) : corrige secrets.json avant de publier.`);
    process.exitCode = 1;
  } else {
    console.log('OK : secrets.json est publiable.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
