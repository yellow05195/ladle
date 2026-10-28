# La mécanique, en français simple

## En une phrase

Tout le monde paie le même prix, mais ne reçoit pas le même sac — et la somme de tous les sacs est exactement ce que la courbe a vendu, au lamport.

## Les quatre phases d'une fenêtre

1. **Ouverte** (`window_slots` slots, fixé à la création du marché, par exemple 92 slots ≈ 20 s au temps de slot mesuré le 2026-10-23 — voir `research/G6.md`). Tu entres avec `enter(amount)`. Ta mise part en séquestre dans le compte de la fenêtre. Les entrées sont publiques en direct. Aucun tirage n'existe encore.
2. **Scellée** (dès le slot de fermeture, n'importe qui peut appeler `seal`). Plus aucune entrée. **Plus aucun retrait, pour personne.** Puis `request_vrf` demande un aléa externe (ORAO VRF) — cette demande est impossible avant le scellement.
3. **Tirée** (quand l'oracle répond, n'importe qui appelle `fulfill`). La fenêtre reçoit **une seule** graine de 64 octets. Le tirage de chaque entrée en découle de façon déterministe :
   ```
   h      = sha256(graine || propriétaire || index)
   tirage = floor(10001 × (n / 2^21)^3)      n = 21 premiers bits de h   → entier dans [0, 10000]
   ```
   N'importe qui peut le recalculer, hors chaîne, à partir de données publiques (bouton « recalculer » dans l'interface).
4. **Réglée.** Les frais (1,00 % plateforme, + part de l'hôte si l'app qui t'a amené en a fixé une, ≤ 3 %) sont retirés du total, puis la courbe est exécutée **une seule fois** pour le reste. Les jetons obtenus sont répartis selon la loi ci-dessous. Le règlement se fait par pages (`tally_page` puis `settle_page`), dans l'ordre, sans sauter ni compter deux fois une entrée.

Puis, et pour toujours : `claim` (prendre ses jetons) ou `sell_back` (les revendre à la courbe, en une transaction, **zéro frais**). Aucun de ces deux chemins ne peut être mis en pause ni bloqué par qui que ce soit : il n'existe aucune instruction d'administration dans le programme.

## La loi de partage

Soit `a_i` ta mise, `A` le total de la fenêtre, `r_i` ton tirage, et `r̄ = Σ a_j r_j / A` le tirage moyen de la fenêtre pondéré par les mises.

```
ta part = jetons_vendus × (a_i / A) × (1 + (r_i − r̄) / 10000)
```

- `(a_i / A)` est ta part **au prorata** : ce que tu aurais sans tirage.
- Le facteur `1 + (r_i − r̄)/10000` est ton **multiplicateur**, entre 0 et 2. Il vaut plus que 1 si ton tirage dépasse la moyenne de la fenêtre, moins sinon.
- La somme des parts vaut exactement `jetons_vendus` : les écarts à la moyenne s'annulent quand on les additionne avec les poids `a_i / A`. **C'est l'invariant.** Ce que l'un prend en plus, les autres le prennent en moins, à l'intérieur de la fenêtre. La maison n'y touche pas.
- L'espérance du multiplicateur est **exactement 1 pour tout le monde**, petit ou gros, parce que la formule est linéaire dans ton tirage (`research/G3.md`, 10 millions de fenêtres simulées). La première version de la loi (poids multiplicatifs) ne l'était pas : elle avantageait les petites mises de 7 % à 265 % selon la composition. Elle a été rejetée.

Forme du tirage (`u³`) : environ six entrées sur dix finissent **sous** leur prorata (typiquement autour de 0,9×), une sur dix au-dessus de 1,45×, une sur cent au-dessus de 1,75×. Le maximum est inférieur à 2×. Chiffres mesurés le 2026-10-23, voir `docs/ODDS.md`.

## Une seule personne dans la fenêtre

`r̄ = r_i`, le multiplicateur vaut 1 : tu reçois exactement ce que la courbe donne pour ta mise. Le tirage n'a aucun effet. (Test dédié.)

## Les arrondis

Les parts sont des entiers. On calcule, dans l'ordre des entrées, `part_i = floor(jetons × C_i / S) − floor(jetons × C_{i−1} / S)` avec `C_i` la somme cumulée des poids et `S = 10000 × A²` leur total. La somme télescope exactement à `jetons`. Chaque part est à moins d'une unité de base de sa valeur exacte. Le reste n'est ni jeté ni donné au dernier : il tombe sur les entrées où la fraction cumulée franchit un entier. Cette méthode (quotas cumulés) remplace la « méthode du plus fort reste » demandée dans le cahier des charges parce qu'elle se calcule une entrée à la fois, donc par pages, alors que le plus fort reste exige de trier tous les restes d'un coup — impossible en plusieurs transactions. Même borne d'erreur (±1 unité), voir `research/G5.md`.

## Le plafond par entrée

Une entrée ne peut pas dépasser **20 % de la fenêtre au moment où elle entre** (25 % de ce qui y est déjà), avec un plancher absolu pour que la fenêtre puisse démarrer et un maximum absolu par entrée. Sans plafond, une baleine qui fait la moitié de la fenêtre décide d'environ la moitié de la variance du résultat de chacun. À 20 %, moins de 4 % dans le pire cas. Mesuré dans `research/G4.md`. Scinder sa mise en plusieurs entrées est permis et souhaitable : plusieurs tirages indépendants, moins de concentration.

## Quand le résultat arrive

Les fenêtres s'ouvrent sur une grille fixe de slots (une nouvelle peut s'ouvrir dès que la précédente est scellée). Le tirage d'une fenêtre arrive quand l'oracle répond : **4 s en médiane, mais 72 s au 90ᵉ percentile et 113 s au 99ᵉ** (314 demandes ORAO mesurées sur mainnet les 16–17 octobre 2026, `research/G2.md`). Les fenêtres exécutent la courbe strictement dans l'ordre de leur index, donc une fenêtre dont l'oracle tarde retarde le règlement des suivantes, jamais leur ouverture. Le bouton « revendre maintenant » apparaît quand ta fenêtre est réglée. C'est la raison pour laquelle le produit n'est pas une boucle séquentielle de 20 s : cette boucle-là est morte, mesurée.

## Si l'oracle ne répond pas

Après `vrf_timeout_slots` sans réponse (900 slots ≈ 3,3 min, choisi sur la latence mesurée : 0 expiration dans l'échantillon), **n'importe qui** appelle `refund_window`, puis `refund_entry` pour chaque entrée : chacun récupère **sa mise entière** (les frais ne sont prélevés qu'au règlement). Pas de condition, pas de pause, pas de frais. Si l'oracle a répondu, le remboursement est refusé : il faut `fulfill`. Personne ne peut donc choisir entre « tirer » et « rembourser » en regardant la valeur.

## Les frais, en clair

| chemin | frais |
|---|---|
| création d'un marché | fixe, une fois |
| entrée dans une fenêtre | 1,00 % plateforme (dont 10 % du prélèvement reversé à qui finalise la fenêtre) + part de l'hôte (0 à 3 %, fixée par l'intégration à sa création) |
| `claim`, `sell_back`, `sell`, `refund` | **0** |
| le tirage lui-même | **0, jamais** — la maison vit du frais d'entrée, pas de la variance |

Les taux sont écrits en dur dans le programme ; aucune instruction ne peut les modifier.
