# 올림픽공원 주변 버스 정류장 위치 받기 (Overpass API). 요청문: osm\query-bus.overpassql
param([string]$Out = "$PSScriptRoot\osm\overpass-bus.json")
$query = "$PSScriptRoot\osm\query-bus.overpassql"
$tmp = "$Out.tmp"
$wait = 10
for ($try = 1; $try -le 4; $try++) {
  foreach ($h in 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter') {
    curl.exe -sS -m 60 -A "park-3d-prototype/0.1" --data-urlencode "data@$query" $h -o $tmp
    if ((Test-Path $tmp) -and (Select-String -Path $tmp -Pattern '"version"' -Quiet)) {
      Move-Item $tmp $Out -Force
      "OK $h (try $try) $((Get-Item $Out).Length) bytes"
      exit 0
    }
  }
  "try $try failed, waiting $wait s"
  Start-Sleep -Seconds $wait
  $wait = $wait * 2
}
Remove-Item $tmp -ErrorAction SilentlyContinue
"FAILED"
exit 1

