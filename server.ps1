$ErrorActionPreference = "Stop"

$port = if ($args.Count -gt 0) { [int]$args[0] } else { 8090 }
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$port/"
$dataRoot = Join-Path $root "data"
$cmsRoot = Join-Path $dataRoot "cms"
$uploadRoot = Join-Path $root "uploads"
$sessionSecret = if ($env:ADMIN_SESSION_SECRET) { $env:ADMIN_SESSION_SECRET } else { "local-preview-session-secret" }
$adminUser = if ($env:ADMIN_USER) { $env:ADMIN_USER } else { "admin" }
$adminPassword = if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { "admin123" }

Add-Type -AssemblyName System.Web
[System.IO.Directory]::CreateDirectory($cmsRoot) | Out-Null
[System.IO.Directory]::CreateDirectory($uploadRoot) | Out-Null

function Ensure-JsonFile($relativePath, $defaultJson) {
  $path = Join-Path $root $relativePath
  $dir = Split-Path -Parent $path
  [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Set-Content -LiteralPath $path -Encoding UTF8 -Value $defaultJson
  }
}

Ensure-JsonFile "data\cms\enquiries.json" "[]"
Ensure-JsonFile "data\cms\audit-logs.json" "[]"
Ensure-JsonFile "data\cms\analytics-events.json" "[]"
Ensure-JsonFile "data\cms\settings.json" (@{
  companyName = "Quzhou Qiying Import & Export Co., Ltd."
  brandName = "Cowinmagnet"
  globalWebsite = "https://www.cowinmagnet.com"
  africaWebsite = "http://localhost:$port/en-za/"
  email = "davidsha@cowinmagnet.com"
  whatsapp = "+86 156 6513 5205"
  defaultLanguage = "en-za"
  supportedLanguages = @("en-za","af-za","zu-za","xh-za","st-za","tn-za")
  marketCoverage = @("South Africa","Botswana","Namibia","Zimbabwe","Zambia","Mozambique","Angola","Ghana","Nigeria","Kenya","Tanzania","Democratic Republic of the Congo")
  updatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 8)

function Read-Json($relativePath) {
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return $raw | ConvertFrom-Json
}

function Read-JsonArray($relativePath) {
  $path = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return @() }
  $raw = (Get-Content -LiteralPath $path -Raw -Encoding UTF8).Trim()
  if ([string]::IsNullOrWhiteSpace($raw) -or $raw -eq "[]") { return @() }
  $items = $raw | ConvertFrom-Json
  if (-not $items) { return @() }
  return @($items | Where-Object { $_ -and $_.PSObject.Properties.Name -notcontains "value" })
}

function Write-Json($relativePath, $value) {
  $path = Join-Path $root $relativePath
  $dir = Split-Path -Parent $path
  [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  ConvertTo-Json -InputObject $value -Depth 20 | Set-Content -LiteralPath $path -Encoding UTF8
}

function Send-Json($context, $statusCode, $value) {
  $json = $value | ConvertTo-Json -Depth 20
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode = $statusCode
  $context.Response.ContentType = "application/json; charset=utf-8"
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}

function Read-BodyJson($context) {
  $reader = New-Object System.IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
  $body = $reader.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($body)) { return [pscustomobject]@{} }
  return $body | ConvertFrom-Json
}

function New-Token($length = 32) {
  $bytes = New-Object byte[] $length
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
}

function Hash-Text($text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
}

function Get-Session($context) {
  $cookie = $context.Request.Cookies["cowin_admin_session"]
  if (-not $cookie) { return $null }
  $parts = $cookie.Value.Split(".")
  if ($parts.Count -ne 3) { return $null }
  $payloadText = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[0].Replace("-","+").Replace("_","/").PadRight($parts[0].Length + ((4 - $parts[0].Length % 4) % 4), "=")))
  $expected = Hash-Text "$($parts[0]).$sessionSecret"
  if ($expected -ne $parts[1]) { return $null }
  $payload = $payloadText | ConvertFrom-Json
  if ([DateTime]::Parse($payload.expiresAt).ToUniversalTime() -lt (Get-Date).ToUniversalTime()) { return $null }
  return $payload
}

function New-SessionCookie($csrf) {
  $payload = @{ user = $adminUser; role = "Super Admin"; csrf = $csrf; expiresAt = (Get-Date).ToUniversalTime().AddHours(8).ToString("o") } | ConvertTo-Json -Compress
  $payload64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payload)).TrimEnd("=").Replace("+","-").Replace("/","_")
  $sig = Hash-Text "$payload64.$sessionSecret"
  $cookie = New-Object System.Net.Cookie("cowin_admin_session", "$payload64.$sig.v1", "/", "localhost")
  $cookie.HttpOnly = $true
  try { $cookie.SameSite = [System.Net.SameSiteMode]::Strict } catch {}
  return $cookie
}

function Require-Admin($context) {
  $session = Get-Session $context
  if (-not $session) {
    Send-Json $context 401 @{ success = $false; error = "Unauthorized"; requestId = (New-Token 8) }
    return $null
  }
  if ($context.Request.HttpMethod -notin @("GET","HEAD")) {
    $csrf = $context.Request.Headers["X-CSRF-Token"]
    if (-not $csrf -or $csrf -ne $session.csrf) {
      Send-Json $context 403 @{ success = $false; error = "CSRF validation failed"; requestId = (New-Token 8) }
      return $null
    }
  }
  return $session
}

function Add-AuditLog($user, $action, $object, $objectId, $summary) {
  $logs = @(Read-JsonArray "data\cms\audit-logs.json")
  $logs += [pscustomobject]@{
    id = New-Token 10
    user = $user
    action = $action
    object = $object
    objectId = $objectId
    summary = $summary
    time = (Get-Date).ToUniversalTime().ToString("o")
    ip = "local-preview"
  }
  Write-Json "data\cms\audit-logs.json" ($logs | Select-Object -Last 500)
}

function Get-AnalyticsSummary() {
  $events = @(Read-JsonArray "data\cms\analytics-events.json")
  $pageviews = @($events | Where-Object eventType -eq "pageview")
  $visitors = @($pageviews | Group-Object clientId)
  $countries = @($pageviews | Group-Object country | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ name=$_.Name; count=$_.Count } })
  $pages = @($pageviews | Group-Object page | Sort-Object Count -Descending | Select-Object -First 20 | ForEach-Object { [pscustomobject]@{ page=$_.Name; views=$_.Count } })
  $sources = @($pageviews | Group-Object source | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ source=$_.Name; views=$_.Count } })
  return [pscustomobject]@{
    pv = $pageviews.Count
    uv = $visitors.Count
    events = $events.Count
    countries = $countries
    pages = $pages
    sources = $sources
    visitors = @($pageviews | Sort-Object time -Descending | Select-Object -First 200)
    lastSync = (Get-Date).ToString("yyyy/MM/dd HH:mm:ss")
  }
}

function Handle-Api($context, $path) {
  $method = $context.Request.HttpMethod
  if ($path -eq "/api/login" -and $method -eq "POST") {
    $body = Read-BodyJson $context
    if ($body.username -eq $adminUser -and $body.password -eq $adminPassword) {
      $csrf = New-Token 24
      $context.Response.Cookies.Add((New-SessionCookie $csrf))
      Add-AuditLog $adminUser "Login" "Session" "local" "Admin signed in to local preview CMS"
      Send-Json $context 200 @{ success = $true; data = @{ user = $adminUser; role = "Super Admin"; csrf = $csrf }; requestId = (New-Token 8) }
      return $true
    }
    Send-Json $context 401 @{ success = $false; error = "Invalid username or password"; requestId = (New-Token 8) }
    return $true
  }
  if ($path -eq "/api/session" -and $method -eq "GET") {
    $session = Get-Session $context
    if ($session) { Send-Json $context 200 @{ success=$true; data=@{ user=$session.user; role=$session.role; csrf=$session.csrf }; requestId=(New-Token 8) } }
    else { Send-Json $context 401 @{ success=$false; error="Unauthorized"; requestId=(New-Token 8) } }
    return $true
  }
  if ($path -eq "/api/logout" -and $method -eq "POST") {
    $context.Response.Cookies.Add((New-Object System.Net.Cookie("cowin_admin_session", "", "/", "localhost")))
    Send-Json $context 200 @{ success=$true; data=@{ loggedOut=$true }; requestId=(New-Token 8) }
    return $true
  }
  if ($path -eq "/api/enquiries" -and $method -eq "POST") {
    $body = Read-BodyJson $context
    if (-not $body.name -or -not $body.email) {
      Send-Json $context 400 @{ success=$false; error="Name and email are required"; requestId=(New-Token 8) }
      return $true
    }
    if ($body.email -notmatch "^[^\s@]+@[^\s@]+\.[^\s@]+$") {
      Send-Json $context 400 @{ success=$false; error="Valid email is required"; requestId=(New-Token 8) }
      return $true
    }
    $items = @(Read-JsonArray "data\cms\enquiries.json")
    $id = "ENQ-" + (Get-Date -Format "yyyyMMddHHmmss") + "-" + (New-Token 4)
    $record = [pscustomobject]@{
      id = $id
      name = [string]$body.name
      company = [string]$body.company
      country = [string]$body.country
      region = [string]$body.region
      email = [string]$body.email
      whatsapp = [string]$body.whatsapp
      preferredLanguage = [string]$body.preferredLanguage
      product = [string]$body.productRequired
      industry = [string]$body.industry
      sourcePage = [string]$body.sourcePage
      payload = $body
      status = "New"
      assignedUser = ""
      internalNotes = @()
      submissionTime = (Get-Date).ToUniversalTime().ToString("o")
      utm = [pscustomobject]@{}
    }
    $items += $record
    Write-Json "data\cms\enquiries.json" $items
    Add-AuditLog "public-form" "Enquiry Created" "Enquiry" $id "New website inquiry saved from $($record.sourcePage)"
    Send-Json $context 200 @{ success=$true; data=$record; requestId=(New-Token 8) }
    return $true
  }
  if ($path -eq "/api/track" -and $method -eq "POST") {
    $body = Read-BodyJson $context
    $events = @(Read-JsonArray "data\cms\analytics-events.json")
    $clientId = if ($body.clientId) { [string]$body.clientId } else { "C" + (New-Token 4) }
    $referer = if ($context.Request.UrlReferrer) { [string]$context.Request.UrlReferrer } else { [string]$body.referrer }
    $source = if ($referer -match "google|bing|yahoo|duckduckgo") { "Search" } elseif ($referer -match "linkedin|facebook|tiktok|twitter|x\.com") { "Social" } elseif ($referer) { "Referral" } else { "Direct" }
    $record = [pscustomobject]@{
      id = New-Token 10
      eventType = if ($body.eventType) { [string]$body.eventType } else { "pageview" }
      time = (Get-Date).ToUniversalTime().ToString("o")
      clientId = $clientId
      country = if ($body.country) { [string]$body.country } else { "Unknown" }
      device = if ($body.device) { [string]$body.device } else { "Desktop" }
      browser = if ($body.browser) { [string]$body.browser } else { "Browser" }
      source = $source
      sourcePlatform = if ($source -eq "Direct") { "Direct entry" } else { "External" }
      sourceDetail = if ($referer) { $referer } else { "No referrer or UTM" }
      page = if ($body.page) { [string]$body.page } else { "/" }
      ip = $context.Request.RemoteEndPoint.Address.ToString()
      tag = if (@($events | Where-Object clientId -eq $clientId).Count -gt 0) { "Returning" } else { "New" }
      visitDay = (Get-Date).ToString("yyyy/MM/dd")
      userAgent = $context.Request.UserAgent
    }
    $events += $record
    Write-Json "data\cms\analytics-events.json" ($events | Select-Object -Last 5000)
    Send-Json $context 200 @{ success=$true; data=@{ id=$record.id; clientId=$clientId }; requestId=(New-Token 8) }
    return $true
  }

  if ($path.StartsWith("/api/admin/")) {
    $session = Require-Admin $context
    if (-not $session) { return $true }
    if ($path -eq "/api/admin/dashboard" -and $method -eq "GET") {
      $products = @(Read-JsonArray "data\products\products.json")
      $categories = @(Read-JsonArray "data\categories\categories.json")
      $industries = @(Read-JsonArray "data\industries\industries.json")
      $solutions = @(Read-JsonArray "data\solutions\solutions.json")
      $markets = @(Read-JsonArray "data\markets\markets.json")
      $articles = @(Read-JsonArray "data\articles\articles.json")
      $downloads = @(Read-JsonArray "data\downloads\downloads.json")
      $enquiries = @(Read-JsonArray "data\cms\enquiries.json")
      $analytics = Get-AnalyticsSummary
      $missingSeo = @($products | Where-Object { -not $_.seoTitle -or -not $_.seoDescription }).Count
      $missingImages = @($products | Where-Object { -not $_.image }).Count
      Send-Json $context 200 @{ success=$true; data=@{ pv=$analytics.pv; uv=$analytics.uv; products=$products.Count; publishedProducts=$products.Count; draftProducts=0; categories=$categories.Count; industries=$industries.Count; solutions=$solutions.Count; markets=$markets.Count; articles=$articles.Count; downloads=$downloads.Count; unreadEnquiries=@($enquiries | Where-Object status -eq "New").Count; missingSeo=$missingSeo; missingImages=$missingImages; languages=@("en-za","af-za","zu-za","xh-za","st-za","tn-za"); topPages=$analytics.pages; topSources=$analytics.sources; recentVisitors=@($analytics.visitors | Select-Object -First 8); recentEnquiries=@($enquiries | Select-Object -Last 5); recentLogs=@(Read-JsonArray "data\cms\audit-logs.json" | Select-Object -Last 8); lastSync=$analytics.lastSync }; requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/analytics" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=(Get-AnalyticsSummary); requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/products" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=@(Read-JsonArray "data\products\products.json"); requestId=(New-Token 8) }
      return $true
    }
    if ($path -match "^/api/admin/products/([^/]+)$" -and $method -eq "PUT") {
      $slug = [System.Web.HttpUtility]::UrlDecode($Matches[1])
      $body = Read-BodyJson $context
      $products = @(Read-JsonArray "data\products\products.json")
      $updated = $false
      for ($i = 0; $i -lt $products.Count; $i++) {
        if ($products[$i].slug -eq $slug) {
          foreach ($name in @("name","categorySlug","category","shortDescription","fullDescription","seoTitle","seoDescription","cleaning","layout","type","image")) {
            if ($body.PSObject.Properties.Name -contains $name) { $products[$i].$name = $body.$name }
          }
          if ($body.applications) { $products[$i].applications = @($body.applications) }
          if ($body.features) { $products[$i].features = @($body.features) }
          $products[$i] | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString("o") -Force
          $updated = $true
        }
      }
      if (-not $updated) { Send-Json $context 404 @{ success=$false; error="Product not found"; requestId=(New-Token 8) }; return $true }
      Write-Json "data\products\products.json" $products
      Add-AuditLog $session.user "Product Updated" "Product" $slug "Product content edited in local CMS"
      Send-Json $context 200 @{ success=$true; data=@{ slug=$slug }; requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/enquiries" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=@(Read-JsonArray "data\cms\enquiries.json"); requestId=(New-Token 8) }
      return $true
    }
    if ($path -match "^/api/admin/enquiries/([^/]+)$" -and $method -eq "PUT") {
      $id = [System.Web.HttpUtility]::UrlDecode($Matches[1])
      $body = Read-BodyJson $context
      $items = @(Read-JsonArray "data\cms\enquiries.json")
      foreach ($item in $items) {
        if ($item.id -eq $id) {
          if ($body.status) { $item.status = [string]$body.status }
          if ($body.assignedUser) { $item.assignedUser = [string]$body.assignedUser }
          if ($body.note) {
            $notes = @($item.internalNotes)
            $notes += [pscustomobject]@{ note=[string]$body.note; user=$session.user; time=(Get-Date).ToUniversalTime().ToString("o") }
            $item.internalNotes = $notes
          }
        }
      }
      Write-Json "data\cms\enquiries.json" $items
      Add-AuditLog $session.user "Enquiry Status Changed" "Enquiry" $id "Enquiry updated in local CMS"
      Send-Json $context 200 @{ success=$true; data=@{ id=$id }; requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/settings" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=(Read-Json "data\cms\settings.json"); requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/settings" -and $method -eq "PUT") {
      $body = Read-BodyJson $context
      $body | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToUniversalTime().ToString("o") -Force
      Write-Json "data\cms\settings.json" $body
      Add-AuditLog $session.user "Settings Changed" "Settings" "site" "Site settings updated"
      Send-Json $context 200 @{ success=$true; data=$body; requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/audit-logs" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=@(Read-JsonArray "data\cms\audit-logs.json"); requestId=(New-Token 8) }
      return $true
    }
    if ($path -eq "/api/admin/content" -and $method -eq "GET") {
      Send-Json $context 200 @{ success=$true; data=@{ categories=@(Read-JsonArray "data\categories\categories.json"); industries=@(Read-JsonArray "data\industries\industries.json"); solutions=@(Read-JsonArray "data\solutions\solutions.json"); markets=@(Read-JsonArray "data\markets\markets.json"); articles=@(Read-JsonArray "data\articles\articles.json"); downloads=@(Read-JsonArray "data\downloads\downloads.json") }; requestId=(New-Token 8) }
      return $true
    }
    Send-Json $context 404 @{ success=$false; error="API route not found"; requestId=(New-Token 8) }
    return $true
  }
  return $false
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "Cowinmagnet Southern Africa local site running at $prefix"
Write-Host "Serving files from $root"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $absolutePath = $context.Request.Url.AbsolutePath
    if ($absolutePath.StartsWith("/api/")) {
      if (Handle-Api $context $absolutePath) { continue }
    }
    $requestPath = [System.Web.HttpUtility]::UrlDecode($absolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = "index.html" }

    $candidate = Join-Path $root $requestPath
    $resolvedRoot = [System.IO.Path]::GetFullPath($root)
    $resolvedCandidate = [System.IO.Path]::GetFullPath($candidate)
    if (-not $resolvedCandidate.StartsWith($resolvedRoot)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (Test-Path -LiteralPath $resolvedCandidate -PathType Container) {
      $resolvedCandidate = Join-Path $resolvedCandidate "index.html"
    }

    if (-not (Test-Path -LiteralPath $resolvedCandidate -PathType Leaf)) {
      $notFoundCandidate = Join-Path $root "en-za\404\index.html"
      if (Test-Path -LiteralPath $notFoundCandidate -PathType Leaf) {
        $resolvedCandidate = $notFoundCandidate
        $context.Response.StatusCode = 404
      } else {
        $resolvedCandidate = Join-Path $root "index.html"
      }
    }

    $extension = [System.IO.Path]::GetExtension($resolvedCandidate).ToLowerInvariant()
    $contentType = switch ($extension) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "application/javascript; charset=utf-8" }
      ".svg" { "image/svg+xml" }
      ".png" { "image/png" }
      ".jpg" { "image/jpeg" }
      ".jpeg" { "image/jpeg" }
      ".webp" { "image/webp" }
      ".avif" { "image/avif" }
      ".pdf" { "application/pdf" }
      ".xml" { "application/xml; charset=utf-8" }
      ".txt" { "text/plain; charset=utf-8" }
      default { "application/octet-stream" }
    }

    $bytes = [System.IO.File]::ReadAllBytes($resolvedCandidate)
    $context.Response.ContentType = $contentType
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}

