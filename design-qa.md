# South Africa inner-page design QA

**Findings**

- [P2, resolved] Mobile header labels duplicated and the regional brand line disappeared at 390 CSS px. The first capture showed the legacy header's generated Quote and Menu labels alongside the visible controls. The revised inner-page styles show a single label per control, keep the brand line, and preserve the existing drawer. The mobile comparison below shows the corrected header.
- [P2, resolved] The server-rendered News and Blog indexes omitted the mobile drawer found on other pages. Both now receive the same menu trigger, links, and open/close behavior. Verified on both indexes in the browser; the open drawer exposed 24 links without page overflow.
- No remaining P0/P1/P2 findings in the compared states. The implementation retains working dropdowns, full breadcrumbs, and product-specific headings and links. The reference uses simplified navigation and shorter display copy.

**Comparison evidence**

The approved reference and latest browser captures are in the adjacent `设计预览-20261105` folder. The composites put the reference on the left and the rendered site on the right at equal scale. Both captures show the Wet Drum Magnetic Separator page, with Overview selected, a closed menu, and no query parameters.

| Viewport (CSS px) | Reference and implementation | Native dimensions | Comparison |
|---|---|---|---|
| 1120 × 920 | `桌面-产品详情.png`, `验收-桌面产品.png` | 1120 × 920 each | `对照-桌面产品.png` |
| 390 × 844 | `手机-产品详情.png`, `验收-手机产品.png` | 390 × 844 each | `对照-手机产品.png` |

Both pairs use 1× density, with no browser chrome or phone frame. The full view confirms the navy product introduction, actual equipment photograph, white key-fact strip, and single active tab. At native scale, the focused header, call-to-action, photograph, and tab regions show:

- **Typography:** The heading scale and line breaks match on the sampled desktop and phone widths. Body copy is legible with the existing site font stack and wraps without truncation. The longer real breadcrumb wraps on mobile.
- **Spacing:** The desktop introduction aligns its text and photo columns; at 390 px the photo follows the actions and the key facts stack. Consistent dividers separate facts and tabs. The wider desktop quote button fits beside the specifications action.
- **Colors:** The navy introduction, orange primary action, white text, neutral surfaces, and distinct selected/focus tab states follow the approved direction. The active label and underline remain distinguishable without relying on color alone.
- **Images and icons:** The real product image retains its subject and aspect ratio without crop loss. The same Cowinmagnet logo remains. UI icons use licensed Lucide and Feather vectors with consistent strokes; decorative icons do not repeat control names to screen readers.
- **Copy and content:** The live product title, specs, catalogue links, and enquiry steps take precedence over shortened prototype wording. Spec values awaiting confirmation remain explicitly labeled. Browser captures of the catalogue, mining industry page, and enquiry page are also saved in the preview folder.

**Implementation checklist**

- [x] Check desktop and mobile layout with browser samples at 390, 430, 768, 1120, and 1440 CSS px. Checked for overflow, broken images, and browser console errors.
- [x] Verify product tab selection by click and keyboard, deep link to Installation & care, enquiry expansion, quote prefill, and required-field validation. Exactly one product panel is visible at a time with JavaScript active.
- [x] Verify the catalogue's 12-item pages, query-string pagination, and filtering. News and Blog use the same pagination design with up to 9 ordinary cards per page, plus an optional featured article.
- [x] Pass the production build, 31 existing regression tests, and HTTP smoke checks of the approved inventory and sitemap. The local scan enumerates 204 inner URLs and verifies 203; one database-backed Blog URL is required in the live scan. The smoke check also verifies canonical URLs, expected 404s, feeds, robots, and static assets.
- [x] Compare home HTML and its original CSS and JS against the production baseline by SHA-256. All three match in the local production build.

**Residual coverage**

Live content and shared resources are checked again after deployment. Browser checks use representative page templates and test the enquiry workflow up to submission without creating a customer enquiry.

Release recovery: `backup/za-inner-design-20261105` marks the previous Git state; the previous Vercel production deployment is `dpl_6t8xr287ve9MaDm4mTpSh2cThMJ4`.

final result: passed
