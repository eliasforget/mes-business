import { CATEGORIES, STATUTS, estAffichable } from './regles.js';

const CLE = 'checklist-gta6-v1';
const el = {
  liste: document.getElementById('liste'),
  texte: document.getElementById('compteur-texte'),
  detail: document.getElementById('compteur-detail'),
  barre: document.getElementById('barre-remplie'),
  cat: document.getElementById('filtre-categorie'),
  statut: document.getElementById('filtre-statut'),
  recherche: document.getElementById('filtre-texte'),
  restants: document.getElementById('filtre-restants'),
  message: document.getElementById('message'),
  reset: document.getElementById('reset'),
  maj: document.getElementById('maj'),
  version: document.getElementById('version'),
};

let secrets = [];
let coches = lire();

function lire() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function ecrire() {
  try {
    localStorage.setItem(CLE, JSON.stringify(coches));
  } catch {
    /* navigation privée : la progression ne sera pas gardée, la page marche quand même */
  }
}

function normaliser(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatDate(d) {
  const p = String(d ?? '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d ?? '');
}

function suivre(evenement) {
  try {
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(evenement);
  } catch {
    /* la mesure ne doit jamais casser la page */
  }
}

function compteur() {
  const total = secrets.length;
  const n = secrets.filter((s) => coches[s.id]).length;
  const pct = total ? Math.round((n / total) * 100) : 0;
  el.texte.textContent = `${n} / ${total} secrets trouvés (${pct} %)`;
  el.barre.style.width = `${pct}%`;
  const vus = secrets.filter((s) => s.statut === 'verifie_en_jeu').length;
  el.detail.textContent = `${vus} vu(s) en jeu · ${total - vus} recoupé(s) par plusieurs sites`;
}

function remplirCategories() {
  const vues = [...new Set(secrets.map((s) => s.categorie))];
  for (const c of vues) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = `${CATEGORIES[c]} (${secrets.filter((s) => s.categorie === c).length})`;
    el.cat.appendChild(o);
  }
}

function ligne(s) {
  const li = document.createElement('li');
  li.className = 'secret' + (coches[s.id] ? ' coche' : '');

  const label = document.createElement('label');
  label.className = 'secret-tete';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!coches[s.id];
  cb.addEventListener('change', () => {
    if (cb.checked) {
      coches[s.id] = 1;
      suivre('secret_coche');
    } else {
      delete coches[s.id];
    }
    ecrire();
    compteur();
    if (el.restants.checked) afficher();
    else li.classList.toggle('coche', cb.checked);
  });
  const nom = document.createElement('span');
  nom.className = 'nom';
  nom.textContent = s.nom;
  label.append(cb, nom);
  li.appendChild(label);

  const meta = document.createElement('p');
  meta.className = 'meta';
  const badge = document.createElement('span');
  badge.className = `badge badge-${s.statut}`;
  badge.textContent = STATUTS[s.statut];
  meta.append(badge, ` ${CATEGORIES[s.categorie]} · Zone : ${s.zone} · Vérifié le ${formatDate(s.date_verification)} (version ${s.version_jeu})`);
  li.appendChild(meta);

  const d = document.createElement('p');
  d.className = 'desc';
  d.textContent = s.description;
  li.appendChild(d);

  if (s.capture) {
    const img = document.createElement('img');
    img.src = s.capture;
    img.alt = `Capture en jeu : ${s.nom}`;
    img.loading = 'lazy';
    img.className = 'capture';
    li.appendChild(img);
  }

  if (Array.isArray(s.sources) && s.sources.length) {
    const src = document.createElement('p');
    src.className = 'sources';
    src.append('Sources : ');
    s.sources.forEach((x, i) => {
      if (i) src.append(', ');
      const a = document.createElement('a');
      a.href = x.url;
      a.rel = 'noopener nofollow';
      a.target = '_blank';
      a.textContent = x.site;
      src.appendChild(a);
    });
    li.appendChild(src);
  }
  return li;
}

function afficher() {
  const c = el.cat.value;
  const st = el.statut.value;
  const q = normaliser(el.recherche.value);
  const masquer = el.restants.checked;
  el.liste.textContent = '';
  let n = 0;
  for (const s of secrets) {
    if (c && s.categorie !== c) continue;
    if (st && s.statut !== st) continue;
    if (masquer && coches[s.id]) continue;
    if (q && !normaliser(`${s.nom} ${s.zone} ${s.description}`).includes(q)) continue;
    el.liste.appendChild(ligne(s));
    n++;
  }
  el.message.hidden = n > 0;
  if (!n) el.message.textContent = secrets.length ? 'Aucun secret ne correspond à ces filtres.' : 'Aucun secret pour le moment.';
}

function erreur(txt) {
  el.texte.textContent = 'Checklist indisponible';
  el.message.hidden = false;
  el.message.textContent = txt;
}

for (const e of [el.cat, el.statut, el.restants]) e.addEventListener('change', afficher);
el.recherche.addEventListener('input', afficher);
el.reset.addEventListener('click', () => {
  if (!Object.keys(coches).length) return;
  if (confirm('Tout décocher ? Cette action reste sur cet appareil.')) {
    coches = {};
    ecrire();
    compteur();
    afficher();
  }
});

try {
  const rep = await fetch('secrets.json', { cache: 'no-cache' });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const data = await rep.json();
  const tous = Array.isArray(data.secrets) ? data.secrets : [];
  // Même règle que le validateur : tout ce qui n'est pas parfaitement renseigné est ignoré.
  secrets = tous.filter(estAffichable);
  console.info(`Secrets affichés : ${secrets.length} / ${tous.length}`);
  if (data.meta?.mis_a_jour) el.maj.textContent = formatDate(data.meta.mis_a_jour);
  if (data.meta?.version_jeu) el.version.textContent = data.meta.version_jeu;
  remplirCategories();
  compteur();
  afficher();
} catch (err) {
  console.error('secrets.json', err);
  erreur('Impossible de charger la liste. En local, lance un serveur (node scripts/serveur.mjs) au lieu d\'ouvrir le fichier directement.');
}
