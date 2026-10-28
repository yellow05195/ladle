# One-shot devnet bring-up for Ladle (see docs/DEPLOY.md for the manual steps).
#
#   powershell -ExecutionPolicy Bypass -File scripts/devnet-up.ps1
#
# Idempotent: each step is skipped when it is already done (program deployed,
# market recorded in config/deployments/devnet.json, keeper keypair funded).
# Needs ~4.7 SOL on the deployer: 2.02 SOL program rent (398 KB .so) + 2.02 SOL
# temporary buffer (returned after the deploy) + ~0.06 SOL market + 0.5 SOL
# keeper float. The deploy check below computes the exact amount from the .so
# size with `solana rent` (docs/DEPLOY.md, "What deploying costs").
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:PATH = "$env:USERPROFILE\.local\share\solana\solana-release\bin;$env:PATH"
$url = "devnet"
$deployer = "$env:USERPROFILE\.config\solana\pulled-devnet-deployer.json"
$keeper = "$env:USERPROFILE\.config\solana\ladle-devnet-keeper.json"
$programKeypair = "$root\target\deploy\ladle-keypair.json"
$programSo = "$root\target\deploy\ladle.so"
$deployment = "$root\config\deployments\devnet.json"

$programId = (solana address -k $programKeypair).Trim()
$deployerAddr = (solana address -k $deployer).Trim()
$balance = [double]((solana balance $deployerAddr --url $url) -replace '[^0-9.]', '')
Write-Host "deployer $deployerAddr : $balance SOL"

# 1. program
$shown = solana program show $programId --url $url 2>&1 | Out-String
if ($shown -match 'ProgramData Address') {
  Write-Host "program $programId already deployed"
} else {
  # program data (.so + 45-byte header) and the buffer (.so + 37) are both funded
  # during the deploy; the buffer is refunded at the end. + market + keeper float.
  $soLen = (Get-Item $programSo).Length
  $rentData = [double][regex]::Match((solana rent ($soLen + 45) --url $url --lamports | Out-String), '(\d+) lamports').Groups[1].Value / 1e9
  $rentBuffer = [double][regex]::Match((solana rent ($soLen + 37) --url $url --lamports | Out-String), '(\d+) lamports').Groups[1].Value / 1e9
  $need = [math]::Round($rentData + $rentBuffer + 0.01 + 0.06 + 0.5, 2)
  if ($balance -lt $need) { throw "deployer needs at least $need SOL to deploy, create the market and fund the keeper (has $balance). Fund it at https://faucet.solana.com" }
  solana program deploy $programSo --program-id $programKeypair --keypair $deployer --url $url
  if ($LASTEXITCODE -ne 0) { throw "deploy failed" }
}

# 2. market (native SOL quote), recorded in config/deployments/devnet.json
Push-Location "$root\tests"
try {
  node --experimental-strip-types devnet/create-market.ts --cluster devnet --keypair $deployer
  if ($LASTEXITCODE -ne 0) { throw "create-market failed" }
} finally { Pop-Location }
$market = (Get-Content $deployment -Raw | ConvertFrom-Json).market

# 3. keeper: its own keypair, never id.json
if (-not (Test-Path $keeper)) { solana-keygen new --no-bip39-passphrase --silent --outfile $keeper | Out-Null }
$keeperAddr = (solana address -k $keeper).Trim()
$keeperBal = [double]((solana balance $keeperAddr --url $url) -replace '[^0-9.]', '')
if ($keeperBal -lt 0.2) {
  solana transfer $keeperAddr 0.5 --allow-unfunded-recipient --keypair $deployer --url $url
  if ($LASTEXITCODE -ne 0) { throw "keeper funding failed" }
}

# 4. app config
$envFile = "$root\app\.env.local"
# no BOM: Next's dotenv parser would read it into the first key's name
[IO.File]::WriteAllLines($envFile, [string[]]@(
  "NEXT_PUBLIC_DATA_SOURCE=chain",
  "NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com",
  "NEXT_PUBLIC_LADLE_PROGRAM=$programId",
  "NEXT_PUBLIC_LADLE_MARKET=$market"
), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "program  $programId"
Write-Host "market   $market"
Write-Host "keeper   $keeperAddr"
Write-Host "app env  $envFile"
Write-Host ""
Write-Host "start the keeper:"
Write-Host "  pnpm keeper --deployment config/deployments/devnet.json --keypair $keeper"
