/**
 * tiktok-stats : lit les statistiques de tes comptes TikTok (abonnés, vues, likes par vidéo) avec l'API officielle,
 * et les dépose en JSON là où le tableau de bord les lit (Google Drive).
 *
 *   .\tiktok.cmd connexion --compte actu-flash     → ouvre TikTok dans le navigateur pour autoriser ce compte (une fois)
 *   .\tiktok.cmd connexion --compte vice-radar
 *   .\tiktok.cmd                                     → met à jour les stats de tous les comptes connectés
 *   .\tiktok.cmd --dry-run                           → affiche sans écrire
 *   .\tiktok.cmd comptes                             → liste les comptes connectés
 *
 * L'usine le lance toute seule toutes les 6 heures une fois un compte connecté.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { format, parseArgs } from 'node:util';
import { createLogger, loadEnv } from '../../shared/index.ts';
import { aRafraichir, echangerCode, ErreurTikTok, lireProfil, lireVideos, pkce, rafraichir, resumer, urlAutorisation, type Jetons } from './tiktok.ts';

const ICI = import.meta.dirname;
const FICHIER_JETONS = path.join(ICI, 'jetons.local.json'); // ignoré par git (*.local.json)
const env = loadEnv({ toolDir: ICI, required: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'], defaults: { TIKTOK_PORT: '3455', DOSSIER_SORTIE: '', MAX_VIDEOS: '60' } });
const journal = createLogger('tiktok-stats');
const log = { info: (...a: unknown[]) => journal.info(format(...a)), warn: (...a: unknown[]) => journal.warn(format(...a)), error: (...a: unknown[]) => journal.error(format(...a)) };
const cle = env.TIKTOK_CLIENT_KEY;
const secret = env.TIKTOK_CLIENT_SECRET;
const redirection = `http://localhost:${Number(env.TIKTOK_PORT)}/callback/`;

type Coffre = Record<string, Jetons>;
const lireCoffre = (): Coffre => {
  try {
    return JSON.parse(readFileSync(FICHIER_JETONS, 'utf8')) as Coffre;
  } catch {
    return {};
  }
};
function ecrireCoffre(c: Coffre): void {
  writeFileSync(`${FICHIER_JETONS}.tmp`, JSON.stringify(c, null, 2));
  renameSync(`${FICHIER_JETONS}.tmp`, FICHIER_JETONS);
}
const nomCompte = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

function ouvrirNavigateur(url: string): void {
  // explorer.exe ouvre l'adresse dans le navigateur par défaut, sans que cmd interprète les « & » de l'URL.
  const [cmd, args]: [string, string[]] = process.platform === 'win32' ? ['explorer.exe', [url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
  } catch {
    /* l'adresse est affichée dans la console */
  }
}

/** Autorisation d'un compte : petit serveur local qui reçoit le code, échange contre des jetons, les range. */
async function connexion(compte: string): Promise<number> {
  if (!compte) {
    log.error('Indique un nom de compte : .\\tiktok.cmd connexion --compte actu-flash');
    return 1;
  }
  const { verificateur, defi } = pkce();
  const etat = randomBytes(16).toString('hex');
  const url = urlAutorisation(cle, redirection, etat, defi);
  return new Promise((resolve) => {
    const gerer = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
      const u = new URL(req.url ?? '/', redirection);
      if (u.pathname !== '/callback/' && u.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const fin = (code: number, message: string) => {
        res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<p style="font:18px system-ui;margin:40px">${message}</p>`);
        serveur.close();
        resolve(code === 200 ? 0 : 1);
      };
      if (u.searchParams.get('state') !== etat) return fin(400, 'Réponse refusée (état différent). Relance la connexion.');
      if (u.searchParams.get('error')) {
        log.error('TikTok a refusé : %s', u.searchParams.get('error_description') || u.searchParams.get('error'));
        return fin(400, 'Connexion refusée par TikTok. Regarde la fenêtre PowerShell.');
      }
      try {
        const jetons = await echangerCode(fetch, { cle, secret, code: u.searchParams.get('code') ?? '', redirection, verificateur });
        const coffre = lireCoffre();
        // Le navigateur reste connecté au dernier compte TikTok utilisé : on refuse d'enregistrer deux fois le même compte.
        const doublon = Object.entries(coffre).find(([nom, j]) => nom !== compte && j.open_id && j.open_id === jetons.open_id);
        if (doublon) {
          log.error('C\'est le même compte TikTok que « %s ». Ouvre une fenêtre privée (Ctrl+Maj+N), colle l\'adresse affichée plus haut, connecte-toi avec l\'autre compte et accepte.', doublon[0]);
          return fin(409, `C'est le même compte TikTok que « ${doublon[0]} » : rien n'est enregistré. Regarde la fenêtre PowerShell.`);
        }
        ecrireCoffre({ ...coffre, [compte]: jetons });
        const vu = await lireProfil(fetch, jetons.access_token).then((p) => p.display_name ?? '', () => '');
        log.info('Compte « %s » connecté%s (portées : %s).', compte, vu ? ` : c'est « ${vu} » sur TikTok` : '', jetons.scope || '?');
        if (!jetons.scope.includes('user.info.stats')) log.warn('Sans la portée user.info.stats, le nombre d\'abonnés ne sera pas disponible (les vues par vidéo, si).');
        fin(200, `Compte « ${compte} » connecté. Tu peux fermer cet onglet.`);
      } catch (err) {
        log.error((err as Error).message);
        fin(500, 'Échange du code impossible. Regarde la fenêtre PowerShell.');
      }
    };
    // « localhost » peut viser 127.0.0.1 ou ::1 selon le navigateur : on écoute les deux, en local uniquement.
    const serveur = createServer(gerer);
    const serveur6 = createServer(gerer);
    serveur.on('close', () => serveur6.close());
    serveur6.on('error', () => {});
    serveur6.listen(Number(env.TIKTOK_PORT), '::1');
    serveur.listen(Number(env.TIKTOK_PORT), '127.0.0.1', () => {
      log.info('Ouverture de TikTok dans ton navigateur : connecte-toi avec le compte « %s » et accepte.', compte);
      log.info('Si TikTok te connecte avec le mauvais compte, ou si rien ne s\'ouvre, colle cette adresse dans une fenêtre privée (Ctrl+Maj+N) :\n%s', url);
      ouvrirNavigateur(url);
    });
    setTimeout(() => {
      log.error('Pas de réponse au bout de 5 minutes : relance la connexion.');
      serveur.close();
      resolve(1);
    }, 5 * 60_000).unref();
  });
}

async function mettreAJour(dryRun: boolean, sortieForcee?: string): Promise<number> {
  const coffre = lireCoffre();
  const comptes = Object.keys(coffre);
  if (!comptes.length) {
    log.warn('Aucun compte connecté : lance d\'abord .\\tiktok.cmd connexion --compte actu-flash');
    return 0;
  }
  const resultat: Record<string, unknown> = {};
  let erreurs = 0;
  const vus = new Map<string, string>();
  for (const nom of comptes) {
    const id = coffre[nom]!.open_id;
    const autre = id ? vus.get(id) : undefined;
    if (autre) {
      erreurs++;
      resultat[nom] = { erreur: `même compte TikTok que « ${autre} » : reconnecte-le dans une fenêtre privée` };
      log.error('%s : c\'est le même compte TikTok que « %s ». Relance .\\tiktok.cmd connexion --compte %s et connecte-toi avec le bon compte (fenêtre privée).', nom, autre, nom);
      continue;
    }
    if (id) vus.set(id, nom);
    try {
      let j = coffre[nom]!;
      if (aRafraichir(j)) {
        if (j.expireRafraichissement < Date.now()) throw new ErreurTikTok('autorisation expirée : relance .\\tiktok.cmd connexion --compte ' + nom);
        j = await rafraichir(fetch, { cle, secret, jetons: j });
        coffre[nom] = j;
        if (!dryRun) ecrireCoffre(coffre); // TikTok peut renvoyer un nouveau refresh_token : on garde le dernier
      }
      const profil = await lireProfil(fetch, j.access_token);
      // Les vidéos peuvent échouer côté TikTok (erreur 500) : on garde quand même le profil (abonnés, likes).
      let videos: Awaited<ReturnType<typeof lireVideos>> = [];
      let avertissement = '';
      try {
        videos = await lireVideos(fetch, j.access_token, Math.max(1, Number(env.MAX_VIDEOS) || 60));
      } catch (err) {
        if (err instanceof ErreurTikTok && err.statut === 401) throw err;
        avertissement = `vidéos indisponibles pour l'instant (${(err as Error).message})`;
      }
      const r = { ...resumer(profil, videos), ...(avertissement ? { avertissement } : {}) };
      resultat[nom] = r;
      if (avertissement) log.warn('%s : %s abonnés, %s likes au total. Les vues par vidéo ne sont pas disponibles : %s', nom, r.abonnes ?? '?', r.likes ?? '?', avertissement);
      else log.info('%s (« %s ») : %s abonnés, %d vues sur 30 jours (%d vidéos), meilleure : %s vues.', nom, r.nom || '?', r.abonnes ?? '?', r.vues30j, r.videos30j, r.meilleures[0]?.vues ?? 0);
    } catch (err) {
      erreurs++;
      resultat[nom] = { erreur: (err as Error).message };
      log.error('%s : %s', nom, (err as Error).message);
    }
  }
  const sortie = sortieForcee ?? (env.DOSSIER_SORTIE ? path.join(path.resolve(env.DOSSIER_SORTIE), 'tiktok-stats.txt') : '');
  if (dryRun || !sortie) {
    if (!sortie) log.warn('DOSSIER_SORTIE vide : rien n\'est écrit (l\'usine passe --sortie toute seule).');
    return erreurs ? 1 : 0;
  }
  mkdirSync(path.dirname(sortie), { recursive: true });
  writeFileSync(sortie, JSON.stringify({ majLe: new Date().toISOString(), comptes: resultat }, null, 2) + '\n');
  log.info('Stats écrites dans %s', sortie);
  return erreurs ? 1 : 0;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { compte: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, sortie: { type: 'string' } } });
  const commande = positionals[0] ?? 'stats';
  if (commande === 'connexion') return connexion(nomCompte(values.compte));
  if (commande === 'comptes') {
    for (const [nom, j] of Object.entries(lireCoffre())) log.info('%s : autorisé jusqu\'au %s', nom, new Date(j.expireRafraichissement).toLocaleDateString('fr-FR'));
    return 0;
  }
  return mettreAJour(values['dry-run'], values.sortie ? path.resolve(values.sortie) : undefined);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error((err as Error).message);
    process.exit(1);
  },
);
