# Ladle: launch runbook / mode d'emploi du lancement

## Ce qu'il faut envoyer

Chiffres du 2026-10-29, calculés avec `solana rent` sur mainnet sur le programme construit
(`ladle.so`, **387 040 octets**, v25 : l'arrêt du jeu avec préavis, sans `claim`). Le loyer est le
même sur devnet aujourd'hui (5 080 lamports par octet, frais fixes de 128 octets compris). Les scripts
refont le calcul et affichent le montant exact avant de demander quoi que ce soit. Aucun script ne
bouge vos SOL sans que vous l'ayez lancé vous-même.

### 1. Test sur devnet : des SOL de test (sans valeur)

* **Adresse** : le déployeur devnet `A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat`
  (fichier `%USERPROFILE%\.config\solana\pulled-devnet-deployer.json`).
* **État au 2026-10-28 (20 h, lecture seule)** : une version précédente (393 128 octets) est
  déployée sur devnet avec le marché de test `G7smCKFEYBU6vv3V4DWXg3BGapNRN3yW8p8U5nkRBjXd` ; le
  déployeur a **2,52759369 SOL**, le keeper devnet 0,49 SOL. **Rien à envoyer** : c'est assez.
* **Ce que coûte la mise à jour vers cette version** : pendant la mise à jour, un tampon de
  **1,96700140 SOL** (rendu au déployeur à la fin ; le programme rétrécit, rien à agrandir) et au
  plus ~0,0021 SOL d'écritures. Les tours de ce marché ne peuvent pas tourner sur cette version (le
  compte d'un tour a grandi) : arrêtez le keeper devnet, mettez `config/deployments/devnet.json` de
  côté, et le script crée un nouveau marché : **0,07207356 SOL** (dont 0,05 vont à l'adresse de
  trésorerie donnée en `-Treasury`) et 0,00148844 SOL pour le compte de frais de la trésorerie. Le
  script demande donc ~**2,053 SOL** sur le déployeur pendant ces étapes (marge de 0,01 comprise) et
  en garde ~0,086 au bout du compte.
* **Pour un tout premier déploiement** (un autre déployeur, vide) il faudrait ~2,5550 SOL de test
  (comme le mainnet ci-dessous, avec des écritures moins chères).
* **À vérifier sur devnet** : dans votre portefeuille de trésorerie (réseau devnet), les 0,05 SOL de
  frais de création du marché sont arrivés. C'est la preuve que l'adresse de trésorerie compilée dans
  le programme est bien la vôtre.
* **Commande** (même programme que sur mainnet, donc avec votre trésorerie mainnet) :
  `powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1 -Treasury <votre adresse de trésorerie>`

### 2. Mainnet : de vrais SOL, une seule fois

* **Adresse** : le déployeur mainnet, **créé par `scripts/mainnet-up.ps1` à sa première exécution**
  (`%USERPROFILE%\.config\ladle\ladle-mainnet-deployer.json`). Le script n'affiche plus de mots de
  secours (cette console peut être relue) : il vous demande de **copier le fichier sur une clé USB
  rangée à part** et de taper `BACKEDUP`, puis il affiche le montant et attend que vous tapiez
  `DEPLOY` et que les SOL arrivent.
* **Montant : 2,5565076 SOL**, envoyés depuis votre portefeuille.
* **Avant tout envoi**, le script vous fait retaper les **8 derniers caractères de votre adresse de
  trésorerie**, lus dans votre portefeuille : elle est compilée dans le programme pour toujours, et
  une faute de frappe enverrait tous les frais à une adresse que personne ne contrôle. Avec un
  multisig Squads, donnez l'adresse de son **coffre** (vault), pas celle du multisig : le script
  refuse une adresse qui appartient à un programme.

Ce que deviennent ces 2,5565076 SOL :

| poste | SOL | revient ? quand ? |
|---|---|---|
| loyer du programme (données + compte) | 1,96787516 | **oui, quand vous arrêtez le jeu** : `scripts/mainnet-shutdown.ps1` (section 8). Le jeu s'arrête (plus de nouveau tour, plus d'entrée), un **préavis de 7 jours** s'affiche sur le site, puis tout ce qui reste aux joueurs leur est **payé automatiquement** sur leur portefeuille, en SOL ; ensuite le programme se ferme et ces 1,96787516 SOL reviennent sur votre portefeuille. Ce qu'un joueur oublie (0,005 SOL, une mise jamais reprise) ne bloque plus rien : c'est payé à ce joueur. Pendant l'arrêt, le déployeur avance ~1,74 SOL pour la mise à jour, rendus quelques minutes après |
| ~398 transactions d'écriture | 0,003582 au plus | non (frais du réseau) |
| marché : frais de création | 0,05 | va sur **votre** trésorerie, tout de suite |
| marché : loyers + frais Metaplex + transaction | 0,02207356 | en partie : 0,0068072 (le compte du marché et ses deux coffres) reviennent au créateur (le déployeur) à l'arrêt ; 0,0051664 (le jeton et sa fiche Metaplex) jamais, 0,01 pour Metaplex, 0,0001 de transaction |
| comptes de frais (trésorerie, keeper) | 0,00297688 | oui, quand leur propriétaire les ferme (`spl-token unwrap`) |
| réserve du keeper | 0,5 | oui, ce qu'il n'a pas dépensé : après l'arrêt, `solana transfer ... ALL` (section 8) |
| marge | 0,01 | **oui, tout de suite** : `solana transfer <votre portefeuille> ALL` (gardez ~0,01 SOL pour fermer le programme ; l'arrêt redemande ~1,74 SOL le temps de la mise à jour) |
| **total envoyé** | **2,5565076** | |

Pendant le déploiement, le programme est d'abord écrit dans un tampon (1,96700140 SOL) ; le
déploiement transforme ce tampon en loyer du programme : il n'est pas payé en plus.

Bilan, honnêtement : **~0,0188 SOL perdus pour de bon** dès le départ (écritures 0,003582, Metaplex
0,01, jeton et fiche 0,0051664, transaction 0,0001), et **~0,0033 de plus le jour de l'arrêt**
(écritures de la version d'arrêt, transactions du préavis, des paiements et de la fermeture) : **~0,022
SOL en tout**. Les tirages ORAO et les transactions des tours sont des frais de fonctionnement, payés
par le keeper au fil des tours. Reviennent : la marge tout de suite, les 0,05 de frais de création
(déjà sur votre trésorerie), la réserve du keeper moins ce qu'il a dépensé, les comptes de frais, le
loyer de chaque tour (~0,0047 SOL, rendu au keeper quelques minutes après chaque tour), et **à
l'arrêt** le loyer du programme (1,96787516) et du marché (0,0068072). `scripts/mainnet-recover.ps1`
(section 8) affiche les montants et les commandes, sans rien envoyer.

**Clé de mise à jour du programme** : tant qu'elle reste sur ce PC (`ladle-mainnet-deployer.json`),
quiconque lit ce fichier peut remplacer le programme et prendre tout l'argent du jeu. Ajoutez
`-UpgradeAuthority usb://ledger` à `mainnet-up.ps1` : juste après le déploiement, après confirmation
(`HANDOVER`), la clé passe sur votre Ledger (qui doit signer : une faute de frappe est impossible).
Sans cette option, le script vous fait taper `HOTKEY` pour confirmer que la clé reste sur le PC. Le
programme ne peut pas naître directement sur le Ledger : l'outil `solana` ferait signer au Ledger
chacune des ~400 transactions d'écriture. Ensuite, chaque mise à jour (l'arrêt du jeu compris) passe
par un tampon écrit avec la clé du déployeur : le Ledger ne signe qu'**une** transaction.

### 3. Chaque mois

| poste | par mois |
|---|---|
| serveur VPS Hetzner (CX22/CX23) : le keeper et la discussion | ~4 à 6 € |
| RPC payant Helius Developer (une clé serveur, une clé site) | ~49 $ (~45 €) |
| Vercel Pro (l'offre Hobby interdit l'usage commercial) | 20 $ (~19 €) par membre |
| surveillance (offres à 0 € d'UptimeRobot ou Better Stack) | 0 € |
| **total fixe** | **~70 €** |
| sur la chaîne, payé par le keeper : tours vides ou à 1 joueur | ~0,11 SOL par 30 jours |
| en plus, par tour à 2 joueurs ou plus (tirage ORAO) | ~0,00186 SOL |

En retour : la prime du keeper (0,1 % des mises de chaque tour, payée à celui qui a payé le tirage ;
elle couvre le tirage dès qu'un tour dépasse ~1,86 SOL de mises) et vos frais (0,9 % des mises) sur
votre trésorerie. **Mise minimale : 0,1 SOL** (le programme refuse moins) : un tour qui demande un
tirage (2 joueurs ou plus) fait au moins 0,2 SOL, dont 1 % = 0,002 SOL de frais, plus que le tirage.
Personne ne peut donc vous faire payer des tirages avec des mises minuscules. La réserve du keeper,
elle, ne reçoit que la prime : rechargez-la depuis la trésorerie quand l'alerte de solde bas arrive.
Le programme refuse aussi qu'ORAO prenne plus de 0,01 SOL pour un tirage (aujourd'hui 0,00496 SOL
avancés, dont 0,00311 rendus) : un ORAO qui changerait ses frais ne peut pas vider la réserve.

**Durée des tours : 560 slots ≈ 2 minutes.** Vous aviez noté « ~300 slots » : un slot dure
aujourd'hui ~0,21 s sur mainnet (pas 0,4 s), donc 300 slots ≈ 1 minute. Les scripts prennent 560
(≈ 2 min). Pour des tours d'une minute, ajoutez `-WindowSlots 300` aux deux scripts (le keeper paie
alors ~0,22 SOL par 30 jours). Ce réglage ne peut plus changer une fois le marché créé.

**Si un tour ne se termine pas** (une dernière page refusée, un tirage qui n'arrive jamais), les
tours suivants l'attendent, car ils se règlent dans l'ordre. Le programme arrête alors d'ouvrir des
tours quand 8 attendent (aucune nouvelle mise ne s'empile derrière), le site affiche « paused », et
le keeper déclenche les alertes `settlement_stalled` / `rounds_paused` et répond 503 sur `/health`.
Ce qu'il faut faire : `docs/DEPLOY.md`, « A round that does not settle » (le plus souvent : recréer
le compte de frais de la trésorerie ; en dernier recours, une mise à jour du programme).

**Avant de passer le site en mode `chain` sur mainnet** : la construction du site s'arrête tant
qu'il reste un texte d'avant le lancement (`app/next.config.ts`). Le contrôle relève aujourd'hui 65
phrases : des clés de `app/i18n/en.ts` épinglées par leur texte exact (statut « non déployé »,
révocation après audit, timelock, « personne ne peut », tours de 92 slots / ~20 s…), les mêmes
expressions partout dans le site, `components/hall/sections/copy.ts` compris (pages À propos,
Sécurité, visite), et le lien vers le dépôt public (`NEXT_PUBLIC_LADLE_REPO`, sinon les liens
« vérifier la loi » pointent vers une organisation GitHub qui n'est pas la vôtre). C'est un filet,
pas une relecture : relisez les pages vous-même. Le texte juste, sur mainnet : le code déployé ne
permet à personne de déplacer une mise ni de choisir un résultat sans les signataires d'ORAO, mais
**celui qui détient la clé de mise à jour peut remplacer le programme à tout moment** (`SECURITY.md`
§2 et §7).

---

Owner's decisions (2026-10-28): a short devnet test, then mainnet-beta; the program stays
upgradeable (to ship fixes); its rent comes back when the owner stops the game (2026-10-28
evening: a 7-day notice, then every player paid out automatically, then the close: section 8);
rounds of about 2 minutes; the cheapest path, with
every SOL that can come back listed with its command. No audit and no legal opinion yet: the owner
carries that risk (`docs/RISKS.md`).

Décisions du propriétaire (2026-10-28) : un court test sur devnet, puis mainnet-beta ; le programme
reste modifiable (pour livrer des corrections) ; son loyer revient quand le propriétaire arrête le jeu
(28 octobre au soir : préavis de 7 jours, puis chaque joueur payé automatiquement, puis la fermeture :
section 8) ; des tours d'environ 2 minutes ; le
chemin le moins cher, avec chaque SOL récupérable listé avec sa commande. Pas d'audit ni d'avis
juridique : le propriétaire assume ce risque (`docs/RISKS.md`).

**Round length / durée d'un tour.** Slots are now ~213 ms on mainnet (measured 2026-10-28, 239 ms on
devnet): 300 slots would be ~64 s, so the scripts default to **560 slots ≈ 2 min** (`-WindowSlots`
changes it; 25 to 600, fixed forever per market). Twice as many rounds would double what the keeper
pays per day. / Un slot dure ~213 ms sur mainnet : 300 slots feraient ~64 s, les scripts prennent
donc **560 slots ≈ 2 min** par défaut (`-WindowSlots`, de 25 à 600, figé à vie pour un marché).

## 0. What runs where / Ce qui tourne où

| part | where | needs |
|---|---|---|
| program `programs/ladle` | Solana (devnet, then mainnet-beta) | ~2.01 SOL of rent while deployed; back only if nothing is left in the game at shutdown (section 8) |
| site `app/` | Vercel (Pro: Hobby is non-commercial) | `NEXT_PUBLIC_*` variables, a browser RPC key |
| keeper `keeper/` | the VPS, systemd (`deploy/systemd/ladle-keeper.service`) | its own keypair, 0.5 SOL float, a server RPC key |
| chat relay `chat/` | the same VPS, behind Caddy (`wss://chat.useladle.fun`) | nothing on chain, no RPC |
| your treasury | your wallet (hardware wallet or multisig vault) | receives the 1 % platform fee (minus the keeper's 10 %) and the 0.05 SOL market fee |

FR : le programme vit sur Solana ; le site sur Vercel ; le keeper (qui ouvre, scelle, tire et
règle les tours) et le relais de discussion tournent sur un petit serveur (VPS) ; la trésorerie est
votre propre portefeuille.

## 1. Accounts to open / Comptes à ouvrir

1. **VPS**: Hetzner Cloud **CX22/CX23 class** (2 vCPU, 4 GB, Ubuntu 24.04, an IPv4), any EU site.
   Add your SSH key at creation; no password login. FR : un serveur Hetzner de ce gabarit, avec
   votre clé SSH.
2. **RPC** (two keys on the same account / deux clés sur le même compte):
   * Helius **Developer** plan (about $49/month in 2025: 10M credits, 50 requests/s) is the
     default here; QuickNode **Build** is the equivalent; Triton One starts higher. The free tiers
     are too small for the keeper (it makes ~2-3M requests a month).
   * **server key**, used only by the keeper and the scripts: restrict it to the **VPS's IP
     address** (Helius: Dashboard > Endpoints > Access Control > allowed IPs; QuickNode: Endpoint >
     Security > IP allowlist).
   * **browser key**, in `NEXT_PUBLIC_RPC_URL` (every visitor can read it): restrict it to the
     **origin `https://useladle.fun`** (Helius: allowed domains; QuickNode: Referrer allowlist).
     That only stops other websites: a script can send any `Origin` header, so anyone can still use
     the key and spend its credits. Give it a hard spending cap and a rate limit at the provider.
   * **keep the two keys on separate plans** (two accounts, or two providers): credits are counted
     per account, so someone burning the browser key would otherwise starve the keeper and stop the
     rounds. The keeper needs little (~2-3M requests a month): a second small plan is enough.
   * FR : une clé serveur limitée à l'IP du VPS, une clé navigateur limitée au domaine. Le domaine
     n'empêche pas un script de l'utiliser : plafond de dépense et limite de débit chez le
     fournisseur, et la clé du keeper sur un **autre compte** (sinon l'abus de la clé du site
     épuise aussi les crédits du keeper).
3. **Vercel Pro** for the site (already linked to the repository: a push to `main` deploys).
4. **Uptime monitor**: UptimeRobot or Better Stack (their Free plans suffice), two HTTPS checks:
   `https://chat.useladle.fun/health` and `https://chat.useladle.fun/keeper/health` (503 when the
   keeper stalls or runs low on SOL).
5. Optional: a Discord or Slack **incoming webhook** for the keeper's alerts
   (`KEEPER_ALERT_WEBHOOK`).

## 2. Keys / Clés

| key | file | role |
|---|---|---|
| treasury | your wallet | `-Treasury`: compiled into the program (`LADLE_TREASURY`), receives the fees |
| program id | `target/deploy/ladle-keypair.json`, backed up to `%USERPROFILE%\.config\ladle\ladle-program-keypair.json` | the program's address; `cargo clean` deletes the original: keep an offline copy |
| mainnet deployer | `%USERPROFILE%\.config\ladle\ladle-mainnet-deployer.json` | pays the deploy, **holds the upgrade authority** (whoever has it can replace the program) |
| mainnet keeper | `%USERPROFILE%\.config\ladle\ladle-mainnet-keeper.json`, copied to `/etc/ladle/keeper.json` (`root:ladle-keeper 0640`: only the keeper's user reads it, not the chat relay) | pays round transactions, receives the bounty |
| devnet deployer / keeper | `%USERPROFILE%\.config\solana\pulled-devnet-deployer.json`, `ladle-devnet-keeper.json` | test SOL only |

`scripts/mainnet-up.ps1` creates the mainnet keys when missing, silently: no recovery words on the
console (scrollback, transcripts and terminal readers keep them). It asks you to copy the new key
files to an offline backup (a USB key kept apart) and to type `BACKEDUP`. The deployer key can
replace the program until the upgrade authority moves: pass `-UpgradeAuthority usb://ledger` (or a
keypair file kept offline) and the script moves it right after the deploy, after a typed
`HANDOVER`; the new signer must sign, so a typo cannot lock the program. Without it you type
`HOTKEY` to keep the authority on the PC. (The program cannot be deployed straight onto the Ledger:
the CLI would make it sign every one of the ~400 write transactions.)
`scripts/mainnet-shutdown.ps1 -Authority usb://ledger` then upgrades through a buffer the deployer
writes, so the Ledger signs one transaction (not ~370), and `mainnet-recover.ps1 -Authority
usb://ledger` prints the close with it. FR : sauvegardez les fichiers de clés hors ligne ; la clé du déployeur peut remplacer le
programme tant que la clé de mise à jour n'a pas été déplacée (`-UpgradeAuthority usb://ledger`).

## 3. Order / Ordre

### Step 1: devnet test / Étape 1 : test sur devnet

1. Build and deploy the **same binary** mainnet will run (same treasury), create the devnet market
   with the mainnet settings, fund the devnet keeper:
   ```
   powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1 -Treasury <your mainnet treasury>
   ```
   It prints the devnet SOL it needs (2.59779008 SOL for a first deploy: program rent, writes,
   market, fee accounts, keeper float) and waits. On 2026-10-28 an earlier build (393,128 bytes)
   was deployed on devnet with a market (`G7smCKFEYBU6vv3V4DWXg3BGapNRN3yW8p8U5nkRBjXd`) and the
   deployer held 2.52759369 SOL: the upgrade to this build asks for 2.03369212 SOL on the deployer
   (a 2.00975468 SOL buffer returned at the end, 0.01182624 to grow the program data, writes, the
   new market) and keeps ~0.0875; that market's rounds cannot run on this build (the Window grew),
   so stop its keeper and move `config/deployments/devnet.json` aside first: the script then
   creates a new market. Writes
   `config/deployments/devnet.json`, `app/.env.local` (the previous one kept once as
   `app/.env.local.before-devnet`), `%USERPROFILE%\.config\ladle\vercel-preview.env` and
   `%USERPROFILE%\.config\ladle\devnet-keeper.env`.
2. Set up the VPS (section 4) with the **devnet** files: `devnet-keeper.env` as
   `/etc/ladle/keeper.env`, the devnet keeper key as `/etc/ladle/keeper.json`, a `chat.env` from
   `deploy/chat.env.example`.
3. Vercel **Preview** environment: the devnet values (section 5, cluster `devnet`), deploy a branch.
4. Check, with two or three wallets / Vérifier, avec deux ou trois portefeuilles :
   * rounds open every ~2 min (`journalctl -u ladle-keeper -f`), empty rounds cost one
     transaction; `https://chat.useladle.fun/keeper/health` is 200;
   * one entry: settles in the sealing transaction; two or more: ORAO answers, the round settles,
     the window closes within a few minutes (`close_window` in the logs, rent back to the keeper);
   * sell back from the site (in one sale and in two; LADLE never goes to a wallet); the chat
     connects (`wss://`);
   * the treasury: the 0.05 SOL market creation fee arrived in **your** treasury wallet (on devnet):
     proof that the key compiled into the program is yours;
   * refunds happen only when ORAO does not answer within the VRF timeout, which you cannot force on
     devnet: `pnpm bench:cu` (refund flow) and the Anchor suite (`06-refund-timeout`) cover them.
     If one happens, the keeper sends `refund_window`, refunds the wallets that have a wSOL account,
     and the others see "Take my SOL back" on the site;
   * a drain: `KEEPER_DRAIN=1`, restart; it seals the open round at its close, finishes, refunds and
     closes the rest, the last round included, then exits (`drained` in the logs);
   * the settlement alarm: on devnet only, set `LADLE_TREASURY` in the keeper's settings to another
     key and restart: it must refuse to start (exit 2, "was not built with the treasury"); set it
     back;
   * the bounty unwraps (`unwrap` in the logs, hourly once ≥ 0.01 SOL);
   * alerts: set `KEEPER_ALERT_BELOW_SOL` above the keeper's balance, restart, see the webhook and
     the 503, set it back; `sudo systemctl restart ladle-keeper` stops and starts cleanly;
   * rehearse the recovery: `scripts/mainnet-recover.ps1 -Cluster devnet -Owner <a devnet wallet>
     -RpcUrl https://api.devnet.solana.com` (it only prints commands);
   * rehearse the shutdown on a separate devnet program built with the `rehearsal` feature (its own
     program id, a 10-minute notice): `docs/DEPLOY.md`, "Shutdown rehearsal".

### Step 2: mainnet / Étape 2 : mainnet

1. `https://useladle.fun/token.json` is live and final (the token metadata can never change).
2. Run, yourself / Lancez vous-même :
   ```
   powershell -ExecutionPolicy Bypass -File scripts/mainnet-up.ps1 `
     -Treasury <your treasury> `
     -RpcUrl "https://mainnet.helius-rpc.com/?api-key=<SERVER key>" `
     -AppRpcUrl "https://mainnet.helius-rpc.com/?api-key=<BROWSER key>"
   ```
   Add `-UpgradeAuthority usb://ledger` to move the upgrade authority off this PC at the end. It
   first makes you retype the last 8 characters of the treasury from your wallet, then asks before
   each irreversible step (typed words `BACKEDUP`, `HOTKEY` without `-UpgradeAuthority`, `DEPLOY`,
   `CREATE`, `HANDOVER`; `UNTESTED` first if the build differs from the devnet one;
   `-DevnetRpcUrl` if the public devnet endpoint refuses the comparison) and prints what it needs
   (387,040-byte `.so`):

   | item | SOL | comes back |
   |---|---|---|
   | program data + program account rent | 1.96787516 | when you stop the game: `scripts/mainnet-shutdown.ps1` (wind-down build, 7-day notice, every entry left paid out to its owner automatically, then `solana program close`; section 8) |
   | ~398 write transactions (5,000 lamports + priority fee, upper bound) | 0.003582 | no |
   | market: 0.05 fee + 0.01197356 rents + 0.01 Metaplex fee + tx | 0.07207356 | the fee goes to your own treasury; 0.0068072 of the rents come back to the creator at the shutdown (`close_market`), 0.0051664 (mint, metadata) never; Metaplex keeps its fee |
   | fee token accounts (treasury, keeper) | 0.00297688 | when their owner closes them |
   | keeper float | 0.5 | what is left after the shutdown: `solana transfer ALL` from the keeper |
   | margin on the deployer | 0.01 | `solana transfer ALL` |
   | **to send to the deployer** | **2.5565076** | ~0.0188 is spent for good at once (~0.022 with the shutdown's own writes and fees) |

   During the deploy the program is first written into a buffer (1.96700140 SOL); the deploy turns
   that buffer into the program data rent (`solana-bpf-loader-program`, `DeployWithMaxDataLen`), so
   it is not paid on top (the scripts asked 4.01 SOL before the 2026-10-28 review).

   The exact figures come from `solana rent` on the built `.so`. If the deploy stops halfway, rerun
   the script: it resumes into the same buffer (`ladle-mainnet-buffer.json`), or prints
   `solana program close <buffer>` to take the SOL back.
3. On the VPS, switch to the mainnet files the script wrote to `%USERPROFILE%\.config\ladle\`
   (`keeper.env`, `chat.env`, `ladle-mainnet-keeper.json` as `/etc/ladle/keeper.json`), then
   `sudo systemctl restart ladle-keeper ladle-chat`.
4. Rewrite the site's copy first: a mainnet chain build stops and lists every pre-launch statement
   it finds (`app/next.config.ts`, launch gate; `docs/DEPLOY.md`, "Before mainnet"): a program
   "not deployed", a revoked authority or a timelock, "nobody can", ~20-second rounds, the demo
   data, in `app/i18n/en.ts` and in `app/components/hall/sections/copy.ts`; and the repository link
   (`NEXT_PUBLIC_LADLE_REPO`). Then Vercel **Production** environment: paste
   `vercel-production.env` (section 5) with the real repository URL, redeploy.
5. Commit `config/deployments/mainnet-beta.json` (public addresses only); in `SECURITY.md` §2, write
   the deployer's address as the upgrade authority.
6. Watch the first rounds: health 200, `seal`, `fulfill+tally+settle`, `close_window`, `unwrap` in
   the logs; the keeper's balance on an explorer.

## 4. VPS setup / Installer le VPS

```
ssh root@<vps ip>
# the repository is private: give the VPS a read-only deploy key (GitHub > Settings > Deploy keys)
git clone <repo> /tmp/ladle && bash /tmp/ladle/deploy/install.sh <repo> main
```

`deploy/install.sh` installs Node 24, pnpm, Caddy and a firewall (SSH, 80, 443), creates two
users (`ladle` for the code and the chat relay, which faces the internet; `ladle-keeper` for the
keeper, the only one that can read its key), checks the code out in `/srv/ladle` with only the
keeper's and the relay's dependencies, and installs `deploy/systemd/*.service` and
`deploy/Caddyfile`. Then, from your PC:

```
scp %USERPROFILE%\.config\ladle\keeper.env %USERPROFILE%\.config\ladle\chat.env root@<vps ip>:/etc/ladle/
scp %USERPROFILE%\.config\ladle\ladle-mainnet-keeper.json root@<vps ip>:/etc/ladle/keeper.json
ssh root@<vps ip> "chown root:root /etc/ladle/keeper.env /etc/ladle/chat.env && chmod 0600 /etc/ladle/keeper.env /etc/ladle/chat.env && chown root:ladle-keeper /etc/ladle/keeper.json && chmod 0640 /etc/ladle/keeper.json && systemctl enable --now ladle-chat ladle-keeper"
```

The settings files are read by systemd (as root) only; the relay's unit also hides the keeper's
files (`InaccessiblePaths`), so a flaw in the relay cannot reach the keeper's key or RPC key.

DNS: an `A` record `chat.useladle.fun` -> the VPS's IPv4 (and `AAAA` for IPv6). Caddy fetches
the certificate on the first request. Checks: `curl -s 127.0.0.1:8788/health`,
`curl -s https://chat.useladle.fun/keeper/health`, `journalctl -u ladle-keeper -f`.
Updates: `bash /srv/ladle/deploy/install.sh <repo> main && systemctl restart ladle-keeper ladle-chat`.

Docker instead of systemd: same files in `/etc/ladle`, then
`LADLE_UID=$(id -u ladle) LADLE_GID=$(id -g ladle) LADLE_KEEPER_UID=$(id -u ladle-keeper) LADLE_KEEPER_GID=$(id -g ladle-keeper) docker compose -f deploy/compose.yaml up -d --build`
(keeper, relay and Caddy; `deploy/Dockerfile`; the key is mounted into the keeper only).

FR : `install.sh` prépare tout sauf les clés et réglages, que vous copiez vous-même avec `scp`
(réglages `0600 root`, clé du keeper `0640`, groupe `ladle-keeper` : le relais de discussion ne peut
lire ni l'un ni l'autre). Le DNS de `chat.useladle.fun` doit pointer vers le VPS ; Caddy obtient le
certificat tout seul.

## 5. Vercel variables / Variables Vercel

Baked in at build time: change them, then redeploy. All are public (they ship to the browser).

| variable | mainnet (Production) | devnet (Preview) |
|---|---|---|
| `NEXT_PUBLIC_DATA_SOURCE` | `chain` | `chain` |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `mainnet-beta` | `devnet` |
| `NEXT_PUBLIC_RPC_URL` | browser key, restricted to the site's origin | `https://api.devnet.solana.com` or a devnet key |
| `NEXT_PUBLIC_RPC_WS_URL` | only if the provider's websocket is not the RPC URL with `wss://` | |
| `NEXT_PUBLIC_LADLE_PROGRAM` | the program id | the same id |
| `NEXT_PUBLIC_LADLE_MARKET` | `config/deployments/mainnet-beta.json` `market` | `config/deployments/devnet.json` `market` |
| `NEXT_PUBLIC_LADLE_CHAT_URL` | `wss://chat.useladle.fun` | the same relay, or a second one |
| `NEXT_PUBLIC_LADLE_REPO` | the public repository URL (the "verify the law" links); a mainnet build refuses the placeholder | optional |

A chain build stops without `NEXT_PUBLIC_SOLANA_CLUSTER`, and the page itself refuses to read or
send through an RPC whose genesis hash is not that cluster's (a mainnet key under a devnet build,
or the reverse).

`scripts/mainnet-up.ps1` writes them to `%USERPROFILE%\.config\ladle\vercel-production.env`
(Vercel > Settings > Environment Variables > paste a `.env`). Never put the server key there.

## 6. Monitoring / Surveillance

* Uptime checks on `/health` and `/keeper/health` (section 1): the keeper's answers 503 with its
  reasons when no tick succeeded for 2 minutes (RPC down, out of credits), its balance is under
  `KEEPER_ALERT_BELOW_SOL` (0.2 SOL), the settlement queue is stuck (`settlement_stalled`: the
  round at the cursor could move but has not for `KEEPER_SETTLE_STALL_MIN`, 10 min), 8 rounds wait
  to settle so none opens (`rounds_paused`), or an action failed 5 times in a row
  (`action_failing`).
* Webhook alerts (`KEEPER_ALERT_WEBHOOK`): those, plus low balance and ticks failing for 5 minutes;
  repeated every 3 hours while they last, and a message when they clear. No log line or alert
  carries the RPC URL whole (its key): errors are cut to the host.
* A round that does not settle holds every later one (they settle in order): `docs/DEPLOY.md`,
  "A round that does not settle", says what to do.
* Logs: `journalctl -u ladle-keeper --since "1 hour ago" | grep '"level":"warn\|error"'`.
* If the keeper stops, players keep selling back, but the round in progress stays open
  past its close until something seals it: sealing, switching a round with no randomness to refunds
  after the VRF timeout (900 slots) and refunding are permissionless, yet the site only offers the
  last two ("Take my SOL back", once the timeout passed). Restart the keeper rather than leave it
  stopped; to shut down, drain it (section 8).
* If ORAO stops answering (or refuses requests), the keeper retries `request_vrf` with a new salt
  each time, alerts after 5 failures in a row (`vrf_request_failing`), and once the VRF timeout
  passes sends `refund_window`: every stake comes back in full. It refunds wallets that have a SOL
  token account itself; the others take their stake back from the site (their round shows
  "Take my SOL back"), paying only the fees.
* `KEEPER_VRF_PER_DAY` (optional): past that many ORAO requests in 24 h, no new round opens until
  the count falls back (alert `vrf_budget`); sealing, finalizing and refunds go on.

FR : deux sondes de disponibilité, un webhook pour les alertes. Si le keeper s'arrête, le tour en
cours reste ouvert après sa fin jusqu'à ce que quelqu'un le scelle : relancez-le, ou videz-le
proprement (section 8). Si ORAO ne répond plus, le tour est remboursé en entier après le délai ; les
joueurs sans compte SOL enveloppé reprennent leur mise depuis le site.

## 7. Costs per month / Coûts par mois

Prices seen in 2025-2026, check them before paying. / Prix relevés en 2025-2026, à vérifier.

| item | per month | note |
|---|---|---|
| VPS Hetzner CX22/CX23 class | ~€4-6 | with the IPv4 and VAT; keeper ~150 MB, relay ~100 MB |
| RPC, Helius Developer | ~$49 (~€45) | keeper ~2-3M requests/month; the rest is the site's visitors |
| Vercel Pro | $20 per member (~€19) | Hobby forbids commercial use |
| uptime monitor | €0 | Free plans of UptimeRobot / Better Stack |
| **fixed total** | **~€70** | |

On chain, paid by the keeper (2-minute rounds: ~21,600 rounds per 30 days):

| rounds | SOL per round | SOL per 30 days |
|---|---|---|
| all empty or one entry | ~0.000005 (one transaction) + priority fee | **~0.11** |
| with 2+ entries | + ~0.00186 (ORAO fee + request rent) | e.g. 10 % of rounds: ~4.1 |
| unwrap, alerts | one transaction an hour at most | < 0.004 |
| refunded rounds | fees only (it never creates a player's token account) | - |

The keeper's bounty (0.1 % of each round's total, paid to whoever paid ORAO for that round) covers
a round with 2+ entries once that round totals more than ~1.86 SOL; the whole 1 % platform fee
covers it from 0.186 SOL, and the 0.1 SOL minimum stake makes every such round at least 0.2 SOL.
The round rent (~0.0047 SOL) comes back by `close_window` after each round. Priority fee at the
default floor: ~120 lamports per transaction; at the cap 12,000; never more than
`KEEPER_MAX_FEE_SOL` (0.0005 SOL) per transaction, whatever the price settings.

**The RPC bill grows with visitors, not with the keeper.** The site now reads through websocket
subscriptions with one batched fallback read every 20 s (`app/lib/data/chain.ts`, measured against
a simulated market: ~4.5 calls a minute per open page instead of ~130, none once the tab has been
hidden 10 s, ~28 when the provider refuses websockets), plus ~28 websocket notifications a minute
per open page. One visitor watching for a day is then ~6,500 calls: what a 10M-credit plan leaves
after the keeper's ~2-3M covers ~1,100 visitor-days a month, if the provider does not bill the websocket
notifications as credits (check its pricing page). FR : avec le site actuel, ~4,5 appels par minute
et par page ouverte ; l'offre à ~49 $ suffit pour un début, à surveiller dans le tableau de bord du
fournisseur.

## 8. Stop the game and recover the SOL / Arrêter le jeu et récupérer les SOL

### Arrêter le jeu (le loyer du programme revient)

```
powershell -ExecutionPolicy Bypass -File scripts/mainnet-shutdown.ps1 -Owner <votre portefeuille> -RpcUrl <URL de la clé serveur> [-Authority usb://ledger]
```

C'est **vous** qui le lancez (il arrête un jeu à argent réel et dépense de vrais SOL). Relancez-le
quand vous voulez : à chaque fois il regarde où en est l'arrêt et fait l'étape suivante, après que
vous avez tapé son mot.

1. **STOP** : il construit la version d'arrêt (« wind-down ») avec votre trésorerie, la vérifie, et
   met le programme à jour vers elle par un tampon : le déployeur avance ~1,74 SOL pendant quelques
   minutes (rendus aussitôt), ~0,0032 SOL d'écritures ; avec un Ledger, **une seule** confirmation.
   Dès lors : plus de nouveau tour, plus d'entrée. Les tours en cours se terminent normalement
   (tirage, ou remboursement si le tirage n'arrive pas).
2. **NOTICE** : il démarre le **préavis de 7 jours** de chaque marché (une transaction chacun,
   payée par la clé du keeper). Le site affiche sur chaque page la date de fin. Pendant ces 7 jours,
   chacun revend et reprend ses mises comme d'habitude. Mettez `KEEPER_SHUTDOWN=1` dans
   `/etc/ladle/keeper.env` et redémarrez le keeper (il trouve lui-même tous les marchés du
   programme, `LADLE_MARKET` peut rester tel quel).
3. **Après les 7 jours**, le keeper paie **tout seul** chaque entrée restante à son propriétaire :
   la part non revendue est revendue au prix de la courbe à ce moment-là, la mise d'un tour non tiré
   est rendue en entier, et c'est versé **en SOL directement sur son portefeuille**, avec le loyer
   de l'entrée. Le joueur n'a rien à faire, aucun compte à ouvrir, et il ne peut pas bloquer ce
   paiement : tous les marchés sont en SOL, le paiement ne passe par aucun compte de jeton du
   joueur. Puis il ferme chaque tour (loyer au keeper) et chaque marché (loyers au créateur, ici le
   déployeur). Si quelqu'un d'autre ferme un marché avant lui (c'est permis à tous), les entrées
   vides restées ouvertes (il n'y reste que leur loyer) sont fermées aussi, loyer à leur
   propriétaire. Puis il s'arrête (`drained`). Si le keeper du VPS ne le fait pas, le script le
   fait depuis ce PC (`DRAIN`).
4. **CLOSE** : quand plus aucune entrée ni aucun tour n'existe, le script ferme le programme
   (`solana program close`) : **1,96787516 SOL** arrivent sur votre portefeuille. C'est définitif :
   l'adresse du programme ne pourra plus jamais servir.

Ce qui est perdu pour de bon : ~0,022 SOL en tout (voir le bilan plus haut). Ce qui ne bloque plus
rien : ce que les joueurs oublient. La version d'arrêt ne peut payer une entrée qu'à son
propriétaire, et seulement après les 7 jours ; un arrêt annulé (retour à la version normale, un tour
s'ouvre) efface le préavis, et un nouvel arrêt repart pour 7 jours entiers.

Cas particuliers, affichés par les scripts : un marché créé par quelqu'un d'autre est payé et fermé
de la même façon (ses joueurs aussi sont payés) ; un marché qui ne peut pas se fermer (créé avant la
v25, ou du LADLE resté dans un portefeuille, impossible sur mainnet puisque le LADLE ne sort jamais du
jeu) n'empêche pas la fermeture du programme, mais ses loyers restent avec lui. Avant tout lancement
(aucun marché encore), la fermeture est possible tout de suite.

### Recover / Récupérer

```
powershell -ExecutionPolicy Bypass -File scripts/mainnet-recover.ps1 -Owner <your wallet> -RpcUrl <server key URL>
```

It sends nothing: it reads the chain (`keeper/src/ops/report.ts`) and prints, with amounts, the
commands to run yourself:

0. to stop the game for good: `scripts/mainnet-shutdown.ps1` (above). To only pause it: add
   `KEEPER_DRAIN=1` to `/etc/ladle/keeper.env` and `sudo systemctl restart ladle-keeper`: no new
   round, the open one sealed at its close, every round finished, refunded and closed, then the
   keeper exits (`drained`). Stopping the keeper without either leaves the round in progress open
   until someone seals it;
1. the keeper, after the shutdown (or the pause): `spl-token unwrap` its wrapped bounty, then
   `solana transfer <wallet> ALL` from its key (to `-Owner`: the script makes you retype its last
   8 characters from your wallet, and the transfer keeps the CLI's refusal to send to an account
   that does not exist);
2. `solana transfer <wallet> ALL` from the deployer (keep ~0.01 SOL until the program is closed:
   it pays the close; the shutdown's upgrade asks for its ~1.74 SOL buffer when it needs it);
3. leftover deploy buffers: `solana program close --buffers`;
4. the treasury's platform fees: `spl-token unwrap` with the treasury key (they go to the treasury
   wallet, shown apart from the `-Owner` total);
5. the program rent (1.96787516 SOL): printed as `solana program close <program> --bypass-warning`
   once the shutdown left no entry and no round in any market (report.ts `programClosable`, which
   also needs the wind-down build live), or at once when the program has no market at all (a
   launch abandoned before its market: `--deployment` is optional). With `-UpgradeAuthority` used
   at launch, add `-Authority usb://ledger`.

Not recoverable: transaction and priority fees, ORAO's fee and request rent, the token mint and its
Metaplex metadata (~0.0052 SOL: neither can be closed), Metaplex's 0.01 SOL metadata fee.

FR : `mainnet-recover.ps1` n'envoie rien ; il affiche les commandes et les montants. Le loyer du
programme revient quand vous arrêtez le jeu avec `mainnet-shutdown.ps1` : préavis de 7 jours, puis
les joueurs sont payés automatiquement, puis le programme se ferme.
