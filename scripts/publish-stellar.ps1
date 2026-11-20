[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$VerifiedCommit,
  [string]$Node = 'node',
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = 'star-strike-rush'
$site = 'stellar-rebels'
$target = 'stellar'
$cli = Join-Path $repo 'node_modules/firebase-tools/lib/bin/firebase.js'

Push-Location $repo
try {
  $head = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -ne $VerifiedCommit -or (git status --porcelain=v1).Length) {
    throw 'Use a clean checkout of the tested revision.'
  }
  $map = Get-Content .firebaserc -Raw | ConvertFrom-Json
  $config = Get-Content firebase.stellar.json -Raw | ConvertFrom-Json
  if (($map.targets.$project.hosting.$target -join ',') -ne $site -or
      @($config.PSObject.Properties).Count -ne 1 -or $config.hosting.target -ne $target -or
      $config.hosting.public -ne 'dist-stellar' -or $config.hosting.predeploy -or $config.hosting.postdeploy) {
    throw 'Unexpected Stellar Rebels Hosting configuration.'
  }
  $metadata = Get-Content dist-stellar/version.json -Raw | ConvertFrom-Json
  if ($metadata.dirty -or $metadata.commitSha -ne $head -or $metadata.hostingSite -ne $site -or
      $metadata.assetVersion -notmatch '^[a-f0-9]{15}$' -or $metadata.packBytes -gt 12582912) {
    throw 'The web artifact must match the tested commit and fit the 12 MiB flight pack limit.'
  }
  $packDir = Join-Path $repo ("dist-stellar/arcade/" + $metadata.assetVersion)
  if (-not (Test-Path -LiteralPath (Join-Path $packDir 'app.mjs'))) { throw 'The tested asset pack is missing.' }
  if ($CheckOnly) {
    Write-Output "Verified local Hosting scope and artifact $head / $($metadata.assetVersion)."
    return
  }
  if (-not (Test-Path -LiteralPath $cli)) { throw 'Install the locked Firebase CLI with npm ci.' }
  $availability = & $Node $cli hosting:sites:list --project $project --json
  if ($LASTEXITCODE -ne 0) { throw 'Authenticated Firebase Hosting site verification failed.' }
  $expected = "projects/$project/sites/$site"
  $matching = @((($availability -join "`n") | ConvertFrom-Json).result.sites |
    Where-Object { $_.name -eq $expected -and $_.defaultUrl -eq "https://$site.web.app" })
  if ($matching.Count -ne 1) { throw "Target site $expected could not be verified." }
  & $Node $cli deploy --config firebase.stellar.json --project $project --only "hosting:$target" --non-interactive
  if ($LASTEXITCODE -ne 0) { throw 'Stellar Rebels Hosting deployment failed.' }
  for ($try = 0; $try -lt 12; $try++) {
    try {
      $live = Invoke-RestMethod -Uri "https://$site.web.app/version.json" -TimeoutSec 6
      if (-not $live.dirty -and $live.commitSha -eq $head -and $live.fingerprint -eq $metadata.fingerprint) {
        Write-Output "Verified deployed revision $head / $($live.assetVersion) at https://$site.web.app/."
        return
      }
    } catch { Write-Verbose $_.Exception.Message }
    Start-Sleep -Seconds 2
  }
  throw 'The hosted version does not match the exact candidate. Check the live site and restore the previous release if needed.'
} finally {
  Pop-Location
}
