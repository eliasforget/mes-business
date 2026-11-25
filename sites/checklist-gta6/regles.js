// Règles communes à la page (navigateur), au validateur et à la construction (Node 22).
// Aucune dépendance. Une seule définition de « un secret affichable » pour que la page,
// le contrôle avant publication et le dossier déployé ne puissent jamais diverger.

export const STATUTS = {
  verifie_en_jeu: 'Vu en jeu',
  recoupe: 'Recoupé par plusieurs sites',
  a_verifier: 'À vérifier',
  retire: 'Retiré',
};

export const STATUTS_AFFICHABLES = ['verifie_en_jeu', 'recoupe'];

export const CATEGORIES = {
  secrets_radio: 'Radios et musiques cachées',
  objets_caches: 'Objets et vêtements cachés',
  rencontres: 'Rencontres et événements étranges',
  references: 'Clins d’œil et références',
  lieux_insolites: 'Lieux insolites et mystères',
  animaux: 'Animaux cachés',
  vehicules: 'Véhicules rares',
  mises_a_jour: 'Mises à jour',
};

// Sites qui se recopient : ensemble ils ne comptent que pour UNE source indépendante.
// (gta6wiki.eu cite Beebom parmi ses sources : relevé du 25/11/2026.)
export const SITES_LIES = [['gta6wiki.eu', 'Beebom']];

// Secrets liés à l'histoire : jamais publiés (liste de la procédure de vérification).
export const MOTS_HISTOIRE = [
  'mr. mangrove', 'mangrove (mr', 'sauvetage de l’alien', 'sauvetage de l\'alien', 'bar du mont chiliad',
  'little sam', 'niko bellic', 'jimmy de santa', 'bunker russo', 'bateau fantôme', 'red hulk',
];

const RE_ID = /^[a-z0-9_]+-\d{3}$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function texteValide(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function dateValide(v) {
  if (typeof v !== 'string' || !RE_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Nombre de sources indépendantes (sites distincts ; les sites liés comptent pour un). */
export function sourcesIndependantes(sources) {
  if (!Array.isArray(sources)) return 0;
  const groupes = new Set();
  for (const s of sources) {
    if (!s || !texteValide(s.site)) continue;
    const g = SITES_LIES.find((paire) => paire.includes(s.site));
    groupes.add(g ? g.join('+') : s.site);
  }
  return groupes.size;
}

/**
 * Liste blanche : un secret n'est affiché que si tout est en règle. Un champ manquant, un statut
 * inconnu ou une faute de frappe ⇒ non affiché (par prudence).
 */
export function estAffichable(s) {
  if (!s || typeof s !== 'object') return false;
  if (!STATUTS_AFFICHABLES.includes(s.statut)) return false;
  if (s.spoiler !== false) return false;
  if (!texteValide(s.id) || !texteValide(s.nom) || !texteValide(s.zone) || !texteValide(s.description)) return false;
  if (!(s.categorie in CATEGORIES)) return false;
  if (!dateValide(s.date_verification)) return false;
  if (s.statut === 'recoupe' && sourcesIndependantes(s.sources) < 2) return false;
  if (s.statut === 'verifie_en_jeu' && !texteValide(s.capture)) return false;
  return true;
}

function mentionneHistoire(s) {
  const t = `${s.nom ?? ''} ${s.description ?? ''} ${s.zone ?? ''}`.toLowerCase();
  return MOTS_HISTOIRE.find((m) => t.includes(m)) ?? null;
}

/** Erreurs de forme et de cohérence d'un secret (vide = valide). */
export function erreursSecret(s, index = 0) {
  const n = `secrets[${index}]${s && s.id ? ` (${s.id})` : ''}`;
  const e = [];
  if (!s || typeof s !== 'object') return [`${n} : doit être un objet.`];
  if (!texteValide(s.id) || !RE_ID.test(s.id)) e.push(`${n} : id obligatoire au format « categorie-001 » (minuscules, chiffres, _).`);
  if (!texteValide(s.nom)) e.push(`${n} : nom obligatoire.`);
  if (!(s.categorie in CATEGORIES)) e.push(`${n} : categorie « ${s.categorie} » inconnue (${Object.keys(CATEGORIES).join(', ')}).`);
  if (!texteValide(s.zone)) e.push(`${n} : zone obligatoire (écris « à préciser en jeu » si inconnue).`);
  if (!texteValide(s.description)) e.push(`${n} : description obligatoire (1 à 2 phrases reformulées).`);
  if (!(s.statut in STATUTS)) e.push(`${n} : statut « ${s.statut} » inconnu (${Object.keys(STATUTS).join(', ')}).`);
  if (typeof s.spoiler !== 'boolean') e.push(`${n} : spoiler doit être true ou false (jamais absent).`);
  if (!Array.isArray(s.sources)) e.push(`${n} : sources doit être une liste.`);
  else {
    s.sources.forEach((src, i) => {
      if (!src || !texteValide(src.site)) e.push(`${n}.sources[${i}] : site obligatoire.`);
      if (!src || typeof src.url !== 'string' || !/^https:\/\/[^\s]+$/.test(src.url)) e.push(`${n}.sources[${i}] : url https obligatoire.`);
      if (!src || !dateValide(src.consulte_le)) e.push(`${n}.sources[${i}] : consulte_le au format AAAA-MM-JJ.`);
    });
  }
  for (const champ of ['date_verification', 'date_recoupement']) {
    if (s[champ] !== null && s[champ] !== undefined && !dateValide(s[champ])) e.push(`${n} : ${champ} au format AAAA-MM-JJ (ou null).`);
  }
  if (s.statut === 'recoupe') {
    if (sourcesIndependantes(s.sources) < 2) e.push(`${n} : « recoupe » demande au moins 2 sources indépendantes (gta6wiki.eu et Beebom comptent pour une seule).`);
    if (!dateValide(s.date_verification)) e.push(`${n} : « recoupe » demande date_verification (date du dernier contrôle).`);
    if (!texteValide(s.version_jeu)) e.push(`${n} : « recoupe » demande version_jeu (dernière version connue à cette date).`);
  }
  if (s.statut === 'verifie_en_jeu') {
    if (!texteValide(s.capture)) e.push(`${n} : « verifie_en_jeu » demande une capture (chemin d'image à toi).`);
    if (!dateValide(s.date_verification) || !texteValide(s.version_jeu)) e.push(`${n} : « verifie_en_jeu » demande date_verification et version_jeu.`);
  }
  const m = mentionneHistoire(s);
  if (m && s.statut !== 'retire' && s.statut !== 'a_verifier') e.push(`${n} : lié à l'histoire (« ${m} ») : statut retire ou a_verifier, jamais publié.`);
  if (s.statut !== 'a_verifier' && s.statut !== 'retire' && s.spoiler === true) e.push(`${n} : spoiler=true ne peut pas être publié (statut a_verifier ou retire).`);
  return e;
}

/** Valide tout le fichier. Renvoie { erreurs, avertissements, affichables }. */
export function validerFichier(data) {
  const erreurs = [];
  const avertissements = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { erreurs: ['secrets.json doit être un objet { "meta": ..., "secrets": [...] }.'], avertissements, affichables: [] };
  if (!data.meta || typeof data.meta !== 'object') erreurs.push('meta obligatoire.');
  else {
    if (!texteValide(data.meta.version_jeu)) erreurs.push('meta.version_jeu obligatoire (dernière version connue).');
    if (!dateValide(data.meta.mis_a_jour)) erreurs.push('meta.mis_a_jour au format AAAA-MM-JJ.');
    if (!texteValide(data.meta.avertissement)) erreurs.push('meta.avertissement obligatoire (aucun secret n’est confirmé par Rockstar).');
  }
  if (!Array.isArray(data.secrets)) return { erreurs: [...erreurs, 'secrets doit être une liste.'], avertissements, affichables: [] };
  const ids = new Map();
  data.secrets.forEach((s, i) => {
    erreurs.push(...erreursSecret(s, i));
    if (s && typeof s.id === 'string') {
      if (ids.has(s.id)) erreurs.push(`id « ${s.id} » en double (secrets[${ids.get(s.id)}] et secrets[${i}]).`);
      else ids.set(s.id, i);
    }
  });
  const affichables = data.secrets.filter(estAffichable);
  const nbCandidats = data.secrets.filter((s) => s && STATUTS_AFFICHABLES.includes(s.statut)).length;
  if (affichables.length < nbCandidats) avertissements.push(`${nbCandidats - affichables.length} secret(s) au statut publiable ne s'afficheront pas (voir les erreurs).`);
  if (affichables.length === 0) avertissements.push('Aucun secret affichable : la page serait vide.');
  return { erreurs, avertissements, affichables };
}
