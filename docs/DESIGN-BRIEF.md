# Brief de direction artistique v9 — PULLED, registre Obvance

**Remplace toutes les versions précédentes pour le visuel (archivées : v1–v3 papier, v5–v6 pixel, v7 HUD, v8 points). On garde : la couche de données, les textes, le fond du projet (le projet, les quatre étapes, les sept portes, l'architecture, ce que personne ne peut faire, les risques, le statut), l'i18n EN/FR, les règles d'honnêteté du tirage, le clavier, le mode mouvement réduit, et le moteur 2D du boulier (`components/live/engine.ts`) à rhabiller.**

Référence donnée par le propriétaire : **https://obvance.app/** — « inspire-toi encore de ça ». Verdict sur la v8 : « toujours trop moche ; il faut une DA propre à nous, esthétique, un vrai site stylé, très interactif, avec un écran de chargement ». Le registre d'Obvance est celui d'un **produit fintech sombre, propre, dense en vrais chiffres et en vrais instruments interactifs** : la beauté vient des panneaux qui calculent, du schéma animé, des cartes de tableau de bord — pas d'un décor.

## 0. Obvance, mesuré dans le navigateur le 2026-10-24 (`getComputedStyle`)

| élément | valeur mesurée |
|---|---|
| fond de page | `#07080B` ; surfaces `#0C0E13`, `#0F1117`, cartes `#151821` ; bordure `#2D3341` |
| texte | `#F2F4F8` ; secondaire `#B3BBCA` ; atténué `#8A93A5` |
| accent | périwinkle `#8AA0FF` (liens, chiffres clés, pastilles) ; bouton principal bleu `#3D58EE` avec ombre `0 8px 22px -12px #3D58EE` + reflet `inset 0 1px 0 rgba(255,255,255,.22)` |
| vert | `#4FD394` pour « live » et les montants positifs (chez eux) |
| police | Geist Variable (texte, titres) + Geist Mono Variable (chiffres, mono) |
| h1 | 59 px / 60 px / 600 / `-0.042em` ; h2 34 px / 600 / `-0.028em` |
| conteneur | 1152 px |
| boutons | principal 52 px, rayon 12, 16 px 500 ; nav/secondaire 36 px, rayon 10, 14 px 500, fond `rgba(242,244,248,.04)` + reflet `inset 0 1px 0 rgba(255,255,255,.06)` ; « Connect wallet » fond `#111832`, bordure `#2A3A7D`, texte `#8AA0FF` |
| cartes | rayon 24, bordure 1 px `#2D3341`, ombre `0 0 0 1px rgba(255,255,255,.06), 0 40px 80px -24px rgba(0,0,0,.9), 0 4px 14px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)` |
| héros | gauche : pastille « Creator fees, paid upfront » (icône + texte), h1 deux lignes, paragraphe, **deux CTA par audience** (« I launched a token → Get an advance » / « I want to fund → See the deals »), trois pastilles de confiance (« Nobody can touch the money », « Verified code », « Robinhood Chain ») ; droite : **le schéma animé** — nœuds ronds lettrés (C, F, O, E) reliés par des courbes pointillées où circulent des particules vers un **vault** (demi-disque bleu/blanc), puis vers deux cartes « Funder ≤ 0.12 ETH » / « Creator +0.0975 ETH », badges numérotés 1-2-3 sur les flux, légende numérotée sous le schéma |
| sections | « Live · On-chain, updated every minute → All statistics » ; tableau de bord exemple (cartes de chiffres, graphique, historique) ; « How it works, the details with numbers » (4 étapes avec un libellé de résultat en mono) ; « See what a deal looks like » (**sliders** qui recalculent un chiffre géant et un graphique) ; « Deals open now » (liste / état vide) ; « Why you can trust it » (4 cartes à icône + 2 chiffres de frais) ; « Questions » (accordéon à « + ») ; CTA final répété ; pied de page |
| mouvement | discret : particules le long des courbes, transitions 150–200 ms, pas de reveal théâtral |

## 1. Notre DA, dérivée de ce registre — et à nous

**Même rigueur, nos objets.** Chez Obvance le produit est un flux d'argent (créateur → vault → funder). Chez nous le produit est **une fenêtre** : des entrées qui tombent dans une fenêtre, une graine qui arrive, des parts qui en sortent. Le schéma, le tableau de bord, le simulateur et le direct sont **les nôtres**, dessinés avec ce vocabulaire.

Tokens (`app/app/globals.css`) :

```css
:root {
  --bg: #07080B; --bg-2: #0C0E13; --surface: #0F1117; --card: #151821;
  --line: #2D3341; --line-soft: rgba(255,255,255,0.06);
  --ink: #F2F4F8; --ink-2: #B3BBCA; --ink-3: #8A93A5;
  --acc: #8AA0FF;            /* périwinkle : MOI, liens, chiffres clés, pastilles */
  --acc-btn: #3D58EE;        /* bouton principal */
  --acc-deep: #111832; --acc-line: #2A3A7D;   /* fond/bordure des boutons et badges bleus */
  --live: #4FD394;           /* UNIQUEMENT le point « live » et le statut « open ». Jamais sur un résultat. */
  --warm: #F2B95C;           /* LES AUTRES joueurs (boules, lignes du flux, série « autres ») */
  --radius-card: 24px; --radius-btn: 12px; --radius-sm: 10px;
  --shadow-card: 0 0 0 1px rgba(255,255,255,.06), 0 40px 80px -24px rgba(0,0,0,.9), 0 4px 14px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06);
  --shadow-btn: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(0,0,0,.35), 0 8px 22px -12px #3D58EE;
}
```

Règles d'honnêteté inchangées : **moi = périwinkle, les autres = ambre** ; **le résultat n'a pas de couleur** (pire et meilleur en `--ink`, même corps) ; le vert n'apparaît que sur le point live et le mot « open ». Pas de rouge.

Typographie : **Geist** (texte et titres ; h1 `clamp(40px, 5vw, 60px)` / 1.02 / 600 / `-0.042em` ; h2 34 px 600 `-0.028em` ; corps 16/26 ; secondaire 15/24 `--ink-2`) + **Geist Mono** (tous les chiffres, `tabular-nums`, 13–14 px dans les cartes, 32–48 px pour les chiffres géants, 600). Rien d'autre : plus de Doto, de Chakra, de Jersey, de serif.

## 2. Les instruments interactifs — ce qui fait le site

1. **L'écran de chargement** (première visite de la session, ≤ 900 ms) : fond `--bg`, le logo (un anneau segmenté en 24 parts, périwinkle, qui se remplit comme un compte à rebours en slots) + « PULLED », une ligne mono « reading the window… », fondu 300 ms. `sessionStorage`. Sous reduced-motion : rien.
2. **Le schéma animé du héros** (SVG, `components/diagram/WindowFlow.tsx`) : à gauche quatre nœuds ronds lettrés (A, B, C, et **you** en périwinkle), reliés par des courbes pointillées où **circulent des particules** (les mises, ambre pour les autres, périwinkle pour toi) vers **la fenêtre** au centre (un disque segmenté en 92 parts qui se remplit en slots, étiquette « window · 92 slots ») ; d'en haut, **la graine** (un point blanc) tombe dans la fenêtre au moment de la fermeture ; à droite, quatre cartes de part « A ×0.84 · B ×1.31 · C ×0.72 · **you ×1.14** » (chiffres mono, sans couleur) reliées par des courbes où les particules repartent ; badges numérotés 1-2-3 sur les flux ; légende numérotée sous le schéma (« 1 Entries land · 2 One seed decides · 3 Shares sum to the sale, exactly »). Le schéma **boucle** en ~12 s et **réagit** : survoler un nœud met son flux en avant, cliquer « you » ouvre l'entrée. Pastille « Example » en haut à droite comme chez eux.
3. **Le direct** (`LiveWindow`, carte de tableau de bord) : en-tête « Live · on-chain, updated every slot » (point vert) ; à gauche les chiffres (slots restants en mono géant avec un anneau segmenté, total, entrées, cap) ; au centre le boulier (moteur 2D existant, rhabillé : fond `--surface`, cage et boules en traits fins blancs, la mienne périwinkle, les autres ambre, aucun néon) ; à droite le flux des entrées (ligne 48 px : avatar lettre ronde, pseudo, « 12 slots ago », montant mono) ; après le tirage : « your roll » / « your share » en mono 32 px sans couleur, le bouton principal « Sell back now for 0.3040 SOL » et « or keep the tokens » ; déroulé honnête (chute 300 ms, arrêt net, une graine en 600 ms, placement 700 ms, < 2 s).
4. **« See what a draw looks like »** (le simulateur, l'instrument signature) : trois sliders (ta mise 0.01–5 SOL ; total de la fenêtre 0.1–100 SOL ; part de la plus grosse entrée 0–20 %) + un sélecteur « I'm entering / I'm integrating » (le second montre le partage de frais pour l'hôte : slider 0–300 bps). Recalcul instantané **avec la vraie loi** (`@pulled/sdk/law`, 20 000 fenêtres Monte Carlo dans un Web Worker, < 80 ms) : chiffre géant « ×1.000 expected » (toujours, et la phrase « exactly your pro-rata, whatever your stake » dessous), puis la **distribution de ton multiplicateur** (histogramme SVG, barres `--acc` à 60 %, médiane et p10/p90 annotés), « below pro-rata in 62 % of windows » (mesuré en direct par la simulation), et une ligne mono « an estimate from the published law, not a promise ». Pour l'hôte : « on a 10 SOL window you receive 0.30 SOL » calculé par `splitFees`.
5. **Le tableau de bord exemple** (« Follow everything in one place ») : quatre cartes de chiffres (your entries · windows settled · your best · your worst, pire et meilleur même corps), un graphique « your multiplier per window » (points mono, ligne pro-rata), l'historique (« Window 1099 · settled · ×1.14 · sold back 0.304 SOL »). Données démo étiquetées « Example ».
6. **Les sept portes** (« Why you can trust it ») : cartes à icône (icônes fines 16 px, trait 1.5, dessinées en SVG inline — pas de bibliothèque), verdict en mono (`pass` / `pass after redesign` / `unverified` en `--ink-3`), le chiffre clé, lien « Read the gate → ». **Deux chiffres de frais** en grand comme chez eux : « 1.00 % on entry · 0 on sell back ».
7. **Recent windows** : liste de deals (ligne 56 px : index, entrées, total, pire, meilleur, « verify → ») ; état vide propre si aucune.
8. **Questions** : accordéon « + », six questions, 200 ms.
9. **CTA final** répété (h1 + deux boutons) ; pied de page en colonnes avec le statut « not yet deployed · research dated 23 Oct 2026 ».

## 3. Mise en page

- Barre de navigation 64 px : logo (anneau + « PULLED »), Live · How it works · Odds · Integrate · Security, à droite EN/FR, X, **« Enter the draw »** (36 px, secondaire) et **« Connect wallet »** (bleu profond). Pas de capsule flottante : barre pleine largeur, bordure basse `--line-soft`, fond `--bg` à 80 % + blur.
- Héros : deux colonnes 1152, gauche 46 %, droite 54 % ; hauteur naturelle (pas de 100 vh).
- Sections : titre h2 + lien « All … → » en `--acc` dessous, 96 px d'espacement ; cartes `--card`, rayon 24, ombre `--shadow-card`, padding 24–32 ; grilles 2/3/4 colonnes ; mobile : une colonne, 20 px de marge.
- Pastilles : rayon 999, 13 px, fond `rgba(242,244,248,.05)`, bordure `--line-soft`, icône 14 px.
- Les objets de l'ancienne DA (points, pixels, HUD, crochets, lueurs, Doto, rendus 3D, photo d'archive) disparaissent ; la photo peut rester **une fois**, en petit, dans « Why you can trust it » (carte « the draw as it has always been, with the sum made exact »), en couleur, rayon 16.

## 4. Mouvement — discret et utile

- Particules le long des courbes du schéma (rAF, 1.5 px, 6 particules par courbe, 3 s par trajet, `ease: linear`).
- Anneaux segmentés qui se remplissent en pas (slots).
- Transitions 150–200 ms (`ease-out`) sur les survols : cartes +1 px de bordure claire, boutons +4 % de luminosité, liens soulignés.
- Chiffres : comptage par pas 400 ms à l'apparition.
- Pas de reveal au scroll, pas de parallaxe, pas de typewriter, pas de bloom. GSAP peut rester pour le direct et le comptage ; sinon CSS.
- Reduced-motion : particules et anneaux statiques, pas d'écran de chargement.

## 5. Pages

- `/` : navigation, héros + schéma, bande « Live », le direct, le simulateur, le tableau de bord exemple, « How it works, with numbers » (4 cartes : étape, durée en slots, instruction du programme, résultat mono), « Recent windows », « Why you can trust it » (sept portes + frais + photo), « Questions », CTA, pied de page.
- `/odds` : le simulateur en tête, puis G3 par décile, le petit joueur, le plafond, les tableaux — en cartes.
- `/window/[id]` : la vérification (seed, compte VRF, bouton « Recompute », tableau, pire/meilleur).
- `/integrate` : aperçu embarqué réel + snippets + partage de frais + simulateur côté hôte.
- `/security` (nouvelle) : le contenu de `SECURITY.md` en cartes (ce qui est révoqué, l'autorité, l'aléa, les limites), statut « not yet deployed ».
- `/about` fusionne dans `/security` et « How it works » ; garder une redirection.

## 6. Pré-vol v9

- [ ] Palette, polices, rayons, ombres, hauteurs de boutons conformes au tableau §0 (vérifier au `getComputedStyle` sur notre page).
- [ ] Écran de chargement ≤ 900 ms ; schéma animé qui boucle et réagit ; direct ; simulateur à sliders avec la vraie loi dans un worker (< 80 ms) ; tableau de bord ; portes ; FAQ ; CTA.
- [ ] Moi = périwinkle, les autres = ambre, résultat sans couleur, vert seulement sur « live/open » ; aucune lueur hors l'ombre du bouton principal.
- [ ] Aucun point, pixel, crochet, HUD, Doto, 3D, néon ; une seule photo, petite.
- [ ] Tirage < 2 s, arrêt net, une graine, aucun faux suspense ; UNVERIFIED reste UNVERIFIED.
- [ ] FR complet ; clavier ; reduced-motion ; aucun débordement 320–1440 ; build et test de vocabulaire.
- [ ] Captures 1280 et 375 de chaque page dans `app/screenshots/v9/`, dont le héros avec le schéma en cours d'animation, le simulateur après un mouvement de slider, le direct à chaque état, l'écran de chargement.
- [ ] Posée à côté d'obvance.app, la capture de `/` est du même niveau de finition et visiblement **la nôtre** (fenêtre, graine, parts).


---

# v10 — le pixel revient, dans la v9

Le propriétaire : « il est où le côté pixel voulu ? inspire-toi de mes projets avec une belle esthétique ». La v9 (registre Obvance) reste **intégralement** : tokens, Geist, cartes, boutons, barre, héros, schéma, direct, simulateur, tableau de bord, portes, FAQ, pages. On y ajoute **le pixel comme langage d'illustration et d'afficheur**, avec le soin des projets du propriétaire : PEAKED v6 (`C:\Users\Utilisateur\Nouveau dossier (13)\research\DESIGN.md`, section v6 : un pixel logique = un nombre entier de pixels d'appareil, échelle choisie depuis le viewport, tramage ordonné, sprites dessinés à la main, art net à toute taille) et FomoEven (objets qui vivent dans les cartes). **Lis ces notes avant de dessiner.**

Règle d'intégration : **le chrome reste Obvance (net, vectoriel, Geist) ; tout ce qui est objet, scène, icône ou afficheur de chiffre vivant est en pixel art.** Jamais de police pixel pour du texte courant ou des titres.

## 7. Ce qui passe en pixel (`app/components/pixel/`)

Un module `sprite.ts` (grilles de caractères → `ImageData`, palette : `--ink`, `--acc`, `--warm`, `--card`, `--line` + deux teintes de tramage), un rendu `PixelCanvas` (canvas basse résolution agrandi à l'entier, `imageSmoothingEnabled=false`, `image-rendering: pixelated`, `S = clamp(2, floor(min(vw,1440)/360), 4)`).

1. **Le centre du schéma du héros** : à l'intérieur de l'anneau segmenté (qui reste vectoriel), **le boulier en pixel art** (48×40 logique, cage en `--acc`, boules `--ink`, la mienne `--acc`, les autres `--warm`) qui tourne d'un cran par slot ; la graine est un **point pixel blanc 3×3** qui tombe ; les particules des courbes deviennent des **carrés de 2×2 pixels** (ambre pour les autres, périwinkle pour moi). Les nœuds A/B/C/you gardent leur rond vectoriel mais contiennent une **boule pixel 12×12**.
2. **Le direct** : le boulier est rendu par le moteur 2D **en basse résolution** (160×100 logique, ×S) : cage, boules étiquetées en micro-police 3×5, graine, règle graduée, placement — net, pixel, sans néon. Le **compte à rebours en slots** et le **slot de la barre** sont des **afficheurs à matrice 5×7** (`DotMatrix`, à recréer : points allumés `--ink`, éteints à 10 %, cellule 8 px desktop / 6 px mobile ; moi/action en `--acc`). Les autres chiffres restent en Geist Mono.
3. **L'écran de chargement** : l'anneau se remplit **en pas de pixels** (24 blocs), le wordmark « PULLED » apparaît en **micro-police pixel 5×7 ×4** puis se remplace par le wordmark Geist (fondu 200 ms) — un clin d'œil, 900 ms max.
4. **Les icônes** : seize icônes **16×16 pixel** 2 couleurs (`--ink` + `--acc`), rendues en SVG `<rect>` (netteté), dans les pastilles, les étapes, les cartes de confiance, la navigation, le pied de page. Plus d'icônes vectorielles fines.
5. **Les cartes de confiance (sept portes)** : chaque carte a en haut une **vignette pixel 48×32** dessinée pour sa porte (loupe pour G1, antenne pour G2, balance pour G3, barrière pour G4, livre de comptes pour G5, horloge pour G6, boucle pour G7), palette 4 couleurs, tramage.
6. **La carte photo** (« the draw as it has always been ») : la photo `hero.jpg` **pixelisée en 12 couleurs à 96 px de large, ×S** (script sharp au build), avec une bordure pixel 2 px ; c'est la seule image.
7. **Le tableau de bord exemple** : les avatars des fenêtres sont des **identicons pixel 8×8** (deux couleurs du pubkey) ; le graphique « multiplier per window » garde ses points vectoriels.
8. **Les étapes « How it works »** : chaque carte a un **sprite 32×32** (boule qui tombe, graine, balance, ticket), animé en 2 images à 2 fps.
9. **Le pied de page** : le boulier pixel en petit, immobile, à côté du wordmark.
10. **Fond du héros** : derrière le schéma, un **tramage ordonné** (Bayer 8×8) périwinkle à 4 % qui s'éclaircit vers le centre — la seule texture, discrète, désactivée sur mobile.

## 8. Ce qui ne bouge pas

Typographie Geist/Geist Mono partout (titres, texte, chiffres statiques) ; palette v9 ; cartes, boutons, pastilles, barre, mise en page ; simulateur, tableau de bord, FAQ, CTA, pages ; honnêteté : moi périwinkle, autres ambre, résultat sans couleur, tirage < 2 s. Interdits maintenus : lueurs, HUD, crochets, scan, typewriter, Doto/Jersey en texte.

## 9. Pré-vol v10

- [ ] Le boulier pixel tourne au centre du schéma ; particules carrées ; graine pixel ; boules pixel dans les nœuds.
- [ ] Le direct est rendu en basse résolution nette ; compte à rebours et slot en matrice 5×7 avec points éteints visibles.
- [ ] Chargeur pixel ≤ 900 ms ; seize icônes pixel ; sept vignettes de portes ; photo pixelisée ; identicons ; sprites des étapes ; boulier du pied de page ; tramage du héros.
- [ ] Tout pixel est à l'échelle entière, net, sans flou, à 1280 et 375 (vérifier au zoom sur les captures).
- [ ] Aucune police pixel sur du texte ; le chrome reste exactement v9.
- [ ] Build, test de vocabulaire, FR, reduced-motion, débordements ; captures 1280/375 de chaque page dans `app/screenshots/v10/`, dont un zoom ×2 sur le centre du schéma et sur le direct.


---

# v11 — fusion esthétique v10 × FomoEven

Demande du propriétaire : « fusionne ça et FomoEven, **esthétiquement seulement** ». Donc : **rien ne change** dans la structure, les pages, les sections, les textes, les données, les instruments (schéma, direct, simulateur, tableau de bord, portes, FAQ), l'i18n, le clavier, les règles d'honnêteté, ni dans la couche pixel de la v10 (boulier pixel, direct basse résolution, matrice de points, icônes, vignettes, photo pixelisée, sprites, identicons). **Seule la peau change** : on remplace la peau Obvance par la peau FomoEven (version sombre d'origine), et les objets pixel deviennent les « objets qui flottent » de FomoEven.

Source de vérité FomoEven : `C:\Users\Utilisateur\Nouveau dossier (12)\app\themes\light\` (`globals.css` = la version sombre d'origine, `decor.css`, `landing.css`, `f100.css`, `inner.css`). **Lis `globals.css` et `decor.css` en entier avant de toucher au CSS** et reprends leurs valeurs exactes.

## 10. Correspondance élément par élément

| élément | v10 (Obvance) | v11 (FomoEven) |
|---|---|---|
| fond | `#07080B` uni | `#05070f` + `radial-gradient(1100px 600px at 85% -10%, rgba(47,107,255,.18), transparent 60%)` + `radial-gradient(900px 500px at -10% 35%, rgba(47,107,255,.07), transparent 60%)`, fixe |
| surfaces | `#0F1117` / cartes `#151821` | `--card #0c1122`, `--card-2 #111830`, `--card-3 #1a2447`, bordure `rgba(255,255,255,.07)` / `.12`, `--rim: inset 0 1px 0 rgba(255,255,255,.06)` |
| texte | `#F2F4F8` / `#B3BBCA` / `#8A93A5` | `#f4f6ff` / `#a2aac6` / `#737c9b` |
| accent « moi » | périwinkle `#8AA0FF` | bleu FomoEven `#2f6bff` (texte petit `#6a95ff`), fond doux `rgba(47,107,255,.14)` |
| « les autres » | ambre `#F2B95C` | soleil FomoEven `#ffb547` |
| live | `#4FD394` | inchangé (point live et « open » seulement) |
| rayons | cartes 24, boutons 12/10 | panneaux **24** (`--radius`), sous-panneaux 16, **boutons et nav en pilule 999** |
| en-tête | barre pleine 64 px | **capsule flottante** `.capsule` : `width: min(1080px,100%)`, 64 px, rayon 999, `linear-gradient(180deg, rgba(22,30,60,.8), rgba(10,14,30,.8))`, bordure `rgba(255,255,255,.1)`, `backdrop-filter: blur(18px) saturate(1.4)`, ombre `inset 0 1px 0 rgba(255,255,255,.12), 0 18px 50px -20px rgba(0,0,0,.9), 0 0 40px -12px rgba(47,107,255,.45)`, sticky à 14 px ; nav dans une pastille `rgba(255,255,255,.04)`, lien actif en pilule `linear-gradient(180deg,#3b77ff,#2458e6)` blanc ; la mini-machine pixel animée à côté du wordmark ; **ligne de progression** `.nav-progress` 2 px dégradé bleu |
| bouton principal | `#3D58EE` rayon 12 | pilule, `linear-gradient(180deg,#3b77ff,#2458e6)`, `inset 0 1px 0 rgba(255,255,255,.25), 0 6px 18px -8px rgba(47,107,255,.9)` |
| bouton secondaire | fond 4 %, rayon 10 | pilule `rgba(255,255,255,.04)`, bordure `.12` |
| titres | Geist 600 −0.042em | **police display FomoEven** (`--font-display` de leur `layout.tsx` d'origine : Sora 800 si présent dans le port, sinon Schibsted Grotesk 800), `letter-spacing: -0.05em`, `line-height: .95` ; texte Inter ; chiffres Geist Mono |
| grands chiffres | Geist Mono blanc | `.grad-num` : `linear-gradient(180deg,#9fbaff,#2f6bff)` en `background-clip: text` — **uniquement** sur les chiffres de présentation (les trois figures, les frais, ×1.000 attendu). **Jamais** sur un résultat de tirage (pire, meilleur, ta part : `--ink`, même corps) |
| pastille d'en-tête | pastille neutre | `.kicker` FomoEven (fond `rgba(47,107,255,.12)`, bordure `rgba(106,149,255,.3)`, texte `#6a95ff`, 999) — une seule, dans le héros |
| carte du direct | carte sombre | **`.glow-card`** : bordure 1 px en `conic-gradient(from var(--angle), …#2f6bff, #7ad7ff…)` qui tourne en 8 s, rayon 28, ombre `0 30px 80px -40px rgba(47,107,255,.8)` ; intérieur `.glow-inner` `--card` |
| ticker | (bande « Live ») | **`.marquee`** FomoEven : bande pleine largeur, fond `linear-gradient(90deg, rgba(47,107,255,.1), .03, .1)`, masque de bords, items `.marquee-item` 14×28 avec le sprite pixel 22 px de chaque fenêtre, défilement continu, pause au survol |
| décor | tramage Bayer 4 % | **les objets qui flottent** de FomoEven, mais **en pixel** : 3 à 4 floaters par écran du héros (une boule pixel 12×12 ×3, le ticket pixel, une graine pixel), `filter: drop-shadow(0 18px 30px rgba(0,0,0,.55)) drop-shadow(0 0 24px rgba(47,107,255,.35))`, `bob 7s` / `drift-up 11s` déphasés ; **bulles qui montent** (`.bubbles`) remplacées par des **carrés pixel 2×2 à 4×4** bleu pâle qui montent lentement derrière le contenu (≤ 18, opacité 0.35) ; le tramage Bayer reste derrière le schéma |
| chargeur | anneau pixel | `.loader` FomoEven (fond radial bleu, mot + barre `loader-fill` + pourcentage `loader-pct`) avec, au centre, **le boulier pixel qui tourne** à la place de leur bouée ; ≤ 900 ms |
| pied de page | colonnes | `.footer-sea` : dégradé `#0a1433 → #060a1c → #04060f`, colonnes, puis **`.footer-big`** « PULLED » en display 800 `clamp(3rem,11vw,9rem)` `-0.05em`, `linear-gradient(180deg, rgba(244,246,255,.95), rgba(106,149,255,.3))` clip texte ; le boulier pixel posé à côté, avec deux boules pixel qui en tombent lentement |
| mouvement | discret | celui de FomoEven : `page-enter` 560 ms `cubic-bezier(.22,1,.36,1)`, apparitions `fx-fade-up` / `fx-card-in` au scroll (une fois), `nav-progress`, `bob`, `drift-up`, `angle` (glow-card), capsule qui se resserre au scroll (transition 300 ms de `min-height`/`padding`) ; tout coupé sous reduced-motion |
| schéma du héros | sur fond uni | posé dans la **scène héros FomoEven** (`.hero-scene` : carré 520 px max) avec un halo radial bleu derrière l'anneau ; courbes et particules pixel inchangées, couleurs remappées (moi bleu, autres soleil) |

## 11. Règles qui restent dures

- Résultat sans couleur (pire, meilleur, ta part en `--ink`, même corps) ; dégradé de texte **jamais** sur un résultat.
- Le vert seulement sur live/open ; pas de rouge.
- Le pixel reste net, à l'échelle entière (les `drop-shadow` sont sur le conteneur, pas sur des pixels redimensionnés en flou).
- Aucun changement de contenu, de structure, d'instrument ou de texte : si un élément de FomoEven n'a pas d'équivalent dans notre structure (FAQ à deux colonnes, bento, etc.), **on ne l'ajoute pas**.
- Reduced-motion : pas de glow qui tourne, pas de floaters qui bougent, pas de carrés qui montent, pas de chargeur.

## 12. Pré-vol v11

- [ ] Toutes les valeurs du tableau §10 vérifiées au `getComputedStyle` sur notre page, avec la valeur FomoEven en face, dans `docs/DESIGN-REFERENCES.md`.
- [ ] Capsule flottante, ligne de progression, pilules, glow-card sur le direct, grad-num sur les chiffres de présentation, kicker, marquee avec sprites, floaters pixel, carrés pixel qui montent, chargeur FomoEven avec le boulier pixel, footer-sea avec footer-big.
- [ ] Structure, textes, instruments et couche pixel identiques à la v10 (diff des sections vide).
- [ ] Résultats sans couleur, vert seulement sur live/open.
- [ ] FR, clavier, reduced-motion, aucun débordement 320–1440, build, test de vocabulaire.
- [ ] Captures 1280 et 375 de chaque page dans `app/screenshots/v11/`, dont le chargeur, le héros avec floaters, le direct dans sa glow-card, le marquee, le pied de page ; plus une capture côte à côte `compare-fomoeven.png` (notre héros à gauche, le héros FomoEven du port local à droite).


---

# v12 — une homepage à nous, et tout amélioré

Demande du propriétaire : « change un peu la homepage qui fait trop copié, et améliore tout ». La peau v11 (FomoEven sombre + pixel) reste. Ce qui change : **la composition de la homepage** cesse de reprendre celle d'Obvance section par section, et une passe de qualité touche tout le site.

## 13. Ce qui fait « copié » aujourd'hui — à retirer

Repris presque tels quels d'Obvance, donc interdits sur la homepage :
- le héros « texte à gauche, schéma de flux à droite » avec nœuds lettrés → disque → cartes, et la légende numérotée 1-2-3 dessous ;
- les deux CTA étiquetés par audience (« I want to enter » / « I run a launch ») et la rangée de pastilles de confiance sous les boutons ;
- la bande « Live · on-chain, updated every … → All statistics » ;
- « Follow everything in one place » avec un faux écran d'app encadré ;
- « How it works » en cartes numérotées avec une « statement » à droite ;
- « Why you can trust it » en grille de cartes à icône ;
- « Questions » en accordéon centré ;
- le CTA final qui répète le titre du héros.
Ces contenus restent, mais **pas dans cette forme ni sous ces titres**.

## 14. La homepage v12 : un tirage qu'on fait défiler

Idée : **la page entière est une seule fenêtre de tirage**, racontée au scroll. Le boulier pixel n'est pas une illustration à côté du texte, c'est la scène, et elle reste à l'écran pendant qu'on descend.

1. **Ouverture (plein écran, 100 svh)** : au centre, **le boulier pixel en grand** (×5 desktop, ×3 mobile) posé sur un sol en tramage ; au-dessus, le compte à rebours en matrice de points (`092 slots`) ; les **entrées en direct tombent du haut** dans la cage, chacune avec son pseudo en micro-police qui s'éteint en arrivant ; ta boule est bleue. Le titre « Same price for everyone. Not the same bag. » est posé **en bas à gauche** de la scène, en display, sur deux lignes, et à droite en bas un seul bouton pilule « Enter · 0.25 SOL » + le total de la fenêtre. Aucun schéma de flux, aucune pastille de confiance. La manivelle se tourne.
2. **Scroll épinglé « la fenêtre » (≈ 400 vh, la scène reste fixe)** : quatre temps scrubbés, chacun avec **une phrase en grand** à gauche (pas de carte) et un détail chiffré en mono :
   - *ouverte* — les boules tombent ; « everyone pays the same price, 92 slots, capped at 20 % per entry » ;
   - *scellée* — la cage **s'arrête net** ; « no entry, no exit, nobody can cancel » ;
   - *la graine* — un point pixel tombe dans la goulotte, son hash s'écrit en matrice ; « one seed from ORAO VRF, after the close, with a proof · 4 s median, 113 s p99 » ;
   - *les parts* — les boules sortent et se rangent sur une règle graduée, les multiplicateurs s'affichent au-dessus (×0.54 … ×1.40), la tienne en bleu ; « the shares add up to what the curve sold, to the lamport ».
   Puis la scène se réduit et glisse vers le haut (FLIP) pour laisser la suite.
3. **« Ta part, avant d'entrer »** : le simulateur, mais présenté comme une **machine** : à gauche trois **molettes / curseurs pixel** (mise, total, plus grosse entrée), à droite l'histogramme en colonnes de pixels et le chiffre « ×1.000 attendu » ; une seule phrase : « most entries end a little below pro-rata; a few end well above ».
4. **« Ce que la maison ne peut pas faire »** : pas de grille de cartes ; **une liste verticale de lignes barrées** (`move your stake`, `cancel after the seal`, `choose the seed`, `change the law or the fee`, `pause sell back`, `mint more`) où chaque ligne se barre d'un trait pixel quand elle entre à l'écran, avec à droite le cadenas pixel. En dessous, une ligne : « 1.00 % on entry. 0 on sell back. Nothing on the draw. »
5. **« Les sept vérifications »** : une **frise horizontale** de sept vignettes pixel (G1 → G7) qu'on fait défiler latéralement (scroll horizontal épinglé desktop, glissement au doigt mobile), chaque vignette avec son verdict et son chiffre ; G7 `unverified` visiblement éteinte.
6. **« Les dernières fenêtres »** : un **mur de tickets pixel** (une petite carte par fenêtre réglée : index, entrées, pire et meilleur au même corps, lien vérifier) disposés en quinconce, qui se retournent au survol pour montrer la graine.
7. **L'archive** : la photo pixelisée **en grand**, pleine largeur, avec la phrase non refermable par-dessus — c'est la respiration de la page.
8. **Pour les apps qui veulent l'intégrer** : une seule bande sombre avec l'aperçu embarqué réel à droite et trois lignes de code à gauche ; lien vers `/integrate`.
9. **Questions** : six questions en **deux colonnes** de lignes simples qui s'ouvrent, sans boîte ; pas de titre « Questions », un intitulé à nous : « Before you pull ».
10. **Pied de page** : inchangé v11 (mer + wordmark + boulier pixel).

Le tableau de bord exemple et « how it works » en cartes **quittent la homepage** (ils restent dans les pages intérieures `/odds`, `/security`, `/window`).

## 15. Améliorer tout — passe de qualité sur tout le site

1. **Rythme** : une échelle d'espacement unique (8/16/24/40/64/96/144) appliquée partout ; aucune section collée ou flottante ; vérifier à 1280, 1440, 1920, 768, 375, 320.
2. **Typographie** : un seul jeu de tailles (display 96/64/40, texte 18/16/14, mono 14/12), `text-wrap: balance` sur tous les titres, pas de veuve sur les phrases en grand ; contraste ≥ 4.5:1 partout (mesurer).
3. **Pixel** : toutes les scènes à l'échelle entière **à toutes les largeurs** (recalcul au resize), aucune image floue ; même palette de sprite partout.
4. **Mouvement** : un seul fichier de constantes ; durées 160/320/560 ; aucune animation en boucle sauf la glow-card, les floaters du héros et le ticker ; tout coupé sous reduced-motion.
5. **Performance** : homepage < 250 kB de JS au premier chargement, LCP < 2 s en mobile simulé, aucune image > 200 kB, canvas en pause hors écran, `content-visibility: auto` sur les sections basses.
6. **Accessibilité** : ordre de tabulation logique, focus visible, `aria-live` sur le compte à rebours (poli, toutes les 10 s), toutes les scènes canvas avec une alternative textuelle.
7. **Pages intérieures** : même rythme, même en-tête de page (titre display + phrase + petit sprite pixel), mêmes composants ; `/odds` reprend le tableau de bord exemple et les tableaux G3 ; `/security` les cartes de confiance ; `/integrate` le code ; `/window` la vérification.
8. **Mobile** : la scène d'ouverture tient en un écran, le scroll épinglé devient une suite de quatre écrans simples (pas d'épinglage sous 768 px), la frise des vérifications glisse au doigt.
9. **FR** : relire toutes les nouvelles phrases en français naturel, espaces fines avant « : ; ! ? ».

## 16. Pré-vol v12

- [ ] Aucun des huit motifs de §13 sur la homepage.
- [ ] Ouverture plein écran avec le boulier pixel en grand et les entrées qui tombent ; scroll épinglé en quatre temps ; simulateur-machine ; liste barrée ; frise horizontale des sept vérifications ; mur de tickets ; archive pleine largeur ; bande intégration ; « Before you pull ».
- [ ] Peau v11 intacte ; résultat sans couleur ; vert seulement sur live/open ; tirage < 2 s et honnête.
- [ ] Les neuf points de §15 vérifiés et mesurés (rapporter les chiffres : JS, LCP, contraste minimum).
- [ ] Build, test de vocabulaire, FR, reduced-motion, aucun débordement.
- [ ] Captures 1280 et 375 dans `app/screenshots/v12/` : ouverture, chacun des quatre temps épinglés, simulateur après réglage, liste barrée, frise, mur de tickets, archive, et la page complète.

## v15 — chat game

Idée : on rejoint une manche en tapant une commande dans un chat, comme un jeu de chat Twitch. `!pull 0.25` fait tomber sa boule (avec son nom) dans le tambour ; chaque entrée apparaît comme un message ; à la fermeture le chat affiche les lignes système (scellée → graine demandée → graine arrivée → partage fait, « sum in = sum out »), le tambour fait un tour et chaque boule reçoit son sac sur un rail ×0 … ×2 ; un tableau de résultats liste tout le monde. Puis `!sell` revend au prix de la courbe, 0 frais. Aucun pixel art.

**Un seul système, partout.**
- **Type** : Barlow Condensed 700–800 (titres en capitales, italique pour h1/h2, étiquettes HUD, boutons, tous les chiffres en tabulaires) ; Inter pour le texte et le chat ; Geist Mono seulement pour les commandes et le code. Fichiers woff2 Google d'origine dans `public/fonts`.
- **Couleur** : page blanche ; bleu = toi, ambre = les autres, vert seulement LIVE / ouvert ; un résultat n'a jamais de couleur ; pas de dégradé, pas de lueur, pas de flou, pas de verre.
- **Surfaces** : un panneau (blanc, bordure 2 px encre, rayon 14, décalage plein `0 4px 0` encre), un panneau intérieur discret (`--bg-2`, sans bordure), un bouton primaire (bleu) et un secondaire (blanc), 48 px (40 en petit), rayon 12, appui = 3 px vers le bas ; une étiquette (LIVE, ROUND #1100, YOU, DEMO DATA en pointillés) ; une puce de commande (`!pull 0.25`, rayon 8, `--bg-2`).
- **Rythme** : échelle d'espacement et échelle typographique en variables CSS (`--s-1…--s-9`, `--t-*`, `--section-y`) ; chaque section a la même tête : numéro + kicker, h2, une phrase.
- **Icônes** : lucide-react, trait 2 px, un seul jeu.
- **Logo** : le tambour en vecteur (cage ronde, manivelle et bouton à droite, pied, deux boules ambre et une bleue un peu plus grande au centre) ; le mot PULLED en Barlow Condensed converti en tracés (`scripts/make-brand.mjs`, `opentype.js`).

**Page d'accueil** : le stream (scène 16:9 avec le tambour lisse en Canvas2D à la densité de l'écran, HUD LIVE + ROUND, compte à rebours en slots et ≈ secondes, bandeau « Type !pull 0.25 in chat to join » ; chat à droite, sous la scène sur téléphone) ; le tableau de résultats (même taille pour tous, le plus bas et le plus haut étiquetés pareil, la somme conservée toujours visible) ; « How a round plays » (4 cartes) ; « Chat commands » ; « Practice round » (le simulateur) ; « What the house cannot do » ; « Match history » ; l'intégration ; les questions. Les pages intérieures reprennent la même en-tête, les mêmes panneaux, les mêmes boutons. Sous reduced-motion : rien ne tourne ni ne tombe, chaque état est dessiné au repos.

## v16 — the drum in a dark room

Retour du propriétaire sur la v15 : trop « cartoon », trop blanc (« ça fait mal aux yeux »), il veut des couleurs plus belles, un site un peu plus sombre et un objet 3D stylé comme le Rubik's cube de « floored ». On garde le concept (le jeu de chat, `!pull 0.25`, le tableau de résultats, les commandes, la manche d'entraînement, la maison, l'historique, l'intégration, les questions) et tout le contenu ; on change le regard.

**Un seul système, partout.**
- **Couleur** : un sombre doux et profond, jamais du noir pur : fond `#0D1017`, fond 2 `#12161F`, carte `#161B26`, carte 2 `#1C2230`, filets `rgba(255,255,255,.07)` et `.12`. Encre `#ECEEF4`, encre 2 `#A4AABB`, encre 3 `#8A91A5` (le `#6E7588` demandé ne passe pas AA sur les cartes : il reste pour les graduations et les filets, jamais pour du texte). Toi = bleu `#4C80FF` (texte `#7FA4FF`), les autres = ambre `#FFB547` (texte `#FFC874`), vert `#3DD68C` seulement pour live / ouvert. Le bouton primaire est un bleu un peu plus profond (`#3868E6`) pour que son texte blanc passe AA. Un résultat n'a jamais de couleur. `color-scheme: dark`, themeColor `#0D1017`.
- **Profondeur sans effet** : carte = surface, filet 1 px, rayon 16, un reflet haut à peine visible (`inset 0 1px 0 rgba(255,255,255,.04)`) et une ombre neutre douce (`0 20px 40px -24px rgba(0,0,0,.6)`). Aucun décalage plein, aucune lueur colorée, aucun texte en dégradé, aucun verre ni flou (l'en-tête est un `--bg-2` à 92 %, sans flou), aucune texture. Le seul dégradé du site est le vignettage radial derrière le tambour, dans la scène du héros.
- **Type** : Geist (titres 600, approche −0,02 à −0,035 em, casse de phrase, jamais d'italique ni de capitales) et Geist Mono pour tous les chiffres, commandes, slots et graines (chiffres tabulaires). Les seules capitales sont de petits kickers en mono (11–12 px, +0,08 em). Fichiers woff2 latin d'origine de Google Fonts dans `public/fonts` ; Barlow et Inter sont retirés.
- **Boutons** : primaire bleu, texte blanc, rayon 12, 44 px (36 en petit), reflet haut 1 px, survol plus clair, appui = échelle 0,98. Secondaire = carte 2 + filet 2. Puce de commande en Geist Mono, rayon 8. Icônes lucide à 1,75 px (la pièce de monnaie est retirée du jeu d'icônes).
- **Chat** : un vrai chat de stream sobre : un point à la couleur du joueur, le nom, la commande en Geist Mono ; les lignes système et le bot dans des panneaux intérieurs discrets.
- **Mouvement** : entrées de section en GSAP (montée de 12 px + fondu, décalage 60 ms, une seule fois), rien sous reduced-motion.

**Le tambour 3D (`components/drum/`)** : three.js via react-three-fiber 9 et drei 10, chargé côté client seulement. Une cage sphérique en acier brossé (six méridiens, cinq parallèles, deux flasques), deux paliers sur deux chevalets en A posés sur une plaque, une manivelle à droite avec un bouton laqué, une goulotte en fil avec un clapet sur le dessus, et devant, le rail ×0 … ×2 (deux tiges, cinq graduations). Les boules sont des MeshPhysicalMaterial avec vernis, ambre pour les autres, bleu (un peu plus grande) pour toi, avec les initiales du joueur sur deux pastilles. Lumière : RoomEnvironment par PMREM (aucun HDR téléchargé), une clé, un contre-jour, une ombre de contact sous le pied. Comme le cube de floored, l'objet est toujours un peu vivant : la cage tourne doucement, les boules se posent (une petite physique sphère-dans-sphère maison), tout l'objet pivote vers le pointeur (amorti, ordinateur seulement), le défilement du héros le fait tourner, et on peut tirer la manivelle. La manche le pilote, rien n'est scénarisé : chaque entrée tombe par la goulotte ; à la fermeture la cage se bloque et le clapet se ferme ; la graine tombe sur le clapet, puis la cage fait UN tour net en `cubic-bezier(0.77, 0, 0.175, 1)` ; ensuite chaque boule roule sur le rail à son multiplicateur réel (la loi du sdk), toutes à la même taille, LOWEST, HIGHEST et YOU à la même taille. Les étiquettes sont du HTML en Geist Mono placé par projection. Le canevas ne tourne que visible (IntersectionObserver, onglet visible), dpr entre 1 et 2, 60 boules au plus. Pendant le chargement, sans WebGL et sous reduced-motion : l'affiche `public/drum-poster.webp`, rendue depuis la même scène, et un rail plat avec chaque sac à sa place exacte.

**Le même monde ailleurs** : l'écran de chargement montre une seule boule bleue qui tourne (même matière) ; « How a round plays » a un petit accent 3D : une boule roule sur le rail et s'arrête à sa place. Deux contextes WebGL légers au plus en même temps sur la page, chacun en pause hors écran.

**Logo** : même composition (cage ronde, manivelle et bouton, pied, deux boules ambre et une bleue plus grande), traits affinés (2,8 pour la cage et la manivelle, 2,4 pour le pied), un méridien et l'équateur en filet léger pour lire une sphère en fil ; le mot PULLED en Geist SemiBold converti en tracés. Le site utilise la version pour fond sombre. `/brand` montre le résultat, les couleurs et les deux familles.

**Règles qui restent dures** : un résultat n'a jamais de couleur bonne ou mauvaise ; le plus bas et le plus haut ont toujours la même taille ; la phrase de la somme conservée reste visible et ne se ferme pas ; rien qui rappelle un casino (pas de machine à sous, pas de pièces, pas de néon, pas de promesse de gain).

## v18 — Ladle

Retour du propriétaire sur la v17 (« game night », violet et rose néon) : il aime le côté festif (« garde-le »), mais le site « fait trop IA » et le logo aussi ; il veut un vrai logo pro utilisable sur tous les réseaux et un nouveau nom. Le nom est **Ladle** (la louche) : une seule marmite pour tout le monde, la louche sert les portions. Même prix pour tous, pas la même louchée. Mécanique inchangée (92 slots ≈ 20 s, une graine ORAO VRF, un seul achat sur la courbe partagé, somme conservée exactement, 1,00 % à l'entrée, 0 à la revente, plafond 20 % par entrée).

**Ce qui faisait IA en v17, retiré** (audit fait avant de toucher, sur `screenshots/v17/`) : la palette violet / rose néon et la brume violette ; les boutons roses qui brillent ; les halos colorés et les taches radiales derrière chaque section ; le soulignement dégradé sous le titre ; les stickers penchés collés pour décorer (0 FEE TO SELL BACK, LOCKED, PRACTICE ROUND) ; la barre d'emojis et les « 🎉 dropped in » répétés ; les pastilles-kickers génériques (LIVE DEMO ROUND, 01 HOW IT PLAYS…) et les numéros de section ; Unbounded ; les grilles de cartes identiques avec tuile d'icône ; tout centré dans les mêmes boîtes arrondies ; l'inclinaison 3D des cartes au survol ; les boules qui flottent en boucle dans le pied de page ; les micro-textes de remplissage.

**Copie** : « PULLED » → « Ladle » partout où on lit ; le titre « Same price for everyone. Not the same scoop. » ; la phrase de la marmite conservée, toujours visible, jamais refermable : « The pot is conserved. For someone to get a bigger scoop, someone gets a smaller one. That someone can be you. The house neither wins nor loses on the draw. » (héros, sous le tableau de résultats, dans l'embed). Commandes du chat : `!scoop <SOL>` (remplace `!pull`), `!odds`, `!pot` (remplace `!sum`), `!verify <round>`, `!sell` ; les anciennes répondent encore. Le bot s'appelle « Ladle ». `config/brand.ts` : name Ladle, domain useladle.fun, xHandle `ladlefun` (TODO conservé), tagline et secondLine ; clés d'assets `mark`, `wordmark`, `markLight`, `wordmarkDark`, `avatar`, `banner`. Le paquet `@pulled/sdk` et ses imports ne changent pas (côté chaîne, plus tard).

**Couleur, un dîner la nuit** : fond charbon chaud `#15110E`, fond 2 `#1C1713`, carte `#221C17`, carte 2 `#2B241E`, filets `rgba(246,238,227,.08)` ; encre crème `#F6EEE3`, encre 2 `#CFC3B3`, encre 3 `#9C8F80` (5,9:1 sur le fond, 4,9:1 sur carte 2 : AA). Tomate `#FF5A36` = la marque et l'action primaire ; le texte crème sur tomate ne passe pas AA (2,7:1), donc le bouton primaire porte du charbon `#16120F` (6:1). Safran `#FFB21A` = le seul accent (chiffres des étapes, graphiques, curseurs, focus). Six couleurs de joueurs (tomate, safran, sarcelle `#2EC4B6`, ciel `#5AA9FF`, menthe `#7ED957`, prune `#C77DFF`) pour les boules, avatars, noms du chat et confettis : une identité, jamais un résultat. Toi = anneau crème + étiquette YOU. Live = le point menthe seul. Résultats en crème neutre, tous à la même taille. Aucun néon, aucune ombre lumineuse, aucun texte en dégradé, aucun verre, aucune brume. Le seul dégradé du site est la flaque de lumière chaude derrière la scène 3D. Un seul thème (sombre), `color-scheme: dark`, themeColor `#15110E`.

**Type** : Bricolage Grotesque (titres 700–800, taille optique, approche serrée, casse de phrase ; le woff2 latin d'origine de Google Fonts dans `public/fonts`, jamais re-découpé), Geist (texte, interface), Geist Mono (chiffres, commandes, slots, graines). Unbounded est retiré.

**Composition** : on casse le « tout dans des cartes arrondies identiques ». Les cartes ne tiennent qu'un objet (la scène, le chat, une manche, un graphique, le simulateur, l'embed). Ailleurs : mise en page éditoriale, filets, colonnes asymétriques, bandes pleine largeur sur le fond 2, chiffres comme typographie. Rayon 14 au plus, filets chauds 1 px, aucune ombre sauf une ombre neutre douce sous l'interface flottante (autocomplétion, bulles). Aucun libellé au-dessus d'un titre, aucun numéro de section ; le numéro n'apparaît que là où l'ordre compte (les quatre étapes d'une manche).
- **Héros** : le titre en très grand sur deux lignes, la phrase de la marmite, une ligne de faits (fee on entry, fee to sell back, cap per entry, slots) sous un filet ; puis le stream (scène + chat), puis le tableau de résultats.
- **How a round plays** : la manche se lit comme un menu, quatre « plats » en rangées filetées : le chiffre en Bricolage safran, le titre, une phrase, un chiffre réel en mono, une image fixe du tambour.
- **Chat commands** : sur la bande, le titre à gauche (collant), une rangée par commande à droite : la touche, ce qu'elle fait, la réponse du bot citée, « Send it ».
- **What the house cannot do** : les actions impossibles barrées en tomate sur deux colonnes, et à côté les trois frais en très grands chiffres de même taille (1.00 %, 0, 0).
- **The latest rounds** : une liste filetée, le numéro de manche en grand, une rangée de points aux couleurs des joueurs, entrées, pot, plus bas et plus haut à la même taille, « Verify ».
- **Intégration** sur la bande ; **Questions** : le titre à gauche, les réponses à droite.
- Pages intérieures : même tête (h1, une phrase ; les étiquettes d'état sous la phrase, jamais au-dessus du titre), mêmes filets ; les grilles de cartes « 1 2 3 » d'odds et de security deviennent une liste de prose numérotée, les cartes des checks, de l'architecture, des risques et des invariants deviennent des rangées filetées.

**Festif, sans faire IA** : la palette chaude, les boules colorées, les avatars qui apparaissent dans la bande « In this round », le compte à rebours segmenté (passé en safran, les 10 derniers pulsent en tomate), les sons (coupés par défaut), le confetti aux six couleurs quand la manche se règle (pour la manche entière, jamais pour un joueur), et le moment SEALED refait en tampon typographique net : droit, « Sealed » en Bricolage 800 entre deux filets crème, « slot 92 of 92 · no entry, no exit » en mono dessous. Les réactions emoji sont retirées (elles ne gagnaient pas leur place) ; une seule ligne de chat par entrée : le nom coloré, `!scoop 0.25`.

**Le tambour 3D** : même mécanique (inclinaison au pointeur, rotation au défilement, manivelle à tirer, le tour décisif, rail ×0 → ×2, repli reduced-motion avec l'affiche régénérée, pause hors écran). Nouvelle finition : cage en cuivre-laiton brossé, paliers et pied en bronze sombre, socle et table en noyer (grain procédural, aucun téléchargement), bouton de manivelle en céramique crème ; une lampe chaude au-dessus dont la flaque tombe sur la table, une clé chaude, un contre-jour froid. Plus d'anneau LED, plus de projecteurs colorés, plus de faisceaux, plus de boules flottantes. Boules aux six couleurs des joueurs, initiales sur deux pastilles crème. `public/drum-poster.webp` et les quatre images `public/art/*.webp` sont re-rendues depuis la scène (`scripts/render-art.mjs`).

**Logo (dessin final)** : sur une boîte de 100, un seul tracé fusionné pour la louche (`M24 18.5 A6.5 6.5 0 0 1 37 18.5 V60 H82 A29 29 0 0 1 24 60 Z` : un manche à bout rond qui coule dans un bol en demi-disque, qui se lit aussi comme un « l ») et un cercle pour la louchée posée sur le bol (`cx 62, cy 47, r 11`), centrage optique `translate(-3 0)`. Trois déclinaisons : (a) louche crème + boule safran sur charbon, la principale, avatar X ; (b) louche crème + boule charbon sur tomate, avatar alternatif ; (c) louche charbon + boule tomate sur crème, clair et impression. Wordmark : la marque + « ladle » en Bricolage Grotesque 800 bas-de-casse, converti en tracés (opentype.js, le TTF variable du dépôt google/fonts dans `scripts/fonts`, OFL, dont l'instance par défaut est opsz 96 / wght 800) ; marque = 1,6 × hauteur d'x, espace = 0,35 × la marque, le bas du bol sur la ligne de base. `scripts/make-brand.mjs` écrit dans `public/brand/` : `ladle-mark.svg`, `ladle-mark-light.svg`, `ladle-mark-1024.png`, `ladle-wordmark.svg`, `ladle-wordmark-dark.svg`, `ladle-avatar-400.png`, `ladle-avatar-1000.png` (marque à 62 % du côté, centrée pour le recadrage rond), `ladle-avatar-tomato-1000.png`, `ladle-banner-1500x500.png` (wordmark, slogan, les six boules servies le long d'un filet en bas, le bloc hors du coin bas-gauche couvert par l'avatar), et `app/icon.png`, `app/apple-icon.png` ; `make-og.mjs` l'image Open Graph 1200 × 630 ; `app/manifest.ts` le manifeste. Les anciens fichiers `pulled-*` sont supprimés. `/brand` montre tout avec les téléchargements.

**Règles qui restent dures** : un résultat n'a jamais de couleur bonne ou mauvaise ; le plus bas et le plus haut ont toujours la même taille ; pas de podium ni de classement qui célèbre le plus haut (ordre d'arrivée) ; la phrase de la marmite conservée reste visible et ne se ferme pas ; rien qui rappelle un casino ; aucune invitation à rejouer après un mauvais tirage. `tests/forbidden-words.ts` passe.

**Pré-vol v18** : build, typecheck, forbidden-words, tests/props ; aucun débordement horizontal à 320 / 375 / 768 / 1024 / 1280 / 1440 sur chaque route ; grep : aucun `gradient(` hors la flaque de la scène, aucune ombre lumineuse, aucun Unbounded, aucun « PULLED » / « !pull » dans la copie visible ; WebGL sous Edge headless (SwiftShader) sans erreur console. Captures dans `app/screenshots/v18/` (`node screenshots/shoot-v18.mjs all`).

## v20 - the game hall

**En bref.** Le site devient une salle de jeu : un hall feutré (velours bordeaux, noyer, laiton, feutre vert pétrole), le tambour en laiton qui tourne au centre sous un projecteur, et autour les vrais joueurs de la manche, chacun un petit animal cube (Kenney Cube Pets, CC0) avec une écharpe à sa couleur et son nom. On arrive, on tape un pseudo, PLAY, on connecte son wallet, on choisit son personnage, on prend place. Le chargement « Lights up » montre le logo en laiton sous le projecteur, le mot « ladle » qui se remplit comme une soupe et 92 graduations (une par slot), puis les rideaux s'ouvrent sur la salle. L'envie d'y être vient de faits vrais et visibles : la vraie courbe (l'achat de chaque manche la monte, chaque vente la descend), les comptes ouverts, les profils Genesis numérotés, les hôtes fondateurs, chaque manche recalculable. Aucune promesse, aucune machine à sous, aucun résultat coloré. Le reste de cette section est en anglais, pour l'agent qui construit.

Mechanics unchanged: everyone pays the same price into a short round (92 slots, about 20 s); one ORAO VRF seed splits the round's single bonding-curve buy; the sum is conserved exactly; the house neither wins nor loses on the draw; sell back at curve price, 0 fee; 1.00 % platform fee on entry; 20 % cap per entry; host fee up to 3 % only through an integration. Chat commands `!scoop 0.25`, `!odds`, `!pot`, `!verify`, `!sell`.

### 1. Verdict and what was merged

Panel totals: **The Brass Room 23** (8.5, 7.5, 7), One Drum 21, The Ladle Hall 21. The Brass Room is the base: one warm private game hall, the drum glowing dead centre under a spotlight on a felt stage, the players standing around it with name pills, one centred PLAY card, a fixed conserved-sum bar. Grafts: from One Drum the 92-tick slot clock, the brass floor ticker, the curve section layout, square chrome, the entry receipt, the "Your scoop" card with equal Sell back / Keep; from The Ladle Hall the FOMO word-fill loader with a peeking character and parting curtains, the "Watch a round" path, the honest empty state, the reveal with an exact SOL sum line. Mockup references: `app/screenshots/v20/concepts/arcade-hall/01-loading.png` to `06-mobile-game-room.png` (mood and layout), `io-lobby/07-below-curve.png` (curve section), `fomo-family/01-loading.png` (loader word fill and peek). The mockups are mood boards: their characters, drum shape, logo and small text are NOT the build reference. This section is.

Contradictions, resolved:

| Topic | Options on the table | Decision |
|---|---|---|
| Player characters | clay toys (Brass mockups, no asset makes them); ball-in-bowl Scoops (misread as egg cups); port of PonsDonate `gen.js` voxels (rig-less rewrite) | **Kenney Cube Pets** (CC0, already in `app/public/assets/models/kenney-cube-pets/`, 24 species, 8 clips each, 400 to 950 triangles, about 45 KB each) with a procedural scarf in the player's identity colour. Voxel family of PonsGift, real animation clips, one style on the stage. |
| Hall staff | Higgsfield bear, fox, frog, cat as players or as staff | Staff only, never on the stage ring, never at player scale: bear host beside the crank, fox bellhop at the left door. Frog crooner and cat usher appear only in pre-rendered stills (How it plays, /brand). |
| Drum | horizontal glass barrel (mockups) or the app's spherical cage | The app's **spherical cage** (DrumSim physics already written) in brass, mounted between the hubs of `drum-cradle-tripo.glb`. A thin glass shell on the high tier only. |
| Loader progress | 12 segments, 92 ticks, word fill | Word fill (the wordmark filling like soup) plus a 92-tick bar and a "64 / 92" counter, all driven by the same real progress. |
| Loader emblem | `ladle-emblem-tripo.glb` or an extrusion of the SVG | Extrusion of `ladle-mark.svg`. The Tripo emblem is off-brand (curved stem, red ball) and is not shipped. |
| Fonts | Dela + Bricolage + Geist Mono; Alfa Slab; Dela + Zen Maru + JetBrains | **Dela Gothic One + Bricolage Grotesque + Geist Mono.** Geist (sans), Zen Maru Gothic and Alfa Slab are not used. |
| Radius | 16 to 24 px; 2 px; pills | 4 px chrome with brass corner ticks; pills only for things that live in the world or the top bar (name tags, live strip, nav pills, seed chip). |
| Genesis | cap 1,000 or 5,000; "x left" or "x claimed" | Cap 1,000, phrased "**412 / 1,000 claimed**" (no scarcity push). On the left rail and in the profile step, not on the PLAY card. |
| Founding hosts | 50 or 25 | First **25** integrations. |
| "214 in the hall" presence count | show or not | Not shown: there is no presence service, so the number would be invented. |
| Glow | volumetric cone, 200 motes, bloom, DOF, vignette, pedestal glow | One additive spotlight cone, at most 120 dust motes, emissive lamps with sprite halos, a CSS vignette. No post-processing pass, no depth of field (a dim veil behind modals), no ring glow (the selected pedestal gets its own small spotlight). |
| Warmth | string lights, violet dusk windows, paper lanterns | Ten brass wall lamps, two hanging lanterns over the doors, the spotlight. No violet anywhere, no string lights. |
| Stake on the home card | stake chips on the card or not | Home card = nickname + PLAY (slither read). The fine print answers cost ("You choose your entry in the room · 1.00 % fee on entry ..."). Stakes live in the game room dock. |
| Head tags at the reveal | x multipliers or LADLE | LADLE amount in cream. The x multiplier appears only in the result panel and the Your scoop card, next to its SOL value. |
| Results layout | equal tiles or a table | 8 players or fewer: equal tiles. More than 8: a ruled list. Both in arrival order. |
| `?host=` on the main room | adds a host fee or not | Main-room host links carry no fee (credit only, labelled "not tracked yet on chain"). A host fee exists only in a host room `/h/{handle}`, which is a market created through that host's integration (program constraint: one integration per market). |
| Confetti | v18 round confetti | Retired everywhere. |
| Rail x0 to x2 under the drum | keep or not | Retired from the hall (it lays results out by size). `/window/[id]` keeps a neutral chart. |
| Live dot | mint | Saffron. Green never means good or live; mint is only a player colour. |
| "You" ball | 15 % larger (v16) | Same size as everyone; your ball carries a cream band. |

### 2. Honesty rules (verbatim) and the casino line

> HONESTY RULES (must hold): a result never gets a good/bad colour (no green/red/gold for best/worst); worst and best always shown at the same size; no podium/ranking celebrating the highest results; the conserved-sum sentence ("The pot is conserved... The house neither wins nor loses on the draw.") stays visible and is not dismissable on the home and the game; copy never promises gains or price rises (no "win big", "jack·pot", "guaran·teed", "free·money", "will pump", "to the moon", "100x"); no mechanics pushing re-entry after a bad draw (no·loss-chasing prompts, no streak rewards). node --experimental-strip-types tests/forbidden-words.ts (from the root) must pass.

(The three words the gate bans, and the first two words of "no·loss-chasing", are written with a middle dot only so that this file passes the gate, which scans `docs/`. Read them without it. The rule is otherwise verbatim.)

> AGREED LINE: premium game hall (velvet dark, brass/gold trim, warm spotlights, deep felt tones allowed, the drum as the glowing centrepiece) but NO slot machines, NO chip stacks or money rain, NO gain/pump promises. Bullishness comes from TRUE, visible facts and good product.

Applied on every screen:
- Every result number (LADLE amount, x multiplier, SOL value) is `--ink` cream, Geist Mono, at the same size as every other result on that screen. The smallest and the largest are always shown together, same size, same weight, same neutral label style.
- Results are listed in arrival order, never sorted. No podium, crown, "top" list, leaderboard of scoops, holders, sellers or hosts by fees. Every list is in time order.
- Identity colours (teal, sky, mint, plum, tomato, saffron) appear only on scarves, balls, chat names, the thin top stripe of a result tile and portrait scarves. A value is never coloured. "You" is a cream outline and a YOU label.
- Brass is the room and its chrome. It never marks a result. Gold, green and red never code good or bad. Status checks ("connected", "available", "you're in") are cream checks, never green.
- One identical chime, one identical catch animation, one identical tag flip for every result. No confetti, fireworks, flashing lights, coin or cheer sounds. The share button is identical in place, size and copy for every result.
- After any result: no "play again", "next round", "try again" or "win it back" control in the result panel. The next round shows only in the HUD. No streaks, daily bonuses or loss-recovery offers.
- The sentence `BRAND.secondLine` ("The pot is conserved. The house neither wins nor loses on the draw.") is real HTML in a fixed bottom bar on `/`, `/play`, `/h/[handle]` and the embed, never dismissable, never collapsible, present on phones; it is repeated on the loader, in the result panel, in the footer and on every scoop card.
- All fees show before every entry: 1.00 % platform, host fee (0 % in the main room, written out), 20 % cap per entry, 0 fee to sell back.
- The curve chart is real data, linear axis, all rounds by default, sells drawn as down-steps in the same colour as buys, and always carries "Past prices, read from the curve. Not a forecast."
- Genesis and founding hosts are recognition only and say so. No points, airdrops, allocations, extra shares or fee discounts are hinted.
- Every number is real or wears the DEMO DATA chip. No fake timers, fake crowds, padded activity or real streamer and brand names in demo data.
- Casino line: allowed are velvet, walnut, brass, felt, warm spotlights, one drum, friendly characters. Never slot machines or reels, chips or chip stacks, card tables, dice, roulette, coins or coin-like gold discs, banknotes, money rain, trophies, podiums, "WIN" or "BIG WIN" signage, prize wheels, claw machines, jack·pot meters, sirens. The `kenney-mini-arcade` cabinets stay out of the hall.

Copy gate. `tests/forbidden-words.ts` does not match "win big", "will pump", "to the moon" or "100x". Add `app/scripts/copy-lint.mjs` (the gate does not scan `.mjs`, so the list can live there), run it in `prebuild`, and make it fail on the full avoid list in user-visible copy: every string in `app/i18n/en.ts` and `config/brand.ts`, and JSX text and string literals rendered in `app/app` and `app/components` (comments and identifiers are not copy; whole words, case-insensitive, with an allowlist for "neither wins nor loses" and the `win.*` i18n keys): pump, moon, to the moon, 100x, x100, 10x, LFG, wagmi, send it, ape in, gem, alpha, jack·pot, win big, win·ner, you'll w·in, chance·to win, guaran·teed, risk·free, no·loss, free, free·money, passive income, profit, earn, number go up, still early, get in early, be early, don't miss out, last chance, before it's too late, before the price goes up, gratu·it. (Same middle-dot note.) Prices and results are never projected: no target prices, no "price after this round", no ROI or APY, no hindsight calculators, no unrealized gain figures, no market cap or FDV hero numbers, no listing or graduation bar.

### 3. Design tokens

Replace the `:root` block of `app/app/globals.css` with:

```css
:root {
  /* UI surfaces */
  --bg: #16120F;                    /* page, loader, top bar */
  --bg-2: #1E1612;                  /* bands below the fold */
  --panel: rgba(22, 18, 15, 0.90);  /* HUD panels over the hall (desktop, with blur 8px max) */
  --panel-solid: #1B1512;           /* modals, mobile sheet, result panel: nothing shows through */
  --inset: #241B16;                 /* inputs, inner rows, bot lines in chat */
  --inset-2: #2E231C;               /* hover, selected chip fill */
  --line: rgba(246, 238, 227, 0.10);
  --line-2: rgba(246, 238, 227, 0.18);
  --line-brass: rgba(201, 154, 75, 0.40);   /* 1px hairline of every panel */
  /* brass: the room's frame and the UI chrome, never a result */
  --brass: #C99A4B;      /* trims, hairlines, selected chip outline, Genesis plate (7.0:1 on --bg) */
  --brass-hi: #F0CB7E;   /* specular, corner ticks, focus ring */
  --brass-lo: #7A5A2B;   /* brass in shadow, unlit ticks */
  /* ink */
  --ink: #F6EEE3;        /* all text and every result number */
  --ink-2: #CFC3B3;      /* secondary text */
  --ink-3: #9C8F80;      /* labels, meta (5.7:1 on --bg) */
  --ink-4: #5E5349;      /* rules, disabled, never text */
  /* accents */
  --tomato: #FF5A36;  --tomato-hover: #FF7352;  --on-tomato: #16120F;  /* the one primary action; charcoal text 5.8:1 */
  --saffron: #FFB21A;    /* logo ball, live dot, countdown and loader ticks, chart line, "now" dot; never a result */
  --live: var(--saffron);
  --focus: var(--brass-hi);
  /* identity: scarves, balls, chat names, tile stripes, portrait scarves only */
  --p-tomato: #FF5A36; --p-saffron: #FFB21A; --p-teal: #2EC4B6; --p-sky: #5AA9FF; --p-mint: #7ED957; --p-plum: #C77DFF;
  /* the room: 3D materials, CSS curtains and the loader only; never a UI fill, never on a result */
  --hall: #1E1612; --oxblood: #4A1418; --oxblood-hi: #6E1F24;
  --walnut: #3A2618; --walnut-hi: #5A3A22; --felt: #12352F; --felt-hi: #1D4A42;
  --spot: #FFE2A8;       /* spotlight and glass glow: a light, never a fill */
  --lamp: #FFC46B;       /* wall lamps and lanterns (emissive) */
  /* shape */
  --r-1: 2px; --r-2: 4px; --r-pill: 999px;
  --float: 0 18px 40px -16px rgba(0, 0, 0, 0.7);   /* modals, receipt, result panel only */
  /* spacing (4 px base) */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 120px;
  --inset-hud: 24px;     /* 16px under 768px */
  --bar-h: 40px;         /* the conserved bar */
  --top-h: 64px;         /* 56px under 768px */
  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);         /* UI enter */
  --ease-quart: cubic-bezier(0.25, 1, 0.5, 1);    /* panels */
  --ease-mech: cubic-bezier(0.77, 0, 0.175, 1);   /* the decisive turn */
  --ease-curtain: cubic-bezier(0.7, 0, 0.2, 1);
  --dur-1: 140ms; --dur-2: 220ms; --dur-3: 360ms;
  color-scheme: dark;
}
```

`themeColor` becomes `#16120F`. The v18 tokens `--card*`, `--stage`, `--sa`, `--teal`... are aliased for one release (`--card: var(--panel-solid)` etc.), then removed. `lib/colors.ts` keeps `PLAYER_COLORS` and `playerColor()` unchanged.

**Type.** Three families, each the original Google Fonts latin woff2 in `app/public/fonts/`, loaded with `next/font/local` in `app/app/layout.tsx`, `display: swap`:
- `dela-gothic-one-latin.woff2` (already present; keep it only if byte-identical to the latin file Google Fonts serves for Dela Gothic One 400, otherwise re-download that file) as `--font-display`. The latin subset covers French accents (U+00C0 to U+00FF).
- `bricolage-grotesque-latin.woff2` (present, variable 200 to 800) as `--font-ui`.
- `geist-mono-latin.woff2` (present) as `--font-mono`.
- Remove the Geist sans `localFont` and delete `geist-latin.woff2` and the three `zen-maru-gothic-*.woff2` files.
- For `next/og` cards, satori needs TTF: put the original OFL TTFs of Dela Gothic One and Geist Mono in `app/scripts/fonts/` (not under `public/`).

| Role | Face | Size / line-height | Notes |
|---|---|---|---|
| Card headline (home) | Dela 400 | 40/1.02 desktop, 28/1.04 phone | tracking -0.01em, `text-wrap: balance`, always exactly 2 lines |
| Section title, inner H1 | Dela 400 | clamp(32px, 4.4vw, 64px)/1.02 | never more than 2 lines |
| Modal title | Dela 400 | 36/1.05 (28 phone) | "Pick your character", "Connect a wallet" |
| Countdown digit | Dela 400 | 40 in the dial (18 phone) | slots left, tabular via `font-feature-settings: "tnum"` |
| PLAY label | Dela 400 | 20, uppercase, +0.02em | home card only |
| Panel title | Bricolage 600 | 16/1.3 | "LADLE curve", "Round chat" |
| Body | Bricolage 400 | 15/1.5 (16 below the fold) | |
| Lead | Bricolage 400 | 17/1.5 | below-the-fold intros |
| Button | Bricolage 600 | 16 | all buttons except PLAY |
| Conserved sentence | Bricolage 500 | 14 (13 phone) | |
| HUD label | Geist Mono 500 | 11, uppercase, +0.08em | ROUND, POT, SLOTS LEFT |
| HUD number | Geist Mono 500 | 13 | `tabular-nums` on every number |
| Name tag, chat | Geist Mono 500 | 12 | |
| Large figure | Geist Mono 500 | 20 (receipt totals, price now) | results use the same size as each other on a screen |

Dela is never below 18 px and never used for a result. The wordmark and mark are always the SVGs in `app/public/brand/` (never typeset, never redrawn, never given a face).

**Shape and frames.**
- Panels, modals, sheets, tiles, buttons, inputs and chips: radius `--r-2` (4 px). The mobile sheet keeps 4 px top corners.
- Pills (`--r-pill`) only for: name tags, the live strip, top-bar nav pills, the seed chip, the source chip.
- Every HUD panel and modal has the **brass frame** (`.frame`): a 1 px `--line-brass` border with the 4 px radius, plus four 8 px L-shaped corner ticks in `--brass-hi`, drawn on a `::after` (`inset: -1px`, `pointer-events: none`) with eight 1 px `linear-gradient` background layers (two per corner), so the ticks never fight the radius.
- Backdrop blur: at most 8 px, desktop HUD panels only. Phones use `--panel-solid`.
- Shadows: `--float` on modals, the receipt and the result panel only. No glow shadow, no gradient text, no glass sheen.
- Focus ring: 2 px `--focus`, offset 2 px, on every interactive element.

**Spacing.** 4 px base (`--s-*`). HUD inset 24 px desktop, 16 px phone. Panel padding 16 px (HUD), 24 px (modals). Gaps 8 / 12 / 16. Phone side gutter 16 px; no horizontal scroll at 320, 375, 768, 1024, 1280, 1440.

**Breakpoints.** Phone < 768 (sheet layout), tablet 768 to 1023 (rails move below the fold), desktop >= 1024, wide >= 1440 (rails 300 px).

**Layers (z-index).** canvas 0; scroll veil 1; world tags 2; HUD 10; dock, receipt, result panel 20; modals and sheets 40 (their veil stops above the conserved bar); conserved bar 50; toasts 55; loader 60.

### 4. Architecture

Routes:
- `app/(hall)/layout.tsx`: `LiveProvider`, `ProfileProvider`, `<HallCanvas/>` (fixed, full viewport, **mounted once and kept** while navigating between `/` and `/play`), `<Loader/>`, `<TopBar/>`, `{children}`, `<ConservedBar/>`.
- `app/(hall)/page.tsx`: home HUD (section 7) and below the fold (section 12).
- `app/(hall)/play/page.tsx`: game room HUD (section 9). `?watch=1` opens it as a spectator.
- `app/(hall)/h/[handle]/page.tsx`: host room (P2).
- `app/(site)/`: `/odds`, `/window/[id]`, `/integrate`, `/security`, `/brand`, `/about`, plus `/stats` and `/profile` (P2). No 3D canvas on these pages.
- `app/embed/[mint]/page.tsx`: compact room for hosts.
- `app/(site)/window/[id]/card/route.tsx`: 1200 x 675 scoop card, `next/og` (P2).
- `app/app/layout.tsx`: the three fonts, `<WalletProviders>`, and an inline head script that sets `document.documentElement.dataset.loaded = "1"` when `sessionStorage["ladle.loaded"]` exists (try/catch), so the server-rendered loader never flashes on repeat visits.

Each route is a **camera shot** on the one persistent canvas (section 11), not a remount.

New components, `app/components/hall/`:
- `HallCanvas.tsx`: R3F `<Canvas>`, quality tier, frame loop control (pause when the tab is hidden, 15 fps below the fold), poster fallback.
- `HallScene.tsx`: room shell, props, lights, fog. `kit.ts` and `round.ts` move here from `components/world/`.
- `DrumAssembly.tsx`: cradle GLB, brass cage, glass shell, balls, chute, seal latch; folds in the ball, drop and spin logic of `drum/DrumScene.tsx` and keeps `drum/drum-sim.ts`, `drum/parts.ts`, `drum/materials.ts`.
- `Ladle.tsx`: the extruded brand ladle (loader emblem and reveal server).
- `Cast.tsx`, `pets.ts` (species table, scarf anchors, scales), `seats.ts`: characters.
- `Staff.tsx`: bear host and fox bellhop.
- `FloorTicker.tsx`: the brass ticker band.
- `Tags.tsx`: DOM name tags projected from 3D.
- `CameraRig.tsx`, `shots.ts`.
- `hud/`: `TopBar`, `LiveStrip`, `TickBar`, `Dial`, `SourceChip`, `SoundToggle`, `PlayCard`, `BooksCard`, `GenesisCard`, `CurveCard`, `ActivityRail`, `Dock`, `Receipt`, `InChip`, `SealStamp`, `SeedLine`, `ResultPanel`, `YourScoop`, `ShareDialog`, `ConservedBar`.
- `profile/`: `ConnectSheet`, `ProfileModal`, `PetPicker`, `AvatarPill`.
- `sections/`: `CurveSection`, `WhyCurve`, `HowItPlays`, `OddsSection`, `BooksSection`, `RecomputeSection`, `HostBand`, `GenesisSection`; `fx/Faq.tsx` is reused.
- `app/components/wallet/`: `WalletProviders.tsx`, `ChainBridge.tsx`.

Reused as is or restyled: `game/useRoundChat.ts`, `game/Chat.tsx` (restyled), `game/RollingNumber.tsx`, `game/types.ts`, `PastDistribution.tsx`, `WindowDetail.tsx`, `sim/Simulator.tsx`, `lib/sfx.ts` (extended), `lib/law-settle.ts`, `lib/format.ts`, `lib/colors.ts`.

Data (all through `getDataSource()`; `app/lib/data/chain.ts` is not edited, only imported):
- `types.ts` gains:
  ```ts
  export interface CurvePoint { kind: "buy" | "sell"; round: number | null; at: number; before: number; after: number; /* spot price, SOL per 1M LADLE */ roundPrice: number | null; /* toCurve / tokensOut */ tokens: bigint; sol: bigint; players: number | null }
  export interface ActivityItem { id: string; at: number; kind: "join" | "close" | "seed" | "served" | "sellback" | "sell" | "milestone"; round?: string; name?: string; sol?: bigint; tokens?: bigint; players?: number; min?: number; max?: number; seed8?: string; milestone?: { what: "rounds" | "players" | "sol"; value: number } }
  export interface Books { rounds: number; players: number; solEntered: bigint; solToCurve: bigint; platformFees: bigint; hostFees: bigint; keeperBounties: bigint; solSoldBack: bigint; solInCurve: bigint; ladleHeld: bigint; last24h: { hourStart: number; rounds: number; sol: bigint }[] }
  export interface GenesisCount { claimed: number; cap: number }
  export interface HistorySource { source: Source; getCurve(): Promise<CurvePoint[]>; subscribeActivity(cb: (items: ActivityItem[]) => void): () => void; getBooks(): Promise<Books>; getGenesis(): Promise<GenesisCount | null> }
  ```
- `app/lib/data/momentum.ts` (new, demo): a deterministic ledger that replays `plan(n)` from round 1 with `settle()` against an evolving curve starting at `DEMO_CURVE`, plus seeded sell-backs (sfc32 per round: about a third of entries sell back within the next 1 to 20 rounds via `curveSell`). Memoized; moved to a worker (the `sim.worker.ts` pattern) if the replay exceeds 50 ms. `mock.ts` `settledView` must take `curveBefore` from this ledger, so `/window/{n}` recompute and the chart agree.
- `app/lib/data/chain-history.ts` (new, chain): backfill through `getSignaturesForAddress(market)` and the sdk's `eventsFromLogs` (`WindowTallied`, `SoldBack`, `Sold`), `Market.curve` for the price now, `Market.nextSettleIndex` for rounds served. Until it is written it returns `null`.
- `index.ts` exports `getHistorySource(): HistorySource | null`. When it is null, the curve card, books card and activity rail are not rendered and their below-the-fold sections show "History is not read from the chain yet." No placeholder numbers.
- Price unit everywhere: SOL per 1M LADLE = `x * 1e3 / y` (x in lamports, y in 6-decimal base units). With `DEMO_CURVE` that is about 0.0280. Display with 4 decimals.
- `app/lib/profile.ts` (new): profile load/save per wallet, nickname validation, reserved names, demo Genesis ordinal (section 8).

Wallet:
- `pnpm --filter @pulled/app add @solana/wallet-adapter-react@0.15.40 @solana/wallet-adapter-base@0.9.28` with **exact** versions (both published 2026-09-10, more than two weeks old). Do not add `@solana/wallet-adapter-wallets` or `-react-ui`: Wallet Standard auto-detection covers Phantom, Solflare and Backpack, and the sheet is our own. Add `minimumReleaseAge: 20160` to `pnpm-workspace.yaml` so transitive packages (`@solana/wallet-standard-wallet-adapter-react`, `@solana-mobile/wallet-adapter-mobile`, `@wallet-standard/*`) also resolve to versions at least 14 days old; if the installed pnpm does not support the setting, check those lockfile entries' publish dates by hand.
- `WalletProviders.tsx`: `ConnectionProvider endpoint={process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet")}`, `WalletProvider wallets={[]} autoConnect` (reconnects only wallets the user approved before).
- `ChainBridge.tsx`: when `NEXT_PUBLIC_DATA_SOURCE === "chain"` and `chainConfigured()`, `useEffect` calls `setChainWallet({ publicKey, sendTransaction })` on connect and `setChainWallet(null)` on disconnect.
- Demo mode: entries always go to the demo source (`mockSource.enter`), whichever wallet is connected; the dock wears DEMO DATA.

### 5. The hall (the 3D world)

One round room, warm and dark, seen from above in three-quarter. Units are metres, y up, the home camera looks from +Z.

**Floor and stage.**
- Floor: disc r 16 at y 0, `WoodFloor064` (color, normalGL, roughness WebP 1024, repeat 8), color multiplied to about 55 % so the parquet stays dark.
- Gallery ring: `Marble016` black marble, annulus r 4.0 to 4.6 at y 0.01, roughness 0.25 (it catches the spotlight).
- Stage: plinth cylinder r 4.0, h 0.12, `--walnut`; stage cylinder r 3.6, h 0.36 (top at y 0.48), top in `--felt` with the `Fabric026` normal map (repeat 10, roughness 0.95); two brass torus trims (r 3.6, tube 0.035) at the top edge and at y 0.12; the vertical rim band (open cylinder r 3.61, h 0.30) carries the floor ticker.

**Drum assembly** (centre of the stage):
- `higgsfield/drum-cradle-tripo.glb` at scale 3.2 (3.2 m wide, 2.43 m tall), base on y 0.48, chute towards +Z.
- The existing cage (`cageGeometry()`, R = 1, axis X) scaled 0.77 and centred at the hub midpoint, cradle coordinates (-0.02, 0.66, -0.05), which is about (-0.06, 2.59, -0.16) in the hall. Measure the hubs once in the contact sheet and adjust. The v18 A-frame stand, base plate and walnut table are not rendered (the cradle replaces them). The top wire chute and gate from `chuteGeometry()` stay: balls still drop in from the top.
- Brass: `MeshPhysicalMaterial { color #C99A4B, metalness 1, roughness 0.22, envMapIntensity 1.1 }`. The cradle keeps its own textures; tint its metal to match if it reads coppery.
- Glass shell (high tier only): sphere r 0.985 R, `transmission 1, roughness 0.05, thickness 0.4, ior 1.5, attenuationColor #FFE2A8, attenuationDistance 2`.
- Balls: existing `glossBall` plus `ballTexture` (initials on two cream patches), colour = the player's identity colour, all the same radius `RB`. Your ball has a cream band painted by `drawBall`. `RB_ME` is retired. At most 60 balls (`MAX_BALLS`).
- Seal latch: a small brass bar (kit box) that drops across the gate at slot 92.

**The ladle** (`Ladle.tsx`): built from `ladle-mark.svg` with `SVGLoader`. The ladle path is extruded (depth 0.18, bevel 0.02, 3 bevel segments, total height 1.1 m) in the brass material; the scoop is a separate sphere in saffron `glossBall("#FFB21A")`. At rest it hangs upright as in the logo (handle up, bowl down), its rod (brass, r 0.015) fixed to the top of the handle and to the spotlight rig, with the bowl at y about 5.2 above the drum, just at the top of the home frame (tune by capture). It is the loader emblem and, at the reveal, the server (section 9).

**Room shell** (built with `kit.ts`, merged, vertex-coloured, one or two draw calls, ambient occlusion baked into vertex colours):
- A 24-sided wall ring r 13, h 7.5 (the home camera stands inside it): walnut panels (`--walnut`, 0.12 deep) with a 0.03 brass inlay frame; brass dado rail at 1.0 m; an `--oxblood` band above 4.6 m; ceiling at 7.5 m, dark `#0E0B09`.
- Curtain bays at azimuth 140, 180 and 220 degrees: `polypizza/curtains-double-quaternius.glb` scaled to 3.4 x 5.5 m, tinted `--oxblood` with the `Fabric026` normal map.
- Two arched doorways at 100 and 260 degrees: walnut jambs, a brass half-torus arch, a dark opening `#0B0907`, and `polypizza/lantern-hanging-kaylousberg.glb` above each (emissive `--lamp`).
- Eight `polypizza/column-quaternius.glb` at r 12.4 on the bay boundaries, scaled to 6 m, tinted `--walnut-hi`, with kit brass rings at base and capital.
- Ten `kenney-furniture/lampWall.glb` at y 3.2 between bays, body recoloured brass, shade emissive `--lamp` (intensity 2.2), each with a 0.6 m additive halo sprite from `glowTexture()` at opacity 0.35.
- Four booths in the gallery at azimuth +-60 and +-120 degrees, r 8: `polypizza/couch-small-quaternius.glb` tinted oxblood, `kenney-furniture/tableRound.glb` with a walnut top, `kenney-furniture/lampRoundTable.glb` (emissive). Two `polypizza/armchair-creativetrio.glb` (oxblood) by the doors, four `kenney-furniture/pottedPlant.glb` (leaves tinted `--felt-hi`).
- Six `higgsfield/stanchion-velvet-rope-tripo.glb` (simplified to 3k triangles or fewer) on r 4.4 from 120 to 240 degrees (the back half; the front stays open to the camera), rope tinted `--oxblood-hi`.
- The spotlight can `polypizza/spotlight-a-ipoly3d.glb` at (0, 7.2, 0.3), hung from the ceiling, pointing down at the drum.

**Staff** (`Staff.tsx`):
- Bear host, `higgsfield/bear-host-meshy-rigged-wave.glb`, simplified to about 5k triangles with `gltf-transform simplify` (keep the skin): on the gallery floor at (4.5, 0, -1.0), off the felt, on the crank side of the cradle (check which hub carries the crank wheel in the contact sheet and mirror if needed), turned 30 degrees towards the camera, scaled to 1.25 m. He plays `Big_Wave_Hello` once when a round opens and once when the viewer takes a seat; otherwise he holds the clip's first frame and breathes (procedural scale y +-1 %, 3.2 s).
- Fox bellhop, `higgsfield/fox-bellhop-tripo.glb` (simplified to about 5k triangles): at the left doorway (azimuth 100 degrees, r 12), 1.25 m, static plus breathing.
- Staff never stand on the felt, never react to a result, never carry a name tag.

**Lights** (at most 4 real lights):
- Environment: `assets/hdri/warm_bar_1k.hdr` through drei `<Environment files=... />`, `environmentIntensity 0.35`, never as background (high tier). Mid and low tiers use `RoomEnvironment` through PMREM (0 bytes).
- Key: `SpotLight` from (0, 7.2, 0.3) at the drum, colour `--spot`, angle 0.42 rad, penumbra 0.6, decay 2, cast shadow 1024 (high tier; casters: drum, characters; receiver: stage top).
- Fill: `HemisphereLight` sky `--walnut` / ground `--felt`, intensity 0.25.
- Two warm `PointLight`s (`--lamp`, distance 9) at the two doorways.
- Spotlight cone: additive open cone (top r 0.15, bottom r 3.0, h 6.7) with a vertical fade and a scrolling noise in a small `ShaderMaterial`, opacity 0.10, `depthWrite false`. Dust: at most 120 points drifting inside the cone (none on mid and low tiers).
- Fog `THREE.Fog("#1E1612", 16, 32)` (starts behind the drum as seen from every shot). ACES Filmic tone mapping, sRGB output (`setupRenderer`). A CSS radial vignette div over the canvas (`radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(10,8,6,.55))`). No post-processing pass.

**Floor ticker** (`FloorTicker.tsx`): a 4096 x 64 `CanvasTexture` on the rim band, Geist Mono 40 px in `--brass-hi` on `--walnut`, scrolling at 0.35 m/s, paused under reduced motion. Items from the history source, newest first, buys and sells interleaved in time order, **same size and brightness**: `R#{n} bought {tokens} LADLE · {before} → {after} SOL / 1M` and `sell {tokens} LADLE · {before} → {after} SOL / 1M`. Separator: a small brass dot. Hidden when the history source is null.

**Characters** (`Cast.tsx`, `pets.ts`):
- The 12 launch species, in picker order: fox, cat, bunny, panda, penguin, koala, polar, chick, pig, cow, elephant, bee, from `kenney-cube-pets/animal-<species>.glb`. The other 12 Cube Pets are not used in v20.
- Normalise per species: height 1.0 m measured on the `static` clip, feet on y 0, facing +Z (table in `pets.ts`).
- Scarf: procedural, in the player's identity colour (`MeshStandardMaterial`, roughness 0.85). A square band of four boxes around the body at the per-species seam height (default 42 % of height), outer size = body width + 0.04, thickness 0.06, height 0.09, plus a tail box (0.08 x 0.22 x 0.03) hanging at the front left, tilted 20 degrees. Parent it to the node that carries the body in the clips (inspect node names once; `SCARF_ANCHOR[species] = { node, y, w, d }`).
- Hats (P2): none, chef toque, bowler, cap, beanie, procedural, at a per-species head anchor.
- Clips used: `idle` (loop, phase offset and timeScale 0.92 to 1.08 seeded by the owner, so no two move in step), `walk` (your character entering), `dance` (picker hover only), `gesture-positive` (picker selection only). Never used: `run`, `eat`, `gesture-negative`.
- Procedural: hop (y +0.16 m, 240 ms, sine) when that player's ball drops; toss (face the drum, the ball arcs from the character to the top funnel, 520 ms); catch (scale y 0.92 / x 1.04 for 120 ms, back in 160 ms); look-up (rotate -10 degrees about X over 300 ms, held while the result panel is open). The catch and look-up are identical for every player.
- Who stands where: the stage ring holds the entries of the round in focus, seated in **arrival order**. Ring A r 2.5 has 10 seats and ring B r 3.25 has 14 seats, staggered, across 290 degrees (the 70 degree wedge facing the home camera stays empty so the PLAY card never hides anyone). Seat 1 is back-left, filling clockwise, ring A first. Phones: ring A only, 8 seats. Beyond the seats: a DOM pill "+{k} in the stands" at the left rim.
- Players without a local profile (everyone else on chain, all demo bots) get species `SPECIES[hash(owner) % 12]`, colour `playerColor(label)`, label = the existing pseudonym. Nobody else's nickname or Genesis number is invented.
- Your own character, after profile creation and while you are not in the round, stands alone in the gallery at (-2.6, 0, 4.9), front left on the walnut floor. When you enter, it hops onto its arrival seat.
- New entrants appear behind their seat with a 300 ms rise and one hop. When the next round takes focus, the previous cast steps back and fades in 400 ms.
- Draw cost: about 24 x 900 triangles; one shared texture per pack; `SkeletonUtils` is not needed (Cube Pets animate nodes, not skins), plain `clone()` per instance.

**Name tags** (`Tags.tsx`): DOM, projected each frame (`translate3d`), hidden behind the camera. Geist Mono 12, height 22, padding 0 8, `--panel`, 1 px `--line`; Genesis profiles 1 px `--brass`; yours a 2 px `--ink` outline with a leading "YOU ·". Text `{name} {sol}` while open (for example `mira 0.25`), `{name} {tokens} LADLE` after the reveal. Hover expands: `{name} · in {sol} SOL · joined {s} s ago`. The canvas is `aria-hidden`; a visually hidden list mirrors the players in arrival order.

**Quality tiers.**
- High (desktop, hardware GPU): HDRI, shadows, glass, dust, DPR [1, 1.5], 24 characters.
- Mid (phones, 4 cores or fewer, viewport < 768): RoomEnvironment, no shadows (blob shadow quads under characters), no glass, no dust, two booths, DPR 1, 8 characters.
- Low (software renderer detected through `WEBGL_debug_renderer_info`, for example SwiftShader in headless captures): mid plus a 15 fps demand loop.
- No WebGL (`hasWebGL()` false): `public/hall-poster.webp` (1600 x 900) or `hall-poster-mobile.webp` (750 x 1000), rendered from this scene by `scripts/render-art.mjs`, plus the full DOM HUD; the reveal plays in the DOM only.
- The canvas renders only while the tab is visible; below the fold it drops to 15 fps, and it stops (one last frame) once scrolled past two viewport heights.

### 6. Loading screen: "Lights up"

First visit of the session on `/` or `/play` only (sessionStorage `ladle.loaded`, read and written inside try/catch). Inner pages have no loader.

First paint is server HTML and CSS, no JS (`components/Loader.tsx`, rewritten):
- `--bg` page. Two velvet curtains (CSS: `--oxblood` base, repeating vertical fold shading, light noise) cover 0 to 32 % and 68 to 100 % of the width; a 2 px brass rail runs along the top.
- Centre stack at 38 % of the height: the real mark (`ladle-mark.svg` inlined, 140 px desktop, 104 px phone); under it the real wordmark inlined twice, an outline copy (paths with fill none, stroke `--ink` at 28 %, 1.5 px) and a filled cream copy masked by an SVG mask whose top edge is a sine (amplitude 3 px, wavelength 60 px, drifting 40 px/s) placed at `y = (1 - p) * height`: the word fills like soup rising (the user's FOMO loader mechanic: outline word, rising fill, mono percentage).
- Under it the 92-tick bar (2 x 8 px ticks, 1 px gaps, 275 px wide; lit ticks `--saffron`, unlit `--brass-lo`) with the counter `{lit} / 92` in Geist Mono 12 on its right.
- A status line (Geist Mono 13, `--ink`) and a facts line (Geist Mono 13, `--ink-3`) under the bar.
- At the bottom centre: `BRAND.secondLine` in Bricolage 500 14.

Timeline:
- 0 to 250 ms: a warm spotlight cone fades in from the top centre (CSS cone, `--spot` at 18 % max).
- 150 ms: the SVG saffron ball drops into the bowl from 60 px above (380 ms ease-in), squashes 1.15 x 0.85 (90 ms), settles (140 ms). A wooden "tok" plays only if sound is on and audio was already unlocked in this session.
- Progress `p` is a sum of real, weighted promises, each counted when it resolves (no fake interpolation; the fill only eases 300 ms towards the current value): fonts (`document.fonts.ready`) 0.10; canvas and environment 0.20; hall shell and props 0.25; drum cradle 0.15; the first three characters 0.15; the first `getLiveWindow()` 0.15. Ticks lit = `round(p * 92)`.
- The status line names the step still pending: "Lighting the hall…" (environment), "Polishing the drum…" (cradle), "Seating the players…" (characters), "Reading the current round…" (data).
- When the data resolves, the facts line becomes "Round {n} is open · {players} players in · {pot} SOL in the pot", plus the DEMO DATA chip when `source === "demo"`; if the call fails, "Round data unavailable". The facts line stays at least 600 ms before the exit.
- 3D handover: the canvas is mounted under the loader from the start, its camera on the `emblem` shot. When the environment and the ladle are ready, the extruded brass ladle under the real spotlight takes the SVG mark's exact screen box (the shot is solved for it) and the SVG mark cross-fades out in 300 ms.
- The peek, at `p >= 0.3` once the portrait has loaded: a returning visitor's own character portrait (species and scarf colour from their saved profile) slides 64 px out from behind the left curtain's inner edge (480 ms, `--ease`) with its name tag above; a first visit shows the fox with a saffron scarf and no tag.

Exit, when `p = 1`, the facts line has shown for 600 ms and at least 900 ms have passed (or at 2,400 ms at the latest):
1. The ball gives one small second bounce (200 ms).
2. 250 ms hold.
3. Curtains slide `translateX(-52vw)` and `translateX(52vw)` (700 ms, `--ease-curtain`); the loader's text fades in 200 ms.
4. The camera dollies from the emblem down to the home shot (1,200 ms, power3.inOut) while the ladle stays hanging in its place above the drum; the spotlight widens (angle 0.30 to 0.42); the lamps ramp from 0 to full in 600 ms. The lights come up on the hall.
5. HUD panels enter (8 px rise and fade, 220 ms, `--ease-quart`, staggered 40 ms).
6. The loader DOM is removed; `ladle.loaded = "1"`.

Fallbacks:
- Hall not ready at 2,400 ms: exit onto `hall-poster.webp`; the canvas fades in over it (300 ms) when ready.
- Reduced motion: no peek, no ball drop, no curtain slide, no dolly. One static frame for at least 600 ms, then a 300 ms fade; the camera starts on the home shot.
- No WebGL: the SVG mark stays, same bar and lines, the curtains open onto the poster.
- Repeat visits in the session: no loader; poster to canvas cross-fade (300 ms).

### 7. Home first screen (`/`)

The world is the page, as in slither.io: the fixed hall canvas fills the viewport, the HUD floats over it, and there is one thing to do.

**What a newcomer understands in 3 seconds:** (1) a drum is turning with characters around it: a live game room, now; (2) the live strip says which round, how long, how many, how much; (3) one card, one field, one tomato PLAY.

**Desktop, 1280 x 800:**
- Top bar (y 0 to 64, padding 16 / 24):
  - Left: `ladle-wordmark.svg`, height 32, at x 24.
  - Centre: the **live strip**, a pill 36 px high, Geist Mono 13: `● LIVE · ROUND {n} · {players} IN · {pot} SOL POT · CLOSES IN ~{s} S`, then the source chip (`DEMO DATA`, dashed `--line-2` outline, mono 11). Directly under it, the 92-tick bar (lit = slots remaining). Tooltip on the time: "Seconds are estimated from the measured slot time ({ms} ms per slot). The round closes after {slotsTotal} slots."
  - Strip states: sealed `ROUND {n} · SEALED · WAITING FOR THE SEED`; seeded `ROUND {n} · SEED IN · SERVING`; settled `ROUND {n} · SERVED`. With a sibling window open, the strip follows the open one. No entries yet: `ROUND {n} · NO ENTRIES YET`, and the activity rail reads "Quiet right now. No one has entered round {n} yet."
  - Right: ghost pills "How it plays" (scrolls to the section) and "Verify" (`/window/latest`), the sound toggle (36 x 36 icon button, off by default), and "Connect wallet" (36 px, brass 1 px outline, `--ink` text). Connected: the avatar pill (24 px portrait, nickname, a brass Genesis plate `#413` when it applies) opening a menu: "Your profile", "Change character", "Sell back my LADLE" (a small sheet: "Your LADLE: {tokens} · sells back now for {sol} SOL, 0 fee" and the outlined "Sell back now · 0 fee"), "Disconnect".
- Left rail (x 24, from y 88, width 256):
  - `BooksCard`: title "Since round 1"; three mono lines "{rounds} rounds served", "{players} players", "{sol} SOL entered"; link "Open books →" (to `#books`).
  - `GenesisCard`: title "Genesis profiles"; "{claimed} / 1,000 claimed" (mono 13); a 4 px bar (claimed part `--brass`, rest `--line`); caption "Numbered, permanent, cosmetic." Shown only when `getGenesis()` returns a count (demo, or a live profile registry).
- Right rail (right 24, from y 88, width 288):
  - `CurveCard`: title "LADLE curve"; "Curve price now {p} SOL per 1M LADLE" (mono 20); a 240 x 96 step chart of the last 50 events (saffron line 1.5 px, sells marked with small hollow cream circles, the "now" dot saffron); two plain lines "Round 1 bought at {p0}" and "Round {n} bought at {pn}" (SOL per 1M LADLE); caption "Every round's buy moves it up. Every sell moves it down."; link "See the whole curve →".
  - `ActivityRail`: title "Live" with a saffron dot, plus "{k} joined in the last minute" only when k >= 1 from real `arrivedAt` values; six rows (Geist Mono 12, newest on top, 8 px slide-in, no sound), copy in section 10.
- Between 1024 and 1279 px wide the rails are 240 px and the activity rail shows 3 rows, so both rails end above the card's top edge; under 1200 px the live strip uses the condensed phone text; under 720 px of height the activity rail collapses to its title row.
- PLAY card (`PlayCard`): centred, width 560, bottom edge 24 px above the conserved bar (so about y 468 to 736), `--panel` with the brass frame, padding 24, centred text:
  - "Same price for everyone." / "Not the same scoop." (Dela 40/1.02, 2 lines).
  - "Everyone pays in at the same price. When the round closes, one verifiable seed splits a single LADLE buy among the players." (Bricolage 15, `--ink-2`, at most 2 lines).
  - A row, gap 12: nickname input (flex, 52 px, `--inset`, placeholder "your nickname", Bricolage 17, max 16, filled from `ladle.nick`) and PLAY (168 x 52, `--tomato`, Dela 20, `--on-tomato`).
  - Fine print (Geist Mono 12, `--ink-3`): "You choose your entry in the room · 1.00 % fee on entry · 20 % cap per entry · sell back at curve price, 0 fee".
  - A text button "Watch a round" followed by "· watching costs nothing, no wallet needed" (Bricolage 14, `--ink-2`) leading to `/play?watch=1`.
- The hall: the camera puts the drum's centre at about (640, 300) and the stage's front rim behind the card's top edge; the empty front wedge of seats keeps every character visible.
- Conserved bar (`ConservedBar`): fixed bottom, full width, 40 px, `--bg` at 94 %, 1 px `--line-brass` on top, Bricolage 500 14 `--ink` centred: "The pot is conserved. The house neither wins nor loses on the draw." `role="note"`, no close control. On desktop its right end carries the scroll cue "↓ the curve · the books · verify" (Geist Mono 11, `--ink-3`).

Behaviour:
- PLAY saves the nickname to `ladle.nick`. No wallet: the connect sheet opens (section 8). Wallet but no profile: the profile step opens with the nickname filled in. Profile ready: go to `/play` (seat shot). Enter in the field = PLAY.
- Watching costs nothing: `/play?watch=1` keeps the gallery shot, rounds play out, the chat answers `!odds`, `!pot`, `!verify`; `!scoop` opens the connect sheet.
- The home camera sways (section 11); it never orbits a full turn, so the front wedge stays in front.

**Tablet 768 to 1023:** the rails move below the fold (first band); a one-line activity ticker sits above the card; the card is 520 wide.

**Phone, 375 x 812:**
- Top bar 56: wordmark height 26 at x 16; right: sound toggle (36) and the menu button (36). The menu is a sheet with: How it plays, Verify, The odds, Integrate, Security, Brand, X (@ladlefun).
- Under the top bar (y 60): the live strip condensed, Geist Mono 11, `● ROUND {n} · {players} IN · {pot} SOL · ~{s} S` plus the source chip; the 92-tick bar at 343 px under it (2 px ticks, 1.7 px gaps).
- The canvas fills the space above the sheet (about 430 px); `camera.setViewOffset` recentres the drum in that visible part; ring A, 8 characters.
- Directly above the sheet: a one-line activity ticker (Geist Mono 12, one event at a time, 300 ms cross-fade).
- Bottom sheet (`--panel-solid`, 1 px `--line-brass` top border, 4 px top corners, padding 16, height = content, about 330 px): the headline (Dela 28/1.04, 2 lines, centred); the lead (Bricolage 14/1.45, `--ink-2`); the nickname input full width (48 px); PLAY full width (52 px); the fine print (Geist Mono 11, wraps to 2 lines); "Watch a round".
- The conserved bar (13 px, may wrap to 2 lines, min 40 px, plus `env(safe-area-inset-bottom)`) is pinned under the sheet. The rails come right after it below the fold. No horizontal scroll at 320.

### 8. Wallet connect and profile creation

One modal over the darkened hall (veil `rgba(10, 8, 6, 0.62)`, no blur on phones, 8 px on desktop; the conserved bar stays visible under it). Desktop: centred, 880 x 600, `--panel-solid`, brass frame, `--float`. Phone: a full-height sheet. Step pills at the top: "1 Wallet · 2 Profile · 3 Seat"; a done step shows a cream check.

**Step 1, Wallet** (`ConnectSheet`):
- Title "Connect a wallet" (Dela 36). Body: "Your wallet is your profile. Signing a message moves no SOL."
- Rows from `useWallet().wallets`, Installed first: wallet icon, name, state "Detected", or "Not installed · get it" (a link to the wallet's own site, new tab). Phantom, Solflare and Backpack appear through Wallet Standard; on Android the mobile wallet adapter row appears by itself.
- Demo mode only, a last row: "Demo wallet · nothing on Solana" (a pubkey derived from a random seed kept in `ladle.demoWallet`).
- Footer: "No email, no password. Ladle never sees your keys."
- Errors: "The wallet closed the request. Nothing was signed." / "No Solana wallet found in this browser. Phantom, Solflare and Backpack work here."
- Connected: "Connected {7xKX…9fQa} · {wallet name}". A returning wallet with a saved profile skips to step 3.

**Step 2, Profile** (`ProfileModal`, `PetPicker`):
- Title "Pick your character" (Dela 36).
- Left 360 px: a 3D preview of the selected species on a felt pedestal with a brass rim, under its own small spotlight, turning slowly (drag to rotate), scarf in the chosen colour; selecting plays `gesture-positive` once, then `idle`. The preview is a second small `<Canvas>` (DPR 1, 30 fps demand loop, RoomEnvironment), mounted only while the modal is open; the hall canvas pauses meanwhile, so only one context renders at a time.
- Right: a 4 x 3 grid of the 12 species portraits (72 px tiles, `--inset`, selected = 1 px `--brass-hi` outline plus the portrait's own small spotlight; no glow); "Scarf colour": six 28 px swatches (teal, sky, mint, plum, tomato, saffron); "Hat" (P2): none, chef toque, bowler, cap, beanie.
- Nickname: label "Nickname"; help "3 to 16 characters: a–z, 0–9 and _. Shown on your name tag."; input lowercases as you type. Rules: `^[a-z0-9_]{3,16}$`; reserved: ladle, ladlefun, you, host, bot, house, admin, mod, system. States (cream check, never green): "✓ available" (demo: checked against the demo names and this browser's profiles), "✓ looks good" (chain: format only, since no registry reserves names yet), "Taken in this room", "Reserved name", "Too short", "Only a–z, 0–9 and _".
- Genesis plate (only when a Genesis count exists and the new profile's ordinal is 1,000 or less): an engraved brass plate "GENESIS #{0413}" (Geist Mono 15 on a `--brass` plate, `--bg` text, 4 px radius, two rivet dots), under it "One of the first 1,000 Ladle profiles. It marks when you arrived. It carries no reward, no allocation and no extra share." Past 1,000: "All 1,000 Genesis marks are taken. You are profile #{ordinal}."
- The one tomato button: "Take a seat". Under it: "Signing a message creates your profile. No transaction, no fee. Joining a round costs its entry."
- On click, `signMessage` of this exact text (UTF-8):
  ```
  Ladle profile
  wallet: {base58 pubkey}
  nickname: {nickname}
  character: {species} · scarf {hex} · hat {hat}
  issued: {ISO time}
  nonce: {16 hex chars}
  This signature creates a profile. It moves no SOL and is not a transaction.
  ```
  A wallet without `signMessage`, or the demo wallet, saves the profile unsigned (`signature: null`). A refused signature: "Nothing was signed. Your profile was not created."

Storage (`app/lib/profile.ts`, every read and write inside try/catch):
- `localStorage["ladle.profile.v1:{pubkey}"] = { v: 1, pubkey, nickname, species, scarf, hat, genesis: number | null, ordinal: number | null, createdAt, message, signature: string | null, source: "demo" | "chain" }`.
- Other keys: `ladle.nick` (last nickname typed on the home), `ladle.sound`, `ladle.demoWallet`; `sessionStorage["ladle.loaded"]`.
- If storage throws, the profile lives in memory for the session and the modal says "This browser does not keep your profile. It lasts until you close the tab."
- Demo Genesis: `claimed` is deterministic from the demo round index (starts near 300, about one more every 9 rounds, never reaches 1,000 by itself) plus this browser's profiles; a new profile's ordinal is `claimed + 1`. It wears the DEMO DATA chip everywhere.
- Chain without a profile registry (`NEXT_PUBLIC_PROFILE_API` unset): no Genesis counter, plate or wall anywhere, and the name check says "looks good". The registry (a public append-only list of ordinal, pubkey, signature, timestamp that anyone can download and check) is backend work outside this task.

**Step 3, Seat:**
- The modal folds (scale 0.98 and fade, 220 ms); the router moves to `/play`; the camera flies to the `seat` shot (1,000 ms, power3.inOut).
- Your character walks from the nearest doorway to its gallery spot (`walk`, 1.6 s), stops, `idle`; its name tag pops (scale 0.9 to 1, 160 ms); the bear host waves once.
- Toast (bottom centre above the dock, 3 s): "Welcome to the hall, {nickname}." plus " Genesis #{ordinal}." when it applies.
- If PLAY carried a nickname from the home, the dock opens with 0.25 SOL selected.
- Edit later from the avatar pill ("Change character" reopens step 2 with the current values and signs again).

### 9. The game room (`/play`)

Same hall, the camera on the `room` shot (front three-quarter, closer, breathing +-0.6 degrees of yaw over 20 s). The drum fills the centre; the players of the round in focus stand on the ring.

**HUD, desktop 1280 x 800:**
- Top bar as on the home, with the live strip replaced by the round cluster at the top centre:
  - The **dial**: 96 x 96, a ring of 92 ticks (1.5 x 7 px), lit `--saffron` for slots remaining, unlit `--brass-lo`; in the centre the slots left as a Dela 40 digit; under the dial "SLOTS LEFT · ~{s} S" (Geist Mono 11).
  - Left of the dial: the phase pill (`OPEN`, `SEALED`, `DRAWING`, `SERVED`) and the source chip.
  - Right of the dial, four pills (Geist Mono 13): `ROUND {n}`, `POT {pot} SOL`, `{players} IN`, `CAP 20 %`.
- Left: **Round chat**, x 24, width 300, from y 128 to 16 px above the dock's top edge. `useRoundChat` and `Chat.tsx` restyled: one line per message, the name in the player's identity colour, the command in Geist Mono `--ink`, bot ("Ladle") lines on `--inset`; a row of command chips (`!scoop 0.25`, `!odds`, `!pot`, `!verify`, `!sell`; `--inset`, 4 px radius, Geist Mono 12); the input "Type !scoop 0.25" with a brass-outlined send icon button (the tomato stays unique on screen).
- Right: the `CurveCard` (width 288, from y 128) and under it the `ActivityRail` (up to 8 rows, ending 16 px above the dock's top edge).
- Bottom **dock**, centred, width 600 (it clears the chat and the right rail at 1280), 16 px above the conserved bar, `--panel`, brass frame:
  - Amount chips `0.1`, `0.25`, `0.5`, `1` and "custom" (56 x 44, `--inset`, Geist Mono 15; selected = `--inset-2` fill and 1 px `--brass-hi` outline, text stays cream). A chip above the cap is disabled with the tooltip "20 % cap per entry: up to {max} SOL right now", where `max` comes from `applyCap(hugeAmount, w.total, w.capBps, DEMO_CAP_FLOOR)` in demo and the program's same rule on chain.
  - The tomato button "Scoop in · {amount} SOL" (220 x 52).
  - Fee line (Geist Mono 12, `--ink-3`): "1.00 % fee on entry · 20 % cap per entry · sell back any time, 0 fee". In a host room it ends "· {h} % host fee to @{host}". With `?host=` on the main room: "Host link from @{host} · no host fee in the main room".
- Bottom: the conserved bar.

**Spectator** (no wallet, or `?watch=1`): the dock reads "You are watching. Take a seat to play." with the one tomato button "Take a seat" (opens step 1). The chat accepts `!odds`, `!pot`, `!verify`; `!scoop` opens the connect sheet; `!sell` answers "Take a seat first."

**Entering:**
1. Pick a chip (or type `!scoop 0.25` in the chat, which selects that amount).
2. "Scoop in" opens the **receipt** above the dock (`Receipt`, `--panel-solid`, brass frame, `--float`; the dock's tomato button hides while it is open):
   - "You put in {stake} SOL"
   - "Platform fee 1.00 %: {fee} SOL"
   - "Host fee {h} %: {hf} SOL" (written out as "Host fee 0 %: 0 SOL" in the main room)
   - "Buys on the curve with round {n}: {c} SOL"
   - "Everyone in round {n} pays the same price. The seed sets your scoop."
   - "In past rounds, 8 of 10 entries of a similar share of the pot got a scoop between {p10} and {p90}. {below} of scoops were below ×1."
   - "One entry can be at most 20 % of the pot: up to {max} SOL right now."
   - The tomato "Enter round {n}" and a ghost "Back".
   - Fee lines come from the sdk `splitFees(total, hostFeeBps)`; the spread from `getPastDistribution()` deciles for the matching stake fraction and `gameFacts().belowPct`.
3. Status in place of the button: "Waiting for your wallet…" then "Sent · confirming…" (chain), immediate in demo.
4. Confirmed: the receipt closes and the `InChip` sits at the dock's left: "✓ You're in · {amount} SOL · seals at slot 92" (cream check). Your character hops from the gallery to its arrival seat and tosses its ball into the funnel; the chat shows `{nickname}: !scoop 0.25` and the bot's existing reply.
5. Errors: wallet refused "Nothing was sent. You are not in round {n}."; window sealed first "Round {n} sealed before your entry landed. Nothing was entered."; any other "The entry did not go through. Nothing was entered." (with the error text in a details line).

**During the round:**
- Each entry drops a ball in that player's colour down the top chute (the existing drop, 300 ms ease-out with a small bounce); that player's character hops once; one chat line.
- Drum speed: idle 0.25 rev/s; over the last 10 slots it ramps to 0.8 rev/s; the spotlight narrows (angle 0.42 to 0.36); a soft brass tick per slot if sound is on.

**Seal and seed:**
- At slot 92 the latch drops across the gate (clack), the cage brakes with a spring (900 ms), and the `SealStamp` presses over the drum (180 ms with a 2 px settle): "Sealed" in Bricolage 800 between two cream rules, "slot 92 of 92 · no entry, no exit" in Geist Mono under it (the v18 stamp, kept).
- Status pill and chat: "Drawing · ORAO VRF seed requested · {slotsSinceSeal} slots".
- The seed arrives: `SeedLine` types under the drum (24 ms per character): "seed {7a3f…c219} · ORAO VRF", clickable to `/window/{n}#recompute`.

**The reveal** (when the window reaches `settled`), at most about 4.5 s, identical for every result:
1. 0 ms: the cage makes ONE decisive turn (`SPIN_MS` 1,150, `--ease-mech`), as in v16 to v18.
2. 1,150 ms: the gate opens and the ladle descends on its rod until the bowl meets the gate (450 ms, power2.inOut), tilts 25 degrees and holds 150 ms; the balls leave the cage and appear as a cluster in the bowl (the logo's saffron ball hides meanwhile and returns when the ladle is back at rest); the ladle lifts (450 ms). One soft warm glow (the spotlight intensity +15 % for 400 ms). No confetti, no fireworks.
3. 2,200 ms: one ball per player leaves the bowl **in arrival order**, each on a 500 ms ease-out arc to its owner's character; stagger `min(90 ms, 1,600 ms / n)`. Every character does the same catch and the same look-up.
4. As each ball lands, that tag flips (rotateX, 220 ms) to "{name} {tokens} LADLE" in cream, in arrival order.
5. After the last flip: the result panel rises (8 px rise and fade, 220 ms) and one soft chime plays, the same for every result.
- Reduced motion: no turn, no ladle, no arcs; tags and the panel appear together.

**Result panel** (`ResultPanel`, replaces the dock; centred, width 960 desktop, `--panel-solid`, brass frame, `--float`):
- Header: "Round {n} served · {players} players · one price", and the seed chip "seed {9f3a…c21e} · ORAO VRF · Recompute" (pill).
- `YourScoop` (left, 300 px, entrants only): "Your scoop: {m} · {tokens} LADLE"; "Smallest {min} · Largest {max}" in the same size and weight as your own figure; "Sells back now for {sol} SOL, 0 fee" (from `SettlementView.mySellBack`).
- The players, in arrival order:
  - 8 players or fewer: equal tiles (120 x 84, `--inset`, a 3 px top stripe in the player's identity colour, the 28 px character portrait, the name in Geist Mono 12, "{tokens} LADLE" in cream Geist Mono 15, "in {sol} SOL · {m}" in `--ink-3` 12). Your tile adds a 1.5 px cream outline and "YOU". Tiles rise in arrival order, staggered 60 ms, identical for every tile.
  - More than 8: a ruled list (max height 240, scrolls): name, SOL in, LADLE received, multiplier. Equal rows, no highlighting.
- Sum lines (computed, never typed):
  - "In {total} SOL = {toCurve} SOL bought on the curve + {platformFee} SOL platform fee (1.00 %)" followed by " + {hostFee} SOL host fee" and " + {bounty} SOL keeper bounty" only when they are above 0 (`bounty = total - toCurve - platformFee - hostFee`).
  - "Sum of scoops: {tokensOut} LADLE, exactly this round's single buy."
- Three equal outlined buttons (same width, same weight, `--line-2` outline, Bricolage 600 16): "Sell back now · 0 fee", "Keep LADLE", "Share round {n}". Spectators see "Share round {n}" and "Recompute round {n}" only.
- "Same price for everyone. All scoops add up to this round's single buy." (Bricolage 14, `--ink-2`).
- A close control (×) at the top right. Closing it, or "Keep LADLE", returns the dock in exactly its resting state (same chips, same button, same copy whatever the result). For an entrant the panel stays until it is closed; for a spectator the next reveal replaces it. The HUD shows the next round meanwhile.
- Sell back: "Sell back now · 0 fee" → status "Selling back {tokens} LADLE…" → "Sold back for {sol} SOL · 0 fee." and the button becomes the disabled "Sold". Demo: `sellBack()`; chain: through the wallet. `!sell` in the chat does the same.
- Share (`ShareDialog`): "Copy link" (`https://useladle.fun/window/{n}`), "Post on X" (`https://x.com/intent/post` with the post text from section 10 and the URL; no personal data in the URL), and in P2 the card image preview.

**Phone, 375 x 812:**
- Top bar 52: wordmark, the dial at 44 px (digit 18) and the menu button. Under it: "ROUND {n} · POT {pot} SOL · {players} IN" (Geist Mono 11).
- Canvas on the top 55 %.
- Bottom sheet (`--panel-solid`): the last three chat lines (tap to expand the chat to the full sheet), the chips row (four chips plus a custom icon), the full-width "Scoop in · {amount} SOL" (52 px), the fee line including the cap ("1.00 % fee on entry · 20 % cap per entry · sell back any time, 0 fee"), then the conserved bar.
- The receipt and the result panel open as full-width sheets over the bottom 70 %; result tiles become rows.

**Host room** (`/h/[handle]`, P2): the same room with a header line under the top bar: "{host}'s room · host fee {h} % · platform fee 1.00 %". Demo: a short list of clearly invented hosts (`cellar_cast`, `brassbox`, `tinroof`) with their fee; the mock source gains a `hostFeeBps` option for these rooms.

### 10. Momentum: true facts, exact copy

Every figure comes from `getDataSource()` or `getHistorySource()`. In demo every momentum figure wears the DEMO DATA chip and links to the status page. Nothing is forecast.

1. **Loader live line** (section 6): "Lighting the hall…" | "Polishing the drum…" | "Seating the players…" | "Reading the current round…" | "Round {n} is open · {players} players in · {pot} SOL in the pot" | "DEMO DATA" | "Round data unavailable".
2. **Live strip and HUD pills** (sections 7 and 9). Numbers roll with `RollingNumber`, with no colour change on up or down.
3. **Live activity rail**: one program event or state change per row, nothing synthesised; sells in exactly the same row style as joins; every round row links to its recompute page; newest on top, at most 30 rows kept. Rows:
   - "{name} joined round {n} · {sol} SOL"
   - "Round {n} closed · {players} players · {sol} SOL"
   - "Seed for round {n} arrived from ORAO · {seed8}…"
   - "Round {n} served at one price · scoops from {min} to {max}" (always both)
   - "{name} sold back {tokens} LADLE for {sol} SOL · 0 fee"
   - "{name} sold {tokens} LADLE to the curve for {sol} SOL"
   - "Milestone · round {n} served · {date}" | "Milestone · {k} players have played · {date}" | "Milestone · {sol} SOL entered since round 1 · {date}" (P2; thresholds 100 / 1,000 / 10,000 rounds and players, 100 / 1,000 SOL; platform level only, never a result or a price level)
   - Link text "Recompute"
4. **The curve, round by round** (first section below the fold; compact in the `CurveCard` and in the result panel; profile markers in P2). Title "Every round buys LADLE on the curve." Intro: "Every round makes one buy on the curve, so the price steps up. Every sell steps it down. This is the whole history since round 1." Three figures: "Round 1 price: {p0} SOL per 1M LADLE" | "Last round price: {pLast} SOL per 1M LADLE" | "Curve price now: {p} SOL per 1M LADLE" (round price = `toCurve / tokensOut`; price now = spot `x / y`). Legend: "Round buy" | "Sell" | "Your rounds". Range buttons: "All rounds" (default) | "Last 1,000" | "Last 100". Axes: "SOL per 1M LADLE" (linear) | "Round". Tooltips: "Round {n} · {date} · {players} players · {sol} SOL to the curve · round price {p} SOL per 1M LADLE" | "Sell · {tokens} LADLE for {sol} SOL · price {before} to {after}". Footnote, always visible: "Past prices, read from the curve. Not a forecast. If every LADLE bought so far were sold back, the price would return to {p0}." Drawing: an SVG step line in `--saffron` 1.5 px, buys and sells in the same colour, sells marked with hollow cream circles, the R#1 point cream, the "now" dot saffron; decimate per pixel column keeping min and max so no down-step disappears.
5. **Then and now**: on the home it is the two plain lines of the `CurveCard`; below the fold under the chart: "Round 1 bought at {p0} SOL per 1M LADLE. Round {n} bought at {p}. Every round's buy moves the curve up; every sell moves it down." with the link "See the curve". If the latest price is below an earlier one, the same sentence shows it.
6. **Why the curve moves** (beside or under the chart): title "Why the curve moves"; three laws set large, each with a small brass line diagram: "One buy per round. When a round closes, its whole pot, minus fees, buys on the curve in a single trade. That buy raises the curve price." | "One price per round. Everyone in the round pays the same price. The seed sets the scoop, not the price." | "Sells move it down. Sell back at the curve price whenever you like, 0 fee. Each sell lowers the price by the same law." Closing line: "The pot is conserved. For someone to get a bigger scoop, someone gets a smaller one. The house neither wins nor loses on the draw." Fee figures from `app/lib/measurements.ts` (`platformFeeBps`, `maxHostFeeBps`).
7. **Open books** (summary on the first screen, `#books` below the fold, full table on `/stats` in P2): title "Open books"; intro "Every figure is summed from the program's events since round 1. Open any figure to see the rounds behind it." Rows: "Rounds served" | "Players (distinct wallets)" | "SOL entered" | "SOL bought on the curve" | "Platform fee, 1.00 %" | "Host fees" | "Keeper bounties" | "SOL sold back, 0 fee" | "SOL in the curve now" | "LADLE held by players" | "Kept by the house on the draw: 0 SOL". Footer: "Every round's scoops add up to that round's buy, to the last base unit." Chart: "Last 24 hours" (rounds and SOL entered per hour, quiet hours included). First-screen summary: "Since round 1: {rounds} rounds · {players} players · {sol} SOL entered". The table adds up: entered = to curve + platform + host + bounties.
8. **Receipt before you pay** (section 9, exact copy there).
9. **Genesis profile mark**: "Connect a wallet to create your profile. Signing a message moves no SOL." | "Genesis profiles: {claimed} / 1,000 claimed" | "GENESIS #{ordinal}" | "One of the first 1,000 Ladle profiles. It marks when you arrived. It carries no reward, no allocation and no extra share." | "All 1,000 Genesis marks are taken. You are profile #{ordinal}." Shown on the rail card, the profile step, the avatar pill plate, your name tag trim, scoop cards and the Genesis wall.
10. **First-round stamp and holdings** (`/profile`, P2): "Profile #{ordinal} · joined {date}" | "First played: round {n} · round price {p} SOL per 1M LADLE" | "Rounds played: {k}" | "Your LADLE: {tokens} · sells back now for {sol} SOL, 0 fee" | "Your rounds" | "Round {n} · {stake} SOL · scoop {m} · Recompute" | "No rounds yet. Your first round will appear here." No profit or loss figure, no colour on any scoop.
11. **Scoop card for X** (P2 image; P1 share link and text). 1200 x 675, charcoal, wordmark, "ROUND {n} · {players} PLAYERS · ONE PRICE", "Same price for everyone. Not the same scoop." (Dela), every scoop of the round as equal tiles "{name} {m}" in the same type size (more than 24: the first 24 in arrival order and "+{k}"), the viewer's tile with a neutral outline and "YOU", the conserved sentence, "Seed {seed8}… · recompute at useladle.fun/window/{n}". Route `/window/{n}/card?e={entryIndex}` (only the round and the public entry index in the URL). Post text: "Round {n} on @{xHandle}: {players} players, one price, scoops from {min} to {max}. Mine: {m}. The pot is conserved. Recompute it: https://useladle.fun/window/{n}". Spectator text: "Round {n} on @{xHandle}: {players} players, one price, scoops from {min} to {max}. The pot is conserved. Recompute it: https://useladle.fun/window/{n}". `xHandle` from `BRAND.xHandle` (still a placeholder).
12. **Recompute any round** (result panel, activity rows, profile rows, scoop cards, `/window/{n}`, `!verify`): "Recompute round {n}" | "Recomputing from the ORAO seed in your browser…" | "{k} of {k} scoops match. Sum of scoops: {tokens} LADLE, equal to the round's buy." | "Entry {i} does not match the published share. The details are below." | "Seed" | "VRF account" | "Settle transaction". Same law as the program (`lib/law-settle.ts` in demo, sdk `verifyWindow` on chain).
13. **Host rooms and founding hosts**: "Bring Ladle to your stream" | "Your chat plays with !scoop. You set a host fee once, at most 3.00 %. Every player sees it before entering, and it can never be raised." | "Your room link: useladle.fun/h/{handle}" | "{host}'s room · host fee {h} % · platform fee 1.00 %" | "Founding host · one of the first 25 integrations. A mark of when you arrived, with no extra fee." | "Rounds hosted {n} · players {p} · host fees received {sol} SOL" | "Links to the main LADLE room carry no host fee. They credit you in your host stats." | "Host credit on the main room: not tracked yet on chain." Founding order = the integrations' creation order. Demo hosts are invented and wear DEMO DATA.
14. **Source and program status chip** (HUD, footer, every scoop card, every stats tooltip): "DEMO DATA · simulated rounds settled with the real law. Nothing here is on Solana yet." | "DEVNET · real program, test SOL" | "SOLANA · program {short}" | link "What is done, what is not" (to `/security#status`).
15. **Result panel, three equal actions** (section 9): "Round {n} served · {players} players · one price" | "Your scoop: {m} · {tokens} LADLE" | "Smallest {min} · Largest {max}" | "Sells back now for {sol} SOL, 0 fee" | "Sell back now · 0 fee" | "Keep LADLE" | "Share round {n}" | the conserved sentence.

Multipliers use the app's `formatMultiplier` (`×0.841`). SOL: 2 decimals in HUD pills, 3 in receipts and sum lines. LADLE: integers with thousands separators. Prices: 4 decimals, "SOL per 1M LADLE".

### 11. Motion and sound

Camera shots (`shots.ts`; one `PerspectiveCamera`, fov 30 desktop, 38 phone; moves with GSAP, 1,000 ms, power3.inOut unless noted; starting values, tune by capture):

| Shot | Position | Look at | Life |
|---|---|---|---|
| `emblem` | (0, 5.0, 3.6) | (0, 5.2, 0) | still; the loader solves it so the ladle matches the SVG box |
| `home` | (0, 6.2, 11.5) | (0, 1.8, 0) | sway +-12 degrees of azimuth over 40 s (sine), 6 to 10 degrees of elevation drift, about 2 degrees of mouse parallax (desktop), paused while the pointer is over a panel |
| `seat` | (-1.6, 3.2, 7.6) | (-1.2, 1.4, 2.6) | still, then eases to `room` after 2 s |
| `room` | (0, 4.4, 8.6) | (0, 1.9, 0) | breathing +-0.6 degrees of yaw over 20 s |
| `reveal` | (0, 3.6, 6.4) | (0, 2.3, 0) | still |

Loader to home: 1,200 ms. Home to room: 1,000 ms. Room to reveal: 700 ms. Reveal to room when the panel closes: 900 ms.

Drum: idle 0.25 rev/s; ramps to 0.8 rev/s over the last 10 slots; spring brake 900 ms at the seal; one decisive turn 1,150 ms `--ease-mech` at the reveal; ball drop 300 ms ease-out with a small bounce.

Characters: desynchronised idles; hop on their ball drop; one walk for your own character; identical catch and look-up at the reveal; dance only in the picker. Staff: one wave per round open and per seat taken; breathing.

HUD:
- Panels enter with an 8 px rise and fade, 220 ms, `--ease-quart`; exit 160 ms.
- Numbers roll (`RollingNumber`) with tabular digits.
- Dial ticks go out one per slot (about 217 ms).
- Result tiles rise in arrival order, staggered 60 ms, identical for every tile.
- Button press: scale 0.98 for 90 ms. Chips: 140 ms background change.
- No shake, flash or pulse on any individual result.

Scroll: below 40 % of the viewport the HUD (rails, card, live strip) lifts 8 px and fades in 220 ms; a veil `rgba(22, 18, 15, 0.72)` fades in over the canvas; the canvas drops to 15 fps, and it stops once scrolled past two viewport heights. The conserved bar stays.

Reduced motion: no orbit or sway, no breathing, a static drum (or the poster), no ladle and no arcs at the reveal, tags and panels appear without movement, the floor ticker stands still.

Sound (`lib/sfx.ts`, synthesised with WebAudio, no file to download; off by default; the toggle in the top bar; the choice in `localStorage["ladle.sound"]`, wrapped; the first sound plays only after a click):
- room tone: filtered brown noise with a slow low murmur, about -30 dB, looping while sound is on;
- "tok": a soft wooden knock per entry;
- tick: a small brass tick per slot over the last 10 slots;
- latch: a short clack at the seal;
- spin: a soft whoosh on the decisive turn;
- pour: a soft plop per ball served (at most 8 audible, then silent);
- chime: one warm two-note chime after the reveal, identical for every result.
No coin sounds, sirens, bells, crowd cheers, fanfares or sad sounds. If the synth room tone sounds thin, a 30 s CC0 loop (Kenney audio packs, .ogg under 200 KB) may replace it, logged in ASSETS.md.

### 12. Below the fold (home)

The hall stays fixed behind (section 11, scroll). Sections are `--bg-2` or `--panel-solid` bands with brass hairlines; titles in Dela, intros in Bricolage 17, figures in Geist Mono. Each section has its own layout (no grid of identical icon cards). Max width 1200, side margins 16 / 24 / 40.

1. **The curve** (`CurveSection`, layout of `io-lobby/07-below-curve.png`): title "Every round buys LADLE on the curve.", intro, the full step chart (left, 2/3 width) and four stat tiles on the right (Rounds, Players, Volume, Fees "1.00 % platform · 0 to 3 % host · 0 to sell back"); under it "Then and now" and the footnote; then **Why the curve moves** (the three laws in three columns, one column on phones).
2. **How a round plays** (`HowItPlays`): four steps in a ruled row, "Join", "Seal", "Draw", "Serve", each with a still re-rendered from the hall (`public/art/join.webp`, `seal.webp`, `draw.webp`, `serve.webp`, 640 x 400, `scripts/render-art.mjs`), a one-line title, one sentence and one real figure in mono. Join: "Everyone pays in at the same price." (fig: "{slots} slots ≈ {s} s"). Seal: "At slot 92 the drum locks: no entry, no exit." (fig: "cap {cap} per entry"). Draw: "One verifiable ORAO VRF seed." (fig: "seed in {median} s median, {p99} s p99"). Serve: "One buy on the curve, split into scoops. The pot is conserved." (fig: "Σ scoops = the round's buy"). The cat usher and frog crooner may appear in the Join and Serve stills as staff.
3. **The odds** (`OddsSection`): `!odds` and the past distribution (`PastDistribution`, neutral bars in `--ink-3`, the p10 to p90 band in `--brass-lo`), "Most scoops land near ×1; the sum is always conserved." "{below} of scoops were below ×1." The smallest and largest past scoops at the same size in neutral type. Link "The odds in full →" (`/odds`).
4. **Open books** (`BooksSection`, `#books`): the table of section 10.7 on the left, the 24-hour chart on the right.
5. **Recompute any round** (`RecomputeSection`): an input "Round number" and the button "Recompute" (a brass-outlined button; the page's one tomato is PLAY on the first screen, which is out of view here); the result inline (section 10.12), "Open the round →".
6. **Bring Ladle to your stream** (`HostBand`): the copy of 10.13, the chat command reference (`!scoop <SOL>`, `!odds`, `!pot`, `!verify <round>`, `!sell`, one line each with the bot's real reply), the host fee rule, and the **founding hosts wall**: up to 25 engraved brass plaques with the host handle and "Founding host", count "{k} / 25" (demo hosts invented and chipped). Links "Integrate →" (`/integrate`), "Embed →".
7. **Genesis profiles** (`GenesisSection`, only when a count exists): what the mark is (10.9 copy), the counter "{claimed} / 1,000 claimed", and the **Genesis wall**: a grid of the first profiles' portraits in creation order (48 px, name under each, Geist Mono 11), demo-chipped.
8. **Questions** (`fx/Faq.tsx`) with the risks stated plainly: "The price can go down.", "A scoop can be smaller than your stake.", "Selling lowers the price.", "The draw is random and verifiable; nobody can set it.", plus the existing six answers; link to `/security`.
9. **Footer**: wordmark, "Same price for everyone. Not the same scoop.", links (How it plays, The odds, Verify, Integrate, Security, Brand), the X link `@ladlefun` (`BRAND.xUrl`), the source chip, and the conserved sentence again.

### 13. Inner pages (restyle rules)

Shared (`(site)` layout, no canvas):
- Header = the hall's `TopBar` (wordmark, nav pills How it plays, The odds, Verify, Integrate, Security, the Connect wallet / avatar pill). `SiteHeader.tsx`, `NavLinks.tsx`, `HeaderFx.tsx` are replaced.
- Page head: a 220 px band with `hall-poster.webp` at 35 % brightness behind, then the H1 in Dela (clamp(32px, 4.4vw, 64px)), one sentence in Bricolage 17, status chips under the sentence (never above the title).
- Content: rows ruled with `--line`, panels with the brass frame and 4 px radius, numbers in Geist Mono, one tomato action at most per screen. No identical icon-card grids; numbered lists only where order matters.
- Footer as in section 12.9, the conserved sentence included.
- Confetti and the x0 to x2 rail appear nowhere.

Per page:
- `/odds`: the odds explained as numbered prose; `PastDistribution` and the decile chart restyled (neutral `--ink-3` bars, the p10 to p90 band `--brass-lo`, no green or red); "{below} of scoops were below ×1" as plain text; the practice round (`Simulator`) in a framed panel with DEMO wording; `ExampleDashboard` restyled or removed if it repeats the chart.
- `/window/[id]`: the recompute page. H1 "Round {n}"; seed chip; the "Recompute round {n}" panel (10.12) open by default when the hash is `#recompute`; entries in arrival order (portrait, name, SOL in, roll, LADLE, multiplier) in equal rows; the range line "Smallest {min} · Largest {max}"; both sum lines; links VRF account and settle transaction; "Share round {n}"; `RecentWindows` as a ruled list. `/window/latest` redirects to the last settled round. P2: the card route and Open Graph image.
- `/integrate`: host rooms and founding hosts copy (10.13), the room link builder, `CodeBlock` restyled (`--inset`, Geist Mono 13, brass frame), an embed preview iframe, the host fee arithmetic table (1.00 % platform, 0 to 3 % host, 0 to sell back).
- `/security`: `StatusBand` first with the source chip and "What is done, what is not" (`#status`); `CannotPanel`, `GatesBand`, `ArchBand`, `RisksBand`, `HowItWorksNumbers`, `WhenTheResultArrives` as ruled rows.
- `/brand`: the mark and wordmark files with downloads, the v20 palette (UI, brass, ink, accents, identity, room, each with its hex and its rule), the three type families with samples, the 12 character portraits with their 6 scarf colours, a still of the brass ladle, the rule "the logo is always the SVG".
- `/about`: same head and rows.
- `/embed/[mint]`: a compact room for hosts. Header line "{host}'s room · host fee {h} % · platform fee 1.00 %" (main room: "Ladle main room · host fee 0 % · platform fee 1.00 %"); a compact 3D stage (the drum assembly and ring A only, no room shell, high tier off, DPR 1, at most 12 characters; poster when WebGL is missing or the iframe is under 360 px wide); the dial; chat; dock with the receipt; the compact result panel; the conserved bar fixed at the bottom of the iframe. `StreamHero` is no longer used.
- `/stats` (P2): the full Open books table and charts. `/profile` (P2): section 10.10.

### 14. Assets: where each goes

Every file is already optimised (meshopt, KHR_mesh_quantization, WebP textures) and logged with source, author and licence in `app/public/assets/ASSETS.md` and `manifest.json`. drei `useGLTF` decodes meshopt by default. Anything new follows the same safety policy (kenney.nl, quaternius via poly.pizza CC0 items, polyhaven, ambientcg; allowed types only; archives listed before extracting) and gets a row in ASSETS.md.

| Asset | Where | Notes |
|---|---|---|
| `kenney-cube-pets/animal-{fox,cat,bunny,panda,penguin,koala,polar,chick,pig,cow,elephant,bee}.glb` | players, picker, portraits | CC0. First 3 loaded with the loader, the rest lazily. |
| `higgsfield/drum-cradle-tripo.glb` | drum assembly | holds the app's cage between its hubs |
| `higgsfield/bear-host-meshy-rigged-wave.glb` | staff by the crank | simplify to about 5k triangles, keep the skin |
| `higgsfield/fox-bellhop-tripo.glb` | staff at the left door | simplify to about 5k triangles |
| `higgsfield/frog-crooner-tripo.glb`, `cat-usher-tripo.glb` | only in the How it plays stills and /brand | never live at player scale |
| `higgsfield/stanchion-velvet-rope-tripo.glb` | 6 around the back of the stage | simplify to 3k triangles or fewer, rope `--oxblood-hi` |
| `polypizza/curtains-double-quaternius.glb` | 3 curtain bays | tinted oxblood |
| `polypizza/column-quaternius.glb` | 8 columns | tinted walnut |
| `polypizza/lantern-hanging-kaylousberg.glb` | 2, over the doors | emissive |
| `polypizza/couch-small-quaternius.glb`, `armchair-creativetrio.glb` | booths, by the doors | tinted oxblood |
| `polypizza/spotlight-a-ipoly3d.glb` | the spot rig above the drum | |
| `kenney-furniture/lampWall.glb` (10), `tableRound.glb`, `lampRoundTable.glb`, `pottedPlant.glb` | walls, booths | recoloured |
| `hdri/warm_bar_1k.hdr` | high-tier environment | 1.45 MB; mid and low tiers use RoomEnvironment |
| `textures/WoodFloor064` | floor | |
| `textures/Fabric026` (normal and roughness only, downsized to 512) | felt, curtains | colour map unused |
| `textures/Marble016` | gallery ring | |
| `art/mascot-lineup.webp`, `bear-front.webp`, `drum-concept.webp`, `drum-cradle-concept.webp` | /brand (making-of strip) or nowhere | sources, not UI |
| New: `public/assets/pets/{species}-{color}.webp` | picker tiles, result tiles, chat avatars, avatar pill, loader peek, Genesis wall, cards | 72 portraits (12 species x 6 scarves), 256 x 256, transparent, rendered from the real models by a new `scripts/render-pets.mjs` through the `/art/[scene]` route, about 12 KB each, fetched on demand |
| New: `public/hall-poster.webp`, `hall-poster-mobile.webp`, `public/art/{join,seal,draw,serve}.webp`, `public/og.png` | fallbacks, How it plays, Open Graph | re-rendered from the hall by `scripts/render-art.mjs` and `make-og.mjs` |

Not used in v20 (kept on disk, not loaded): the other 12 Cube Pets, `kenney-mini-characters`, `kenney-blocky-characters`, `kenney-mini-arcade` (game-cabinet look, out of the hall), `kenney-holiday` string lights, `polypizza/fox-quaternius`, `frog-quaternius`, `cat-quaternius` (other styles), both chandeliers, `pillar-kaylousberg`, `post-lantern-kaylousberg`, `houseplant-quaternius`, `spotlight-b-ipoly3d`, `spotlight-theater-lakescorp`, `stage-ipoly3d` (the stage is built), `higgsfield/drum-brass-glass-tripo.glb` (its glass is opaque), `higgsfield/ladle-emblem-tripo.glb` (off-brand), `hdri/theater_01_1k.hdr`.

Payload: first load (high tier) about 3.4 MB of assets (HDRI 1.45, cradle 0.67, staff about 0.45 after simplification, three pets 0.14, props about 0.25, textures about 0.45) plus JS; mid tier about 1.9 MB. Every model stays under 1.5 MB.

Before deploy: move `app/public/assets/_staging/` (about 91 MB of raw downloads) out of `public/` to `app/.assets-staging/` and add it to `.gitignore`.

Higgsfield in the build (the run cap is about 300 credits; about 164 are spent: 118 by the asset pass, 46 by the three concepts; the account is on the free plan, so `gpt_image_2` at medium quality, 2 credits per 2k image, one job at a time, never `use_unlim`): optional, at most about 10 credits, each logged in ASSETS.md:
- a seamless oxblood velvet curtain texture, 2048 x 1024, for the loader and the 3D curtains (2 credits);
- an engraved brass plate texture for the founding-host plaques and the Genesis plate (2 credits).
No new characters are generated for v20 (the cast is the Cube Pets). The poster, the stills and the cards are rendered from the real scene, never generated, so what people see in a picture is what the hall is.

### 15. Components to delete or move

Delete (after their replacement lands):
- `components/game/Confetti.tsx` (retired), `components/game/StreamHero.tsx`, `components/game/Stage.tsx`, `components/game/ResultsBoard.tsx` (replaced by `hud/ResultPanel.tsx`).
- `components/drum/Drum.tsx` (replaced by `HallCanvas`; its poster pattern moves there), `components/drum/DrumScene.tsx` (folded into `DrumAssembly.tsx`), `components/drum/StageSet.tsx` (the walnut table set), `components/drum/MiniScenes.tsx` (the v18 loader balls). `drum/ArtScene.tsx` is rewritten to render the hall stills.
- `components/home/RoundSteps.tsx`, `CommandList.tsx`, `HouseCannot.tsx`, `MatchHistory.tsx`, `IntegrationBand.tsx` (replaced by the sections of section 12; the house line lives in Open books and `/security` keeps `CannotPanel`).
- `components/SiteHeader.tsx`, `NavLinks.tsx`, `HeaderFx.tsx` (replaced by `TopBar`); `components/Loader.tsx` is rewritten in place.
- `components/world/` (move `kit.ts` and `round.ts` to `components/hall/`, then delete the folder).
- Fonts `geist-latin.woff2`, `zen-maru-gothic-500/700/900-latin.woff2`; the Geist `localFont` in `app/app/layout.tsx`.
- `public/drum-poster.webp` and the v18 `public/art/{drop,locked,seed,rail}.webp` once the new stills exist.
- The CSS of removed components in `globals.css` (`.hero`, `.facts`, `.loader-ball`, `.stage*`, `.rail*` and similar).

Keep: `game/useRoundChat.ts`, `game/Chat.tsx`, `game/RollingNumber.tsx`, `game/types.ts`, `drum/drum-sim.ts`, `drum/parts.ts`, `drum/materials.ts`, `PastDistribution.tsx`, `WindowDetail.tsx`, `RecentWindows.tsx`, `charts/*`, `sim/*`, `project/*`, `fx/Faq.tsx`, `fx/Shortcuts.tsx`, `motion/*`, `ui/*` (restyled), `app/art/assets` (dev contact sheet, 404 in production).

Untouched: `programs/`, `sdk/`, `keeper/`, `indexer/`, `tests/`, `Anchor.toml`, `config/deployments/`, `app/lib/data/chain.ts`, `app/public/token.json`, `app/.env.local`.

### 16. Build order and pre-flight

**P1** (the game): tokens and fonts; wallet providers and the chain bridge; the demo ledger (`momentum.ts`) and `settledView` fix; `HallCanvas` with the room, drum assembly, ladle, cast, tags, staff, floor ticker and tiers; the loader; the home first screen; connect and profile; `/play` with the dial, chat, dock, receipt, in-chip, seal, seed, reveal and result panel with sell back and share link; the curve, why, how, odds, books, recompute and host sections; the inner-page restyle and the embed; posters, stills and portraits rendered; the copy lint.

**P2**: `/stats`, `/profile`, the scoop card image route, host rooms `/h/[handle]` with the mock host fee, milestones, hats, `chain-history.ts`.

**Pre-flight v20:**
- [ ] `pnpm --filter @pulled/app build` and `typecheck` pass; `node --experimental-strip-types tests/forbidden-words.ts` passes from the root; `node app/scripts/copy-lint.mjs` passes.
- [ ] Every honesty rule of section 2 holds on `/`, `/play` (open, sealed, drawing, revealed, sold), the result panel, the embed and every inner page; the conserved bar is visible at 320, 375, 768, 1024, 1280 and 1440 on `/` and `/play`, with no close control.
- [ ] No green, red or gold on any result; smallest and largest the same size everywhere; arrival order everywhere; no confetti; no "play again".
- [ ] No horizontal scroll at 320 / 375 / 768 / 1024 / 1280 / 1440 on every route.
- [ ] The logo everywhere is the SVG from `public/brand/`; the 3D ladle is extruded from `ladle-mark.svg`.
- [ ] Every figure in demo wears the DEMO DATA chip; nothing invented in chain mode (Genesis hidden without a registry, history cards hidden without a history source).
- [ ] WebGL under Edge headless (SwiftShader, low tier) renders without console errors; `prefers-reduced-motion` and no-WebGL fallbacks checked.
- [ ] Payload measured: first load under 6 MB (high tier) and under 2.5 MB (mid tier); 60 fps on a mid laptop, 30 fps or more on a mid Android (report the numbers).
- [ ] Wallet: Phantom, Solflare and Backpack detected through Wallet Standard; exact versions 0.15.40 and 0.9.28 in `app/package.json`; the lockfile's transitive Solana and wallet-standard packages at least 14 days old.
- [ ] `_staging` out of `public/`; ASSETS.md lists every shipped file and every credit.
- [ ] Captures in `app/screenshots/v20/build/` (desktop 1280 x 800 and phone 375 x 812; Edge headless with a fresh user-data dir; a CDP script for the interactions): loader at 30 % and at the exit, home, connect sheet, profile step, seat, `/play` open, receipt, sealed, reveal mid-flight, result panel (entrant and spectator), sold, below the fold (curve, how, odds, books, recompute, hosts, Genesis, footer), `/window/[id]` recomputed, `/odds`, `/integrate`, `/security`, `/brand`, `/embed/[mint]`.

## v21 - the house UI

**En bref.** La salle 3D ne change pas : c'est elle, la page. Tout le reste est refait comme une maison sérieuse et calme, pas comme un tableau de bord : plus de cartes translucides, de pastilles, de chips, de coins arrondis ni de mono. La lisibilité vient de dégradés sombres posés sur la scène, de filets laiton et de la typographie : Fraunces (titres, grands chiffres, la voix italique de la maison) et Schibsted Grotesk (interface, texte, petits chiffres), rien d'autre. Un seul bouton plein par écran, le « ticket » laque à encoches. Le logo est le nouveau « ladle » dont le d est la louche. Dans le chat, on parle et on tape des commandes, et chaque sorte de ligne a sa forme. La démo porte une étiquette de vestiaire bordeaux sur chaque écran. Le reste de cette section est en anglais, pour les agents qui construisent.

Mechanics, the honesty rules (v20 §2, verbatim) and the casino line are unchanged and apply to every line below. This section supersedes v20 §3 (tokens and type), §6 to §9, §12, §13 and §15 wherever they disagree, and the v20 pre-flight line "every figure in demo wears the DEMO DATA chip" (replaced by §8.8). The 3D hall (v20 §5) belongs to the hall agent; what this UI needs from it is the contract in §7.4 and §7.5.

### 1. Sources and mockups

Chosen direction: **The Quiet Room** (judge: taste 8.5, clarity 7.5, feasibility 8.5): the hall is the page; type, hairlines and scrims instead of boxes; one notched lacquer ticket per screen; editorial below the fold. Grafts from **House Signage**: the chat line system, the 50-player chat rules, the demo cloakroom tag (flattened), the paper ticket stub, the layout guards, the programme rows, official wallet icons, the simultaneous reveal. Grafts from **Brass Console**: the presence strip, disabled states with a reason line, the scrolling command row, the verify-page details, the whole peeking character on the loader. Logo: **"The d is the ladle"** (config/brand.ts `BRAND.logo`, app/public/brand/).

The mockups are layout and mood references. Their 3D is AI-repainted, their logo is a placeholder and some of their small text is wrong; where an image and this text disagree, this text wins. Build against the real hall (§13, step 0).

| Screen | Primary mockup (match this) | Graft / detail reference |
|---|---|---|
| Home, desktop | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\01c-home-desktop-framed.png` | framing: `...\quiet-luxe-io\ref\hall-poster-offset.png` |
| Home, phone | `...\quiet-luxe-io\03b-home-mobile.png` | `...\house-signage\08b-home-mobile-v2.png` (demo tag hanging from the top bar) |
| /play, desktop | `...\quiet-luxe-io\02b-game-room-desktop-dock.png` (dock, chat column, scrims) | `...\house-signage\02c-game-room-desktop-v3.png` (chat lines, presence count, one ticket stub, demo tag) |
| /play, phone | `...\quiet-luxe-io\04-game-room-mobile.png` | `...\house-signage\09-game-room-mobile.png` (chat block under the hall) |
| Result | `...\quiet-luxe-io\10b-result-served.png` | `...\house-signage\10-result-served.png` (arrival-order list, smallest and largest together) |
| Check-in sheet | `...\quiet-luxe-io\05-profile-sheet.png` | `...\house-signage\03-profile-sheet.png` (step line, wallet rows, sheet stopping at the rail) |
| How a round plays | `...\house-signage\04b-below-programme-v2.png` (5/7 programme layout, porthole) | typeset in Quiet Room grammar (§9.4) |
| The curve | `...\quiet-luxe-io\06-below-curve.png` | |
| Open books | `...\quiet-luxe-io\07-below-books.png` | |
| /odds | `...\quiet-luxe-io\08-odds-page.png` | |
| Loader | `...\quiet-luxe-io\09-loader.png` | the logo: `...\screenshots\v21\brand\board.png` |
| /window/[id] | `...\game-hud\06-verify-page.png` (seed well + copy, "Matches the program's record") | typeset in Quiet Room grammar |
| Disabled states | `...\game-hud\10-component-sheet.png` (reason line under an action) | |
| Type and tokens | `...\quiet-luxe-io\00-specimen.png` and `specimen.html` (ticket mask, ruler, field) | `...\quiet-luxe-io\00-contact-sheet.png`, `...\house-signage\00-contact-sheet.png` |
| Logo kit | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\brand\board.png` | `...\brand\applications-contact-sheet.png` |
| Clean hall plates | `...\house-signage\ref-clean-home-16x9.png`, `ref-clean-home-9x16.png`, `ref-clean-play-16x9.png`, `ref-clean-play-9x16.png` | backgrounds for the step-0 prototypes |

`...` stands for `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions`. Superseded, do not match: house-signage `02-`, `02b-`, `04-`, `06-`, `08-`; every game-hud image except `06` and `10`.

The same images as full absolute paths. Chosen direction (Quiet Room):
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\01c-home-desktop-framed.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\02b-game-room-desktop-dock.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\03b-home-mobile.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\04-game-room-mobile.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\05-profile-sheet.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\06-below-curve.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\07-below-books.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\08-odds-page.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\09-loader.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\10b-result-served.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\00-specimen.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\specimen.html`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\00-contact-sheet.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\quiet-luxe-io\ref\hall-poster-offset.png`

Grafts (House Signage):
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\02c-game-room-desktop-v3.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\04b-below-programme-v2.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\03-profile-sheet.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\08b-home-mobile-v2.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\09-game-room-mobile.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\10-result-served.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\ref-clean-home-16x9.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\ref-clean-home-9x16.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\ref-clean-play-16x9.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\house-signage\ref-clean-play-9x16.png`

Grafts (Brass Console):
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\game-hud\06-verify-page.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\directions\game-hud\10-component-sheet.png`

Logo kit:
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\brand\board.png`
- `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\brand\applications-contact-sheet.png`

### 2. Decisions

| Topic | On the table | Decision |
|---|---|---|
| Serif | Newsreader (Quiet Room), Fraunces (brand board) | **Fraunces**, roman and italic, SOFT 0 and WONK 0 pinned when subsetting. Checked on 2026-10-27 in `app/scripts/fonts/Fraunces[SOFT,WONK,opsz,wght].ttf`: GSUB has only `case liga rvrn ss01`, so **no tnum, lnum or onum**; its default figures render lining and proportional. Live numbers therefore roll in fixed-width digit columns (§8.25) and ledger figures align on the decimal with split spans (§8.21). The italic exists upstream (`ofl/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf`, 414,904 bytes). Newsreader is not used. |
| Sans | Geist (brand board), Schibsted Grotesk (Quiet Room) | **Schibsted Grotesk**. Geist is the create-next-app default and reads as exactly the "vibe-coded" voice the user rejects. Its `tnum` turns commas and points tabular, which reads as monospace (rendered), so `tnum` is used for seeds only. |
| On-screen action colour | tomato #FF5A36, lacquer #B8432A | **Lacquer** for the one action on screen. Cream #F6EEE3 on #B8432A measures 4.71:1, which passes at 17px/600. Hover and press go darker (5.47:1 and 6.46:1), never lighter. Tomato stays for the app tile, stickers and the light-ground logo. `BRAND.colors` gains `lacquer`; /brand role text changes (§13). |
| Number of families | 4 (House Signage), 2 (Quiet Room) | 2: Fraunces and Schibsted Grotesk. The only exception is the system monospace stack inside code wells on /integrate and /security (code is code). |
| Demo marker | italic line, velvet tag, enamel sign | A **flat oxblood cloakroom tag** fixed at the top of every screen, plus a brass † and one italic footnote per block of figures below the fold (§8.8). No chip anywhere. |
| Chat look | scarf-coloured names, swatch + ink names, keycaps | House Signage's line system on Quiet Room's boxless column (§8.15). |
| Tags after the reveal | LADLE amount (v20), multiplier | **Multiplier** (`×0.946`, 6 characters, so 15 tags fit). The LADLE amount lives in the result sheet. Every tag changes at the same instant. |
| Countdown on /play | top centre (02b) | **Right instrument column.** In the real hall (`ref-clean-play-16x9.png`) the hopper, chute and spotlight can fill the top-centre band, and a 132px numeral there would cover them and the ladle's rod. |
| Live facts on the home | top band (01c) | **Inside the playbill column**, above the headline. The top band keeps only the wordmark, the tag and the nav, so nothing covers the ladle. |
| Home sparkline | bottom-right fact + sparkline (01c) | **Removed.** The curve lives below the fold. |
| Phone /play | numeral over the scene (04) | A **round strip on the ground** between the top bar and the hall band. The hall band carries tags only. |
| Identity swatches | circles, squares | **Squares** everywhere: chat, tags, presence, result list, scarf picker. The only circles in the UI are the porthole medallion and the logo's ball and hole. |
| Conserved rail | 56px with links (Quiet Room) | 48px (64px on phones), the sentence only, solid, fixed on **every** route. Footers never repeat it. |
| Toasts | v20 toasts | None. Feedback is a reason line under the action, a personal notice in the chat, or an italic line under the dial (§8.24). |
| Order below the fold | curve first (Quiet Room) | How a round plays first (II), then the curve, the books, the odds, recompute, hosts, Genesis, questions (§9.4). |

### 3. Tokens

Replace the UI part of the `:root` block in `app/app/globals.css` with the block below. Dark only: there is no light theme and no `prefers-color-scheme` branch. The room tokens (`--hall`, `--oxblood`, `--oxblood-hi`, `--walnut`, `--walnut-hi`, `--felt`, `--felt-hi`, `--spot`, `--lamp`) stay as in v20 for the 3D and the curtains. For one release, alias the old UI names to the new ones (`--bg: var(--ground)`, `--bg-2: var(--ground-0)`, `--panel-solid: var(--ground-2)`, `--inset: var(--ground-3)`, `--line-brass: var(--rule)`), then delete them. `--panel`, `--float`, `--r-1`, `--r-2` and `--r-pill` are deleted now. No UI selector may read `--tomato`.

```css
:root {
  color-scheme: dark;
  /* grounds: opaque */
  --ground-0: #0F0B09;     /* loader, rail, phone ground under the hall, footer, scrim colour (15,11,9) */
  --ground:   #16120F;     /* = BRAND.colors.charcoal. Page ground below the fold, inner pages */
  --ground-2: #1C1512;     /* sheets (check-in, result, share, phone chat, menu), typeahead strip */
  --ground-3: #241A15;     /* hover wash on rows, focus wash behind a field */
  --oxblood-900: #2A1012;  /* velvet bands below the fold (sections IV and VII) */
  --oxblood-700: #5A1A1D;  /* loader curtains */
  --oxblood-tag: #6B1F23;  /* the demo tag face; cream on it 9.9:1, brass-hi 7.2:1 */
  --felt-900: #0F2621;     /* section II band, profile pedestal well */
  /* ink */
  --ink:   #F6EEE3;        /* = BRAND cream. All text, every result number. 16.2:1 on --ground */
  --ink-2: #D2C5B4;        /* body, labels. 11.0:1 */
  --ink-3: #A89884;        /* fine print, placeholders, axes. 6.6:1 on --ground, 6.3:1 on oxblood-900, 5.7:1 on felt-900 */
  --ink-4: #5E5146;        /* disabled rules and unlit marks. Never text */
  /* brass: the frame. Never a result */
  --brass:    #C99A4B;     /* = BRAND brass. Folios, Roman numerals, selected underline, chart line. 7.3:1 */
  --brass-hi: #EBC985;     /* focus ring, current tick, typeahead commands, the ticket's top highlight. 11.7:1 */
  --brass-lo: #6E5228;     /* unlit ruler ticks */
  --rule:     rgba(201,154,75,.38);  /* structural hairlines */
  --rule-2:   rgba(201,154,75,.70);  /* interactive lines: fields, selected stake, rail top line */
  --rule-ink: rgba(246,238,227,.10); /* chart gridlines */
  /* signal and action */
  --saffron: #FFB21A;      /* = BRAND saffron. Logo ball, lit ruler ticks, the curve's now-dot, the live programme tick. Never a result, never body text */
  --lacquer: #B8432A;      /* the ONE action per screen. Cream label 4.71:1 */
  --lacquer-hover: #A83C25;/* 5.47:1 */
  --lacquer-press: #96351F;/* 6.46:1 */
  --on-lacquer: #F6EEE3;
  --tomato: #FF5A36;       /* brand only (tile, stickers, light-ground logo). Not used by any UI selector */
  /* paper and enamel: one job each */
  --paper: #F1E7D3; --paper-ink: #2B1D13; --paper-ink-3: #6E5E4C; --paper-rule: #CBB896; /* ticket stub and demo slip only. 13.3:1 and 5.1:1 */
  --enamel: #EFE3CC; --enamel-ink: #16120F;   /* chat command token only. 14.7:1 */
  /* identity: lib/profile.ts SCARVES. Squares and scarves only; never a value, never text */
  --p-teal: #2EC4B6; --p-sky: #5AA9FF; --p-mint: #7ED957; --p-plum: #C77DFF; --p-tomato: #FF5A36; --p-saffron: #FFB21A;
  /* scrims: static gradients, pointer-events none */
  --scrim-top:    linear-gradient(180deg, rgba(15,11,9,.86) 0, rgba(15,11,9,.50) 96px, rgba(15,11,9,0) 180px);
  --scrim-home:   linear-gradient(90deg, rgba(15,11,9,.90) 0, rgba(15,11,9,.84) 40%, rgba(15,11,9,0) 56%);
  --scrim-chat:   linear-gradient(90deg, rgba(15,11,9,.90) 0, rgba(15,11,9,.86) calc(var(--gutter) + var(--chat-w) + 16px), rgba(15,11,9,0) calc(var(--gutter) + var(--chat-w) + 200px));
  --scrim-instr:  linear-gradient(270deg, rgba(15,11,9,.80) 0, rgba(15,11,9,.66) calc(var(--gutter) + var(--instr-w)), rgba(15,11,9,0) calc(var(--gutter) + var(--instr-w) + 160px));
  --scrim-bottom: linear-gradient(0deg, rgba(15,11,9,.95) 0, rgba(15,11,9,.80) 128px, rgba(15,11,9,0) 300px);
  --halo: 0 1px 2px rgba(15,11,9,.9), 0 0 14px rgba(15,11,9,.7);  /* text-shadow for any type over the canvas */
  /* shape */
  --notch: 6px;            /* the ticket and the paper's concave corners. Every other radius is 0 */
  /* space (4 px base) */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px; --s-10: 160px;
  --gutter: 40px;          /* 32px at 1024-1279, 24px at 768-1023, 16px below 768 */
  --top-h: 72px;           /* 56px below 768 */
  --rail-h: 48px;          /* 64px + env(safe-area-inset-bottom) below 768 */
  --chat-w: 320px;         /* 280px at 1024-1279 */
  --instr-w: 300px;        /* 224px at 1024-1279, 200px at 768-1023 */
  /* motion */
  --ease-out: cubic-bezier(.22,1,.36,1);
  --ease-in: cubic-bezier(.55,0,.85,.35);
  --ease-in-out: cubic-bezier(.65,0,.35,1);
  --ease-curtain: cubic-bezier(.7,0,.2,1);
  --dur-1: 120ms; --dur-2: 180ms; --dur-3: 240ms; --dur-4: 320ms; --dur-5: 700ms;
  /* fonts (variables set by next/font) */
  --font-serif: var(--font-fraunces), ui-serif, Georgia, serif;
  --font-sans: var(--font-schibsted), ui-sans-serif, system-ui, sans-serif;
}
body { background: var(--ground); color: var(--ink); font: 400 16px/1.55 var(--font-sans); }
*, *::before, *::after { border-radius: 0; }
::selection { background: rgba(235,201,133,.35); color: var(--ink); }
:focus-visible { outline: 2px solid var(--brass-hi); outline-offset: 3px; }
```

`themeColor` stays `#16120F`. `lib/colors.ts` keeps `PLAYER_COLORS` and `playerColor()`.

### 4. Type

**4.1 Files.** Three self-hosted files in `app/public/fonts/`, built once with the fontTools already installed (`py -m fontTools`, version 4.66.1). Brotli is not installed, so the output is `.woff`. Use `--flavor=woff2` only if `py -c "import brotli"` succeeds; do not install packages.

1. Download into a new directory `app/scripts/fonts/v21-src/`, from github.com/google/fonts (OFL): `ofl/fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf`, `ofl/schibstedgrotesk/SchibstedGrotesk[wght].ttf` and `ofl/schibstedgrotesk/OFL.txt`. Use the raw URLs, `%5B`/`%5D` for the brackets. The roman Fraunces is already at `app/scripts/fonts/Fraunces[SOFT,WONK,opsz,wght].ttf` (same 360,440 bytes as upstream).
2. Instance (pin SOFT and WONK, narrow wght):
   - `py -m fontTools.varLib.instancer "Fraunces[SOFT,WONK,opsz,wght].ttf" wght=400:800 SOFT=0 WONK=0 -o fraunces-roman.ttf`
   - `py -m fontTools.varLib.instancer "Fraunces-Italic[SOFT,WONK,opsz,wght].ttf" wght=400:700 SOFT=0 WONK=0 -o fraunces-italic.ttf`
   - `py -m fontTools.varLib.instancer "SchibstedGrotesk[wght].ttf" wght=400:700 -o schibsted.ttf`
3. Subset each to latin: `py -m fontTools.subset <in>.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215" --layout-features="kern,liga,case,ss01,rvrn,tnum,pnum,zero" --flavor=woff --output-file=app/public/fonts/<name>-latin.woff`. Names: `fraunces-roman-latin.woff` (tested: 78 KB, axes opsz 9..144 and wght 400..800), `fraunces-italic-latin.woff`, `schibsted-latin.woff`.
4. Copy `fraunces-roman.ttf`, `fraunces-italic.ttf` and `schibsted.ttf` to `app/scripts/fonts/` for make-og, make-brand and satori, with both OFL texts.
5. Delete `app/public/fonts/dela-gothic-one-latin.woff2`, `bricolage-grotesque-latin.woff2` and `geist-mono-latin.woff2`, plus `app/scripts/fonts/Geist-*.ttf` once make-og no longer reads them.
6. Record every file (source URL, licence, the commands above, final size) in `app/public/assets/ASSETS.md`.

**4.2 Loading** (`app/app/layout.tsx`; read `node_modules/next/dist/docs/` for `next/font/local` in this Next version first):

```ts
const fraunces = localFont({
  src: [
    { path: "../public/fonts/fraunces-roman-latin.woff", weight: "400 800", style: "normal" },
    { path: "../public/fonts/fraunces-italic-latin.woff", weight: "400 700", style: "italic" },
  ],
  variable: "--font-fraunces", display: "swap", fallback: ["Georgia", "serif"], adjustFontFallback: "Times New Roman",
});
const schibsted = localFont({
  src: [{ path: "../public/fonts/schibsted-latin.woff", weight: "400 700", style: "normal" }],
  variable: "--font-schibsted", display: "swap", fallback: ["system-ui", "sans-serif"], adjustFontFallback: "Arial",
});
```

Both variables go on `<html>`. Remove the `dela`, `bricolage` and `geistMono` declarations, `--font-display`, `--font-ui`, `--font-mono-face` and every class that reads them (`.f-display`, `.f-mono`, `.mono`). Fraunces is set with `font-variation-settings: "opsz" N` per role (the table below). Never `font-synthesis`: `font-synthesis: none` on `html`.

**4.3 Roles.** The only uppercase in the product is `.folio`. Nothing is smaller than 12px, and only the folio is 12px.

| Class | Face and weight | opsz | Desktop size / line-height | Phone | Tracking | Use |
|---|---|---|---|---|---|---|
| `.display-xl` | Fraunces 700; its third line Fraunces italic 600 | 144 | `min(calc(var(--col) / 8.2), 7.4vh, 62px)` / 1.0, where `--col` is the playbill column width (the italic line measures about 7.9 x its font size) | 38 / 1.02 | -0.02em | the home headline only; each of the 3 lines on one line (`white-space: nowrap` per line) |
| `.display-l` | Fraunces 700; optional 2nd line italic 600 | 144 | clamp(40px, 5.4vw, 88px) / 0.98 | 36 / 1.02 | -0.02em | section heads, inner-page H1, 404. Max 16ch per line, max 2 lines |
| `.display-m` | Fraunces 700 | 72 | 34 / 1.06 | 28 | -0.01em | sheet titles ("Pick your character") |
| `.num-dial` | Fraunces 600 | 72 | 132 / 0.86 (96 at 1024-1279, 64 at 768-1023) | 48 | 0 | the countdown |
| `.num-l` | Fraunces 600 | 72 | 48 / 1 | 36 | -0.01em | facts below the fold, "Your scoop", Genesis count, loader counter (44) |
| `.num-m` | Fraunces 600 | 36 | 28 / 1 | 24 | 0 | HUD facts, ledger figures, stake numerals (30 / 26 phone) |
| `.label-i` | Fraunces italic 400 | 18 | 16 / 1.3, `--ink-2` | 15 | 0 | the label under every numeral |
| `.house` | Fraunces italic 400 | 18 | chat 15 / 22; rail 18 / 24; ledes 20 / 30 | 15 / 21; rail 15 / 20; ledes 18 / 27 | 0 | the house's voice |
| `.body` | Schibsted 400 | - | 17 / 1.6 (inner pages 18 / 1.65), `--ink-2`, max 62ch | 16 / 1.55 | 0 | paragraphs |
| `.ui` | Schibsted 500 (names 600) | - | 15 / 1.4 | 15 | 0 | nav, chat, links, list rows (14) |
| `.btn-label` | Schibsted 600 | - | 17 / 1 | 17 | .01em | the ticket |
| `.fine` | Schibsted 400 | - | 13 / 1.45, `--ink-3` | 13 | .005em | fees, captions, helper text |
| `.folio` | Schibsted 600, uppercase | - | 12 / 1, `--brass` | 12 | .16em | one per section, sheet or HUD block |
| `.seed` | Schibsted 500, `"tnum","zero"` | - | 15 / 1.4 | 14 | .02em | seeds, signatures, addresses, grouped by 4 with spaces |

**4.4 Numerals.**
- Fraunces figures are lining and proportional. Every number that changes in place (dial, HUD facts, loader counter, the home live facts) renders through `RollingFigure` (§8.25), whose digit columns all share one measured width, so nothing jitters.
- Static Fraunces figures (facts below the fold, "Your scoop") stay proportional.
- Columns of figures (ledger, /odds table) align on the decimal point (§8.21). Small numbers in Schibsted use the default proportional figures; `tnum` only on `.seed`.
- Formats: SOL with 2 decimals in the HUD and in facts, 3 in the ledger, 4 on the ticket stub and in the sell-back confirmation. LADLE as integers with thousands commas. Multipliers `×0.946` (U+00D7, 3 decimals, same face, size and colour as the figures around them). Percentages with a no-break space (`1.00 %`). `Round No. 1103`, `No. 0423`, `about 10 s`.

### 5. The logo in the UI

The logo is never typeset. Only these renderings exist:

| Where | Asset | Size |
|---|---|---|
| Top bar (hall and inner pages) | `<img src={BRAND.assets.wordmark} width={72} height={28} alt="Ladle">` inside the home link | 28px tall (72px wide at 2.57:1); 24px tall (62px) below 768 |
| Footer | `BRAND.assets.wordmark` | 48px tall (123px) |
| Loader | inline SVG built from `BRAND.logo.word` (`viewBox`, `ink`, `ball`) | 96px tall (246px); 64px (164px) below 768 |
| Chat house bullet, 404 folio, embed corner | inline SVG of `BRAND.logo.mark` with `ink` in `--brass` and `ball` in `--saffron` | 14px (chat), 20px (embed) |
| Favicons, app icon, avatars | the generated PNG/ICO/SVG files | as generated |
| Share card, OG | `BRAND.assets.wordmark` drawn at 123 x 48 (scoopCard.ts), never stretched | |

Clear space around the wordmark is one ball diameter: 36 units, so 11px at 28px tall; nothing else enters that box (the demo tag hangs 24px to its right). The ball is always saffron on dark grounds and never changes colour for any state or result.

### 6. Materials, ornaments, textures

**6.1 Drawn in CSS or SVG (no image files).**
1. **The scene and its scrims.** On `/` and `/play` the canvas is the page. Legibility comes from fixed `pointer-events: none` gradient layers (§3 scrims) and `--halo` on type over the canvas, never from a panel. Exactly one scrim per region; scrims are static (never animated, never blurred).
2. **Hairlines.** 1px `--rule` for structure (ledger rows, the vertical rules between facts, the top rule of every section); 1px `--rule-2` for interactive lines (fields, the rail's top line). A double rule (1px, 6px gap, 1px, both `--rule`) appears only on the left edge of a right sheet.
3. **The slot ruler** (§8.7): 92 ticks, the one ornament repeated on the loader, the home, /play and the phone.
4. **The ticket** (§8.1): the only filled control: lacquer with four concave notches cut by a mask.
5. **Paper** (§8.14, §8.8): the ticket stub and the demo slip, nothing else. The same notch mask, plus dot leaders.
6. **The demo tag** (§8.8): flat oxblood, chamfered top corners, a drawn brass eyelet.
7. **Ornaments**: brass Roman numerals (Fraunces 400) for sequences (I to IX for sections, I to IV for the programme, I to III for clauses and check-in steps); the folio (`II · The programme`); the brass dagger † after demo figures; the logo mark as the chat's house bullet; the porthole medallion ring (a 2px `--brass` circle with 72 inner ticks, 1 x 6px in `--brass-lo`, drawn as one SVG). Circles (the eyelet, the porthole) are drawn in SVG or cut with `clip-path: circle()`, never with `border-radius`.
8. **Forbidden**: cards, translucent panels, pills, chips, dashed borders, corner ticks, gold or any other gradient on a control or on text, glows (`--halo` is legibility, not glow), box-shadows other than the ticket's 1px inset highlight, `backdrop-filter` (except the sheet backdrop, §7.6), radius above 0, monospace text outside code wells, emoji, confetti, coins, chips, trophies.

**6.2 Textures generated with Higgsfield** (done by the build agent; budget 20 credits, logged in ASSETS.md with model, prompt, credits and date; never `use_unlim`). Pick the model with `models_explore` (on this plan `nano_banana_pro` and `nano_banana_2` work; recraft and gpt_image were refused). Two variants each. Download with curl into the new directory `app/public/assets/textures/ui-v21/`, convert with sharp to WebP. Check tiling by compositing a 3 x 3 grid into `app/screenshots/v21/textures/<name>-tile-check.png` and reading it. If a seam shows, offset by half and cross-fade a 64px band in sharp. If it still shows, or if the texture looks plastic in a page capture, drop it and use the CSS fallback.

| File | Prompt (all end with: "seamless tileable texture, top-down, even flat lighting, no vignette, no shadows, no objects, no text") | Size | Where and how | CSS fallback |
|---|---|---|---|---|
| `walnut-veneer.webp` | "dark American walnut crown-cut veneer, very low contrast, matte oil finish" | 1024 px, at most 120 KB | `::before` of `--ground` and `--ground-0` sections below the fold, the footer and inner pages: `background: url(...) 0 0 / 512px repeat; opacity: .06; mix-blend-mode: soft-light` | SVG feTurbulence grain, baseFrequency .9, 2 octaves, opacity .04 |
| `velvet-oxblood.webp` | "deep oxblood crushed velvet, soft pile sheen, colour #4A1418" | 1024 px, at most 140 KB | loader curtains at full strength under the fold gradient (§9.1); sections IV and VII at opacity .10 | `--oxblood-700` with the fold gradient only |
| `paper-stock.webp` | "warm cream cotton paper with faint fibres" | 512 px, at most 60 KB | the ticket stub and the demo slip: `background: var(--paper) url(...) 0 0 / 256px; background-blend-mode: multiply` at 50 % via a `::before` | flat `--paper` |
| `felt-green.webp` | "deep green wool felt, colour #12352F, fine fibres" | 512 px, at most 60 KB | section II band at opacity .08; the profile pedestal well | flat `--felt-900` |

Generated images never show people, characters, the hall, text or anything a viewer could read as a real object. No other Higgsfield output ships in the UI.

**6.3 Real captures, not generated.** The porthole still in section II (`app/public/stills/porthole-drum.webp`, 560 x 560, WebP q80) is a capture of the real hall (`home` shot, overlays hidden, cropped square on the drum), made with the CDP capture script, so the hall in the page is always the real one. The 404 uses the existing `public/hall-poster.webp`.

**6.4 Icons.** One custom set in `app/components/ui/icons.tsx`, drawn on a 20px grid with a 1.25px stroke, square caps and miter joins in `currentColor`: speaker, speaker-off, menu (two 20px hairlines 6px apart), close (×), arrow-right, arrow-down, check, copy, external (↗), enter (↵). No icon library, no filled icons, no icon inside a box.

### 7. Layout system and the hall contract

**7.1 Breakpoints.**

| Width | Gutter | /play layout | Home layout |
|---|---|---|---|
| >= 1440 | 40 | as >= 1280 | playbill column 520 |
| >= 1280 | 40 | chat column 320 left, instrument column 300 right, dock bottom centre | playbill column 480 over `--scrim-home`, drum shifted right |
| 1100-1279 | 32 | chat 280, instrument 224 (numeral 96) | the same as >= 1280, column 440 |
| 1024-1099 | 32 | chat 280, instrument 224 | stacked: hall band on top, playbill below on `--ground-0` |
| 768-1023 | 24 | chat becomes a bottom-left drawer (3 lines + input, 320 wide, expands to 60 % height); instrument block top-right, 200 wide, numeral 64; dock full width at the bottom | stacked |
| < 768 | 16 | phone (§9.6) | phone (§9.3) |

No horizontal scroll at 320, 375, 390, 768, 1024, 1280 and 1440. At heights under 760px (desktop), the home's live facts row collapses to one `.fine` line (§9.2).

**7.2 Layers.** canvas 0; scrims 1; name tags 2; HUD 10; dock, ticket stub and result sheet 20; sheet backdrop 30; sheets 31; conserved rail 50; demo tag and slip 55; loader 60; on the loader, the rail 62 and the tag 63.

**7.3 Scrims by route.** `/`: `--scrim-top` plus `--scrim-home` (>= 1100) or a bottom fade of the hall band into `--ground-0` (stacked). `/play`: `--scrim-top`, `--scrim-chat`, `--scrim-instr`, `--scrim-bottom`. Under the chat text the scrim is at least .86 opaque (measured at the column's right edge).

**7.4 The clear zone (hall publishes, HUD obeys).** The hall agent publishes `hall.drumRect` in `components/hall/store.ts`: the screen box in CSS px of the cage, the cradle, the hopper and chute, the 3D ladle (bowl and handle) and the lowest 120px of its rod, recomputed when a shot settles, during camera moves and on resize (not every frame at rest). It is also written as `--drum-l`, `--drum-t`, `--drum-w` and `--drum-h` on `.hall-stage`. The **clear zone** is that box padded by 48px (>= 1280), 32px (1024-1279) or 16px (below 1024); at 1280 x 800 it must measure at least 560 x 420. No HUD element (scrims excepted) may intersect it on `/` or `/play` in any phase, except the result sheet, whose top edge must stay below the cage sphere's projected bottom. The checklist measures this.

**7.5 The view shift (camera framing).** The HUD sets `hall.viewShift` (a fraction of the viewport width, positive moves the drum right); `CameraRig` applies it with `camera.setViewOffset(W, H, -viewShift * W, 0, W, H); camera.updateProjectionMatrix()` and calls `clearViewOffset()` at 0. Values:
- `/` at >= 1100: **0.13**, so the drum centre sits at about 63 % of the width. At 1280 x 800 no character, drum part or ladle may sit left of x = 0.44W (563px), and the bear host must stay fully in frame. The hall agent tunes the home shot to meet both, by capture.
- `/play` at >= 768: `(reservedLeft - reservedRight) / (2W)`, where reservedLeft is `gutter + chat-w` (0 at 768-1023) and reservedRight is `gutter + instr-w`. That gives about +0.008 at 1280, so effectively centred, and about -0.11 at 800.
- Phones and the stacked home: 0.

Going from `/` to `/play`, `viewShift` tweens with the dolly over the same `MOVE_MS` and the same ease (power3.inOut). The home playbill fades out over 180ms before the dolly starts. The /play HUD fades in and rises 8px, staggered 50ms, starting when the dolly is 60 % done. Tag projection uses `camera.projectionMatrix` after `updateProjectionMatrix()`, so it includes the offset; check by capture that tag stems land on heads within 4px.

**7.6 Sheets and the rail.** Every sheet, drawer and modal stops at the rail's top edge (`bottom: var(--rail-h)`), so the rail is never covered. A sheet's backdrop dims the hall with `rgba(15,11,9,.55)` and `backdrop-filter: blur(6px)`. It is the only blur in the product, and it is on the backdrop element, never on UI.

### 8. Components

All components live under `app/components/hall/hud/`, `profile/` and `ui/` unless a path is given. Every interactive target is at least 44 x 44px on touch and 40 x 40px with a pointer. Every animation uses only transform, opacity or clip-path, and falls back to a 120ms opacity fade under `prefers-reduced-motion`.

**8.1 Ticket (the primary action).** `<button class="ticket">Play <span class="ticket-hint" aria-hidden="true">↵</span></button>`. The mask sits on a pseudo-element, so the focus outline is not clipped:

```css
.ticket { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 12px;
  height: 56px; min-width: 200px; padding: 0 32px; border: 0; background: none; color: var(--on-lacquer);
  font: 600 17px/1 var(--font-sans); letter-spacing: .01em; cursor: pointer; }
.ticket::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--lacquer);
  box-shadow: inset 0 1px 0 rgba(235,201,133,.45); transition: background-color var(--dur-1) var(--ease-out);
  -webkit-mask: var(--notch-mask); mask: var(--notch-mask); }
:root { --notch-mask:
  radial-gradient(circle var(--notch) at 0 0, #0000 98%, #000) top left / 51% 51% no-repeat,
  radial-gradient(circle var(--notch) at 100% 0, #0000 98%, #000) top right / 51% 51% no-repeat,
  radial-gradient(circle var(--notch) at 0 100%, #0000 98%, #000) bottom left / 51% 51% no-repeat,
  radial-gradient(circle var(--notch) at 100% 100%, #0000 98%, #000) bottom right / 51% 51% no-repeat; }
.ticket:hover::before { background: var(--lacquer-hover); }
.ticket:hover .ticket-hint { transform: translateX(2px); }
.ticket:active::before { background: var(--lacquer-press); }
.ticket:active { transform: translateY(1px); }
.ticket-hint { font: 500 13px var(--font-sans); opacity: .7; transition: transform 140ms var(--ease-out); }
.ticket[aria-disabled="true"] { color: var(--ink-3); font: italic 400 17px/1 var(--font-serif); cursor: not-allowed; }
.ticket[aria-disabled="true"]::before { background: transparent; box-shadow: inset 0 0 0 1px var(--rule-2); }
```

- Widths: the home column's full width; auto in the dock; full width on phones and at the bottom of sheets (sticky).
- Busy (waiting for the wallet): the label becomes Fraunces italic 17 "Waiting for your wallet…". No spinner.
- Disabled uses `aria-disabled="true"` (it stays focusable) and always has a reason line under it (§8.24).
- **Exactly one visible `.ticket` per screen state.** The result sheet and the share sheet have none.

**8.2 Text action** (every other action). `<a>` or `<button class="act">`: Schibsted 500 15px `--ink`. The underline is a background line: `background: linear-gradient(var(--brass), var(--brass)) 0 100% / 100% 1px no-repeat; padding: 12px 0 6px`. Hover: the line becomes 2px and `--brass-hi` over 140ms. Sizes: 15 (default), 17 (result sheet actions), 13 (inside a fine line). It may end with `→`, or `↓` for in-page anchors. Equal alternatives (Sell back / Keep, Copy link / Post on X / Download image) are always the same component at the same size, side by side.

**8.3 Icon button.** 40 x 40 (44 x 44 on touch), no box, a 20px icon in `--ink-2`, `--ink` on hover, a required `aria-label`.

**8.4 Underline field.**
- Structure: a wrapper with a label above (`.folio` in sheets, `.label-i` elsewhere) and an `<input>` with `background: transparent; border: 0; border-bottom: 1px solid var(--rule-2); padding: 0 0 10px; caret-color: var(--saffron)`.
- Value: Fraunces 500 opsz 36 at 30px (home name), 22px (nickname, "other" stake); Schibsted 400 15 in the chat. Placeholder: Fraunces italic 400 in `--ink-3` (home "your name" 30px, chat 16px). Font size is at least 16px on phones (no iOS zoom).
- Focus: the wrapper's `::after` (2px `--brass-hi`) scales X from 0 to 1 from the left over 240ms, and a `--ground-3` wash fades in behind over 140ms.
- Helper line, 8px under: the rule in `.fine` `--ink-2` ("3 to 16 characters: a–z, 0–9 and _."); valid: Schibsted 500 13 `--ink` "✓ available" (the check in ink, never green); invalid: Fraunces italic 14 `--ink` with a 2px `--oxblood-tag` left rule, padding-left 8 ("That name is taken."). Never red, never green.

**8.5 Stake selector.**
- `role="radiogroup" aria-label="Entry amount"`; options `0.1  0.25  0.5  1  other`, each a `role="radio"` button with roving tabindex. Arrow keys move and select; Home and End jump to the ends.
- Each option: min 44 x 48, padding 0 6px, gap 20px, Fraunces 600 opsz 36 at 30px (26 on phones), `--ink-3`. Hover `--ink-2`; selected `--ink` with a 2px `--brass` underline 6px under the baseline, one shared `::after` that slides between options with FLIP translateX over 240ms `--ease-out`. Focus-visible: the global outline.
- `other` is Fraunces italic 400. Choosing it replaces the word in place with an underline field 120px wide (Fraunces 22, `inputmode="decimal"`, placeholder `0.37`, unit ` SOL` in `.fine`), focused. Enter confirms; Esc reverts.
- Values above the 20 % cap (the Dock's existing check) stay visible with `aria-disabled="true"` in `--ink-4` and show the reason line "Cap reached: 20 % per entry, up to 0.62 SOL right now." while they are focused or hovered, and while the current choice is over the cap.
- Phones: the five options share the row (`flex: 1`, height 48).

**8.6 Fact** (a numeral and its label). The numeral (`.num-m` or `.num-l`) sits over a `.label-i`, left aligned, 6px apart. Siblings are separated by 1px `--rule` verticals as tall as the fact, with 20px on each side. A unit (`SOL`) is Schibsted 500 at 0.5em in `--ink-2` after a thin space. Never boxed, never coloured.

**8.7 Slot ruler.**

```css
.ruler { display: flex; justify-content: space-between; align-items: flex-end; height: 14px; }
.ruler i { width: 2px; height: 10px; background: var(--brass-lo); }
.ruler i.on { background: var(--saffron); }      /* slots elapsed */
.ruler i.now { height: 14px; background: var(--brass-hi); }
```

- 92 `<i>` elements. Lit = slots elapsed; the current slot is `.now`. Use `role="progressbar" aria-valuemin="0" aria-valuemax="92" aria-valuenow={elapsed} aria-label="Slots elapsed"`.
- In boxes narrower than 280px the ticks are 1px wide.
- A tick lights with a 120ms opacity fade; there is no tween between slots and nothing changes colour or pulses near the end.
- The loader variant adds the counter `57 / 92` at its right: the lit number in `.num-m` `--ink`, `/ 92` in `--ink-3`.

**8.8 The demo tag and slip** (`app/components/ui/DemoTag.tsx`, rendered in the root layout, so it is present on every route, the loader and the embed included). It renders only when `DATA_SOURCE === "demo"`; in chain mode it is not in the DOM.
- **Position**: `position: fixed; top: 0; left: calc(var(--gutter) + 72px + 24px)` (right of the wordmark); below 768, `left: calc(16px + 62px + 12px)`. On the loader it hangs from the top centre, 140px left of the centre line.
- **Cord**: 1px `--brass`, 14px long, from the viewport top to the eyelet.
- **Eyelet**: a 10px circle, 2px `--brass` ring, `--ground-0` hole, 6px below the tag's top.
- **Tag body**: 48 x 68px (40 x 56 on phones), flat `--oxblood-tag`, top corners chamfered 8px (`clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%, 0 8px)`). Two lines centred at the bottom with 8px padding: "Demo" / "hall" in Fraunces italic 600 15/16 `--ink` (13/14 on phones). No noise, no gloss, no gradient, no shadow.
- **It is a button**: `aria-expanded`, `aria-controls="demo-slip"`, `aria-label="Demo hall: figures are simulated"`. Hover: the tag drops 2px (the cord lengthens) over 180ms. Focus: the global outline.
- **Slip**: `--paper` (with the paper texture), 280px wide, padding 14px 16px, notched like the ticket, 6px under the tag, left-aligned with it and clamped 8px inside the viewport. Text: Fraunces italic 15/21 `--paper-ink` "Figures are simulated in your browser; nothing here touches Solana." Then a Schibsted 500 13 link "How Ladle runs on Solana →" (`/about#solana`). It opens with translateY(-8px)→0 and opacity over 180ms, and closes on a second press, Esc, or a click outside.
- **Motion**: once per session, on first paint, the tag settles from rotate(3deg) to -1.5deg to 0 over 700ms (origin at the cord's top). Never again. Nothing under reduced motion.
- **Below the fold**, every demo figure carries a brass † (Fraunces, 0.6em, superscript). Each section with figures ends with one `.fine` italic line in Fraunces italic 14 `--ink-3`: "† Demo figures, simulated in your browser. Nothing here touches Solana."
- **In the chat header**, while `status === "demo"`, the presence line ends with "· simulated players".
- These replace every `DEMO DATA` chip, `SourceChip` and `h.src.*` label in demo mode. The devnet and chain labels become one `.fine` line in the footer ("Devnet · real program, test SOL").

**8.9 Conserved rail** (`ConservedBar.tsx`, rewritten).
- `position: fixed; left: 0; right: 0; bottom: 0; height: var(--rail-h)`: 48px on desktop; on phones 64px plus `env(safe-area-inset-bottom)` as padding.
- Solid `--ground-0` with a 1px `--rule-2` line along its top edge.
- One centred sentence, real HTML: `BRAND.secondLine`, `.house` 18/24 `--ink` (15/20 on two lines on phones). Nothing else: no links, no ornaments, no close or collapse control.
- Present on **every** route: `/`, `/play` in every phase, `/h/[handle]`, the embed, every inner page, the 404 and the loader. It stays put while the home scrolls below the fold. The page reserves `padding-bottom: var(--rail-h)` so content is never hidden behind it. Footers do not repeat the sentence.

**8.10 Top bar** (`TopBar.tsx`).
- **Hall routes**: no background (the top scrim does the work), height `--top-h`, items vertically centred, x from `--gutter`.
  - Left: the wordmark link (§5).
  - Right on `/`: text actions "How it plays" (`#how`), "The odds" (`/odds`), "Verify" (`/window/latest`), 24px apart; 32px gap; the speaker icon button; 16px gap; then "Connect wallet" (a text action) or the player plate.
  - Right on `/play`: the speaker and the plate (or "Connect wallet") only.
- **Inner pages, 404**: solid `--ground` with the walnut texture, 72px tall, a full-bleed 1px `--rule` under it. Nav: "How it plays", "The odds", "Verify", "Integrate", "Security", "About", as text actions without underline except the current page (`aria-current="page"`: 2px `--brass` underline). No pill highlight.
- **Phones**: 56px, solid `--ground-0`; the wordmark 24px; the speaker and the menu icon buttons (44 x 44). The menu opens a full-height `--ground-2` sheet that stops at the rail. In it: the nav links in Fraunces 600 opsz 72 at 28px, separated by `--rule`, and at the bottom the sheet's one ticket "Connect wallet" (or the player plate when connected).

**8.11 Player plate.** A 32px square portrait (`portraitUrl(species, scarfId)`) with a 3px scarf stripe along its bottom edge, then the nickname (Schibsted 600 15 `--ink`) over `No. 0423` (Schibsted 500 13 `--ink-3`; omitted without Genesis). 44px tall, no box. It opens the profile sheet at step II. Phones show the portrait only.

**8.12 Instrument column** (`/play`; replaces `Dial.tsx`, `TickBar.tsx`, `LiveStrip.tsx`, `CurveCard.tsx`, `SealStamp.tsx`). `position: absolute; right: var(--gutter); top: calc(var(--top-h) + 24px); width: var(--instr-w)`, over `--scrim-instr`, all type with `--halo`. From the top:
1. `Round No. 1103` in Fraunces 600 opsz 36 at 22px `--ink`, then 8px, then the phase word in `.label-i`. Phase words: open → "open"; sealed → "sealed at slot 92"; seeded → "drawing"; settled and sold → "served".
2. The numeral (`.num-dial`, `RollingFigure`, `--ink`). Under it, 6px down, the `.label-i`:
   - open: "slots left · about 10 s" (seconds = slots left × 0.4, rounded);
   - sealed: the numeral reads 0, label "no entry, no exit";
   - seeded: label "seed requested from ORAO VRF";
   - served: label "next round at slot 0".
   Nothing changes colour, size or rhythm under 10 slots.
3. 12px, then the slot ruler at the column width.
4. 20px, then a facts row of three (§8.6) in `.num-m` at 26px: `3.71 SOL` / "in the pot" · `15` / "players" · `20 %` / "cap per entry".
5. 32px, then the curve fact: `0.0712` in `.num-m`, the label "curve price, SOL per 1M LADLE", then `.fine` "Past prices. Not a forecast." There is no sparkline.
6. After an entry, 24px, then the ticket stub (§8.14).

At 1024-1279: 224 wide, numeral 96, the facts on two rows (pot alone, then players and cap), 1px ticks. At 768-1023: a top-right block 200 wide with `Round No. 1103 · open` (Schibsted 600 14), numeral 64, the ruler (1px ticks), and one `.fine` line "3.71 SOL in the pot · 15 players · cap 20 %". The curve fact is hidden there.

**8.13 Dock** (`Dock.tsx`, rewritten; bottom centre over `--scrim-bottom`). At >= 1280 it spans from `gutter + chat-w + 24` to `W - gutter - instr-w - 24`, centred inside that span, bottom `rail-h + 24`. At 768-1023 it is full width minus gutters. There is no box.
- Row 1: the stake selector, 28px gap, the ticket "Scoop in · 0.25 SOL".
- Row 2 (12px under): `.fine` "1.00 % fee on entry · host fee 0 % · 20 % cap per entry · sell back any time, 0 fee". In a host room the host fee is written out ("host fee 2.00 % to @handle").
- Row 3 (only when needed): the reason line (§8.24).
- States, by phase and seat:
  - watching: `.house` 18 "You are watching." followed by the ticket "Take a seat";
  - open and seated: row 1;
  - entered: `.house` 18 "You're in · 0.25 SOL · your ball wears the cream band · seals at slot 92";
  - sealed: `.house` 18 "Sealed at slot 92 · no entry, no exit." with no ticket;
  - seeded: `.house` 18 "Seed requested from ORAO VRF. Nobody can pick it, us included.";
  - settled: the dock is replaced by the result sheet.
- The watching and sealed lines are in the dock, never over the drum.

**8.14 Ticket stub** (the entry receipt; replaces `Receipt.tsx` and `InChip.tsx`). Exactly one, at most 300 x 176px.
- Paper (`--paper` + texture), notched with `--notch-mask`, padding 14px 16px, with a 56px stub column on the right behind a 1px dashed `--paper-rule` vertical. The dashed perforation is the only dashed line in the product.
- Header: Fraunces 700 opsz 36 at 16px "Admit one", and on the right Schibsted 500 13 `--paper-ink-3` "Round No. 1103".
- Four line items in Schibsted 400 13/20 `--paper-ink`, each with a dot leader (a flex spacer with `border-bottom: 1px dotted var(--paper-rule)`, aligned to the baseline): "You put in" 0.2500 SOL; "Platform fee 1.00 %" 0.0025 SOL; "Host fee 0 %" 0.0000 SOL; "Buys on the curve" 0.2475 SOL.
- Footer: Fraunces italic 13 "Same price for everyone. The seed sets your scoop."
- Stub column: "No." over the Genesis number (or "Entry" over the entry's arrival index) in Fraunces 600 18, set horizontally.
- Desktop: it feeds out of the dock's top edge (clip-path `inset(100% 0 0 0)` to `inset(0)` in two steps: to 45 % in 140ms, a 60ms pause, then to 100 % in 260ms `--ease-out`), then moves into the instrument column with a FLIP over 320ms.
- Phones: it stays above the dock at full width (max 358) and collapses after 4s to a 40px paper strip "Admit one · Round No. 1103 · 0.2500 SOL in". Tapping the strip expands it again.
- It is removed when the round is served. Its values are the real fee split of the entry.

**8.15 Round chat** (`app/components/hall/hud/RoomChat.tsx`, replacing the restyled `game/Chat.tsx` in the hall). Data: `useChat()` (room lines, presence, `status`, `signed`, `slowMs`, `send`) and the round's house lines from `useRoundChat`, merged with `useRoomLog(msgs, lines, 200)`. One stream: people talking, commands and the house, in time order.
- **Placement, desktop**: x `--gutter`, width `--chat-w`, from `top-h + 48` to `rail-h + 24` from the bottom, over `--scrim-chat`. No box, no border. Text is capped at 44ch. Older lines fade out at the top: `mask-image: linear-gradient(to bottom, transparent 0, #000 72px)`.
- **Header** (one row, then 12px):
  - the folio "Round chat";
  - the presence strip: up to 5 square 20px portraits (the newest arrivals of `usePresence()`), 2px apart, each with a 3px scarf stripe along its bottom;
  - a `.label-i` count: "48 in the hall · 15 on stage" (`online`, and `present.filter(p => p.seat === "stage").length`), plus "· simulated players" while `status === "demo"`, "· slow mode, one line every 3 s" while `slowMs` is set, "· reconnecting" while `status === "offline"`.
  The count is hidden when `online` is 0 or unknown; it is never invented.
- **Line kinds** (one-to-one with `ChatLine.kind`; they must stay distinguishable in greyscale, by shape, not by colour):

| Kind | Rendering |
|---|---|
| `talk` | An 8 x 8px square in the speaker's scarf colour (vertically centred on the first line), 10px, the name in Schibsted 600 15 `--ink`, 8px, the text in Schibsted 400 15/22 `--ink-2`. Hanging indent 18px. Consecutive lines from the same profile within 30s omit the square and the name. |
| `command` | The square and the name as above, then the command as a **flat enamel token**: `--enamel` ground, Schibsted 600 13 `--enamel-ink`, padding 1px 6px, no radius, no brackets, written literally (`!scoop 0.25`) so people learn it. |
| `system` (the house, `from === null`) | No name. A 2px `--brass` left rule along the whole line block, padding-left 12px. The first line starts with the 14px logo mark (§5), 6px gap, then `.house` 15/22 `--ink`. |
| `notice` (the room) | Centred Schibsted 500 13 `--ink-3` between two 24px `--rule` hairlines, 8px from the text: "6 players took a seat", "Round No. 1103 sealed at slot 92". |
| personal notice (local only, from a `SendResult`) | Left-aligned Fraunces italic 15/21 `--ink-2` with a 1px `--brass-lo` left rule, padding-left 10px, `aria-live="polite"`. It is never sent to the room. Its text is `hintFor(reason, …)`, plus an action where one exists. |

- **Own lines**: the name gets a 1px `--ink` underline 3px under the baseline. Nothing else changes. An @mention of the viewer is `--brass-hi`.
- **Gating and limits** (personal notices, texts from `lib/chat/text.ts` `hintFor`):
  - `no-profile`: hint + the text action "Make a profile →" (opens the check-in sheet at step I or II);
  - `not-signed`: hint + "Sign once →" (`signInToChat()`);
  - `rate-limited`: hint with the wait; the line stays in the field; a 1px `--brass` line under the send button drains from right to left over `retryMs`;
  - `too-long`: hint; the counter under the field shows `163 / 160` in `--ink`;
  - `empty`: hint, once;
  - `unknown-command`: hint;
  - `offline`: hint; the header adds "· reconnecting";
  - `blocked`, `muted`: hint; when muted the field is `aria-disabled` with the hint as its reason line.
  - Before any send, without a profile, the placeholder reads "Read freely. Make a profile to talk." and focusing the field shows `.fine` "Talking needs a profile: a nickname signed by your wallet. It is not a transaction." under it.
- **Input** (one field for both): an underline field the width of the column, placeholder "Say something, or type !scoop 0.25". At its right sits the enter icon button (↵ in `--ink-3`, `--brass-hi` when the field is not empty). Enter sends; Shift+Enter does nothing (one line). A `.fine` counter "112 / 160" appears past 120 characters.
- **Command row** (under the input): five text keys `!scoop 0.25` `!odds` `!pot` `!verify` `!sell`, Schibsted 500 14 `--brass`, each with a 44px hit area, 16px apart. The row scrolls horizontally with `mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent)`, so `!verify` and `!sell` never clip. A key fills the field and focuses it (for `!scoop 0.25` the amount is selected so typing replaces it); it does not send.
- **Typeahead**: typing `!` as the first character swaps the command row for a list above the field on `--ground-2`. Five 44px rows, each the command in Schibsted 600 15 `--brass-hi` and its meaning in Fraunces italic 15 `--ink-2`: "!scoop 0.25 · enter this round with 0.25 SOL", "!odds · the law in one line", "!pot · what is in this round", "!verify 1099 · recompute a round", "!sell · sell your last scoop back, 0 fee". `role="listbox"` with `aria-activedescendant`. Up and Down move, Tab completes, Enter sends, Esc closes.
- **50 players** (all in the merge layer, before rendering):
  - joins within 4s coalesce into one notice "6 players took a seat";
  - when others send more than 3 commands within 1s, the first 3 show and the rest fold into the notice "+4 more !scoop" (one per command name);
  - keep the last 200 lines; each line gets `content-visibility: auto; contain-intrinsic-size: auto 22px`;
  - new lines enter only at the bottom; auto-scroll stays pinned while the reader is within 24px of the bottom; otherwise a centred `--ground-2` strip 32px tall above the input shows the text action "New lines ↓" (smooth-scrolls down and re-pins).
- **Motion**: a new line rises from translateY(4px) with opacity over 160ms; a command token stamps from scale(1.06) to 1 over 100ms; a notice's hairlines draw scaleX 0→1 over 200ms; the typeahead opens over 120ms (opacity plus scaleY .98→1, origin bottom). Scrolling history never animates.
- **768-1023**: a drawer at bottom-left over `--scrim-bottom`, 320 wide: the header, the last 3 lines, the input. Tapping the lines expands it to 60 % of the viewport height (translateY, 260ms `--ease-out`).
- **Phones**: §9.6 (5 lines under the hall band). Tapping them opens the chat full screen as a `--ground-2` sheet that stops at the rail, with the header, a 44px close, the lines, the command row and the input pinned above the keyboard: on `visualViewport` resize and scroll, set the sheet's height to `visualViewport.height - railH` and translate it by `visualViewport.offsetTop`.

**8.16 Name tags** (DOM pool in `Cast.tsx`, styled in `hall.css`; the markup `.w-tag > .w-tag-a + .w-tag-b + .w-tag-x` stays). Cast sets `--tag-scarf` inline.

```css
.w-tag { position: absolute; left: 0; top: 0; display: flex; align-items: baseline; gap: 6px; white-space: nowrap;
  font: 600 13px/1.2 var(--font-sans); color: var(--ink); text-shadow: var(--halo); will-change: transform;
  transition: opacity 150ms var(--ease-out); }
.w-tag::before { content: ""; width: 6px; height: 6px; align-self: center; background: var(--tag-scarf); }
.w-tag-b { font-weight: 500; color: var(--ink-2); }
.w-tag-x { position: absolute; left: 50%; top: calc(100% + 2px); width: 1px; height: 10px; background: var(--rule-2); }
.w-tag[data-me] { border-bottom: 1px solid var(--ink); padding-bottom: 2px; }  /* "YOU · mira 0.25" */
```

- No box, no pill, no background.
- Content: name and stake ("mira 0.25"); yours starts with "YOU · ".
- When every ball has landed (`stage.serveEnd`), **all** tags change at the same instant to the multiplier (`×0.946`) with one identical 160ms crossfade. No tag is highlighted, coloured, enlarged, delayed or ordered by value. The 3D serve still runs in arrival order (that is the hall's choreography, not a ranking).
- Budget: you, plus up to 14 others on desktop (12 on the home), you plus the 2 nearest on phones. Candidates are stage players only; stands players show a tag only while hovered or tapped.
- Culling, each frame, greedy, nearest to the camera first: drop a tag whose box (with a 4px margin) overlaps one already placed, the chat column, the instrument column, the dock, the top bar band (y < `top-h`), the result sheet or any open sheet. Clamp x to [8, W - 8 - width]; if clamping moves a tag more than 24px from its anchor, drop it.
- Performance: transform only; write a style only when it moved at least 0.5px; never more than 15 tag nodes in the DOM.

**8.17 Result sheet** (`ResultPanel.tsx` rewritten; replaces the v20 modal and `YourScoop.tsx`).
- **Placement**: it rises where the dock was. Width: from `gutter + chat-w + 24` to `W - gutter` (>= 1024; it covers the instrument column's lower part, the chat stays whole); full width below 1024. Bottom: `--rail-h`. Height: auto, at most `min(40vh, 320px)`. Solid `--ground-2`, a 1px `--rule-2` top line, padding 24px 32px. Its top edge stays below the cage sphere (§7.4).
- **Grid**: 4 columns left, 8 right (of 12).
- **Left (the viewer's entry)**:
  - the folio "Your scoop";
  - `3,288,225` in `.num-l` at 40px, with the unit "LADLE" in Schibsted 500 15 `--ink-3`;
  - Schibsted 400 15 `--ink-2` "×0.946 · sells back now for 0.2350 SOL, 0 fee";
  - 16px, then the two equal text actions at 17px, "Sell back now · 0 fee" and "Keep LADLE";
  - 12px, then the text action "Share round 1103 →".
  - Spectators get instead: the folio "Round No. 1103", `.house` 18 "15 players, one price.", and the round's buy `51,570,374 LADLE` in `.num-m` with the label "this round's single buy". There is no take-a-seat prompt in the sheet.
- **Right (the round)**:
  - the header row: Fraunces 700 opsz 36 at 22px "Round No. 1103 served", then `.label-i` "15 players · one price". At the right: `.fine` "seed ff34 29a1 … b127 · ORAO VRF ·" then the text action "Recompute" (13), which opens `/window/1103`;
  - `.label-i` "the players, in arrival order";
  - the list. Up to 15 entries: 3 columns of 5 (`grid-auto-flow: column`). Each row is 28px: the 8px scarf square, the name (Schibsted 500 14 `--ink`, ellipsis at 10ch), the LADLE figure and `×0.946`, both Schibsted 500 14 `--ink`, right aligned. 16 entries or more: one ruled list (arrival number, name, LADLE, ×), scrolling inside the sheet at most 180px tall.
  - Every row is identical. The viewer's row only gets the 1px `--ink` underline on the name. No sorting, no highlight, no colour on any value.
  - Under the list, `.fine` `--ink-2`: "Smallest ×0.772 · Largest ×1.479" (same size, same colour), then `.fine` "In: 3.710 SOL = 3.673 SOL bought on the curve + 0.037 SOL platform fee (1.00 %). Sum of scoops: 51,570,374 LADLE, exactly this round's single buy."
- **Sell back**: "Sell back now · 0 fee" swaps the actions row for Schibsted 15 `--ink` "Sell 3,288,225 LADLE for 0.2350 SOL at the curve price. Fee: 0." and two equal text actions "Confirm sell back" and "Cancel". If the curve moves before confirming, the amount updates in place. After the sale: "Sold back · 0.2350 SOL" (phase `sold`), no colour.
- **Closing**: a neutral close icon button (×, `aria-label="Close the result"`) at the sheet's top-right, or Esc, collapses it to a 56px stub in the same place: "Round No. 1103 served · your scoop ×0.946 · 3,288,225 LADLE" plus the text action "Open". When the next round opens, the sheet collapses to the stub by itself and the dock returns under it. The stub stays until closed or replaced by the next result.
- **Never**: "play again", "next round", "try again", or anything that invites re-entry.
- **Motion**: it rises translateY(24px)→0 with opacity over 320ms, starting 400ms after the tags have changed, with the same timing for every result.

**8.18 Share sheet and share card.**
- **Sheet**: a right sheet 440 wide (bottom sheet on phones) with the folio "Share round 1103", the card preview at full width, and three equal text actions "Copy link", "Post on X", "Download image". No ticket.
- **Card** (`components/hall/scoopCard.ts`, 1200 x 630 PNG): ground `#16120F` with the walnut texture at 6 %; the wordmark at 123 x 48, top-left at 64,58 (§5); the demo tag drawn flat top-right while in demo.
  - Left half: Fraunces 700 opsz 144 at 64px "15 players." / italic 600 "One price."; then Schibsted 500 28 "mira · ×0.946 · 3,288,225 LADLE"; then Schibsted 400 22 `--ink-2` "Smallest ×0.772 · Largest ×1.479" and the sum line.
  - Right half: the arrival-order list (up to 15 rows, Schibsted 500 20, all `--ink`, the same size).
  - Bottom: a 1px `--rule-2` line and `BRAND.secondLine` in Fraunces italic 24, plus `useladle.fun` in `.fine`.
  - The same layout for every result.

**8.19 Check-in sheet** (wallet, then character, then seat; replaces `ConnectSheet`, `ProfileModal`, `ProfileFlow` and `Steps` visuals).
- **Frame**: a right sheet 520px wide, from the top of the viewport to the rail, solid `--ground-2`, the double rule on its left edge, padding 40px, content left-aligned. Backdrop per §7.6. It enters with translateX(24px)→0 and opacity over 280ms `--ease-out` and leaves over 180ms `--ease-in`. Esc closes; focus is trapped; a close icon button sits at the top-right.
- **Phones**: full width, from the top bar to the rail, entering with translateY.
- **Step line** (the folio style): "I Wallet — II Character — III Seat". The current step is `--ink` with a 2px `--brass` underline; the others are `--ink-3`; a done step ends with " ✓" in `--ink`.
- **Step I, wallet**:
  - ruled rows 64px tall, one per Wallet Standard wallet: the wallet's own `icon` (the data URI the wallet provides, 28px), its name in Schibsted 600 17, and at the right `.label-i` "installed" or "get it ↗" (an external link). No monograms. When a wallet gives no icon, show no icon.
  - The last row: the logo mark 28px, "Demo wallet", `.label-i` "nothing on Solana".
  - Under the rows, `.house` 15 "Your wallet is your profile. Signing a message moves no SOL."
- **Step II, character**:
  - `.display-m` "Pick your character";
  - the live pet on a `--felt-900` pedestal well, 280px square, with `.fine` "Drag to turn" under it;
  - the 12 species as a 6 x 2 grid of 64px square portraits, 8px gaps, no frames. The selected one has a 2px `--brass` underline 4px below, and its name in `.label-i` under the grid. Arrow keys move.
  - the folio "Scarf", then six 28px **square** swatches, 8px apart. The selected one gets a 1px `--ink` outline at 3px offset.
  - the folio "Nickname", then the underline field (Fraunces 22) with the helper "3 to 16 characters: a–z, 0–9 and _. Shown on your name tag."
  - Genesis: the folio "Genesis", then `No. 0423` in Fraunces 600 opsz 72 at 40px `--brass`, flat (no gradient, no plate), then `.fine` "One of the first 1,000 Ladle profiles. It marks when you arrived. It carries no reward, no allocation and no extra share."
- **Step III, seat**: one `.house` 18 line "Your character waits in the gallery and steps onto the stage when you scoop in." and the ticket.
- The ticket at the bottom of each step is sticky (`position: sticky; bottom: 0`, on a `--ground-2` band with a 1px `--rule` top line): "Continue" (I), "Take a seat" (II and III).

**8.20 Charts** (SVG, `shape-rendering: crispEdges` on rules).
- **Curve**:
  - a step-after path, 1.25px `--brass` stroke; sells are down-steps in the same stroke;
  - gridlines 1px `--rule-ink`; axis numerals in Schibsted 400 13 `--ink-3`;
  - the now-dot is a 6px saffron **square**, with `.label-i` "now 0.0711";
  - range toggles are text actions "All rounds  Last 1,000  Last 100", the current one underlined;
  - hover shows a vertical 1px `rgba(246,238,227,.3)` line and `.label-i` "round 812 · 0.0583";
  - the caption "Past prices, read from the curve. Not a forecast." is always visible; the axis stops at the last real round, with no extrapolation;
  - the path draws by stroke-dashoffset over 1,200ms `--ease-in-out` once on first view, then the dot fades in.
- **24h bars**: outlined bars, 1px `--brass` stroke, no fill, 10px wide, 12px gaps, all one colour; hour labels Schibsted 13 `--ink-3`.
- **Beeswarm** (odds): every past scoop as a 6px cream **square** at 85 % opacity, identical size and colour, x from ×0 to ×2; a 1px `--brass` vertical at ×1 labelled `.label-i` "pro-rata"; axis ×0 ×0.5 ×1 ×1.5 ×2. Below it, two facts side by side in the identical style: "×0.502 / smallest past scoop" and "×1.840 / largest past scoop", then Schibsted 17 "62 % of scoops ended below ×1. Median ×0.895."

**8.21 Ledger.**
- Rows 64px, separated by `--rule`.
- Label: Schibsted 400 20 `--ink`. Value: Fraunces 600 opsz 36 at 28px, aligned on the decimal: `<span class="int">3,599</span><span class="frac">.063</span>`, where `.int` is right-aligned in a column as wide as the longest integer part, then the unit `SOL` in Schibsted 500 14 `--ink-3`.
- Hover: a `--ground-3` wash and a trailing `→` (each figure opens its rounds), 140ms.
- No count-up: figures appear final.

**8.22 Programme rows** ("How a round plays").
- Four rows separated by `--rule`, padding 28px 0.
- Each row: a Roman numeral in Fraunces 400 opsz 72 at 40px `--brass` in a 72px column; the title in Fraunces 700 opsz 72 at 32px `--ink` ("Join", "Seal", "Draw", "Serve"); one sentence in Schibsted 400 17/26 `--ink-2`; and at the right, a timing note in `.label-i`.
- The row matching the live round's phase shows a 24 x 2px saffron line under its numeral.

**8.23 Questions.**
- `<details>` rows between `--rule` lines.
- Summary: Fraunces 600 opsz 36 at 22px `--ink`, with a 12px hairline chevron at the right that rotates 180° over 240ms.
- Answer: Schibsted 400 16/26 `--ink-2`, max 62ch.

**8.24 Reason lines and feedback** (replaces `Toasts.tsx`).
- **Reason line**: Fraunces italic 15/20 `--ink-2`, directly under the disabled or failed action, `aria-live="polite"`. Examples: "Cap reached: 20 % per entry, up to 0.62 SOL right now."; "Sealed at slot 92 · no entry, no exit."; "Connect a wallet to scoop in."; "Your wallet declined. Nothing was sent."
- **Feedback in the room** goes to the chat as personal notices.
- **On /play**, a transient line ("Copied") appears under the dial label for 4s and fades out over 240ms.
- Nothing is ever green or red.

**8.25 RollingFigure** (`components/game/RollingNumber.tsx` extended; RollingNumber stays as a wrapper).
- `RollingFigure({ text })`: each digit of `text` is a column of 0–9 moved by translateY; any other character is static.
- Every digit column is `--digit-w` wide: the widest advance of 0–9 for that element's font and size, measured once per (font, size) with canvas `measureText` after `document.fonts.ready` (fallback 0.6em). Digits are centred in their column.
- A change moves each changed column over 240ms `--ease-out`, staggered 20ms from right to left. There is no overshoot, and it is the same for every value. Numbers never count up from zero.
- The value is in an `sr-only` span; the columns are `aria-hidden`.

**8.26 Section frame** (below the fold and inner pages).
- A full-bleed 1px `--rule` line at the section top.
- Padding 160px top and bottom (96px on phones).
- Content max 1200px wide, centred, 12 columns with 24px gaps, side padding `--gutter`.
- The folio `II · The programme` sits 24px above the headline; the headline is 64px above the content.
- Every section uses an asymmetric split (5/7, 7/5, 4/8 or 8/4). No equal-width column grids anywhere.

### 9. Screens

**9.1 Loader "Lights up"** (match `quiet-luxe-io\09-loader.png`; replaces `Loader.tsx` visuals and `.loader2`; fix the old ball coordinates and delete `brandPaths()` in `app/(hall)/layout.tsx`, using `BRAND.logo.word` directly).
- **Ground**: `--ground-0`.
- **Curtains**: two layers at 0–20 % and 80–100 % of the width: the velvet texture under `repeating-linear-gradient(90deg, rgba(0,0,0,.38) 0, rgba(255,255,255,.04) 3%, rgba(0,0,0,.38) 6.5%)`, hung from a 2px `--brass` rod across the top at y 24.
- **Light**: one warm cone, `radial-gradient(ellipse 40% 70% at 50% 0, rgba(255,226,168,.16), transparent 70%)`.
- **Centre stack**, centred, top at 30vh:
  1. the wordmark, 96px tall, drawn twice from `BRAND.logo.word.ink`: an outline layer (stroke `--ink` 1.5px, no fill) and a fill layer (`--ink`) clipped by a mask whose top edge is a soft sine (`y = top + (1 - p)·h + 3·sin(x/12 + t)`), rising with the real weighted progress `p`. The ball is not drawn until `p = 1`; then the saffron ball (`BRAND.logo.word.ball`) drops 40px into the d's bowl (280ms `--ease-in`), squashes to scaleY .94 for 80ms, and settles over 120ms. That drop is the final beat.
  2. 32px, then the slot ruler, 420px wide, lit by progress, with the counter `57 / 92`.
  3. 20px, then `.house` 20 `--ink-2` status: "Lighting the hall…", "Polishing the drum…", "Seating the players…", "Reading the current round…" (by load key).
  4. 8px, then Schibsted 15 `--ink-2` "Round No. 1100 is open · 14 players in · 4.95 SOL in the pot".
- **Also on the loader**: the demo tag hangs at the top (§8.8) and the rail sits at the bottom (z 62).
- **The peeking character** (`portraitUrl` of the viewer's own pet, else the fox) is drawn whole, 120px tall, standing at the inner edge of the left curtain, bottom 24px above the rail, in front of the curtain. It is never clipped.
- **Exit**: after the ball settles plus a 600ms hold, the stack fades and lifts 16px (320ms), the curtains part (translateX ∓100 %, 900ms `--ease-curtain`), and the camera dolly from the hall agent starts. Repeat visits in a session skip the loader (the existing `sessionStorage` flag).
- **Phones**: the wordmark 64px tall, ruler 280px.

**9.2 Home first screen, desktop >= 1100** (match `01c-home-desktop-framed.png`; framing per §7.5).
- The hall full-bleed with `--scrim-top` and `--scrim-home`.
- Top bar per §8.10, the demo tag hanging right of the wordmark.
- **The playbill column** (no box): x from `--gutter`, width `--col` = 440 (1100–1279), 480 (1280–1439) or 520 (>= 1440), vertically centred between `top-h + 32` and `rail-h + 24`. From the top:
  1. the folio "Round No. 1101 · open";
  2. 12px, then a facts row: `42` / "slots left" · `12` / "players" · `3.11 SOL` / "in the pot" (`.num-m` 28, `RollingFigure`);
  3. 12px, then the slot ruler at the column width;
  4. 40px, then the `<h1 class="display-xl">`: "Same price" / "for everyone." / *"Not the same scoop."* (the third line italic 600);
  5. 16px, then `.body` max 40ch: "Everyone pays in at the same price. When the round closes, one verifiable seed splits a single LADLE buy among the players.";
  6. 32px, then the underline field "your name" at the column width;
  7. 16px, then the ticket "Play ↵" at the column width;
  8. 12px, then `.fine` "1.00 % fee on entry · 20 % cap per entry · sell back at curve price, 0 fee";
  9. 4px, then the text action "Watch a round →" followed by `.fine` "watching costs nothing, no wallet needed".
- Below 760px of height, items 2 and 3 become one `.fine` line "Round No. 1101 · 42 slots left · 12 players · 3.11 SOL in the pot" over the ruler, and the gap before the headline becomes 24px.
- **Right of the column**: nothing but up to 12 name tags. No stats rail, no live feed, no Genesis counter, no curve, no sparkline.
- **Play**: Play with a valid name goes to the check-in sheet (no profile) or to `/play`. "Watch a round" goes to `/play?watch=1`.

**9.3 Home, stacked (< 1100) and phone** (match `03b-home-mobile.png`; 390 x 844 reference).
- The top bar (phone: 56, solid `--ground-0`).
- The hall band `clamp(240px, 40svh, 360px)` tall, view shift 0, at most 3 tags (6 at 768–1099), fading into `--ground-0` over its last 64px.
- Then on `--ground-0`, with gutters:
  - one `.fine` line "Round No. 1101 · 42 slots left · 12 players · 3.11 SOL" in `--ink-2`, with the ruler under it;
  - 16px, then `.display-xl` (38px phone, 3 lines);
  - 12px, then the `.body` sentence "One verifiable seed splits each round's single LADLE buy among the players.";
  - 20px, then the field (24px value);
  - 16px, then the full-width ticket "Play";
  - 12px, then the fine line and "Watch a round →".
- At 390 x 844 the ticket must sit fully above the rail without scrolling; the fine line may scroll. Content below continues into the sections.

**9.4 Below the fold (home)** (section frame §8.26; the canvas renders at 15 fps for two viewport heights, then holds one frame; tags hidden as in v20). `id="how"` is on section II. Grounds alternate as listed. Each ground has its texture at the stated opacity.

| # | Ground | Split | Content |
|---|---|---|---|
| II · The programme | `--felt-900` | 5 / 7 | (match `house-signage\04b-below-programme-v2.png`). **Left 5**: folio; `.display-l` "How a round" / *"plays."*; `.house` lede 20/30 "Four beats, about twenty seconds, the same for every player."; 40px, then the porthole: the drum still (§6.3) as a 280px circle inside the medallion ring. **Right 7**: programme rows (§8.22). I Join: "Everyone pays in at the same price." (note: "slots 0 to 92 · about 20 s"). II Seal: "At slot 92 the drum locks: no entry, no exit." ("slot 92"). III Draw: "One verifiable ORAO VRF seed splits the round's single buy." ("seed in about 4 s"). IV Serve: "One buy on the curve, split into scoops. The pot is conserved." ("sum of scoops = the buy"). Under the rows, the text action "Read the odds →". |
| III · The curve | `--ground` | 8 / 4 | (match `06-below-curve.png`). **Left 8**: folio; `.display-l` "Every round buys LADLE" / *"on the curve."*; `.body` "Each round makes one buy on the curve, so the price steps up. Each sell steps it down. This is the whole history since round 1."; the curve chart (§8.20), 440px tall, range toggles at its top-right; the caption. **Right 4**, top-aligned with the chart: three stacked facts (`.num-l`) separated by horizontal `--rule` lines, 32px apart: `0.0280†` "round 1 price, SOL per 1M LADLE"; `0.0711†` "curve price now"; `1,100†` "rounds served". Then the † footnote. |
| IV · Open books | `--oxblood-900` + velvet .10 | 5 / 7 | (match `07-below-books.png`). **Left 5**: folio; `.display-l` "Open books."; `.body` "Every figure is summed from the program's events since round 1. Open any figure to see the rounds behind it."; 48px, then the 24h bars with `.label-i` "the last 24 hours, rounds per hour". **Right 7**: the ledger (§8.21), eight rows: Rounds served; Players, distinct wallets; SOL entered; SOL bought on the curve; Platform fee, 1.00 %; Host fees; Keeper bounties; SOL sold back, 0 fee. Then `.house` 15 "Entered = bought on the curve + platform fee + host fees + keeper bounties, to the last base unit." (it must add up exactly from `Books`), the text action "Recompute any round →", and the † footnote. |
| V · The odds | `--ground` | 7 / 5 | **Left 7**: folio; `.display-l` "Measured," / *"not promised."*; the beeswarm (§8.20), 220px tall. **Right 5**: the two extreme facts, the "62 %" line, then `.house` 18 "!odds, in plain words: your share is your pro-rata share times a factor set by how your roll compares with the round's average roll." Then the text action "The odds, in full →" and the † footnote. |
| VI · Recompute any round | `--ground-2` | 4 / 8 | **Left 4**: folio; `.display-l` "Recompute" / *"any round."*. **Right 8**: the underline field "round number" (Fraunces 30, `inputmode="numeric"`) and the text action "Recompute →". The result appears inline as the ruled definition list of /window (§9.8) with "✓ Matches the program's record" and "Open round No. 1099 →". |
| VII · Bring Ladle to your stream | `--oxblood-900` + velvet .10 | 5 / 7 | **Left 5**: folio; `.display-l` "Bring Ladle" / *"to your stream."*; `.body` "Your viewers play from the chat. A host room can add a host fee of up to 3 %, written on every entry."; the text action "Integrate →". **Right 7**: the command glossary as ruled rows (the command in Schibsted 600 16 `--brass-hi` in a 160px column; the reply in `.house` 16 `--ink-2`). Then the folio "Founding hosts" and the list in arrival order (CSS `columns: 2`, a list, not a grid): "@handle" and a dot leader to "No. 1", plus `.label-i` "a founding host · the first 25 integrations · no extra fee". Demo hosts never use real streamer or brand names. |
| VIII · Genesis profiles | `--ground` | 4 / 8 | **Left 4**: folio; `423 / 1,000†` in `.num-l`; `.label-i` "claimed"; `.fine` "It marks when you arrived. No reward, no allocation, no extra share."; the text action "Make your profile →". **Right 8**: one horizontal row of 64px square portraits in arrival order (overflow-x auto, scroll-snap, a 24px mask fade at the right), each with the name (Schibsted 500 13 `--ink-2`) and `No. 0001` (`.fine`). |
| IX · House questions | `--ground-2` | 4 / 8 | **Left 4**: folio; `.display-l` "House" / *"questions."*. **Right 8**: question rows (§8.23). |
| Footer | `--ground-0` + walnut .06 | 4 / 8 | **Left 4**: the wordmark 48px; Fraunces 700 opsz 72 at 28px "Same price for everyone." / italic 600 "Not the same scoop.". **Right 8**: three link lists (Play: The hall, Watch a round · Learn: How it plays, The odds, Verify, Security · Build: Integrate, Brand, About), each headed by a folio; the X link `@ladlefun` as a text action; `.fine` source line ("Demo · figures simulated in your browser" or "Devnet · real program, test SOL"). Padding 96px top, `96px + rail-h` bottom. No chip. No conserved sentence (the rail shows it). |

**9.5 /play, desktop** (match `02b-game-room-desktop-dock.png` for the dock, scrims and chat column; `house-signage\02c-game-room-desktop-v3.png` for the chat lines, the presence count, the demo tag and the single stub).
- The canvas at the `room` shot, view shift per §7.5.
- Top bar per §8.10.
- The chat column (§8.15) on the left, the instrument column (§8.12) on the right, the dock (§8.13) at the bottom centre, name tags (§8.16) and the rail.
- **Phases**:
  - **open**: the numeral counts down and the ruler lights.
  - **seal**: the phase word becomes "sealed at slot 92", the numeral rolls to 0, the dock shows its sealed line, the chat prints the notice "Round No. 1103 sealed at slot 92", and one soft bell plays (muted by default).
  - **seeded**: the label "seed requested from ORAO VRF".
  - **serve**: the hall serves in arrival order; at `stage.serveEnd` all tags change together; 400ms later the result sheet rises.
  - **next round**: the sheet collapses to its stub and the dock returns.
- **The clear zone** is respected in every phase (§7.4).
- `?watch=1` starts as a spectator (the dock's watching state).

**9.6 /play, phone** (match `quiet-luxe-io\04-game-room-mobile.png`; 390 x 844). From the top:
1. **Top bar** (56px): the wordmark, the demo tag, the speaker and the plate portrait (or the menu).
2. **Round strip** (64px, `--ground-0`):
   - left: Schibsted 600 14 "Round No. 1103" over `.label-i` 14 "open";
   - centre: the numeral 48px over `.label-i` 14 "slots left";
   - right: `3.71 SOL` (`.num-m` 22) over `.fine` "in the pot · 15 players".
   Under it, 8px, the full-width ruler.
3. **Hall band**: `clamp(220px, 34svh, 320px)` tall, the camera centred. Only tags inside it: you plus the 2 nearest.
4. **Chat block**: the header (folio and count), the last 5 lines, the input. It opens full screen on tap (§8.15). The command row lives in the full-screen chat only; typing `!` still opens the typeahead.
5. **Dock**: the stake row (§8.5, 26px, height 48), 8px, the full-width ticket "Scoop in · 0.25 SOL", 8px, `.fine` on one line "1.00 % fee · host fee 0 % · 20 % cap · sell back any time, 0 fee".
6. **The rail** (64px plus the safe area).

At 390 x 844 nothing scrolls on /play. The ticket stub and the result sheet are bottom sheets that stop at the rail (the result sheet is full height minus the top bar).

**9.7 Wallet and profile sheets.** Match `quiet-luxe-io\05-profile-sheet.png`. The sheet stops at the rail's top edge; `house-signage\03-profile-sheet.png` shows it covering the rail on the right, which is wrong. Spec in §8.19. The hall stays visible and dimmed on the left.

**9.8 Inner pages** (`app/(site)/*`; match `quiet-luxe-io\08-odds-page.png`). No canvas. The top bar for inner pages, the section frame (§8.26) and the rail.
- **Page head**: the folio; `<h1 class="display-l">` on two lines (roman, then italic); `.house` lede 20/30, max 52ch; 64px to the content. No hero image, no banner, no stat strip.
- **/odds**:
  - "The odds," / *"in clear language."*;
  - **7/5**: left, the three clauses as programme rows numbered I to III (the v20 clause text); right, a `.house` 18 summary "In one round most entries end a little under pro-rata and some end well above. Over many rounds the factor averages ×1 at every stake.";
  - **12**: the beeswarm with the extremes and the 62 % line;
  - **5/7**: "See what a draw looks like", the simulator (`sim/Simulator.tsx` restyled: each slider is a 2px `--rule-2` track with a 12px `--ink` square thumb, 44px hit area; values in `.num-m`; steppers as `−` and `+` text actions);
  - **12**: the measured table as a ledger.
- **/window/[id]** (match `game-hud\06-verify-page.png` for content, Quiet Room grammar for form):
  - h1 "Round No. 1099" / *"served 27 Oct 2026."*
  - **5/7**: left, a ruled definition list (dt Schibsted 400 17 `--ink-2`, dd Fraunces 600 opsz 36 at 24px `--ink`): Closed: "27 Oct 2026, 37 slots ago"; Pot: "2.10 SOL"; Entries: "6"; Tokens bought: "29,390,414 LADLE"; Seed: a `.seed` row grouped by 4 (`ff34 29a1 …`) with the copy icon button, which shows `.label-i` "copied" for 1.2s. Right, the page's one ticket "Recompute the draws" and its `.fine` note "Runs in your browser from the seed and the entries.".
  - After recomputing: Schibsted 600 15 `--ink` "✓ Matches the program's record" (the check in ink), then the arrival-order ruled table (#, name, SOL in, LADLE, ×), all Schibsted 500 15 `--ink` at one size, then "Smallest … · Largest …" and the sum line. On a mismatch: "Does not match the program's record" in `--ink` with a 2px `--oxblood-tag` left rule, plus the first differing entry. Never red.
- **/security**: the clauses as numbered programme rows; code in wells.
- **/integrate**: the command glossary (§9.4 VII), then code wells (`CodeBlock.tsx`: `--ground-0`, a 1px `--rule` left rule, padding 20px 24px, system monospace 14/22 `--ink-2`, a copy icon button at the top-right, no radius, no corner ticks).
- **/about**: editorial 5/7 rows (folio, Fraunces 600 28 heading, body), plus the `#solana` anchor that the demo slip links to.
- **/brand**: the new kit:
  - the wordmark large on `--ground`;
  - the mark;
  - the five colourways as a ruled list (a 48px square sample, the name, the hex, the role), not tiles;
  - the palette with the new roles (lacquer "the one action on screen"; tomato "the app tile, stickers and the light-ground logo"; saffron "the ball: a signal, never a result");
  - the type pairing: a Fraunces specimen and a Schibsted Grotesk specimen with sizes from §4.3;
  - the "Don't" rules from the board;
  - the download list: every file in `BRAND.assets`, including the brass and mono marks and wordmarks, both lockups, `ladle-wordmark-2400.png`, `ladle-app-icon-1024.png`, `ladle-avatar-brass-1000.png`, `ladle-geometry.json` and `favicon.svg`. Each row is a text action "Download ↓". The tomato avatar is described as "charcoal ladle, cream ball, on tomato".
- **404** (`app/app/not-found.tsx`): the inner top bar.
  - **5/7**: left, the folio "404" (preceded by the 14px mark), `.display-l` "This door" / *"is closed."*, `.body` "The page you asked for is not in the hall.", the text action "Back to the hall →"; right, `public/hall-poster.webp` at 16:10, `filter: brightness(.6)`, with a 160px `--ground` fade on its left edge.
  - The rail.

**9.9 Embed** (`app/embed/[mint]`, 360–420px wide):
- the top row: the 20px mark, "Ladle" in Schibsted 600 15, the demo tag (phone size) hanging from the embed's top edge;
- a 16:10 hall band (or the poster);
- the round strip (§9.6) and the ruler;
- the stake row (4 values plus other) and the ticket;
- the fine line;
- the rail, inside the embed, 64px on two lines.
No chat (the host's own chat drives it). Host fee written in the fine line.

### 10. Motion

The type moves like a precise instrument; the scene does the playing. Nothing celebrates, nothing loops, nothing counts up.
- **Numbers**: `RollingFigure` (§8.25), 240ms, 20ms stagger right to left, no overshoot, identical for every value.
- **Ruler**: one 120ms opacity fade per slot.
- **Entrance after the loader** (home): each element fades in and rises 8px over 320ms `--ease-out`, staggered 50ms, in this order: the top bar; the folio and facts; the ruler; each headline line (clip-path from the baseline, 420ms); the field; the ticket; the fine lines. Name tags arrive last.
- **Ticket**: background 120ms; the hint nudges 2px on hover; press 1px over 80ms.
- **Field focus**: the brass line grows from the left over 240ms and the wash fades in over 140ms.
- **Stake**: the underline slides between options (FLIP, 240ms).
- **Chat**: lines rise 4px over 160ms; command tokens stamp over 100ms; the typeahead opens over 120ms.
- **Tags**: they follow the projection every frame (transform only); culled tags fade out over 150ms; every tag changes at the same instant with one 160ms crossfade.
- **Ticket stub**: it feeds out in two steps (140ms, 60ms pause, 260ms), then a FLIP to the column (320ms). The phone collapse takes 240ms.
- **Sheets**: in 280ms `--ease-out`, out 180ms `--ease-in`; the backdrop blur goes from 0 to 6px. The result sheet rises over 320ms, 400ms after the tags change.
- **Demo tag**: one settle per session (700ms); the slip drops in over 180ms.
- **Below the fold**: GSAP ScrollTrigger, once per element: a headline reveals line by line (yPercent 100→0 inside an overflow clip, 600ms `--ease-out`, 80ms stagger) when 20 % of it is in view; the curve draws over 1,200ms; ledger and programme rows fade in with a 40ms stagger (at most 6). No parallax, no pinning, no scrubbing.
- **Hover**: an underline thickens and turns `--brass-hi` over 140ms; a row washes in over 140ms. Nothing lifts.
- **Loader**: as in §9.1.
- **Reduced motion**: 120ms opacity fades only. Digits switch instantly, charts appear drawn, there is no dolly or curtain slide, and the tag does not settle.
- **Infinite animations**: none anywhere in the UI. The v20 `live-pulse` keyframes are deleted.

### 11. Copy changes

All copy is in `app/i18n/en.ts` (and `config/brand.ts`); every string above is the exact English to use. Both gates must pass after the edit.
- Retire the `h.src.*` chip labels. The demo tag and slip strings, the † footnote and the footer source line (§8.8) replace them.
- `h.chat.placeholder` → "Say something, or type !scoop 0.25".
- `h.dock.watching` → "You are watching.". `h.dock.closed` → "Sealed at slot 92 · no entry, no exit.".
- **Demo chat script** (`app/lib/chat/demo-lines.ts`, `demo.ts`):
  - Delete "gg all" and any line containing "gl", "good luck", "nice scoop", "lucky", "go again", "congrats", "rekt", "big one" or "another round".
  - Mock talk is about the room, never about outcomes: the drum, the scarves, the curve, how to join, the seed, greetings and goodbyes. Add at least 12 such lines, for example "the drum is lovely tonight", "first time here, how do I join?", "type !scoop and an amount", "where does the seed come from?", "ORAO VRF, it lands a few seconds after the seal", "teal scarf crew, hello", "is the curve the same for everyone?".
  - House lines never state, compare or rank an outcome: no "biggest scoop", no "lucky", no names attached to a multiplier.
- Nothing in the copy promises a gain or a price rise. "free" stays out of app copy (copy-lint): use "watching costs nothing".

### 12. DELETE list (v20 UI patterns)

Delete the component, the CSS and the i18n keys that only they use. "Replaced by" names the v21 piece.

| v20 pattern | Where | Replaced by |
|---|---|---|
| DEMO DATA chips, dashed mono capsules, `SourceChip` | `hud/SourceChip.tsx`, `.src-chip`, `.chip`, `.tag*`, `.badge*`, `h.src.demo*`, `common.demoData` | demo tag + † (§8.8) |
| Translucent HUD cards with brass hairline and corner ticks | `.hud-card`, `.hud-pane`, `.panel`, `.panel::after`, `.frame`, `.code-frame::after`, `--panel`, `--line-brass`, backdrop-filter on HUD | scrims + type (§6.1) |
| The four home corner panels | `hud/BooksCard.tsx`, `hud/GenesisCard.tsx`, `hud/CurveCard.tsx`, `hud/ActivityRail.tsx` (live feed), `.rail`, `.rail-l`, `.rail-r`, `.rails-below`, `.act-list` | playbill facts; sections III, IV, VIII |
| Top live strip pill and tick bar | `hud/LiveStrip.tsx`, `hud/TickBar.tsx`, `.live-strip`, `.home-ticker`, `.tablet-ticker`, `.tickbar`, `.live-dot`, `@keyframes live-pulse` | facts row + slot ruler |
| Centred PLAY card | `hud/PlayCard.tsx`, `.play-card`, `.home-sheet`, `.btn-play`, `.phone-first` | playbill column (§9.2, §9.3) |
| Stat pills, phase pill | `.room-pills`, `.phase-pill`, `.pill`, `.nav-pill`, `.seed-chip`, `.amt-chip`, `.cmd-chip`, `.in-chip`, `hud/InChip.tsx` | instrument column, stake selector, chat tokens |
| Dotted conic countdown ring | `hud/Dial.tsx` ring, `.dial`, `.dial-wrap` | `.num-dial` + ruler |
| Seal stamp graphic | `hud/SealStamp.tsx`, `.seal-stamp` | phase word + chat notice |
| Dock card with bordered stake boxes, flat tomato button | `.dock`, `.dock-row`, `.custom-in`, `.b-tomato`, `.btn-primary`, `.b-out`, `.b-ghost`, `.b-brass`, `.btn-secondary` | dock on the scrim, ticket, text actions |
| Receipt form card | `hud/Receipt.tsx`, `.receipt`, `.rcp-form`, `.rcp-out` | ticket stub (§8.14) |
| Result modal with spreadsheet table and three outline buttons | `.result-panel`, `.rp-*`, `.tbl`, `.entries-tbl`, `hud/YourScoop.tsx`, `.your-scoop` | result sheet (§8.17) |
| Share card-in-card | `.share-card-prev`, `.share-acts` | share sheet (§8.18) |
| Centred connect and profile modals, step pills, monogram wallet squares, circle swatches, gold Genesis bar | `.modal`, `.modal-veil`, `.steps`, `.wallet-row` monograms, `.swatches` circles, `.gen-plate`, `.genesis-plate`, `.avatar-pill` | check-in sheet (§8.19), player plate |
| Toasts | `hud/Toasts.tsx`, `.toast`, `.toasts` | reason lines, personal notices (§8.24) |
| Bottom conserved bar with mono links | `.conserved-bar` links | rail (§8.9) |
| Pill name tags with mono amounts | `.w-tag` v20 styles | §8.16 |
| Boxed chat with grey bot bubbles, clipped chip row, square send button, rainbow names | `game/Chat.tsx` in the hall, `.room-chat`, `.chat2`, `.phone-chat`, `.cmd-ref` | `RoomChat` (§8.15) |
| Mono everywhere, tiny mono footnotes | Geist Mono file and `localFont`, `.f-mono`, `.mono`, `.hud-label`, `.hud-num`, `.fine` (mono version), `.foot-note` | Schibsted `.fine`, Fraunces numerals |
| Dela Gothic One, Bricolage Grotesque | font files, `localFont` blocks, `.f-display`, `--font-display`, `--font-ui` | Fraunces, Schibsted |
| Stat tiles and KPI grids | `.stat-tile`, `.stat-tiles`, `.stats`, `.big-fig`, the six-cell grid on /window, `.tiles` | facts, definition lists |
| Segmented controls | `.seg`, `.seg-ctl` | text-action toggles |
| Feature grids and equal-column card grids | `.how-row`/`.how-step` four columns, `.grid-cards`, `.books-grid`, `.host-grid` (gold host tiles), `.odds-grid`, `.three-laws` | asymmetric splits, programme rows |
| Genesis avatar circle wall | `.gen-wall` | portrait row (§9.4 VIII) |
| shadcn-style FAQ with plus icons | `.qa`, `.qa2`, `.faq` styles | question rows (§8.23) |
| Hero banners with a blurred hall image, saffron Dela 1-2-3 | inner-page heads, `.page-head` banner, `.law` numerals | page head (§9.8) |
| Loader centre slab, DEMO chip, mono status, hardcoded old ball and letter viewBox | `Loader.tsx` internals, `.loader2`, `brandPaths()` in `app/(hall)/layout.tsx` | §9.1 |
| Any radius, pill radius | `--r-1`, `--r-2`, `--r-pill`, every `border-radius` in `globals.css` and `hall.css` | 0 and the notch |
| Icon squares with borders | `.icon-btn` box, `.btn-icon`, `.icon-tile` | icon button (§8.3) |

Keep (restyled, not deleted): `game/RollingNumber.tsx` (extended, §8.25), `game/useRoundChat.ts`, `PastDistribution.tsx` (beeswarm), `WindowDetail.tsx`, `sim/Simulator.tsx`, `fx/Faq.tsx` (as `<details>` rows), `CodeBlock.tsx`, `SiteFooter.tsx`, `profile/PetPicker.tsx` (logic), `hud/SoundToggle.tsx` (as an icon button), `hud/SeedLine.tsx` (as `.seed`).

### 13. Hand-offs, files, build order

**Files outside app/ that the build agent changes**:
- `config/brand.ts`, additively: `colors.lacquer: "#B8432A"` with the comment "the one action on screen; tomato is the tile and stickers", and `type: { display: "Fraunces", text: "Schibsted Grotesk" }`.
- `app/scripts/make-og.mjs`: Schibsted for any sans text (from the TTF of §4.1, step 4). Re-run make-brand and make-og.
- `app/screenshots/v21/brand/make-boards.mjs`: re-render the board with Schibsted replacing Geist and the new role text (optional; screenshots only).

**Waiting on the hall agent** (already flagged by the logo agent):
- `components/hall/Ladle.tsx` extrudes `BRAND.logo.mark.ink` (hole at 70.12, 18.42, r 4.68; ball at 42.51, 53.88, r 16.84);
- `public/hall-poster.webp` re-rendered with the new ladle;
- `hall.drumRect` and `hall.viewShift` (§7.4, §7.5);
- the tag budget, culling and simultaneous change (§8.16) in `Cast.tsx`.
If the hall agent has finished, the build agent makes these changes itself (it owns all of `app/` except `lib/data/chain.ts`).

**Other fixes**:
- `components/hall/scoopCard.ts`: draw the wordmark at 123 x 48 (not 142 x 48).
- Delete the hardcoded logo geometry in `Loader.tsx` and `brandPaths()`.

**Build order**:
0. **Feasibility first, no React.** Write `app/screenshots/v21/proto/home.html`, `play.html` and `play-phone.html`: static HTML with the §3 tokens, the §4 fonts (the subset files) and the §8 component CSS, over `ref-clean-home-16x9.png`, `ref-clean-play-16x9.png` and `ref-clean-play-9x16.png` as full-bleed backgrounds. Capture with Edge headless (fresh user-data dir; 1280 x 800 and 390 x 844). Read the captures next to `01c`, `02b` and `04`. Then adjust the headline clamp, the column width, the scrim stops and the dial size in this section (edit the spec) until the type sits on empty floor and nothing covers the drum. Only then build.
1. Fonts, tokens, base CSS; delete the dead fonts and the radius.
2. Ticket, text action, icon button, field, fact, ruler, RollingFigure, demo tag, rail, top bar.
3. Loader with the new logo.
4. Home first screen and view shift; the home stacked and phone layouts.
5. /play: instrument column, dock, stub, chat, tags, result sheet, share sheet.
6. Check-in sheet.
7. Below-the-fold sections and footer.
8. Inner pages, embed, 404, /brand.
9. Textures (Higgsfield, §6.2) and the porthole capture.
10. The DELETE list, copy, demo chat script.
11. Gates, captures, checklist.

Captures go to `app/screenshots/v21/build/` (desktop 1280 x 800 and 1440 x 900; tablet 1024 x 768 and 800 x 1024; phone 390 x 844 and 375 x 812). Reuse `app/screenshots/shoot-v20*.mjs` as `shoot-v21*.mjs`. The CDP script covers:
- the loader at 30 % and at the ball drop;
- the home first screen; below the fold (each section and the footer);
- the check-in sheet (each step);
- /play: watching, open with a seat, entered (with the stub), sealed, seeded, serving, the result sheet (entrant and spectator), the sell-back confirmation, the result stub, the chat typeahead, a personal notice (no-profile and rate-limited), and 50 players (`?watchers=35` with a 15-entry round);
- the share sheet; `/window/[id]` recomputed; `/odds`; `/security`; `/integrate`; `/about`; `/brand`; the embed; the 404.

### 14. Anti-slop acceptance checklist (the critics run this)

Each item passes or fails. Measured items are checked by a script over the CDP session (`getComputedStyle` and `getBoundingClientRect` on every visible element) and the result is pasted into the report. Visual items are judged by reading the captures.

**Form**
- [ ] No visible element has a computed `border-radius` other than `0px` (exceptions: none; the notch is a mask).
- [ ] No visible element has `backdrop-filter` other than the sheet backdrop.
- [ ] No element has a semi-transparent background (alpha between .05 and .95) together with a border: no translucent cards.
- [ ] No box-shadow except the ticket's inset highlight; no gradient except the scrims, the loader curtains and light cone, the masks and the 1px text-action underline.
- [ ] The computed font family of every visible text node is Fraunces or Schibsted Grotesk (system monospace only inside `.code-well`).
- [ ] `text-transform: uppercase` appears only on `.folio`; no text under 12px; nothing but the folio under 13px.
- [ ] Exactly one visible `.ticket` per captured state; the result and share sheets have none.
- [ ] No chip, pill, badge, stat tile, segmented control, accordion plus icon, corner tick, dashed border (except the stub perforation), emoji or icon in a box anywhere.
- [ ] Below the fold and on inner pages, no layout grid with three or more equal columns (`grid-template-columns` checked); every section is an asymmetric split.
- [ ] The wordmark is the SVG (never live text) at 28px tall in the top bar, and the loader's ball drop uses `BRAND.logo.word`.

**Honesty**
- [ ] The demo tag is in the DOM and visible on every captured screen in demo (home, below the fold, every /play phase including the result sheet, the loader, inner pages, the embed, the phone); it is absent with `NEXT_PUBLIC_DATA_SOURCE=chain`. Every demo figure below the fold carries a †.
- [ ] The rail is visible in every capture: `document.elementFromPoint` at its centre returns the rail, no sheet covers it, and it has no close control.
- [ ] Every result value (LADLE, ×, SOL) in the result sheet, the tags, /window and the share card has the computed colour `--ink` and one font size per screen; the smallest and largest appear together at the same size; lists are in arrival order.
- [ ] No "play again" or similar control; no streak; no count-up on any figure; no infinite animation (`document.getAnimations()` has no `Infinity` iterations).
- [ ] No sparkline or price chart on the home first screen; every curve shows "Past prices… Not a forecast."
- [ ] The books identity line adds up from `Books` to the last base unit.
- [ ] The demo chat script contains none of the words listed in §11; no house line ranks or names an outcome.
- [ ] `node --experimental-strip-types tests/forbidden-words.ts` (root) and `node scripts/copy-lint.mjs` (app/) pass.

**Game read**
- [ ] At 1280 x 800, the home first screen reads in this order: the round is live, what this is, your name, Play. The headline, the field and the ticket sit over empty floor: no character or drum part under any playbill text, measured against `hall.drumRect` and the tag anchors.
- [ ] No HUD element intersects the clear zone (§7.4) on `/` or `/play` in any phase; the clear zone is at least 560 x 420 at 1280 x 800.
- [ ] /play shows the countdown, the pot, the chat and the action without scrolling at 1280 x 800, 1024 x 768 and 390 x 844.
- [ ] In a greyscale capture of the chat, talk, command, house and notice lines can each be told apart.
- [ ] With 50 present: at most 15 tags on desktop and 3 on the phone; no tag overlaps another, the chat, the dock, the instrument column or a sheet; none is clipped by the viewport; the chat stays legible (text contrast at least 4.5:1 against the scrim measured behind it).
- [ ] The command row never clips (`scrollWidth` reachable, mask present); typing `!` opens the typeahead; every `SendResult` reason renders its personal notice.
- [ ] Touch targets are at least 44 x 44 on phones; stake options are a radiogroup with arrow keys; focus is visible on every interactive element; fields are at least 16px on phones.
- [ ] No horizontal scroll at 320, 375, 390, 768, 1024, 1280 and 1440.

**Craft**
- [ ] Each capture was read next to its mockup (§1); the report names the differences that remain and why.
- [ ] Textures: each passed its tile check or was replaced by its CSS fallback; none looks plastic in the page capture.
- [ ] Contrast: every text sample is at least 4.5:1 against its measured ground (cream on lacquer 4.71:1, never a lighter hover).
- [ ] `pnpm build` passes in app/; first-load font bytes stay under 220 KB.
- [ ] With 50 present, the desktop high tier holds 50 fps or more (report the number); tag DOM nodes are 15 or fewer; chat DOM rows are 200 or fewer.

### 15. v21 - the scroll tour (the home below the first screen)

The user's ask (French, gist): when you scroll, the camera that shows the game on the first screen moves and takes you round the game; no green or black zones; the text scrolls over it; the game keeps playing. This replaces, on the home only, the opaque "below the fold" sections of §9.4 and the "no scrubbing" line of §10 (inner pages keep their grounds).

**What it is.** The hall canvas stays fixed behind the whole home and keeps its full frame rate the whole way down (`hall.tour`, `FrameDriver`); nothing opaque covers it. One number, the tour position in stop units, comes from one passive scroll listener batched to one rAF (`tour/TourDriver.tsx` writes `tourBus.target`); `CameraRig` eases toward it in `useFrame` with a critically damped spring (smooth time 0.32 s), so a scroll never re-renders React and never reads layout. Positions and targets run on centripetal Catmull-Rom curves through the stops and their `via` points; lens and framing are interpolated between stops. Between two stops the camera holds still for the first and last 14 % of the distance (the text is read there) and travels, eased, in between.

**Keyframes file:** `app/components/hall/tour.ts` (`TOUR`: per stop a desktop key and a portrait key, `pos`, `look`, `fov`, `off`; `off` is the horizontal view shift on desktop, positive moves the subject right, and the lift on portrait screens, positive raises the subject). Stop 0 is `SHOTS.home` with the first screen's own lens, view shift and phone band, so the page at scroll 0 is unchanged. Desktop framing applies from 1024 px wide in landscape; portrait framing otherwise.

| Stop | Chapter (caption side, desktop) | Subject |
|---|---|---|
| 0 | the first screen (unchanged) | the home shot, its sway and parallax (fade out as the tour leaves) |
| 1 | II · How a round plays (text left) | the drum, cradle, hopper and chute from the front right |
| 2 | III · The room (text right) | the crowd on the felt from the left, the stands behind; live count of players on the felt, 60 places |
| 3 | IV · The scoop: Measured, not promised (text left) | the ladle over the drum, where it serves; every past scoop (swarm), smallest and largest in the identical style |
| 4 | V · The curve (text right) | the floor ticker on the stage's rim, read from the left; a small step chart since round 1, "Not a forecast." |
| 5 | VI · Open books (text left) | the bear host, seen down the gallery between the stage's plinth (r 4.0) and the stands (r 5.0); the ledger, the identity line, recompute in the browser |
| 6 | VII · Hosts (text right) | the stands and the left door with the fox bellhop; the five commands, the founding hosts |
| 7 | VIII · Genesis (text left) | close on the stands' faces and scarves by the door lamp; the count and twelve portraits |
| 8 | IX · Questions (text left) | back up and out to the whole room, the hall dimmed (veil to 0.42), the accordion; then the footer on a short dark fade |

**Rules.**
- The camera never enters geometry: `screenshots/v21/tour/check-path.mjs` samples both paths every 0.01 stop against the drum, the ladle and its rod, the crowd on the stage, the stands, the stanchions, the bear, the booths, the walls, the ceiling, the floor and the light cone; it must print "clear". A new stop that crosses something gets a `via` point, not a straight cut.
- Text: the existing copy (`P`) plus `TOUR_COPY` in `sections/copy.ts`; each caption is folio, two-line headline (Fraunces, `clamp(40px, 4.2vw, 60px)`), short body, one figure or small chart, one link to the inner page. Legibility comes from a feathered radial shadow under the caption (`.tour-cap::before`, no edge) and the halo; never a card, a box, a band or a bordered panel. A caption is read centred in the band between the top bar and the rail; a taller one starts under the top bar.
- Long material stays on its inner page (/odds, /window, /integrate, /security). Demo figures keep the dagger and one italic footnote per chapter. The conserved rail is unchanged.
- The top bar does not turn opaque on the tour: a soft fade sits under it. The first screen's playbill scrim leaves with the playbill. The DOM name tags are hidden (and not projected) below the first screen.
- The house lights come up a little while the tour is away from the first screen (hemisphere 0.25 to 0.55, environment +45 %, exposure +0.12): uniforms only, no light added.
- Play from anywhere: leaving for /play flies from the pose on screen; coming back flies (a straight path lifted into an arc) to the tour's pose for the restored scroll. Any jump of more than 1.6 stops (an anchor link, the side index, a restored scroll) is one such flight, never a run through every stop.
- Reduced motion: no camera travel; the camera cuts to the nearest stop while the hall dips to the veil for 120 ms; the text scrolls as usual.
- Desktop shows a thin brass side index (one tick per stop, the current one longer, labels on hover); phones and portrait tablets do not.

**Tooling** (run from app/): `screenshots/v21/tour/filmstrip.mjs` (one capture per stop and midway, any SIZES), `flight.mjs` (Play from mid-tour and back, per-frame camera log), `perf-scroll.mjs` (frame times while scrolling at a reader's pace), `scout.mjs` with `views*.json` (candidate framings through the dev camera override, which takes `shift` and `lift`). They launch Edge through `tour/cdp.mjs`, which closes Edge's own `edge://sync-confirmation-dialog` page as it appears: while that page is up, headless Edge throttles the page under test to 1 frame per second, which made earlier frame-time probes read about 1000 ms per frame.

**Measured** (RTX 4070 SUPER, 1280 x 800, DPR 1 to 1.5, scrolling top to bottom at 750 px/s): dev build, 50 players and 40 watchers: frame p50 4.2 ms, p95 9.5 ms, p99 15.5 ms, 0.3 % of frames over 16.7 ms; with the CPU throttled 4x (a mid laptop's cores), dev: p50 13.6 ms, p95 50 ms; production build (default demo crowd), 4x CPU: p50 8.4 ms, p95 20.8 ms, 5 % of frames over 16.7 ms, one long task (71 ms) in 13 s.

**State after the v21 fix rounds** (this replaces the lines above where they differ; `tour.ts` is the source of truth for the keys):
- Holds: the camera holds for 7 % of each segment, not 14 %. It is capped at 6 m/s along the path, with a 0.45 s smoothing. On portrait screens a stop holds until the caption's last line clears the rail (`tourAt` with measured holds).
- Flights: a lag of more than 1.6 stops is one flight at once. A lag of more than 0.9 stops becomes a flight when the page has stopped scrolling for 250 ms, or after 40 ms at the very top or bottom. The side index and the Home and End keys set `tourBus.dest`, so the camera flies straight there; a fling's flight follows the live target at a capped pace. Name tags stay hidden until the camera is back on the first screen with no flight under way. Flights rise over the crowd and go round the drum (`check-path.mjs` checks every stop pair).
- Framings: stop 1 shows the drum front-on between its uprights; stop 2 is high over the front left, with the whole felt ring, the stands and the drum in view; stop 3 puts the ladle in the upper third, about 30° off front-on, over the cage; stop 4 sits 1.6 m from the front left, the ticker reading in the left half and curving away before the caption; stop 5 is at least 2.9 m above the felt. The tour now goes round the right side, behind the stage and down the left.
- Captions: on desktop a fixed side scrim (`TourScrim` in `Chapters.tsx`) fades in on the side that has a caption, shaped like the first screen's; on portrait each caption has its own full-width ground at 0.9. Caption rows fade out one by one as they rise toward the top bar (scroll-driven animation, with a script fallback). The type is Figtree (v21.1), not Fraunces.
- Lights: exposure rises by 0.04 (not 0.12) away from the first screen, and the door lamps dim 30 % while the fill comes up.
- Warm-up: `HallWorld.tsx` compiles every material once the room is lit and draws the room once from each stop and halfway along each leg, so no shader compiles while scrolling; the shader error check is off in production.
- Sections: on landscape the curve and books chapters are 170vh tall (the others 140vh), because the curve to books leg (about 14 m) is the longest; the chapters' history reads run when the browser is idle, never on the scroll frame.

**v21.3 - the scroll model** (the user: the landing's scroll lagged and jumped when scrolled fast; this replaces the spring, the speed cap, the holds, the flights and the timing lines above). One path, one follow, no modes.
- Input: one passive scroll listener for the hall's pages (`tour/scroll.ts`) reads `scrollY` once per scroll event and hands it to write-only subscribers (the tour, the playbill fade, the top bar's Play, the side scrim, the hall's scroll state). No layout read and no React render on a scroll frame; the canvas does not measure on scroll (`resize={{ scroll: false }}`).
- Mapping (`tourAt`): each leg holds its two stops for 8 % of its length (the caption is read there and the camera sits exactly on its subject), then travels at an even pace with 20 % ramps (a trapezoid: C1, peak 1.25x the mean). The first leg moves from the first pixel. Portrait: the hold after a stop lasts until the caption's last line rises to 60 % of the read band.
- Path (`tourPose`): the Catmull-Rom curves sampled by perceptual distance (metres plus 4 m per radian of turn), so the camera moves and turns at an even pace inside a leg; lens and framing on monotone cubics through the stops (no kink, no bounce). Landscape: books and hosts 200vh, genesis 210vh, curve 170vh; portrait: books and genesis 210svh, how, curve and hosts 150svh (`screenshots/v21/scroll/build/legs.mjs`).
- Follow (`CameraRig`): one critically damped spring on the tour position, 0.1 s (0.08 s under a finger): half way in about 0.1 s, settled in under 0.3 s. No speed cap, no stillness test, no flights from scrolling. The sway and the parallax are added on top of the base pose and fade with the tour position only.
- Speed dim (`.tour-dim`): when a fling sweeps the picture faster than a pan reads (about 260 degrees a second equivalent), a dark layer under the captions comes up with the excess, to 0.5; none at a reading pace. The camera never lags to hide speed.
- Jumps: the side index and Home/End glide the page and the camera together along the path (0.5 s plus 1 s per 30 m, 0.6 to 1.6 s), or, past 36 perceptual metres, cut behind a 200 ms veil dip. A scroll the reader did not make that moves the tour more than 16 m in one step (an anchor, find in page) cuts behind a short dip. Coming back from /play is one timed arc (planFlight) whose end follows the restored scroll.
- Captions: rows rise 14 px out of the rail as they arrive (scroll-driven, from 1 % opacity), fade under the top bar as before; the desktop side scrim is computed on the scroll event from the captions' measured places (no transition).
- Reduced motion: the camera holds a stop and changes halfway through the leg while the veil dips to 0.92, scrubbed by the scroll (never a timed flash).
- React: the live window is an external store (`LiveProvider`: `useLive`, `useLiveSelect`, `useLiveEffect`); a live tick re-renders only what shows live figures, never the canvas. `HallWorld` is memoised; the pixel ratio is the Canvas's own state (never above the screen's, changed only once the page is still). Late floor and felt maps swap into 1x1 stand-ins (no shader recompile on a scroll frame); idle loads and the warm-up wait for the scroll to stop; the shadow map redraws at most 60 times a second.
- Measured (dev, RTX 4070 SUPER, 1280 x 800 and 390 x 844, `screenshots/v21/scroll/build/`): camera behind the scroll p50 75 to 105 ms, p95 112 to 176 ms (was 430 to 1356 / 741 to 2271); settled 100 to 300 ms after the last input (was 0.5 to 2 s); 0 flights (was 1 to 2 per fling); a wheel notch half-done in 92 to 97 ms (was 376 to 388); caption vs camera at reading pace p95 0.11 stop (was 0.51); 4x CPU slow trackpad frames p95 41 ms, 1 long task (was 90 ms, 30 long tasks); React components rendered per commit 4.9 (was 20.2).

## v21.1 - type and UI from the wordmark

**En bref.** La salle 3D, la visite caméra, la structure des écrans, le logo et la palette ne changent pas. On remplace l'écriture et l'habit de l'interface par un système né des lettres du logo « ladle ». Il n'y a plus qu'une famille, Figtree : en 900 avec la variante ss01, son a, son l, son d et son e sont ceux du logo. Fraunces, l'italique, les capitales espacées, les filets laiton, le ticket à encoches et l'étiquette bordeaux pendue disparaissent. L'interface est faite de plaques pleines et sombres sans bordure, avec des coins tirés du logo. La crème marque ce qui est à toi, la tomate la seule action de l'écran, et le safran ne sert qu'à la balle. Dans le chat, chaque joueur a le portrait de son animal, et la maison parle sous le nom « Ladle » avec la louche pour portrait. On parle et on tape des commandes dans le même champ. Le reste de cette section est en anglais, pour les agents qui construisent.

The mechanics, the honesty rules (v20 §2), the copy and the casino line are unchanged and apply to every line below. This section supersedes these parts of v21 wherever they disagree: §2 (rows Serif, Sans, On-screen action colour, Number of families, Demo marker, Chat look, Identity swatches), §3 (UI tokens), §4 (type, entirely), §5 (top-bar wordmark size), §6.1, §6.2 (UI textures), §6.4 (icons), §8 (the look of every component; behaviour, data and a11y rules stay), §9 (the visual parts of each screen; layout and order stay), §10 (motion), §12 (additions), §14 (the Form lines). §7 (layout, layers, the clear zone and the view shift) and §15 (the scroll tour) stay, with the numbers changed here.

### 1. Verdict

Both directions were judged from every board, study and mockup in `app/screenshots/v21/restyle/sibling/` and `app/screenshots/v21/restyle/crafted/`, set against the real wordmark (`app/public/brand/ladle-wordmark.svg`, `app/scripts/brand-lib.mjs`).

| | Sibling of the wordmark (Figtree, flat plates) | Crafted game hall (Outfit + Figtree, enamel and brass) |
|---|---|---|
| Taste and anti-slop for this user | **8.5**. Calm, crisp, clearly a game. Opaque plates with no hairlines and no glass. One voice. | **6.5**. Rich and warm, but it overdoes it: brass bezels, gradient keys with a drop edge, coins, enamel plaques and perforation. It reads as a mobile-game shop skin, which is the "too much" the user asked to avoid. |
| Harmony with the wordmark | **9**. Figtree 900 ss01 matches the l, a, d and e stroke for stroke, including the squircle bowls. The radii and the tag come from the lettering. | **7**. Outfit is close, but its bowls are circles where the logo's are squircles. Two families bring back two voices. Brass and enamel come from the hall, not from the letters. |
| Legibility in the game | **9**. Cream on charcoal everywhere, and every changing figure is tabular. | **7.5**. Bright enamel plaques pull the eye away from the drum. Small text on enamel is fine, but the dark-on-cream dial competes with the 3D. |
| Feasibility over the build | **9**. Real CSS rendered over clean plates of the live hall (`sibling/proto/kit.css`), one 25 KB font file, token names that map onto v21. | **6**. Ten materials, depth shadows and gradients, perforation masks. It also uses saffron as the action colour, which breaks the rule that saffron belongs to the ball. |

**Chosen: Sibling of the wordmark.**

**Grafted from Crafted:**
1. Pet portraits as identity wherever there is room: chat lines, the presence stack, the top-bar player plate and the species picker. Dense places (name tags, the result list, tables) keep the player-colour dot.
2. The house as a named speaker, "Ladle", with the ladle mark as its portrait. Its answers are readable ink-2 text, not grey footnotes.
3. The entry receipt's fee rows, kept as a cream "yours" plate with no paper and no perforation.
4. The ball on the progress groove, kept small: the leading end of the progress stem is a saffron ball of the stem's own diameter.
5. The felt pedestal under the live pet in the check-in sheet.
6. Zebra bands instead of rules in data tables, the "available" state never in green, and pips instead of brass ticks for the tour index.

**Changed from the Sibling pitch:**
- The font is self-hosted. Google's served Figtree drops ss01 and ss02 (§3.1), so next/font/google would lose the wordmark's a.
- ss01 depends on weight (800 and 900), not on size.
- Hover lightens the tomato instead of darkening it.
- The result sheet must not cross `hall.drumRect`.

Higgsfield credits used by this step: 0. The board for the user is `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\board.png` (French labels).

### 2. Mockups to match

Exact-type studies over clean plates of the real hall. These win over any AI image.

| Screen | Match this | Notes |
|---|---|---|
| /play, seated, mid-round (chat + dock) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\final\f1-play-1280.png` | The v21.1 reference, with every graft. Its HTML is `final\f1-play-1280.html` over `final\kit-final.css`. |
| Home, first screen | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\final\f2-home-1280.png` | |
| Tour caption (stop 1, "How a round plays") | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\final\f3-tour-how-1280.png` | The top keeps the soft fade (v21 §15). There is no solid band on the tour. |
| Result | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\proto\s4-result-1280.png` | Differences: chat lines as in f1, list values all in `--ink`, plate 440 wide and clear of `hall.drumRect`. |
| /play, phone | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\proto\s5-play-375.png` | Differences: portraits in chat lines, the stem's ball. |
| Check-in sheet | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\proto\s6-profile-sheet-1280.png` | Differences: species tiles show the real portraits, the preview well is felt, and the Genesis number sits on its own line. |
| Inner pages (/odds) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\proto\s7-odds-1280.png` | |
| Components and states (typeahead, keys, tags, stakes, sheet parts) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\proto\s0-system-sheet.png` | Where it differs from this section, this section wins. |
| Mood (Higgsfield, nano_banana_2_1; the 3D is AI-repainted) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\higgsfield\hf-01-play-1280.png`, `hf-02b-home-1280.png`, `hf-03-tour-how-1280.png`, `hf-04-result-1280.png`, `hf-05-play-375.png` | Use them for spacing and weight only. |
| Grafts (Crafted) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\crafted\01-play-room-desktop-r4.png` (portraits in chat, the house speaker, the groove ball), `crafted\06-profile-sheet-desktop-r2.png` (felt pedestal, portrait tiles), `crafted\00-system-sheet.png` (receipt rows) | Take the ideas only. Never copy their materials: no brass rims, no gradients, no coins, no enamel, no saffron key, no green. |
| Type evidence | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\boards\06-shortlist.png`, `crafted\specimens\A-closeup.png`, `final\ss01-google-vs-local.png` | |
| Before (v21 as built) | `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\sibling\before\*.png`; side by side: `sibling\compare-*.png` | |

### 3. Fonts

**3.1 The face.** One family: **Figtree** (Erik Kennedy, SIL OFL 1.1). Its next/font/google entry is `Figtree`: weights 300 to 900 plus `variable`, styles normal and italic, subsets latin and latin-ext (checked in `app/node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`).

**Do not load it through next/font/google.** On 2026-10-28 the Google Fonts CSS API served Figtree without ss01 and ss02. The static 900 file's GSUB has only `ccmp dnom frac locl numr pnum rvrn tnum`, and in Edge `font-feature-settings: "ss01"` left the two-storey a in place. The full upstream file has `aalt case ccmp dnom frac locl numr ordn pnum rvrn sinf ss01 ss02 subs sups tnum`. Evidence: `C:\Users\Utilisateur\Nouveau dossier (15)\app\screenshots\v21\restyle\final\ss01-google-vs-local.png`. Self-host it with next/font/local.

**3.2 The file** (fontTools 4.66.1 is installed; brotli is not, so the output is `.woff`):
1. Source: `https://github.com/google/fonts/raw/main/ofl/figtree/Figtree%5Bwght%5D.ttf` and `ofl/figtree/OFL.txt`, downloaded into the new directory `app/scripts/fonts/figtree-src/`. The same file is already at `app/screenshots/v21/restyle/sibling/fonts/figtree/Figtree[wght].ttf` (62,712 bytes; licence in `sibling/fonts/ofl-figtree/OFL.txt`), and copying it is fine.
2. `py -I -m fontTools.varLib.instancer "Figtree[wght].ttf" wght=400:900 -o figtree-400-900.ttf`
3. `py -I -m fontTools.subset figtree-400-900.ttf --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215" --layout-features="kern,liga,case,ss01,ss02,tnum,pnum,frac,numr,dnom,ccmp,locl,rvrn" --flavor=woff --output-file=app/public/fonts/figtree-latin.woff`. Measured on 2026-10-28: **24,740 bytes**, GSUB `case dnom frac locl numr pnum rvrn ss01 ss02 tnum`, wght axis 400 to 900. That one file replaces all three v21 files.
4. Copy `figtree-400-900.ttf` and `OFL.txt` to `app/scripts/fonts/` for make-og, make-brand and satori.
5. Delete `app/public/fonts/fraunces-roman-latin.woff`, `fraunces-italic-latin.woff` and `schibsted-latin.woff`. Delete the Fraunces and Schibsted TTFs in `app/scripts/fonts/` once make-og no longer reads them.
6. Record the source URL, licence, commands and size in `app/public/assets/ASSETS.md`.

**3.3 Loading** (`app/app/layout.tsx`; read `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`, "Local fonts", first):

```ts
import localFont from "next/font/local";
const figtree = localFont({
  src: [{ path: "../public/fonts/figtree-latin.woff", weight: "400 900", style: "normal" }],
  variable: "--font-figtree", display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"], adjustFontFallback: "Arial",
});
// <html className={figtree.variable}>
```

Remove the `fraunces` and `schibsted` declarations and their variables. Never load an italic. Keep `font-synthesis: none` on `html`.

**3.4 OpenType rules.** These are written so the features compose, because `font-feature-settings` does not merge between rules:
- **ss01** (single-storey a, the wordmark's a) is set with `font-feature-settings: "ss01"` on every role at weight 800 or 900: display, figures, the round number, plate titles, beat titles and main-key labels. Roles at 700 and lighter keep the two-storey a so text reads well. The user sees the logo's a wherever the type is heavy.
- **tnum** is set with `font-variant-numeric: tabular-nums` (never through `font-feature-settings`) on every figure that changes or sits in a column: the dial, facts, stakes, chat amounts, tags, tables, fees, seeds and the loader counter.
- **ss02** (tailed l, serifed I, slashed 0) is for `.seed` only: `font-feature-settings: "ss02"`.
- Lining figures by default. `case` comes on by itself around capitals.
- Generated images (scoopCard on canvas, OG through satori) cannot apply ss01. They use the default a. That is accepted.

### 4. Type roles

The class names are kept wherever v21 has them, so components change by CSS. Sizes are desktop / phone (< 768). Tracking applies at every size.

| Class | Weight, features | Size / line-height | Tracking | Colour | Use |
|---|---|---|---|---|---|
| `.display-xl` | 900, ss01 | `clamp(44px, 4.2vw + 10px, 64px)` / 0.94 (inner-page H1: `clamp(44px, 4vw + 26px, 76px)`); phone 44 | -0.028em | `--ink` | Home headline. Four block lines: "Same price" / "for everyone." / "Not the same" / "scoop". The full stop is a saffron ball 0.2em wide (`<span class="stop" aria-hidden="true">` plus a `.sr-only` "."), the only saffron in type. Inner-page H1s also use this class. |
| `.display-l` | 900, ss01 | `clamp(38px, 3.2vw + 20px, 60px)` / 0.98; phone 38 | -0.022em | `--ink` | Tour chapter heads, 404, section heads on the home. At most 2 lines. |
| `.display-m` | 800, ss01 | 32 / 1.05; phone 26 | -0.012em | `--ink` | Sheet titles ("Pick your character", "Round No. 1101 served"), inner-page section titles, footer line. |
| `.num-dial` | 900, ss01, tnum | 132 / 0.8 (96 at 1024-1279, 64 at 768-1023); phone 60 | -0.04em | `--ink` | The countdown. |
| `.num-l` | 900, ss01, tnum | 52 / 1; phone 40 | -0.022em | `--ink` (on cream `--on-cream`) | "Your scoop", Genesis number (34), facts on the tour, loader counter (44). |
| `.num-m` | 800, ss01, tnum | 30 / 1; phone 24 | -0.012em | `--ink` | Pot, players, cap, curve price, home strip figures, ledger values (24). |
| `.unit` | 700, ss01 off | `max(14px, 0.48em)` | 0 | `--ink-2` | "SOL", "%", "LADLE" after a figure, `margin-left: .14em`. |
| `.title` (new) | 800, ss01 | 18 / 1.2 (beats 19; footer columns 16) | -0.005em | `--ink` | Plate headers ("Round chat"), beat titles ("Join"), list heads ("The players, in arrival order"). |
| `.lede` | 500 | 18 / 1.5 (inner pages 20 / 1.5); phone 17 | 0 | `--ink-2` | One sentence under a headline, max 46ch. No italic. |
| `.body` | 450 | 17 / 1.6; phone 16 / 1.55 | 0 | `--ink-2` | Paragraphs, max 62ch. |
| `.ui` | 600 | 15 / 1.4 | 0 | `--ink` | Dock state lines (17), wallet rows (17), reason lines (15), menu items. |
| `.name` (new) | 700 | 15 / 1.42 | 0 | `--ink` | Names in chat and plates. |
| `.chat-text` (new) | 450 | 15 / 1.42; phone 14.5 | 0 | `--ink-2` | Chat message text. |
| `.label` (replaces `.label-i` and `.folio`) | 600, tnum | 14 / 1.3 | 0 | `--ink-3` (on the scene: `--ink-2` with `--halo`) | The label under each figure, section labels ("2 of 8 · How a round plays"), field labels. Sentence case. |
| `.fine` | 500, tnum | 13 / 1.45 | 0 | `--ink-3` | Fees, footnotes, helper text. Never smaller. |
| `.seed` | 500, ss02, tnum | 14 / 1.4 | 0 | `--ink-2` | Seeds, signatures, addresses, grouped by 4. |
| `.tok` | 700, tnum | 14 / 1.2 (quick commands 13) | 0 | `--ink` | Command tokens. |
| key labels | 800 ss01 (main), 700 (others) | 18 (16 for `.s`, 13 for `.xs`) | -0.005em | per key | §7.1 |
| tag text | 700 name / 600 value, tnum | 13 (phone 12) | 0 | §7.11 | Name tags, the demo tag (14). |

Rules:
- One family, no italics, no uppercase (`text-transform` is never `uppercase`), no positive letter-spacing, no serif, no mono (except code wells on /integrate and /security).
- Nothing is under 13px, except phone tags at 12px.
- Retire `.house`, `.house-18`, `.house-15`, `.fine-i`, `.folio`, `.dagger`, `.serif` and the `.display-* .i` italic spans. For one release, alias `.label-i` to `.label` and `.sans` to the body font.
- `h1`–`h3` base styles take the Figtree roles above, with no `font-variation-settings`.

### 5. Tokens

Edit the `:root` block of `app/app/globals.css` (and the `@theme` font lines). Names stay where they exist. **Changed or new** values are marked.

```css
@theme { --font-sans: var(--font-figtree), ui-sans-serif, system-ui, sans-serif; --font-mono: ui-monospace, "SFMono-Regular", Consolas, monospace; }
:root {
  color-scheme: dark;
  /* grounds (values unchanged; roles now named) */
  --ground-0: #0F0B09;   /* rail, inner-page top bar, footer, phone round band, loader, code wells */
  --ground:   #16120F;   /* page */
  --ground-2: #1C1512;   /* PLATES: chat, dock, sheets, name tags, inner-page plates, menu sheet */
  --ground-3: #241A15;   /* WELLS: inputs, secondary keys, stake keys, tokens, quick commands, stem track, avatar discs, zebra bands */
  --ground-4: #2E2620;   /* NEW: hover/pressed well, empty send key */
  --felt-900: #0F2621;   /* the pet pedestal well only */
  --oxblood-700: #5A1A1D;/* loader curtains only */
  /* ink */
  --ink:   #F6EEE3;      /* text, AND the surface of everything that is yours or chosen. 15.7:1 on --ground-2 */
  --ink-2: #D2C5B4;      /* 10.6:1 on --ground-2 */
  --ink-3: #A89884;      /* 6.4:1 on --ground-2, 6.1:1 on --ground-3 */
  --ink-4: #6E6053;      /* CHANGED (was #5E5146): disabled labels (exempt), unlit index dots. Never text that must be read */
  --on-cream:   #16120F; /* NEW: text on cream and on tomato */
  --on-cream-2: #5C4E42; /* NEW: secondary text on cream, 6.96:1 */
  --cream-2:    #E9DDCC; /* NEW: active row inside a cream plate */
  /* signals: one job each */
  --saffron: #FFB21A;    /* the ball only: logo ball, headline stop, the stem's ball, loader ball, 3D balls. Never a state, a control or a result */
  --tomato:  #FF5A36;    /* CHANGED ROLE: the ONE main key per screen. --on-cream label 6.0:1 */
  --tomato-hi: #FF6E4D;  /* NEW: hover, lights up, 6.7:1 */
  --tomato-down: #E8492A;/* NEW: press, 4.8:1 */
  --p-teal: #2EC4B6; --p-sky: #5AA9FF; --p-mint: #7ED957; --p-plum: #C77DFF; --p-tomato: #FF5A36; --p-saffron: #FFB21A; /* identity only */
  /* shape: from the lettering (stem 18 / x-height 56 = 0.32) */
  --r-key: 18px;   /* 52-56 px keys, stake wells, 56 px wells */
  --r-key-s: 14px; /* 44 px keys, cream notes (--r-note) */
  --r-key-xs: 10px;/* 30 px quick commands, step tokens, zebra bands */
  --r-tok: 9px;    /* 24-28 px tokens */
  --r-well: 15px;  /* 48 px wells */
  --r-note: 14px;  /* cream notes in chat */
  --r-cream: 16px; /* cream plates in sheets */
  --r-plate: 22px; /* plates */
  --r-state: 8px;  /* the round state tag */
  --r-tag: 13px 6px 6px 13px;      /* the handle tag: round end, flat end */
  --r-tag-demo: 15px 7px 7px 15px;
  /* layout (CHANGED values) */
  --top-h: 80px;         /* 56 px below 768 */
  --rail-h: 48px;        /* calc(52px + env(safe-area-inset-bottom)) below 768 */
  --gutter: 40px; --chat-w: 320px; --instr-w: 300px;   /* unchanged, with the v21 breakpoints */
  --plate-in: 16px;      /* NEW: plates sit 16 px outside the text column, so text keeps the gutter */
  /* scrims (CHANGED stops) */
  --scrim-top:   linear-gradient(180deg, rgba(15,11,9,.8) 0, rgba(15,11,9,0) 130px);
  --scrim-home:  linear-gradient(90deg, rgba(15,11,9,.95) 0, rgba(15,11,9,.92) calc(var(--gutter) + var(--col-home) + 40px), rgba(15,11,9,0) calc(var(--gutter) + var(--col-home) + 260px));
  --col-home: 480px;     /* NEW on :root (the scrim needs it there): 440 at 1100-1279, 520 at >= 1440; .playbill keeps --col: var(--col-home) */
  --scrim-chat:  linear-gradient(90deg, rgba(15,11,9,.86) 0, rgba(15,11,9,.78) 330px, rgba(15,11,9,0) 520px);
  --scrim-instr: linear-gradient(270deg, rgba(15,11,9,.86) 0, rgba(15,11,9,.74) calc(var(--gutter) + var(--instr-w)), rgba(15,11,9,0) calc(var(--gutter) + var(--instr-w) + 170px));
  --scrim-bottom: linear-gradient(0deg, rgba(15,11,9,.82) 0, rgba(15,11,9,.6) 110px, rgba(15,11,9,0) 260px);
  --halo: 0 1px 2px rgba(15,11,9,.7), 0 0 18px rgba(15,11,9,.55);  /* only free-standing text over the 3D */
  --grid: rgba(246,238,227,.07);  /* NEW: chart gridlines, the only thin line left */
  /* motion: unchanged names */
}
::selection { background: rgba(246,238,227,.28); color: var(--ink); }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }   /* on cream: --on-cream */
input, textarea { caret-color: var(--ink); }
```

**Squircle with a fallback.** Every rounded surface uses this pattern. Unsupported browsers get a smaller plain radius, so the shape looks about as round:

```css
.sq { border-radius: calc(var(--r) * .66); }
@supports (corner-shape: squircle) { .sq { corner-shape: squircle; border-radius: var(--r); } }
```

Circles (discs, dots, portraits, the ball) use `border-radius: 50%` and never take the squircle. The handle tags use their own two-radius shape.

**Retire:**
- Tokens: `--brass`, `--brass-hi`, `--brass-lo`, `--rule`, `--rule-2`, `--rule-ink` (use `--grid` in charts), `--lacquer`, `--lacquer-hover`, `--lacquer-press`, `--on-lacquer`, `--paper*`, `--enamel*`, `--notch`, `--notch-mask`, `--oxblood-tag`, `--oxblood-900`, `--font-serif` and `--font-fraunces`/`--font-schibsted`.
- **The rule `*, *::before, *::after { border-radius: 0 !important; }`.**
- The walnut and paper textures on UI surfaces (`.walnut-ground`, `paper-stock.webp`). Velvet stays on the loader curtains.

### 6. Shapes, materials, ornaments

**Materials, one job each.** Everything is solid and flat: no border, no blur, no gradient, no drop shadow, no texture.
1. **Charcoal plate** (`--ground-2`, `--r-plate`). It holds things: the chat, the dock, sheets, inner-page blocks and name tags.
2. **Well** (`--ground-3`). Anything you type into or choose from: inputs, stake keys, secondary keys, tokens, quick commands, the stem track and avatar discs.
3. **Cream** (`--ink` as a surface, `--on-cream` text). What is yours or chosen: your note, your scoop plate, your tag, the chosen stake, the current step, the state tag, the demo tag. One cream plate per screen region, and the same cream for any result, best or worst.
4. **Tomato.** The one main key per screen.

**Ornaments, all from the lettering:**
- **The handle tag** (the d's handle lying down, a round end with the hole and a flat end like the l) for name tags over the hall and the demo marker.
- **The ladle mark** (`BRAND.logo.mark`, cream ink and saffron ball) as the house's portrait in the chat and the rail's anchor.
- **Cream discs** with Figtree 900 numerals for sequences: tour beats, /odds sections, check-in steps. They replace Roman numerals.
- **The progress stem** (the handle, standing for time) ends in the ball.
- **Circles** for identity: pet portraits in discs where there is room (chat, presence, plate, picker), 8–10 px player-colour dots where it is dense (tags, result list, tables, charts' own marks).
- **The saffron full stop** of the home headline.

**Banned:** hairlines and underline fields, brass type and rules, notched tickets, the hanging oxblood tag, paper, perforation, daggers and footnote marks, Roman numerals, italics, uppercase tracking, glass and backdrop blur on UI (the sheet backdrop is the one exception), glows, gradient fills on controls, drop shadows, a green "ok" or a red "error", saffron on any control or state, and two tomato keys on one screen.

### 7. Components

Behaviour, data, aria and the 50-player rules of v21 §8 stay unless this section changes them. Only the look and the numbers below are new. Every hit target stays at least 44 x 44 on touch.

**7.1 Keys** (they replace `.ticket` and every action that was a `.act` text link; `components/ui` gets a `Key`):
- **Base `.key`**: inline-flex, centred, gap 10, height 56 (52 in the dock and on phones), padding 0 28, `--r-key` squircle, 800 18/1 ss01 tnum, no border, `transition: background-color 120ms, transform 80ms`.
- **`.key.main`**: `--tomato`, `--on-cream` label. A secondary part ("· 0.25 SOL") is 700 at 72 % opacity. Hover `--tomato-hi`; press `--tomato-down` + `translateY(1px)`.
  - **Exactly one visible per screen state**: Play, Scoop in, Take a seat, the page's one action on /window ("Recompute the draws"), the menu sheet's "Connect wallet".
  - The result sheet and the share sheet have none.
- **`.key.sec`**: `--ground-3`, `--ink` 700 label, ss01 off; hover `--ground-4`. Used for Connect wallet in the top bar, New lines ↓, Open, Copy link, Post on X, Download image.
- **`.key.cream`**: `--ink` surface, `--on-cream` 700. A step forward that commits nothing ("Continue" in the check-in).
- **`.key.char`** (only on cream plates): `--on-cream` surface, `--ink` 700. Two equal ones side by side ("Sell back now · 0 fee" | "Keep LADLE"; "Confirm sell back" | "Cancel"). Never one pushed over the other.
- **Sizes**: `.s` is 44 px, `--r-key-s`, 16 px, padding 0 18. `.xs` is 30 px, `--r-key-xs`, 700 13, padding 0 10 (step tokens, range toggles).
- **Disabled** (`aria-disabled="true"`, still focusable): `--ground-3` surface, `--ink-4` label, no hover, and always a reason line under it (§7.21).
- **Busy**: `--ground-3`, `--ink-2` 700 "Waiting for your wallet…", no spinner.
- **Focus**: 2 px `--ink` outline, 3 px offset (`--on-cream` on cream).
- **Icon key**: 40 x 40 (44 on touch), no surface, `--ink-2` icon (`--ink` on hover). Inside plates (close, send) it is a 36 px `--ground-3` circle.

**7.2 Links** (navigation only): 700 16 `--ink`, then the arrow "→" in `--ink-3` 5 px after it. On hover the arrow moves 2 px right over 120 ms. No underline. Links inside long prose on inner pages are 600 `--ink` with `text-decoration: underline 2px var(--ink-4)`, offset 3 px, `--ink-3` on hover. That is the only underline.

**7.3 Field `.well`** (replaces `.ufield`):
- **Surface**: `--ground-3`, height 48 (`--r-well`) or 56 next to a 56 px key (`--r-key`), padding 0 16 (home 0 20).
- **Text**: value 600 16 `--ink` (home 18). Placeholder 500 in `--ink-3`, no italic. Caret `--ink`. Phones: at least 16 px.
- **Focus**: surface `--ground-4` and the global outline.
- **Label** above: `.label` `--ink-2`.
- **Helper** under: `.label`.
- **Valid**: "available" 700 13 `--ink-2` inside the well at the right. Never green.
- **Invalid**: `box-shadow: inset 0 0 0 2px var(--ink-3)` on the well, and the reason line in `.ui` `--ink`. Never red.
- **"other" stake**: an inline well 92 px wide, placeholder `0.37`, unit `SOL` as `.label`.

**7.4 Stake selector** (`StakeSelector.tsx`; radiogroup, arrow keys, Home/End and the cap check are unchanged):
- **Options**: a row of `--ground-3` wells 52 x min 58 (`--r-key`, 6 px apart), labels 800 20 ss01 tnum `--ink-2`.
- **Chosen**: cream with an `--on-cream` label.
- **"other"**: 700 16 `--ink-3`.
- **Over the cap**: an `--ink-4` label, `aria-disabled`, and the reason line.
- **Phones**: the five share the row (`flex: 1`, height 48).
- The sliding underline (`.stakes .bar`) is deleted.

**7.5 Dock** (`Dock.tsx`):
- **Plate**: one charcoal plate from x `gutter + chat-w + plate-in` to `W − gutter − instr-w − plate-in` (548 px at 1280), bottom `rail-h + 12`, padding 10 10 8. Its top is about y 640 at 800 high, clear of the drum zone.
- **Row 1**: stakes plus `.key.main` (`flex: 1`), gap 10.
- **Row 2**: inside the plate, `.fine` centred: "1.00 % fee on entry · host fee 0 % · 20 % cap per entry · sell back any time, 0 fee" (host rooms spell out the host fee).
- **States**:
  - watching: `.ui` 17 "You are watching." + `.key.main` "Take a seat";
  - entered: `.ui` 17 "You're in · 0.25 SOL · seals at slot 92", led by a 10 px cream disc (your ball's band), no key;
  - sealed: `.ui` 17 "Sealed at slot 92 · no entry, no exit.";
  - seeded: `.ui` 16 `--ink-2` "Seed requested from ORAO VRF. Nobody can pick it, us included.";
  - settled: the dock narrows (§7.12).
- **Phones**: no plate. The full-width main key (52), then the fee line.

**7.6 Entry receipt** (`TicketStub.tsx`, reskinned; the graft):
- **Where**: a cream plate (`--r-cream`, padding 16 18, 300 wide) under the instruments while entered. It replaces the curve-price block until the round is served.
- **Header**: `.title` `--on-cream` "You're in" + `.label` `--on-cream-2` "Round No. 1103" at the right.
- **Rows**: four rows 600 14/22, label `--on-cream-2`, figure 800 tnum `--on-cream` right-aligned: You put in 0.2500 SOL; Platform fee 1.00 % 0.0025 SOL; Host fee 0 % 0.0000 SOL; Buys on the curve 0.2475 SOL. No dot leaders, no perforation, no stub number.
- **Footer**: `.fine` `--on-cream-2` "Same price for everyone. The seed sets your scoop."
- **Motion**: it enters with opacity and `translateY(8px)` over 240 ms.
- **Phones**: a cream plate above the main key that collapses after 4 s to a 40 px cream strip "You're in · Round No. 1103 · 0.2500 SOL" (tap to expand).

**7.7 Instruments** (`Instruments.tsx`; free-standing on `--scrim-instr`, no plate, `--halo` on all type, at `right: gutter`, `top: top-h + 24`, width `instr-w`):
1. The round number (800 22 ss01 tnum) and the **state tag** (cream, 24 px, `--r-state`, 800 13 `--on-cream`: open / sealed / drawing / served; the word crossfades over 160 ms).
2. 22 px, then `.num-dial`.
3. 12 px, then `.label` `--ink-2` 15 "slots left · about 17 s".
4. 16 px, then the progress stem.
5. 26 px, then three facts (`.num-m` + `.label`) separated by 30 px of air, no rules.
6. 30 px, then `0.0710` `.num-m` + `.label` "curve price, SOL per 1M LADLE" + "Past prices. Not a forecast."

The v21 breakpoint variants keep their sizes, with Figtree.

**7.8 Progress stem** (replaces `.ruler` everywhere; same `role="progressbar"` and aria values):
- **Shape**: height 10 (8 on phones and in narrow blocks), `border-radius: 999px`, track `--ground-3`, fill `--ink` at width `elapsed / 92`.
- **The ball**: the fill's leading end is a saffron circle exactly the stem's height (`::after` at `right: 0`). With 0 elapsed only the ball shows, at the left. No knob, no glow, no pulse, nothing near the end.
- **Motion**: the width follows each slot tick linearly (`transition: width 400ms linear`). On seal it is full with the ball at the end.
- **Places**: the home strip (480 wide), the instruments (column width), the phone round band (full width) and the loader (420 wide, with the counter `57 / 92`: `.num-m` `--ink` + "/ 92" `--ink-3`).

**7.9 Demo marker** (`DemoTag.tsx`; still rendered only when `DATA_SOURCE === "demo"`, on every route):
- **Where**: a cream **handle tag** sitting in the top bar, 22 px right of the wordmark and vertically centred. It no longer hangs: delete the cord, the eyelet, the chamfer and the once-per-session settle.
- **Desktop**: 30 px tall, `--r-tag-demo`, padding 0 13 0 30. A 10 px hole is punched 15 px from the left with `mask: radial-gradient(circle 5px at 15px 50%, transparent 4.5px, #000 5.5px)`, so the hall shows through. Text: "demo hall" 800 14 `--on-cream` + "simulated players" 600 14 `--on-cream-2`.
- **Phones**: 24 px, "demo hall" only, an 8 px hole.
- **The slip**: it stays a button that opens it. The slip is a cream plate 300 wide, `--r-cream`, 8 px under the tag, 600 15/1.45 `--on-cream` "Figures are simulated in your browser; nothing here touches Solana." + the link (700, `--on-cream`) "How Ladle runs on Solana →".
- **Other markers**: the chat presence line says "simulated players". Each tour chapter or inner-page block that shows demo figures ends with one `.fine` line "Demo figures, simulated in your browser. Nothing here touches Solana." No dagger.
- **Never** hidden, never dismissable.

**7.10 Top bar** (`TopBar.tsx`; height `--top-h` 80, phone 56):
- **Surface**: the hall routes have none (`--scrim-top` does the work, and the tour keeps its soft fade). Inner pages and the 404 get a solid `--ground-0` band.
- **Left**: the wordmark SVG 34 px tall (about 87 px wide; 26 px on phones), then the demo tag.
- **Right**:
  - nav 700 16 `--ink-2`, 28 px apart. The current page is `--ink` with a 4 px cream stem (radius 2) 10 px below it, as wide as the word.
  - 24 px, then the sound icon key;
  - 16 px, then "Connect wallet" (`.key.sec.s`) or the **player plate**. The plate is a 36 px round portrait (pet thumb on a `--ground-3` disc), the name 800 15 `--ink` over "No. 0423" 600 13 `--ink-3` tnum, and it opens the check-in sheet. On phones only the portrait shows.
- **Phone menu**: a `--ground-2` sheet down to the rail. Nav items are 800 26 ss01 rows with 20 px gaps and no rules; at the bottom, `.key.main` "Connect wallet" (or the plate).

**7.11 Name tags** (`Tags.tsx`/`Cast.tsx`, styled in `hall.css`; the `.w-tag > .w-tag-a + .w-tag-b + .w-tag-x` markup, the budget, the culling and the simultaneous change of v21 §8.16 stay):
- **Shape**: an opaque `--ground-2` handle tag, 26 px tall (24 on phones), `--r-tag`, padding 0 10 0 25.
- **The hole**: `::before` is a 10 px circle in `--tag-scarf` at 8 px from the left, so the hole holds the player's colour.
- **Text**: `.w-tag-a` 700 13 `--ink`, `.w-tag-b` 600 13 `--ink-2` tnum. No text-shadow.
- **Yours** (`[data-me]`): cream with `--on-cream` / `--on-cream-2` text, "you · mira 0.25".
- **Anchor**: `.w-tag-x` gets `display: none`; the tag's bottom centre sits 8 px above the head anchor.
- **After the serve**: every tag shows its multiplier at the same instant, same size and same colours.

**7.12 Result sheet** (`ResultPanel.tsx`):
- **Placement**: a charcoal plate on the right, `right: gutter − plate-in`, `top: top-h + 12`, `bottom: rail-h + 12`, 440 wide at 1280 (`min(440px, W − drumRect.right − 40px)`). It replaces the instruments while open.
  - It must never intersect `hall.drumRect` itself; it may enter the clear zone's padding. This replaces the v21 §7.4 exception.
  - The chat stays. The dock narrows to the span between the chat plate and the sheet (stakes 0.1 to 1 without "other", plus "Scoop in · 0.25").
  - Padding 22 24, scrolling inside.
- **Head**: `.display-m` "Round No. 1101 served", then `.label` `--ink-2` "13 players · one price", plus the close icon key.
- **Your scoop** (entrants): a cream plate (`--r-cream`, padding 16 18):
  - `.label` 700 `--on-cream-2` "Your scoop";
  - `.num-l` 50 `--on-cream` "2,803,060" with `.unit` "LADLE" 800 17 `--on-cream-2`;
  - 600 14.5 `--on-cream-2` tnum "×0.806 of pro-rata · sells back for 0.1994 SOL, 0 fee";
  - the two equal `.key.char.s`.
- **Spectators** get no cream plate: `.title` "13 players, one price." + `.num-m` "46,774,784" + `.label` "this round's single buy".
- **List**:
  - `.title` 16 "The players, in arrival order", with the link "Share →" (700 14) at the right.
  - Two columns (`grid-auto-flow: column`) of rows 500 14.5/1.85 tnum: an 8 px player dot, the name 600 `--ink-2` (yours 800 `--ink`, nothing else), then the LADLE figure and the `×` factor right-aligned, both `--ink`. No numbering, no rules, no row highlight, no ordering by result.
  - 15 or more entries: one column scrolling in a 220 px box with a 24 px mask fade.
- **Under the list**: 700 14 `--ink` "Smallest ×0.791 · Largest ×1.305" (one style for both), the sum line in `.fine`, then `.seed` 13 `--ink-3` "seed 8a2e ac93 … 41ee · ORAO VRF ·" and the link "Recompute →".
- **Sell back**: the two keys swap for 600 14.5 `--on-cream` "Sell 2,803,060 LADLE for 0.1994 SOL at the curve price. Fee: 0." + two equal `.key.char.s` "Confirm sell back" | "Cancel". The amount updates in place. Afterwards: 800 `--on-cream` "Sold back · 0.1994 SOL".
- **Close and next round**: the sheet collapses to a 56 px plate stub in the same column, "Round No. 1101 served · your scoop ×0.806 · 2,803,060 LADLE" + `.key.sec.s` "Open". When the next round opens, the instruments return above the stub. Never "play again" or anything like it.
- **Phones**: a bottom sheet from under the top bar to the rail.

**7.13 Share sheet and card.**
- **Sheet**: a right plate 440 wide (a bottom sheet on phones): `.display-m` "Share round 1101", the card preview (`--r-cream`), then three equal `.key.sec.s` "Copy link", "Post on X", "Download image". No main key.
- **Card** (`scoopCard.ts`, 1200 x 630): a flat `#16120F` ground with no texture.
  - The wordmark at 123 x 48 at (64, 58), and the cream handle tag top-right while in demo.
  - Left: Figtree 900 64 "13 players." / "One price." (no italic); 700 28 "mira · ×0.806 · 2,803,060 LADLE"; 500 22 `--ink-2` "Smallest ×0.791 · Largest ×1.305" and the sum line.
  - Right: the arrival list in 500 20 `--ink` with player dots.
  - Bottom: a `--ground-0` band with the mark, `BRAND.secondLine` 650 24 and "useladle.fun" 500 16 `--ink-3`.
  - Register the Figtree TTF with `FontFace` before drawing. Same layout for every result.

**7.14 Round chat** (`RoomChat.tsx` and the `.rchat*`, `.ln*`, `.typeahead`, `.cmd-row` rules in `hall.css`). The data and the `ChatLine` contract (`app/lib/chat/types.ts`) are unchanged.
- **Plate, desktop**: `left: gutter − plate-in` (24), `top: top-h + 12` (92), width `chat-w + plate-in` (336), `bottom: rail-h + 12`, `--ground-2`, `--r-plate`, padding 18 16 16. The text column stays on the gutter. 1024-1279: the same with chat-w 280. 768-1023: the v21 drawer behaviour, styled as this plate.
- **Header**: `.title` "Round chat" at the left; at the right, 600 13 `--ink-3` tnum "56 in the hall · 14 on stage". The count is hidden when `online` is 0 or unknown.
- **Presence row**: the 4 newest arrivals as 28 px portraits on `--ground-3` discs, each with a 2 px `--ground-2` ring, overlapping by 8 px. Then 600 13 `--ink-2` "+52 more" over 12.5 `--ink-3` "simulated players" (demo), "slow mode, one line every 3 s" or "reconnecting".
- **Log**: bottom-anchored, 7 px gaps, 15/1.42 (phone 14.5). The top fades through `mask-image: linear-gradient(180deg, transparent 0, #000 56px)`. Rows keep `content-visibility: auto; contain-intrinsic-size: auto 24px`. Last 200 lines.
- **Line kinds** (RoomChat row kinds; distinguishable in greyscale by shape):

| Row | Look |
|---|---|
| `talk` (`.ln.talk`) | A 24 px portrait disc (`portraitUrl(species, scarfId)` thumb on `--ground-3`; `scarfId` from the profile's scarf hex through `lib/profile` SCARVES), 9 px, `.name`, 6 px, `.chat-text`. A follow-up from the same profile within 30 s drops the disc and the name and hangs on the text column, 4 px closer. Your own lines: your disc gets a 2 px cream ring, nothing else. An @mention of you is 700 `--ink`. |
| `cmd` (`.ln.cmd`) | Disc + name + a `.tok` well (`--ground-3`, `--r-tok`, padding 2 8 3, 700 14 tnum `--ink`), written exactly as typed (`!scoop 0.52`). It reads as a key, not as highlighted code. More than 3 others' commands within 1 s fold into a notice ("+4 more !scoop"). |
| `sys` (the house, `from === null`) (`.ln.sys`) | A speaker named **Ladle**: a 24 px `--ground-3` disc holding the 16 px ladle mark (cream ink, saffron ball), the name "Ladle" in `.name`, the text in `.chat-text` `--ink-2`, and links inside as 700 `--ink` ("Recompute →"). Follow-ups group like talk. Replies to `!odds`, `!pot` and `!verify` are written here, readable. |
| `notice` (the room) (`.ln.notice`) | No disc, no name: 550 13.5/1.4 `--ink-3` tnum, indented to the text column (33 px). One line where possible: "Round No. 1100 sealed at slot 92 · 14 entries, 4.95 SOL in", "6 players took a seat". No rules, no centring, no italics. |
| personal (`.ln.mine-note`, local only, `aria-live="polite"`) | A cream note (`--r-note`, padding 10 12 11) indented to the text column: 600 14.5/1.4 `--on-cream`, figures 800, tokens inverted (`--on-cream` surface, `--ink` text). Actions are `.key.char.xs` ("Make a profile", "Sign once"). The same cream for any result. |

- **Input** (one field for talk and commands): a `.well` 48 px, padding 0 6 0 16, placeholder "Say something, or type !scoop 0.25" (without a profile: "Read freely. Make a profile to talk.").
  - **Send key**: a 36 px circle inside the well at the right, an arrow-up icon. It is `--ground-4`/`--ink-3` while empty and becomes `--ink`/`--on-cream` when there is text (120 ms).
  - **Rate limit**: the send circle shows a 2 px `--ink-3` ring that drains over `retryMs` (conic mask). This replaces the 1 px drain line.
  - **Counter**: `.fine` "112 / 160" under the field past 120 characters. Focusing without a profile shows `.fine` "Talking needs a profile: a nickname signed by your wallet. It is not a transaction."
- **Typeahead** (typing `!` first): a cream plate (`--r-well`, padding 6) above the input. Rows 40 px (44 on touch), `--r-key-xs`: the command 800 14 `--on-cream` (min-width 96) + its meaning 600 14 `--on-cream-2`; the active row is `--cream-2`. The listbox keys and the five v21 rows are unchanged.
- **Quick commands**: one row under the input of 30 px `--ground-3` tokens (`--r-key-xs`, padding 0 9, 700 13 `--ink-2`, 5 px apart): `!scoop 0.25` `!odds` `!pot` `!verify` `!sell`. On narrow widths it scrolls with a 24 px right mask and never clips. A token fills the field and never sends.
- **New lines ↓**: a centred `.key.sec.s` 10 px above the input.
- **Portrait files** (new; build agent):
  - generate `public/assets/pets/thumb/<species>-<scarf>.webp` at 64 x 64 (q 80, cover, focus 50 % 30 %) from the 72 existing 256 px portraits, with sharp, in a script under `app/scripts/`;
  - chat discs use `<img width="24" height="24" loading="lazy" decoding="async" alt="">`, so 200 rows decode at most 72 small files.
- **Phones**: the plate sits 10 px from both edges under the hall band, with the last 4 lines and the input. A tap opens the full-screen `--ground-2` sheet: header, a 36 px close circle, lines, quick commands, and the input pinned above the keyboard (the v21 `visualViewport` rule).

**7.15 Check-in sheet** (`ProfileFlow.tsx`, `PetPicker.tsx`):
- **Frame**: a charcoal plate on the right, 480 wide, `right: 24`, `top: 24`, `bottom: rail-h + 12`, padding 26 28. The backdrop stays `rgba(15,11,9,.55)` + `blur(6px)`, the one blur. The rail is never covered. Focus trap and Esc as v21.
- **Steps**: three `.key.xs` tokens "1 Wallet", "2 Character", "3 Seat". The current one is cream; a done step is `--ground-3` `--ink` with a check icon; a step still to come is `--ground-3` `--ink-3`. Plus the close circle.
- **Step 1, wallet**:
  - rows are `--ground-3` wells 64 px, `--r-key`, 8 px apart: the wallet's own icon 28 px (none if it gives none), the name 700 17 `--ink`, and at the right `.label` "installed" or the link "get it ↗";
  - the last row is the ladle mark on a disc, "Demo wallet", "nothing on Solana";
  - then `.body` 15 "Your wallet is your profile. Signing a message moves no SOL.";
  - picking a row advances (`.key.cream` "Continue" when a choice needs confirming).
- **Step 2, character**:
  - `.display-m` "Pick your character";
  - a 168 px `--felt-900` well (`--r-key`) with the live PetPicker canvas, and `.label` "penguin · drag to turn" under it;
  - beside it, a 4 x 3 grid of 52 px `--ground-3` squircle tiles (`--r-key-s`) with the species thumbs. The chosen tile is cream, and arrow keys move.
  - `.title` 15 "Scarf", then six 38 px squircle swatches (`--r-key-xs`) in the scarf colours. The chosen one has `box-shadow: 0 0 0 3px var(--ground-2), 0 0 0 5px var(--ink)`.
  - "Nickname": the `.well` with "available" inside, then the helper "3 to 16 characters: a–z, 0–9 and _. Shown on your name tag."
  - "Genesis": `.label` over `No. 0423` in `.num-l` 34 `--ink` (no brass, no dagger), then `.fine` "One of the first 1,000 Ladle profiles. It marks when you arrived. It carries no reward, no allocation and no extra share."
- **Step 3**: `.ui` 17 "Your character waits in the stands and steps onto the stage when you scoop in."
- **Sticky footer**: on a `--ground-2` band, the full-width `.key.main` "Take a seat" + `.fine` centred "Signing a message creates your profile. No transaction, no fee. Joining a round costs its entry."
- **Phones**: full width, from the top bar to the rail.

**7.16 Home playbill** (`app/(hall)/page.tsx`, `HomeHud.tsx`; no plate, on `--scrim-home`). The column is at the gutter, `--col` 480 at ≥ 1280 (440 at 1100-1279, 520 at ≥ 1440). From the top:
1. the round number + the cream state tag;
2. 16 px, three facts (`.num-m` + `.label`, 34 px apart: slots left, players, in the pot);
3. 16 px, the progress stem at the column width;
4. 30 px, `.display-xl` with the saffron stop;
5. 16 px, `.lede`;
6. 20 px, one row: the 56 px name `.well` (300 wide, placeholder "your name") + `.key.main` "Play" (172 wide, 8 px gap);
7. 12 px, the fee line;
8. 14 px, the link "Watch a round →" + `.label` "watching costs nothing, no wallet needed".

Under 760 px of height, items 2 and 3 become one `.fine` line over the stem, as in v21. Phones keep the v21 §9.3 order with these parts. The name well and "Play" stack full width.

**7.17 Tour captions** (`tour/Chapters.tsx`, `app/tour.css`):
- **Frame**: no card. The feathered `.tour-cap::before` shadow and `--halo` stay.
- **Order**: `.label` "2 of 8 · How a round plays" (tnum, sentence case) → `.display-l` → `.lede` (max 30em) → one block → a link "Read the odds →".
- **Beats**: a 38 px disc with a 900 18 tnum numeral, 14 px, `.title` 19 + `.body` 15.5 `--ink-2`, 14 px between beats, no rules. The beat matching the live phase has a cream disc (`--on-cream` numeral); the others are `--ground-3` discs with `--ink-2` numerals.
- **Facts**: `.num-l` + `.label` pairs with 30 px of air.
- **Ledger and charts**: §7.18 and §7.19.
- **Side index** (`.tour-index`, desktop only): 9 dots, 8 px `--ink-4`, each with `box-shadow: 0 0 0 3px rgba(15,11,9,.55)` so it reads over the 3D. The current dot is 10 px `--ink`. A hover label is a small `--ground-2` plate (`--r-state`, 600 13 `--ink`).

**7.18 Tables, ledger, definition lists** (no rules anywhere):
- **Data tables** (/odds measured table, /window arrival table, integrate glossary):
  - on a charcoal plate (padding 8 16), header `.label` sentence case, rows 44 px;
  - every other row is a `--ground-3` band (`--r-key-xs`);
  - figures tnum, right-aligned, `--ink`, one size; names `--ink-2`; arrival order only.
- **Ledger** (Open books):
  - rows 56 px on a plate: label 500 17 `--ink-2` left, value `.num-m` 24 + `.unit` right;
  - hover: a `--ground-3` row wash (`--r-key-xs`) and a trailing "→", 140 ms;
  - with tnum, values align without the v21 int/frac split. Delete `.int`/`.frac`.
- **Definition lists** (/window): dt `.label` 15 `--ink-2`, dd `.num-m` 24 `--ink`, 20 px between pairs. The verified line is 700 15 `--ink` with a check icon. A mismatch is the same in `--ink`, followed by the first differing entry. Never red or green.

**7.19 Charts** (SVG):
- **Curve**: a step-after path, 2 px `--ink-2`; gridlines 1 px `--grid`; axis numerals `.fine`.
  - The now-dot is a 10 px `--ink` disc with a 3 px `--ground` ring, labelled `.label` "now 0.0711".
  - Range toggles are three `.key.xs` (the current one cream).
  - Hover: a 1 px `rgba(246,238,227,.3)` guide and a `--ground-2` label plate.
  - The caption "Past prices, read from the curve. Not a forecast." is always shown, with no extrapolation.
- **Beeswarm**: 6 px `--ink` circles at 85 % opacity, all identical; ×1 is a 2 px `--ink-4` line labelled "pro-rata".
- **24 h bars**: filled `--ink-3` bars, 10 wide, radius 3.

**7.20 Questions** (`fx/Faq.tsx`, `<details>`): rows, not plates (fix round 2). Each question is a `.title` 19 row straight on its ground, 18-20 px apart, with a bare 2 px chevron in `--ink-3` at the right (no circle) that turns 180° in 240 ms. Only the open question sits on one `--ground-3` band, its answer (`.body` 16) indented under it. The home shows five questions, the risks first, then "All questions →" to `/about#questions`, which lists all ten.

**7.21 Reason lines and feedback**:
- **Reason line**: `.ui` 15 `--ink-2`, no italic, directly under the disabled or failed action, `aria-live="polite"`. A blocking error ("That name is taken.", "Your wallet declined. Nothing was sent.") is `--ink`.
- **Transient**: "Copied" as `.label` under the dial label for 4 s, fading out over 240 ms.
- No toasts, and never green or red.

**7.22 Conserved rail** (`ConservedBar.tsx`): solid `--ground-0`, 48 px, no border. The 20 px ladle mark (cream ink, saffron ball), 12 px, then `BRAND.secondLine` in 650 16/1.3 `--ink`, centred. Phones: 52 px plus the safe area, left-aligned, two lines at 13.5/1.3, an 18 px mark. On every route; it is never covered and has no control.

**7.23 Inner pages** (`app/(site)/*`, `app/site.css`):
- **Top bar**: solid `--ground-0` with the current-page stem.
- **Head**: `.label` (the page name), `.display-xl` (76 px) in one roman voice, e.g. "The odds, in clear language.", then `.lede` 20, max 46ch, then 64 px.
- **Sections**: a 44 px cream disc numeral + `.display-m` title, the content in charcoal plates (padding 32) or prose on the ground. There is exactly one cream plate per page, for the plain-words summary ("In one round…"). Command mentions are `.tok`. The asymmetric splits stay.
- **Frame**: delete the `.sframe` top rule; sections are separated by 96 px of space.
- **Code wells** (`CodeBlock.tsx`): `--ground-0`, `--r-cream`, padding 20 24, system mono 14/22 `--ink-2`, a copy icon key top-right.
- **/brand**:
  - the type specimen becomes Figtree (900 ss01 display, 450-700 text, ss02 seeds);
  - palette roles: tomato "the one action on screen, charcoal label"; saffron "the ball, never a state or a result"; cream "text, and everything that is yours";
  - lacquer is listed as retired from the UI;
  - colourways as plates with their samples.
- **404**: `.display-l` "This door is closed.", `.body`, the link "Back to the hall →", the poster at right.

**7.24 Footer** (`SiteFooter.tsx`):
- **Frame**: `--ground-0`, padding 96 top and `96 + rail-h` bottom.
- **Left**: the wordmark 48 px + `.display-m` "Same price for everyone." / "Not the same scoop." (no italic).
- **Right**: three link columns headed by `.title` 16 (Play, Learn, Build), links 600 16 `--ink-2` (hover `--ink`) 12 px apart, the "@ladlefun" link, and the `.fine` source line.
- No rules, no chips, no repeat of the rail sentence.

**7.25 Loader** (`Loader.tsx`): the curtains, light, wordmark fill and ball drop of v21 §9.1 stay.
- The status lines become `.lede` 18 `--ink-2` (no italic).
- The ruler becomes the 420 px progress stem with the `57 / 92` counter.
- The round line becomes `.label` `--ink-2`.
- The demo tag sits in its top-bar position; the rail stays.

**7.26 Embed** (`app/embed/[mint]`):
- top row: the 20 px mark + "Ladle" 800 15 + the phone demo tag;
- the hall band, then the phone round band with its stem;
- stakes (four values + other) and the main key, then the fee line with the host fee;
- the rail on two lines.

**7.27 Icons** (`components/ui/icons.tsx`): redraw on a 24 px grid with a 2 px stroke, butt caps (flat-cut like the lettering) and round joins, in `currentColor`. The set: speaker, speaker-off, menu (two 16 px bars), close, arrow-right, arrow-up (send), check, copy, external. No icon in a box, except the 36 px circles named above.

### 8. Screens (deltas from v21 §9)

- **Home, desktop**: §7.16 over the hall at view shift 0.13, tags on a few players, the rail. Match `final\f2-home-1280.png`.
- **Tour**: v21 §15 unchanged, captions per §7.17. Match `final\f3-tour-how-1280.png`. The other chapters reuse the label, Display L, lede, one block (discs, facts, ledger plate, curve, beeswarm, portraits row, question plates) and one link. Demo chapters end with the demo `.fine` line.
- **/play, desktop**: the chat plate left, the instruments free on the right scrim, the dock bottom centre, tags, the rail. The plates stop at x 360 and x 940 and the dock top is at about y 640 (1280 x 800), so the clear zone is untouched. Match `final\f1-play-1280.png`.
  - Watching: the dock holds "You are watching." + "Take a seat".
  - Entered: the cream receipt under the instruments.
  - Served: the result sheet on the right (§7.12, `sibling\proto\s4-result-1280.png`).
- **/play, phone**: the 56 px top bar, then a 92 px solid `--ground` band.
  - The band has three columns: "Round No. 1100" (800 15 ss01) over the state tag | the dial at 60 over `.label` "slots left" | `4.95 SOL` (`.num-m` 24) over `.label` "in the pot · 14 players". The 8 px stem runs under them.
  - Then the hall band with you plus the 2 nearest tags, the chat plate (4 lines + input), the full-width main key, the fee line and the two-line rail.
  - Nothing scrolls at 390 x 844. Match `sibling\proto\s5-play-375.png`, with portraits in the lines.
- **Check-in**: §7.15. Match `sibling\proto\s6-profile-sheet-1280.png`, with real portraits and the felt well.
- **Inner pages**: §7.23. Match `sibling\proto\s7-odds-1280.png`.

### 9. Motion

Calm and physical. The 3D does the showing, and no UI animation loops.
- **Easing**: `--ease-out` for everything below.
- **Keys**: colour 120 ms; press `translateY(1px)` 80 ms.
- **Plates**:
  - sheets enter with opacity + `translateX(16px)` (right sheets) or `translateY(8px)` (others) over 240-280 ms and exit in 160 ms;
  - the result sheet starts 400 ms after the tags change, with the same timing for every result;
  - the receipt enters like a sheet.
- **Chat**:
  - a new line enters with opacity + `translateY(6px)` over 160 ms; old lines leave through the top mask, never with a jump;
  - a cream note enters with opacity + `scale(.98 → 1)` over 200 ms;
  - a token stamps `scale(1.06 → 1)` over 100 ms;
  - the typeahead fades over 120 ms (no slide);
  - the send circle fills over 120 ms.
- **Figures**: `RollingFigure` stays, with these changes:
  - the dial (the countdown, on /play, the phone round band and the home) **swaps**, with no per-tick motion (fix r2): slots tick about every 217 ms, and a per-digit fade made the biggest figure on screen blink 4 to 5 times a second. Tabular figures hold it still; the progress stem carries the motion. Any figure that ticks more often than every 400 ms swaps; the fade mode (`translateY(.15em) → 0` + opacity .8 → 1, 80 ms, never the units digit alone) is only for slower figures;
  - the stem's fill glides forward (400 ms linear per tick) and jumps, with no transition, when a new round starts, so the ball never runs backward;
  - pot and player changes use the roll (240 ms, 20 ms stagger right to left);
  - with tnum, the `--digit-w` measurement is constant and may stay;
  - never a count-up.
- **State tag**: a word crossfade over 160 ms.
- **Stem**: linear width per slot tick.
- **Tags**: they follow the projection with no easing; culled tags fade over 150 ms; the multiplier change is one 160 ms crossfade for all of them.
- **Links**: the arrow moves 2 px over 120 ms.
- **Tour index**: the current dot grows over 200 ms.
- **The headline's saffron stop never moves.**
- **Reduced motion**: every transform becomes a 120 ms opacity fade or nothing, the dial swaps instantly, and the stem jumps.
- **Delete**: the demo tag settle, the field-focus line grow, the stake underline slide, the notice hairline draw and the ruler tick fade.

### 10. Delete list (added to v21 §12)

| Pattern | Where | Replaced by |
|---|---|---|
| Fraunces (roman and italic), Schibsted Grotesk | font files, `localFont` blocks, `--font-serif`, `.serif`, every `font-variation-settings: "opsz"` | Figtree (§3) |
| Italic house voice | `.house*`, `.fine-i`, `.lede` italic, `.display-* .i`, the `italic` in `.reason`, `.ticket[aria-disabled]`, placeholders and `.stake.other` | `.lede`, `.ui`, `.label` |
| Uppercase tracked folios | `.folio` (and every `letter-spacing` above 0) | `.label` |
| Roman numerals and daggers | programme rows, /odds clauses, check-in steps, `.dagger`, † footnotes | cream discs, step tokens, the demo `.fine` line |
| Brass hairlines and underlines | `--rule*`, `.facts` vertical rules, `.sframe` top rule, `.act` underline, `.ufield` underline and grow line, notice hairlines, the rail's top line, the sheet double rule, ledger and question rules | space, plates, zebra bands |
| The notched lacquer ticket | `.ticket`, `--notch-mask`, `--lacquer*` | `.key.main` (tomato) |
| Text-link actions | `.act` used for actions (Sell back, Keep, Share, Connect wallet, Copy link…) | `.key.sec`, `.key.char`; `.act` stays only as the navigation link style (§7.2) |
| The 92-tick ruler | `.ruler`, `.ruler i`, `.ruler.thin` | the progress stem |
| The hanging oxblood demo tag and paper slip | `.demo-tag` cord, eyelet, chamfer, settle; `.demo-slip` paper | the cream handle tag + cream slip |
| Paper ticket stub | `.stub` paper, perforation, dot leaders, stub column | the cream receipt plate |
| Square identity marks | 6-8 px squares in chat, tags, presence, result list; square swatches | portraits, round dots, squircle swatches |
| Highlighter command chips in brass | `.cmd-row` brass text keys, typeahead italic hints | `.tok`, quick-command tokens, the cream typeahead |
| `border-radius: 0 !important` | `globals.css` | the radius tokens |
| UI textures | `.walnut-ground`, `paper-stock.webp`, `felt-green.webp` on UI | flat grounds (velvet stays on the loader) |

### 11. Hand-offs and build order

**Hand-offs:**
- **Logo agent** (`config/brand.ts`, `make-brand.mjs`, `make-og.mjs`, `app/scripts/brand-lib.mjs`):
  - add `type: { family: "Figtree", display: "Figtree 900, ss01", text: "Figtree 450-700" }` to BRAND, additively;
  - mark `colors.lacquer` as retired from the UI;
  - switch make-og and the boards to `app/scripts/fonts/figtree-400-900.ttf`. Satori cannot apply ss01; the default a is accepted.
- **Hall agent**: no geometry change. `Tags.tsx`/`Cast.tsx` keep the markup; the build agent changes only CSS and the 8 px anchor offset. `hall.drumRect` must exist (§7.12 measures against it).
- **Chat agent**: no contract change. The UI maps `ChatProfile.scarf` (hex) to a scarf id for the portrait.

**Build order** (build and critique agents; all of `app/` except `lib/data/chain.ts`):
1. The font file (§3.2), `layout.tsx` (§3.3), the tokens and base (§5), the type roles (§4). Delete the radius-0 rule.
2. Keys, link, well, stakes, progress stem, handle tag, demo tag, rail, top bar, icons.
3. Pet thumbs (§7.14), then the round chat.
4. Dock, instruments, receipt, result sheet, share sheet and card.
5. Check-in sheet.
6. Home playbill, tour captions, side index.
7. Inner pages, tables, ledger, charts, questions, footer, loader, embed, 404, /brand.
8. The delete list, gates, captures.

Captures go to `app/screenshots/v21/restyle-build/`, read beside the §2 mockups. Reuse `app/screenshots/v21/restyle/final/make-final.mjs` for the reference renders and `app/screenshots/shoot-v21*.mjs` for the app.

### 12. Acceptance checklist (replaces the v21 §14 Form lines; the Honesty, Game read and Craft lines stay)

- [ ] Every visible text node computes to Figtree (system mono only inside code wells). The computed `font-style` is never `italic`. `text-transform: uppercase` appears nowhere. `letter-spacing` is never above 0.
- [ ] Nothing is under 13 px, except phone tags at 12 px.
- [ ] Every `.display-*`, `.num-*`, `.title` and `.key.main` label computes `font-feature-settings` with `"ss01"`, and a capture shows the single-storey a (compare with `final\ss01-google-vs-local.png`, bottom row). Every changing figure computes `font-variant-numeric: tabular-nums`.
- [ ] Exactly one visible `.key.main` per captured state; the result and share sheets have none. No visible element other than `.key.main` and identity marks computes tomato.
- [ ] Saffron `rgb(255, 178, 26)` is computed only on: the wordmark and mark balls, the headline stop, the stem's ball, the loader ball (the 3D aside).
- [ ] No visible element has a border of 1 px or more (focus outlines aside). No `box-shadow` except the swatch ring, the presence ring, the index-dot halo and the invalid well ring. No `backdrop-filter` except the sheet backdrop. No semi-transparent background except scrims, the backdrop and the index-dot halo. No gradient except scrims, masks and the loader.
- [ ] Border radii come only from the §5 tokens (or 50 % for circles). Where `corner-shape` is supported, plates and keys compute `squircle`.
- [ ] The demo tag is visible and the punched hole shows the scene through it on every captured screen in demo. It is absent in chain mode.
- [ ] Greyscale chat capture: talk, command, house, room notice and personal note can each be told apart.
- [ ] The result sheet's box does not intersect `hall.drumRect`; the smallest and largest share one computed style; every list value is `--ink` at one size.
- [ ] First-load font bytes: one `figtree-latin.woff` of about 25 KB. The three v21 font files are gone.
- [ ] `node --experimental-strip-types tests/forbidden-words.ts` (root) and `node scripts/copy-lint.mjs` (app/) pass; `pnpm build` passes in app/.
