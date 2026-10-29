# Ce qui peut faire perdre de l'argent — sans adoucissement

Ce document est écrit pour être lu avant de mettre un centime, et avant de déployer une ligne. Il est mis à jour avec les mesures de `/research`. Date : 2026-10-23.

---

## 0. La question qui passe avant tout le reste : est-ce légal ?

**Statut : NON RÉSOLU. Aucune réponse de professionnel n'est encore écrite ici.** Notre recommandation reste de ne pas déployer sur mainnet sans elle. **Décision du propriétaire (2026-10-28) : lancement sur mainnet sans avis juridique ; il en assume le risque.** Ce qui suit reste vrai et reste à poser à un avocat dès que possible.

Une mise, un résultat tiré au sort, une récompense variable : c'est beaucoup plus proche d'un jeu d'argent que de tout ce à quoi le projet ressemble par ailleurs. Dans de nombreux pays (France : Code de la sécurité intérieure, art. L320-1 et suivants, monopole et agrément ANJ ; Union européenne : réglementations nationales ; États-Unis : droit fédéral et droit des États ; etc.) organiser une telle activité sans autorisation est une infraction. **Le fait que le programme soit on-chain, sans administrateur et à somme conservée ne règle pas la question, il la déplace.**

Deux questions précises à poser à un avocat spécialisé en droit des jeux d'argent et en droit des actifs numériques, et à ne pas deviner :

1. **La conservation de la somme change-t-elle la qualification ?** La maison ne gagne rien sur le tirage ; les joueurs se redistribuent entre eux ; la maison vit d'un frais d'entrée fixe. Est-ce un jeu d'argent (mise + hasard + espérance de gain), une loterie, un pari entre particuliers, ou autre chose ? La réponse dépend de la juridiction et, dans certaines, le seul fait de percevoir un frais sur une activité de hasard entre tiers suffit à qualifier l'organisateur.
2. **Le blocage géographique est-il suffisant ou illusoire ?** Un programme Solana est accessible depuis n'importe où ; l'interface peut géobloquer, le programme non. Est-ce que l'interface, le SDK et le composant encastrable (qui tourne chez d'autres apps, dans d'autres pays) engagent la responsabilité de l'éditeur ? Quel est le statut du SDK que d'autres intègrent ?

Questions annexes à poser dans la même consultation : fiscalité des frais perçus ; responsabilité en cas de perte liée à un bug ; obligations KYC/AML selon les pays ; qualification des jetons vendus par la courbe.

**Espace réservé à la réponse écrite du professionnel (nom, date, juridictions couvertes, conclusion) :**

> _(vide)_

---

## 1. Un mauvais tirage, c'est perdre pour de vrai

- Environ **six entrées sur dix finissent sous leur prorata** (mesuré par simulation le 2026-10-23, `docs/ODDS.md`). Le cas médian est autour de 0,9× ; le dixième percentile autour de 0,72×. Autrement dit : une entrée sur dix reçoit **28 % de jetons en moins** que sa part proportionnelle, ou pire.
- Chez Collector Crypt, après un mauvais tirage, tu gardes une carte avec un prix de référence. Ici tu gardes **juste moins de jetons**. Le bouton « revendre maintenant » rend la perte **bornée, connue, immédiate** — il ne la rend pas inexistante.
- La somme est conservée : pour que quelqu'un prenne plus, quelqu'un prend moins. Ce quelqu'un, ça peut être toi.
- Le produit n'a de moteur que si les gens rejouent après un mauvais tirage. **Ce n'est pas mesuré** (porte G7, `research/G7.md`) : personne ne publie de taux de ré-entrée après une perte ; les seules données disponibles sont des taux de rachat non conditionnels (34 % à 48 % selon les cohortes Collector Crypt) et un chiffre sans méthode (« 20,5 rachats par carte », une seule citation, non reproductible). Le protocole de mesure sur notre propre testnet est écrit dans G7 §4 et **n'a pas été exécuté**. Si personne ne rejoue après un mauvais tirage, il n'y a pas de produit.

## 2. Les frais sont une perte certaine

- 1,00 % plateforme, plus 0 à 3 % pour l'hôte qui t'a amené, prélevés sur ta mise avant l'achat sur la courbe. Si tout le monde revend immédiatement, la fenêtre entière récupère au mieux `total − frais`. **L'espérance d'une entrée revendue immédiatement est donc négative, du montant des frais**, exactement comme n'importe quel achat/vente sur une courbe avec frais. Le tirage ne change pas cette espérance ; il la redistribue.

## 3. La courbe elle-même

- Tu reçois des **jetons**, pas de la monnaie. Leur valeur de revente dépend de l'état de la courbe au moment où tu vends. Si beaucoup revendent avant toi, tu vends plus bas. Si personne n'achète après ta fenêtre, la liquidité est celle de la courbe et rien d'autre.
- Il n'y a **aucun achat hors fenêtre** : la seule façon d'acheter est d'entrer dans une fenêtre. La seule façon de sortir est de vendre à la courbe (ou, si le jeton est un jour listé ailleurs, à ce marché-là — hors de notre contrôle).
- **Le site ne sait revendre que ce qui est encore dans le programme.** Un joueur qui « emporte » ses LADLE dans son portefeuille ne peut plus les revendre depuis le site : il lui faut envoyer lui-même une transaction `sell` (le SDK sait la construire). Le site le dit avant le clic. Ces LADLE en portefeuille empêchent aussi pour toujours de récupérer le loyer du programme.
- Un marché qui ne reçoit plus de fenêtres est un jeton dont le prix ne peut que descendre à chaque vente.

## 4. L'oracle d'aléa

- Si le fournisseur de VRF ne répond jamais (ou refuse les demandes), **tout le monde est remboursé intégralement** après `vrf_timeout_slots`, sans frais, sans condition, par n'importe qui. C'est testé (`tests/cu-bench`, `keeper/test/loop.test.ts`). Le keeper rembourse lui-même les portefeuilles qui ont déjà un compte de SOL enveloppé ; il ne crée jamais ce compte pour quelqu'un d'autre (~0,0015 SOL de loyer que le joueur pourrait récupérer : n'importe qui pourrait vider le keeper ainsi). Les autres joueurs reprennent leur mise depuis le site (« Take my SOL back »), en ne payant que les frais de transaction.
- **Mesuré (`research/G2.md`, 314 demandes ORAO sur mainnet, 16–17 octobre 2026) : la valeur est utilisable après 4 s en médiane, mais 72 s au 90ᵉ percentile, 113 s au 99ᵉ, 158 s au maximum.** Le quorum est 3 nœuds sur 3 et c'est le nœud le plus lent qui fixe la latence. **Une boucle séquentielle de 20 s est donc intenable : 24 % des fenêtres attendraient plus de 20 s.** Le produit est construit en pipeline : sur mainnet une fenêtre s'ouvre tous les 560 slots (≈ 2 min) quoi qu'il arrive (le marché de recherche en avait 92, ≈ 20 s) ; le tirage d'une fenêtre arrive quand l'oracle répond ; les fenêtres exécutent la courbe dans l'ordre. Conséquence honnête, affichée dans l'interface : **le résultat arrive d'habitude en quelques secondes, mais une fenêtre sur dix attend plus d'une minute.** `vrf_timeout_slots` est fixé à 900 slots (≈ 3,3 min) : aucun remboursement dans l'échantillon (à 300 slots, 13 % des fenêtres auraient été remboursées). À re-mesurer chaque mois : la queue vient de l'exploitation des nœuds, pas du protocole.
- Switchboard On-Demand a été exclu : ses implémentations d'aléa sont dépréciées depuis le 19 septembre 2026 (support arrêté le 25), et son schéma donnait une option sans coût au consommateur. Il n'y a donc **un seul fournisseur** possible aujourd'hui ; s'il s'arrête, le produit s'arrête (toutes les fenêtres sont remboursées, mais plus aucune ne peut être tirée).
- Coût par tirage (mainnet, 23 octobre 2026) : ≈ 0,00185 SOL net (frais 0,0005 + loyer non remboursé 0,00135) ; une demande qui expire perd ≈ 0,005 SOL. Payé par celui qui envoie `request_vrf` (le keeper), qui reçoit seul la prime de finalisation du tour (`window.vrf_payer`) : un robot qui envoie la dernière page à sa place ne gagne rien.
- **Mises minuscules (corrigé le 2026-10-28)** : deux portefeuilles qui misaient 1 lamport chacun forçaient un tirage payé ~0,00186 SOL par le keeper, pour quelques dizaines de milliers de lamports ; la réserve de 0,5 SOL y passait en ~9 h (~40 SOL par mois en continu). Le programme refuse désormais toute mise sous **0,1 SOL** (`MIN_ENTRY_AMOUNT`) : un tour qui demande un tirage fait au moins 0,2 SOL, et ses frais de 1 % (0,002 SOL) couvrent le tirage. Il reste que la réserve du keeper ne reçoit que la prime (0,1 %) : elle se vide sur les petits tours et se recharge depuis la trésorerie (alerte de solde bas ; `KEEPER_VRF_PER_DAY` plafonne les tirages par 24 h si on le souhaite, au prix de tours qui n'ouvrent plus au-delà).
- **Demande ORAO « volée » (corrigé le 2026-10-28)** : la graine scellée d'un tour était calculable par tous, et ORAO n'accepte chaque graine qu'une fois, de n'importe qui. En la demandant le premier à ORAO, n'importe qui pouvait forcer le remboursement de chaque tour pour ~0,002 SOL (et, avec l'ancien keeper, bloquer tout le marché). `request_vrf` sale désormais la graine avec une valeur choisie dans la demande elle-même ; le keeper ne laisse plus un échec de demande bloquer le scellement, réessaie avec un autre sel et rembourse après le délai. Ce que la correction change à la confiance dans ORAO : un ORAO entièrement corrompu pouvait déjà, de connivence avec le dernier entrant, choisir parmi des résultats (en essayant hors chaîne des entrées possibles avant la fin du tour) ; avec le sel, il lui faut la connivence de celui qui envoie la première demande, plus celle d'un entrant seul. Le risque de connivence reste, avec un autre complice (`SECURITY.md` §3). Le programme refuse aussi qu'ORAO prenne plus de 0,01 SOL à celui qui demande un tirage.
- **Un tour qui ne se termine pas bloque les suivants** (ils se règlent dans l'ordre, et un tour déjà tiré ne peut pas être remboursé). Depuis la deuxième revue, le programme n'ouvre plus de tour quand 8 attendent : les mises bloquées restent limitées à ces tours, le site affiche « paused », le keeper alerte et `/health` répond 503. La sortie de dernier recours est une mise à jour du programme (`docs/DEPLOY.md`, « A round that does not settle »).
- **Compte de séquestre « squatté » (corrigé le 2026-10-28)** : l'adresse du séquestre de chaque futur tour est publique ; le créer d'avance (~0,002 SOL) bloquait `open_window` pour toujours, donc le marché. `open_window` accepte maintenant un séquestre existant ; ce qu'un inconnu y dépose part dans le coffre de la courbe à la fermeture du tour.
- La confiance dans l'aléa repose sur les opérateurs du VRF (surface d'attaque détaillée dans G2). Un oracle corrompu de connivence avec un joueur pourrait biaiser une fenêtre. Nous n'avons pas d'alternative on-chain acceptable : tout aléa tiré de la chaîne elle-même est influençable par le leader du slot.

## 5. La catégorie recule

Vérifié (`research/G7.md`) : la catégorie gacha sur Solana a fait **284,3 M$ en juillet 2026, soit −17,5 % par rapport à juin** ; Collector Crypt en représente 53 à 55 % ; son revenu mensuel est passé de 212,2 M$ (juin) à 134,5 M$ (septembre), −37 %. Sur les joueurs mesurés par Bitquery (17 544 wallets), **78 % perdent de l'argent**, médiane −50 $ ; 714 baleines apportent 88 % de l'argent. **On arrive sur une catégorie qui se contracte, portée par un acteur dominant, où la plupart des joueurs perdent.** Il faut le savoir avant, pas après.

## 6. Sans distribution, rien ne décolle

Pump.fun (≈ 2 M$ le premier jour, vérifié), Jupiter (9 M$ en 5 jours, vérifié ; « 92 % de nouveaux » = nouveaux pour Collector Crypt seulement), Solflare (le « 5 M$ » est une valeur assurée, pas des ventes) : **aucun gagnant ne s'est distribué tout seul.** Le SDK, le composant encastrable et le partage de frais pour l'hôte (§9 du cahier des charges) ne sont pas optionnels. Sans une app qui a déjà le public, le produit n'a pas de public.

## 7. L'autorité de mise à jour est une contradiction vivante

Un programme à tirage avec une autorité de mise à jour est un programme dont la loi peut changer. Deux options, et pas de troisième : **révocation après audit** (recommandée) ou **timelock de 72 h minimum avec événement on-chain**. Décision du propriétaire (2026-10-28) : **lancement avec l'autorité conservée** (le loyer du programme reste récupérable). Voir `SECURITY.md` §2 et §7. **Arrêt du jeu** (décision du 28 octobre au soir) : la même clé peut arrêter le jeu pour récupérer ce loyer ; la version d'arrêt n'accepte plus ni tour ni entrée, affiche un **préavis de 7 jours**, puis paie automatiquement à chaque joueur ce qui reste dans ses entrées (sa part revendue au prix de la courbe de ce moment-là, ou sa mise si le tour n'a pas été tiré), en SOL sur son portefeuille. Ce qu'un joueur oublie lui est donc payé et ne bloque plus la fermeture. Le risque qui reste : un joueur qui attend la fin du préavis est revendu au prix de la courbe à ce moment-là, après les ventes des autres (souvent plus bas qu'au début du préavis) ; et rien n'empêche la clé, pendant ou avant l'arrêt, de remplacer le programme par autre chose. Tant que l'autorité existe, c'est le dernier pouvoir de rug, et sur ce produit c'est le plus grave de tous : tant qu'elle est un fichier sur le PC du propriétaire, n'importe quel logiciel qui lit ce fichier a ce pouvoir. `scripts/mainnet-up.ps1 -UpgradeAuthority usb://ledger` la déplace sur un Ledger à la fin du lancement.

## 8. Les bugs

- Le programme est compilé pour SBF et tourne de bout en bout sur LiteSVM (`tests/cu-bench` : de 1 à 2 048 entrées, remboursements, attaques des revues) ; une version précédente a joué un tour à 2 joueurs sur devnet. La loi est vérifiée par 10 000 fenêtres de test de propriété en TypeScript. **Aucun audit**, et la suite Anchor (`/tests/anchor`, avec le vrai ORAO) **n'a pas été exécutée** : à faire contre le déploiement devnet.
- L'arithmétique est en u128/U256 avec vérifications ; le test de propriété tient au lamport. Un bug non trouvé pourrait quand même casser l'invariant ou bloquer des fonds. Le programme n'a ni administrateur ni pause ; le seul « bouton d'urgence » est la clé de mise à jour, qui peut tout remplacer (§7) : c'est elle qui permet de corriger un bug, et c'est elle qui permettrait de tout prendre.

## 9. Ce que ce produit n'est pas

Pas un placement. Pas un revenu. Pas « gagner ». Un tirage au sort à somme conservée, payant, dont la plupart des participants ressortent avec un peu moins, quelques-uns avec sensiblement plus, et dont l'organisateur perçoit un frais fixe.
