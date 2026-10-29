# Where Ladle's operator SOL sits, and the exact commands that bring it back to
# your wallet. For the OWNER. Read-only: this script sends nothing, it prints
# commands for you to read and run yourself (docs/LAUNCH.md, "Recover").
#
#   powershell -ExecutionPolicy Bypass -File scripts/mainnet-recover.ps1 -Owner <your wallet> -RpcUrl <rpc>
#   (-Cluster devnet to rehearse on the devnet deployment; -Authority usb://ledger when the
#   upgrade authority was handed to a hardware wallet by mainnet-up.ps1 -UpgradeAuthority)
#
# The upgrade to the wind-down build is scripts/mainnet-shutdown.ps1's (a
# buffer upgrade: the deployer key writes the buffer, the upgrade authority
# signs one transaction, so a Ledger confirms once, not ~370 times). For an
# emergency fix, docs/DEPLOY.md "A round that does not settle" prints the
# same buffer flow (ladle-common.ps1 Get-UpgradeCommands).
#
# -Owner receives everything printed here, and base58 has no checksum: you
# retype its last 8 characters from your wallet, and the cluster must know it
# as a wallet (it held SOL before). The printed transfers keep the Solana CLI's
# own refusal to send to an account that does not exist.
#
# The program's rent (~2 SOL) comes back when you stop the game:
# scripts/mainnet-shutdown.ps1 deploys the wind-down build, starts a 7-day
# notice, and after it the keeper pays every entry out to its owner and
# closes every round and market. This script prints the close only once no
# entry and no round of any market is left (report.ts programClosable), or
# right away when the program has no market at all (a launch abandoned before
# its market: nothing of anyone's can be in it). Read-only: it never runs the
# shutdown itself.
param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [Parameter(Mandatory = $true)][string]$RpcUrl,
  [ValidateSet("mainnet-beta", "devnet")][string]$Cluster = "mainnet-beta",
  [string]$Authority = ""
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ladle-common.ps1")
Use-SolanaCli
$root = $script:LadleRoot

if (-not (Test-PublicKey $Owner)) { throw "-Owner is not a base58 public key: $Owner" }
Assert-Cluster $RpcUrl $Cluster
Confirm-WalletAddress $Owner $RpcUrl "-Owner (your wallet)"
if ($Cluster -eq "mainnet-beta") {
  $deployer = Join-Path $script:LadleKeyDir "ladle-mainnet-deployer.json"
  $keeper = Join-Path $script:LadleKeyDir "ladle-mainnet-keeper.json"
} else {
  $deployer = "$env:USERPROFILE\.config\solana\pulled-devnet-deployer.json"
  $keeper = "$env:USERPROFILE\.config\solana\ladle-devnet-keeper.json"
}
$deployment = "$root\config\deployments\$Cluster.json"
foreach ($f in @($deployer, $keeper)) { if (-not (Test-Path $f)) { throw "missing $f" } }
# no deployment file: a launch abandoned before its market was created (the program id is target\deploy's)
$hasDeployment = Test-Path $deployment
$deployerAddr = Get-Address $deployer
$keeperAddr = Get-Address $keeper
if ($Owner -eq $deployerAddr -or $Owner -eq $keeperAddr) { throw "-Owner must be your own wallet, not the deployer or the keeper" }
# commands below use the public endpoint: a handful of transactions, and no API key in your shell history
$u = $Cluster

# the program-specific part (every market, round and entry of the program, vaults, wrapped SOL) comes from
# the keeper package, read-only; --owner is only the fee payer of a simulation (nothing is sent)
Push-Location $root
try {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $reportArgs = @("--cluster", $Cluster, "--rpc", $RpcUrl, "--deployer", $deployerAddr, "--keeper", $keeperAddr, "--owner", $Owner)
  if ($hasDeployment) { $reportArgs += @("--deployment", $deployment) }
  elseif ($env:LADLE_TREASURY) { $reportArgs += @("--treasury", $env:LADLE_TREASURY) }
  else { $reportArgs += @("--treasury", $script:LadleDevnetTreasury) }
  $json = & node --experimental-strip-types --no-warnings keeper\src\ops\report.ts @reportArgs
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
} finally { Pop-Location }
if ($code -ne 0) { throw "report failed" }
$r = ($json -join "`n") | ConvertFrom-Json

$total = [int64]0
function Show([string]$What, [int64]$Lamports, [string[]]$Commands, [string]$Note = "") {
  Write-Host ""
  Write-Host ("{0,14} SOL  {1}" -f (Format-Sol $Lamports), $What) -ForegroundColor Cyan
  if ($Note) { Write-Host "                 $Note" }
  foreach ($c in $Commands) { Write-Host "    $c" }
}

Write-Host "Ladle on ${Cluster}: what can come back to $Owner"

# 0. stopping: a paused game (drain) or a game stopped for good (shutdown)
Write-Host ""
Write-Host "To stop the game for good and get the program rent back: scripts/mainnet-shutdown.ps1 -Owner $Owner -RpcUrl <rpc>." -ForegroundColor Yellow
Write-Host "It deploys the wind-down build (no new round or entry), starts a 7-day notice, and after it the keeper pays every" -ForegroundColor Yellow
Write-Host "entry left out to its owner's wallet, closes every round and market; then the program closes. Rerun this script after." -ForegroundColor Yellow
Write-Host "To only pause (no new round; everything finished, refunded and closed; the keeper exits 'drained'): KEEPER_DRAIN=1 on the VPS."
Write-Host "Stopping the keeper without either leaves the round in progress waiting for someone to seal it."

# 1. the keeper: once drained (or stopped), or it keeps spending and re-creating its token account
$k = $r.keeper
$kw = [int64]$k.wsol.lamports
Show "keeper $keeperAddr (SOL $(Format-Sol $k.lamports) + wrapped bounty account $(Format-Sol $kw))" ([int64]$k.lamports + $kw) @(
  "# on the VPS, after the drain: sudo systemctl stop ladle-keeper   (Docker: docker compose stop keeper)",
  $(if ($k.wsol.exists) { "spl-token unwrap $($k.wsol.address) $keeper --fee-payer $keeper -u $u" } else { "# no wrapped-SOL account to unwrap" }),
  "solana transfer $Owner ALL --keypair $keeper -u $u") `
  "after the shutdown's drain (or a pause's 'drained'): a running keeper keeps spending and re-creating its token account"
$total += [int64]$k.lamports + $kw

# 2. rent in rounds the keeper opened, and every market of the program
foreach ($m in $r.markets) {
  if (-not $m.recorded) {
    Write-Host ""
    Write-Host ("market {0}, created by {1}: not the deployment's. Its players' money keeps the program open as much as yours." -f $m.address, $m.creator) -ForegroundColor Yellow
  }
  Show "rent of $($m.keeperWindows) round(s) opened by the keeper on market $($m.address)" ([int64]$m.keeperWindowRentLamports) @() `
    "comes back to the keeper by close_window (permissionless): within minutes of each round while the keeper runs, and during the drain, the last round included. Not counted in the total."
  if ([int64]$m.keeperWindowsWaitingForRefunds -gt 0) {
    Write-Host ("                 {0} refunded round(s) keep their rent until their last stake is taken back (the owners from the site, or the shutdown's force_exit)" -f $m.keeperWindowsWaitingForRefunds)
  }
  if ([int64]$m.stakesInEscrows -gt 0 -or [int64]$m.windowsHoldingStakes -gt 0) {
    Write-Host ("                 {0} SOL of players' stakes still sit in {1} round(s): theirs, not the operator's" -f (Format-Sol $m.stakesInEscrows), $m.windowsHoldingStakes)
  }
  if ([int64]$m.windowsPending -ge 8) {
    Write-Host ("                 {0} rounds wait to settle: the program opens no new round until the oldest finishes (docs/DEPLOY.md, 'A round that does not settle')" -f $m.windowsPending)
  }
  if ([int64]$m.tokensOutstanding -gt 0) {
    Write-Host ("                 the curve vault holds {0} SOL for the {1} LADLE of players' unsold scoops: theirs, not the operator's" -f (Format-Sol $m.playersVaultWrapped), ([decimal]$m.tokensOutstanding / 1000000).ToString("0.######", $script:Invariant))
  } elseif ([int64]$m.playersVaultWrapped -gt 0) {
    Write-Host ("                 every LADLE is back in the curve; its vault keeps {0} SOL of the curve's rounding (close_market pays it to the market's creator)" -f (Format-Sol $m.playersVaultWrapped))
  }
  if ($null -ne $m.noticeEnd) {
    $end = ([DateTimeOffset]::FromUnixTimeSeconds([int64]$m.noticeEnd)).UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", $script:Invariant)
    Write-Host ("                 shutdown notice: entries are paid out from {0}{1}" -f $end, $(if ($m.noticeOver) { " (over)" } else { "" }))
  }
}

# 3. the deployer wallet and any buffer an interrupted deploy left
$d = [int64]$r.deployer.lamports
Show "deployer $deployerAddr" $d @("solana transfer $Owner ALL --keypair $deployer -u $u") `
  "keep ~0.01 SOL on it while the program is not closed: it pays the close. An upgrade (the shutdown's, or a fix) also lends ~2 SOL for its buffer, back right after: mainnet-shutdown.ps1 asks for it when it needs it"
$total += $d
if ($null -eq $r.buffers) {
  Show "deploy buffers (could not list: $($r.buffersError))" 0 @("solana program show --buffers --buffer-authority $deployerAddr -u $u")
} elseif (@($r.buffers).Count -gt 0) {
  $b = [int64]0; foreach ($x in $r.buffers) { $b += [int64]$x.lamports }
  Show "$(@($r.buffers).Count) leftover deploy buffer(s)" $b @("solana program close --buffers --keypair $deployer --authority $deployer --recipient $Owner -u $u")
  $total += $b
}

# 4. the treasury's platform fees (wrapped SOL): they go to the treasury wallet, not to -Owner (not in the total below);
# the 0.05 SOL creation fee arrived as SOL already
$t = $r.treasury
$treasuryWsol = [int64]0
if ($t.wsol.exists) {
  $treasuryWsol = [int64]$t.wsol.lamports
  Show "platform fees in the treasury's wrapped-SOL account $($t.wsol.address) (to the TREASURY $($t.address), not to -Owner)" $treasuryWsol @(
    "spl-token unwrap $($t.wsol.address) <treasury signer: its keypair file or usb://ledger> --fee-payer <same> -u $u") `
    "the keeper re-creates this account before the next finalization (it pays that rent)"
}

# 5. the program itself: only while upgradeable, and only once nothing of anyone's is in it (report.ts programClosable:
# no entry and no round of any market left, the wind-down build live; or no market at all)
$p = $r.program
if ($p.deployed) {
  $rent = [int64]$p.programDataLamports + [int64]$p.programLamports
  if ($p.authorityIsDeployer) { $auth = $deployer }
  elseif ($Authority) { $auth = $Authority }
  else { $auth = "<the upgrade authority $($p.upgradeAuthority): usb://ledger or its keypair file; or rerun with -Authority>" }
  $marketCount = @($r.markets).Count
  if (-not $p.upgradeAuthority) {
    Show "program $($p.id) (immutable)" $rent @() "not recoverable: the program has no upgrade authority"
  } elseif ($r.programClosable -eq $true) {
    $why = if ($marketCount -eq 0) { "The program has no market: nothing of anyone's can be in it (a market created in between would cost only its own creator)." } else { "The wind-down build is live and no entry or round of any market is left." }
    Show "program $($p.id) rent (the end of the program)" $rent @(
      "solana program close $($p.id) --keypair $deployer --authority $auth --recipient $Owner --bypass-warning -u $u") `
      "PERMANENT: the program stops for good and its id can never be deployed again. $why Last step, after everything above."
    foreach ($m in @($r.leftBehind.marketsOpen)) { Write-Host ("                 market {0} stays open (LADLE in wallets, or made before v25): {1} SOL of its creator's stays with it" -f $m.address, (Format-Sol ([int64]$m.lamports))) }
    $total += $rent
  } elseif ($r.windDown -ne $true) {
    Show "program $($p.id) rent (comes back when you stop the game)" $rent @(
      "powershell -ExecutionPolicy Bypass -File scripts\mainnet-shutdown.ps1 -Owner $Owner -RpcUrl <rpc>$(if ($Authority) { " -Authority $Authority" })") `
      ("The game is running (the normal build). Stopping it: the wind-down build (no new round or entry), a 7-day notice the site shows, then every entry left paid out to its owner's wallet automatically, every round and market closed, and the close. " +
       "What players forgot does not keep it locked: force_exit pays it to them. The upgrade lends ~2 SOL for its buffer from the deployer, back right after.")
  } else {
    Show "program $($p.id) rent (stopping: wind-down build live)" $rent @(
      "powershell -ExecutionPolicy Bypass -File scripts\mainnet-shutdown.ps1 -Owner $Owner -RpcUrl <rpc>$(if ($Authority) { " -Authority $Authority" })") `
      "The notice runs, or the keeper's drain has not paid everything out yet. Left in the program:"
    foreach ($why in @($r.closeBlockers)) { Write-Host "                 - $why" }
  }
}

Write-Host ""
Write-Host ("{0,14} SOL  recoverable now with the commands above" -f (Format-Sol $total)) -ForegroundColor Green
if ($treasuryWsol -gt 0) { Write-Host ("{0,14} SOL  more to the treasury wallet (platform fees, above)" -f (Format-Sol $treasuryWsol)) }
Write-Host "Not recoverable: transaction and priority fees, ORAO's fee and request rent (~0.00185 SOL per round with 2+ entries),"
Write-Host "the token mint and its Metaplex metadata (~0.0052 SOL: neither can be closed) and Metaplex's 0.01 SOL metadata fee."
Write-Host "The market's other rents (~0.0076 SOL) come back to its creator with close_market at the end of a shutdown."
