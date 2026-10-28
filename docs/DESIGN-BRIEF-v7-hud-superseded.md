# Brief de direction artistique v7 — PULLED, HUD sci-fi

**Remplace les v5/v6 (pixel, archivées dans `DESIGN-BRIEF-v5-v6-pixel-superseded.md`) pour tout ce qui est visuel. On garde : la structure en 16 bandes de la homepage (v6 §11), le fond du projet (v6 §12 : le projet, les quatre étapes, les sept portes, l'architecture, ce que personne ne peut faire, les risques, le statut), les primitives (`Panel`, `Section`, `Figure`, `Button`, `Badge`, `Table`, `Feed`, `Chart`), le système de mouvement GSAP, les règles d'honnêteté du tirage, les données, les textes, et les corrections de fond de la passe en cours (date réelle sur `/window`, sources courtes, tableaux à 12 px, aperçu embarqué et exemple de frais sur `/integrate`, sprites d'étapes sur `/about`).** Tout ce qui est couleur, typo, matière, forme, rendu et décor change.

Demande du propriétaire : « il faut que le site fasse vraiment futuriste ». Direction choisie avec lui : **HUD sci-fi** — noir profond, accents lumineux, panneaux holographiques fins, lignes de scan, boulier en fil de fer 3D qui tourne, typographie mono technique, données denses façon cockpit. Plus de pixel.

---

## 1. L'idée : le poste de pilotage d'un tirage

Le site est **l'interface de contrôle** d'une machine à tirage : on voit la machine au centre, en 3D, en fil de fer lumineux, et tout autour des **relevés** (readouts) qui la décrivent en temps réel. Pas de décor inutile : chaque élément graphique est un instrument qui dit quelque chose de vrai (slot courant, entrées, total, latence de l'oracle, état de la fenêtre). L'esthétique vient de la **précision** : lignes de 1 px, cadres à crochets, règles graduées, codes de section, chiffres avec zéros de tête, balayages lents.

Références de niveau (à ouvrir, capturer dans `app/screenshots/refs/`, mesurer, noter dans `docs/DESIGN-REFERENCES.md`) : **linear.app** (hiérarchie, rythme), **vercel.com** (grilles, pied de page), **hyperliquid.xyz** et **axiom.trade** (densité de données, panneaux sombres), **teenage.engineering** (instruments, étiquettes), **stripe.com/docs** (`/integrate`), **lusion.co** et **igloo.inc** (3D fil de fer et mouvement, à doser), les interfaces de *Alien: Isolation*, *Oblivion* (2013) et *The Expanse* pour le vocabulaire HUD (crochets, réticules, règles, balayage) — vocabulaire, pas copie.

## 2. Couleurs

```css
:root {
  --bg:       #05070B;                 /* noir bleuté profond */
  --bg-2:     rgba(11,15,23,0.72);     /* panneaux « verre » (sur fond fixe), avec backdrop-filter: blur(8px) */
  --bg-3:     #0E131C;                 /* plats pleins : fonds de code, pistes, tableaux */
  --line:     rgba(130,170,220,0.18);  /* cadres 1 px */
  --line-2:   rgba(130,170,220,0.34);  /* cadres actifs, crochets */
  --ink:      #E7EEF9;                 /* texte */
  --ink-2:    #93A4BF;                 /* secondaire */
  --ink-3:    #5F6F89;                 /* étiquettes (≥ 4.5:1 sur --bg) */
  --acc:      #4DD8FF;                 /* cyan : MOI, le système, les instruments actifs */
  --acc-ink:  #8FE6FF;                 /* cyan en texte petit */
  --acc-soft: rgba(77,216,255,0.10);
  --warm:     #FFB347;                 /* ambre : LES AUTRES, et rien d'autre */
  --glow:     0 0 0 1px rgba(77,216,255,0.25), 0 0 24px rgba(77,216,255,0.18); /* uniquement sur les éléments vivants */
}
```

Fond de page : `--bg` + une **grille de points** (1 px, pas de 24 px, `rgba(130,170,220,.10)`) + un halo radial cyan très faible en haut à droite (`rgba(77,216,255,.07)`, 900×600). Fixe. Rien d'autre.

Règles : deux accents (`--acc` = moi/système, `--warm` = les autres). Résultat **sans couleur** (pire et meilleur en `--ink`, même corps). Pas de vert, pas de rouge, pas de magenta, pas de violet. Les lueurs (`--glow`) n'existent que sur : le point live, le boulier, le bouton principal au survol, la ligne de balayage. Aucun dégradé de surface ; les seuls dégradés sont les fondus de bord des balayages et des règles.

## 3. Typographie

- **Display (h1, h2, grands chiffres, wordmark) : Chakra Petch** 600/700 (Google Fonts, formes carrées, techniques, pas le « Orbitron » cliché). h1 `clamp(44px, 6.2vw, 80px)` / 1.02 / `-0.02em`, 700, majuscules **non** (phrase normale). h2 `clamp(28px, 3.2vw, 40px)` 600. Grands chiffres (compte à rebours) Chakra Petch 700 `clamp(72px, 10vw, 144px)`, `tabular-nums`.
- **Texte : Inter** 16/26 (15/24 mobile), `--ink-2` pour le secondaire, mesure 60–68 caractères.
- **Données, étiquettes, relevés, tableaux : Geist Mono** 12–13 px. **Les étiquettes HUD sont en capitales mono 11 px, espacement 0.12em, `--ink-3`** (c'est le seul système où les capitales espacées sont justes : ce sont des relevés d'instrument). Les valeurs portent des **zéros de tête** quand ce sont des compteurs (`SLOT 000092`, `WIN 001100`), jamais sur les montants.
- Woff2 d'origine Google (CSS API avec User-Agent Chrome), locales, `next/font/local`. `antialiased`.
- Interdits : serif, italiques, texte en dégradé, graisse 800+, pixel fonts.

## 4. Vocabulaire HUD — les motifs, et leur sens

| motif | spec | sens |
|---|---|---|
| **Cadre à crochets** | pas de bordure pleine : quatre crochets en L de 12×12 px, 1 px `--line-2`, aux coins ; bordure complète 1 px `--line` seulement au survol ou si actif | tout panneau |
| **Code de section** | mono caps 11 px à gauche du titre : `SEC 03 · LIVE WINDOW` ; à droite, un index `03 / 16` | chaque `Section` |
| **Règle graduée** | ligne 1 px avec graduations 4 px toutes les 8 px, majeures 8 px toutes les 64 px, mono 10 px aux majeures | sous la capsule, entre les bandes, sur l'axe des tirages |
| **Ligne de balayage** | ligne horizontale 1 px `--acc` à 35 % qui traverse un panneau vivant de haut en bas en 6 s, linéaire, puis repart | uniquement le panneau du direct et le boulier |
| **Réticule** | croix 9×9 px 1 px `--acc` + cercle 5 px | marque « vous » (ma boule, ma ligne du flux, mon résultat) |
| **Ligne de rappel** | trait 1 px `--line-2` avec un point 3 px à chaque bout, qui relie un relevé à l'objet qu'il décrit | relevés autour du boulier |
| **Barre segmentée** | 24 segments 6×10 px, pleins `--acc` / vides `--line` | compte à rebours en slots, progression de page, latence |
| **Statut** | carré 6 px + mono caps : `OPEN`, `SEALED`, `DRAWN`, `SETTLED`, `REFUNDING` ; le point live cyan respire (1 s, `steps(2)`) | partout où un état est montré |

Tout est en **1 px** ; les crochets et graduations sont dessinés en CSS (`background-image` linear-gradient positionnés) ou SVG inline, jamais en PNG.

## 5. Le boulier en 3D fil de fer — la pièce maîtresse

`three` (+ `@react-three/fiber` autorisé) dans `app/components/drum3d/`. Rendu dans un canvas transparent sur le fond de page.

- **La cage** : sphère en fil de fer (18 méridiens, 7 parallèles, lignes 1 px `--acc` à 70 % avec `LineSegments` ; pas de `wireframe: true` sur une géométrie triangulée), axe horizontal, manivelle à droite (quelques segments), socle = un rectangle plat en lignes. Rotation lente continue (1 tour / 24 s) quand la fenêtre est ouverte ; **arrêt net** au scellement.
- **Les boules** : sphères pleines 0.06 R, `--ink` à 90 % pour les autres avec un fin halo ambre ; la mienne cyan avec le réticule 2D projeté dessus ; physique simple (gravité, rebond amorti, collision avec la cage, léger entraînement par la rotation). 12 boules étiquetées maximum ; au-delà, points sans étiquette.
- **La graine** : un point très lumineux qui vient de hors champ (haut), traverse en 600 ms, se pose dans la goulotte ; le hash en mono apparaît dessous, caractère par caractère (30 car/s).
- **Le placement** : en 700 ms, les boules sortent de la cage et se rangent sur **un axe gradué 3D** (0 → 10 000) au premier plan, triées par tirage ; la mienne arrive en dernier. Puis les deux relevés « YOUR ROLL » / « YOUR SHARE » (même corps, `--ink`, sans couleur) et le bouton « Sell back now for X ».
- **Post-traitement** : un bloom très léger (`UnrealBloomPass`, strength .35, radius .4, threshold .85) ; désactivé sous 60 fps mesurés ou sur mobile bas de gamme.
- **Honnêteté** (inchangée) : la cage ne « ralentit » jamais pour faire du suspense ; graine + placement < 2 s ; `prefers-reduced-motion` : états sans transition, cage immobile.
- **Interaction** : glisser fait tourner la cage (inertie courte), avec le relevé « SPIN HAS NO EFFECT ON THE DRAW » qui s'affiche une fois ; survol d'une boule = relevé (pseudo, montant, slots) avec ligne de rappel.
- **Repli** : le moteur canvas 2D existant (`components/live/engine.ts`) redessiné aux couleurs HUD, utilisé si WebGL est absent ou si le 3D tombe sous 45 fps pendant 3 s. Même API (`setStage`, `startStatic`) pour la section épinglée.

## 6. La homepage, bande par bande (ordre v6 conservé)

1. **Capsule** : barre rectangulaire 56 px, `--bg-2` + blur, 1 px `--line` ; à gauche `PULLED` Chakra 20 px + relevé `THE DRAW · DEMO` ; nav mono 13 px, active = soulignement 1 px `--acc` + texte `--acc-ink` ; à droite `SLOT 460 443 072` en direct (slot réel via RPC si disponible, sinon simulé et marqué `SIM`), FR/EN, `CONNECT` (crochets). Sous la capsule : la règle graduée pleine largeur. Ligne de progression : la barre segmentée en haut, 2 px.
2. **Héros** : gauche = statut `OPEN · WIN 001100 · 12 ENTRIES` (point live), h1 « Same price for everyone. Not the same bag. », sous-titre, trois relevés (`OPEN SINCE 000018 SLOTS`, `TOTAL 0.070 SOL`, `ENTRIES 012`) en cadres à crochets, bouton principal « ENTER THE DRAW · 0.25 SOL » (fond `--acc`, texte `--bg`, 44 px, coins carrés, lueur au survol) + lien « How it works ». Droite = **le boulier 3D** sur toute la hauteur, avec quatre relevés ancrés aux coins reliés par des lignes de rappel (cage : `CAGE · 18 MERIDIANS`, boules : `ENTRIES 012`, manivelle : `SPIN · NO EFFECT`, goulotte : `SEED · PENDING`). Hauteur `min(92vh, 880px)`.
3. **Le tirage en direct** : `Panel` large avec balayage : compte à rebours Chakra 144 px + barre segmentée des slots + `≈ 16 S (ESTIMATE · 217 MS/SLOT)` ; la scène 3D (ou 2D) ; le `Feed` à droite (identicons remplacés par un **code à 4 caractères** mono dans un cadre à crochets ; ma ligne porte le réticule). Après le tirage : deux relevés et le bouton.
4. **Télémétrie** : le ticker devient une ligne de télémétrie mono : `WIN 001099 · SETTLED · 12 ENTRIES · 3.54 SOL · BEST ×1.83 · WORST ×0.71 ▮ WIN 001098 · …`, 40 s, pause au survol.
5. **Trois relevés** (somme conservée · espérance · frais) : `Figure xl` Chakra 56 px dans des cadres à crochets, `Figure` daté et sourcé.
6. **Le projet** (v6 §12.1).
7. **How it works** épinglé : quatre cadres à crochets à gauche (code `01 / 04 · OPEN`, titre, deux lignes, durée en slots, instruction du programme en mono), le boulier 3D à droite qui rejoue l'état (`setStage`).
8. **La loi et les cotes** : formule en mono dans un cadre, G3 par décile (barres segmentées), petit joueur (percentiles en relevés), plafond.
9. **Les sept portes** : sept cadres à crochets sur une ligne, code `G1`…`G7`, verdict en statut (`PASS` carré plein, `UNVERIFIED` carré vide), chiffre clé, lien.
10. **L'architecture** : cinq nœuds en cadres reliés par des lignes de rappel animées (tirets qui défilent lentement, 1 px) : programme, VRF, keeper, SDK, indexeur.
11. **Quand le résultat arrive** (G2, barres segmentées des percentiles) + **si l'oracle se tait**.
12. **Frais, autorité, ce que personne ne peut faire** (liste à carrés pleins).
13. **Résultats passés + fenêtres récentes** (`Table` mono).
14. **Risques** (six lignes).
15. **Archive** : la photo `hero.jpg` en bandeau 400 px, **désaturée à 70 % et assombrie**, avec un fin motif de lignes de scan (2 px / 4 px à 6 %) et le relevé `ARCHIVE · VILLAGE HALL · 1962` ; par-dessus la phrase non refermable en Chakra 600 `clamp(26px, 3.2vw, 40px)` `--ink`. C'est le seul élément chaud du site : l'origine de la machine.
16. **Glossaire + FAQ** (accordéon à crochets), **Statut** (tableau mono daté), pied de page : règle graduée, colonnes mono, wordmark `PULLED` Chakra 700 `clamp(96px, 18vw, 260px)` en `--bg-3` plein, ligne `NOT YET DEPLOYED · RESEARCH DATED 23 OCT 2026`.

Pages intérieures : mêmes primitives ; héros court avec un objet 3D fil de fer réduit (sur `/odds` : l'axe gradué avec une boule ; `/window` : la cage figée ; `/about` : la manivelle ; `/integrate` : un cadre d'iframe en fil de fer).

## 7. Mouvement

GSAP conservé, `EASE = "power2.out"`, durées 0.2 / 0.5 / 0.9. Spécifique HUD :
1. **Séquence d'amorçage** à l'arrivée (une fois, 1.4 s au total) : les crochets se tracent (`strokeDashoffset` / `scaleX`), les relevés se **tapent** (typewriter mono 30 car/s), les lignes de rappel se tirent, le boulier apparaît par ses méridiens un à un (0.6 s), les chiffres comptent.
2. **Reveals au scroll** : balayage horizontal (`clip-path: inset(0 100% 0 0)` → `inset(0)`), 0.5 s, une fois, à 82 %.
3. **Balayage** vertical sur les panneaux vivants (6 s, linéaire, continu).
4. **Section épinglée** : scrub des quatre états du boulier.
5. **Compteurs** par pas ; **barres segmentées** segment par segment ; **lignes de l'architecture** en tirets défilants.
6. **Micro** : survol d'un cadre = bordure complète 1 px `--line-2` + crochets `--acc`, 160 ms ; boutons : lueur au survol, scale .98 au clic ; liens : soulignement 1 px `--acc`.
7. **Rien ne clignote** sauf le point live. `prefers-reduced-motion` coupe tout, boulier immobile.

## 8. Ce qui disparaît

Tout le pixel (sprites, frise, icônes, grille 8 px, Jersey 10, curseurs, OG pixel → à régénérer en HUD : fond noir, boulier fil de fer, wordmark Chakra), les rendus 3D lissés (`drum-3d-cut` etc. ne sont plus utilisés), les ombres dures, les coins crantés, les emoji, les flèches dans les boutons, les icônes de bibliothèque.

## 9. Pré-vol v7

- [ ] Noir bleuté, grille de points, deux accents (cyan moi / ambre autres), aucune autre couleur ; résultat sans couleur ; lueur seulement sur les éléments vivants.
- [ ] Chakra Petch + Inter + Geist Mono, woff2 d'origine, locales ; relevés en capitales mono espacées ; compteurs à zéros de tête.
- [ ] Boulier 3D fil de fer (three) : rotation, arrêt net, graine, placement sur l'axe gradué, glisser, survol, bloom léger, repli 2D, ≥ 60 fps sur desktop, ≥ 45 fps sur mobile sinon repli.
- [ ] Crochets, codes de section, règles graduées, balayage, réticule, lignes de rappel, barres segmentées, statuts : présents et cohérents sur les cinq pages.
- [ ] Séquence d'amorçage, reveals par balayage, section épinglée, compteurs, télémétrie, lignes animées de l'architecture ; tout coupé sous reduced-motion.
- [ ] Les seize bandes et le fond du projet (v6 §12) sont là, chiffres datés et sourcés ; UNVERIFIED reste UNVERIFIED.
- [ ] `/window` affiche une vraie date ; `/integrate` a l'aperçu embarqué réel et l'exemple de frais ; tableaux à 12 px ; sources courtes.
- [ ] `pnpm --filter @pulled/app build` et `node --experimental-strip-types tests/forbidden-words.ts` passent.
- [ ] Captures 1280 et 375 de chaque page dans `app/screenshots/v7/`, plus le boulier pendant un glisser, la section épinglée à mi-scroll, et une mesure de fps.


---

# v7.1 — la couche pixel : matrice de points, propre et futuriste

Demande du propriétaire : « ajoute plus la DA pixel, par touches, fais-la vraiment mieux et propre, toujours futuriste, sans faire IA ». Rien de la v7 n'est retiré. Le pixel revient **comme une couche d'instruments**, pas comme un décor : ce sont les **afficheurs** du poste de pilotage. Référence d'esprit : les afficheurs LED des aéroports et des gares, l'écran de l'OP-1 de Teenage Engineering, les panneaux à matrice de points des cockpits. Précis, lisible, lumineux, jamais « rétro-jeu ».

## 10. Les afficheurs à matrice de points (`app/components/hud/DotMatrix.tsx`)

Un composant canvas (DPR géré, zéro allocation par frame) qui rend un texte dans une **police 5×7 points** (chiffres, lettres capitales, `. : · × % ≈ / -`), chaque point un disque de 40 % de la cellule, **points allumés** `--acc` avec une lueur douce de 2 px, **points éteints visibles** à 7 % (`rgba(130,170,220,.07)`) : c'est ce qui fait « afficheur », pas « police pixel ». Changement de valeur : les points basculent en 2 pas (`steps(2)`, 120 ms), jamais de fondu. Tailles par la cellule : `xl` 20 px (chiffre de 140 px), `lg` 10 px, `md` 6 px, `sm` 4 px.

Où il s'affiche, et seulement là :
1. **Le compte à rebours** du direct (`xl`) et le relevé `SLOT` de la capsule (`sm`).
2. **Les trois relevés du héros** (`lg`) : `000055`, `2.896`, `011` — les unités restent en Geist Mono.
3. **Les résultats** après tirage : `YOUR ROLL 9935` et `YOUR SHARE ×1.807` (`lg`, `--ink` allumé, pas cyan : le résultat n'a pas de couleur).
4. **La ligne de télémétrie** devient un **bandeau LED** : une matrice de 7 points de haut sur toute la largeur, le texte défile par pas d'une colonne toutes les 40 ms (25 colonnes/s), pause au survol ; données réelles uniquement.
5. **Le wordmark du pied de page** en matrice `xl` à points `--bg-3` allumés sur fond `--bg` (aucune lueur).
6. **Les sept portes** : le code `G1`…`G7` en matrice `md`, le verdict `PASS` / `UNVERIFIED` en matrice `sm` (`UNVERIFIED` en points éteints à 30 %, jamais en couleur).

Interdits : la matrice pour les titres, les paragraphes, les tableaux ; Jersey/Pixelify/Silkscreen ; `image-rendering: pixelated` sur du texte HTML.

## 11. Les icônes pixel 1-bit (`app/components/hud/PixelIcon.tsx`)

Seize icônes **16×16**, un seul niveau (allumé `--acc` ou `--ink-2`), dessinées en grilles de caractères, rendues en SVG `<rect>` (netteté assurée, pas de PNG) : window, seed, share, law, cap, fee, oracle, refund, lock (sans anse), sdk, keeper, indexer, enter, sell, slots, archive. Elles remplacent les codes de section seuls : `[icône] SEC 03 · LIVE WINDOW`. Elles apparaissent aussi dans la capsule (une devant chaque lien de nav, 12 px), dans les nœuds de l'architecture, et dans la liste « what nobody can do » (icône `lock` devant chaque ligne). Jamais ailleurs, jamais plus de 16 px dans le texte courant, 24 px dans les en-têtes.

## 12. Le tramage (dither) — la transition de la maison

Les révélations au scroll ne sont plus des balayages `clip-path` mais un **tramage ordonné** (matrice de Bayer 4×4) : l'élément apparaît par dissolution de points en **8 pas** sur 0,4 s (`mask-image` avec un motif SVG de 4×4 dont le seuil change par pas, ou un canvas en surimpression pour les panneaux). Même tramage pour : l'arrivée de la graine (le point lumineux se « matérialise » en 4 pas), le passage d'un état du boulier à l'autre dans la section épinglée, et la photo d'archive (qui se dissout en points quand elle sort de l'écran). Sous `prefers-reduced-motion` : pas de tramage, apparition directe.

## 13. Les étiquettes pixel dans la scène 3D

Au-dessus de ma boule et de la boule survolée : une **étiquette à matrice 3×5** (montant + pseudo, `sm`) dessinée sur un canvas 2D superposé au canvas WebGL, position projetée chaque frame, reliée par une ligne de rappel de 1 px. Les autres boules n'ont pas d'étiquette (lisibilité).

## 14. Ce qui fait « propre et pas IA »

- Une seule police d'afficheur (la 5×7), une seule taille de point par usage, les points éteints toujours visibles.
- Rien ne clignote (sauf le point live) ; les changements se font par pas, jamais par fondu ni par pulsation.
- Le pixel n'apparaît que là où un instrument réel aurait un afficheur : jamais sur un titre, jamais en décor de fond.
- Aucune lueur sur les points éteints ; lueur de 2 px maximum sur les allumés.
- Pas de scanlines CRT, pas de bruit, pas de « glitch ».

## 15. Pré-vol v7.1

- [ ] `DotMatrix` sur le compte à rebours, le slot, les trois relevés du héros, les résultats, la télémétrie LED, le wordmark, les codes et verdicts des portes — et nulle part ailleurs.
- [ ] Seize icônes 16×16 en SVG net, utilisées dans les en-têtes, la nav, l'architecture, la liste « cannot ».
- [ ] Tramage Bayer en 8 pas sur les reveals, la graine, les états épinglés, la photo ; coupé sous reduced-motion.
- [ ] Étiquettes 3×5 projetées sur ma boule et la boule survolée.
- [ ] Toujours deux accents, résultat sans couleur, < 2 s de révélation, aucune police pixel pour du texte.
- [ ] Build, test de vocabulaire, captures 1280/375 dans `app/screenshots/v7d/`, dont le direct avec le compte à rebours en matrice et la télémétrie LED en défilement.
