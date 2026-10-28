# Brief de direction artistique v5 — PULLED, en pixels, sur noir

**Remplace la v4 pour tout ce qui est visuel. On garde de la v4 : la structure des pages (§6 v4), les primitives (`Panel`, `Section`, `Figure`, `Button`, `Badge`, `Table`, `Feed`, `Chart`), le système de mouvement GSAP (entrée, progression, parallaxe, reveals, section épinglée, compteurs, graphiques, flux, ticker), la scène du boulier et ses règles d'honnêteté, les données et les textes.** Tout ce qui est couleur, typo, matière, forme, rendu et interaction change.

Demande du propriétaire : « garde un peu tout ça, mais va sur une DA plus pixel, interactive, avec une base noire, un truc vraiment pixel stylé, et différent esthétiquement du reste ».

---

## 0. Ce que « différent du reste » veut dire

Le propriétaire a déjà un site pixel (PEAKED v6 : nuit étoilée, montagne, fenêtres d'OS rétro à barre de titre, cadres crème biseautés, Pixelify Sans / Silkscreen / VT323, boutons ambre bombés) et deux autres directions (FomoEven mer pervenche ; CLOCKED padpad). **PULLED ne doit ressembler à aucun des trois.** Interdits : fenêtres d'OS et barres de titre, biseaux Windows 95, cadres crème, Pixelify/Silkscreen/VT323/Press Start 2P, étoiles et ciel de nuit, montagnes, bulles, mer, scanlines CRT, vert phosphore de terminal.

Ce que PULLED pixel est : **noir mat, plat, deux couleurs vives, une typographie pixel haute et élégante, des lignes de 2 px, et une machine à tirage en pixel art qui vit au centre et qu'on peut toucher.** L'esprit : un stand de fête foraine la nuit, réduit à l'essentiel, vu par un designer suisse qui ne dessine qu'en pixels. Références de niveau (à ouvrir et capturer dans `app/screenshots/refs/`) : computersrh.xyz (interactivité et rythme, pas le style), ooo.studio, pixel art de Kirokaze et de Pedro Medeiros (dithering, palettes réduites), lospec.com/palette-list (choisir une palette), teenage engineering OP-1 (objet sur fond uni, lettrage), linear.app (hiérarchie), le port local FomoEven pour la capsule.

## 1. Rendu pixel — la règle de base

Tout ce qui est image est rendu **en basse résolution puis agrandi à l'entier, sans lissage** :

- Un facteur `S` entier (2 à 6) choisi depuis la largeur du viewport : `S = clamp(2, floor(min(vw, 1440) / 320), 6)` ; recalculé au resize.
- Les scènes canvas dessinent sur un canvas hors écran de taille logique (ex. 320×200), puis `drawImage` sur le canvas visible avec `imageSmoothingEnabled = false`, taille = logique × S. CSS `image-rendering: pixelated` sur tout canvas et tout sprite.
- Les épaisseurs d'interface sont des multiples de la grille : bordures 2 px, ombres dures décalées de 4 px sans flou, **aucun `border-radius`** nulle part (coins carrés ou crantés via `clip-path` 2 px). Aucune ombre floue, aucun flou, aucun dégradé (le dithering remplace les dégradés : motif 2×2 en damier).
- Les rendus 3D (`drum-3d-cut.webp` etc.) **ne sont plus utilisés**. Les objets sont redessinés en pixel art dans le code (voir §4).

## 2. Palette — six couleurs, c'est tout

```css
:root {
  --bg:      #0B0B0D;  /* noir mat, base */
  --bg-2:    #16161A;  /* panneaux */
  --bg-3:    #222228;  /* plats secondaires, pistes, fonds de code */
  --line:    #34343C;  /* bordures 2 px */
  --ink:     #F1EFE6;  /* texte principal (blanc chaud) */
  --ink-2:   #A9A69C;  /* texte secondaire */
  --ink-3:   #6F6D66;  /* étiquettes, dates (4.6:1 sur --bg) */
  --acc:     #4D6BFF;  /* cobalt : MOI, actions, progression, lien actif */
  --acc-2:   #8CA0FF;  /* cobalt clair : hover, texte cobalt petit */
  --warm:    #F0B23A;  /* ambre : LES AUTRES, le laiton de la machine */
  --cream:   #EFE3C3;  /* les boules */
}
```

Deux accents, toujours : `--acc` = moi, `--warm` = les autres. Résultat **sans couleur** (pire et meilleur en `--ink`, même corps). Pas de vert, pas de rouge. Les pastilles, badges et bordures actives utilisent `--acc` ; la machine, les boules des autres et les séries « autres » des graphiques utilisent `--warm`.

## 3. Typographie

- **Display (h1, h2, grands chiffres, wordmark) : Jersey 10** (Google Fonts, pixel display haut et condensé). h1 `clamp(64px, 9vw, 128px)`, `line-height: 0.9`, `letter-spacing: 0`. h2 `clamp(40px, 5vw, 64px)`. Grands chiffres (compte à rebours) `clamp(80px, 11vw, 160px)`. **Toujours à une taille multiple de 10 px** (la police est dessinée sur 10 px : 80, 90, 120, 160) pour rester nette.
- **Texte courant : Inter** 15/24 (16/26 desktop), `--ink-2` pour le secondaire. Le pixel ne se lit pas en paragraphe ; on garde une vraie police de texte.
- **Étiquettes, données, tableaux, flux, hashes : Geist Mono** 13 px (12 px pour les étiquettes), minuscules, `tabular-nums`.
- **Télécharger les woff2 depuis Google Fonts** avec le CSS API (en-tête User-Agent Chrome, sous-ensemble latin de `fonts.gstatic.com`) et les mettre dans `app/public/fonts/` ; **ne pas fabriquer de sous-ensemble à la main** (le précédent a cassé le point de Schibsted). Charger avec `next/font/local`.
- Rendu : `-webkit-font-smoothing: none` **uniquement** sur Jersey 10 (pixel net), `antialiased` ailleurs.

## 4. Les objets, redessinés en pixel art (dans le code, `app/components/pixel/`)

Un petit module `sprite.ts` : grilles de caractères (`"...wwb.."`) converties en `ImageData` une fois, dessinées sur le canvas basse résolution. Palette de sprite = §2 plus deux teintes de dithering.

1. **La machine à tirage** (héros, 160×120 logique, agrandie ×S) : cage ronde en `--warm` (cercle de 2 px, 9 barreaux verticaux de 1 px), axe, **manivelle** à droite, socle sombre `--bg-3` avec une ligne `--line`, goulotte en bas à gauche ; à l'intérieur, 14 boules `--cream` de 7 px avec une ombre dithering ; dessous, une ombre portée en damier.
2. **La boule** (16×16) : `--cream`, reflet 1 px blanc, ombre 1 px ; variante « moi » avec anneau 1 px `--acc`, variante « graine » noire 10×10.
3. **Le ticket** (24×14) : `--ink` sur fond `--bg-2`, numéro 4 chiffres en micro-police, bord cranté.
4. **Une micro-police 3×5** pour les chiffres dans la scène (montants sur les boules), définie dans `sprite.ts`.

La photo `hero.jpg` est conservée **une seule fois**, dans le bandeau de la phrase non refermable, **posterisée en 8 couleurs et pixelisée** (traiter l'image au build avec un script Node + sharp : réduire à 320 px de large, quantiser, agrandir ×4 nearest ; livrer `hero-pixel.png`). La phrase par-dessus en Jersey 10 `--ink`.

## 5. Interactivité — ce qui rend le site vivant

1. **La manivelle se tourne.** Dans le héros, cliquer-glisser (ou le doigt) sur la manivelle fait tourner la cage et sauter les boules (physique simple). Un libellé mono apparaît la première fois : « spinning does nothing to the draw » — honnête et drôle. Au repos, la cage tourne d'un cran toutes les 2 s.
2. **Les boules se survolent.** Dans la scène live, survoler une boule affiche une étiquette pixel (pseudo, montant, « 12 slots ago ») ; cliquer la fixe.
3. **Le curseur** est un curseur pixel (PNG 16×16 `--ink` avec contour `--bg`, `cursor: url(...) 2 2, auto`), avec une variante main sur les éléments cliquables.
4. **Les boutons** s'enfoncent : repos = fond `--acc`, bord bas/droite 4 px `--bg` (ombre dure) ; `:active` = translate(4px, 4px) et ombre 0 ; hover = `--acc-2`. Secondaire : bord 2 px `--line`, fond `--bg-2`. Jamais d'icône, jamais de flèche.
5. **Les panneaux** réagissent au survol s'ils sont cliquables : la bordure passe en `--acc`, décalage 2 px.
6. **Les chiffres comptent** par pas entiers (pas d'interpolation lisse : `snap: { innerText: 1 }`).
7. **Le flux en direct** : chaque nouvelle entrée arrive en 3 étapes (`steps(3)`), et la boule correspondante tombe dans la cage de la scène.
8. **Raccourcis clavier** : `E` ouvre l'entrée, `?` ouvre la FAQ, `Esc` ferme ; affichés en badges mono dans le pied de page.
9. **Konami et faux secrets : non.** Pas de son.

## 6. Mouvement — le système GSAP de la v4, en pas

Mêmes déclencheurs (entrée de page, progression, parallaxe, reveals à 82 %, section épinglée scrubbée qui rejoue les quatre états, compteurs, graphiques, flux, ticker), mais **toutes les courbes sont en pas** : `ease: "steps(6)"` pour les mouvements de 0,5 s, `steps(10)` pour 0,9 s ; les compteurs par entier ; la parallaxe arrondie au pixel logique (`snap: S`). La ligne de progression est faite de blocs de 8 px qui s'allument. Les barres des graphiques poussent par pas de 1 px logique. La scène du tirage reste honnête (chute 300 ms, arrêt net, une graine, placement, < 2 s). `prefers-reduced-motion` coupe tout.

## 7. Les primitives, en pixel

| primitive | spec v5 |
|---|---|
| `Panel` | fond `--bg-2`, bordure 2 px `--line`, coins crantés 2 px (`clip-path`), ombre dure 4 px `#000` à 60 %, padding 24/20. `tone="muted"` : `--bg-3` sans ombre. |
| `Section` | en-tête : numéro mono `01` en `--warm`, h2 Jersey, intro Inter 17 px `--ink-2` ; ligne 2 px `--line` au-dessus. 96/64 de padding. |
| `Figure` | chiffre Jersey (xl 80 px, lg 40 px, md 20 px mono) `--ink`, légende mono 12 `--ink-3`, « measured 23 Oct 2026 · source » en `--acc-2`. |
| `Button` | §5.4. Hauteur 48 px, Jersey 10 à 20 px pour le libellé, montant en mono. |
| `Badge` | mono 12, bordure 2 px `--line`, fond `--bg`, carré ; `live` : carré 6 px `--acc` qui clignote **en pas** toutes les secondes (seule exception au « rien ne clignote » : c'est le point live). |
| `Table` | lignes 40 px, lignes 2 px `--line` entre les rangs, chiffres mono à droite, en-tête mono `--ink-3`. |
| `Feed` | 48 px par ligne, identicon 16×16 pixel (généré du pubkey, 2 couleurs), pseudo mono 13, montant mono à droite ; ma ligne : bordure gauche 4 px `--acc`. |
| `Chart` | SVG avec `shape-rendering: crispEdges`, axes 2 px `--line`, barres pleines sans rayon, série moi `--acc`, autres `--warm`, reste `--ink` ; texte mono 11. |

Capsule d'en-tête : rectangle (pas de pilule) `--bg-2`, bordure 2 px `--line`, ombre dure, nav en blocs (actif : fond `--acc`, texte `--bg`), `PULLED` en Jersey 10 à 30 px, « the draw » mono. Pied de page : `--bg-2`, colonnes mono, badges des raccourcis, la machine en petit, wordmark « PULLED » Jersey 10 à `clamp(120px, 22vw, 320px)` en `--bg-3` (plein, sans dégradé).

Fond de page : `--bg` uni. **Une** texture autorisée : un damier de dithering 2×2 à 3 % en bas de page derrière le pied de page. Rien d'autre.

## 8. Structure

Identique à la v4 §6 (capsule, héros 2 colonnes avec la machine pixel à droite, le tirage en direct, ticker, trois figures, bandeau photo pixelisé + phrase, How it works épinglé, When the result arrives, loi + G3, plafond, frais, résultats passés, fenêtres récentes, FAQ, pied de page). Pages intérieures : mêmes primitives, héros court avec un sprite (boule, ticket, graine).

## 9. Pré-vol v5

- [ ] Fond noir mat ; six couleurs ; aucun rayon, aucun flou, aucun dégradé ; ombres dures.
- [ ] Jersey 10 (tailles multiples de 10) + Inter + Geist Mono, woff2 **d'origine Google**, locales ; le point et la ponctuation se composent normalement.
- [ ] Toutes les images sont rendues en pixels nets (facteur entier, sans lissage) ; aucun rendu 3D lissé ne subsiste.
- [ ] La manivelle se tourne à la souris et au doigt ; les boules se survolent ; les boutons s'enfoncent ; le curseur est pixel.
- [ ] Mouvement en pas partout ; section épinglée, compteurs, graphiques, flux, ticker présents ; reduced-motion coupe tout.
- [ ] Deux accents ; résultat sans couleur ; tirage < 2 s et honnête.
- [ ] Aucun élément de PEAKED (fenêtres d'OS, crème, ciel, Pixelify), de FomoEven (mer, pervenche) ni de CLOCKED.
- [ ] `pnpm --filter @pulled/app build` et `node --experimental-strip-types tests/forbidden-words.ts` passent.
- [ ] Captures 1280 et 375 de chaque page dans `app/screenshots/v5/`, plus la section épinglée à mi-scroll et le héros pendant un tour de manivelle.


---

# v6 — encore plus pixel, décor détaillé, homepage carrée, et le fond du projet

Demande du propriétaire sur la v5 : « encore plus pixel avec du détail déco, tout en version pixel ; un meilleur site, avec une homepage de son côté, belle, propre, carrée ; mais surtout du détail sur le projet ». Trois axes, qui s'ajoutent à la v5 (rien n'est retiré).

## 10. Tout en pixel, avec du détail dessiné

Le site est **une scène pixel art complète**, pas une page noire avec un sprite. Tout ce qui est visible est dessiné en pixels, à la main dans le code (`app/components/pixel/sprites/*.ts`, une grille de caractères par sprite, palette §2 + 4 teintes de dithering).

1. **La frise du stand de fête foraine** (héros, pleine largeur, 320×96 logique, ×S) : derrière la machine, un stand de tombola la nuit — comptoir en bois, auvent rayé ambre/noir, guirlande de fanions, trois lampes qui s'allument en pas (une toutes les 1,5 s, jamais en même temps), un bocal de tickets, une ardoise « same price · not the same bag » en micro-police, une pile de boules. Tout en silhouette sombre sur `--bg`, les lampes en `--warm`, un seul point `--acc` (la lampe du guichet « enter »). La machine du héros se tient sur ce comptoir.
2. **Une icône pixel 24×24 par section**, dessinée, pas une bibliothèque : fenêtre (horloge à slots), graine (boule noire), partage (balance), loi (règle graduée), plafond (barrière), frais (ticket), oracle (antenne), remboursement (flèche retour), sécurité (cadenas sans anse = pas de clé), SDK (brique), keeper (clé à molette), indexeur (loupe). Chaque `Section` l'affiche à gauche de son numéro.
3. **Ornements de cadre** : chaque `Panel` a quatre coins pixel 6×6 dessinés (motif « coin de ticket »), et les panneaux importants (le direct, les trois figures) ont une bordure pointillée 2 px intérieure.
4. **Filets décoratifs** : entre les sections, une ligne de 2 px `--line` avec, au centre, un petit motif de 12×6 (trois boules ou un ticket) ; une **boule pixel** roule le long du filet quand il entre à l'écran (steps, 0,6 s).
5. **Le ticker** est une guirlande : les fenêtres réglées défilent comme des fanions, chaque fanion = un triangle pixel `--warm` ou `--acc` + le texte mono.
6. **Les graphiques** sont en pixel : barres faites de blocs de 4×4 empilés (chaque bloc apparaît en pas), lignes tracées en escalier (Bresenham), points carrés 4×4, axes 2 px, étiquettes mono. Les `Figure` ont un cadre pixel 2 px avec un coin coupé.
7. **La capsule** porte à gauche une mini-machine 16×12 animée (manivelle qui tourne d'un cran par seconde) à côté du wordmark.
8. **Pied de page** : la frise du stand en petit, éteinte (lampes grises), et un rideau de dithering qui tombe.
9. **Micro-animations** partout, en pas : le point live, les lampes, la manivelle, la boule du filet, le curseur qui cligne sur les champs, les boutons qui s'enfoncent. Rien de lisse. `prefers-reduced-motion` coupe tout sauf le point live.
10. **Un favicon et une image Open Graph pixel** (`app/public/og.png` 1200×630 : la machine, le wordmark Jersey, le fond noir) générés par un script Node (`scripts/make-og.mjs`, canvas → png via `sharp` ou `pngjs`).

## 11. La homepage, carrée et propre

La page d'accueil est posée sur **une grille carrée visible** : fond `--bg` + un quadrillage très discret de 8×8 px (lignes 1 px `--bg-2`, visible mais calme ; désactivé sur mobile). Tous les blocs s'alignent dessus : largeurs en multiples de 8 S, hauteurs en multiples de 8 S, gouttière 16, marges 24/64, conteneur 1152 (= 144 × 8).

Les sections sont des **modules carrés ou rectangulaires nets** sur la grille, sans espace mou : la ligne « trois figures » fait trois carrés égaux ; le direct est un rectangle 8:5 + une colonne ; « How it works » est quatre carrés ; les gates (§12.3) sont sept carrés sur une ligne (défilables sur mobile). Chaque module a un titre mono en haut à gauche et un numéro à droite. Pas de bloc centré flottant ; tout est justifié aux colonnes.

Ordre de la homepage v6 (chaque ligne = une bande de la grille) :
1. Capsule.
2. **Héros** : frise du stand + machine (droite), titre Jersey + sous-titre + badge live + bouton (gauche).
3. **Le tirage en direct** (scène + flux + résultat + sell back).
4. **Ticker-guirlande**.
5. **Trois figures carrées** (somme conservée · espérance · frais).
6. **Le projet en une bande** (§12.1).
7. **Comment ça marche** (quatre carrés, épinglé et scrubbé comme en v4).
8. **La loi et les cotes** (formule + G3 + petit joueur + plafond).
9. **Les sept portes** (§12.3).
10. **L'architecture** (§12.4).
11. **Quand le résultat arrive** (G2) + **Si l'oracle se tait** (remboursement).
12. **Frais, autorité, ce qui ne peut pas être fait** (§12.5).
13. **Résultats passés + fenêtres récentes**.
14. **Risques, en clair** (§12.6).
15. **Glossaire + FAQ**.
16. **Statut du projet** (§12.7) + pied de page.

## 12. Le fond du projet — ce qui doit être lu sur la homepage

Tout ce qui suit existe déjà dans `/docs` et `/research` ; la homepage le **raconte**, en Inter 16/26, avec les chiffres en `Figure` datés et sourcés, sans jargon non expliqué. Chaque bloc a un lien « read more » vers la page ou le document.

### 12.1 Le projet en une bande
Trois phrases en grand (Jersey 40) et trois paragraphes : (a) ce qu'est PULLED : une fenêtre de ~20 s où tout le monde paie le même prix, un seul tirage externe qui décide du partage, la somme toujours exacte ; (b) pourquoi cette forme : la seule boucle qui tient sur Solana est révélation courte + rachat immédiat, mais on refuse de détenir un stock ou l'argent des gens, donc la variance est redistribuée entre joueurs de la même fenêtre ; (c) ce que la maison fait et ne fait pas : 1 % d'entrée, zéro sur le tirage, zéro sur la revente, aucun administrateur, aucune pause.

### 12.2 Comment ça marche, en quatre carrés
Ouverte → scellée → tirée → réglée, avec pour chaque carré : le sprite, deux lignes, la durée (en slots et en secondes estimées, 217 ms/slot mesuré), et l'instruction du programme (`enter`, `seal` + `request_vrf`, `fulfill`, `tally_page` + `settle_page`).

### 12.3 Les sept portes de vérification
Sept carrés G1 → G7, chacun avec : son nom, son verdict (PASS / PASS après redesign / UNVERIFIED) dans un badge, la phrase-clé, le chiffre principal en `Figure`, le lien vers `research/Gx.md`. Contenu exact :
- G1 antériorité — PASS — aucun produit vivant ne tire la taille du remplissage à prix fixe et somme conservée (46 requêtes, 23 oct 2026).
- G2 aléa — PASS, design changé — ORAO VRF ; latence mesurée sur 314 demandes mainnet : médiane 4 s, p90 72 s, p99 113 s ; la boucle séquentielle de 20 s est morte, les fenêtres sont en pipeline ; Switchboard déprécié.
- G3 équité — PASS après redesign — la loi multiplicative avantageait les petites mises de 7 % à 265 % ; la loi linéaire est exacte à ±0,1 % par décile sur 10 000 000 de fenêtres.
- G4 concentration — PASS — plafond 20 % par entrée ; la plus grosse entrée explique au plus 3,6 % de la variance d'un petit joueur.
- G5 comptabilité — PASS (référence) — 10 000 fenêtres adverses, invariant au lamport ; programme non exécuté sur validateur.
- G6 temps — PASS — 1 slot = 217 ms (mesuré 10–23 oct 2026) ; 92 slots ≈ 20 s.
- G7 la boucle — UNVERIFIED — personne ne mesure le rejeu après un mauvais tirage ; protocole écrit, mesure non faite.

### 12.4 L'architecture, en cinq blocs reliés par des traits pixel
Programme Anchor (14 instructions, aucune d'admin) · ORAO VRF (graine après scellement) · Keeper permissionless (bounty 10 % du frais) · SDK + composant encastrable (partage de frais pour l'hôte ≤ 3 %) · Indexeur niveau AMM. Chaque bloc : deux lignes et un lien (`/integrate`, `SECURITY.md`, `programs/pulled/README.md`).

### 12.5 Ce que personne ne peut faire
Une liste pixel à cases (sans coche verte : carré plein `--ink` = impossible) : déplacer une mise · annuler après scellement · changer la loi, le plafond, les frais · mettre en pause claim / sell back / refund · choisir la graine · choisir entre tirer et rembourser après avoir vu la valeur · frapper plus de jetons. Et le statut de l'autorité de mise à jour : « NOT YET DEPLOYED — à révoquer après audit ou timelock 72 h », en badge.

### 12.6 Les risques, sans adoucir
Six lignes en Inter, tirées de `docs/RISKS.md` : la question légale non résolue (bloquante avant mainnet) ; six entrées sur dix finissent sous leur prorata ; les frais sont une perte certaine ; la courbe n'est pas de la monnaie ; un seul fournisseur d'aléa ; la catégorie recule (chiffres vérifiés, datés). Lien vers le document.

### 12.7 Statut
Un tableau mono : programme (cargo check + 21 tests hôte, non compilé SBF, non déployé) · tests (props 10 000 fenêtres OK, suite Anchor non exécutée) · audit (aucun) · déploiement (aucun) · juridique (ouvert). Daté.

## 13. Pré-vol v6 (en plus de §9)
- [ ] La frise du stand, les 12 icônes, les coins de panneaux, les filets ornés, la guirlande, les graphiques en blocs, la mini-machine de la capsule, le pied de page : tous dessinés en pixels, tous présents.
- [ ] La grille 8 px est visible et tout s'y aligne ; aucun bloc flottant ; la homepage se lit comme une planche carrée.
- [ ] Les sept sections de fond (§12.1 à 12.7) sont sur la homepage avec leurs chiffres datés et leurs liens.
- [ ] OG image et favicon pixel générés.
- [ ] Aucun mot interdit (le test passe) ; aucun verdict embelli : UNVERIFIED reste UNVERIFIED.
