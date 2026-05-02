param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile,
  [string]$ComposeFile = "ops/docker-compose.ops.yml",
  [string]$EnvFile = "ops/.env.ops"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

Get-Content -Encoding Byte -LiteralPath $DumpFile |
  docker compose -f $ComposeFile --env-file $EnvFile exec -T n8n-db `
    pg_restore -U n8n -d n8n --clean --if-exists --no-owner --no-acl

docker compose -f $ComposeFile --env-file $EnvFile exec -T n8n-db `
  psql -U n8n -d n8n -c "select count(*) as workflows from workflow_entity; select count(*) as credentials from credentials_entity;"
