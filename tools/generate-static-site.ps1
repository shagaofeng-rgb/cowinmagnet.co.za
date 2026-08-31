$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$locale = "en-za"
$base = "/$locale"
$siteUrl = if ($env:SITE_URL) { $env:SITE_URL.TrimEnd("/") } else { "http://localhost:8090" }
$isProduction = $siteUrl -match "^https://cowinmagnet\.co\.za$"
$robotsMeta = if ($isProduction) { "index,follow" } else { "noindex,nofollow" }
$heroImage = "/assets/images/hero-mining-conveyor-magnet.webp"
$heroLcpImage = "/assets/images/hero-mining-conveyor-magnet-lcp.webp"

function Slug($text) {
  return ($text.ToLowerInvariant() -replace '[^a-z0-9]+','-' -replace '(^-|-$)','')
}

$categories = @(
  [pscustomobject]@{ slug="permanent-magnetic-equipment"; name="Permanent Magnetic Equipment"; image="/assets/images/product-permanent-overband-magnet.webp"; description="Suspended permanent magnets and overband separators for conveyor tramp iron removal and crusher protection." },
  [pscustomobject]@{ slug="electromagnetic-equipment"; name="Electromagnetic Equipment"; image="/assets/images/product-electromagnetic-separator.webp"; description="Suspended electromagnetic separators for adjustable magnetic force and demanding mining conveyor applications." },
  [pscustomobject]@{ slug="magnetic-rollers-bars-components"; name="Magnetic Rollers, Bars and Components"; image="/assets/images/application-recycling-separation.webp"; description="Magnetic pulleys, drums, bars, grids, drawers, plates, grates and custom components." }
)
$categoryFile = Join-Path $root "data\categories\categories.json"
if (Test-Path -LiteralPath $categoryFile) {
  $loadedCategories = @(Get-Content -LiteralPath $categoryFile -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
  if ($loadedCategories.Count) {
    $categories = $loadedCategories | ForEach-Object {
      [pscustomobject]@{
        slug = if($_.slug){$_.slug}else{Slug $_.name}
        name = $_.name
        image = if($_.image){$_.image}else{"/assets/images/hero-mining-conveyor-magnet.webp"}
        description = if($_.description){$_.description}else{"$($_.name) from the Cowinmagnet main website product catalogue."}
        sourceUrl = $_.sourceUrl
        sourceSite = $_.sourceSite
        importedAt = $_.importedAt
      }
    }
  }
}

$products = @(
  "permanent-magnetic-equipment|Suspended Permanent Magnetic Separator|manual|cross-belt|Mining,Coal Handling,Quarry and Aggregates",
  "permanent-magnetic-equipment|Manual Cleaning Suspended Magnet|manual|cross-belt|Quarry and Aggregates,Recycling,Cement",
  "permanent-magnetic-equipment|Suspended Permanent Self-Cleaning Magnetic Separator|self-cleaning|cross-belt|Mining,Coal Handling,Conveyor Systems",
  "permanent-magnetic-equipment|Permanent Overband Magnetic Separator|self-cleaning|cross-belt|Mining,Coal Handling,Crusher Protection",
  "permanent-magnetic-equipment|Cross-Belt Permanent Magnetic Separator|self-cleaning|cross-belt|Mining,Recycling,Quarry and Aggregates",
  "permanent-magnetic-equipment|Inline Permanent Magnetic Separator|manual|inline|Conveyor Systems,Cement,Quarry and Aggregates",
  "permanent-magnetic-equipment|Heavy-Duty Permanent Suspended Magnet|manual|cross-belt|Mining,Heavy Material Loads,Remote Mining Sites",
  "electromagnetic-equipment|Suspended Electromagnetic Separator|manual|cross-belt|Mining,Mineral Processing,Coal Handling",
  "electromagnetic-equipment|Air-Cooled Electromagnetic Separator|manual|cross-belt|Coal Handling,Cement,Conveyor Systems",
  "electromagnetic-equipment|Oil-Cooled Electromagnetic Separator|manual|cross-belt|Mining,Continuous Operation,Heavy Duty",
  "electromagnetic-equipment|Self-Cooled Electromagnetic Separator|manual|cross-belt|Mining,Outdoor Installation,Dusty Environments",
  "electromagnetic-equipment|Suspended Electromagnetic Self-Cleaning Separator|self-cleaning|cross-belt|Mining,Coal Handling,Ports",
  "electromagnetic-equipment|Electromagnetic Overband Separator|self-cleaning|cross-belt|Mining,Crusher Protection,Bulk Terminals",
  "electromagnetic-equipment|Cross-Belt Electromagnetic Separator|self-cleaning|cross-belt|Coal Handling,Iron Ore,Chrome Ore",
  "electromagnetic-equipment|Heavy-Duty Electromagnetic Separator|self-cleaning|cross-belt|Mining,Large Lump Sizes,Continuous Operation",
  "magnetic-rollers-bars-components|Magnetic Head Pulley|automatic|inline|Recycling,Conveyor Systems,Bulk Material",
  "magnetic-rollers-bars-components|Magnetic Roller|automatic|inline|Components,Recycling,Material Separation",
  "magnetic-rollers-bars-components|Magnetic Drum|automatic|inline|Recycling,Mineral Processing,Ferrous Recovery",
  "magnetic-rollers-bars-components|Magnetic Bar|manual|inline|Food Processing,Components,Small Material Streams",
  "magnetic-rollers-bars-components|Magnetic Grid|manual|inline|Food Processing,Components,Material Cleanup",
  "magnetic-rollers-bars-components|Magnetic Drawer|manual|inline|Powder Handling,Food Processing,Components",
  "magnetic-rollers-bars-components|Magnetic Plate|manual|inline|Chutes,Hoppers,Material Handling",
  "magnetic-rollers-bars-components|Magnetic Grate|manual|inline|Hoppers,Food Processing,Industrial Material",
  "magnetic-rollers-bars-components|Custom Magnetic Components|manual|inline|OEM ODM,Components,Special Layouts"
) | ForEach-Object {
  $p = $_.Split("|")
  $cat = $categories | Where-Object slug -eq $p[0]
  [pscustomobject]@{
    categorySlug=$p[0]; category=$cat.name; slug=Slug $p[1]; name=$p[1]; cleaning=$p[2]; layout=$p[3]; applications=$p[4].Split(",");
    type=($(if($p[0] -eq "electromagnetic-equipment"){"electromagnetic"}elseif($p[0] -eq "permanent-magnetic-equipment"){"permanent"}else{"component"}));
    image=($(if($p[0] -eq "electromagnetic-equipment"){"/assets/images/product-electromagnetic-separator.webp"}elseif($p[0] -eq "magnetic-rollers-bars-components"){"/assets/images/application-recycling-separation.webp"}else{"/assets/images/product-permanent-overband-magnet.webp"}))
  }
}

$editableProductFile = Join-Path $root "data\products\products.json"
$syncedProductFile = Join-Path $root "data\source-sync\main-site-products.json"
if (Test-Path -LiteralPath $editableProductFile) {
  $syncedProducts = @(Get-Content -LiteralPath $editableProductFile -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
  # Retain every synchronized field. Product pages must use main-site content,
  # not a smaller local shape populated with generated fallback text.
  $products = @($syncedProducts)
} elseif (Test-Path -LiteralPath $syncedProductFile) {
  $syncedProducts = @(Get-Content -LiteralPath $syncedProductFile -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
  $products = @($syncedProducts)
}

$sortIndex = 0
$products = @($products | ForEach-Object {
  $sortIndex += 10
  $p = $_
  $productId = if ($p.productId) { $p.productId } elseif ($p.sourceProductId) { "CW-AF-" + $p.sourceProductId } else { "CW-AF-" + $p.slug }
  $sku = if ($p.sku) { $p.sku } else { ($p.slug.ToUpperInvariant() -replace '[^A-Z0-9]+','-') }
  $gallery = @($p.gallery) + @($p.images) + @($p.image)
  $gallery = @($gallery | Where-Object { $_ } | Select-Object -Unique)
  foreach($member in @(
    @("productId",$productId),@("sku",$sku),@("englishProductName",$p.name),@("mainImage",$p.image),@("gallery",$gallery),
    @("canonicalUrl",$(if($p.canonicalUrl){$p.canonicalUrl}else{"/en-za/products/$($p.categorySlug)/$($p.slug)/"})),@("openGraphImage",$p.image),@("productStatus","published"),@("sortOrder",$sortIndex),@("featured",($sortIndex -le 60)),
    @("createdAt",$(if($p.importedAt){$p.importedAt}else{(Get-Date).ToUniversalTime().ToString("o")})),@("updatedAt",$(if($p.updatedAt){$p.updatedAt}else{(Get-Date).ToUniversalTime().ToString("o")}))
  )) {
    $p | Add-Member -NotePropertyName $member[0] -NotePropertyValue $member[1] -Force
  }
  $p
})

$industries = @(
  "mining-and-mineral-processing|Mining and Mineral Processing|Selection support for magnetic separation, tramp iron removal and recovery duties in mining and mineral processing projects.|/assets/images/hero-mining-conveyor-magnet.webp",
  "coal-handling-and-washing|Coal Handling and Washing|Selection support for coal conveyors, transfer points, wash-plant feed and equipment protection duties.|/assets/images/hero-mining-conveyor-magnet.webp",
  "aggregates-quarries-and-cement|Aggregates, Quarries and Cement|Selection support for crusher protection and material stream cleanup in aggregate, quarry and cement processes.|/assets/images/application-quarry-aggregate.webp",
  "recycling-and-material-recovery|Recycling and Material Recovery|Selection support for ferrous and non-ferrous recovery from prepared recycling material streams.|/assets/images/application-recycling-separation.webp",
  "ports-power-and-bulk-handling|Ports, Power and Bulk Handling|Selection support for conveyors, transfer points and outdoor bulk handling conditions.|/assets/images/application-port-bulk-handling.webp",
  "mining|Mining|Mining operations require tramp iron removal to reduce crusher and conveyor damage risk.|/assets/images/hero-mining-conveyor-magnet.webp",
  "mineral-processing|Mineral Processing|Mineral processing conveyors need reliable magnetic separation and plant protection.|/assets/images/product-electromagnetic-separator.webp",
  "coal-handling|Coal Handling|Coal conveyors, transfer points and port handling lines often require suspended magnets.|/assets/images/hero-mining-conveyor-magnet.webp",
  "iron-ore|Iron Ore|Iron ore applications require careful confirmation of the separation objective and material behaviour.|/assets/images/product-electromagnetic-separator.webp",
  "manganese-ore|Manganese Ore|Manganese ore handling can involve heavy loads, abrasive material and crusher protection needs.|/assets/images/product-electromagnetic-separator.webp",
  "chrome-ore|Chrome Ore|Chrome ore conveyors need robust magnetic equipment selected for actual burden depth and layout.|/assets/images/product-electromagnetic-separator.webp",
  "gold-mining|Gold Mining|Gold mining conveyors may require tramp iron control before crushing and processing equipment.|/assets/images/hero-mining-conveyor-magnet.webp",
  "quarry-aggregates|Quarry and Aggregates|Quarry and aggregate lines focus on crusher protection and metal contamination control.|/assets/images/application-quarry-aggregate.webp",
  "recycling|Recycling|Recycling lines use magnetic equipment for ferrous recovery and material stream cleanup.|/assets/images/application-recycling-separation.webp",
  "cement|Cement|Cement plants may require magnetic protection for raw material handling and conveyors.|/assets/images/application-quarry-aggregate.webp",
  "power-plants|Power Plants|Power plant fuel handling conveyors require reliable equipment protection and maintenance planning.|/assets/images/hero-mining-conveyor-magnet.webp",
  "conveyor-systems|Conveyor Systems|Conveyor systems are the core installation scenario for suspended magnetic separators.|/assets/images/product-permanent-overband-magnet.webp",
  "ports-bulk-terminals|Ports and Bulk Terminals|Port conveyors and terminals need corrosion-aware and continuous-duty equipment review.|/assets/images/application-port-bulk-handling.webp",
  "food-processing|Food Processing|Food and dry material streams may use bars, grids, plates and grates for ferrous control.|/assets/images/application-recycling-separation.webp"
) | ForEach-Object { $p=$_.Split("|"); [pscustomobject]@{slug=$p[0]; name=$p[1]; description=$p[2]; image=$p[3]} }

$solutions = @(
  "conveyor-protection|Conveyor Protection|Reduce the risk of belt damage, transfer-point blockages and downstream equipment disruption from tramp metal and unsuitable material separation.|/assets/images/hero-mining-conveyor-magnet.webp",
  "non-ferrous-metal-recovery|Non-Ferrous Metal Recovery|Review prepared material, particle size, feed presentation and downstream collection for non-ferrous separation.|/assets/images/application-recycling-separation.webp",
  "tramp-iron-removal|Tramp Iron Removal|Remove ferrous tramp metal before it reaches crushers, screens or process equipment.",
  "crusher-protection|Crusher Protection|Reduce the risk of crusher damage from bolts, tools, teeth and other ferrous objects.",
  "conveyor-belt-protection|Conveyor Belt Protection|Protect conveyor systems and transfer points with correctly positioned magnetic equipment.",
  "ferrous-metal-recovery|Ferrous Metal Recovery|Recover ferrous material from recycling, processing and bulk handling streams.",
  "self-cleaning-magnetic-separation|Self-Cleaning Magnetic Separation|Use automatic discharge where manual cleaning is impractical or unsafe.",
  "heavy-duty-mining-applications|Heavy-Duty Mining Applications|Select equipment for continuous operation, heavy loads and large lump sizes.",
  "high-temperature-applications|High-Temperature Applications|Confirm magnet configuration for elevated ambient or material temperatures.",
  "outdoor-dusty-environments|Outdoor and Dusty Environments|Review dust, weather exposure and maintenance access before configuration.",
  "coastal-corrosive-environments|Coastal and Corrosive Environments|Consider humidity, corrosion resistance and outdoor electrical protection.",
  "remote-mining-sites|Remote Mining Sites|Plan durable equipment, spare parts and logistics for limited maintenance access."
) | ForEach-Object { $p=$_.Split("|"); [pscustomobject]@{slug=$p[0]; name=$p[1]; description=$p[2]} }

$markets = @(
  "south-africa|South Africa|Coal, chrome, manganese, iron ore, gold, quarrying, recycling and cement.",
  "botswana|Botswana|Mining, coal, aggregates and material handling.",
  "namibia|Namibia|Mining, quarrying, port logistics and bulk material handling.",
  "zimbabwe|Zimbabwe|Gold mining, lithium mining, chrome, coal and quarrying.",
  "zambia|Zambia|Copper mining, mineral processing, cement and quarrying.",
  "mozambique|Mozambique|Coal, ports, heavy mineral sands, cement and bulk handling.",
  "angola|Angola|Mining, quarrying, cement and industrial material handling.",
  "ghana|Ghana|Gold mining, quarrying, recycling and port handling.",
  "nigeria|Nigeria|Cement, quarrying, recycling, ports and industrial material handling.",
  "kenya|Kenya|Cement, quarrying, recycling, food processing and bulk handling.",
  "tanzania|Tanzania|Gold mining, quarrying, cement and port logistics.",
  "drc|Democratic Republic of the Congo|Copper, cobalt, mineral processing and remote mining sites."
) | ForEach-Object { $p=$_.Split("|"); [pscustomobject]@{slug=$p[0]; name=$p[1]; focus=$p[2]} }

$regions = @("gauteng","mpumalanga","limpopo","north-west","northern-cape","kwazulu-natal","eastern-cape","western-cape") | ForEach-Object {
  [pscustomobject]@{ slug=$_; name=(Get-Culture).TextInfo.ToTitleCase($_.Replace("-"," ")) }
}

$articles = @(
  "how-to-select-an-overband-magnet|How to Select an Overband Magnet|Selection factors for conveyor magnets in mining and industrial applications.",
  "permanent-vs-electromagnetic-separator|Permanent vs Electromagnetic Separator|How to compare permanent and electromagnetic separator options.",
  "magnetic-separator-for-coal-handling|Magnetic Separator for Coal Handling|Key considerations for coal conveyors and transfer points.",
  "crusher-protection-in-mining|Crusher Protection in Mining|How magnetic separation supports crusher protection.",
  "magnetic-separator-maintenance|Magnetic Separator Maintenance|Maintenance planning for suspended magnets and overband separators."
) | ForEach-Object { $p=$_.Split("|"); [pscustomobject]@{slug=$p[0]; title=$p[1]; summary=$p[2]; date="2026-06-09"} }
$articleFile = Join-Path $root "data\articles\articles.json"
if (Test-Path -LiteralPath $articleFile) {
  $storedArticles = @(Get-Content -LiteralPath $articleFile -Raw -Encoding UTF8 | ConvertFrom-Json | ForEach-Object { $_ })
  if ($storedArticles.Count) { $articles = $storedArticles }
}

function ArticleDateText($article) {
  $value = if ($article.published_at) { $article.published_at } elseif ($article.date) { $article.date } elseif ($article.created_at) { $article.created_at } else { "" }
  if (-not $value) { return "" }
  return ([string]$value).Substring(0, [Math]::Min(10, ([string]$value).Length))
}

$downloads = @(
  "Product Catalogue|Catalogue|Available on request after the required product range is confirmed.",
  "Technical Data Sheets|Datasheet|Available on request after product model and application review.",
  "Installation Drawings|Drawing|Available after product selection and layout confirmation.",
  "Selection Questionnaire|Form|Use the Request a Quote form to provide project information.",
  "Maintenance Manuals|Manual|Available after the product model and operating conditions are confirmed.",
  "Spare Parts Lists|Parts|Prepared after confirmed product model."
) | ForEach-Object { $p=$_.Split("|"); [pscustomobject]@{name=$p[0]; type=$p[1]; status=$p[2]} }

function RelAssets($path) {
  $depth = (($path.Trim("/") -split "/").Count)
  if ($path.Trim("/") -eq "") { return "." }
  return (($null = 1)..$depth | ForEach-Object { ".." }) -join "/"
}

function OptimizeTitle($title) {
  $value = [string]$title
  if ($value.Length -gt 72) { return ($value.Substring(0, 69).TrimEnd() + "...") }
  return $value
}

function OptimizeDescription($description) {
  $value = [string]$description
  if ($value.Length -lt 60) {
    $value = "$value Learn about magnetic separator selection for South Africa and African markets."
  }
  if ($value.Length -gt 178) { return ($value.Substring(0, 175).TrimEnd() + "...") }
  return $value
}

function HeaderHtml($path, $title, $description, $h1, $body, $schema = "") {
  $rel = RelAssets $path
  $canonical = "$siteUrl$path"
  $title = OptimizeTitle $title
  $description = OptimizeDescription $description
  $defaultSchema = @{
    "@context"="https://schema.org";
    "@graph"=@(
      @{
        "@type"="Organization";
        name="Cowinmagnet";
        legalName="Quzhou Qiying Import & Export Co., Ltd.";
        url="https://www.cowinmagnet.com";
        areaServed=@("South Africa","Botswana","Namibia","Zimbabwe","Zambia","Mozambique","Angola","Ghana","Nigeria","Kenya","Tanzania","Democratic Republic of the Congo");
        description="COWIN MAGNET supports product selection and export coordination for projects in South Africa and across Africa.";
      },
      @{
        "@type"="WebPage";
        name=$title;
        headline=$h1;
        description=$description;
        url=$canonical;
        inLanguage="en-ZA";
      }
    )
  } | ConvertTo-Json -Depth 8 -Compress
  $active = if($path -match "/products/"){"Products"}elseif($path -match "/industries/"){"Industries"}elseif($path -match "/news/|/blog/"){"News"}elseif($path -match "/solutions/|/markets/|/technical-support|/downloads|/search/"){"Resources"}elseif($path -match "/about/|/contact/|/request-a-quote/"){"Company"}else{"Home"}
  $nav = @(
    [pscustomobject]@{ label="News"; href="$base/news/" }
  )
  $navLinks = ($nav | ForEach-Object { $cls = if($_.label -eq $active){" class='active'"}else{""}; "<a$cls href='$($_.href)'>$($_.label)</a>" }) -join ""
  $productsButtonClass = if($active -eq "Products"){" class='active'"}else{""}
  $industriesButtonClass = if($active -eq "Industries"){" class='active'"}else{""}
  $resourcesButtonClass = if($active -eq "Resources"){" class='active'"}else{""}
  $companyButtonClass = if($active -eq "Company"){" class='active'"}else{""}
  $langs = @($locale) | ForEach-Object { "<option value='$_' selected>$($_.ToUpperInvariant())</option>" }
  $homePreload = if($path -eq "$base/"){"  <link rel=`"preload`" as=`"image`" href=`"$heroLcpImage`" type=`"image/webp`" fetchpriority=`"high`">"}else{""}
@"
<!doctype html>
<html lang="en-ZA" data-locale="en-za">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="$robotsMeta">
  <title>$title</title>
  <meta name="description" content="$description">
  <link rel="canonical" href="$canonical">
  <link rel="icon" href="/favicon.ico?v=20260808" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=20260808">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20260808">
  <link rel="alternate" hreflang="en-ZA" href="$canonical">
  <link rel="alternate" hreflang="x-default" href="https://www.cowinmagnet.com/">
  <meta property="og:title" content="$title">
  <meta property="og:description" content="$description">
  <meta property="og:type" content="website">
  <meta property="og:url" content="$canonical">
  <meta property="og:image" content="$siteUrl/assets/images/hero-mining-conveyor-magnet.webp">
$homePreload
  <link rel="stylesheet" href="$rel/assets/site.css">
  <script type="application/ld+json">$defaultSchema</script>
  $schema
</head>
<body>
  <header class="site-header">
    <a class="brand" href="$base/"><img class="brand-logo" src="/assets/images/cowinmagnet-logo.png" alt="Cowinmagnet logo"><span><strong>Cowinmagnet</strong><small>South Africa</small></span></a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      <button$productsButtonClass type="button" data-mega-button aria-expanded="false" aria-controls="mega-products">Products</button>
      <button$industriesButtonClass type="button" data-mega-button aria-expanded="false" aria-controls="mega-industries">Industries</button>
      $navLinks
      <button$resourcesButtonClass type="button" data-mega-button aria-expanded="false" aria-controls="mega-resources">Resources</button>
      <button$companyButtonClass type="button" data-mega-button aria-expanded="false" aria-controls="mega-company">Company</button>
    </nav>
    <div class="header-actions">
      <select class="language-select" data-language-select aria-label="Language selector">$($langs -join "")</select>
      <a class="button quote-link" href="$base/request-a-quote/">Request a Quote</a>
      <button class="mobile-toggle" type="button" data-mobile-toggle aria-expanded="false" aria-controls="mobile-panel">Menu</button>
    </div>
    <div class="nav-backdrop" data-nav-backdrop></div>
    <section id="mega-products" class="mega-panel" data-mega-panel hidden>
      <div class="mega-grid">
        <div class="mega-feature"><img src="/assets/images/product-permanent-overband-magnet.webp" alt="Overband magnetic separator"><h3>Product selection support</h3><p>Compare permanent, electromagnetic and component options for African conveyor applications.</p><a class="button primary" href="$base/products/">View Products</a></div>
        <nav class="mega-col"><h3>Iron Removers</h3><a href="$base/products/suspended-and-self-unloading-iron-removers/rcyd-type-permanent-magnet-self-dumping-iron-remover/">RCYD Permanent Self-Dumping Iron Remover</a><a href="$base/products/suspended-and-self-unloading-iron-removers/rcdd-type-self-cooling-self-dumping-electromagnetic-iron-remover/">RCDD Electromagnetic Iron Remover</a><a href="$base/products/magnetic-separation-equipment/suspended-permanent-magnetic-separator/">Suspended Permanent Magnetic Separator</a><a href="$base/products/suspended-and-self-unloading-iron-removers/">All Iron Removers</a></nav>
        <nav class="mega-col"><h3>Separation and Sorting</h3><a href="$base/products/magnetic-separation-equipment/belt-high-gradient-magnetic-separator/">Belt High-Gradient Magnetic Separator</a><a href="$base/products/metal-detection-and-recycling-sorting/eccentric-eddy-current-separator/">Eccentric Eddy Current Separator</a><a href="$base/products/magnetic-separation-equipment/gls-type-integral-channel-metal-separator/">GLS Channel Metal Separator</a><a href="$base/products/magnetic-separation-equipment/">All Separation Equipment</a></nav>
        <nav class="mega-col"><h3>Components and Filters</h3><a href="$base/products/metal-detection-and-recycling-sorting/magnetic-head-pulley/">Magnetic Head Pulley</a><a href="$base/products/metal-detection-and-recycling-sorting/drum-magnet/">Drum Magnet</a><a href="$base/products/magnetic-components-and-filters/magnetic-grid/">Magnetic Grid</a><a href="$base/products/">All Products</a></nav>
      </div>
    </section>
    <section id="mega-industries" class="mega-panel" data-mega-panel hidden>
      <div class="mega-grid">
        <div class="mega-feature"><img src="/assets/images/application-quarry-aggregate.webp" alt="African mining and quarry applications"><h3>African operating conditions</h3><p>Review dust, heat, coastal humidity, remote sites, voltage and maintenance access before configuration.</p><a class="button primary" href="$base/industries/">View Industries</a></div>
        <nav class="mega-col"><h3>Mining</h3><a href="$base/industries/mining/">Mining</a><a href="$base/industries/coal-handling/">Coal Handling</a><a href="$base/industries/iron-ore/">Iron Ore</a><a href="$base/industries/gold-mining/">Gold Mining</a></nav>
        <nav class="mega-col"><h3>Ore and Quarry</h3><a href="$base/industries/manganese-ore/">Manganese</a><a href="$base/industries/chrome-ore/">Chrome Ore</a><a href="$base/industries/quarry-aggregates/">Quarry and Aggregates</a><a href="$base/industries/cement/">Cement</a></nav>
        <nav class="mega-col"><h3>Markets</h3><a href="$base/markets/south-africa/">South Africa</a><a href="$base/markets/botswana/">Botswana</a><a href="$base/markets/ghana/">Ghana</a><a href="$base/markets/nigeria/">Nigeria</a></nav>
      </div>
    </section>
    <section id="mega-resources" class="mega-panel" data-mega-panel hidden>
      <div class="mega-grid compact">
        <div class="mega-feature"><img src="/assets/images/application-port-bulk-handling.webp" alt="African bulk material handling"><h3>Resources for project review</h3><p>Find solutions, market pages, support guides and downloads before requesting selection support.</p><a class="button primary" href="$base/solutions/">View Solutions</a></div>
        <nav class="mega-col"><h3>Solutions</h3><a href="$base/solutions/tramp-iron-removal/">Tramp Iron Removal</a><a href="$base/solutions/crusher-protection/">Crusher Protection</a><a href="$base/solutions/conveyor-belt-protection/">Conveyor Belt Protection</a><a href="$base/solutions/">All Solutions</a></nav>
        <nav class="mega-col"><h3>African Markets</h3><a href="$base/markets/south-africa/">South Africa</a><a href="$base/markets/botswana/">Botswana</a><a href="$base/markets/zambia/">Zambia</a><a href="$base/markets/">All Markets</a></nav>
        <nav class="mega-col"><h3>Support</h3><a href="$base/technical-support/product-selection-guide/">Product Selection Guide</a><a href="$base/technical-support/installation-guide/">Installation Guide</a><a href="$base/downloads/">Downloads</a><a href="$base/search/">Search</a></nav>
      </div>
    </section>
    <section id="mega-company" class="mega-panel" data-mega-panel hidden>
      <div class="mega-grid compact">
        <div class="mega-feature"><img src="/assets/images/hero-mining-conveyor-magnet.webp" alt="Cowinmagnet project support"><h3>Cowinmagnet South Africa</h3><p>Regional product selection and export communication support for African mining and industrial projects.</p><a class="button primary" href="$base/request-a-quote/">Request a Quote</a></div>
        <nav class="mega-col"><h3>Company</h3><a href="$base/about/">About Cowinmagnet</a><a href="$base/about/company-profile/">Company Profile</a><a href="$base/about/export-service/">Export Service</a><a href="$base/about/quality-control/">Quality Control</a></nav>
        <nav class="mega-col"><h3>Contact</h3><a href="$base/contact/">Contact Us</a><a href="$base/request-a-quote/">Request a Quote</a><a href="mailto:davidsha@cowinmagnet.com">Email</a><a href="https://wa.me/8615665135205">WhatsApp</a></nav>
        <nav class="mega-col"><h3>Global</h3><a href="https://www.cowinmagnet.com">Global Website</a><a href="$base/privacy-policy/">Privacy Policy</a><a href="$base/terms-and-conditions/">Terms</a><a href="$base/cookie-policy/">Cookie Policy</a></nav>
      </div>
    </section>
    <section id="mobile-panel" class="mobile-panel" data-mobile-panel hidden>
      <div class="mobile-group"><button type="button" data-mobile-group aria-expanded="false" aria-controls="mobile-products">Products</button><div id="mobile-products" class="mobile-links" hidden><a href="$base/products/">All Products</a><a href="$base/products/suspended-and-self-unloading-iron-removers/">Iron Removers</a><a href="$base/products/magnetic-separation-equipment/">Magnetic Separation</a><a href="$base/products/metal-detection-and-recycling-sorting/">Metal Detection and Sorting</a><a href="$base/products/magnetic-components-and-filters/">Components and Filters</a><a href="$base/products/conveyor-metal-detector/">Conveyor Metal Detector</a></div></div>
      <div class="mobile-group"><button type="button" data-mobile-group aria-expanded="false" aria-controls="mobile-industries">Industries</button><div id="mobile-industries" class="mobile-links" hidden><a href="$base/industries/">All Industries</a><a href="$base/industries/mining/">Mining</a><a href="$base/industries/coal-handling/">Coal Handling</a><a href="$base/industries/recycling/">Recycling</a><a href="$base/industries/ports-bulk-terminals/">Ports and Bulk Terminals</a></div></div>
      <div class="mobile-group"><button type="button" data-mobile-group aria-expanded="false" aria-controls="mobile-resources">Resources</button><div id="mobile-resources" class="mobile-links" hidden><a href="$base/solutions/">Solutions</a><a href="$base/markets/">African Markets</a><a href="$base/technical-support/">Support</a><a href="$base/downloads/">Downloads</a></div></div>
      <div class="mobile-group"><button type="button" data-mobile-group aria-expanded="false" aria-controls="mobile-company">Company</button><div id="mobile-company" class="mobile-links" hidden><a href="$base/about/">About</a><a href="$base/contact/">Contact</a><a href="https://wa.me/8615665135205?text=Hello%2C%20I%20am%20interested%20in%20magnetic%20separation%20equipment.">WhatsApp</a><a class="quote-link" href="$base/request-a-quote/">Request a Quote</a></div></div>
      <div class="mobile-links"><a href="$base/news/">News</a></div>
    </section>
  </header>
  <main>
$body
  </main>
  <footer class="footer">
    <section class="footer-main simple">
      <div class="footer-brand"><a class="brand" href="$base/"><img class="brand-logo" src="/assets/images/cowinmagnet-logo.png" alt="Cowinmagnet logo"><span><strong>Cowinmagnet</strong><small>South Africa</small></span></a><p>Magnetic separation equipment support for African mining and industrial projects.</p></div>
      <div class="footer-contact"><a href="mailto:davidsha@cowinmagnet.com">davidsha@cowinmagnet.com</a><a href="https://wa.me/8615665135205">WhatsApp: +86 156 6513 5205</a><a class="button primary" href="$base/request-a-quote/">Request a Quote</a></div>
    </section>
    <section class="footer-bottom"><span>(c) 2026 Cowinmagnet South Africa</span><nav><a href="$base/products/">Products</a><a href="$base/markets/">Markets</a><a href="$base/news/">News</a><a href="$base/about/">Company</a><a href="$base/contact/">Contact</a><a href="$base/privacy-policy/">Privacy</a><a href="https://www.cowinmagnet.com">Global Website</a></nav></section>
  </footer>
  <script src="$rel/assets/site.js"></script>
</body>
</html>
"@
}

function PageHero($crumbs, $eyebrow, $h1, $lead) {
@"
<section class="page-hero">
  <nav class="breadcrumbs">$crumbs</nav>
  <p class="eyebrow">$eyebrow</p>
  <h1>$h1</h1>
  <p>$lead</p>
</section>
"@
}

function HtmlEncode($value) {
  return [System.Net.WebUtility]::HtmlEncode([string]$value)
}

function IsInternalEditorialHeading($value) {
  $plain = ([regex]::Replace([string]$value, '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
  return $plain -match '(?i)(seo\s*meta|seo\s*title|meta\s*description|url\s*slug|primary\s*keyword|secondary\s*keywords|search\s*intent|target\s*country|target\s*buyer|suggested\s*cta|ai\s*citation\s*ready\s*summary|internal\s*linking\s*suggestions|cms(?:\s+publishing)?\s*checklist|json-ld\s*schema)'
}

function SafeArticleHtml($value) {
  $html = [string]$value
  $html = [regex]::Replace($html, '(?is)```.*?```', '')
  $html = [regex]::Replace($html, '(?is)<(?:pre|code|script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*>.*?</(?:pre|code|script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\s*>', '')
  $html = [regex]::Replace($html, '(?is)<(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*\/?\s*>', '')
  $headings = [regex]::Matches($html, '(?is)<h[1-6]\b[^>]*>(.*?)</h[1-6]>')
  for ($index = $headings.Count - 1; $index -ge 0; $index--) {
    if (IsInternalEditorialHeading $headings[$index].Groups[1].Value) {
      $end = if ($index -lt ($headings.Count - 1)) { $headings[$index + 1].Index } else { $html.Length }
      $html = $html.Remove($headings[$index].Index, $end - $headings[$index].Index)
    }
  }
  $html = [regex]::Replace($html, '(?i)\s+on[a-z0-9:_-]+\s*=\s*(?:"[^"]*"|''[^'']*''|[^\s>]+)', '')
  $html = [regex]::Replace($html, '(?i)\s+style\s*=\s*(?:"[^"]*"|''[^'']*''|[^\s>]+)', '')
  return [regex]::Replace($html, '(?is)\s+(href|src)\s*=\s*(["''])\s*(?:javascript|data):.*?\2', ' $1="#"').Trim()
}

function ArticleCover($article) {
  $url = [string]$article.cover_image_url
  if (-not $url -or $url -notmatch '^(?:/assets/images/|https://)') { return '' }
  $alt = HtmlEncode $(if ($article.cover_image_alt) { $article.cover_image_alt } else { $article.title })
  $caption = if ($article.cover_image_caption) { "<figcaption>$(HtmlEncode $article.cover_image_caption)</figcaption>" } else { '' }
  return "<figure class='article-cover'><img src='$url' alt='$alt' loading='eager' decoding='async'>$caption</figure>"
}

function WritePage($path, $title, $description, $h1, $body, $schema = "") {
  $target = Join-Path $root ($path.TrimStart("/") -replace "/$","/index.html")
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  $html = (HeaderHtml $path $title $description $h1 $body $schema) -join "`n"
  Set-Content -LiteralPath $target -Encoding UTF8 -NoNewline -Value (($html -replace '(?m)[ \t]+$', '').TrimEnd() + "`n")
}

function CardGrid($items, $hrefPrefix, $kind) {
  '<div class="grid">' + (($items | ForEach-Object {
    $img = if($_.image){$_.image}else{"/assets/images/hero-mining-conveyor-magnet.webp"}
    $desc = if($_.description){$_.description}elseif($_.focus){$_.focus}else{"Explore $($_.name) for African magnetic separation applications."}
    "<a class='card' href='$hrefPrefix/$($_.slug)/'><img src='$img' alt='$($_.name) illustration' loading='lazy'><p class='eyebrow'>$kind</p><h3>$($_.name)</h3><p>$desc</p></a>"
  }) -join "") + '</div>'
}

<#
Retired automatic product-profile generator. Product pages now render only
the verified public content synchronised from www.cowinmagnet.com.
#>
<#
function Get-ProductProfile($product) {
  $text = ("$($product.slug) $($product.name)").ToLowerInvariant()
  $family = "general-magnetic-equipment"
  if ($text -match "eddy|hecp|hecs") { $family = "eddy-current" }
  elseif ($text -match "metal.detector|gjt|dls|gls") { $family = "metal-detector" }
  elseif ($text -match "head.pulley") { $family = "magnetic-head-pulley" }
  elseif ($text -match "wet.drum|ctn|cts|ctb|ctz|cgt|rct|qcg|dcx") { $family = "wet-magnetic-separator" }
  elseif ($text -match "dry.drum|ctdg|hcg|dhd|dhj|ctq") { $family = "dry-magnetic-separator" }
  elseif ($text -match "grid|drawer|trap|pipe|pipeline|filter|rod|bar|hump|clc|cbs|cgb|cqz|cxj|cyg|rcya|rcyf|rcyg|rcyz") { $family = "magnetic-filter" }
  elseif ($text -match "rcda|rcdb|rcdc|rcdd|rcde|rcdf|electromagnetic") {
    if ($text -match "self.dumping|self.cleaning|rcdc|rcdd|rcdf") { $family = "electromagnetic-overband" } else { $family = "suspended-electromagnetic" }
  }
  elseif ($text -match "overband|self.dumping|self.cleaning|rcyd|rcye|rcydii|rcps|rbcyd") { $family = "permanent-overband" }
  elseif ($text -match "suspended|rcyb|manual.iron.remover") { $family = "suspended-permanent" }
  elseif ($text -match "lifting.magnet|rbcdb|rbcdd") { $family = "lifting-or-special" }

  $commonSelection = @("Material or contaminant to be removed", "Process capacity and particle or lump size", "Available installation space and maintenance access", "Dust, moisture, temperature and corrosion exposure")
  $profile = [ordered]@{
    family = $family
    cardType = "component"
    cleaning = "project-specific"
    overview = "$($product.name) is reviewed against the actual process, material stream and installation constraints before a final configuration is proposed."
    working = "The working principle and equipment configuration must match the verified product family and the customer’s process conditions."
    installation = "Confirm the process position, available structure, access for cleaning or maintenance, and the material flow before final selection."
    selection = $commonSelection
    options = @("Available on request after engineering review")
    applications = if($product.applications){@($product.applications)}else{@("Industrial material handling")}
    industries = @("mining-and-mineral-processing", "coal-handling-and-washing", "aggregates-quarries-and-cement")
    solutions = @("tramp-iron-removal", "conveyor-protection")
    specs = @(@("Model / series", $product.name), @("Configuration status", "Available on request"), @("Application data required", "Process and installation conditions"))
  }

  switch ($family) {
    "suspended-permanent" {
      $profile.cardType = "permanent"; $profile.cleaning = "manual"
      $profile.overview = "$($product.name) is a suspended permanent magnetic separator for removing ferrous tramp material from a conveyor stream where a manual cleaning arrangement is suitable."
      $profile.working = "A permanent magnetic circuit attracts ferrous contaminants from the material stream while the separator is suspended above the conveyor. Cleaning is planned according to the selected manual arrangement."
      $profile.installation = "Confirm cross-belt or inline position, belt width, burden depth, suspension height, structural support and safe access for manual cleaning."
      $profile.selection = @("Belt width, speed and burden depth", "Suspension height from the material surface", "Maximum tramp iron size and expected contamination", "Manual cleaning access and safe isolation procedure") + $commonSelection
      $profile.options = @("Mounting arrangement", "Housing and surface protection", "Outdoor or corrosion review")
      $profile.specs = @(@("Model / series", $product.name), @("Magnetic system", "Permanent magnetic circuit"), @("Cleaning arrangement", "Manual; confirm by model"), @("Installation orientation", "Cross-belt or inline; confirm by project"), @("Recommended suspension height", "Available on request"), @("Belt width and burden depth", "Required for selection"), @("Housing and surface protection", "Available on request"), @("Weight", "Available on request"))
    }
    "permanent-overband" {
      $profile.cardType = "permanent"; $profile.cleaning = "self-cleaning"
      $profile.overview = "$($product.name) is reviewed for continuous ferrous tramp removal from conveyor-fed material where a self-cleaning overband arrangement is required."
      $profile.working = "A permanent magnetic circuit attracts ferrous material and the selected discharge belt carries collected iron away from the working zone."
      $profile.installation = "Confirm the conveyor direction, overband or inline arrangement, discharge path, belt clearance, support structure and maintenance space."
      $profile.selection = @("Conveyor width, speed and burden depth", "Suspension height and iron discharge path", "Duty cycle and expected tramp iron", "Available space for the overband belt and drive") + $commonSelection
      $profile.options = @("Overband or inline arrangement", "Discharge belt and drive configuration", "Outdoor and corrosion protection")
      $profile.specs = @(@("Model / series", $product.name), @("Magnetic system", "Permanent magnetic circuit"), @("Cleaning method", "Self-cleaning discharge belt"), @("Conveyor width and burden depth", "Required for selection"), @("Suspension height", "Available on request"), @("Belt speed and duty", "Required for selection"), @("Drive configuration", "Available on request"), @("Housing and surface protection", "Available on request"))
    }
    "suspended-electromagnetic" {
      $profile.cardType = "electromagnetic"; $profile.cleaning = "manual"
      $profile.overview = "$($product.name) is an electromagnetic suspended separator reviewed for conveyor applications that require a verified electrical and magnetic configuration."
      $profile.working = "An energized electromagnetic system attracts ferrous contaminants from the material stream. Coil, control and cooling requirements are confirmed only for the selected model."
      $profile.installation = "Confirm cross-belt or inline position, electrical supply, support structure, suspension height, cooling clearance and safe maintenance access."
      $profile.selection = @("Belt width, speed, burden depth and suspension height", "Electrical supply, voltage, frequency and protection requirements", "Maximum tramp iron and duty cycle", "Cooling and maintenance access") + $commonSelection
      $profile.options = @("Electrical control arrangement", "Cooling configuration by model", "Outdoor, dust and corrosion protection")
      $profile.specs = @(@("Model / series", $product.name), @("Magnetic system", "Electromagnetic; confirm by model"), @("Cleaning arrangement", "Manual; confirm by model"), @("Input power and coil", "Available on request"), @("Cooling configuration", "Available on request"), @("Control arrangement", "Available on request"), @("Electrical supply", "Confirm site voltage and frequency"), @("Suspension height and belt data", "Required for selection"))
    }
    "electromagnetic-overband" {
      $profile.cardType = "electromagnetic"; $profile.cleaning = "self-cleaning"
      $profile.overview = "$($product.name) is an electromagnetic self-cleaning separator reviewed for continuous tramp iron removal in demanding conveyor duties."
      $profile.working = "An energized electromagnetic system attracts ferrous contaminants and the selected self-cleaning belt removes collected iron from the magnetic zone."
      $profile.installation = "Confirm the conveyor direction, discharge path, electrical supply, cooling clearance, support structure and maintenance access."
      $profile.selection = @("Conveyor width, speed, burden depth and suspension height", "Electrical supply and duty cycle", "Tramp iron profile and discharge path", "Space for the discharge belt, drive and maintenance") + $commonSelection
      $profile.options = @("Discharge belt and drive configuration", "Cooling configuration by model", "Control and electrical protection arrangement", "Outdoor and corrosion protection")
      $profile.specs = @(@("Model / series", $product.name), @("Magnetic system", "Electromagnetic; confirm by model"), @("Cleaning method", "Self-cleaning discharge belt"), @("Input power, coil and cooling", "Available on request"), @("Control arrangement", "Available on request"), @("Electrical supply", "Confirm site voltage and frequency"), @("Conveyor data and suspension height", "Required for selection"), @("Drive configuration", "Available on request"))
    }
    "wet-magnetic-separator" {
      $profile.cardType = "component"; $profile.cleaning = "process-specific"
      $profile.overview = "$($product.name) is reviewed for wet magnetic separation, concentration or recovery duties after the slurry, mineral and process route are confirmed."
      $profile.working = "A magnetic drum or wet magnetic circuit separates magnetic material from slurry through the selected tank and material-flow arrangement."
      $profile.installation = "Confirm the process flow, feed condition, slurry density, particle size, water management and maintenance access."
      $profile.selection = @("Mineral type and magnetic response", "Particle-size range and feed rate", "Slurry density and water conditions", "Required concentrate, tailings or recovery objective") + $commonSelection
      $profile.options = @("Drum size and tank type", "Magnetic circuit configuration", "Feed and discharge arrangement")
      $profile.industries = @("mining-and-mineral-processing", "coal-handling-and-washing")
      $profile.solutions = @("ferrous-metal-recovery")
      $profile.specs = @(@("Model / series", $product.name), @("Separator type", "Wet magnetic separation; confirm by model"), @("Drum diameter and length", "Available on request"), @("Tank type", "Available on request"), @("Magnetic circuit arrangement", "Available on request"), @("Feed particle-size range", "Required for selection"), @("Slurry conditions", "Required for selection"), @("Process capacity", "Available on request"))
    }
    "dry-magnetic-separator" {
      $profile.cardType = "component"; $profile.cleaning = "process-specific"
      $profile.overview = "$($product.name) is reviewed for dry magnetic separation or pre-concentration after mineral characteristics and feed conditions are confirmed."
      $profile.working = "The selected dry magnetic circuit separates material according to magnetic response, particle size and the verified feed arrangement."
      $profile.installation = "Confirm feed preparation, particle-size distribution, dust control, discharge arrangement and maintenance access."
      $profile.selection = @("Mineral type and magnetic response", "Particle-size distribution and feed moisture", "Feed rate and separation objective", "Dust control and installation space") + $commonSelection
      $profile.options = @("Feed arrangement", "Magnetic circuit configuration", "Dust and outdoor protection")
      $profile.industries = @("mining-and-mineral-processing", "coal-handling-and-washing")
      $profile.solutions = @("ferrous-metal-recovery")
      $profile.specs = @(@("Model / series", $product.name), @("Separator type", "Dry magnetic separation; confirm by model"), @("Magnetic circuit arrangement", "Available on request"), @("Feed particle-size range", "Required for selection"), @("Feed moisture", "Required for selection"), @("Process capacity", "Available on request"), @("Installation and dust review", "Required for selection"))
    }
    "eddy-current" {
      $profile.cardType = "component"; $profile.cleaning = "automatic"
      $profile.overview = "$($product.name) is reviewed for non-ferrous metal recovery from a prepared material stream after feed composition and size range are confirmed."
      $profile.working = "A high-speed rotor induces a separating effect in suitable non-ferrous material, while the splitter setting and feed presentation are selected for the actual stream."
      $profile.installation = "Confirm the feed preparation, particle-size range, belt presentation, splitter adjustment range, dust control and access for maintenance."
      $profile.selection = @("Target non-ferrous metals and contamination", "Feed particle-size range and presentation", "Required throughput", "Upstream ferrous removal and material preparation") + $commonSelection
      $profile.options = @("Rotor configuration", "Belt width", "Splitter and feed arrangement")
      $profile.industries = @("recycling-and-material-recovery", "mining-and-mineral-processing")
      $profile.solutions = @("non-ferrous-metal-recovery")
      $profile.specs = @(@("Model / series", $product.name), @("Separation target", "Non-ferrous material; confirm by feed"), @("Rotor configuration", "Available on request"), @("Belt width", "Available on request"), @("Feed particle-size range", "Required for selection"), @("Splitter adjustment", "Available on request"), @("Throughput", "Available on request"), @("Feed preparation", "Required for selection"))
    }
    "metal-detector" {
      $profile.cardType = "component"; $profile.cleaning = "alarm-or-reject-interface"
      $profile.overview = "$($product.name) is reviewed for detecting unwanted metal in a conveyor process and for integration with the appropriate alarm or reject response."
      $profile.working = "The detector monitors the material stream through the selected aperture and provides the specified alarm or process interface when metal is detected."
      $profile.installation = "Confirm the conveyor integration, aperture, material profile, electrical interface, reject logic and environmental conditions."
      $profile.selection = @("Detection aperture and conveyor geometry", "Target metal and sensitivity requirement", "Material burden and belt speed", "Alarm, stop or reject interface") + $commonSelection
      $profile.options = @("Aperture size", "Alarm and integration interface", "Environmental protection configuration")
      $profile.industries = @("aggregates-quarries-and-cement", "coal-handling-and-washing", "mining-and-mineral-processing")
      $profile.solutions = @("crusher-protection", "conveyor-protection")
      $profile.specs = @(@("Model / series", $product.name), @("Detection aperture", "Available on request"), @("Sensitivity application range", "Confirm target metal and material conditions"), @("Conveyor integration", "Required for selection"), @("Alarm or reject interface", "Available on request"), @("Environmental limits", "Available on request"), @("Electrical supply", "Confirm site requirements"))
    }
    "magnetic-head-pulley" {
      $profile.cardType = "permanent"; $profile.cleaning = "continuous"
      $profile.overview = "$($product.name) is reviewed for continuous separation at the head of a conveyor where the pulley must match the belt and discharge geometry."
      $profile.working = "The magnetic pulley separates ferrous material as the conveyed stream passes around the head pulley, creating separate material trajectories."
      $profile.installation = "Confirm pulley dimensions, belt type, conveyor geometry, material trajectory, guarding and maintenance access."
      $profile.selection = @("Pulley diameter, face width and shaft details", "Conveyor belt type and speed", "Material size and magnetic fraction", "Discharge trajectory and downstream collection") + $commonSelection
      $profile.options = @("Pulley dimensions", "Magnetic circuit configuration", "Shaft and bearing interface")
      $profile.industries = @("recycling-and-material-recovery", "mining-and-mineral-processing", "coal-handling-and-washing")
      $profile.solutions = @("ferrous-metal-recovery", "conveyor-protection")
      $profile.specs = @(@("Model / series", $product.name), @("Magnetic system", "Permanent magnetic pulley; confirm by model"), @("Pulley diameter and face width", "Available on request"), @("Shaft and bearing interface", "Available on request"), @("Conveyor belt and speed", "Required for selection"), @("Material size and magnetic fraction", "Required for selection"), @("Discharge arrangement", "Required for selection"))
    }
    "magnetic-filter" {
      $profile.cardType = "component"; $profile.cleaning = "manual-or-automatic-by-model"
      $profile.overview = "$($product.name) is reviewed for removing ferrous contamination from a gravity-fed, pneumatic or pipeline material stream after the material and cleaning requirements are confirmed."
      $profile.working = "The material passes through a selected magnetic element arrangement that captures ferrous contamination. The housing and cleaning method depend on the verified model."
      $profile.installation = "Confirm the material flow direction, connection dimensions, pressure or temperature conditions, access for cleaning and hygiene or process constraints where relevant."
      $profile.selection = @("Material type, particle size and flow condition", "Gravity, pneumatic or pipeline installation", "Connection dimensions and available space", "Cleaning frequency and contamination level") + $commonSelection
      $profile.options = @("Magnetic element arrangement", "Housing and connection configuration", "Manual or automatic cleaning by model")
      $profile.industries = @("recycling-and-material-recovery", "mining-and-mineral-processing", "food-processing")
      $profile.solutions = @("tramp-iron-removal")
      $profile.specs = @(@("Model / series", $product.name), @("Installation type", "Confirm gravity, pneumatic or pipeline process"), @("Magnetic element arrangement", "Available on request"), @("Connection or housing dimensions", "Available on request"), @("Material flow conditions", "Required for selection"), @("Cleaning method", "Confirm by model"), @("Temperature and pressure limits", "Available on request"))
    }
    "lifting-or-special" {
      $profile.cardType = "electromagnetic"; $profile.cleaning = "not-applicable"
      $profile.overview = "$($product.name) is a special-purpose magnetic equipment item that requires a verified application and safety review before configuration."
      $profile.working = "The magnetic system and operating method are confirmed for the selected model and the verified handling or process duty."
      $profile.installation = "Confirm the handling arrangement, electrical conditions where applicable, operating environment and required safety controls."
      $profile.selection = @("Material and handling objective", "Required operating duty", "Site safety and electrical conditions", "Mounting or integration arrangement") + $commonSelection
      $profile.options = @("Configuration by verified model", "Environmental protection review")
      $profile.specs = @(@("Model / series", $product.name), @("Application", "Confirm by project"), @("Magnetic system", "Confirm by model"), @("Operating configuration", "Available on request"), @("Safety and installation requirements", "Required for selection"))
    }
  }
  return [pscustomobject]$profile
}

function Set-ProductTruthData($product) {
  $profile = Get-ProductProfile $product
  $technicalSpecifications = @($profile.specs | ForEach-Object -Begin {$sortOrder = 0} -Process {
    $sortOrder += 10
    [pscustomobject]@{
      group = "Selection data"
      parameter = $_[0]
      value = $_[1]
      unit = ""
      sortOrder = $sortOrder
      language = "en-za"
      visible = $true
    }
  })
  $values = @{
    productFamily = $profile.family
    truthCardStatus = "needs-engineering-review"
    truthCardUpdatedAt = (Get-Date).ToUniversalTime().ToString("o")
    dataProvenance = if($product.sourceUrl){"main-site-product-sync; local truth normalization"}else{"local catalogue; local truth normalization"}
    canonicalUrl = "$base/products/$($product.categorySlug)/$($product.slug)/"
    type = $profile.cardType
    cleaning = $profile.cleaning
    shortDescription = $profile.overview
    fullDescription = $profile.overview
    features = @($profile.options)
    applications = @($profile.applications)
    workingPrinciple = $profile.working
    technicalSpecifications = $technicalSpecifications
    installationOptions = @($profile.installation)
    optionalConfigurations = @($profile.options)
    operatingConditions = "Confirm material, process, installation and environmental conditions before quotation."
    relatedIndustries = @($profile.industries)
    relatedSolutions = @($profile.solutions)
    gallery = @($product.image | Where-Object { $_ })
  }
  foreach($key in $values.Keys) {
    $product | Add-Member -NotePropertyName $key -NotePropertyValue $values[$key] -Force
  }
}
#>

function ProductCards($items) {
  '<div class="grid">' + (($items | ForEach-Object {
    "<a class='card' data-product-card href='$base/products/$($_.categorySlug)/$($_.slug)/'><img src='$($_.image)' alt='$(HtmlEncode $_.name)' loading='lazy'><p class='eyebrow'>$(HtmlEncode $_.category)</p><h3>$(HtmlEncode $_.name)</h3><p>$(HtmlEncode $_.shortDescription)</p></a>"
  }) -join "") + '</div>'
}

function RelatedProducts($product, $allProducts) {
  $sameCategory = @($allProducts | Where-Object { $_.slug -ne $product.slug -and $_.categorySlug -eq $product.categorySlug })
  @($sameCategory | Sort-Object sortOrder, slug | Select-Object -First 3)
}

function ProductGallery($product) {
  $images = @($product.gallery | Where-Object { $_ } | Select-Object -Unique)
  if (-not $images.Count) { return '' }
  $thumbs = ($images | ForEach-Object -Begin {$index = 0} -Process {
    $index++
    $current = if ($index -eq 1) { " aria-current='true'" } else { '' }
    "<button type='button' data-gallery-thumb data-src='$_'$current aria-label='Show image $index of $(HtmlEncode $product.name)'><img src='$_' alt='$(HtmlEncode $product.name) view $index' loading='lazy'></button>"
  }) -join ''
  return "<div class='product-gallery' data-gallery><img class='gallery-main' data-gallery-main src='$($images[0])' alt='$(HtmlEncode $product.name)' loading='eager' decoding='async'><div class='gallery-thumbs'>$thumbs</div></div>"
}

function SourceProductSections($product) {
  $sections = @($product.sourceContent.sections | Where-Object { $_.title -and ($_.paragraphs.Count -or $_.items.Count -or $_.cards.Count -or $_.rows.Count) })
  ($sections | ForEach-Object {
    $section = $_
    $intro = if($section.introduction){"<p class='product-section-intro'>$(HtmlEncode $section.introduction)</p>"}else{''}
    $paragraphs = @($section.paragraphs | Where-Object { $_ -and $_ -ne $section.introduction } | Select-Object -Unique | ForEach-Object { "<p>$(HtmlEncode $_)</p>" }) -join ''
    $cards = @($section.cards | Where-Object { $_.title -or $_.description } | ForEach-Object { "<article><span>$(HtmlEncode $_.title)</span><p>$(HtmlEncode $_.description)</p></article>" })
    $cardHtml = if($cards.Count){"<div class='product-source-cards'>$($cards -join '')</div>"}else{''}
    $items = @($section.items | Where-Object { $_ } | Select-Object -Unique | ForEach-Object { "<li>$(HtmlEncode $_)</li>" })
    $itemHtml = if($items.Count){"<ul class='product-source-list'>$($items -join '')</ul>"}else{''}
    $rows = @($section.rows | Where-Object { $_.Count -ge 2 } | ForEach-Object { "<div role='row'><span>$(HtmlEncode $_[0])</span><strong>$(HtmlEncode $_[1])</strong>$(if($_.Count -gt 2){"<span>$(HtmlEncode $_[2])</span>"})</div>" })
    $rowHtml = if($rows.Count){"<div class='product-source-specifications' role='table'>$($rows -join '')</div>"}else{''}
    "<section id='product-$($section.key)' class='product-source-section'><div class='product-source-heading'>$(if($section.eyebrow){"<p class='eyebrow'>$(HtmlEncode $section.eyebrow)</p>"})<h2>$(HtmlEncode $section.title)</h2>$intro</div><div class='product-source-body'>$paragraphs$cardHtml$itemHtml$rowHtml</div></section>"
  }) -join ''
}

function FAQ($pairs) {
  '<div class="grid">' + (($pairs | ForEach-Object -Begin {$i=0} -Process {
    $i++; "<article class='faq-item'><button type='button' data-faq-button aria-expanded='false' aria-controls='faq-$i'>$($_[0])</button><div id='faq-$i' hidden>$($_[1])</div></article>"
  }) -join "") + '</div>'
}

# Clean generated route trees before writing fresh pages so old product routes cannot remain.
foreach($generatedLocale in @("en-za","af-za","zu-za","xh-za","st-za","tn-za","en-africa","fr-africa","pt-africa","sw-africa","ar-africa")) {
  $generatedPath = Join-Path $root $generatedLocale
  if (Test-Path -LiteralPath $generatedPath) {
    Remove-Item -LiteralPath $generatedPath -Recurse -Force
  }
}

# Root redirect page
$rootSchema = @{ "@context"="https://schema.org"; "@type"="WebSite"; name="Cowinmagnet South Africa"; url="$siteUrl/en-za/"; potentialAction=@{ "@type"="SearchAction"; target="$siteUrl/en-za/search/?q={search_term_string}"; "query-input"="required name=search_term_string" } } | ConvertTo-Json -Depth 6 -Compress
Set-Content -LiteralPath (Join-Path $root "index.html") -Encoding UTF8 -Value "<!doctype html><html lang='en-ZA'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><meta name='robots' content='$robotsMeta'><meta http-equiv='refresh' content='0; url=/en-za/'><title>Cowinmagnet South Africa | Magnetic Separator Equipment</title><meta name='description' content='Cowinmagnet South Africa and Africa regional site for magnetic separator products, mining applications, support resources and quote requests.'><link rel='canonical' href='$siteUrl/en-za/'><link rel='icon' href='/favicon.ico?v=20260808' sizes='any'><link rel='icon' type='image/png' sizes='32x32' href='/favicon-32x32.png?v=20260808'><link rel='apple-touch-icon' href='/apple-touch-icon.png?v=20260808'><meta property='og:image' content='$siteUrl/assets/images/hero-mining-conveyor-magnet.webp'><script type='application/ld+json'>$rootSchema</script></head><body><main><h1>Cowinmagnet South Africa</h1><p><a href='/en-za/'>Open Cowinmagnet South Africa & Africa</a></p></main></body></html>"

$homeBody = @"
<section class="hero image"><picture class="hero-media" aria-hidden="true"><source type="image/webp" srcset="$heroLcpImage"><img src="$heroImage" alt="Cowinmagnet magnetic separator installed above a mining conveyor in South Africa" width="1120" height="630" fetchpriority="high" decoding="async"></picture><div><p class="eyebrow">South Africa & Africa</p><h1>Magnetic Separation Equipment for South Africa and Africa</h1><p>Cowinmagnet supports mining, coal, quarrying, recycling, cement and conveyor systems with product selection, export coordination and magnetic separation project support.</p><div class="actions"><a class="button primary" href="$base/products/">View All Products</a><a class="button secondary" href="$base/markets/">Explore African Markets</a></div></div><div class="panel"><h2>African operating conditions</h2><ul class="check-list"><li>High dust levels and outdoor installation</li><li>Heavy material loads and large lump sizes</li><li>Remote mining sites and long-distance logistics</li><li>Coastal humidity, corrosion and voltage confirmation</li></ul></div></section>
<section class="section"><div class="section-heading"><p class="eyebrow">Product categories</p><h2>Start with the right magnetic equipment family</h2></div>$(CardGrid $categories "$base/products" "Category")</section>
<section class="section band"><div class="section-heading"><p class="eyebrow">Industries</p><h2>South African and African application summaries</h2></div>$(CardGrid ($industries | Select-Object -First 6) "$base/industries" "Industry")<div class="actions"><a class="button primary" href="$base/industries/">View All Industries</a></div></section>
<section class="section"><div class="section-heading"><p class="eyebrow">Solutions</p><h2>Problem-led magnetic separation support</h2></div>$(CardGrid ($solutions | Select-Object -First 6) "$base/solutions" "Solution")<div class="actions"><a class="button primary" href="$base/solutions/">View Mining Solutions</a></div></section>
<section class="section band"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Quick answers before selection</h2></div>$(FAQ @(@("Does Cowinmagnet have a South African factory?","No. This site does not claim a South African factory, warehouse, local stock or local office."),@("What data is needed for selection?","Material type, belt width, belt speed, material depth, suspension height, capacity, tramp iron size and electrical conditions."),@("Can all standard models handle harsh African conditions?","No. Equipment configuration must be confirmed according to actual dust, heat, humidity, altitude and voltage conditions.")))</section>
"@
WritePage "$base/" "Magnetic Separator South Africa | Mining and Conveyor Magnets" "Cowinmagnet provides permanent and electromagnetic magnetic separation equipment for mining, coal, quarrying, recycling, cement and conveyor systems in South Africa and across Africa." "Magnetic Separation Equipment for South Africa and Africa" $homeBody

$filter = '<form class="filter-panel" data-product-filter><label>Search<input name="q" type="search" placeholder="overband, coal, pulley"></label><label>Type<select name="type"><option value="">All</option><option value="permanent">Permanent</option><option value="electromagnetic">Electromagnetic</option><option value="component">Components</option></select></label><label>Cleaning<select name="cleaning"><option value="">All</option><option value="manual">Manual</option><option value="self-cleaning">Self-cleaning</option><option value="automatic">Automatic</option></select></label><label>Belt width<input name="belt" placeholder="e.g. 800 mm"></label></form>'
$productsBody = (PageHero "<a href='$base/'>Home</a> / Products" "Products" "Magnetic Separation Equipment Products" "Browse permanent, electromagnetic and component products with real routes and filters.") + "<section class='section'>$filter$(ProductCards $products)</section>"
WritePage "$base/products/" "Magnetic Separation Equipment Products | Cowinmagnet South Africa" "Browse permanent magnetic equipment, electromagnetic separators and magnetic components for South Africa and African markets." "Magnetic Separation Equipment Products" $productsBody

foreach($cat in $categories) {
  $items = $products | Where-Object categorySlug -eq $cat.slug
  $body = (PageHero "<a href='$base/'>Home</a> / <a href='$base/products/'>Products</a> / $($cat.name)" "Product Category" $cat.name $cat.description) + "<section class='section'>$filter$(ProductCards $items)</section>"
  WritePage "$base/products/$($cat.slug)/" "$($cat.name) | Cowinmagnet South Africa" "$($cat.description) Product category for African mining and industrial applications." $cat.name $body
  foreach($product in $items) {
    $relatedProducts = RelatedProducts $product $products
    $productUrl = "$siteUrl$base/products/$($cat.slug)/$($product.slug)/"
    # Do not emit Product rich-result markup without verified offer, inventory or review data.
    $productSchema = @{ "@context"="https://schema.org"; "@graph"=@(
      @{ "@type"="WebPage"; name=$product.name; description=$product.shortDescription; primaryImageOfPage="$siteUrl$($product.image)"; url=$productUrl; inLanguage="en-ZA" },
      @{ "@type"="BreadcrumbList"; itemListElement=@(
        @{ "@type"="ListItem"; position=1; name="Home"; item="$siteUrl$base/" },
        @{ "@type"="ListItem"; position=2; name="Products"; item="$siteUrl$base/products/" },
        @{ "@type"="ListItem"; position=3; name=$cat.name; item="$siteUrl$base/products/$($cat.slug)/" },
        @{ "@type"="ListItem"; position=4; name=$product.name; item=$productUrl }
      ) }
    ) } | ConvertTo-Json -Depth 8 -Compress
    $gallery = ProductGallery $product
    $heroFacts = @($product.sourceContent.hero.quickFacts | ForEach-Object { "<div><dt>$(HtmlEncode $_.label)</dt><dd>$(HtmlEncode $_.value)</dd></div>" }) -join ''
    $heroHighlights = @($product.sourceContent.hero.highlights | ForEach-Object { "<li>$(HtmlEncode $_)</li>" }) -join ''
    $sections = SourceProductSections $product
    $sectionNav = @($product.sourceContent.sections | Where-Object { $_.title -and ($_.paragraphs.Count -or $_.items.Count -or $_.cards.Count -or $_.rows.Count) } | ForEach-Object { "<a href='#product-$($_.key)'>$(HtmlEncode $_.title)</a>" }) -join ''
    $quoteLink = "$base/request-a-quote/?product=$([uri]::EscapeDataString($product.name))"
    $whatsAppMessage = [uri]::EscapeDataString("Hello COWIN MAGNET, I am reviewing $($product.name). Please help with configuration.")
    $body = "<section class='product-page-hero'><nav class='breadcrumbs'><a href='$base/'>Home</a> / <a href='$base/products/'>Products</a> / <a href='$base/products/$($cat.slug)/'>$(HtmlEncode $cat.name)</a> / <span>$(HtmlEncode $product.name)</span></nav><div class='product-hero-grid'><div class='product-hero-media'>$gallery</div><div class='product-hero-copy'><p class='eyebrow'>$(HtmlEncode $cat.name)</p><h1>$(HtmlEncode $product.name)</h1><p>$(HtmlEncode $product.sourceContent.hero.summary)</p>$(if($heroHighlights){"<ul class='product-hero-highlights'>$heroHighlights</ul>"})<div class='product-hero-actions'><a class='button primary' href='$quoteLink'>Request a Quote</a><a class='button secondary' href='https://wa.me/8615665135205?text=$whatsAppMessage' target='_blank' rel='noopener noreferrer nofollow'>Talk to an Engineer</a></div>$(if($heroFacts){"<dl class='product-quick-facts'>$heroFacts</dl>"})</div></div></section><section class='product-detail-layout'><aside class='product-detail-nav'><p>On this page</p>$sectionNav</aside><article class='product-detail-content'>$sections$(if($relatedProducts.Count){"<section class='product-source-section'><div class='product-source-heading'><p class='eyebrow'>More equipment</p><h2>Related products</h2></div>$(ProductCards $relatedProducts)</section>"})</article><aside class='product-quote-panel'><p class='eyebrow'>Project inquiry</p><h2>Request product information</h2><p>Share your process details and the product name will be included with the inquiry.</p><a class='button primary' href='$quoteLink'>Request a Quote</a><a class='button secondary' href='mailto:davidsha@cowinmagnet.com?subject=$([uri]::EscapeDataString($product.name))'>Email COWIN MAGNET</a></aside></section>"
    # Quote-only configured equipment has no public price or verified reviews, so it is not eligible for Product snippets.
    WritePage "$base/products/$($cat.slug)/$($product.slug)/" "$($product.name) | COWIN MAGNET South Africa" $product.seoDescription $product.name $body "<script type='application/ld+json'>$productSchema</script>"
  }
}

$metalDetectorProducts = @($products | Where-Object { "$($_.name) $($_.category)" -match '(?i)metal detector|detector' })
$conveyorDetectorBody = (PageHero "<a href='$base/'>Home</a> / <a href='$base/products/'>Products</a> / Conveyor Metal Detector" "Products" "Conveyor Metal Detector" "Current COWIN MAGNET product records in this equipment group.") + "<section class='section'>$(ProductCards $metalDetectorProducts)</section>"
WritePage "$base/products/conveyor-metal-detector/" "Conveyor Metal Detector | COWIN MAGNET South Africa" "Current COWIN MAGNET conveyor metal detector product records." "Conveyor Metal Detector" $conveyorDetectorBody

WritePage "$base/industries/" "Industries | Magnetic Separator Applications South Africa" "Explore mining, coal, iron ore, manganese, chrome, quarrying, recycling, cement and conveyor magnetic separator applications." "Industries" ((PageHero "<a href='$base/'>Home</a> / Industries" "Industries" "Magnetic Separator Applications by Industry" "Independent industry pages for African operating conditions.") + "<section class='section'>$(CardGrid $industries "$base/industries" "Industry")</section>")
foreach($ind in $industries) {
  $industryHero = (PageHero "<a href='$base/'>Home</a> / <a href='$base/industries/'>Industries</a> / $($ind.name)" "Industry" "$($ind.name) Magnetic Separator Applications" $ind.description) -replace 'class="page-hero"', 'class="page-hero industry-detail-hero"'
  $body = $industryHero + "<section class='section layout industry-detail-layout'><article class='industry-detail-content'><h2>Industry overview</h2><p>$($ind.description)</p><h2>Common operating conditions</h2><ul class='check-list'><li>Dust, heat and outdoor installation may apply</li><li>Heavy material loads and large lump sizes require confirmation</li><li>Remote mining sites may need spare parts planning</li></ul><h2>Typical tramp iron problems</h2><p>Bolts, tools, teeth, wire and ferrous debris can damage conveyors, crushers and processing equipment.</p><h2>Risks to crushers and conveyors</h2><p>Unremoved tramp iron may cut belts, block transfer points, damage crusher liners, interrupt production and increase maintenance risk.</p><h2>Recommended magnetic equipment</h2><p>Suspended permanent magnets, self-cleaning overband separators, electromagnetic separators and magnetic pulleys may be reviewed against the actual process duty.</p><h2>Installation methods</h2><p>Cross-belt and inline positions should be checked against transfer points, belt speed, burden depth, maintenance access and available structure.</p><h2>Information needed for selection</h2><ul class='check-list'><li>Material type and maximum lump size</li><li>Conveyor width, speed and layer depth</li><li>Suspension height and installation position</li><li>Manual or self-cleaning discharge</li><li>Outdoor, dusty, humid or corrosive conditions</li><li>Target tramp metal and downstream equipment</li></ul></article><aside class='panel industry-detail-aside'><img src='$($ind.image)' alt='$($ind.name) material handling application'><div class='industry-detail-aside-copy'><h2>Review your application</h2><p>Send the material, conveyor and installation data required for a project-specific equipment review.</p><a class='button primary' href='$base/request-a-quote/'>Request a Quote</a></div></aside></section><section class='section band industry-related-section'><div class='section-heading'><h2>Recommended products</h2><p>Equipment families commonly reviewed for this process. Final selection depends on verified operating data.</p></div>$(ProductCards ($products | Select-Object -First 3))</section><section class='section industry-related-section industry-solutions-section'><div class='section-heading'><h2>Related solutions</h2><p>Explore the process problems that magnetic separation and metal detection can help address.</p></div>$(CardGrid ($solutions | Select-Object -First 3) "$base/solutions" "Solution")</section><section class='section band'><div class='section-heading'><h2>Frequently asked questions</h2></div>$(FAQ @(@('Which separator type is recommended?','The product family depends on conveyor data, burden depth, tramp iron risk and duty cycle.'),@('Can this equipment be configured for dusty sites?','Dust protection and outdoor configuration must be confirmed for each site.')))</section>"
  WritePage "$base/industries/$($ind.slug)/" "$($ind.name) Magnetic Separator Applications | Cowinmagnet" "$($ind.name) magnetic separation equipment selection for South Africa and African industrial projects." "$($ind.name) Magnetic Separator Applications" $body
}

WritePage "$base/solutions/" "Magnetic Separation Solutions | Cowinmagnet South Africa" "Problem-led magnetic separation solutions for tramp iron removal, crusher protection, conveyor belt protection and African operating conditions." "Solutions" ((PageHero "<a href='$base/'>Home</a> / Solutions" "Solutions" "Magnetic Separation Solutions" "Solutions built around customer problems and site conditions.") + "<section class='section'>$(CardGrid $solutions "$base/solutions" "Solution")</section>")
foreach($sol in $solutions) {
  $body = (PageHero "<a href='$base/'>Home</a> / <a href='$base/solutions/'>Solutions</a> / $($sol.name)" "Solution" $sol.name $sol.description) + "<section class='section layout'><article class='panel'><h2>Application problem</h2><p>$($sol.description)</p><h2>Potential equipment damage</h2><p>Uncontrolled ferrous material may damage crushers, belts, screens and downstream equipment.</p><h2>Recommended magnetic solution</h2><p>Permanent and electromagnetic options should be compared according to burden depth, suspension height and operating duty.</p><h2>Permanent versus electromagnetic options</h2><p>Permanent magnets are simple and do not require magnet power. Electromagnetic separators may be selected for adjustable magnetic force, larger gaps or demanding duty after electrical conditions are confirmed.</p><h2>Installation position</h2><p>Cross-belt and inline positions depend on conveyor layout, transfer points, discharge path, maintenance access and structural support.</p><h2>Selection parameters</h2><ul class='check-list'><li>Material type and particle size</li><li>Conveyor width, speed and layer thickness</li><li>Cross-belt or inline position</li><li>Dust, heat, humidity and voltage conditions</li></ul><h2>Optional configurations</h2><p>Outdoor protection, dust protection, corrosion-resistant options, control cabinet options and self-cleaning discharge can be reviewed after site data is confirmed.</p><h2>Maintenance considerations</h2><p>Maintenance access, belt clearance, cleaning mechanism inspection and spare parts planning should be considered before final selection.</p></article><aside class='panel'><h3>Recommended products</h3><ul class='check-list'><li>Suspended Permanent Magnetic Separator</li><li>Permanent Overband Magnetic Separator</li><li>Suspended Electromagnetic Separator</li></ul><a class='button primary' href='$base/request-a-quote/'>Request a Quote</a></aside></section><section class='section band'>$(FAQ @(@('Permanent or electromagnetic?','Permanent equipment is often simple and energy-free for the magnet itself. Electromagnetic equipment can be selected where adjustable force or demanding duty is required.'),@('Where should it be installed?','Installation position depends on conveyor layout, transfer point, suspension height and maintenance access.')))</section>"
  WritePage "$base/solutions/$($sol.slug)/" "$($sol.name) | Cowinmagnet South Africa" "$($sol.name) magnetic separator solution for African mining and industrial projects." $sol.name $body
}

WritePage "$base/markets/" "African Markets | Cowinmagnet Magnetic Separation Equipment" "Country market pages for South Africa, Botswana, Namibia, Zimbabwe, Zambia, Mozambique, Angola, Ghana, Nigeria, Kenya, Tanzania and DRC." "African Markets" ((PageHero "<a href='$base/'>Home</a> / African Markets" "Markets" "Magnetic Separator Solutions for African Markets" "Country pages with independent content and no unverified local entity claims.") + "<section class='section'>$(CardGrid $markets "$base/markets" "Market")</section>")
foreach($m in $markets) {
  $regionLinks = if($m.slug -eq "south-africa"){"<section class='section band'><div class='section-heading'><h2>South Africa regions</h2></div><div class='grid'>$(($regions | ForEach-Object {"<a class='card' href='$base/markets/south-africa/$($_.slug)/'><h3>$($_.name)</h3><p>Regional page for magnetic separator requirements and logistics notes.</p></a>"}) -join '')</div></section>"}else{""}
  $body = (PageHero "<a href='$base/'>Home</a> / <a href='$base/markets/'>Markets</a> / $($m.name)" "Market" "Magnetic Separator Solutions for $($m.name)" "Main industries: $($m.focus)") + "<section class='section layout'><article class='panel'><h2>Main local industries and minerals</h2><p>$($m.focus)</p><h2>Typical conveyor applications</h2><p>Mining conveyors, transfer points, crushing plants, bulk terminals and industrial material handling may need magnetic separation review.</p><h2>Environmental and electrical conditions</h2><p>Confirm dust, humidity, altitude, ambient temperature, voltage, frequency and number of phases before equipment configuration.</p><h2>Logistics information</h2><p>Cowinmagnet can coordinate export documentation and logistics communication from China. No local stock or local warehouse is claimed.</p></article><aside class='panel'><h3>Recommended products</h3><ul class='check-list'><li>Overband magnetic separators</li><li>Suspended electromagnetic separators</li><li>Magnetic pulleys and drums</li></ul><a class='button primary' href='$base/request-a-quote/'>Enquire for $($m.name)</a></aside></section>$regionLinks"
  WritePage "$base/markets/$($m.slug)/" "Magnetic Separator Solutions for $($m.name) | Cowinmagnet" "Magnetic separation equipment support for $($m.name) mining and industrial markets without unverified local office or stock claims." "Magnetic Separator Solutions for $($m.name)" $body
}
foreach($r in $regions) {
  $body = (PageHero "<a href='$base/'>Home</a> / <a href='$base/markets/'>Markets</a> / <a href='$base/markets/south-africa/'>South Africa</a> / $($r.name)" "South Africa Region" "Magnetic Separator Support for $($r.name)" "Regional page for South African mining, quarrying, recycling, cement and conveyor applications.") + "<section class='section layout'><article class='panel'><h2>Regional applications</h2><p>This page is prepared for $($r.name) inquiries. It does not claim local offices, staff, warehouse or project cases.</p><h2>Operating conditions</h2><ul class='check-list'><li>Dust and outdoor installation</li><li>Heavy material loads</li><li>Voltage and frequency confirmation</li><li>Long-distance logistics and maintenance access</li></ul></article><aside class='panel'><a class='button primary' href='$base/request-a-quote/'>Request regional quote</a></aside></section>"
  WritePage "$base/markets/south-africa/$($r.slug)/" "Magnetic Separator Support for $($r.name) | Cowinmagnet South Africa" "Regional magnetic separation equipment support for $($r.name), South Africa." "Magnetic Separator Support for $($r.name)" $body
}

$supportDescriptions = @{
  "Product Selection Guide" = "Guidance for matching magnetic separators to material, throughput, contamination and installation conditions."
  "Installation Guide" = "Guidance for structure, clearance, access, guarding and commissioning inputs."
  "Maintenance Guide" = "Guidance for inspection access, isolation, wear checks and service records."
  "Electrical Specification Guide" = "Guidance for controls, protection, power supply and site operating conditions."
  "High-Temperature Configuration" = "Guidance for material temperature, component protection and project review."
  "Outdoor Installation" = "Guidance for weather exposure, drainage, corrosion, structure and maintenance access."
  "Dust Protection" = "Guidance for enclosures, access, cleaning and site-specific dust conditions."
  "Coastal Corrosion Protection" = "Guidance for equipment finishes, materials, fasteners and inspection planning."
  "Spare Parts Support" = "Guidance for model identification, service duty and replacement records."
  "After-Sales Process" = "Guidance for documentation, commissioning records, troubleshooting and spare-parts coordination."
}
$supportCards = @("Product Selection Guide","Installation Guide","Maintenance Guide","Electrical Specification Guide","High-Temperature Configuration","Outdoor Installation","Dust Protection","Coastal Corrosion Protection","Spare Parts Support","After-Sales Process") | ForEach-Object { [pscustomobject]@{slug=Slug $_; name=$_; description=$supportDescriptions[$_]; image="/assets/images/product-permanent-overband-magnet.webp"} }
WritePage "$base/technical-support/" "Technical Support | Cowinmagnet South Africa" "Selection, installation, maintenance, electrical and environmental guidance for magnetic separation equipment." "Technical Support" ((PageHero "<a href='$base/'>Home</a> / Technical Support" "Support" "Technical Support and Selection Guidance" "Use these resources to prepare accurate product selection data.") + "<section class='section'>$(CardGrid $supportCards "$base/technical-support" "Guide")</section>")
foreach($guide in $supportCards) {
  $guideBody = (PageHero "<a href='$base/'>Home</a> / <a href='$base/technical-support/'>Technical Support</a> / $($guide.name)" "Guide" $guide.name $guide.description) + "<section class='section layout'><article class='panel'><h2>Engineering review scope</h2><p>This guide helps prepare product selection information for African mining, conveyor and industrial sites. It does not replace project-specific confirmation.</p><h2>Data to confirm</h2><ul class='check-list'><li>Material type and maximum lump size</li><li>Conveyor belt width, speed and burden depth</li><li>Suspension height and installation position</li><li>Dust, humidity, temperature, altitude and corrosion conditions</li><li>Voltage, frequency and number of phases</li></ul><h2>Next step</h2><p>Send the confirmed data through the request form so the equipment family and configuration can be reviewed.</p></article><aside class='panel'><h3>Related action</h3><a class='button primary' href='$base/request-a-quote/'>Request a Quote</a><a class='button secondary' href='$base/products/'>View Products</a></aside></section>"
  WritePage "$base/technical-support/$($guide.slug)/" "$($guide.name) | Cowinmagnet Technical Support" "$($guide.description) for magnetic separator project review in South Africa and Africa." $guide.name $guideBody
}
WritePage "$base/downloads/" "Downloads | Cowinmagnet South Africa" "Request catalogues, datasheets, drawings, questionnaires, manuals and spare parts lists for the selected product and application." "Downloads" ((PageHero "<a href='$base/'>Home</a> / Downloads" "Downloads" "Download Centre" "Request documents for the product series and operating conditions under review.") + "<section class='section'><div class='grid'>$(($downloads | ForEach-Object {"<article class='card'><p class='eyebrow'>$($_.type)</p><h3>$($_.name)</h3><p>$($_.status)</p><a class='text-link' href='$base/request-a-quote/'>Request documents</a></article>"}) -join '')</div></section>")

$aboutBody = (PageHero "<a href='$base/'>Home</a> / About Us" "About" "About Cowinmagnet" "Product selection and export coordination for industrial projects in South Africa and across Africa.") + "<section class='section layout'><article class='panel'><h2>What we support</h2><p>Quzhou Qiying Import & Export Co., Ltd. supports international buyers with product selection, supplier coordination, OEM/ODM coordination, production follow-up, pre-shipment inspection, export documentation, logistics coordination, remote installation guidance, spare-parts support and after-sales communication.</p><h2>Regional representation</h2><p>This website does not claim that COWIN MAGNET owns a factory, South African branch, local warehouse, local stock or local installation team.</p></article><aside class='panel'><h3>Company information</h3><p>Quzhou Qiying Import & Export Co., Ltd.</p><p>Room 110, 1st Floor, Building 1, Qushidai Future Building, Kecheng District, Quzhou, Zhejiang Province, China</p></aside></section>"
WritePage "$base/about/" "About Cowinmagnet | Product Selection and Export Coordination" "Learn how Cowinmagnet supports product selection and export coordination for African industrial projects." "About Cowinmagnet" $aboutBody
foreach($sub in @("company-profile","quality-control","export-service","oem-odm-coordination","why-choose-us")) {
  WritePage "$base/about/$sub/" "$((Get-Culture).TextInfo.ToTitleCase($sub.Replace('-',' '))) | Cowinmagnet" "About Cowinmagnet $sub support for magnetic separation equipment export projects." "$((Get-Culture).TextInfo.ToTitleCase($sub.Replace('-',' ')))" ((PageHero "<a href='$base/'>Home</a> / <a href='$base/about/'>About</a> / $sub" "About" "$((Get-Culture).TextInfo.ToTitleCase($sub.Replace('-',' ')))" "Information page for Cowinmagnet support workflow.") + "<section class='section'><article class='panel'><p>Cowinmagnet coordinates this support as an export and solution partner. The page avoids self-owned factory and local South African entity claims.</p></article></section>")
}

WritePage "$base/news/" "News | Cowinmagnet South Africa" "Source-based industry news and magnetic separator guidance for South Africa and African markets." "News" ((PageHero "<a href='$base/'>Home</a> / News" "News" "Cowinmagnet South Africa News" "Source-based industry analysis and magnetic separator guidance for African project teams.") + "<section class='section'><form class='filter-panel'><label>Search news<input data-site-search type='search' placeholder='coal, maintenance, overband'></label><label>Category<select><option>All</option><option>Mining</option><option>Coal Handling</option><option>Cement and Aggregates</option><option>Recycling</option></select></label></form><div class='grid'>$(($articles | Where-Object { -not $_.status -or $_.status -eq 'published' } | ForEach-Object {"<a class='card news-card' href='$base/news/$($_.slug)/'><p class='eyebrow'>$(ArticleDateText $_)</p><h3>$($_.title)</h3><p>$(if($_.excerpt){$_.excerpt}else{$_.summary})</p><span class='tag'>$(if($_.category){$_.category}else{'News'})</span></a>"}) -join '')</div></section>")
WritePage "$base/blog/" "News Archive | Cowinmagnet South Africa" "Legacy blog archive for Cowinmagnet South Africa news and magnetic separator articles." "News Archive" ((PageHero "<a href='$base/'>Home</a> / News Archive" "Archive" "News Archive" "This legacy blog route is kept for older links. Current updates are published in News.") + "<section class='section'><div class='grid'>$(($articles | Where-Object { -not $_.status -or $_.status -eq 'published' } | ForEach-Object {"<a class='card news-card' href='$base/news/$($_.slug)/'><p class='eyebrow'>$(ArticleDateText $_)</p><h3>$($_.title)</h3><p>$(if($_.excerpt){$_.excerpt}else{$_.summary})</p><span class='tag'>Open in News</span></a>"}) -join '')</div></section>")
foreach($a in $articles) {
  $articleDate = ArticleDateText $a
  $articleContent = if($a.content){SafeArticleHtml $a.content}else{"<h2>Overview</h2><p>$($a.summary) Equipment must be selected according to verified operating data, not generic assumptions.</p><h2>Selection factors</h2><ul class='check-list'><li>Material type and conveyor data</li><li>Installation position and available clearance</li><li>Dust, heat, humidity and voltage conditions</li><li>Maintenance access and spare parts planning</li></ul>"}
  $articleCover = ArticleCover $a
  $body = (PageHero "<a href='$base/'>Home</a> / <a href='$base/news/'>News</a> / $($a.title)" "News" $a.title $a.summary) + "<section class='section layout'><article class='panel article-prose'><p><strong>Date:</strong> $articleDate</p>$articleCover$articleContent</article><aside class='panel'><h3>Related products</h3><a href='$base/products/metal-detection-and-recycling-sorting/permanent-overband-magnetic-separator/'>Permanent Overband Magnetic Separator</a><a class='button primary' href='$base/request-a-quote/'>Enquire</a></aside></section>"
  $body = $body.Replace("Local publishing note", "Selection guidance").Replace("This page structure is ready for South Africa and Africa market news. Replace this draft article body with verified local news content when available.", "Use verified operating data and a project-specific engineering review before selecting equipment.")
  WritePage "$base/news/$($a.slug)/" "$($a.title) | Cowinmagnet News" "$($a.summary)" $a.title $body
  WritePage "$base/blog/$($a.slug)/" "$($a.title) | Cowinmagnet News" "$($a.summary)" $a.title ((PageHero "<a href='$base/'>Home</a> / <a href='$base/news/'>News</a> / $($a.title)" "News" $a.title $a.summary) + "<section class='section'><article class='panel'><p>This legacy article URL is kept for older links.</p><a class='button primary' href='$base/news/$($a.slug)/'>Open current News page</a></article></section>")
}

$quoteFields = @("Name*|name|text","Company*|company|text","Country*|country|text","Province or Region|region|text","Email*|email|email","WhatsApp*|whatsapp|tel","Preferred Language|preferredLanguage|text","Product Required*|productRequired|text","Industry|industry|text","Material Type*|materialType|text","Maximum Material Size|materialSize|text","Capacity|capacity|text","Conveyor Belt Width*|beltWidth|text","Belt Speed|beltSpeed|text","Material Layer Thickness|layerThickness|text","Suspension Height*|suspensionHeight|text","Installation Position|installationPosition|text","Cross-Belt or Inline|layout|text","Manual or Self-Cleaning|cleaning|text","Maximum Tramp Iron Size|trampIronSize|text","Maximum Tramp Iron Weight|trampIronWeight|text","Operating Hours|operatingHours|text","Indoor or Outdoor|siteType|text","Ambient Temperature|temperature|text","Altitude|altitude|text","Dust Level|dustLevel|text","Humidity|humidity|text","Coastal Environment|coastal|text","Site Voltage|voltage|text","Frequency|frequency|text","Number of Phases|phases|text")
$inputs = ($quoteFields | ForEach-Object { $f=$_.Split("|"); $req=if($f[0].EndsWith("*")){" required"}else{""}; $label=$f[0].Replace("*",""); "<label>$label<input name='$($f[1])' type='$($f[2])'$req></label>" }) -join ""
$quoteBody = (PageHero "<a href='$base/'>Home</a> / Request a Quote" "Quote" "Request a Magnetic Separator Quote" "Send project data for product selection support.") + "<section class='section'><form class='quote-form panel' data-quote-form>$inputs<label class='full'>Project Description<textarea name='projectDescription' rows='5'></textarea></label><label class='full'>File Upload<input name='fileUpload' type='file' accept='.pdf,.jpg,.jpeg,.png,.doc,.docx'></label><button class='button primary full' type='submit'>Submit Inquiry</button><output class='form-status full' data-form-status></output></form></section>"
WritePage "$base/request-a-quote/" "Request a Quote | Cowinmagnet South Africa" "Submit magnetic separator project details including country, product, industry, material, conveyor data and operating conditions." "Request a Magnetic Separator Quote" $quoteBody
WritePage "$base/contact/" "Contact Cowinmagnet South Africa | Magnetic Separator Support" "Contact Cowinmagnet for magnetic separation equipment selection, export coordination and African project support." "Contact Cowinmagnet" ((PageHero "<a href='$base/'>Home</a> / Contact" "Contact" "Contact Cowinmagnet" "Send product selection and project questions.") + "<section class='section layout'><article class='panel'><h2>Contact form</h2><form class='quote-form' data-quote-form><label>Name<input name='name' required></label><label>Company<input name='company' required></label><label>Email<input name='email' type='email' required></label><label>WhatsApp<input name='whatsapp' required></label><label class='full'>Message<textarea name='productRequired' required></textarea></label><button class='button primary full'>Send Inquiry</button><output class='form-status full' data-form-status></output></form></article><aside class='panel'><h3>Contact details</h3><p>Quzhou Qiying Import & Export Co., Ltd.</p><p>davidsha@cowinmagnet.com</p><p>WhatsApp: +86 156 6513 5205</p><p>Global website: www.cowinmagnet.com</p><p>Business hours: China business hours, export communication support for African inquiries.</p></aside></section>")
WritePage "$base/search/" "Search | Cowinmagnet South Africa" "Search products, industries, solutions, markets, news and downloads." "Search Website" ((PageHero "<a href='$base/'>Home</a> / Search" "Search" "Search Website" "Search products, industries, solutions, markets, news and downloads.") + "<section class='section'><form class='filter-panel'><label>Search<input data-site-search type='search' placeholder='Type a keyword and press Enter'></label></form><div class='grid' data-search-results></div><div class='panel' data-search-empty><strong>Search no results state</strong><p>If no result matches, try product family, material, industry or country keywords.</p></div></section>")

function LegalPageContent($legal) {
  switch ($legal) {
    "privacy-policy" {
      return "<section class='section'><article class='panel article-prose'><h2>Information we collect</h2><p>When you submit an enquiry, we may collect your name, company, contact details, project requirements and supporting files. We use this information to respond to your request, prepare selection guidance and coordinate a quotation.</p><h2>How we use and protect information</h2><p>Information is used only for legitimate business communication, product selection and after-sales follow-up where requested. Access is limited to personnel and service providers involved in these activities. Do not send confidential project information unless you are authorised to share it.</p><h2>Contact</h2><p>To ask about information connected with an enquiry, contact <a href='mailto:davidsha@cowinmagnet.com'>davidsha@cowinmagnet.com</a>.</p></article></section>"
    }
    "cookie-policy" {
      return "<section class='section'><article class='panel article-prose'><h2>Cookies and similar technologies</h2><p>This website may use essential cookies to provide core functions and may use analytics technologies to understand aggregate site use. These technologies do not change the technical information presented on product pages.</p><h2>Your choices</h2><p>You can control or delete cookies through your browser settings. Blocking essential cookies may affect some features, including form submission and language preferences.</p><h2>Contact</h2><p>For questions about this policy, contact <a href='mailto:davidsha@cowinmagnet.com'>davidsha@cowinmagnet.com</a>.</p></article></section>"
    }
    default {
      return "<section class='section'><article class='panel article-prose'><h2>Use of this website</h2><p>Website content is provided for general product and process information. Product suitability, configuration, availability, drawings, specifications and commercial terms are confirmed only through a written quotation and engineering review.</p><h2>Technical information</h2><p>Selection depends on the actual material, process, installation conditions and applicable requirements. Do not rely on a webpage alone for design, safety or procurement decisions.</p><h2>Contact</h2><p>For a project-specific discussion, contact <a href='mailto:davidsha@cowinmagnet.com'>davidsha@cowinmagnet.com</a> or submit a <a href='$base/request-a-quote/'>quote request</a>.</p></article></section>"
    }
  }
}

foreach($legal in @("privacy-policy","cookie-policy","terms-and-conditions")) {
  $legalTitle = (Get-Culture).TextInfo.ToTitleCase($legal.Replace('-',' '))
  $legalDescription = switch ($legal) {
    "privacy-policy" { "How COWIN MAGNET handles enquiry information for product selection and quotation support." }
    "cookie-policy" { "Information about cookies and analytics technologies used on the COWIN MAGNET website." }
    default { "Terms for using COWIN MAGNET website information and requesting project-specific product guidance." }
  }
  WritePage "$base/$legal/" "$legalTitle | Cowinmagnet" $legalDescription $legalTitle ((PageHero "<a href='$base/'>Home</a> / $legal" "Policy" $legalTitle $legalDescription) + (LegalPageContent $legal))
}

$notFound = (PageHero "<a href='$base/'>Home</a> / 404" "404" "Page Not Found" "The requested page could not be found.") + "<section class='section'><div class='grid'><a class='card' href='$base/'>Return Home</a><a class='card' href='$base/products/'>View Products</a><a class='card' href='$base/search/'>Search Website</a><a class='card' href='$base/contact/'>Contact Us</a></div></section>"
WritePage "$base/404/" "Page Not Found | Cowinmagnet South Africa" "Page not found. Return home, view products, search website or contact Cowinmagnet." "Page Not Found" $notFound

# Legacy regional language routes remain available with English technical content until verified translations are supplied.
foreach($lang in @("af-za","zu-za","xh-za","st-za","tn-za")) {
  $sourceRoot = Join-Path $root "en-za"
  $targetRoot = Join-Path $root $lang
  if (Test-Path -LiteralPath $targetRoot) { Remove-Item -LiteralPath $targetRoot -Recurse -Force }
  Get-ChildItem -Path $sourceRoot -Recurse -Filter index.html | ForEach-Object {
    $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart("\")
    $target = Join-Path $targetRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $content = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
    $content = $content.Replace('/en-za/', "/$lang/")
    $content = $content.Replace("$siteUrl/en-za/", "$siteUrl/$lang/")
    $content = $content.Replace('lang="en-ZA" data-locale="en-za"', "lang=""$lang"" data-locale=""$lang""")
    $content = $content.Replace("<option value='en-za' selected>", "<option value='en-za'>")
    $content = $content.Replace("<option value='$lang'>", "<option value='$lang' selected>")
    $notice = "<section class='section band'><div class='panel'><strong>English technical content</strong><p>This route currently provides the English version of COWIN MAGNET product information. Technical content is maintained in English to avoid untranslated engineering claims.</p></div></section>"
    $content = $content.Replace('</main>', "$notice`n  </main>")
    Set-Content -LiteralPath $target -Encoding UTF8 -NoNewline -Value (($content -replace '(?m)[ \t]+$', '').TrimEnd() + "`n")
  }
}

# Future Africa-wide language routes are prepared as entry pages.
foreach($lang in @("en-africa","fr-africa","pt-africa","sw-africa","ar-africa")) {
  $dir = Join-Path $root "$lang"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $futureDescription = "Cowinmagnet $lang future language route for magnetic separator products, African market pages and verified regional content coverage."
  $futureSchema = @{ "@context"="https://schema.org"; "@type"="WebPage"; name="Cowinmagnet $lang"; url="$siteUrl/$lang/"; description=$futureDescription; inLanguage=$lang } | ConvertTo-Json -Depth 5 -Compress
  $html = "<!doctype html><html lang='$lang' data-locale='$lang'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><meta name='robots' content='$robotsMeta'><title>Cowinmagnet $lang | Magnetic Separator Africa</title><meta name='description' content='$futureDescription'><link rel='canonical' href='$siteUrl/$lang/'><link rel='icon' href='/favicon.ico?v=20260808' sizes='any'><link rel='icon' type='image/png' sizes='32x32' href='/favicon-32x32.png?v=20260808'><link rel='apple-touch-icon' href='/apple-touch-icon.png?v=20260808'><meta property='og:title' content='Cowinmagnet $lang'><meta property='og:description' content='$futureDescription'><meta property='og:image' content='$siteUrl/assets/images/hero-mining-conveyor-magnet.webp'><link rel='stylesheet' href='../assets/site.css'><script type='application/ld+json'>$futureSchema</script></head><body><main class='page-hero'><p class='eyebrow'>Language route</p><h1>Cowinmagnet $lang</h1><p>This future language route is prepared. Verified translation and content coverage are pending.</p><div class='actions'><a class='button primary' href='/en-za/products/'>View English Products</a><a class='button secondary' href='/en-za/'>English Home</a></div></main></body></html>"
  Set-Content -LiteralPath (Join-Path $dir "index.html") -Encoding UTF8 -NoNewline -Value (($html -replace '(?m)[ \t]+$', '').TrimEnd() + "`n")
}

# Structured data directories for future framework migration and content expansion.
$dataRoot = Join-Path $root "data"
foreach($folder in @("products","categories","industries","solutions","markets","articles","downloads","translations")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dataRoot $folder) | Out-Null
}
ConvertTo-Json -InputObject @($products) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "products\products.json") -Encoding UTF8
ConvertTo-Json -InputObject @($categories) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "categories\categories.json") -Encoding UTF8
ConvertTo-Json -InputObject @($industries) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "industries\industries.json") -Encoding UTF8
ConvertTo-Json -InputObject @($solutions) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "solutions\solutions.json") -Encoding UTF8
ConvertTo-Json -InputObject @($markets) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "markets\markets.json") -Encoding UTF8
if (-not (Test-Path -LiteralPath $articleFile)) {
  ConvertTo-Json -InputObject @($articles) -Depth 8 | Set-Content -LiteralPath $articleFile -Encoding UTF8
}
ConvertTo-Json -InputObject @($downloads) -Depth 8 | Set-Content -LiteralPath (Join-Path $dataRoot "downloads\downloads.json") -Encoding UTF8
@{
  supportedLocales=@("en-za");
  fallback="English technical content is provided where a verified translation is not available.";
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $dataRoot "translations\locales.json") -Encoding UTF8

$searchIndex = @()
$searchIndex += $products | ForEach-Object { [pscustomobject]@{title=$_.name; type="Product"; url="/en-za/products/$($_.categorySlug)/$($_.slug)/"; summary="$($_.category) - $($_.applications -join ', ')"} }
$searchIndex += $industries | ForEach-Object { [pscustomobject]@{title=$_.name; type="Industry"; url="/en-za/industries/$($_.slug)/"; summary=$_.description} }
$searchIndex += $solutions | ForEach-Object { [pscustomobject]@{title=$_.name; type="Solution"; url="/en-za/solutions/$($_.slug)/"; summary=$_.description} }
$searchIndex += $markets | ForEach-Object { [pscustomobject]@{title=$_.name; type="Market"; url="/en-za/markets/$($_.slug)/"; summary=$_.focus} }
$searchIndex += $articles | ForEach-Object { [pscustomobject]@{title=$_.title; type="News"; url="/en-za/news/$($_.slug)/"; summary=$_.summary} }
$searchIndex += $downloads | ForEach-Object { [pscustomobject]@{title=$_.name; type="Download"; url="/en-za/downloads/"; summary=$_.status} }
ConvertTo-Json -InputObject @($searchIndex) -Depth 5 | Set-Content -LiteralPath (Join-Path $dataRoot "search-index.json") -Encoding UTF8

# Windows PowerShell's UTF8 Set-Content adds a BOM. Static HTML is served as UTF-8
# without one so repeated builds do not create unrelated file churn.
@("en-za","af-za","zu-za","xh-za","st-za","tn-za") | ForEach-Object {
  $localeRoot = Join-Path $root $_
  if (-not (Test-Path -LiteralPath $localeRoot)) { return }
  Get-ChildItem -LiteralPath $localeRoot -Recurse -Filter "index.html" | ForEach-Object {
    $text = [System.IO.File]::ReadAllText($_.FullName)
    [System.IO.File]::WriteAllText($_.FullName, $text.TrimStart([char]0xFEFF), (New-Object System.Text.UTF8Encoding($false)))
  }
}

# Sitemaps and robots
$allPages = Get-ChildItem -Path (Join-Path $root "en-za") -Recurse -Filter index.html | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).Replace("\","/").Replace("/index.html","/")
  "  <url><loc>$siteUrl$rel</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>"
}
Set-Content -LiteralPath (Join-Path $root "sitemap.xml") -Encoding UTF8 -Value ("<?xml version='1.0' encoding='UTF-8'?>`n<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>`n$($allPages -join "`n")`n</urlset>")
if ($isProduction) {
  Set-Content -LiteralPath (Join-Path $root "robots.txt") -Encoding UTF8 -Value "User-agent: *`nAllow: /`nDisallow: /admin/`nDisallow: /api/`n`nSitemap: $siteUrl/sitemap.xml"
} else {
  Set-Content -LiteralPath (Join-Path $root "robots.txt") -Encoding UTF8 -Value "User-agent: *`nDisallow: /`n`n# Local/test build only. Remove noindex/disallow only after the production domain is confirmed.`nSitemap: $siteUrl/sitemap.xml"
}

Write-Host "Generated static multipage site under $root"


