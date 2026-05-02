param(
  [string]$ComposeFile = "ops/docker-compose.ops.yml",
  [string]$EnvFile = "ops/.env.ops",
  [string]$OutDir = "ops/backups/n8n"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir "n8n-db-$stamp.dump"

docker compose -f $ComposeFile --env-file $EnvFile exec -T n8n-db `
  pg_dump -U n8n -d n8n --format=custom --no-owner --no-acl |
  Set-Content -Encoding Byte -Path $outFile

Write-Host "Wrote $outFile"
