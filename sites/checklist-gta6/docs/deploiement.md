# Mise en ligne : Cloudflare Pages, Umami, domaine, règles à connaître

Tout le code est prêt (workflow `.github/workflows/checklist-gta6.yml`, `npm run build`). Il ne manque que ce qu'une personne doit faire elle-même : créer le compte Cloudflare, mettre deux secrets dans GitHub, et plus tard créer le site Umami. Env. 2 minutes chacun.

## 1. Cloudflare Pages (gratuit)

Limites utiles (doc Cloudflare du 19/11/2026) : 500 builds par mois, 20 000 fichiers, 25 Mio par fichier, aucune limite de bande passante indiquée ; ce site fait une dizaine de fichiers et le build se fait sur GitHub, pas chez Cloudflare.

1. Crée un compte gratuit sur dash.cloudflare.com avec **tes vraies informations** : c'est ce qui rend valable le régime d'éditeur anonyme des mentions légales (l'hébergeur doit connaître ton identité).
2. Copie ton **Account ID** (Workers & Pages, colonne de droite).
3. Crée un jeton : My Profile > API Tokens > Create Token > Custom token > Permissions : **Account / Cloudflare Pages / Edit**. Copie-le (affiché une seule fois).
4. Dans GitHub, dépôt `automatisations` > Settings > Secrets and variables > Actions > New repository secret : `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.
5. Onglet Actions > `checklist-gta6` > Run workflow. Le workflow crée le projet `checklist-gta6` (une fois) puis déploie `dist/`. L'adresse est `https://checklist-gta6.pages.dev` (Cloudflare ajoute un suffixe si le nom est pris : elle est affichée dans Cloudflare > Workers & Pages).
6. Dans GitHub > Settings > Secrets and variables > Actions > **Variables** : `SITE_URL` = cette adresse (sans « / » final). Chaque push suivant redéploie tout seul.

Commande équivalente à la main, pour dépanner (`wrangler` v4) : `npx wrangler pages deploy dist --project-name=checklist-gta6 --branch=main` après `npm run build`, avec `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` en variables d'environnement.

Cloudflare propose aussi Workers Static Assets comme voie de migration depuis Pages (page de migration du 12/11/2026) ; aucune fin de support de Pages n'est annoncée dans les pages lues. À surveiller, rien à faire maintenant.

## 2. Mesure d'audience Umami (facultatif, après la mise en ligne)

Sans `UMAMI_WEBSITE_ID`, le site ne charge aucun script de mesure (c'est l'état actuel).

1. Umami Cloud (plan Hobby gratuit), région UE si proposée > Settings > Websites > Add website : nom « Checklist GTA 6 », domaine = ton `SITE_URL` sans `https://`.
2. Edit > Tracking code : copie le website ID (et l'URL du script si elle diffère de `https://cloud.umami.is/script.js`).
3. GitHub > Variables : `UMAMI_WEBSITE_ID` (et `UMAMI_SCRIPT_URL` si besoin). Au push suivant, la balise est ajoutée (`data-domains` = ton domaine, `data-do-not-track`), la mention du pied de page change et le bouton « Désactiver la mesure sur cet appareil » apparaît dans les mentions légales.
4. Exclus tes propres visites : bouton des mentions légales sur ton PC et ton téléphone.

### CNIL : bandeau ou pas (lu le 25/11/2026)

Page CNIL « Cookies : solutions pour les outils de mesure d'audience » (04/07/2025) et son outil d'auto-évaluation (PDF, juillet 2025) : un outil est dispensé de consentement s'il sert uniquement à mesurer l'audience pour le compte de l'éditeur, ne produit que des statistiques anonymes, ne recoupe pas avec d'autres traitements et ne permet pas de suivi entre sites. Durées recommandées : 13 mois pour le traceur, 25 mois pour les données. **La CNIL ne cite pas Umami** : elle ne dit donc ni qu'il est exempté ni qu'il ne l'est pas. Points de l'outil à contrôler pour Umami Cloud : contrat de sous-traitance (article 28 du RGPD) avec le fournisseur, absence de réutilisation des données par lui, rapports agrégés, possibilité de s'opposer (bouton fourni), transferts hors UE. Le même outil range parmi les points de vigilance « pas d'identifiants CRM ou UTM dans les URL » : les liens UTM de ce site (`utm_source` = réseau, sans identifiant de personne) sont un point que la CNIL peut regarder de près. Si tu veux être strictement dans la dispense, n'active Umami qu'après avoir passé l'outil d'auto-évaluation ; sinon un bandeau de consentement serait nécessaire. Ce n'est pas un avis juridique.

## 3. Liens UTM

`npm run utm` affiche un lien par réseau à mettre en bio (TikTok, Instagram) et en description (YouTube). TikTok et Instagram ne rendent pas les liens cliquables dans les légendes : seule la bio compte. Ne change jamais les noms `tiktok`, `instagram`, `youtube`, sinon les tableaux se scindent.

## 4. Nom de domaine

Je n'ai pas pu vérifier la disponibilité de `viceradar.fr`, `checklist-vice.fr` et `leonida-checklist.com` (les registres RDAP étaient inaccessibles depuis l'environnement de l'agent, le 25/11/2026). Recommandation : **reste sur `*.pages.dev` jusqu'au bilan du jour 30**. Un domaine payant avant d'avoir un signal de demande est une dépense sans preuve, et changer d'adresse plus tard coûte peu (liens de bio à mettre à jour). Si le bilan dit « continuer », `viceradar.fr` est le candidat cohérent avec la marque ; évite les noms qui contiennent « GTA » ou « Leonida » (marques et noms du jeu) : un domaine ressemblant à un site officiel attire les demandes de retrait. Test de disponibilité en 1 minute sur le site d'un bureau d'enregistrement quand tu décideras.

## 5. Règle Rockstar / Take-Two et monétisation

- Politique « Policy on posting copyrighted Rockstar Games material » (mise à jour 10/01/2025) : usage non commercial toléré (« you don't make money through the game footage you post or use the material as part of a promotion for a product or service »). Elle ne parle ni de publicité, ni d'affiliation, ni de sites de fans monétisés ; Take-Two peut retirer un contenu « at any time ».
- Conditions de Take-Two (take2games.com/legal, mises à jour le 28/02/2025 ; 40 000 premiers caractères lus) : interdiction de « commercialize, or otherwise exploit the Services (including the Content) » sans accord écrit séparé. Elles visent leurs services ; rien de spécifique aux sites de fans dans la partie lue. La page rockstargames.com/legal n'a pas pu être lue.
- Conséquence appliquée : **pas de publicité, pas d'affiliation, aucune image de Rockstar** sur le site (le pied de page le dit). Monétiser est une décision pour après le jour 30, à prendre avec : statut fiscal (voir fiches « Statut » du tableau), mentions légales complètes et demande de licence à copyright@take2games.com. Pas un avis juridique.
