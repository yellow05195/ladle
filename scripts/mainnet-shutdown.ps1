# Stopping Ladle for good and getting the program rent back, for the OWNER to
# run (docs/LAUNCH.md, "Arreter le jeu"). It stops a real-money game and spends
# real SOL: nobody else runs it, no tool or agent runs it for you.
#
#   powershell -ExecutionPolicy Bypass -File scripts/mainnet-shutdown.ps1 -Owner <your wallet> -RpcUrl <rpc>
#     [-Authority usb://ledger]   when mainnet-up.ps1 -UpgradeAuthority moved the upgrade authority
#     [-CuPrice 20000]            priority fee of the upgrade's write transactions (micro-lamports per unit)
#     [-Cluster devnet]           to rehearse on the devnet deployment
#
# Rerun it after any stop, or simply later: each run reads where the shutdown
# stands (keeper/src/ops/report.ts, read-only) and does the next step, after
# you type the step's word. Nothing of a player's is taken or left behind:
#  1. STOP. Builds the wind-down version of the program (target\wind-down\
#     ladle.so, with the treasury the program was built with, so rounds in
#     flight still finish), checks it (program id, treasury, size), and
#     upgrades the program to it through a buffer: the deployer key writes
#     the buffer (it lends the buffer's rent, ~1.74 SOL, for the few minutes
#     of the upgrade and gets it back at once), the upgrade authority signs
#     ONE transaction (a Ledger: one confirmation). From then on no round
#     opens and nobody can enter; rounds in flight finish or refund.
#  2. NOTICE. Starts the 7-day notice of every market of the program
#     (start_wind_down, sent with the keeper key; the site shows the end date
#     on every page). Players sell back and take refunds as usual meanwhile.
#     Then set KEEPER_SHUTDOWN=1 on the VPS (the lines are printed).
#  3. DRAIN. After the notice, the keeper's --shutdown pays every entry out to
#     its owner (force_exit: an unsold scoop sold back at the curve's price
#     of that moment, an unrefunded stake whole; SOL straight to the wallet,
#     with the entry's rent: every market is quoted in wSOL, so nothing a
#     player does with their token accounts can block it), closes every
#     round (rent to its opener) and every market (rents to its creator),
#     then exits. It works program-wide: every market of the program (ours
#     or anyone's), and the entries a market closed early by someone else
#     left behind (only their owners' rent; close_entry needs no market).
#     When the VPS keeper is not doing it, this script runs the same drain
#     from this PC (DRAIN).
#  4. CLOSE. Once report.ts says programClosable (no entry and no round of any
#     market left, the wind-down build live), `solana program close` sends the
#     program rent to -Owner (CLOSE). The program id can never be used again.
#     The last sweeps (keeper, deployer, treasury) are printed for you.
param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [Parameter(Mandatory = $true)][string]$RpcUrl,
  [ValidateSet("mainnet-beta", "devnet")][string]$Cluster = "mainnet-beta",
  [string]$Authority = "",
  [int]$CuPrice = 20000,
  # the wind-down build's notice: 604800 (7 days); a devnet rehearsal build (feature "rehearsal") has 600
  [int]$NoticeSecs = 604800,
  # the owner said yes once, in the desktop launcher (Recuperer mon argent Ladle.cmd), to every step: no word is asked
  [switch]$Yes,
  # once the program is closed: the keeper, the deployer and the treasury (its key file on this PC) are swept to -Owner
  [switch]$Sweep
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ladle-common.ps1")
Use-SolanaCli
$root = $script:LadleRoot
if ($Yes) { $script:LadleAssumeYes = $true }

# The keeper the desktop launcher runs on this PC (scripts\keeper-mainnet-local.cmd) reads its mode from this file at
# each (re)start: normal, shutdown (KEEPER_SHUTDOWN=1) or off (its loop ends). The running one listens on port 8788.
$modeFile = Join-Path $script:LadleKeyDir "keeper-mode.txt"
function Set-LocalKeeper([ValidateSet("shutdown", "off")][string]$Mode) {
  if ($Cluster -ne "mainnet-beta") { return }
  $now = if (Test-Path $modeFile) { (Get-Content $modeFile -Raw).Trim() } else { "normal" }
  if ($now -eq $Mode) { return }
  Set-Content -Path $modeFile -Value $Mode -Encoding ascii
  $c = Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { Stop-Process -Id $c.OwningProcess -Force; Write-Host "the keeper on this PC goes to '$Mode' mode" }
}

# -Sweep: everything left on our own keys goes to -Owner (after the close: nothing of the game needs them any more)
function Invoke-Sweeps($Report) {
  Set-LocalKeeper "off"
  $treasuryKey = Join-Path $script:LadleKeyDir "ladle-mainnet-treasury.json"
  $wallets = @(,@("keeper", $keeper, $Report.keeper.wsol))
  if ($Cluster -eq "mainnet-beta" -and $treasury -and (Test-Path $treasuryKey) -and (Get-Address $treasuryKey) -eq $treasury) {
    $wallets += ,@("treasury", $treasuryKey, $Report.treasury.wsol)
  }
  $wallets += ,@("deployer", $deployer, $null)
  foreach ($w in $wallets) {
    $name, $key, $wsol = $w
    if ($wsol -and $wsol.exists) {
      $code = Invoke-Scrubbed { spl-token unwrap $wsol.address $key --fee-payer $key --url $RpcUrl } $RpcUrl
      if ($code -ne 0) { Write-Host "$name : unwrap failed (rerun this script)" -ForegroundColor Yellow }
    }
    $addr = Get-Address $key
    if ((Get-Lamports $addr $RpcUrl) -le 5000) { Write-Host "$name $addr is empty"; continue }
    $code = Invoke-Scrubbed { solana transfer $Owner ALL --keypair $key --fee-payer $key --url $RpcUrl } $RpcUrl
    if ($code -ne 0) { Write-Host "$name : transfer failed (rerun this script)" -ForegroundColor Yellow }
    else { Write-Host "$name $addr swept to $Owner" -ForegroundColor Green }
  }
  Write-Host "your wallet $Owner now holds $(Format-Sol (Get-Lamports $Owner $RpcUrl)) SOL" -ForegroundColor Green
}

if ($Cluster -eq "mainnet-beta" -and $NoticeSecs -ne 604800) { throw "-NoticeSecs other than 604800 is for a devnet rehearsal build only" }
if (-not (Test-PublicKey $Owner)) { throw "-Owner is not a base58 public key: $Owner" }
Assert-Cluster $RpcUrl $Cluster
if ($Cluster -eq "mainnet-beta") {
  $deployer = Join-Path $script:LadleKeyDir "ladle-mainnet-deployer.json"
  $keeper = Join-Path $script:LadleKeyDir "ladle-mainnet-keeper.json"
} else {
  $deployer = "$env:USERPROFILE\.config\solana\pulled-devnet-deployer.json"
  $keeper = "$env:USERPROFILE\.config\solana\ladle-devnet-keeper.json"
}
foreach ($f in @($deployer, $keeper)) { if (-not (Test-Path $f)) { throw "missing $f" } }
$deployerAddr = Get-Address $deployer
$keeperAddr = Get-Address $keeper
if ($Owner -eq $deployerAddr -or $Owner -eq $keeperAddr) { throw "-Owner must be your own wallet, not the deployer or the keeper" }
Confirm-WalletAddress $Owner $RpcUrl "-Owner (your wallet: it receives the program rent)"
$deployment = "$root\config\deployments\$Cluster.json"
$dep = if (Test-Path $deployment) { Get-Content $deployment -Raw | ConvertFrom-Json } else { $null }
$programId = if ($dep -and $dep.programId) { $dep.programId } else { Get-Address (Join-Path $root "target\deploy\ladle-keypair.json") }
$treasury = if ($dep -and $dep.treasury) { $dep.treasury } else { $null }

# report.ts: read-only, sends nothing (--owner pays only a simulation's fee, which is never charged)
function Get-Report {
  $toolArgs = @("--cluster", $Cluster, "--rpc", $RpcUrl, "--deployer", $deployerAddr, "--keeper", $keeperAddr, "--owner", $Owner, "--notice-secs", "$NoticeSecs")
  if ($dep) { $toolArgs += @("--deployment", $deployment) }
  if ($treasury) { $toolArgs += @("--treasury", $treasury) }
  Push-Location $root
  try {
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $json = & node --experimental-strip-types --no-warnings keeper\src\ops\report.ts @toolArgs
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
  } finally { Pop-Location }
  if ($code -ne 0) { throw "report failed (rerun when the RPC answers)" }
  return (($json -join "`n") | ConvertFrom-Json)
}

# the keeper, from this PC, program-wide: --shutdown with no --market serves every market of the program
# (anyone's: their players are paid out too) and closes the entries markets already closed left behind
function Invoke-ShutdownKeeper([switch]$Once) {
  $toolArgs = @("--cluster", $Cluster, "--rpc", $RpcUrl, "--keypair", $keeper, "--shutdown", "--notice-secs", "$NoticeSecs", "--program", $programId)
  if ($treasury) { $toolArgs += @("--treasury", $treasury) }
  if ($Once) { $toolArgs += "--once" }
  # the keeper scrubs the RPC URL from everything it prints (config.ts scrubSecrets)
  return (Invoke-KeeperTool "index.ts" $toolArgs)
}

function Format-Utc([int64]$Unix) {
  return ([DateTimeOffset]::FromUnixTimeSeconds($Unix)).UtcDateTime.ToString("yyyy-MM-dd HH:mm 'UTC'", $script:Invariant)
}

$r = Get-Report
$p = $r.program
if (-not $p.deployed) {
  Write-Host "program $programId is not deployed on ${Cluster}: nothing to stop"
  if ($Sweep) { Invoke-Sweeps $r }
  return
}
if (-not $p.upgradeAuthority) { throw "program $programId is immutable: it can be neither stopped nor closed" }
if ($p.authorityIsDeployer) { $auth = $deployer }
elseif ($Authority) { $auth = $Authority }
else { throw "the upgrade authority is $($p.upgradeAuthority), not the deployer: rerun with -Authority usb://ledger (or its keypair file)" }
$markets = @($r.markets)
Write-Host "Ladle on ${Cluster}: program $programId, $($markets.Count) market(s), upgrade authority $($p.upgradeAuthority)"

# ---------------------------------------------------------------- 1. STOP
if ($markets.Count -gt 0 -and $r.windDown -ne $true) {
  if ($null -eq $r.windDown) { throw "could not tell whether the wind-down build is live (the simulation did not run): rerun" }
  if (-not $treasury) { throw "no ${deployment}: the treasury the program was built with is unknown, and the wind-down build must embed the same one" }
  Write-Host "`n1. STOP: the wind-down build"
  $so = Invoke-WindDownBuild $treasury
  Assert-BuildEmbeds $so $programId $treasury
  $soLen = (Get-Item $so).Length
  $dataLen = Get-ProgramDataLength $programId $RpcUrl
  if ($soLen -gt $dataLen) {
    throw "the wind-down build ($soLen B) does not fit the program's data account ($dataLen B): run 'solana program extend $programId $($soLen - $dataLen) --keypair $deployer -u $Cluster' first (its rent comes back with the close)"
  }
  $bufferRent = Get-RentLamports ($soLen + 37) $RpcUrl
  # as Get-DeployCostLamports: ~1 KB per write transaction, a 200k-unit limit priced at -CuPrice
  $writes = [int64]([math]::Ceiling($soLen / 1000) + 10) * (5000 + [int64]$CuPrice / 5)
  $need = $bufferRent + $writes + 10000000
  Write-Host "  wind-down build $so ($soLen B, fits the program's $dataLen B)"
  Write-Host "  It refuses create_market, open_window and enter; every round in flight still seals, draws, settles or refunds;"
  Write-Host "  sell back, refunds and closes work as before; after a market's 7-day notice, force_exit pays its entries out."
  Write-Host "  The deployer lends the buffer's rent ($(Format-Sol $bufferRent) SOL) for the upgrade and gets it back at once;"
  Write-Host "  the ~$([math]::Ceiling($soLen / 1000) + 10) write transactions cost about $(Format-Sol $writes) SOL."
  if ($p.upgradeAuthority -ne $deployerAddr) { Write-Host "  The upgrade authority $($p.upgradeAuthority) signs ONE transaction at the end (on a Ledger: one confirmation)." }
  Confirm-Step "STOP" "Stop the game: from the upgrade on, no round opens and nobody can enter, for good."
  $have = Get-Lamports $deployerAddr $RpcUrl
  if ($have -lt $need) {
    Write-Host "the deployer $deployerAddr needs $(Format-Sol $need) SOL for the upgrade (it has $(Format-Sol $have)): send it $(Format-Sol ($need - $have)) SOL from your wallet"
    Wait-ForLamports $deployerAddr $need $RpcUrl "deployer (upgrade buffer)" | Out-Null
  }
  $bufferKey = Join-Path $script:LadleKeyDir "ladle-$Cluster-upgrade-buffer.json"
  New-LadleKeypair $bufferKey
  $bufAddr = Get-Address $bufferKey
  $code = Invoke-Scrubbed { solana program write-buffer $so --buffer $bufferKey --buffer-authority $deployer --keypair $deployer --with-compute-unit-price $CuPrice --use-rpc --url $RpcUrl } $RpcUrl
  if ($code -ne 0) {
    throw ("the buffer writes stopped: rerun this script to resume (same buffer $bufAddr), or take the buffer's SOL back:`n" +
      "  solana program close $bufAddr --keypair $deployer --authority $deployer --recipient $deployerAddr -u $Cluster")
  }
  if ($p.upgradeAuthority -ne $deployerAddr) {
    $code = Invoke-Scrubbed { solana program set-buffer-authority $bufAddr --buffer-authority $deployer --new-buffer-authority $p.upgradeAuthority --keypair $deployer --url $RpcUrl } $RpcUrl
    if ($code -ne 0) { throw "set-buffer-authority failed: the buffer $bufAddr is still the deployer's (rerun, or close it as above)" }
    Write-Host "the upgrade authority signs the next transaction: confirm it on the Ledger" -ForegroundColor Yellow
  }
  $code = Invoke-Scrubbed { solana program upgrade $bufAddr $programId --upgrade-authority $auth --keypair $deployer --url $RpcUrl } $RpcUrl
  if ($code -ne 0) {
    throw ("the upgrade failed: the program is unchanged. Retry by rerunning this script, or take the buffer's SOL back:`n" +
      "  solana program close $bufAddr --authority $auth --recipient $deployerAddr --keypair $deployer -u $Cluster")
  }
  if (-not (Test-ProgramMatchesSo $programId $so $RpcUrl)) { throw "the program on $Cluster is not $so after the upgrade" }
  Write-Host "the wind-down build is live: no new round, no new entry" -ForegroundColor Green
  $r = Get-Report
  $markets = @($r.markets)
  if ($r.windDown -ne $true) { throw "report.ts does not see the wind-down build yet: rerun in a minute" }
}

# ---------------------------------------------------------------- 2. NOTICE
$notStarted = @($markets | Where-Object { [int64]$_.noticeStart -eq 0 })
if ($notStarted.Count -gt 0) {
  Write-Host "`n2. NOTICE: $($notStarted.Count) market(s) without a notice yet"
  Confirm-Step "NOTICE" "Start the notice now ($NoticeSecs s; the keeper key pays one transaction fee per market)?"
  if ((Invoke-ShutdownKeeper -Once) -ne 0) { throw "the keeper could not start the notice: rerun" }
  $r = Get-Report
  $markets = @($r.markets)
  if (@($markets | Where-Object { [int64]$_.noticeStart -eq 0 }).Count -gt 0) { throw "a market still has no notice: rerun in a minute" }
}
$open = @($markets | Where-Object { $null -ne $_.noticeEnd })
if ($open.Count -gt 0) {
  Write-Host ""
  foreach ($m in $open) { Write-Host ("market {0}: notice ends {1}{2}" -f $m.address, (Format-Utc ([int64]$m.noticeEnd)), $(if ($m.noticeOver) { " (over)" } else { "" })) }
}
$running = @($markets | Where-Object { $_.noticeOver -ne $true })
# the keeper on this PC finishes the notice in shutdown mode: it pays every entry out once it ends, then exits
if ($markets.Count -gt 0) { Set-LocalKeeper "shutdown" }
if ($running.Count -gt 0) {
  $last = ($running | ForEach-Object { [int64]$_.noticeEnd } | Measure-Object -Maximum).Maximum
  Write-Host "`nThe notice runs until $(Format-Utc $last). Meanwhile:" -ForegroundColor Yellow
  Write-Host "  on the VPS, add to /etc/ladle/keeper.env and restart the keeper (it finishes rounds during the notice, then pays"
  Write-Host "  every entry out, closes every round and market of the program, and exits with the log line 'drained'; it finds"
  Write-Host "  every market by itself, LADLE_MARKET may stay as it is):"
  Write-Host "    KEEPER_SHUTDOWN=1"
  Write-Host "    sudo systemctl restart ladle-keeper; journalctl -u ladle-keeper -f   (Docker: docker compose up -d keeper)"
  Write-Host "  Rerun this script after $(Format-Utc $last)."
  return
}

# ---------------------------------------------------------------- 3. DRAIN
if ($r.programClosable -ne $true) {
  Write-Host "`n3. DRAIN: the notice is over; left in the program:"
  foreach ($why in @($r.closeBlockers)) { Write-Host "  - $why" }
  Write-Host "If the VPS keeper runs with KEEPER_SHUTDOWN=1 it is paying these out: wait for its 'drained' line, then rerun this script."
  Confirm-Step "DRAIN" "Or run the same drain from this PC now, with the keeper key (it exits by itself once everything is paid out and closed)?"
  Set-LocalKeeper "off"
  $code = Invoke-ShutdownKeeper
  if ($code -ne 0) { throw "the drain stopped (exit $code): rerun this script, it resumes" }
  $r = Get-Report
  if ($r.programClosable -ne $true) {
    Write-Host "still left:" -ForegroundColor Yellow
    foreach ($why in @($r.closeBlockers)) { Write-Host "  - $why" }
    throw "not closable yet: rerun this script"
  }
}

# ---------------------------------------------------------------- 4. CLOSE
$p = $r.program
$rent = [int64]$p.programDataLamports + [int64]$p.programLamports
Write-Host "`n4. CLOSE: no entry and no round is left in the program; the wind-down build is live (or no market is left)."
foreach ($m in @($r.leftBehind.marketsOpen)) {
  Write-Host ("  market {0} stays (it could not close: {1} LADLE still in wallets, or made before v25): {2} SOL of its creator's rent and vault are left with it" -f $m.address, ([decimal]$m.tokensInWallets / 1000000).ToString("0.######", $script:Invariant), (Format-Sol ([int64]$m.lamports)))
}
foreach ($i in @($r.leftBehind.integrations)) { Write-Host ("  integration {0} of {1} stays: {2} SOL of its host's rent" -f $i.address, $i.host, (Format-Sol ([int64]$i.lamports))) }
Write-Host "  'solana program close' sends $(Format-Sol $rent) SOL to $Owner. PERMANENT: the program id can never be deployed again."
Confirm-Step "CLOSE" "Close program $programId for good?"
$code = Invoke-Scrubbed { solana program close $programId --keypair $deployer --authority $auth --recipient $Owner --bypass-warning --url $RpcUrl } $RpcUrl
if ($code -ne 0) { throw "program close failed: rerun this script" }
Write-Host "program closed: $(Format-Sol $rent) SOL sent to $Owner" -ForegroundColor Green
if ($Sweep) { Invoke-Sweeps (Get-Report); return }
Write-Host "`nThe last sweeps (scripts/mainnet-recover.ps1 -Owner $Owner prints them with their amounts):"
Write-Host "  keeper   : on the VPS stop it (sudo systemctl stop ladle-keeper), then here:"
Write-Host "             spl-token unwrap <its wSOL account> $keeper --fee-payer $keeper -u $Cluster   (if it has one)"
Write-Host "             solana transfer $Owner ALL --keypair $keeper -u $Cluster"
Write-Host "  deployer : solana transfer $Owner ALL --keypair $deployer -u $Cluster"
Write-Host "  treasury : spl-token unwrap <its wSOL account> <treasury signer> -u $Cluster   (the platform fees)"
