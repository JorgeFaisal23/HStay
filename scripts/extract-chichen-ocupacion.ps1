# Limpia el Excel "CONTROL NUEVO" de CARCAR (Chichén 124 y 126) y genera el
# archivo que lee scripts/import-occupancy.ts. Cada corrección queda anotada en
# "warnings" de su fila. La salida tiene datos personales: va en
# docs/clientes/carcar/privado/ (ignorado por git).
#
#   powershell -File scripts/extract-chichen-ocupacion.ps1 -XlDir <xlsx descomprimido>\xl `
#     -Inventory scripts/carcar-inventory.json -OutFile docs/clientes/carcar/privado/chichen-ocupacion.json
param(
  [Parameter(Mandatory)] [string]$XlDir,      # carpeta xl/ del xlsx descomprimido
  [Parameter(Mandatory)] [string]$Inventory,  # scripts/carcar-inventory.json
  [Parameter(Mandatory)] [string]$OutFile
)

$ErrorActionPreference = 'Stop'

# ---------- leer Excel
[xml]$ss = Get-Content -Raw -Encoding UTF8 (Join-Path $XlDir 'sharedStrings.xml')
$strings = @()
foreach ($si in $ss.sst.si) { $strings += (($si.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText }) -join "") }
[xml]$sh = Get-Content -Raw -Encoding UTF8 (Join-Path $XlDir 'worksheets\sheet1.xml')

$rows = @()
foreach ($row in $sh.worksheet.sheetData.row) {
  $map = @{}
  foreach ($c in $row.c) {
    $v = $c.v
    if ($c.t -eq 's' -and $null -ne $v) { $v = $strings[[int]$v] }
    $col = ($c.r -replace '\d+', '')
    if ($null -ne $v) { $map[$col] = ("$v" -replace '\s+', ' ').Trim() }
  }
  $map['_row'] = [int]$row.r
  $rows += ,$map
}

# ---------- inventario actual (para validar unidad y renta)
$inv = Get-Content -Raw -Encoding UTF8 $Inventory | ConvertFrom-Json
$invRent = @{}
foreach ($u in $inv.longTermUnits) { $invRent["$($u.building)|$($u.code)"] = [double]$u.monthlyRent }

# ---------- utilidades
function Get-Dates([string]$text, [ref]$warnings, [string]$label) {
  $out = @()
  if ([string]::IsNullOrWhiteSpace($text)) { return $out }
  if ($text -match '^\d{5}$') {
    $out += [DateTime]::FromOADate([double]$text).ToString('yyyy-MM-dd')
    return $out
  }
  foreach ($m in [regex]::Matches($text, "(\d{1,2})[-/](\d{1,2})[-/'](\d{2,4})")) {
    $d = [int]$m.Groups[1].Value; $mo = [int]$m.Groups[2].Value; $y = [int]$m.Groups[3].Value
    if ($y -lt 100) { $y += 2000 }
    $last = [DateTime]::DaysInMonth($y, $mo)
    if ($d -gt $last) {
      $warnings.Value += "${label}: '$($m.Value)' no existe; se usó el $last del mismo mes (confirmar con el cliente)."
      $d = $last
    }
    $out += (Get-Date -Year $y -Month $mo -Day $d).ToString('yyyy-MM-dd')
  }
  return $out
}

$units = @()
$skipped = @()

foreach ($r in $rows) {
  if ($r['_row'] -eq 1) { continue }
  $label = $r['A']
  $warnings = @()

  if ($label -notmatch '^(.*)-(124|126)$') {
    $skipped += [ordered]@{ row = $r['_row']; label = $label; reason = 'No se identifica la torre (124/126) y la unidad no existe en el sistema.' }
    continue
  }
  $code = $Matches[1].Trim()
  $building = "CHICHEN $($Matches[2])"
  $key = "$building|$code"
  if (-not $invRent.ContainsKey($key)) {
    $skipped += [ordered]@{ row = $r['_row']; label = $label; reason = "La unidad $code no existe en $building." }
    continue
  }

  $name = $r['C']
  $start = $r['E']
  if ($start -eq 'NO ADM') {
    $skipped += [ordered]@{ row = $r['_row']; label = $label; reason = 'Marcada como NO ADM (no administrada).' }
    continue
  }

  # ---------- servicio de luz (CFE), lo paga el inquilino
  $electricity = $null
  $meter = $r['I']
  if ($meter) {
    $num = ([regex]::Match($meter, '\d{9,}')).Value
    $rest = ($meter -replace '\d{9,}', '').Trim()
    $note = $null
    $heater = $rest -match 'CALENTADOR'
    $sharedWith = $null
    if ($rest -match '(UNIDO|JUNTO)\s*(.*)') {
      $sharedWith = ($Matches[2] -replace 'CALENTADOR', '').Trim()
      $note = "Medidor compartido con $sharedWith."
    }
    if ($heater) { $note = "$note Incluye calentador.".Trim() }
    $electricity = [ordered]@{ serviceNumber = $(if ($num) { $num } else { $null }); sharedWith = $sharedWith; note = $note; source = $meter }
  }

  # ---------- ocupación
  $occupancy = $null
  $vacant = (-not $name) -or $name -eq 'VACIO' -or $name -eq 'OFICINA'
  if (-not $vacant) {
    $starts = @(Get-Dates $start ([ref]$warnings) 'Inicio')
    $ends = @(Get-Dates $r['F'] ([ref]$warnings) 'Fin')
    if ($starts.Count -eq 0 -or $ends.Count -eq 0) {
      $skipped += [ordered]@{ row = $r['_row']; label = $label; reason = 'Fechas de contrato ilegibles.' }
      continue
    }
    $leaseNotes = @()
    if ($ends.Count -gt 1) { $leaseNotes += "Renovaciones según el Excel: '$($r['F'])'." }

    $rentText = $r['H']
    $rent = [double](([regex]::Match($rentText, '[\d,]+(\.\d+)?')).Value -replace ',', '')
    if ($rentText -match 'IVA') { $leaseNotes += 'Renta con IVA incluido.' }
    if ($rent -ne $invRent[$key]) {
      $warnings += "Renta del Excel ($rent) distinta a la del sistema ($($invRent[$key]))."
    }

    $payDay = [int]$r['G']

    $occupancy = [ordered]@{
      tenant = [ordered]@{ name = ($name -replace '\s+', ' ').Trim(); phone = $r['D']; email = $null }
      lease = [ordered]@{
        startDate = $starts[0]
        endDate = $ends[$ends.Count - 1]
        rentAmount = $rent
        paymentDay = $payDay
        notes = $(if ($leaseNotes.Count) { $leaseNotes -join ' ' } else { $null })
      }
    }
  }

  $units += [ordered]@{
    sourceRow = $r['_row']
    building = $building
    unitCode = $code
    occupancy = $occupancy
    electricity = $electricity
    warnings = $warnings
  }
}

# ---------- medidores "JUNTO DEP 8": sin número propio, se toma el de la unidad indicada
foreach ($u in $units) {
  $e = $u.electricity
  if ($e -and -not $e.serviceNumber -and $e.sharedWith) {
    $other = $units | Where-Object { $_.building -eq $u.building -and $_.unitCode -eq $e.sharedWith -and $_.electricity.serviceNumber } | Select-Object -First 1
    if ($other) {
      $e.serviceNumber = $other.electricity.serviceNumber
    } else {
      $u.warnings += "Medidor '$($e.source)' sin número y no se encontró la unidad $($e.sharedWith)."
    }
  }
}

$payload = [ordered]@{
  source = 'CONTROL_NUEVO_PARA_ENVIAR.xlsx (Chichén 124 y 126)'
  generatedAt = (Get-Date).ToString('yyyy-MM-dd')
  organization = 'CARCAR'
  units = $units
  skipped = $skipped
}

$json = $payload | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($OutFile, $json, (New-Object Text.UTF8Encoding($false)))
"Unidades: $($units.Count) | con inquilino: $(@($units | Where-Object { $_.occupancy }).Count) | omitidas: $($skipped.Count)"

