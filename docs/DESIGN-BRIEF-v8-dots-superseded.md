# Brief de direction artistique v8 — PULLED, en points

**Remplace la v7 HUD (archivée dans `DESIGN-BRIEF-v7-hud-superseded.md`) et la v7.1. On garde : la structure en 16 bandes, le fond du projet (le projet, les quatre étapes, les sept portes, l'architecture, ce que personne ne peut faire, les risques, le statut), les primitives, la couche de données, les textes, les règles d'honnêteté, les corrections fonctionnelles (FR, clavier, chargement différé, reduced-motion, nettoyage) et le composant `DotMatrix` déjà commencé.** Tout le reste du visuel change.

Verdict du propriétaire sur la v7 : « encore trop IA ». Il a raison : cyan lumineux sur noir, crochets, fil de fer holographique, lignes de scan, relevés en capitales qui se tapent — c'est exactement ce que les générateurs produisent pour « futuriste ». Sa demande : **« un style de site FomoEven, mais en points / pixel, interactif »**, futuriste, pas IA.

---

## 0. L'idée : **le site est un afficheur à matrice de points**

Références humaines, à ouvrir et capturer dans `app/screenshots/refs/` : **nothing.tech** (la typographie à points, le noir, un seul accent, les écrans de points interactifs, l'humour sec), **teenage.engineering** (matériel, étiquettes, retenue), **vercel.com** (filets, grille, rythme), **resend.com** (noir, 3D mat et sobre), **FomoEven** (port local : capsule, chargeur, gros chiffres, objets, wordmark géant, mouvement). Vocabulaire, pas copie.

Ce que ça donne : un fond noir mat, du blanc, **un seul accent**, des filets de 1 px, des panneaux arrondis comme chez FomoEven, et **tout ce qui est image ou grand chiffre est fait de points** — des disques sur une grille, allumés ou éteints, qui réagissent à la souris. Pas de lueur, pas de dégradé, pas de fil de fer, pas de crochets, pas de scan, pas de texte qui se tape.

## 1. Couleurs — trois valeurs et un accent

```css
:root {
  --bg:        #0A0A0A;             /* noir mat */
  --surface:   #111111;             /* panneaux */
  --surface-2: #181818;             /* plats secondaires, code */
  --line:      rgba(255,255,255,0.10);
  --line-2:    rgba(255,255,255,0.18);
  --ink:       #F2F2F0;             /* texte, points allumés « les autres », le système */
  --ink-2:     #A3A3A0;
  --ink-3:     #6B6B68;             /* étiquettes (4.6:1) */
  --dot-off:   rgba(255,255,255,0.08);  /* points éteints : toujours visibles */
  --acc:       #FFB000;             /* ambre LED : MOI, l'action principale. Le seul accent. */
  --acc-ink:   #FFC53D;             /* ambre en petit texte */
}
```

Deux « accents » au sens du produit : **moi = ambre**, **les autres = blanc**. Résultat **sans couleur** (pire et meilleur en blanc, même corps). Aucune autre teinte nulle part : pas de cyan, pas de bleu, pas de vert, pas de rouge, pas de violet. Aucune lueur, aucune ombre portée colorée, aucun dégradé (sauf le fondu des bords du bandeau LED).

## 2. Typographie

- **Display et chiffres : Doto** (Google Fonts, police à matrice de points variable, axe `ROND`) — c'est une vraie fonte, nette à toutes les tailles, pas un sprite. h1 `clamp(56px, 8vw, 120px)`, graisse 700, `ROND 60`, `line-height: 0.95`. h2 `clamp(32px, 4vw, 56px)` 600. Grands chiffres en Doto 700 (compte à rebours `clamp(96px, 12vw, 180px)`), `tabular-nums`. Le wordmark `PULLED` en Doto.
- **Texte : Inter** 16/26 (15/24 mobile), `--ink-2` pour le secondaire, mesure 60–68 caractères.
- **Étiquettes, données, tableaux : Geist Mono** 12–13 px, **minuscules**, sans espacement forcé.
- Woff2 d'origine Google (CSS API, User-Agent Chrome), locales, `next/font/local`.
- Interdits : Chakra Petch, Jersey, Pixelify, serif, italiques, texte en dégradé, capitales espacées, typewriter.

## 3. Formes — celles de FomoEven, en noir

- Panneaux `--surface`, 1 px `--line`, **rayon 20 px**, padding 24, aucune ombre. Survol cliquable : bordure `--line-2`, 160 ms.
- Boutons **pilule** (999 px) : primaire fond `--ink` texte `--bg` (pas d'ambre sur le bouton : l'ambre est pour moi dans les données) ; au survol fond `--acc` texte `--bg` ; secondaire contour 1 px `--line-2`. 44 px, Inter 15 px 500. Pas d'icône, pas de flèche.
- Capsule d'en-tête flottante (FomoEven) : pilule `--surface` à 80 % + blur 16 px, 1 px `--line`, nav en pastilles (active : fond `--ink`, texte `--bg`), à droite le slot en `DotMatrix sm`, FR/EN, « Connect » secondaire.
- Filets : lignes verticales de grille à 1 px `--line` qui courent sur toute la page (deux, aux bords du conteneur 1200), comme Vercel ; lignes horizontales entre les bandes.
- Pastille « kicker » : **une seule**, dans le héros (« window demo-1100 · open · 12 entries », point live ambre qui respire en pas).

## 4. Les points — la matière du site (`app/components/dots/`)

Un moteur unique, `DotField` (canvas 2D, DPR, zéro allocation par frame) : une grille de cellules de `c` px, chaque cellule un disque de 0,42 c, **éteint = `--dot-off`**, **allumé = `--ink` ou `--acc`**, avec un niveau intermédiaire (0,35) pour les demi-teintes. Tout ce qui suit est rendu par ce moteur :

1. **Le héros** : un `DotField` pleine largeur (cellule 10 px desktop, 8 mobile) sur 72 vh. Dedans : **le boulier en points** — une cage circulaire (anneau de points allumés en demi-teinte, 24 « barreaux » qui tournent lentement comme des points qui défilent), les boules = groupes de 3×3 points pleins (les autres en blanc, la mienne en ambre), physique simple, manivelle à droite ; à gauche, le titre « Same price for everyone. Not the same bag. » **en Doto HTML par-dessus le champ** (pas rendu en points : lisibilité). **Interactif** : la souris allume les points à 60 px autour d'elle en demi-teinte et les boules s'écartent légèrement ; glisser la manivelle fait tourner la cage (inertie courte) avec la ligne mono « spinning does nothing to the draw » affichée une fois ; au toucher mobile, idem au doigt.
2. **Le chargeur** (première visite, ≤ 900 ms, `sessionStorage`) : fond noir, le wordmark `PULLED` qui se remplit colonne par colonne en points, puis dissolution.
3. **Les grands chiffres vivants** (compte à rebours, slot, total, entrées, résultats) : `DotMatrix` (5×7) — allumé blanc, moi/action en ambre ; points éteints visibles. Les `Figure` statiques (G3, frais, etc.) restent en Doto HTML.
4. **Le bandeau LED** (remplace le ticker) : matrice de 7 points de haut pleine largeur, texte des dernières fenêtres réglées qui défile par pas de colonne (40 ms), pause au survol.
5. **La photo d'archive** : `hero.jpg` convertie en **demi-teinte de points** (taille du point = luminance, cellule 6 px, blanc sur noir), rendue par le moteur, avec la phrase non refermable en Doto par-dessus et l'étiquette mono « archive · village hall · 1962 ». La seule image du site, et elle est faite de points.
6. **Les icônes** : seize icônes 16×16 **en points** (grille de disques, pas de carrés) pour les en-têtes de section, la nav, l'architecture, la liste « cannot ».
7. **Les graphiques** : barres = colonnes de points allumés (cellule 6 px), lignes = points sur la courbe, axes 1 px ; « moi » en ambre, « les autres » en blanc, le reste en demi-teinte.
8. **Le wordmark du pied de page** : `PULLED` en Doto `clamp(120px, 20vw, 300px)`, `--surface-2`, plein.
9. **Les transitions** : apparition par **dissolution de points** (tramage ordonné 4×4, 8 pas, 0,4 s) pour les panneaux au scroll, la graine, les états du boulier ; coupées sous reduced-motion.

Le moteur expose `setStage(stage, t)` pour la section épinglée. Repli : aucun besoin (canvas 2D partout) ; sous reduced-motion, le champ est statique et la souris n'allume rien.

## 5. Le tirage — inchangé et honnête

Dans le panneau du direct : le boulier en points (même moteur, cellule 8 px), le compte à rebours en `DotMatrix xl`, le flux à droite (lignes 56 px, code 4 caractères en `DotMatrix sm`, ma ligne avec un point ambre). Déroulé : boules qui tombent (300 ms), **arrêt net** au scellement, la graine = un point ambre qui descend en 600 ms et se matérialise par tramage, placement des boules sur une ligne graduée de points (700 ms), puis « your roll » / « your share » en `DotMatrix lg` blanc (sans couleur), puis le bouton « Sell back now for X » (pilule blanche). Total < 2 s. Rien ne simule du suspense.

## 6. Mouvement — doux, FomoEven, sans théâtre

GSAP conservé. Entrée de page : la capsule descend de 12 px, le titre monte de 24 px en masque par ligne (0,8 s, `power3.out`), le champ de points s'allume **colonne par colonne** de gauche à droite (0,9 s), les chiffres comptent par pas. Scroll : dissolution de points (§4.9), une fois, à 82 %. Section épinglée : scrub des quatre états. Compteurs par pas. Micro : pilules 160 ms, bordures 160 ms. **Supprimés** : ligne de progression lumineuse, scan, typewriter, parallaxe théâtrale (on garde une parallaxe de ±8 px sur le champ du héros seulement), bloom, lueurs. Rien ne clignote sauf le point live. `prefers-reduced-motion` coupe tout.

## 7. Structure — les 16 bandes de la v6 (ordre conservé)

Capsule · héros (champ de points + titre + kicker + trois `DotMatrix lg` + pilule « Enter the draw · 0.25 SOL » + « How it works ») · le direct · bandeau LED · trois panneaux (somme conservée · espérance · frais, chiffres Doto) · le projet · how it works épinglé (quatre panneaux + le boulier en points qui rejoue) · la loi et les cotes · les sept portes (sept panneaux, code en `DotMatrix md`, verdict en mono : `pass` / `unverified`, ce dernier en points éteints à 30 %) · l'architecture (cinq panneaux reliés par des pointillés de points) · quand le résultat arrive + si l'oracle se tait · frais, autorité, ce que personne ne peut faire · résultats passés + fenêtres récentes · risques · archive en demi-teinte + la phrase · glossaire + FAQ + statut · pied de page.

Pages intérieures : mêmes primitives ; héros court avec un petit champ de points (une boule qui roule sur une règle pour `/odds`, la cage figée pour `/window`, la manivelle pour `/about`, un cadre pour `/integrate`).

## 8. Ce qui fait « pas IA », à vérifier ligne par ligne

- Un seul accent, et il est réservé à « moi » et au survol du bouton. Le reste est noir, blanc, gris.
- Aucune lueur, aucun dégradé, aucune ombre colorée, aucune bordure animée, aucun crochet, aucun scan, aucun fil de fer, aucun typewriter, aucune capitale espacée.
- Les points éteints sont toujours visibles : c'est un afficheur, pas une texture.
- Les objets sont **dessinés par le moteur**, pas des rendus 3D lissés ni des sprites bitmap.
- Le texte courant est en Inter, lisible, mesuré ; seuls les titres et les chiffres sont en points.
- Les formes et le rythme viennent de FomoEven (pilules, rayons 20, capsule, chargeur, wordmark géant) ; la matière vient de Nothing (points) ; la rigueur de Vercel (filets).

## 9. Pré-vol v8

- [ ] Noir, blanc, gris, un ambre ; résultat sans couleur ; aucune autre teinte à l'écran (vérifier au compte-gouttes sur les captures).
- [ ] Doto + Inter + Geist Mono, locales, d'origine Google ; zéro Chakra/Jersey/serif.
- [ ] `DotField` : héros interactif (souris, manivelle), chargeur, boulier du direct, bandeau LED, archive en demi-teinte, icônes, graphiques, transitions par dissolution ; `DotMatrix` sur les chiffres vivants.
- [ ] Formes FomoEven : capsule, pilules, panneaux 20 px, wordmark géant ; filets verticaux Vercel.
- [ ] Tirage < 2 s, arrêt net, une graine, aucun faux suspense.
- [ ] Rien ne brille, rien ne clignote (sauf le point live), rien ne se tape.
- [ ] Les 16 bandes et le fond du projet sont là ; UNVERIFIED reste UNVERIFIED.
- [ ] FR complet, clavier, reduced-motion, 60 fps mesurés sur le champ du héros (≤ 4 ms par image), build et test de vocabulaire.
- [ ] Captures 1280 et 375 de chaque page dans `app/screenshots/v8/`, dont le héros avec la souris dedans, le direct à chaque état, le bandeau LED en défilement, l'archive.
