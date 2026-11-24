# tiktok-stats

Lit les statistiques de **tes** comptes TikTok avec l'API officielle (gratuite) : abonnés, likes, et pour chaque vidéo
les vues, likes, commentaires et partages. Les dépose dans `tiktok-stats.txt` (dans « A publier », sur Google Drive),
que le tableau de bord affiche dans chaque chaîne. TypeScript sans dépendance (fetch natif).

```
tools/tiktok-stats/
├── stats.ts          commandes (connexion, mise à jour, comptes)
├── tiktok.ts         client API : PKCE, jetons, profil, vidéos, résumé
├── tiktok.cmd        lanceur Windows
├── tests/tiktok.test.ts
├── .env.example
└── jetons.local.json (créé à la connexion, jamais versionné)
```

## Installation (une fois, ~15 min)

1. Sur **developers.tiktok.com**, connecte-toi et crée une appli (« Manage apps » > « Connect an app »).
2. Ajoute les produits **Login Kit** (plateforme **Desktop**) et **Display API**, avec les portées
   `user.info.basic`, `user.info.stats` et `video.list`.
3. Dans Login Kit, déclare l'adresse de redirection : `http://localhost:3455/callback/`.
4. Passe l'appli en **Sandbox** et ajoute tes comptes TikTok (Actu Flash, Vice Radar) comme utilisateurs de test.
   Pas de validation par TikTok nécessaire tant que l'appli ne sert qu'à tes comptes.
5. Copie la **Client key** et le **Client secret** dans `.env` :
   ```powershell
   Set-Location ~\dev\automatisations\tools\tiktok-stats
   Copy-Item .env.example .env
   notepad .env
   ```
6. Connecte chaque compte (le navigateur s'ouvre, connecte-toi avec le bon compte et accepte) :
   ```powershell
   .\tiktok.cmd connexion --compte actu-flash
   .\tiktok.cmd connexion --compte vice-radar
   ```

Les libellés exacts du portail TikTok peuvent varier un peu : cherche « Login Kit », « Sandbox », « Redirect URI ».

## Utilisation

```powershell
.\tiktok.cmd --dry-run      # lit et affiche, n'écrit rien
.\tiktok.cmd                # écrit tiktok-stats.txt dans DOSSIER_SORTIE
.\tiktok.cmd comptes        # comptes connectés et date d'expiration de l'autorisation
```

**Automatique :** l'usine le lance toute seule toutes les 6 heures dès qu'un compte est connecté, et écrit dans
« A publier ». Les jetons sont rafraîchis tout seuls (le jeton d'accès dure 24 h ; l'autorisation se refait seulement si
TikTok l'expire, `.\tiktok.cmd comptes` affiche la date).

## Exemple

```
[INFO ] actu-flash : 712 abonnés, 4 830 vues sur 30 jours (5 vidéos), meilleure : 2 104 vues.
[INFO ] vice-radar : 31 abonnés, 2 950 vues sur 30 jours (8 vidéos), meilleure : 890 vues.
[INFO ] Stats écrites dans G:\Mon Drive\Mes business\A publier\tiktok-stats.txt
```

Sécurité : la clé, le secret et les jetons restent dans `.env` et `jetons.local.json` (ignorés par git) et n'apparaissent
jamais dans les journaux. Le serveur de connexion n'écoute qu'en local, 5 minutes maximum.
