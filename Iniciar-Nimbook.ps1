# ============================================================================
#  Iniciar-Nimbook.ps1 — servidor local mínimo para NimbookGR (sin instalar nada)
#  Abre http://localhost:8080/ en el navegador. Cierra la ventana para parar.
# ============================================================================
$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }

$listener = $null
$port = 8080
for ($p = 8080; $p -lt 8120; $p++) {
    try {
        $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
        $candidate.Start()
        $listener = $candidate
        $port = $p
        break
    } catch { }
}
if (-not $listener) {
    Write-Host "No se pudo abrir un puerto libre entre 8080 y 8119." -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

$url = "http://localhost:$port/"
Write-Host ""
Write-Host "  NimbookGR se está ejecutando en  $url" -ForegroundColor Cyan
Write-Host "  Deja esta ventana abierta mientras usas la página." -ForegroundColor DarkGray
Write-Host "  Pulsa Ctrl+C (o cierra la ventana) para detener el servidor." -ForegroundColor DarkGray
Write-Host ""
if (-not $env:NIMBOOK_NO_BROWSER) { Start-Process $url }

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
    '.woff2' = 'font/woff2'
}

function Send-Response {
    param($stream, [int]$status, [string]$type, [byte[]]$body)
    $reason = if ($status -eq 200) { 'OK' } elseif ($status -eq 404) { 'Not Found' } else { 'Error' }
    $head = "HTTP/1.1 $status $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
    $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($headBytes, 0, $headBytes.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
}

while ($true) {
    $client = $null
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
        while ($true) {
            $headerLine = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($headerLine)) { break }
        }

        $parts = $requestLine.Split(' ')
        $method = $parts[0]
        $target = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
        $path = $target.Split('?')[0]
        $path = [System.Uri]::UnescapeDataString($path)
        if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }

        $relative = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $file = Join-Path $root $relative
        $resolved = [System.IO.Path]::GetFullPath($file)
        if (-not $resolved.StartsWith([System.IO.Path]::GetFullPath($root), [System.StringComparison]::OrdinalIgnoreCase)) {
            Send-Response $stream 404 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('403'))
            continue
        }

        if (Test-Path -LiteralPath $resolved -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($resolved)
            $ext = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
            $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            if ($method -eq 'HEAD') { Send-Response $stream 200 $type ([byte[]]@()) }
            else { Send-Response $stream 200 $type $bytes }
        } else {
            $body = [System.Text.Encoding]::UTF8.GetBytes("No encontrado: $path")
            Send-Response $stream 404 'text/plain; charset=utf-8' $body
        }
    } catch {
        # conexión cancelada por el navegador: se ignora
    } finally {
        if ($client) { try { $client.Close() } catch { } }
    }
}
