# 올림픽공원 경계·몽촌호·평화의문 등 관계(relation) 윤곽 받기 (Overpass API)
# 서버가 혼잡하면 간격을 늘려가며 몇 번 더 시도한다.
param([string]$Out = "$PSScriptRoot\osm\overpass-relations.json")
$q = 'data=[out:json][timeout:60];relation(id:6185423,6968154,16563734,9229376,8679966);out geom;'
$tmp = "$Out.tmp"
$wait = 15
for ($try = 1; $try -le 6; $try++) {
  foreach ($h in 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter') {
    curl.exe -sS -m 90 -A "park-3d-prototype/0.1" --data-urlencode $q $h -o $tmp
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
