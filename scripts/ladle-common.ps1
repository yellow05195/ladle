# Shared helpers of scripts/devnet-up.ps1, scripts/mainnet-up.ps1 and
# scripts/mainnet-recover.ps1 (dot-sourced, never run on its own).
# Windows PowerShell 5.1 and PowerShell 7; ASCII only (5.1 reads a .ps1
# without BOM in the ANSI code page).

Add-Type -AssemblyName System.Numerics
# Windows PowerShell 5.1 may not offer TLS 1.2 by default (paid RPC endpoints require it)
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$script:LadleRoot = Split-Path -Parent $PSScriptRoot
$script:LadleGenesis = @{
  "mainnet-beta" = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"
  "devnet"       = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
}
# Feature gates that allow deploying each SBPF version (docs/DEPLOY.md "Build").
$script:LadleSbpfFeature = @{
  1 = "JE86WkYvTrzW8HgNmrHY7dFYpCmSptUpKupbo2AdQ9cG"
  2 = "F6UVKh1ujTEFK3en2SyAL3cdVnqko1FVEXWhmdLRu6WP"
  3 = "5cC3foj77CWun58pC51ebHFUWavHWKarWyR5UUik7dnC"
}
# The treasury of a build made without LADLE_TREASURY (programs/ladle/src/consts.rs).
$script:LadleDevnetTreasury = "A7iPUhYk87cek8n7FMYEG62LRQoyHEK8wFwjGFQdDSat"
# Our own keypairs live here, nowhere else.
$script:LadleKeyDir = Join-Path $env:USERPROFILE ".config\ladle"
$script:Invariant = [Globalization.CultureInfo]::InvariantCulture

function Use-SolanaCli {
  $bin = Join-Path $env:USERPROFILE ".local\share\solana\solana-release\bin"
  if (Test-Path $bin) { $env:PATH = "$bin;$env:PATH" }
  if (-not (Get-Command solana -ErrorAction SilentlyContinue)) { throw "Solana CLI not found (expected in $bin)" }
}

# Run a native command and capture its output without PowerShell 5.1 turning
# stderr lines into terminating errors. Returns @{ Out; Code }.
function Invoke-Native([scriptblock]$Block) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $out = (& $Block 2>&1 | ForEach-Object { "$_" }) -join "`n"; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $prev }
  return @{ Out = $out; Code = $code }
}

# Scheme and host only: a paid RPC URL carries its key in the path or the query.
function Hide-Url([string]$Url) {
  try { $u = [Uri]$Url; return "$($u.Scheme)://$($u.Host)" } catch { return "<rpc url>" }
}

# Command output with the RPC URL (and its key) replaced by its host.
function Hide-UrlIn([string]$Text, [string]$Url) {
  if (-not $Text -or -not $Url) { return $Text }
  return $Text.Replace($Url, (Hide-Url $Url))
}

# getAccountInfo over JSON-RPC: the account (lamports, owner, data), or $null
# ONLY when the cluster answers that it does not exist. Any failure (rate
# limit, timeout, network) throws: a failed read must never pass for "absent"
# (the CLI prints AccountNotFound for both).
function Get-AccountInfo([string]$Address, [string]$Url) {
  $body = @{ jsonrpc = "2.0"; id = 1; method = "getAccountInfo"; params = @($Address, @{ encoding = "base64"; commitment = "confirmed" }) } | ConvertTo-Json -Depth 5 -Compress
  try { $res = Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30 }
  catch { throw "cannot read $Address from $(Hide-Url $Url): $($_.Exception.Message) (rerun when the RPC answers)" }
  if ($res.error) { throw "cannot read $Address from $(Hide-Url $Url): $($res.error.message) (rerun when the RPC answers)" }
  if ($null -eq $res.result) { throw "cannot read $Address from $(Hide-Url $Url): no result" }
  return $res.result.value
}

function Format-Sol([int64]$Lamports) {
  return ([decimal]$Lamports / 1000000000).ToString("0.#########", $script:Invariant)
}

function ConvertTo-Lamports([string]$Sol) {
  return [int64]([decimal]::Parse($Sol, $script:Invariant) * 1000000000)
}

# Every message that quotes CLI output run with --url $Url goes through
# Hide-UrlIn: the CLI repeats the URL, key included, when it cannot reach it.
function Assert-Cluster([string]$Url, [string]$Cluster) {
  $r = Invoke-Native { solana genesis-hash --url $Url }
  if ($r.Code -ne 0) { throw "cannot reach $(Hide-Url $Url): $(Hide-UrlIn $r.Out $Url)" }
  $hash = $r.Out.Trim()
  if ($hash -ne $script:LadleGenesis[$Cluster]) { throw "$(Hide-Url $Url) is not $Cluster (genesis hash $(Hide-UrlIn $hash $Url))" }
}

# The same check for an RPC this PC may not be allowed to use (the site's
# browser key, restricted to the site's origin): a wrong cluster stops the
# script; an RPC that does not answer here only gets a note.
function Assert-ClusterIfReachable([string]$Url, [string]$Cluster, [string]$What) {
  $r = Invoke-Native { solana genesis-hash --url $Url }
  if ($r.Code -ne 0) {
    Write-Host "NOTE: $What ($(Hide-Url $Url)) does not answer from this PC (a key restricted to the site's origin does that), so its cluster was not checked here; the site checks it itself and refuses to run on another cluster than $Cluster." -ForegroundColor Yellow
    return
  }
  $hash = $r.Out.Trim()
  if ($hash -ne $script:LadleGenesis[$Cluster]) { throw "$What $(Hide-Url $Url) is not $Cluster (genesis hash $(Hide-UrlIn $hash $Url)): the site would show $Cluster while reading another cluster" }
}

function Get-Lamports([string]$Address, [string]$Url) {
  $r = Invoke-Native { solana balance $Address --url $Url --lamports }
  if ($r.Code -ne 0) { throw "balance of $Address failed: $(Hide-UrlIn $r.Out $Url)" }
  return [int64]([regex]::Match($r.Out, '(\d+)').Groups[1].Value)
}

function Get-RentLamports([int64]$Bytes, [string]$Url) {
  $r = Invoke-Native { solana rent $Bytes --url $Url --lamports }
  if ($r.Code -ne 0) { throw "solana rent failed: $(Hide-UrlIn $r.Out $Url)" }
  return [int64]([regex]::Match($r.Out, '(\d+) lamports').Groups[1].Value)
}

# A wallet address typed on the command line that will receive SOL: base58
# has no checksum, so one wrong character sends everything to a key nobody
# holds. The owner retypes its last 8 characters from the wallet itself, and
# the cluster must know it as an ordinary wallet (an existing, system-owned
# account: a wallet that ever held SOL; a program's account is refused).
function Confirm-WalletAddress([string]$Address, [string]$Url, [string]$What) {
  if (-not (Test-PublicKey $Address)) { throw "$What is not a base58 public key: $Address" }
  $info = Get-AccountInfo $Address $Url
  if (-not $info) { throw "$What $Address has never held SOL on this cluster: check it against your wallet (a typo here sends everything to a key nobody holds). Send it any small amount first if it is a new wallet" }
  if ($info.owner -ne "11111111111111111111111111111111") { throw "$What $Address is an account of the program $($info.owner), not a wallet" }
  $tail = $Address.Substring($Address.Length - 8)
  $typed = Read-Host "Open the wallet for $What and type the LAST 8 characters of its address as the wallet shows them (do not copy them from here)"
  if ($typed.Trim() -cne $tail) { throw "stopped: '$($typed.Trim())' is not the end of $Address. Check the address against your wallet" }
}

# The deploy's SOL, as the upgradeable loader moves it (solana-bpf-loader-program,
# DeployWithMaxDataLen): the buffer (.so + 37 B) is paid first and filled by the
# write transactions; the deploy then drains the buffer into the payer and pays
# the program data (.so + 45 B) and the program account (36 B) from it. The
# buffer is paid once and becomes the program data rent, so the most the
# payer ever holds out is program data + program account + writes.
# Returns @{ Data; Program; Buffer; Writes; Peak } in lamports.
function Get-DeployCostLamports([int64]$SoLen, [int]$CuPrice, [string]$Url) {
  $data = Get-RentLamports ($SoLen + 45) $Url
  $program = Get-RentLamports 36 $Url
  $buffer = Get-RentLamports ($SoLen + 37) $Url
  # ~1 KB per write transaction, plus a few for the buffer, the deploy and retries
  $writes = [int64]([math]::Ceiling($SoLen / 1000) + 10) * (5000 + [int64]$CuPrice / 5)
  return @{ Data = $data; Program = $program; Buffer = $buffer; Writes = $writes; Peak = $data + $program + $writes }
}

# The deployed program's data account balance (lamports): what an upgrade
# already has towards the rent of a larger program.
function Get-ProgramDataLamports([string]$ProgramId, [string]$Url) {
  $r = Invoke-Native { solana program show $ProgramId --url $Url --lamports }
  $m = [regex]::Match($r.Out, 'Balance: (\d+) lamports')
  if ($r.Code -ne 0 -or -not $m.Success) { throw "solana program show $ProgramId failed: $(Hide-UrlIn $r.Out $Url)" }
  return [int64]$m.Groups[1].Value
}

# The commands that upgrade a deployed program to $So, for the owner to read
# and run (the scripts print them and send nothing). The upgrade authority
# signs ONE transaction, even on a Ledger: the deployer key writes a buffer
# (it signs and pays the ~400 write transactions; a keypair FILE for the
# buffer makes a stopped write resume and prints no recovery words), the
# buffer is handed to the upgrade authority when that is another key, and
# `solana program upgrade`, signed by the authority, swaps it in (the
# buffer's SOL goes back to the fee payer, the deployer). `solana program
# deploy --upgrade-authority usb://ledger` would instead make the Ledger the
# buffer authority and ask it to confirm every write. The program data does
# not grow here: a larger .so needs `solana program extend` first
# (docs/DEPLOY.md, "A round that does not settle").
function Get-UpgradeCommands([string]$ProgramId, [string]$So, [string]$Deployer, [string]$DeployerAddress,
  [string]$Authority, [string]$AuthorityAddress, [string]$BufferKeypair, [int]$CuPrice) {
  $handOver = $AuthorityAddress -ne $DeployerAddress
  $lines = @(
    "# a. the buffer's keypair file (created once, silently) and its address:",
    "if (-not (Test-Path '$BufferKeypair')) { solana-keygen new --no-bip39-passphrase --silent --outfile '$BufferKeypair' }",
    "`$buf = solana address -k '$BufferKeypair'",
    "# b. your RPC (the keeper's paid one: the public endpoint rate-limits ~400 writes); typed at Read-Host, its key stays out of the saved history:",
    "`$rpc = Read-Host 'RPC URL'",
    "# c. the deployer writes the program into the buffer, signing and paying every write (rerun the same line to resume):",
    "solana program write-buffer $So --buffer '$BufferKeypair' --buffer-authority '$Deployer' --keypair '$Deployer' --with-compute-unit-price $CuPrice --use-rpc --url `$rpc")
  if ($handOver) {
    $lines += @(
      "# d. hand the buffer to the upgrade authority $AuthorityAddress (one transaction, signed by the deployer):",
      "solana program set-buffer-authority `$buf --buffer-authority '$Deployer' --new-buffer-authority $AuthorityAddress --keypair '$Deployer' --url `$rpc",
      "# e. the upgrade: the ONE transaction the upgrade authority signs (on a Ledger: one confirmation); the buffer's SOL goes back to the deployer:")
  } else {
    $lines += "# d. the upgrade: one transaction signed by the upgrade authority; the buffer's SOL goes back to the deployer:"
  }
  $lines += "solana program upgrade `$buf $ProgramId --upgrade-authority $Authority --keypair '$Deployer' --url `$rpc"
  if ($handOver) {
    $lines += "#    if it fails, the buffer is the authority's: retry it, or take its SOL back with: solana program close `$buf --authority $Authority --recipient $DeployerAddress --keypair '$Deployer' --url `$rpc"
  }
  return $lines
}

# What create_market takes from its creator (keeper/src/ops/create-market.ts
# prints the same): the 0.05 SOL creation fee (to the treasury), the rents of
# the market (626 B: 562 + 64 reserved since the second review), the token
# mint (82 B), its two vaults (165 B) and the
# Metaplex metadata (679 B), Metaplex's 0.01 SOL metadata creation fee (kept
# by Metaplex; seen on devnet 2026-10-28), and 0.0001 SOL of transaction fees.
function Get-MarketCostLamports([string]$Url) {
  $rents = (Get-RentLamports 626 $Url) + (Get-RentLamports 82 $Url) + 2 * (Get-RentLamports 165 $Url) + (Get-RentLamports 679 $Url)
  return [int64](50000000 + $rents + 10000000 + 100000)
}

function Get-Address([string]$KeypairPath) {
  $r = Invoke-Native { solana address -k $KeypairPath }
  if ($r.Code -ne 0) { throw "cannot read the address of $KeypairPath" }
  return $r.Out.Trim()
}

# A new keypair file, only when none exists, created silently: no recovery
# phrase on the console, where scrollback, transcripts and anything that
# reads this terminal would see it. Back the FILE up offline instead (the
# scripts say so). -ShowSeed prints the 12 words anyway (not used by the
# scripts).
function New-LadleKeypair([string]$Path, [switch]$ShowSeed) {
  if (Test-Path $Path) { return }
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  if ($ShowSeed) { solana-keygen new --no-bip39-passphrase --outfile $Path }
  else { solana-keygen new --no-bip39-passphrase --silent --outfile $Path | Out-Null }
  if ($LASTEXITCODE -ne 0) { throw "solana-keygen failed for $Path" }
}

function ConvertFrom-Base58([string]$Text) {
  $alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  $n = [System.Numerics.BigInteger]::Zero
  foreach ($ch in $Text.ToCharArray()) {
    $i = $alphabet.IndexOf($ch)
    if ($i -lt 0) { throw "not base58: $Text" }
    $n = $n * 58 + $i
  }
  $le = $n.ToByteArray()
  $len = $le.Length
  if ($len -gt 1 -and $le[$len - 1] -eq 0) { $len-- }   # sign byte
  if ($n.IsZero) { $len = 0 }
  $body = New-Object byte[] $len
  for ($k = 0; $k -lt $len; $k++) { $body[$k] = $le[$len - 1 - $k] }
  $zeros = 0
  while ($zeros -lt $Text.Length -and $Text[$zeros] -eq '1') { $zeros++ }
  return [byte[]]((New-Object byte[] $zeros) + $body)
}

function Test-PublicKey([string]$Text) {
  try { return (ConvertFrom-Base58 $Text).Length -eq 32 } catch { return $false }
}

# True when the 32 bytes of $Key appear in the file (a pubkey constant of the build).
function Test-FileContainsKey([string]$Path, [string]$Key) {
  $hay = [BitConverter]::ToString([IO.File]::ReadAllBytes($Path))
  $needle = [BitConverter]::ToString((ConvertFrom-Base58 $Key))
  return $hay.IndexOf($needle, [StringComparison]::Ordinal) -ge 0
}

# ELF e_flags of the .so = its SBPF version (0 legacy, 1, 2, 3).
function Get-SbpfVersion([string]$So) {
  $b = [IO.File]::ReadAllBytes($So)
  if ($b.Length -lt 64 -or $b[0] -ne 0x7F -or $b[1] -ne 0x45 -or $b[2] -ne 0x4C -or $b[3] -ne 0x46) { throw "$So is not an ELF file" }
  return [int][BitConverter]::ToUInt32($b, 0x30)
}

# The cluster must accept deploying this SBPF version (its feature gate active).
function Assert-SbpfAccepted([string]$So, [string]$Url) {
  $v = Get-SbpfVersion $So
  if ($v -eq 0) { Write-Host "SBPF v0 (legacy) program"; return }
  $feature = $script:LadleSbpfFeature[$v]
  if (-not $feature) { throw "unknown SBPF version $v in $So" }
  $r = Invoke-Native { solana feature status $feature --url $Url }
  if ($r.Out -notmatch "active since") { throw "the cluster does not accept SBPF v$v programs (feature $feature): $(Hide-UrlIn $r.Out $Url)" }
  Write-Host "SBPF v$v program; the cluster accepts it (feature $feature active)"
}

# $true when the deployed program's bytes are the local .so, $false when they
# differ, $null when the program account does not exist (the cluster said so).
# Throws when the program cannot be read: an RPC error must never look like
# "not deployed" (a script would then offer a fresh deploy over a live program).
function Test-ProgramMatchesSo([string]$ProgramId, [string]$So, [string]$Url) {
  if ($null -eq (Get-AccountInfo $ProgramId $Url)) { return $null }
  $tmp = Join-Path $env:TEMP ("ladle-dump-" + [guid]::NewGuid().ToString("N") + ".so")
  $r = Invoke-Native { solana program dump $ProgramId $tmp --url $Url }
  if ($r.Code -ne 0 -or -not (Test-Path $tmp)) {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    throw "program $ProgramId exists on $(Hide-Url $Url) but its bytes could not be read (rerun when the RPC answers): $(Hide-UrlIn $r.Out $Url)"
  }
  try {
    $local = [IO.File]::ReadAllBytes($So)
    $remote = [IO.File]::ReadAllBytes($tmp)
    if ($remote.Length -lt $local.Length) { return $false }
    $sha = [Security.Cryptography.SHA256]::Create()
    $a = [BitConverter]::ToString($sha.ComputeHash($local))
    $b = [BitConverter]::ToString($sha.ComputeHash($remote, 0, $local.Length))
    if ($a -ne $b) { return $false }
    for ($i = $local.Length; $i -lt $remote.Length; $i++) { if ($remote[$i] -ne 0) { return $false } }
    return $true
  } finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
}

function Wait-ForLamports([string]$Address, [int64]$Need, [string]$Url, [string]$What) {
  while ($true) {
    $have = Get-Lamports $Address $Url
    if ($have -ge $Need) { return $have }
    Write-Host ("waiting for {0} SOL more on {1} ({2}): has {3}, needs {4}. Ctrl+C to stop." -f (Format-Sol ($Need - $have)), $Address, $What, (Format-Sol $have), (Format-Sol $Need))
    Start-Sleep -Seconds 15
  }
}

# KEY=value lines, LF and no BOM: systemd's EnvironmentFile would keep a CR in
# every value, and Next's dotenv would read a BOM into the first key.
function Write-EnvFile([string]$Path, [string[]]$Lines) {
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  [IO.File]::WriteAllText($Path, (($Lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
}

function New-RandomHex([int]$Bytes) {
  $b = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([BitConverter]::ToString($b) -replace "-", "").ToLowerInvariant()
}

# Run one of the keeper package's TypeScript tools (keeper/src/...).
function Invoke-KeeperTool([string]$Script, [string[]]$ToolArgs) {
  Push-Location $script:LadleRoot
  try {
    # Out-Host: the tool prints to the console, the function returns only the exit code
    & node --experimental-strip-types --no-warnings (Join-Path "keeper\src" $Script) @ToolArgs | Out-Host
    return $LASTEXITCODE
  } finally { Pop-Location }
}

# Program id: the keypair in target/deploy, declare_id! and the SDK must agree.
function Assert-ProgramId([string]$ProgramKeypair) {
  $id = Get-Address $ProgramKeypair
  $lib = Get-Content (Join-Path $script:LadleRoot "programs\ladle\src\lib.rs") -Raw
  $pda = Get-Content (Join-Path $script:LadleRoot "sdk\src\pda.ts") -Raw
  if ($lib -notmatch [regex]::Escape("declare_id!(""$id"")")) { throw "programs/ladle/src/lib.rs declare_id! is not $id (the program keypair)" }
  if ($pda -notmatch [regex]::Escape("PULLED_PROGRAM_ID = new PublicKey(""$id"")")) { throw "sdk/src/pda.ts PULLED_PROGRAM_ID is not $id (the program keypair)" }
  return $id
}

# A market already recorded for this cluster was created against one treasury:
# the build and the keeper must keep using that one.
function Assert-DeploymentTreasury([string]$DeploymentFile, [string]$Treasury) {
  if (-not (Test-Path $DeploymentFile)) { return }
  $recorded = (Get-Content $DeploymentFile -Raw | ConvertFrom-Json).treasury
  if ($recorded -and $recorded -ne $Treasury) {
    throw "$DeploymentFile records the treasury $recorded, not ${Treasury}: rerun with -Treasury $recorded, or move that file away to create a new market"
  }
}

# docs/DEPLOY.md "Build": cargo build-sbf --tools-version v1.57 --arch v3, the
# treasury from LADLE_TREASURY (unset = the devnet key).
function Invoke-ProgramBuild([string]$Treasury) {
  $prev = $env:LADLE_TREASURY
  if ($Treasury -and $Treasury -ne $script:LadleDevnetTreasury) { $env:LADLE_TREASURY = $Treasury }
  else { Remove-Item Env:LADLE_TREASURY -ErrorAction SilentlyContinue }
  Push-Location (Join-Path $script:LadleRoot "programs\ladle")
  try {
    cargo build-sbf --tools-version v1.57 --arch v3
    if ($LASTEXITCODE -ne 0) { throw "cargo build-sbf failed" }
  } finally {
    Pop-Location
    if ($null -eq $prev) { Remove-Item Env:LADLE_TREASURY -ErrorAction SilentlyContinue } else { $env:LADLE_TREASURY = $prev }
  }
}

# The built .so must embed the program id and the treasury given, and nothing
# else as treasury (the devnet key when another one was asked for).
function Assert-BuildEmbeds([string]$So, [string]$ProgramId, [string]$Treasury) {
  if (-not (Test-Path $So)) { throw "$So is missing: build first" }
  if (-not (Test-FileContainsKey $So $ProgramId)) { throw "$So does not contain the program id $ProgramId" }
  if (-not (Test-FileContainsKey $So $Treasury)) { throw "$So was not built with the treasury $Treasury (LADLE_TREASURY): rebuild" }
  if ($Treasury -ne $script:LadleDevnetTreasury -and (Test-FileContainsKey $So $script:LadleDevnetTreasury)) {
    throw "$So still contains the devnet treasury $($script:LadleDevnetTreasury): rebuild with LADLE_TREASURY=$Treasury"
  }
  Write-Host "build ok: $So embeds program $ProgramId and treasury $Treasury"
}

# Type a word to go on (the scripts that spend SOL ask before each step).
# -Yes on a script sets LadleAssumeYes: the owner said yes once, in the
# desktop launcher that runs it, to every step it lists; each step is still printed.
$script:LadleAssumeYes = $false
function Confirm-Step([string]$Word, [string]$Question) {
  if ($script:LadleAssumeYes) { Write-Host "$Question -> $Word (confirmed in the launcher)"; return }
  # the word itself is the consent, not its case
  $answer = Read-Host "$Question Type $Word to continue"
  if ($answer.Trim() -ne $Word) { throw "stopped at '$Word': nothing more was sent. Run it again and type $Word" }
}

# A dated copy of every key in .config\ladle, next to it on this PC
# (%USERPROFILE%\Ladle-sauvegarde-cles, outside any synced folder): against a
# deleted or overwritten file. A USB copy kept apart is still the real backup.
function Backup-LadleKeys {
  $dest = Join-Path $env:USERPROFILE ("Ladle-sauvegarde-cles\" + (Get-Date -Format "yyyy-MM-dd_HH-mm-ss"))
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $script:LadleKeyDir "*") $dest -Recurse
  Write-Host "keys copied to $dest"
  return $dest
}

# Run a native command that talks to $Url, show its output with the URL (and
# its key) replaced by its host, and return its exit code. The Solana CLI
# repeats the URL when a request fails (reqwest: "error sending request for
# url (...?api-key=...)"): never print it as it is.
function Invoke-Scrubbed([scriptblock]$Block, [string]$Url) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { & $Block 2>&1 | ForEach-Object { Write-Host (Hide-UrlIn "$_" $Url) }; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $prev }
  return $code
}

# The wind-down build (programs/ladle "wind-down" feature: no new market,
# round or entry; the 7-day notice, force_exit, close_market), with the
# treasury the deployed program was built with (its in-flight rounds still
# finalize), into target\wind-down\ladle.so. target\deploy\ladle.so (the
# normal build) is left as it is. cargo-build-sbf writes a fresh, unused
# keypair next to an --sbf-out-dir .so: it is deleted (the program id is
# target\deploy\ladle-keypair.json, never that one).
function Invoke-WindDownBuild([string]$Treasury) {
  $prev = $env:LADLE_TREASURY
  if ($Treasury -and $Treasury -ne $script:LadleDevnetTreasury) { $env:LADLE_TREASURY = $Treasury }
  else { Remove-Item Env:LADLE_TREASURY -ErrorAction SilentlyContinue }
  $out = Join-Path $script:LadleRoot "target\wind-down"
  Push-Location (Join-Path $script:LadleRoot "programs\ladle")
  try {
    cargo build-sbf --tools-version v1.57 --arch v3 --features wind-down --sbf-out-dir $out
    if ($LASTEXITCODE -ne 0) { throw "cargo build-sbf --features wind-down failed" }
  } finally {
    Pop-Location
    Remove-Item (Join-Path $out "ladle-keypair.json") -ErrorAction SilentlyContinue
    if ($null -eq $prev) { Remove-Item Env:LADLE_TREASURY -ErrorAction SilentlyContinue } else { $env:LADLE_TREASURY = $prev }
  }
  return (Join-Path $out "ladle.so")
}

# Bytes the deployed program's data account holds for the program (its
# "Data Length"): an upgrade's .so must fit in it (the program was deployed
# with --max-len = its .so size), or `solana program extend` must come first.
function Get-ProgramDataLength([string]$ProgramId, [string]$Url) {
  $r = Invoke-Native { solana program show $ProgramId --url $Url }
  if ($r.Code -ne 0) { throw "solana program show $ProgramId failed: $(Hide-UrlIn $r.Out $Url)" }
  $m = [regex]::Match($r.Out, 'Data Length: (\d+)')
  if (-not $m.Success) { throw "solana program show $ProgramId printed no data length" }
  return [int64]$m.Groups[1].Value
}
