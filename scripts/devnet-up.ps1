# One-shot devnet bring-up for Ladle: the same build and the same market
# settings as scripts/mainnet-up.ps1, on test SOL (docs/LAUNCH.md, step 1).
#
#   powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1 [-Treasury <mainnet treasury>]
#     [-WindowSlots 560] [-MaxEntrySol 5] [-SkipBuild] [-RpcUrl <devnet rpc>] [-AppRpcUrl <browser devnet rpc>]
#     [-AppEnvFile app\.env.devnet]
#
# Pass the mainnet -Treasury to test the exact binary mainnet will run (the
# treasury is compiled in; on devnet it only receives test SOL). Without it the
# build uses the devnet default treasury.
#
# Idempotent: each step is skipped when it is already done (program deployed
# with these bytes, market recorded in config/deployments/devnet.json, keeper
# funded). A changed build is upgraded in place (the deployer is the upgrade
# authority). The deployer needs ~2.6 SOL for a first deploy: the program data
# and program account rents (the deploy buffer is paid first and the deploy
# turns it into the program data rent: it is not paid twice), the write
# transactions, the market, the fee accounts and the keeper float. The script
# prints the exact amount and waits for it. Fund it yourself (a transfer;
# faucet.solana.com asks automated tools not to use it).
#
# -RpcUrl is what this script and the keeper use (devnet-keeper.env). The app
# files get -AppRpcUrl (default: the public devnet endpoint): whatever goes
# into NEXT_PUBLIC_RPC_URL is readable by every visitor, so a paid key passed
# as -RpcUrl never lands there.
#
# Writes app\.env.local (the previous one is kept once as .env.local.before-devnet),
# %USERPROFILE%\.config\ladle\vercel-preview.env and devnet-keeper.env.
param(
  [string]$Treasury = "",
  [string]$RpcUrl = "https://api.devnet.solana.com",
  # what the browser reads through (NEXT_PUBLIC_RPC_URL): public, or a key restricted to your site
  [string]$AppRpcUrl = "https://api.devnet.solana.com",
  [int]$WindowSlots = 560,
  [int]$VrfTimeoutSlots = 900,
  [string]$MaxEntrySol = "5",
  [int]$MaxEntryBps = 2000,
  [string]$EntryFloorSol = "0.5",
  [string]$TokenUri = "https://useladle.fun/token.json",
  [string]$KeeperFloatSol = "0.5",
  [int]$CuPrice = 1000,
  [string]$ChatHost = "chat.useladle.fun",
  # where the app's chain settings go (default app\.env.local; another file keeps a running dev server in demo mode)
  [string]$AppEnvFile = "",
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ladle-common.ps1")
Use-SolanaCli
$root = $script:LadleRoot

$deployer = "$env:USERPROFILE\.config\solana\pulled-devnet-deployer.json"
$keeper = "$env:USERPROFILE\.config\solana\ladle-devnet-keeper.json"
$programKeypair = "$root\target\deploy\ladle-keypair.json"
$programSo = "$root\target\deploy\ladle.so"
$deployment = "$root\config\deployments\devnet.json"
if (-not $Treasury) { $Treasury = $script:LadleDevnetTreasury }
if (-not (Test-PublicKey $Treasury)) { throw "-Treasury is not a base58 public key: $Treasury" }

Assert-Cluster $RpcUrl "devnet"
if ($AppRpcUrl -ne "https://api.devnet.solana.com") { Assert-Cluster $AppRpcUrl "devnet" }
if ($AppRpcUrl -eq $RpcUrl -and $RpcUrl -ne "https://api.devnet.solana.com") {
  Write-Host "NOTE: -AppRpcUrl is the keeper's -RpcUrl: every visitor can read the app's RPC key. Pass a separate key restricted to your site." -ForegroundColor Yellow
}
if (-not (Test-Path $deployer)) { throw "deployer keypair missing: $deployer" }
if (-not (Test-Path $programKeypair)) { throw "program keypair missing: $programKeypair (restore it from your backup, see docs/LAUNCH.md)" }
$programId = Assert-ProgramId $programKeypair
Assert-DeploymentTreasury $deployment $Treasury
$deployerAddr = Get-Address $deployer

# 1. build: docs/DEPLOY.md "Build"
if (-not $SkipBuild) { Invoke-ProgramBuild $Treasury }
Assert-BuildEmbeds $programSo $programId $Treasury
Assert-SbpfAccepted $programSo $RpcUrl
$soLen = (Get-Item $programSo).Length

# 2. what is still needed, then wait for it. A first deploy holds at most the
# program data + program account rents + the writes (Get-DeployCostLamports:
# its buffer becomes the program data rent); an upgrade holds a new buffer
# until the upgrade refunds it.
$match = Test-ProgramMatchesSo $programId $programSo $RpcUrl
$deployed = $null -ne $match
$deploy = Get-DeployCostLamports $soLen $CuPrice $RpcUrl
$spent = [int64]0   # what the deploy keeps
$peak = [int64]0    # what it holds during the deploy
if (-not $deployed) {
  $spent = $deploy.Peak
  $peak = $deploy.Peak
} elseif (-not $match) {
  # an upgrade writes a new buffer (refunded to the deployer) and extends the program data if the .so grew
  $spent = $deploy.Writes + [math]::Max(0, $deploy.Data - (Get-ProgramDataLamports $programId $RpcUrl))
  $peak = $spent + $deploy.Buffer
  Write-Host "NOTE: upgrading the devnet program. A market made by an older build keeps its rounds in the old layout: if create-market says so below, move config\deployments\devnet.json aside and rerun to create a new market." -ForegroundColor Yellow
}
$later = [int64]0
if (-not (Test-Path $deployment)) {
  # the market (0.05 SOL fee, rents, Metaplex's fee) + two fee token accounts
  $later += (Get-MarketCostLamports $RpcUrl) + 2 * (Get-RentLamports 165 $RpcUrl)
}
$floatLamports = ConvertTo-Lamports $KeeperFloatSol
New-LadleKeypair $keeper
$keeperAddr = Get-Address $keeper
if ((Get-Lamports $keeperAddr $RpcUrl) -lt $floatLamports / 2) { $later += $floatLamports }
$need = [int64][math]::Max($peak, $spent + $later)
if ($need -gt 0) {
  Write-Host "deployer $deployerAddr needs $(Format-Sol ($need + 10000000)) SOL for the steps left, 0.01 of margin included (program $programId)"
  Wait-ForLamports $deployerAddr ($need + 10000000) $RpcUrl "devnet deployer" | Out-Null
} else { Write-Host "deployer ${deployerAddr}: nothing left to pay for (program $programId)" }

# 3. program: deploy, or upgrade when the bytes changed. The buffer keypair is a FILE (third review): a deploy or
# upgrade that stops halfway resumes into the same buffer on the next run, instead of asking for a second ~2 SOL
# buffer the deployer may not have (no faucet); its SOL can also be taken back (printed on failure).
# The writes go over TPU, not --use-rpc: the public devnet RPC rate-limits RPC writes until the CLI gives up
# ("Max retries exceeded", seen on both 2026-10-28 deploys), while the TPU path went through every time.
$buffer = Join-Path $script:LadleKeyDir "ladle-devnet-buffer.json"
New-LadleKeypair $buffer
$bufferAddr = Get-Address $buffer
$bufferHelp = "the buffer $bufferAddr keeps its SOL: rerun this script to resume into it, or take it back: solana program close --buffers --keypair $deployer --authority $deployer --recipient $deployerAddr -u devnet"
if (-not $deployed) {
  $code = Invoke-Scrubbed { solana program deploy $programSo --program-id $programKeypair --buffer $buffer --keypair $deployer --upgrade-authority $deployer `
    --max-len $soLen --with-compute-unit-price $CuPrice --max-sign-attempts 100 --url $RpcUrl } $RpcUrl
  if ($code -ne 0) { throw "deploy failed: $bufferHelp" }
} elseif (-not $match) {
  Write-Host "program $programId differs from ${programSo}: upgrading"
  $code = Invoke-Scrubbed { solana program deploy $programSo --program-id $programKeypair --buffer $buffer --keypair $deployer --upgrade-authority $deployer `
    --with-compute-unit-price $CuPrice --max-sign-attempts 100 --url $RpcUrl } $RpcUrl
  if ($code -ne 0) { throw "upgrade failed: $bufferHelp" }
} else {
  Write-Host "program $programId already deployed with these bytes"
}
if (-not (Test-ProgramMatchesSo $programId $programSo $RpcUrl)) { throw "the deployed program does not match $programSo" }

# 4. keeper float: its own keypair, never id.json
if ((Get-Lamports $keeperAddr $RpcUrl) -lt $floatLamports / 2) {
  $code = Invoke-Scrubbed { solana transfer $keeperAddr $KeeperFloatSol --allow-unfunded-recipient --keypair $deployer --url $RpcUrl } $RpcUrl
  if ($code -ne 0) { throw "keeper funding failed" }
}

# 5. market (native SOL quote) and fee accounts, recorded in config/deployments/devnet.json
$code = Invoke-KeeperTool "ops\create-market.ts" @(
  "--cluster", "devnet", "--rpc", $RpcUrl, "--keypair", $deployer, "--treasury", $Treasury, "--keeper", $keeperAddr,
  "--window-slots", "$WindowSlots", "--vrf-timeout-slots", "$VrfTimeoutSlots", "--max-entry-sol", $MaxEntrySol,
  "--max-entry-bps", "$MaxEntryBps", "--entry-floor-sol", $EntryFloorSol, "--uri", $TokenUri, "--cu-price", "$CuPrice")
if ($code -ne 0) { throw "create-market failed" }
$marketRecord = Get-Content $deployment -Raw | ConvertFrom-Json
$market = $marketRecord.market

# 6. app and keeper settings (the variables app/.env.example documents)
$appVars = @(
  "NEXT_PUBLIC_DATA_SOURCE=chain",
  "NEXT_PUBLIC_SOLANA_CLUSTER=devnet",
  "NEXT_PUBLIC_RPC_URL=$AppRpcUrl",
  "NEXT_PUBLIC_RPC_WS_URL=",
  "NEXT_PUBLIC_LADLE_PROGRAM=$programId",
  "NEXT_PUBLIC_LADLE_MARKET=$market",
  # the market's round length and refund delay, which the security page states (else it states the demo's ~20 s rounds)
  "NEXT_PUBLIC_LADLE_WINDOW_SLOTS=$($marketRecord.params.windowSlots)",
  "NEXT_PUBLIC_LADLE_VRF_TIMEOUT_SLOTS=$($marketRecord.params.vrfTimeoutSlots)"
)
$envFile = if ($AppEnvFile) { $AppEnvFile } else { "$root\app\.env.local" }
# the first time, keep what was there (e.g. demo settings) next to it
$envBackup = "$envFile.before-devnet"
if ((Test-Path $envFile) -and -not (Test-Path $envBackup)) { Copy-Item $envFile $envBackup; Write-Host "kept the previous app\.env.local as $envBackup" }
# local dev: no chat relay unless you run one (pnpm chat) and add NEXT_PUBLIC_LADLE_CHAT_URL=ws://localhost:8787
Write-EnvFile $envFile $appVars
# Vercel Preview (docs/LAUNCH.md section 5): the same, with the VPS relay
$previewEnv = Join-Path $script:LadleKeyDir "vercel-preview.env"
Write-EnvFile $previewEnv ($appVars + @("NEXT_PUBLIC_LADLE_CHAT_URL=wss://$ChatHost"))
$keeperEnv = Join-Path $script:LadleKeyDir "devnet-keeper.env"
Write-EnvFile $keeperEnv @(
  "# Ladle keeper on devnet (deploy/systemd/ladle-keeper.service reads /etc/ladle/keeper.env)",
  "LADLE_CLUSTER=devnet",
  "RPC_URL=$RpcUrl",
  "LADLE_PROGRAM=$programId",
  "LADLE_MARKET=$market",
  "LADLE_TREASURY=$Treasury",
  "KEEPER_KEYPAIR=/etc/ladle/keeper.json",
  "KEEPER_HEALTH_PORT=8788",
  "KEEPER_ALERT_BELOW_SOL=0.2",
  "KEEPER_ALERT_WEBHOOK="
)

Write-Host ""
Write-Host "program   $programId"
Write-Host "market    $market  ($WindowSlots-slot rounds)"
Write-Host "treasury  $Treasury"
Write-Host "keeper    $keeperAddr  ($keeper)"
Write-Host "app env   $envFile  (local; Vercel Preview: $previewEnv)"
Write-Host "VPS env   $keeperEnv  (copy to /etc/ladle/keeper.env, the keeper keypair to /etc/ladle/keeper.json)"
Write-Host ""
Write-Host "run the keeper here:"
Write-Host "  pnpm keeper --deployment config/deployments/devnet.json --keypair $keeper --health-port 8788"
Write-Host "(the deployment file names the cluster, the market and the treasury; http://127.0.0.1:8788/health)"
