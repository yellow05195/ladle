# The owner's Helius key, for the OWNER to paste (desktop "Ajouter ma cle Helius.cmd"): it never goes
# through a chat or a command line. It is checked against mainnet, saved to
# %USERPROFILE%\.config\ladle\helius-rpc.txt (the keeper on this PC reads it: scripts\keeper-mainnet-local.cmd),
# and set as LADLE_RPC_UPSTREAM, a server-only secret of the Vercel project: the site's relay app/api/rpc
# calls it, no browser ever sees it. The next production deploy uses it.
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ladle-common.ps1")
$raw = (Read-Host "Colle ta cle API Helius (ou l'URL https://mainnet.helius-rpc.com/?api-key=...) puis Entree").Trim()
if (-not $raw) { throw "rien de colle: rien n'a change" }
$url = if ($raw -match '^https://') { $raw } elseif ($raw -match '^[A-Za-z0-9-]{20,}$') { "https://mainnet.helius-rpc.com/?api-key=$raw" } else { throw "ce n'est ni une cle Helius ni une URL https: rien n'a change" }
$body = '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}'
try { $res = Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $body -TimeoutSec 20 }
catch { throw "Helius refuse cette cle ($((Hide-UrlIn $_.Exception.Message $url))): rien n'a change" }
if ($res.result -ne "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") { throw "cette URL ne sert pas Solana mainnet (genesis $($res.result)): rien n'a change" }
Write-EnvFile (Join-Path $script:LadleKeyDir "helius-rpc.txt") @($url)
Write-Host "cle verifiee (Solana mainnet) et enregistree pour le keeper de ce PC" -ForegroundColor Green
Push-Location $script:LadleRoot
try {
  $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  # the value on stdin, not on the command line (other processes can read a command line)
  $url | vercel env add LADLE_RPC_UPSTREAM production --sensitive --force --project ladle 2>&1 | ForEach-Object { Write-Host (Hide-UrlIn "$_" $url) }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
} finally { Pop-Location }
if ($code -ne 0) { throw "Vercel n'a pas pris la cle (le keeper de ce PC l'utilise quand meme)" }
Write-Host "cle ajoutee au site (Vercel, secret serveur). Claude s'occupe du reste." -ForegroundColor Green
