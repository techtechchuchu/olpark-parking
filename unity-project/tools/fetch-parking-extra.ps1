# 올림픽공원 일대의 주차 관련 요소를 종류 가리지 않고 받기 (점·선·관계, 지하주차장, 주차장 입구 포함)
# 요청문은 osm\query-parking-all.overpassql 에 있다 (따옴표 문제를 피하려고 파일로 넘긴다).
param([string]$Out = "$PSScriptRoot\osm\overpass-parking-all.json")
$query = "$PSScriptRoot\osm\query-parking-all.overpassql"
$tmp = "$Out.tmp"
$wait = 10
for ($try = 1; $try -le 5; $try++) {
  foreach ($h in 'https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter') {
    curl.exe -sS -m 90 -A "park-3d-prototype/0.1" --data-urlencode "data@$query" $h -o $tmp
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
