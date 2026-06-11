$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sourceBase = "https://cowinmagnet.com"
$productsUrl = "$sourceBase/en/products"
$outDir = Join-Path $root "data\source-sync"
$imageDir = Join-Path $root "assets\images\source-products"
New-Item -ItemType Directory -Force -Path $outDir, $imageDir | Out-Null

function Slug($text) {
  return ($text.ToLowerInvariant() -replace '[^a-z0-9]+','-' -replace '(^-|-$)','')
}

function HtmlDecode($value) {
  Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue
  return [System.Web.HttpUtility]::HtmlDecode($value)
}

function CleanText($html) {
  $text = [regex]::Replace($html, '<script[\s\S]*?</script>', ' ')
  $text = [regex]::Replace($text, '<style[\s\S]*?</style>', ' ')
  $text = [regex]::Replace($text, '<[^>]+>', ' ')
  $text = HtmlDecode $text
  $text = [regex]::Replace($text, '\s+', ' ').Trim()
  return $text
}

function AbsoluteUrl($path) {
  if ($path -match '^https?://') { return $path }
  if ($path.StartsWith('/')) { return "$sourceBase$path" }
  return "$sourceBase/$path"
}

Write-Host "Fetching $productsUrl"
$listingHtml = (Invoke-WebRequest -UseBasicParsing $productsUrl).Content
$productPaths = [regex]::Matches($listingHtml, 'href="(/en/products/[^"#?]+)"') |
  ForEach-Object { $_.Groups[1].Value.TrimEnd('/') } |
  Where-Object { $_ -ne "/en/products" -and $_ -notmatch '/category/' } |
  Sort-Object -Unique

if (-not $productPaths.Count) {
  throw "No product links found at $productsUrl"
}

$records = @()
foreach ($path in $productPaths) {
  $url = AbsoluteUrl $path
  Write-Host "Syncing $url"
  $html = (Invoke-WebRequest -UseBasicParsing $url).Content
  $slug = Split-Path $path -Leaf

  $title = [regex]::Match($html, '<title>(.*?)</title>').Groups[1].Value
  $title = (HtmlDecode $title) -replace '\s*\|\s*Cowin\s*Magnet.*$', ''
  $title = $title -replace '\s+Supplier$', ''
  if ([string]::IsNullOrWhiteSpace($title)) {
    $title = (Get-Culture).TextInfo.ToTitleCase($slug.Replace('-', ' '))
  }

  $metaDescription = [regex]::Match($html, '<meta name="description" content="([^"]*)"').Groups[1].Value
  $metaDescription = HtmlDecode $metaDescription
  $pageText = CleanText $html

  $imageCandidates = @()
  $imageCandidates += [regex]::Matches($html, 'url=([^"&]+?\.(?:webp|jpg|jpeg|png))') | ForEach-Object { [uri]::UnescapeDataString($_.Groups[1].Value) }
  $imageCandidates += [regex]::Matches($html, 'src="([^"]+\.(?:webp|jpg|jpeg|png)[^"]*)"') | ForEach-Object { $_.Groups[1].Value -replace '\?.*$','' }
  $imageCandidates = $imageCandidates |
    Where-Object { $_ -match '/(assets|images)/' -and $_ -notmatch 'logo|icon|favicon' } |
    Select-Object -Unique

  $imageSource = $imageCandidates | Select-Object -First 1
  $localImage = "/assets/images/hero-mining-conveyor-magnet.png"
  if ($imageSource) {
    $imageUrl = AbsoluteUrl $imageSource
    $ext = [System.IO.Path]::GetExtension(($imageSource -replace '\?.*$',''))
    if ([string]::IsNullOrWhiteSpace($ext)) { $ext = ".webp" }
    $fileName = "$slug$ext"
    $filePath = Join-Path $imageDir $fileName
    try {
      Invoke-WebRequest -UseBasicParsing $imageUrl -OutFile $filePath
      $localImage = "/assets/images/source-products/$fileName"
    } catch {
      Write-Warning "Failed image download $imageUrl"
    }
  }

  $category = "Magnetic Separation Equipment"
  if ($slug -match 'electro|electromagnetic') { $category = "Electromagnetic Equipment" }
  elseif ($slug -match 'pulley|roller|drum|bar|grid|drawer|plate|grate|component') { $category = "Magnetic Rollers, Bars and Components" }
  elseif ($slug -match 'permanent|suspended|overband|magnet') { $category = "Permanent Magnetic Equipment" }

  $categorySlug = Slug $category
  if ($categorySlug -eq "magnetic-rollers-bars-and-components") { $categorySlug = "magnetic-rollers-bars-components" }
  if ($categorySlug -eq "magnetic-separation-equipment") { $categorySlug = "permanent-magnetic-equipment" }

  $features = @()
  foreach ($pattern in @('High magnetic field strength','Self-cleaning','Manual cleaning','Heavy-duty','Easy installation','Continuous operation','Outdoor')) {
    if ($pageText -match [regex]::Escape($pattern)) { $features += $pattern }
  }
  if (-not $features.Count) { $features = @("Product selection support", "Project-specific configuration", "Export coordination support") }

  $records += [pscustomobject]@{
    slug = $slug
    sourceProductId = $slug
    sourceSite = "cowinmagnet.com"
    sourceUrl = $url
    sourceVersion = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    importedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    lastSyncedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    syncStatus = "synced-public-html"
    name = $title
    category = $category
    categorySlug = $categorySlug
    shortDescription = if($metaDescription){$metaDescription}else{"$title from Cowinmagnet main website product catalogue."}
    fullDescription = if($pageText.Length -gt 900){$pageText.Substring(0,900)}else{$pageText}
    features = $features
    applications = @("Mining", "Conveyor Systems", "Industrial Material Handling")
    specifications = @{
      magneticSystemType = if($category -eq "Electromagnetic Equipment"){"electromagnetic"}elseif($category -eq "Magnetic Rollers, Bars and Components"){"component"}else{"permanent"}
      magneticFieldStrength = "Confirm according to source product model and project requirement"
      suspensionHeight = "Confirm from conveyor and burden depth"
      beltWidth = "Confirm actual conveyor width"
      beltSpeed = "Confirm actual belt speed"
      materialLayerThickness = "Confirm burden depth"
      installationDirection = "Cross-belt or inline to be confirmed"
      discharge = "Manual, self-cleaning or automatic according to product"
      voltage = "Confirm site voltage"
      frequency = "Confirm site frequency"
      protectionRating = "Confirm outdoor and dust requirements"
    }
    installationOptions = @("Cross-belt installation", "Inline installation", "Transfer point review")
    operatingConditions = @("Dust", "Outdoor installation", "Heavy material loads", "Voltage confirmation", "Maintenance access")
    images = @($localImage)
    sourceImages = $imageCandidates
    downloads = @()
    relatedProducts = @()
    relatedIndustries = @("Mining", "Coal Handling", "Quarry and Aggregates")
    seoTitle = "$title | Cowinmagnet South Africa"
    seoDescription = if($metaDescription){$metaDescription}else{"$title for South Africa and African magnetic separation applications."}
  }
}

$records | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outDir "main-site-products.json") -Encoding UTF8
$records | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $root "data\products\products.json") -Encoding UTF8

Write-Host "Synced $($records.Count) products from $productsUrl"
