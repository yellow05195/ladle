# Ladle on mainnet-beta, for the OWNER to run (docs/LAUNCH.md, step 3).
# It spends real SOL: nobody else runs it, no tool or agent runs it for you.
#
#   powershell -ExecutionPolicy Bypass -File scripts/mainnet-up.ps1 `
#     -Treasury <your treasury public key> `
#     -RpcUrl "https://mainnet.helius-rpc.com/?api-key=<SERVER key>" `
#     -AppRpcUrl "https://mainnet.helius-rpc.com/?api-key=<BROWSER key, restricted to useladle.fun>"
#
# What it does, each step skipped when already done (rerun it after any stop):
#  1. keypairs in %USERPROFILE%\.config\ladle\ (created only if missing, and
#     silently: no recovery words on this console, which scrollback,
#     transcripts and terminal readers keep; copy the files to an offline
#     backup instead): ladle-mainnet-deployer.json (pays, holds the upgrade
#     authority until step 7), ladle-mainnet-keeper.json,
#     ladle-mainnet-buffer.json (resumable deploy), and a backup of
#     target\deploy\ladle-keypair.json (the program id);
#  2. builds with LADLE_TREASURY = -Treasury (docs/DEPLOY.md "Build") and
#     checks the .so: program id, treasury, SBPF version accepted on mainnet,
#     same bytes as the program tested on devnet (read through -DevnetRpcUrl);
#     the treasury is checked first: you retype its last 8 characters from
#     your wallet (it is compiled in for good, and base58 has no checksum),
#     and it must not be a program's account (a multisig's settings account
#     instead of its vault);
#  3. prints the exact SOL needed, asks, then waits until the deployer has it;
#  4. deploys (priority fee, --use-rpc, --max-len = .so size), verifies the
#     on-chain bytes and the upgrade authority; prints how to resume or
#     recover the buffer if the deploy stops halfway; then, with
#     -UpgradeAuthority (usb://ledger, or a keypair file kept offline), right
#     away, before anything else can fail: after a typed confirmation, moves
#     the upgrade authority off the hot deployer key to that signer (it must
#     sign: a typo cannot lock the program), and checks it with
#     `solana program show`. Without it you type HOTKEY at the start: the
#     deployer key file on this PC then stays able to replace the program and
#     take every vault. (The program cannot be born on the Ledger: the CLI
#     makes the upgrade authority sign every one of the ~400 write
#     transactions of a deploy. The handover right after it is the next best
#     thing. Later upgrades write their buffer with the deployer key and hand
#     it over: the Ledger then signs one transaction.)
#  5. shows the market settings (fixed forever) and the measured round length,
#     asks, creates the market and the fee accounts;
#  6. funds the keeper, writes vercel-production.env, keeper.env and chat.env
#     next to the keypairs, and lists what is refundable and how.
#
# Every command that talks to -RpcUrl prints its output through Hide-UrlIn:
# the CLI repeats the URL (an API key in it) when a request fails.
#
# -AppRpcUrl is checked to serve mainnet-beta when this PC may use it (a key
# restricted to the site's origin may refuse; the site checks it itself).
#
# The program stays upgradeable. Its rent comes back when you stop the game:
# scripts/mainnet-shutdown.ps1 deploys the wind-down build (no new round or
# entry), a 7-day notice runs, then the keeper pays every entry left out to
# its owner and closes every round and market, and the program closes (the
# rent to your wallet; -Authority when step 4 moved the authority). What
# players forget does not keep it locked. Until the handover, the deployer
# key file on this PC can replace the program: SECURITY.md section 7.
param(
  [string]$Treasury = "",
  # or a treasury keypair FILE on this PC (our own, in .config\ladle): its address is read from the file, so no retyping
  [string]$TreasuryKeypair = "",
  [Parameter(Mandatory = $true)][string]$RpcUrl,
  [string]$AppRpcUrl = "",
  [string]$AppRpcWsUrl = "",
  [int]$WindowSlots = 560,
  [int]$VrfTimeoutSlots = 900,
  [string]$MaxEntrySol = "5",
  [int]$MaxEntryBps = 2000,
  [string]$EntryFloorSol = "0.5",
  [string]$TokenName = "Ladle",
  [string]$TokenSymbol = "LADLE",
  [string]$TokenUri = "https://useladle.fun/token.json",
  [int]$CuPrice = 20000,
  [string]$KeeperFloatSol = "0.5",
  [string]$SiteOrigin = "https://useladle.fun",
  [string]$ChatHost = "chat.useladle.fun",
  # the devnet program this build is compared with (the public endpoint rate-limits: pass your own devnet RPC if it refuses)
  [string]$DevnetRpcUrl = "https://api.devnet.solana.com",
  # optional: the upgrade authority's new home, a signer (usb://ledger, or a keypair file); empty = stays on the deployer
  [string]$UpgradeAuthority = "",
  [switch]$SkipBuild,
  # the owner said yes once, in the desktop launcher (Lancer Ladle mainnet.cmd), to every step below: no word is asked,
  # each step is still printed, and the keys are copied to %USERPROFILE%\Ladle-sauvegarde-cles instead of BACKEDUP
  [switch]$Yes
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ladle-common.ps1")
Use-SolanaCli
$root = $script:LadleRoot
$keys = $script:LadleKeyDir

$deployer = Join-Path $keys "ladle-mainnet-deployer.json"
$keeper = Join-Path $keys "ladle-mainnet-keeper.json"
$buffer = Join-Path $keys "ladle-mainnet-buffer.json"
$programBackup = Join-Path $keys "ladle-program-keypair.json"
$programKeypair = "$root\target\deploy\ladle-keypair.json"
$programSo = "$root\target\deploy\ladle.so"
$deployment = "$root\config\deployments\mainnet-beta.json"

function Confirm-Word([string]$Word, [string]$Question) {
  if ($Yes) { Write-Host "$Question -> $Word (confirmed in the launcher)"; return }
  # the word itself is the consent, not its case: "hotkey " is as deliberate as "HOTKEY"
  $answer = Read-Host "$Question Type $Word to continue"
  if ($answer.Trim() -ne $Word) { throw "stopped at '$Word' (typed '$($answer.Trim())'): nothing more was sent. Run it again and type $Word" }
}

Write-Host "Ladle mainnet-beta bring-up. This spends real SOL." -ForegroundColor Yellow

# 0. inputs
if ($TreasuryKeypair) {
  if ($Treasury) { throw "give -Treasury or -TreasuryKeypair, not both" }
  if (-not (Test-Path $TreasuryKeypair)) { throw "-TreasuryKeypair not found: $TreasuryKeypair" }
  $Treasury = (Invoke-Native { solana-keygen pubkey $TreasuryKeypair }).Out.Trim()
  Write-Host "treasury $Treasury (from ${TreasuryKeypair}: back this file up, it is the only key to the fees)"
}
if (-not $Treasury) { throw "give -Treasury <your wallet address> or -TreasuryKeypair <keypair file>" }
if (-not (Test-PublicKey $Treasury)) { throw "-Treasury is not a base58 public key: $Treasury" }
if ($Treasury -eq $script:LadleDevnetTreasury) { throw "-Treasury is the devnet placeholder key: give your own mainnet treasury (a hardware wallet or a multisig vault)" }
Assert-Cluster $RpcUrl "mainnet-beta"
# the treasury is compiled into the program: a wrong character sends every fee to a key nobody holds
$treasuryInfo = Get-AccountInfo $Treasury $RpcUrl
if ($treasuryInfo -and $treasuryInfo.owner -ne "11111111111111111111111111111111") {
  throw ("-Treasury $Treasury is an account of the program $($treasuryInfo.owner), not a wallet: fees would sit in a token account it cannot sign for. " +
    "With a Squads multisig, give its VAULT address (the one that holds SOL), not the multisig account.")
}
if (-not $treasuryInfo) { Write-Host "NOTE: the treasury $Treasury has never held SOL on mainnet. Make sure it is your wallet's address." -ForegroundColor Yellow }
# a typed address is retyped from the wallet; one read from its own key file cannot hold a typo
if (-not $TreasuryKeypair) {
  $tail = $Treasury.Substring($Treasury.Length - 8)
  $typed = Read-Host "Open your treasury wallet and type the LAST 8 characters of its address as the wallet shows them (do not copy them from here)"
  if ($typed.Trim() -cne $tail) { throw "stopped: '$($typed.Trim())' is not the end of -Treasury ($Treasury). Check the address against your wallet; nothing was sent" }
}
# the public endpoint rate-limits RPC writes until the CLI gives up (seen on devnet): there the ~400 writes go over TPU
$writeVia = if ($RpcUrl -match "api\.mainnet-beta\.solana\.com") { @("--max-sign-attempts", "100") } else { @("--use-rpc") }
if (-not $AppRpcUrl) { Write-Host "NOTE: no -AppRpcUrl: vercel-production.env gets a placeholder; the browser needs its own key restricted to $SiteOrigin" -ForegroundColor Yellow }
elseif ($AppRpcUrl -eq $RpcUrl) { throw "-AppRpcUrl must not be the keeper's -RpcUrl: every visitor can read the browser's key; use a second key restricted to $SiteOrigin" }
else { Assert-ClusterIfReachable $AppRpcUrl "mainnet-beta" "-AppRpcUrl (the site's RPC)" }
if (-not $UpgradeAuthority) {
  Write-Host "No -UpgradeAuthority: the upgrade authority will stay on the deployer key FILE on this PC. Whoever or whatever reads that file" -ForegroundColor Yellow
  Write-Host "can replace the program and take every stake and the curve's SOL. Rerun with -UpgradeAuthority usb://ledger to move it to a" -ForegroundColor Yellow
  Write-Host "hardware wallet right after the deploy (recommended)." -ForegroundColor Yellow
  Confirm-Word "HOTKEY" "Keep the upgrade authority on the hot deployer key?"
}

# 1. keypairs (ours only, in .config\ladle)
Write-Host "`n1. keypairs in $keys"
$created = @()
foreach ($k in @(@($deployer, "deployer: pays the deploy, holds the upgrade authority until the handover"), @($keeper, "keeper: runs rounds on the VPS"))) {
  if (-not (Test-Path $k[0])) {
    Write-Host "creating $($k[0]) ($($k[1]))"
    New-LadleKeypair $k[0]
    $created += $k[0]
  }
}
if ($created.Count) {
  Write-Host "BACK UP these files now, offline (a USB key kept apart from this PC), before any SOL is sent to them:" -ForegroundColor Yellow
  foreach ($c in $created) { Write-Host "  $c" -ForegroundColor Yellow }
  Write-Host "(no recovery words were printed: this console can be read back; the file is the key)" -ForegroundColor Yellow
  if ($Yes) { Backup-LadleKeys | Out-Null } else { Confirm-Word "BACKEDUP" "Copied them?" }
}
New-LadleKeypair $buffer
if (Test-Path $programKeypair) {
  if (-not (Test-Path $programBackup)) { Copy-Item $programKeypair $programBackup; Write-Host "backed up the program keypair to $programBackup (keep a copy offline too)" }
  elseif ((Get-Address $programBackup) -ne (Get-Address $programKeypair)) { throw "$programKeypair is not the program key backed up in ${programBackup}: restore the backup (a cargo clean regenerates it)" }
} elseif (Test-Path $programBackup) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $programKeypair) | Out-Null
  Copy-Item $programBackup $programKeypair
  Write-Host "restored the program keypair from $programBackup"
} else { throw "program keypair missing: $programKeypair" }
$programId = Assert-ProgramId $programKeypair
Assert-DeploymentTreasury $deployment $Treasury
$deployerAddr = Get-Address $deployer
$keeperAddr = Get-Address $keeper
$bufferAddr = Get-Address $buffer
if ($Treasury -eq $deployerAddr -or $Treasury -eq $keeperAddr) { throw "-Treasury must be your own wallet, not the deployer or the keeper" }
Write-Host "program  $programId"
Write-Host "deployer $deployerAddr"
Write-Host "keeper   $keeperAddr"
Write-Host "treasury $Treasury"

# 2. build and checks
Write-Host "`n2. build"
if (-not $SkipBuild) { Invoke-ProgramBuild $Treasury }
Assert-BuildEmbeds $programSo $programId $Treasury
Assert-SbpfAccepted $programSo $RpcUrl
$soLen = (Get-Item $programSo).Length
$devnetFile = "$root\config\deployments\devnet.json"
$tested = $null
if (Test-Path $devnetFile) {
  try { $tested = Test-ProgramMatchesSo $programId $programSo $DevnetRpcUrl }
  catch { throw "could not compare this build with the devnet program: $($_.Exception.Message). Rerun, or pass -DevnetRpcUrl <your devnet RPC>" }
}
if ($tested -eq $true) { Write-Host "same bytes as the program deployed on devnet: this is the build you tested" -ForegroundColor Green }
else {
  Write-Host "WARNING: this .so is not the program deployed on devnet (run scripts/devnet-up.ps1 -Treasury $Treasury and test first)" -ForegroundColor Yellow
  Confirm-Word "UNTESTED" "Deploy a build that was not tested on devnet?"
}

# 3. cost
$match = Test-ProgramMatchesSo $programId $programSo $RpcUrl
$deployed = $null -ne $match
if ($deployed -and -not $match) {
  throw ("program $programId is already on mainnet with other bytes. An upgrade is a separate decision, made through a buffer so the`n" +
    "upgrade authority signs one transaction (a Ledger too): docs/DEPLOY.md, 'A round that does not settle', step 3")
}
$deploy = Get-DeployCostLamports $soLen $CuPrice $RpcUrl
$rentData = $deploy.Data
$rentProgram = $deploy.Program
$rentBuffer = $deploy.Buffer
$writes = $deploy.Writes
$rentAta = Get-RentLamports 165 $RpcUrl
$market = Get-MarketCostLamports $RpcUrl
$fees = 2 * $rentAta
$float = ConvertTo-Lamports $KeeperFloatSol
$margin = ConvertTo-Lamports "0.01"
$rows = @()
$bufferInfo = Get-AccountInfo $bufferAddr $RpcUrl
$bufferExists = $null -ne $bufferInfo
# The deploy is the peak (Get-DeployCostLamports): the buffer is paid first,
# then the deploy drains it and pays the program data with it, so the buffer
# is not paid on top of the program data. An interrupted deploy's buffer
# already holds its share; resuming needs the rest. Every later step is paid
# after that, so the deployer needs max(peak, all that is spent) + margin.
$peak = [int64]0
$spent = [int64]0
if (-not $deployed) {
  $rows += ,@("program data rent ($soLen B .so)", $rentData, "back when you stop the game: scripts/mainnet-shutdown.ps1 (7-day notice, players paid out automatically, then 'solana program close')")
  $rows += ,@("program account rent", $rentProgram, "same: with 'solana program close'")
  $rows += ,@("~$([math]::Ceiling($soLen / 1000) + 10) write transactions", $writes, "spent")
  $spent = $deploy.Peak
  $peak = $deploy.Peak
  if ($bufferExists) { $spent -= [int64]$bufferInfo.lamports; $peak -= [int64]$bufferInfo.lamports }
}
if (-not (Test-Path $deployment)) {
  $rows += ,@("market: 0.05 SOL fee to the treasury + rents + Metaplex fee", $market, "fee: to your treasury; rents: ~0.0076 back with close_market at the shutdown, ~0.0052 (mint, metadata) never; 0.01 to Metaplex")
  $rows += ,@("fee token accounts (treasury, keeper)", $fees, "back when their owner closes them")
  $spent += $market + $fees
}
if ((Get-Lamports $keeperAddr $RpcUrl) -lt $float / 2) { $rows += ,@("keeper float", $float, "back with 'solana transfer ALL' from the keeper"); $spent += $float }
Write-Host "`n3. SOL needed on the deployer $deployerAddr"
if ($rows.Count -eq 0) { Write-Host "  nothing left to pay for" }
else {
  $rows += ,@("margin (stays on the deployer)", $margin, "back with 'solana transfer ALL' from the deployer")
  foreach ($r in $rows) { Write-Host ("  {0,14} SOL  {1}  ({2})" -f (Format-Sol $r[1]), $r[0], $r[2]) }
  $need = [int64][math]::Max($peak, $spent) + $margin
  if ($peak -gt 0) {
    $note = if ($bufferExists) { "the interrupted deploy's buffer $bufferAddr already holds $(Format-Sol $bufferInfo.lamports) of it" } else { "during the deploy a buffer of $(Format-Sol $rentBuffer) holds the program's bytes; the deploy turns it into the program data rent (it is not paid twice)" }
    Write-Host ("  {0,14} SOL  NEEDED on the deployer ({1})" -f (Format-Sol $need), $note) -ForegroundColor Cyan
  }
  else { Write-Host ("  {0,14} SOL  NEEDED on the deployer" -f (Format-Sol $need)) -ForegroundColor Cyan }
  Write-Host ("  {0,14} SOL  stays spent or in use at the end; the deployer keeps the difference ('solana transfer ALL')" -f (Format-Sol $spent))
  $have = Get-Lamports $deployerAddr $RpcUrl
  Write-Host "  the deployer has $(Format-Sol $have) SOL"
  Confirm-Word "DEPLOY" "Send $(Format-Sol ([math]::Max(0, $need - $have))) SOL to $deployerAddr from your wallet, then continue."
  Wait-ForLamports $deployerAddr $need $RpcUrl "mainnet deployer" | Out-Null
}

# 4. deploy (resumable: the buffer keypair is a file)
Write-Host "`n4. program"
if (-not $deployed) {
  if ($bufferExists) { Write-Host "resuming the interrupted deploy into buffer $bufferAddr" }
  $code = Invoke-Scrubbed { solana program deploy $programSo --program-id $programKeypair --buffer $buffer --keypair $deployer `
    --upgrade-authority $deployer --max-len $soLen --with-compute-unit-price $CuPrice @writeVia --url $RpcUrl } $RpcUrl
  if ($code -ne 0) {
    Write-Host "the deploy stopped. Its buffer $bufferAddr holds ~$(Format-Sol $rentBuffer) SOL:" -ForegroundColor Yellow
    Write-Host "  resume: run this script again (same buffer, same command)"
    Write-Host "  or take the SOL back: solana program close $bufferAddr --keypair $deployer --authority $deployer --recipient $deployerAddr --url <rpc>"
    Write-Host "  (every buffer of the deployer: solana program show --buffers --buffer-authority $deployerAddr --url <rpc>)"
    throw "deploy failed"
  }
}
if (-not (Test-ProgramMatchesSo $programId $programSo $RpcUrl)) { throw "the program on mainnet does not match $programSo" }
$show = Hide-UrlIn (Invoke-Native { solana program show $programId --url $RpcUrl }).Out $RpcUrl
Write-Host $show
$newAuthority = if ($UpgradeAuthority) { Get-Address $UpgradeAuthority } else { "" }
$authorityNow = [regex]::Match($show, 'Authority: (\w+)').Groups[1].Value
if ($authorityNow -ne $deployerAddr -and -not ($newAuthority -and $authorityNow -eq $newAuthority)) { throw "the upgrade authority is $authorityNow, not the deployer $deployerAddr$(if ($newAuthority) { " nor $newAuthority" })" }
Write-Host "verified: the on-chain bytes are $programSo, upgradeable by $authorityNow" -ForegroundColor Green

# 4b. optional: the upgrade authority leaves the hot deployer key, right after the deploy (third review: a later step
# that fails, the market's URI check or the keeper funding, must not leave it on the hot key until a rerun)
if ($newAuthority -and $authorityNow -ne $newAuthority) {
  Write-Host "`n4b. upgrade authority"
  Write-Host "The upgrade authority can replace the program and take every vault. It moves from the deployer key file on this PC"
  Write-Host "($deployerAddr) to $newAuthority ($UpgradeAuthority). That signer must sign now (a mistyped key cannot be set), and"
  Write-Host "from then on every upgrade and 'solana program close' (the rent recovery) needs it: one signature each, since an upgrade's"
  Write-Host "buffer is written with the deployer key and handed over (scripts/mainnet-shutdown.ps1 does it; docs/DEPLOY.md prints the commands)."
  Confirm-Word "HANDOVER" "Move the upgrade authority to $newAuthority?"
  $code = Invoke-Scrubbed { solana program set-upgrade-authority $programId --upgrade-authority $deployer --new-upgrade-authority $UpgradeAuthority --keypair $deployer --with-compute-unit-price $CuPrice --url $RpcUrl } $RpcUrl
  if ($code -ne 0) { throw "set-upgrade-authority failed: the authority is still the deployer" }
  $show = Hide-UrlIn (Invoke-Native { solana program show $programId --url $RpcUrl }).Out $RpcUrl
  $authorityNow = [regex]::Match($show, 'Authority: (\w+)').Groups[1].Value
  if ($authorityNow -ne $newAuthority) { throw "the upgrade authority is $authorityNow, expected $newAuthority" }
  Write-Host "verified: upgradeable by $newAuthority only; the deployer key can no longer change the program" -ForegroundColor Green
}


# 5. market: settings fixed forever
Write-Host "`n5. market"
$marketArgs = @("--cluster", "mainnet-beta", "--rpc", $RpcUrl, "--keypair", $deployer, "--treasury", $Treasury, "--keeper", $keeperAddr,
  "--window-slots", "$WindowSlots", "--vrf-timeout-slots", "$VrfTimeoutSlots", "--max-entry-sol", $MaxEntrySol,
  "--max-entry-bps", "$MaxEntryBps", "--entry-floor-sol", $EntryFloorSol, "--name", $TokenName, "--symbol", $TokenSymbol,
  "--uri", $TokenUri, "--cu-price", "$CuPrice")
if (-not (Test-Path $deployment)) {
  if ((Invoke-KeeperTool "ops\create-market.ts" ($marketArgs + @("--plan"))) -ne 0) { throw "market plan failed (nothing sent)" }
  # the plan adopts a market an earlier run created (its confirmation lost) and writes the deployment file: nothing to create then
  if (-not (Test-Path $deployment)) { Confirm-Word "CREATE" "These market settings can never be changed." }
}
if ((Invoke-KeeperTool "ops\create-market.ts" ($marketArgs + @("--yes"))) -ne 0) { throw "create-market failed" }
$marketRecord = Get-Content $deployment -Raw | ConvertFrom-Json
$marketAddr = $marketRecord.market

# 6. keeper float and settings
Write-Host "`n6. keeper and settings"
if ((Get-Lamports $keeperAddr $RpcUrl) -lt $float / 2) {
  $code = Invoke-Scrubbed { solana transfer $keeperAddr $KeeperFloatSol --allow-unfunded-recipient --keypair $deployer --with-compute-unit-price $CuPrice --url $RpcUrl } $RpcUrl
  if ($code -ne 0) { throw "keeper funding failed" }
}
$chatOrigins = $SiteOrigin
try { $h = ([Uri]$SiteOrigin).Host; if ($h -notmatch '^www\.') { $chatOrigins = "$SiteOrigin,$(([Uri]$SiteOrigin).Scheme)://www.$h" } } catch { }
$files = @{
  "vercel-production.env" = @(
    "NEXT_PUBLIC_DATA_SOURCE=chain",
    "NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta",
    ("NEXT_PUBLIC_RPC_URL=" + $(if ($AppRpcUrl) { $AppRpcUrl } else { "REPLACE_WITH_A_BROWSER_KEY_RESTRICTED_TO_YOUR_DOMAIN" })),
    ("NEXT_PUBLIC_RPC_WS_URL=" + $AppRpcWsUrl),
    "NEXT_PUBLIC_LADLE_PROGRAM=$programId",
    "NEXT_PUBLIC_LADLE_MARKET=$marketAddr",
    "NEXT_PUBLIC_LADLE_CHAT_URL=wss://$ChatHost",
    # the round length and refund delay the pages state, from the market's record (a mainnet build requires both and compares them with it)
    "NEXT_PUBLIC_LADLE_WINDOW_SLOTS=$($marketRecord.params.windowSlots)",
    "NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS=$($marketRecord.params.vrfTimeoutSlots)",
    # the site's "verify the law" links; a mainnet build refuses this placeholder (app/next.config.ts launch gate)
    "NEXT_PUBLIC_LADLE_REPO=REPLACE_WITH_THE_PUBLIC_REPOSITORY_URL")
  "keeper.env" = @(
    "# /etc/ladle/keeper.env on the VPS (deploy/systemd/ladle-keeper.service); secret: it holds the RPC key",
    "LADLE_CLUSTER=mainnet-beta",
    "RPC_URL=$RpcUrl",
    "LADLE_PROGRAM=$programId",
    "LADLE_MARKET=$marketAddr",
    "LADLE_TREASURY=$Treasury",
    "KEEPER_KEYPAIR=/etc/ladle/keeper.json",
    "KEEPER_CU_PRICE=auto",
    "KEEPER_CU_PRICE_MAX=100000",
    "KEEPER_MAX_FEE_SOL=0.0005",
    "KEEPER_SETTLE_STALL_MIN=10",
    "KEEPER_HEALTH_PORT=8788",
    "KEEPER_ALERT_BELOW_SOL=0.2",
    "KEEPER_ALERT_WEBHOOK=")
  "chat.env" = @(
    "# /etc/ladle/chat.env on the VPS (deploy/systemd/ladle-chat.service); secret: CHAT_RESUME_SECRET",
    "CHAT_HOST=127.0.0.1",
    "CHAT_PORT=8787",
    "CHAT_PUBLIC_HOST=$ChatHost",
    "CHAT_ORIGINS=$chatOrigins",
    "CHAT_TRUST_PROXY=1",
    "CHAT_MUTE_FILE=/var/lib/ladle/mute.txt",
    "CHAT_RESUME_SECRET=$(New-RandomHex 32)")
}
foreach ($name in $files.Keys) {
  $path = Join-Path $keys $name
  # never overwrite: a webhook or a resume secret may have been filled in since
  if (Test-Path $path) { Write-Host "kept $path (delete it to regenerate)" } else { Write-EnvFile $path $files[$name]; Write-Host "wrote $path" }
}

Write-Host ""
Write-Host "program   $programId (upgradeable by $authorityNow)" -ForegroundColor Green
Write-Host "market    $marketAddr ($WindowSlots-slot rounds)" -ForegroundColor Green
Write-Host "keeper    $keeperAddr, $(Format-Sol (Get-Lamports $keeperAddr $RpcUrl)) SOL"
Write-Host "deployer  $deployerAddr, $(Format-Sol (Get-Lamports $deployerAddr $RpcUrl)) SOL left"
Write-Host ""
Write-Host "Next (docs/LAUNCH.md): commit config/deployments/mainnet-beta.json; copy keeper.env, chat.env and"
Write-Host "ladle-mainnet-keeper.json to the VPS (/etc/ladle/); paste vercel-production.env into Vercel (Production) and redeploy."
Write-Host ""
Write-Host "What comes back, and how (exact commands: scripts/mainnet-recover.ps1 -Owner <your wallet>):"
Write-Host "  deploy buffer      back automatically at the end of the deploy (if it stopped: rerun, or 'solana program close <buffer>')"
Write-Host "  program rent       $(Format-Sol ($rentData + $rentProgram)) SOL when you stop the game: scripts/mainnet-shutdown.ps1 (wind-down build, 7-day notice,"
Write-Host "                     every entry left paid out to its owner automatically, rounds and market closed, then 'solana program close',"
Write-Host "                     signed by $authorityNow). What players forget does not keep it locked."
Write-Host "  keeper float       drain the keeper, then 'solana transfer <wallet> ALL' from ladle-mainnet-keeper.json; its wrapped bounty: 'spl-token unwrap'"
Write-Host "  round rent         ~0.0047 SOL per round, back to the keeper by close_window within minutes of each round (the last one during the drain)"
Write-Host "  deployer leftover  'solana transfer <wallet> ALL' from ladle-mainnet-deployer.json"
Write-Host "  market fee         0.05 SOL went to your treasury; the market's rents: ~0.0076 SOL back by close_market at the shutdown, ~0.0052 never (mint, metadata); Metaplex kept 0.01 SOL"
Write-Host "  platform fees      wrapped SOL in the treasury's token account: 'spl-token unwrap' with the treasury key"
Write-Host "  not coming back    transaction fees, priority fees, ORAO's 0.0005 SOL fee + ~0.00135 SOL rent per round with 2+ entries"
