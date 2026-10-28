# Brief de direction artistique v2 — PULLED / LE TIRAGE

**Remplace la v1 (« programme imprimé 1962 »), jugée bien trop sobre et basique par le propriétaire du projet.** La v1 reste valable pour : la palette, les polices, les interdits, les règles d'honnêteté, la scène du boulier en canvas. Tout le reste change de registre.

## 0. La référence : FomoEven, le projet frère

FomoEven (`fomoeven.xyz`, port complet dans `C:\Users\Utilisateur\Nouveau dossier (12)\app\themes\light\*.css` : `globals`, `decor`, `landing`, `f100`, `inner`, `light`) est le niveau d'ambition attendu. **Lis ces six feuilles de style avant d'écrire une ligne.** Ce qui fait FomoEven, et qu'on reprend **comme vocabulaire, pas comme marque** :

- un **monde** derrière la page (chez eux : la mer, des bulles qui montent, une bouée et un canard qui flottent, un pied de page sous l'eau) ;
- des **objets 3D brillants** qui flottent avec une ombre portée douce et un `bob` lent (7 s) ;
- un **en-tête capsule** flottant, arrondi à 999px, flou d'arrière-plan, qui reste collé en haut ;
- une **ligne de progression de navigation** en haut (2px, dégradé, lueur) ;
- une **animation d'entrée de page** (`page-in`, 560 ms, `cubic-bezier(.22,1,.36,1)`) et des apparitions en cascade au scroll (`fx-fade-up`, `fx-card-in`, `fx-rise-line`, `fx-grow-x`) ;
- des **grands chiffres en dégradé** (`grad-num`, `background-clip: text`) ;
- une **carte lumineuse** (`glow-card`) à bordure en dégradé conique qui tourne lentement, avec une grande ombre colorée ;
- des **panneaux blancs à 24px de rayon** sur un fond teinté, ombre douce `0 18px 40px -18px` ;
- des **pastilles « kicker »** au-dessus des titres ;
- un **marquee** (bandeau défilant) masqué sur les bords ;
- un **écran de chargement** à la première visite (logo, un mot, barre) ;
- un **wordmark géant** en pied de page, `clamp(3rem, 11vw, 9rem)`, en dégradé qui s'efface ;
- des lignes de guidage de colonnes avec des « + » aux intersections, un **filigrane** géant ;
- une FAQ en accordéon, des stat-cards, un flux en direct (« live feed ») avec des avatars.

**Ce qu'on ne reprend pas** : la palette pervenche/bleu, la mer, la bouée, le canard, le logo goutte, les pièces SOL/USDC. **Notre monde est la kermesse : laiton, boules de loto, tickets, papier crème, lumière de fenêtre.** Même richesse, notre matière.

Autres références à étudier en ligne, 10 minutes chacune, pour le niveau de finition : **Jupiter** (jup.ag), **Axiom**, **Pump.fun**, **Linear** (linear.app), **Stripe** (stripe.com), **Teenage Engineering** (teenage.engineering), **Family** (family.co), **Vercel**. Note dans ton rapport trois choses précises prises chez chacun.

## 1. L'idée : **la kermesse, en objets 3D, sous une lumière de studio**

Le site est une **scène** : un fond papier crème chaud avec une lumière douce qui vient d'en haut à gauche (dégradés radiaux très doux, comme le `body` de FomoEven mais en chaud), sur laquelle flottent des **objets de tirage en 3D brillant** (boulier, boules numérotées, tickets pliés), des **panneaux blancs** épais et arrondis, de **grands chiffres** en dégradé laiton, et au milieu, vivant, **le boulier en canvas** qui tourne avec les mises des joueurs.

Deux registres qui se tiennent : **la matière** (3D, lumière, ombres, grain) et **la rigueur** (grille, chiffres tabulaires, tickets datés, honnêteté).

## 2. Les objets 3D — déjà rendus, dans `app/public/art/`

| fichier | objet | usage |
|---|---|---|
| `drum-3d.png` | le boulier en laiton, trois-quarts, socle noyer | **héros**, à droite, grand (clamp 320px, 40vw, 560px), ombre portée douce, `bob` 7 s ; aussi en pied de page en petit |
| `ball-12.png`, `ball-7.png` | boules numérotées flottantes | « floaters » autour du héros et dans les sections (2 à 3 par écran maximum, jamais plus), tailles 90 à 180px, `drift-up` 11 s déphasés |
| `ticket-3d.png` | ticket plié | floater près des chiffres mesurés, et icône de la section frais |
| `hero.jpg` | photo salle des fêtes | **plus en héros** : en bandeau « the world » entre deux sections, pleine largeur, 420px de haut, avec un voile `--paper` en haut et en bas, et la phrase non refermable par-dessus |

Les PNG ont un fond crème uni (#F3EDDF) : **détoure-les** (versions `-cut.png` à fond transparent seront fournies dans le même dossier ; si elles manquent, détoure toi-même avec un masque par distance de couleur + plume, en gardant l'ombre douce via `drop-shadow` CSS). Charge-les avec `next/image`, `priority` pour le boulier, tailles explicites, `loading="lazy"` pour les autres.

## 3. Palette — la v1, plus les dégradés

Tokens de la v1 inchangés (`--paper #F3EDDF`, `--paper-2 #EAE2CF`, `--paper-3 #DED4BC`, `--ink #1C1915`, `--ink-2`, `--ink-3`, `--oak #6B4A2B`, `--brass #B07C2E`, `--brass-2 #D9A85A`, `--stamp #1F3F9E`, `--sage #8C9A7E`). On ajoute :

- `--panel: #FFFCF5` : les panneaux blancs chauds (le « 24px white panel » de FomoEven).
- `--panel-shadow: 0 1px 2px rgba(60,40,10,.05), 0 24px 48px -20px rgba(90,60,20,.22)` : l'ombre douce de tous les panneaux.
- `--grad-brass: linear-gradient(180deg, #E2B968, #9A6A22)` : **les grands chiffres** (montants, compte à rebours, multiplicateur) en `background-clip: text`.
- `--grad-stamp: linear-gradient(180deg, #4A66C9, #1F3F9E)` : bouton principal et pastille de navigation active.
- `--glow: conic-gradient(from var(--angle), rgba(176,124,46,.15), #D9A85A, #FFF1C9, rgba(176,124,46,.15) 40%, rgba(176,124,46,.15))` : la bordure animée de la carte lumineuse (la scène du boulier).
- Fond de page : `radial-gradient(1100px 600px at 85% -10%, rgba(217,168,90,.22), transparent 60%), radial-gradient(900px 500px at -10% 35%, rgba(31,63,158,.06), transparent 60%), var(--paper)`, `background-attachment: fixed`.

Toujours : **deux accents** (`--stamp` = moi, `--brass` = les autres), **le résultat sans couleur** (pire et meilleur en `--ink`, même corps). Pas de vert, pas de rouge.

## 4. Typographie — la v1 inchangée

Fraunces (display, grands chiffres, `SOFT 60`, tabular), Geist Sans (texte, UI), Geist Mono (étiquettes, hashes). Titre h1 `clamp(48px, 7.5vw, 96px)`, `letter-spacing: -0.03em`, `line-height: 0.98`. Les grands chiffres portent le dégradé laiton.

## 5. La page d'accueil, section par section

0. **Écran de chargement** (première visite seulement, `sessionStorage`) : fond papier, le boulier en petit qui tourne (CSS `spin-slow` sur l'image, 2 s), le mot « PULLED » en Fraunces, une barre fine `--brass` qui se remplit en 900 ms, fondu de sortie 600 ms. Sous `prefers-reduced-motion` : rien.
1. **En-tête capsule** : flottant à 14px du haut, `width: min(1080px, 100%)`, rayon 999px, fond `rgba(255,252,245,.78)` + `backdrop-filter: blur(18px) saturate(1.3)`, bordure `1px rgba(107,74,43,.12)`, ombre douce. Gauche : marque « PULLED » en Fraunces 20px + « THE DRAW » mono. Centre : nav en pastilles, la page courante en pastille `--grad-stamp` texte papier. Droite : FR/EN + bouton « Connect » (contour). **Ligne de progression** 2px en haut, dégradé laiton, lueur `0 0 12px rgba(217,168,90,.9)`.
2. **Héros** (deux colonnes dès 900px) : à gauche, kicker « On Solana · draw #1100 is open » (pastille `--brass` à 12 % + point qui respire), le h1 « Same price for everyone. Not the same bag. », la deuxième phrase en `--ink-2` 20px, puis **une rangée de trois tickets** (fenêtre ouverte depuis N slots · total · entrées) en grands chiffres dégradé laiton, puis le bouton principal « Enter the draw » (`--grad-stamp`, 56px, rayon 14px, ombre `0 10px 30px -10px rgba(31,63,158,.6)`) et un lien « How it works ». À droite, **la scène** : le boulier 3D (`drum-3d-cut.png`) grand, avec deux boules et un ticket qui flottent autour (floaters), ombres portées, `bob`. Lignes de guidage de colonnes discrètes (`--fx-guide` en chaud, 1px, avec « + » aux intersections) derrière le héros, et un **filigrane** « LE TIRAGE » en Fraunces géant à 4 % d'opacité, tourné de −6°, derrière la scène.
3. **La carte lumineuse — la fenêtre en direct** : un `glow-card` (bordure `--glow` animée 8 s, rayon 28px, ombre `0 30px 80px -40px rgba(176,124,46,.8)`) contenant la **scène canvas du boulier de la v1 §6** (boules qui tombent, cage qui tourne, arrêt net, graine, règle graduée, résultat sans couleur, bouton « Sell back now for X »). Au-dessus, dans la carte : le compte à rebours en slots en Fraunces 96px dégradé laiton + « ≈ 16 s (estimate) » mono, et à droite le **flux en direct** (liste des entrées avec avatar en identicon 8×8 généré du pubkey, pseudo, montant, « 2 slots ago », la mienne en `--stamp`). C'est la pièce maîtresse ; elle doit tenir en 100vh sur desktop.
4. **Marquee** : bandeau défilant masqué sur les bords : « draw #1099 settled · 12 entries · 3.54 SOL · best ×1.83 · worst ×0.71 · … », mono 13px, pause au hover, statique sous reduced-motion.
5. **Trois stat-cards** (panneaux blancs 24px) : « Sum conserved » (Σ parts = jetons vendus, « exact, every window »), « Expectation » (« ×1.000 for every stake size », G3 daté), « Fee » (« 1.00 %, immutable, 0 on sell back »). Grands chiffres dégradé, ticket daté dessous.
6. **The world** : la photo `hero.jpg` en bandeau pleine largeur 420px, voiles haut/bas, et par-dessus, centrée, la phrase non refermable en Fraunces `clamp(28px, 3.6vw, 44px)` crème avec ombre de texte douce : « The sum is conserved. So for someone to take more, someone takes less. That someone can be you. »
7. **How it works** : quatre panneaux blancs en grille 2×2 (desktop) : chaque panneau a un numéro en Fraunces dégradé, un titre, deux lignes, et **un objet** (boule, ticket, boulier en petit, une boule noire « graine »). Apparition en cascade au scroll.
8. **When the result arrives** (G2) : panneau blanc, le graphique des percentiles (règles v1 §9), les chiffres en tickets.
9. **The law, as published** + **G3** + **cap G4** + **past results** : panneaux blancs, graphiques v1 §9, chiffres en tickets.
10. **Recent windows** : liste en lignes avec identicon, index, entrées, total, pire/meilleur (même corps, sans couleur), lien.
11. **FAQ** en accordéon (6 questions : qu'est-ce qu'une fenêtre, d'où vient l'aléa, que se passe-t-il si l'oracle ne répond pas, puis-je annuler, quels frais, qui peut changer la loi).
12. **Pied de page** : fond `--paper-2` → `--oak` en dégradé vertical sur 320px, avec le boulier en petit qui flotte, trois colonnes de liens mono, puis le **wordmark géant** « PULLED » en Fraunces `clamp(3rem, 11vw, 9rem)` en dégradé crème→transparent (`background-clip: text`), centré, et une ligne « Not yet deployed · research dated 23 Oct 2026 ».

## 6. Les pages intérieures

Même capsule, même fond, même panneaux. `/odds` : héros court avec une boule flottante, puis les panneaux (forme du tirage, six tickets de percentiles, tableau d'équité). `/window/[id]` : grand ticket de fenêtre en tête, la graine dans un panneau avec le bouton « Recompute », tableau des entrées, pire/meilleur en deux tickets. `/about` : les quatre étapes en panneaux avec objets, frais en tickets, autorité avec tampon « NOT YET DEPLOYED ». `/integrate` : panneaux de code sur `--paper-2`, un panneau « host fee » avec le ticket 3D. `/embed/[mint]` : la carte lumineuse seule.

## 7. Mouvement

- `page-in` 560 ms à chaque navigation ; ligne de progression en haut.
- Scroll reveal : `fx-fade-up` (opacité 0→1, translateY 18px→0, 600 ms, `cubic-bezier(.22,1,.36,1)`), cascade de 60 ms entre enfants, **une fois** (IntersectionObserver), seuil 0.2.
- Floaters : `bob` 7 s, `drift-up` 11 s, déphasés ; `drop-shadow(0 18px 30px rgba(60,40,10,.35))`.
- Glow-card : `angle` 8 s linéaire (`@property --angle`).
- Hover des panneaux : translateY −2px + ombre un peu plus longue, 200 ms. Boutons : scale .985 au clic.
- **La scène du boulier garde les règles d'honnêteté de la v1** : arrêt net, une seule graine, révélation < 2 s, aucun faux suspense.
- Tout s'arrête sous `prefers-reduced-motion`.

## 8. Performance

- Images : `next/image`, WebP/AVIF automatiques, tailles explicites ; les floaters ≤ 200px de rendu.
- Animations : `transform` et `opacity` uniquement ; `will-change` sur les floaters ; `backdrop-filter` seulement sur la capsule.
- Canvas : 60 fps, zéro allocation par frame (v1 §6).
- LCP < 2.5 s sur mobile simulé : le boulier héros en `priority`, le reste lazy.

## 9. Interdits (inchangés, testés)

Les mots interdits sont ceux listés dans `tests/forbidden-words.ts` (promesses de gain, « sans frais », absence de risque, vocabulaire de casino) ; le test fait échouer le build. Pas d'emoji, de fusée, de flamme, de pièce, de jeton de casino, de 7 porte-bonheur (le chiffre sur une boule est un numéro de loto, c'est permis), de trèfle. Pas de mode sombre par défaut. Pas de vert/rouge sur un résultat.

## 10. Pré-vol

- [ ] Capture à 1280 de `/` : un inconnu voit **un objet** (boulier 3D, boules, lumière), pas un document.
- [ ] Le site est aussi riche que FomoEven (capsule, progression, loader, floaters, glow-card, marquee, stat-cards, FAQ, wordmark géant) — coche chacun.
- [ ] Mais **notre matière** : aucun bleu pervenche, aucune mer ; crème, laiton, cobalt tampon.
- [ ] Deux accents ; résultat sans couleur ; pire et meilleur même corps.
- [ ] Scène canvas à 60 fps ; révélation < 2 s.
- [ ] Chaque chiffre mesuré est un ticket daté avec source.
- [ ] `pnpm --filter @pulled/app build` et `pnpm test:words` passent.
- [ ] Captures 375 et 1280 de `/`, `/odds`, `/window/[id]`, `/about` dans `app/screenshots/v2/`.

---

## 11. Passe anti-AI — obligatoire, après la v2 et avant de livrer

Le propriétaire du projet veut **zéro tic de landing page générée**. Un site « fait en IA à la va-vite » se reconnaît à une liste précise de signes. Chacun est interdit, et chaque élément du site doit être **copié d'un site réel existant, mesuré dans le navigateur**, pas inventé.

### 11.1 Les tics interdits (kill list)

1. Le titre en deux lignes dont la seconde est en couleur ou en dégradé.
2. Un gros objet 3D posé à droite du titre avec un halo flou derrière, et une statistique centrée dessous.
3. La pastille « kicker » au-dessus de **chaque** titre de section (une seule, dans le héros, avec un vrai point live).
4. Trois cartes identiques côte à côte avec une icône en haut à gauche, un titre et deux lignes.
5. Les icônes génériques (Lucide/Heroicons) comme décoration. Une icône n'apparaît que si elle est un vrai contrôle.
6. Les flèches « → » dans les boutons et les liens.
7. Les blobs de dégradé flous (violet/rose/bleu) en fond ; le glassmorphism sur tout.
8. Le texte en dégradé sur les chiffres courants. Le dégradé n'existe qu'à deux endroits : le wordmark géant du pied de page et le bouton principal.
9. Les objets qui flottent partout avec un `bob` infini. Les floaters n'existent que dans le héros (deux au maximum) et bougent en **parallaxe au scroll**, pas en boucle.
10. Le « fade-up » de chaque section au scroll, en cascade uniforme. Les apparitions se limitent au héros (une fois) et au flux en direct (nouvelles lignes).
11. Les marges identiques partout, les sections toutes centrées, tout en `rounded-2xl`, les ombres `shadow-xl` par défaut de Tailwind.
12. Les copies génériques : « Seamless », « Powered by », « Built for », « Experience the », « Unlock », « Next-gen », « Revolutionary », et leurs équivalents français.
13. Les faux témoignages, les faux logos de partenaires, les faux compteurs.
14. Les emoji, les confettis, les fusées.
15. Les trois mêmes polices « IA » (Inter + Space Grotesk + un serif fantaisie) : on garde Fraunces + Geist, réglées (axes optiques, chiffres tabulaires, interlettrage négatif aux grands corps).

### 11.2 D'où vient chaque élément — à mesurer dans le navigateur, pas à deviner

Ouvre chacun de ces sites dans le navigateur, prends une capture dans `app/screenshots/refs/`, mesure (`getComputedStyle`) les valeurs indiquées, et note tout dans `docs/DESIGN-REFERENCES.md` (site, élément, valeurs mesurées, ce qu'on en garde). Puis implémente **avec ces valeurs**.

| élément du site | source réelle | ce qu'on mesure et copie |
|---|---|---|
| En-tête capsule flottant, pastilles de navigation | **fomoeven** (port local, `themes/light/decor.css` `.capsule`, `.nav a`) et **family.co** | hauteur, padding, flou, bordure, rayon ; la pastille active ; le comportement au scroll |
| Lignes de guidage verticales avec « + » aux intersections | **vercel.com** (home, sections « grid ») | épaisseur 1px, couleur, taille des « + », espacement des colonnes |
| Héros : un seul objet, grand, bien éclairé, texte court à gauche | **apple.com** (page produit : un objet, une phrase) + **teenage.engineering** (photo produit sur fond uni, specs en mono) | proportion objet/texte, taille du h1, interlignage, la marge au-dessus du pli |
| Carte du produit en direct (le boulier + le flux) | **jup.ag** (le panneau de swap : densité, hiérarchie des chiffres, états) et **pump.fun** (le flux « live » des lancements : lignes serrées, avatar, montant, temps relatif) | hauteur des lignes du flux, taille des avatars, taille des chiffres, espacement |
| Ticker en direct (données réelles, pas décoratif) | **pump.fun** (bandeau du haut) et **polymarket.com** | vitesse, hauteur, police, séparateurs |
| Stat-cards / chiffres mesurés | **linear.app** (les chiffres de la page « customers ») et **stripe.com** (section chiffres) | taille du chiffre, taille de la légende, rapport chiffre/légende, hairline |
| Sections et rythme vertical, filets, titres | **linear.app** | espacement entre sections, largeur de mesure du texte, graisse des titres (600, pas 800), taille h2 |
| Tableau des entrées, tableau d'équité | **linear.app** (tables) + **polymarket.com** (lignes de marché) | hauteur de ligne, padding, alignement des chiffres, hairlines |
| Boutons | **linear.app** (primaire plein, secondaire contour) et **stripe.com** | hauteur 36–44px, rayon 6–8px, graisse 500–600, pas de flèche |
| Accordéon FAQ | **stripe.com/docs** ou **linear.app/docs** | hauteur fermée, chevron fin, durée 200 ms |
| Page développeur `/integrate` | **stripe.com/docs** (deux colonnes, code à droite, nav collante à gauche) | largeurs, police de code 13–14px, fond de code clair |
| Pied de page avec wordmark géant | **fomoeven** (`.footer-big`) et **vercel.com** (footer en colonnes) | taille du wordmark, colonnes, hairline |
| Mouvement (ressorts, durées, courbes) | **family.co** (ressorts physiques courts) + **linear.app** (160–200 ms, `ease-out`) | durées, courbes ; pas de `ease-in-out` 600 ms générique |
| Photo en bandeau « the world » | **apple.com** (bandeaux photo pleine largeur avec une phrase) | hauteur, voile, taille de la phrase |

Si un site est inaccessible, dis-le dans `DESIGN-REFERENCES.md` et prends le suivant de la même ligne ; n'invente pas la valeur.

### 11.3 Ce qui reste de FomoEven après la passe

La capsule, la ligne de progression, l'écran de chargement (≤ 900 ms, une fois), **une** carte lumineuse (le boulier), le wordmark géant, les panneaux blancs à ombre douce, le flux en direct avec identicons, la FAQ. Le reste de FomoEven (bulles, bob infini, dégradés partout) est remplacé par les mesures du tableau ci-dessus.

### 11.4 Pré-vol anti-AI

- [ ] Aucun des 15 tics de la kill list n'est présent (passe la page d'accueil, puis chaque page, un par un).
- [ ] `docs/DESIGN-REFERENCES.md` existe, avec une capture par site de référence et les valeurs mesurées.
- [ ] Chaque valeur de rythme (tailles, espacements, rayons, durées) correspond à une ligne de `DESIGN-REFERENCES.md`.
- [ ] Un designer qui connaît Linear, Vercel, Jupiter et FomoEven reconnaît d'où vient chaque élément — et voit que l'ensemble est à nous (laiton, boules, tickets, cobalt).

---

## 12. Typographie v3 et décor — remplace §4 (typo) et corrige §2/§5 (décor)

Demande du propriétaire : « améliore les styles d'écriture, et surtout les décos qui font trop IA ».

### 12.1 Typographie

Le serif fantaisie à axes (`Fraunces` avec `SOFT`/`WONK`, italiques expressives) est devenu un tic des sites générés. On passe à un système grotesque, celui de la famille FomoEven, réglé avec soin :

- **Display / titres / wordmark : Schibsted Grotesk** 700 (Google Fonts, woff2 local via `next/font/local`). h1 `clamp(44px, 6.4vw, 84px)`, `line-height: 1.0`, `letter-spacing: -0.035em`. h2 `clamp(28px, 3.2vw, 40px)`, 700, `-0.025em`. h3 22px 600 `-0.01em`.
- **Texte et interface : Inter** (ou Geist Sans, déjà là ; choisir une seule). Corps 16/26 desktop, 15/24 mobile, 400 ; textes secondaires 14/22 `--ink-2`. Mesure 60–68 caractères. Jamais de texte justifié.
- **Chiffres : Geist Mono** avec `font-variant-numeric: tabular-nums`, pour **tous** les chiffres (montants, slots, pourcentages, hashes), y compris les grands : compte à rebours en Geist Mono 500 `clamp(56px, 8vw, 112px)`, `letter-spacing: -0.04em`. Un grand chiffre en mono serré, c'est Teenage Engineering et Jupiter ; un grand chiffre en serif, c'est un template.
- **Étiquettes** : Geist Mono 12px, 500, en **minuscules** (pas de capitales espacées : tic), couleur `--ink-3`.
- Réglages obligatoires : `-webkit-font-smoothing: antialiased`, `text-wrap: balance` sur les titres, `text-wrap: pretty` sur les paragraphes, `hanging-punctuation`, apostrophes et guillemets typographiques dans les textes (’ « » –), espaces insécables avant « : » en français.
- Hiérarchie par la taille et la graisse, pas par la couleur : un titre est en `--ink`, point.
- Interdits : italiques décoratives, lettrines, texte en dégradé (sauf le wordmark géant du pied de page), capitales espacées, `font-weight: 800+` partout.

### 12.2 Décor : ce qu'on retire (tics) et ce qui le remplace

| on retire | pourquoi | remplacé par |
|---|---|---|
| la bordure en dégradé conique qui tourne (`glow-card` animée) | tic Tailwind/IA n°1 | un panneau blanc, hairline 1px `rgba(107,74,43,.14)`, ombre douce ; une seule lueur chaude statique de 40 % d'opacité en haut du panneau (radial, 600×200px) |
| le tampon rugueux (`feTurbulence` + rotation) | gadget | un simple badge mono 12px, contour 1px, coins 4px, sans rotation |
| le ticket à bord perforé en CSS | gadget | le chiffre + sa légende + une ligne « mesuré le … · source » en hairline au-dessus ; le **vrai** ticket 3D (`ticket-3d-cut.webp`) sert une fois, dans le héros ou près des frais |
| le grain `feTurbulence` sur tout le corps | flou et cher | rien ; le papier est une couleur unie `--paper` avec le fond radial chaud décrit en §3 |
| le filigrane « LE TIRAGE » géant à 4 % | tic éditorial IA | rien |
| les lignes de guidage avec « + » si elles couvrent toute la page | bruit | gardées **uniquement** dans le héros, 1px `rgba(107,74,43,.10)`, « + » de 9px aux quatre coins de la grille du héros, comme Vercel |
| les floaters qui `bob` en boucle | tic | deux objets dans le héros, posés, avec une parallaxe au scroll de ±12px et une ombre portée réaliste ; ailleurs les rendus 3D sont **posés** comme des photos produit (Apple), jamais flottants |
| le `page-in` de 560 ms et les `fade-up` partout | tic | un seul fondu de 240 ms à l'arrivée de la page ; rien au scroll |
| le marquee décoratif | tic | un ticker **de données réelles** uniquement (dernières fenêtres réglées), sinon rien |
| les pastilles « kicker » | tic | une seule, dans le héros, « draw #1100 · open · 12 entries », avec un vrai point live |

### 12.3 Ce qui fait le décor, désormais

1. **Les objets** : le boulier 3D en héros (grand, posé, éclairé) ; une boule et le ticket dans le héros ; le boulier en petit dans le pied de page. C'est tout.
2. **La photo** en bandeau pleine largeur avec la phrase non refermable.
3. **Le boulier canvas** vivant dans son panneau, avec le flux en direct à côté.
4. **Les filets** : hairlines horizontales entre les sections, numéros de section en mono, tables à filets.
5. **La lumière** : le fond radial chaud en haut à gauche, les ombres douces des panneaux. Rien d'autre ne brille.

### 12.4 Pré-vol v3

- [ ] Plus aucune Fraunces chargée ; Schibsted Grotesk + Inter/Geist + Geist Mono, locales.
- [ ] Tous les chiffres en mono tabulaire ; aucun texte en dégradé hors wordmark.
- [ ] Aucune bordure animée, aucun tampon rugueux, aucune perforation, aucun grain, aucun filigrane, aucun bob infini.
- [ ] Les 3D sont posés comme des photos produit ; deux au maximum dans le héros.
- [ ] Une capture 1280 de `/` tient la comparaison à côté de linear.app et de fomoeven sans faire « généré ».
