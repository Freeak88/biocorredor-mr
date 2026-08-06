param(
  [int]$Partido = 3,
  [string]$Capa = '110101',
  [string]$OutputRoot = 'data/geoarba'
)

$ErrorActionPreference = 'Stop'
$url = "https://geo.arba.gov.ar/datoabierto/datos/$Partido/$Capa"
$rawDir = Join-Path $OutputRoot 'raw'
$extractDir = Join-Path $OutputRoot 'almirante-brown-parcelas'
$archive = Join-Path $rawDir ("{0}_{1}.tar.gz" -f $Partido, $Capa)

New-Item -ItemType Directory -Force $rawDir, $extractDir | Out-Null
Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
tar -xzf $archive -C $extractDir

$hash = Get-FileHash $archive -Algorithm SHA256
Write-Output "Descargado: $url"
Write-Output "Archivo: $archive"
Write-Output "SHA256: $($hash.Hash)"
Write-Output "Extraccion: $extractDir"
