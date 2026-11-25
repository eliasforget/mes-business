// Construit le dossier à déployer (dist/) : contrôle secrets.json, n'y met QUE les secrets affichables
// (les brouillons « a_verifier » et les notes restent dans le dépôt), injecte contact et mesure d'audience.
//   node scripts/construire.mjs [--sortie dist] [--dry-run]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validerFichier } from '../regles.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

export function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Lit un fichier .env simple (CLE=valeur, # commentaires). Ne remplace pas les variables déjà définies. */
export function lireEnv(fichier, base = process.env) {
  const env = { ...base };
  if (!existsSync(fichier)) return env;
  for (const ligne of readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (!m || ligne.trim().startsWith('#')) continue;
    const [, cle, brute] = m;
    if (env[cle] === undefined || env[cle] === '') env[cle] = brute.replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}

/** Remplace le contenu entre <!--NOM--> et <!--/NOM-->, marqueurs compris. */
export function remplacerBloc(html, nom, contenu) {
  const re = new RegExp(`<!--${nom}-->[\\s\\S]*?<!--/${nom}-->`, 'g');
  return html.replace(re, () => contenu);
}

/** Valide les réglages d'environnement. Renvoie { reglages, erreurs }. */
export function lireReglages(env) {
  const erreurs = [];
  const siteUrl = (env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (siteUrl && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(siteUrl)) erreurs.push('SITE_URL : adresse https sans chemin (ex. https://checklist-gta6.pages.dev).');
  const contact = (env.CONTACT_EMAIL ?? '').trim();
  if (contact && !RE_EMAIL.test(contact)) erreurs.push('CONTACT_EMAIL : adresse e-mail invalide.');
  const umamiId = (env.UMAMI_WEBSITE_ID ?? '').trim();
  const umamiSrc = (env.UMAMI_SCRIPT_URL ?? '').trim() || 'https://cloud.umami.is/script.js';
  if (umamiId && !RE_UUID.test(umamiId)) erreurs.push('UMAMI_WEBSITE_ID : identifiant au format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.');
  if (umamiId && !/^https:\/\/[^\s"<>]+\.js$/.test(umamiSrc)) erreurs.push('UMAMI_SCRIPT_URL : URL https d\'un fichier .js.');
  if (umamiId && !siteUrl) erreurs.push('UMAMI_WEBSITE_ID demande aussi SITE_URL (domaine surveillé).');
  return { reglages: { siteUrl, contact, umamiId, umamiSrc }, erreurs };
}

export function balise(reglages) {
  if (!reglages.umamiId) return '';
  const domaine = new URL(reglages.siteUrl).hostname;
  return `<script defer src="${echapper(reglages.umamiSrc)}" data-website-id="${echapper(reglages.umamiId)}" data-domains="${echapper(domaine)}" data-do-not-track="true"></script>`;
}

const MESURE_PIED_ON = 'Mesure d’audience anonyme avec Umami, sans publicité ciblée (voir les mentions légales pour la désactiver).';
const MESURE_LEGALE_ON = `<p>La fréquentation du site est mesurée avec Umami (Umami Cloud), uniquement pour connaître le nombre de visites et le réseau d'où vient le lien. Les statistiques sont anonymes, ne servent qu'à l'éditeur, ne sont recoupées avec aucun autre traitement et ne permettent pas de te suivre sur d'autres sites.</p>
<p><button id="optout" type="button" class="bouton-discret">Désactiver la mesure sur cet appareil</button> <span id="optout-etat" role="status"></span></p>
<script src="optout.js"></script>`;

export function construire({ racine = RACINE, sortie = path.join(RACINE, 'dist'), env = process.env, ecrire = true } = {}) {
  const { reglages, erreurs: erreursEnv } = lireReglages(env);
  const data = JSON.parse(readFileSync(path.join(racine, 'secrets.json'), 'utf8').replace(/^﻿/, ''));
  const { erreurs, affichables } = validerFichier(data);
  const toutes = [...erreursEnv, ...erreurs];
  if (toutes.length) return { ok: false, erreurs: toutes, fichiers: [], affichables: affichables.length };

  const contactHtml = reglages.contact
    ? `<a href="mailto:${echapper(reglages.contact)}">${echapper(reglages.contact)}</a>`
    : null;
  const publicData = {
    meta: { ...data.meta, total_affiche: affichables.length },
    secrets: affichables.map(({ notes, ...s }) => s),
  };

  const pages = {};
  for (const nom of ['index.html', 'mentions-legales.html']) {
    let html = readFileSync(path.join(racine, nom), 'utf8');
    html = remplacerBloc(html, 'UMAMI', balise(reglages));
    html = remplacerBloc(html, 'CONTACT', contactHtml ?? '(adresse de contact bientôt disponible)');
    const mesure = nom === 'index.html' ? MESURE_PIED_ON : MESURE_LEGALE_ON;
    if (reglages.umamiId) html = remplacerBloc(html, 'MESURE', mesure);
    else html = html.replace(/<!--MESURE-->([\s\S]*?)<!--\/MESURE-->/g, (_, interieur) => interieur);
    pages[nom] = html;
  }

  const fichiers = ['index.html', 'mentions-legales.html', 'secrets.json', 'app.js', 'regles.js', 'style.css', '_headers'];
  if (reglages.umamiId) fichiers.push('optout.js');
  if (existsSync(path.join(racine, 'captures'))) fichiers.push('captures/');

  if (ecrire) {
    rmSync(sortie, { recursive: true, force: true });
    mkdirSync(sortie, { recursive: true });
    for (const [nom, html] of Object.entries(pages)) writeFileSync(path.join(sortie, nom), html);
    writeFileSync(path.join(sortie, 'secrets.json'), JSON.stringify(publicData, null, 2) + '\n');
    for (const f of ['app.js', 'regles.js', 'style.css', '_headers']) cpSync(path.join(racine, f), path.join(sortie, f));
    if (reglages.umamiId) cpSync(path.join(racine, 'optout.js'), path.join(sortie, 'optout.js'));
    if (existsSync(path.join(racine, 'captures'))) cpSync(path.join(racine, 'captures'), path.join(sortie, 'captures'), { recursive: true });
  }
  return { ok: true, erreurs: [], fichiers, affichables: affichables.length, ecartes: data.secrets.length - affichables.length, umami: !!reglages.umamiId, contact: !!reglages.contact, pages, publicData };
}

function main() {
  const { values } = parseArgs({ options: { sortie: { type: 'string', default: 'dist' }, 'dry-run': { type: 'boolean', default: false } } });
  const sortie = path.resolve(values.sortie);
  const env = lireEnv(path.join(RACINE, '.env'));
  const r = construire({ sortie, env, ecrire: !values['dry-run'] });
  if (!r.ok) {
    for (const e of r.erreurs) console.error(`ERREUR : ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${values['dry-run'] ? '[dry-run] ' : ''}Site construit dans ${sortie}`);
  console.log(`  ${r.affichables} secret(s) publié(s), ${r.ecartes} écarté(s) (brouillons, non recoupés).`);
  console.log(`  Mesure d'audience Umami : ${r.umami ? 'activée' : 'désactivée (UMAMI_WEBSITE_ID vide)'} · contact : ${r.contact ? 'renseigné' : 'à renseigner (CONTACT_EMAIL)'}`);
  console.log(`  Fichiers : ${r.fichiers.join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
