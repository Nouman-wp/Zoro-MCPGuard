# Neoconda.com — Full UI / UX / Frontend Teardown

> **Subject:** https://neoconda.com/ (pre-launch waitlist site for the Neoconda handheld cyber device, NEOCONDA LLC)
> **Analysed:** 2026-11-06, from the served HTML (152 KB), the Webflow stylesheet (97 KB) and the three active custom
> scripts on Cloudflare R2 (`heroScript.js`, `explodeModel.js`, `neoconda-script.copy.js`).
> **Method:** static source analysis. The page was **not** rendered in a browser for this report; motion is described
> from code (constants, ScrollTrigger configs, easings), not from screen recordings. Where something is inferred
> rather than read directly from code, it is marked *(inferred)*.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Technology stack](#2-technology-stack)
3. [Architecture and load sequence](#3-architecture-and-load-sequence)
4. [Information architecture and navigation](#4-information-architecture-and-navigation)
5. [Section-by-section breakdown](#5-section-by-section-breakdown)
6. [3D system (Three.js)](#6-3d-system-threejs)
7. [Scroll choreography (GSAP + ScrollTrigger + Lenis)](#7-scroll-choreography)
8. [Micro-interactions and text effects](#8-micro-interactions-and-text-effects)
9. [Visual design system](#9-visual-design-system)
10. [Component library](#10-component-library)
11. [Responsive behaviour](#11-responsive-behaviour)
12. [Forms, data and third parties](#12-forms-data-and-third-parties)
13. [SEO and metadata](#13-seo-and-metadata)
14. [Performance audit](#14-performance-audit)
15. [Accessibility audit](#15-accessibility-audit)
16. [Content and UX issues](#16-content-and-ux-issues)
17. [Engineering hygiene](#17-engineering-hygiene)
18. [Prioritised recommendations](#18-prioritised-recommendations)
19. [How to rebuild this experience (reference blueprint)](#19-how-to-rebuild-this-experience)
20. [Appendix — raw inventories](#20-appendix--raw-inventories)

---

## 1. Executive summary

| Aspect | Verdict |
| --- | --- |
| Type | Single-page, scroll-driven product launch site with waitlist capture |
| Build | **Webflow** (layout, CMS-style editing, forms, hosting) + **hand-written Three.js / GSAP** modules on Cloudflare R2 |
| Signature experience | Preloader → 3D device hero with live video on its screen → logo flies into the nav → long pinned scroll story → **exploded 3D device with projected hotspot labels** → spec grid → waitlist |
| Aesthetic | "Hacker hardware": near-black canvas, neon green accent, monospace labels, scrambled-text reveals, LCD countdown |
| Strengths | Strong art direction; carefully tuned per-breakpoint 3D scaling (~70 named constants); desktop-only smooth scroll; touch-device fallback for text animation |
| Biggest risks | **38 MB 3D model**, **GSAP loaded ~4×** (two instances), assets on rate-limited `r2.dev`, `@latest` CDN pins, debug code in production, countdown already expired, **page reloads on breakpoint resize**, no reduced-motion path |

---

## 2. Technology stack

### 2.1 Platform

| Layer | Detail | Evidence |
| --- | --- | --- |
| CMS / builder | Webflow (site id `69d660abd07691d10eb7ed1f`) | `cdn.prod.website-files.com/69d660…`, `w-nav`, `w-form`, `w-node-…` ids, `w-mod-js` bootstrap |
| Edge | Cloudflare (`Server: cloudflare`, `CF-Cache-Status: HIT`) | Response headers |
| Webflow runtime | `webflow.schunk.*.js`, `webflow.*.js`, jQuery 3.5.1 | Script tags |
| Custom code host | Cloudflare **R2 public dev bucket** `pub-28ca259d….r2.dev/3dtest/neoconda-test/…` | Script / model / video URLs |

### 2.2 Libraries (as actually loaded)

| Library | Version / source | Role |
| --- | --- | --- |
| GSAP core | 3.12.5 (cdnjs, global `window.gsap`) | Global animations, inline scripts |
| GSAP ScrollTrigger | 3.12.5 (cdnjs) | Scroll-linked timelines |
| GSAP Flip | 3.12.5 (cdnjs) | Layout transitions *(loaded; usage not confirmed in active scripts)* |
| GSAP SplitText | 3.14.2 (Webflow CDN) | Line splitting for text reveals |
| GSAP ScrambleTextPlugin | 3.14.1 (jsDelivr) | "Decoding" text effect |
| GSAP (ES module) | 3.12.5 (unpkg, via importmap) | Used **inside** the Three.js modules — a **second, separate GSAP instance** |
| Three.js | 0.160.0 (unpkg, importmap) | WebGL scenes |
| Three addons | `GLTFLoader`, `EXRLoader`, `meshopt_decoder` | Model + HDRI loading |
| meshoptimizer | 0.18.1 (unpkg) | Mesh decompression |
| lil-gui | 0.19.1 | **Debug GUI** (imported in production) |
| Lenis | 0.2.28 (`studio-freight` bundle, jsDelivr) | Smooth scrolling (desktop only) |
| Lottie | `@lottiefiles/lottie-player@latest` **and** `@dotlottie/player-component@latest` | Line-art animations |
| split-type | unversioned (unpkg) | Text splitting (duplicate of SplitText) |
| Google Fonts | Space Grotesk 400/500/700 | Loaded; not referenced by the main stylesheet *(possibly unused)* |

### 2.3 Importmap

```json
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
    "lil-gui": "https://unpkg.com/lil-gui@0.19.1/dist/lil-gui.esm.min.js",
    "gsap": "https://unpkg.com/gsap@3.12.5/index.js",
    "gsap/ScrollTrigger": "https://unpkg.com/gsap@3.12.5/ScrollTrigger.js"
  }
}
```

### 2.4 Custom script versions present in the HTML

| File | Status |
| --- | --- |
| `2026-july-17/heroScript.js` (126 KB, 3,944 lines) | **Active** |
| `2026-july-17/explodeModel.js` (72 KB, 2,367 lines) | **Active** |
| `2026-july-20/neoconda-script.copy.js` (60 KB, 2,556 lines) | **Active** |
| `2026-july-13/heroScript.js`, `2026-july-13/explodeModel.js` | Commented out |
| `2026-may-20-live/explodeModel.js`, `2026-may-20-live/neoconda-script.copy.js` | Commented out |
| `2026-may-25/heroScript-stagging.js` | Commented out (but its log prefix `[heroScript-stagging]` survives in the active hero script) |

The folder-per-date pattern is a manual deployment/versioning scheme: a new dated folder is uploaded to R2 and the
`<script>` tag in Webflow custom code is swapped.

---

## 3. Architecture and load sequence

```mermaid
sequenceDiagram
  participant B as Browser
  participant WF as Webflow CDN
  participant R2 as Cloudflare R2
  participant U as unpkg / jsDelivr / cdnjs
  B->>WF: HTML (cached at Cloudflare)
  B->>B: w-mod-js / w-mod-touch classes; anti-flicker class (≤ 4 s)
  B->>WF: webflow.css, Webflow JS, jQuery
  B->>U: GSAP 3.12.5 + ScrollTrigger + Flip, SplitText, ScrambleText, Lenis, Lottie x2, split-type
  B->>B: Consent manager (nc_consent cookie, 1.4 s delay), GA4, Intellimize
  B->>U: importmap → three@0.160, gsap module, lil-gui
  B->>R2: heroScript.js (module)
  R2-->>B: neoconda-hero-header.glb (2.2 MB) + studio_small_08_1k.exr
  B->>B: Preloader % = weighted task progress (DOM + model + textures)
  B->>R2: explodeModel.js → "Explode model.glb" (38.3 MB)
  B->>R2: neoconda-script.copy.js → videos (.webm), Lottie JSON
  B->>B: window "load" → text reveals, divider lines, globe canvas
```

### 3.1 DOM skeleton

```
body
├── #preloader.preloader-wrapper            fixed overlay, z-index 100, pointer-events none
│   ├── #preloader-first.preloader-number-wrap
│   │   ├── .logo_preloader (inline SVG)
│   │   └── .preloader-load-wrap > .preloader-num-text + #preloader-number
│   └── #pre-one / #pre-two / #pre-three .preloader-bg   (stacked reveal panels)
└── .page-wrapper
    ├── .canvas-wrap > .canvas-wrapper (embed)          ← hero WebGL canvas host
    ├── .global-styles (embed)                          ← extra CSS injected via embed
    └── main.main-wrapper
        ├── .nav_fixed > .nav_component.w-nav           (fixed nav, z 999)
        ├── #hero.section-hero-wrapper                  (hero + #app canvas)
        ├── #about.section-relative-wrap                (about + #target canvas anchor)
        ├── #features-padding / #features               (features story, sliders, sticky scenes)
        │   ├── #trigger-1  .section-dummy (100svh)     ← scroll-distance spacers
        │   ├── #lottiee-section / #scope-2             (Defence Mode)
        │   ├── #trigger-2  .section-dummy (200svh)
        │   ├── #router-details                         (Secure Router + RF protection)
        │   └── #trigger-3  .section-dummy
        ├── #section1.home-sticky-wrap                  (exploded model stage)
        │   ├── #text-animation  (giant gradient words)
        │   ├── #canvas-explode  (WebGL)
        │   └── #labels-container (HTML hotspots)
        ├── #specs.home_device-specification-cards
        ├── #CTA.home_getupdate-component               (waitlist form)
        └── #launching.home_footer-component            (footer)
```

Key pattern: **"dummy" spacer divs** (`.section-dummy`, `min-height: 100svh` / `200svh`) create scroll distance for pinned
WebGL scenes, while the visible content is sticky/fixed. This is the classic Webflow-friendly way to build scroll
stories without a JS pin-spacer.

---

## 4. Information architecture and navigation

### 4.1 Sitemap

| Route | Purpose |
| --- | --- |
| `/` | Everything (single page) |
| `/privacy-policy` | Legal (linked from consent banner and footer) |
| Terms of Service | Footer link |
| `https://socials.neoconda.com/signup` | Post-submit redirect from the waitlist form |

### 4.2 Primary navigation

| Label | Target | Class | Notes |
| --- | --- | --- | --- |
| Home | `#hero` | `.nav_menu_link` | |
| About | `#about` | `.nav_menu_link` | |
| *(logo, centred)* | `/` | `.neoconda-logo` inside the menu, `#nav-logo` | Destination of the hero-logo fly-in (`#nav-logo-destination`) |
| Features | `#features` | `.nav_menu_link` | |
| Specs | `#specs` (`#spec` link id) | `.nav_menu_link` | |
| Order | `#CTA` | `.nav_menu_link.mailing-list` | Labelled "Order" but leads to a waitlist, not a purchase |

Layout: **links split around a centred logo** (2 left, logo, 2–3 right). The nav is transparent
(`background-color:#0000`), fixed (`.nav_fixed`, `position:fixed; inset:0 0 auto`), with `padding-block: 1.56rem`.

### 4.3 Countdown in the nav

`.nav_timer-wrapper` shows **Months : Days : Hours** in the `Digital 7 Mono` LCD font, `#56ff8e`, `2.22rem`.
Two layers exist: the visible digits and an absolutely positioned "ghost" layer (`.nav_timer.abs`) plus a
`.timer-bg` image — the classic LCD look where unlit segments (`88`) sit behind lit digits *(inferred from structure)*.

Countdown logic (`startUSCountdown("August 4, 2026 10:00:00")`):
- Converts the visitor's clock to **US time** before computing the difference.
- Months = `floor(totalDays / 30.44)`.
- When `distance <= 0`, every field shows `00`.
- **As of this analysis the target date has passed, so the timer permanently shows `00 : 00 : 00`.**

### 4.4 Mobile navigation (≤ 991 px)

- Webflow `w-nav-button` hamburger.
- A `gsap.matchMedia("(max-width: 991px)")` block animates `.nav_menu_link` items in with a stagger when the menu
  opens and locks body scroll (`openTimeout` handling).
- `.nav_clip-path` elements (two variants: `hide-above-lanscape`, `hide-mobile-landscape`) provide an angled
  clip-path frame around the nav on different orientations.

---

## 5. Section-by-section breakdown

### 5.0 Preloader

| Property | Detail |
| --- | --- |
| Elements | Logo SVG, "loading" label, `#preloader-number` (JetBrains Mono, 1.88 rem, weight 200), three full-screen `.preloader-bg` panels |
| Progress source | A task tracker in `heroScript.js`: `setTaskProgress('model:<key>', loaded/total)` for each asset, plus a "DOM ready" task — the % is a **real weighted progress**, not a fake timer |
| Exit | Panels `#pre-one/two/three` animate away in sequence *(inferred from naming + structure)*; hero logo reveal starts with `HERO_MODEL_REVEAL_HANDOFF_LEAD_SECONDS = 1.15` overlap |
| Resize behaviour | On a breakpoint-crossing resize the script **reloads the page** and sets `sessionStorage.__neoconda_resize_reload = 'true'`; on that reload the preloader is hidden immediately via injected CSS and skipped |
| Pointer | `pointer-events: none` on the wrapper (doesn't block clicks during fade) |

### 5.1 Hero (`#hero`)

**Layout:** full-viewport stage. Large "NEOCONDA" wordmark (`#hero-logo-large-to-move`, an inline SVG) sits above
the 3D device canvas (`#app`). Below: H1 + secondary line + CTA.

**Copy:**
- H1 `.section_home-heading`: "Neoconda" — Neue Machina, **12 rem**, letter-spacing −21.26 px, gradient text
  `linear-gradient(90deg, #3e3e3e, #d4d4d4 62%, #999 97.6%)`. *Note: `display:none` in the base style — the visible
  wordmark is the SVG; the H1 exists for SEO / is toggled per breakpoint.*
- Tagline `.section_home-secondary-text`: "The revolution in cybersecurity tech is finally here — all in the palm of
  your hands." with `.section_highlight-txt` spans in `#1fe477`.
- CTA: **"EXPLORE NEOCONDA"** → `#about`.

**Motion:**

| Step | Mechanism | Values |
| --- | --- | --- |
| Model entrance | Scale from `HERO_MODEL_ENTRANCE_START_SCALE_RATIO = 0.18` → final | ease `power2.out` / `power3.out` |
| Logo letter reveal | Staggered | `1.8 s`, stagger `0.06 s`, ease `expo.out`; opacity `0.35 s` `cubic-bezier(0.22,1,0.36,1)` |
| Logo → nav handoff | Large hero SVG moves to `#nav-logo-destination` | scroll/position-driven |
| Hero scroll-out | ScrollTrigger on `#hero`, `start:"top top"`, `end:"+=25%"` | `scrub: 1.5` desktop, `0.45` mobile |
| Device screen | `THREE.VideoTexture` × 2 (UI video + terminal video) mapped onto the screen mesh (mesh names matching `screen`, `display`) | sRGB, linear filtering, `flipY=false` |

### 5.2 About (`#about`)

- Two-column: `.section_about-left` holds `#target` (`.canvas-target-block`) — **an invisible anchor the hero
  device travels to** as you scroll, so the same 3D model "lands" beside the about copy *(inferred from the id and
  the main script's `#target` / `#hero-device` queries)*.
- Right column: eyebrow (JetBrains Mono, `#1fe477`) → H2 `.section_about-heading` (Neue Haas Unica,
  `clamp(1.625rem, 0.63rem + 2.91vw, 3.25rem)`, letter-spacing −1.56 px, max 17 ch) → description.
- Copy: "A powerful cyber device designed for reconnaissance, hacking, and security…".

### 5.3 Features (`#features`)

**Header:** eyebrow + H2 "The Most Comprehensive Feature Set in Its Class" (`max-width: 25ch`, centred,
`clamp(1.25rem, …, 3.25rem)`, line-height 1.1).

**Section background:** `linear-gradient(#0e0e0e00, #0e0e0e 6% 50%, #0e0e0e 94%, #0e0e0e00)` — fades in/out so
the section melts into the black page; `min-height: 100svh`; z-index 6.

**Desktop layout (`.sticky-block-grid`):** three columns
- `.section_left-slider-wrap` → cards **01, 03, 05 … 15** (odd)
- `.section_middle-slider` → sticky centre (device / defence visuals)
- `.section_bottom-slider` → cards **02, 04 … 16** (even)
- `.section_lineargrad-overlay` + `.slider-grid-image` → grid texture with gradient mask

The two side columns scroll past the sticky centre, giving a "features orbiting the device" feel *(inferred)*.

**Mobile layout (`.section_responsive-wrapper #mob-res`):** a single list of all 16 cards 01–16 in order.

**Feature card (`.section_slider-card`):** flex row, gap 1.88 rem, max 30 ch, min-height 6.88 rem, margin-bottom 2.5 rem.
- `.card-num-btn`: square (`aspect-ratio:1`), `#2d2d2d` fill, number in `#1fe477` JetBrains Mono.
- `.card-heading-name`: JetBrains Mono 1.31 rem, white.
- `.card-text`: Neue Haas Unica 0.97 rem, `#959595`, line-height 1.2, max 29 ch.

**The 16 features:** C2 Framework · AI Engine · Scanner · BLE · Wardriving · Sub-GHz · NFC/RFID · BadUSB ·
5GHz Deauther · Beacon Spam · Evil Portal · LoRa · GPS · Infrared · Bug Detector · Heartbeat Sensor.

### 5.4 Defence Mode (`#lottiee-section`, `#scope-2`)

- `.home_defence-component`: media left (`.video-code-embed` WebM + `.lottie-container`), copy right.
- Heading `.home_defence-heading` JetBrains Mono 1.38 rem: "Enter Defence Mode".
- Copy: plug in via Ethernet → scans → builds secure Wi-Fi with VPN.
- `.divider-line` elements scale in on scroll (inline script, ScrollTrigger).
- **Lottie is scroll-scrubbed**: frames `200 → 409 → 500` mapped to scroll percentages `20 % → 50 % → 100 %`
  (`LOTTIE_PHASE4_*` constants); fades out from `top 92%` over `0.45 s` (`PHASE5_LOTTIE_FADE_*`).
- Followed by `#trigger-2` spacer of **200 svh** (`.three-hundred-vh` — the class name says 300, the value is 200).

### 5.5 Secure Router + RF Protection (`#router-details`)

`.home_secure-component` two columns:

| Left — Secure Router | Right — RF Protection |
| --- | --- |
| Firewall — "Monitors traffic in real time, adaptively blocking threats instantly…" | Jamming Protection — "Detects signal disruption early…" |
| VPN — "Encrypted tunnel protects your data…" | Anti Spoofing — "Uses cryptography to validate signals in real time…" |
| AD Blocker — "Network-level DNS filtering blocks ads, trackers…" | **Anti Spoofing duplicated, second copy truncated** ("…preventing fake") |

Text style: `.home_secure-text` `#959595`, with `.span-highlight` (white) for the lead phrase. Each item has an
icon (`.home_fetures-image` — note typo in class name) and `.svg-wrap` decorations.

### 5.6 Exploded device stage (`#section1`)

The showpiece.

| Layer | Element | Detail |
| --- | --- | --- |
| Back | `#text-animation .home_text-animate` | Giant words with gradient text `linear-gradient(90deg, #d7d7d7, #474747)`, letter-spacing −10.3 px; hidden on mobile landscape |
| Middle | `#canvas-explode` | Three.js scene with `Explode model.glb` |
| Front | `#labels-container` | Absolutely positioned HTML hotspots: `.hotspot-number` + `.hotspot-line` + `.hotspot-text` |
| Mobile | `.home_model_label_container` | Static numbered label list replaces projected hotspots (`hide-above-lanscape`) |

**Hotspot labels (from code):** Interchangeable SMA Antennas · Tactile Joystick & Button · Expandable GPIO ·
High-speed M.2 slot · High-Capacity Battery (+ 3″ touch display in copy). Lights are named "Top/Bottom Left/Right
Fill Light".

**Label reveal:** `REVEAL_DURATION 0.62 s`, `REVEAL_STEP 0.24 s`, number stagger `0.015 s`, label stagger `0.025 s`.

### 5.7 Specifications (`#specs`)

- H2 "Everything you can think of and more." (max 20 ch, centred).
- Grid of `.home_features-card`: max-width 16.25 rem, min-height 18.44 rem, padding 2.5 rem × 1.78 rem, internal
  grid gap 2.25 rem; icon (`img.circle`), heading (JetBrains Mono 1.03 rem, `#f4f4f4`), description, decorative
  `.card-svg`.
- Each card has **two headings** (`hide-above-lanscape` / `hide-mobile-landscape`) — one per layout, so the
  heading moves position between mobile and desktop.
- Items: SOC RK3576 · RAM 8 GB LPDDR5 · Storage & SD · Battery · Wi-Fi 6E (monitor mode, injection) · ESP32-C5
  co-processor · CC1200 Sub-GHz · NFC/RFID · LoRa · MAX-M10 GPS (anti-jam/anti-spoof) · M.2 expansion · IR · Audio ·
  Dual Ethernet.

### 5.8 Waitlist (`#CTA`)

- `.home_getupdate-component` padding 7.5 rem vertical; inner content padding 4.56 rem, 3-column grid → flex.
- **Inverted panel**: eyebrow and input use black (`color:#000`, `border:1px solid #000`) → the panel is a light /
  accent background *(inferred; background set via image `form-bg` / `res-form-bg`)*.
- Left: eyebrow "GET UPDATES." + H3 "Join the Neoconda waitlist." (`clamp(…, 6.56vw − 1.26rem, 4.64rem)`,
  letter-spacing −3.7 px) + skeleton illustration `.home_neoconda-skelton`.
- Right: "Enter your email…" + form.
- Input `.update_form-input` (id `name`, though it collects email): min-height 4 rem, radius 0.75 rem,
  JetBrains Mono 1.34 rem, right padding 4 rem to make room for the button.
- Submit `.update_form-submit`: **3 × 3 rem black square absolutely positioned inside the input's right edge**, with
  a `.dash` SVG glyph — no visible text label.
- States: success "You're all set!" with tick image; error "Something went wrong..!".
- Decorative `grid_left-wrap` / `grid_right-wrap` images flank the panel.

### 5.9 Footer (`#launching`)

- Background `#161616`, padding 5.94 rem vertical.
- Logo (inline SVG), Privacy Policy, Terms of Service, seven icon links: Instagram, Discord, Reddit, X, TikTok,
  YouTube, Telegram.
- **Social + legal blocks exist twice** (mobile and desktop variants toggled with visibility classes).
- "ALL RIGHTS RESERVED, ©NEOCONDA LLC".

---

## 6. 3D system (Three.js)

### 6.1 Scenes

| Scene | Script | Canvas | Model | Size | Compression |
| --- | --- | --- | --- | --- | --- |
| Hero | `heroScript.js` | `#app` / `.canvas-wrap` | `models/neoconda-hero-header.glb` | **2.19 MB** | meshopt |
| Exploded | `explodeModel.js` | `#canvas-explode` | `models/Explode model.glb` | **38.30 MB** | none detected |

### 6.2 Hero renderer settings

| Setting | Value |
| --- | --- |
| Renderer | `WebGLRenderer`, `setPixelRatio(min(devicePixelRatio, 2))` |
| Tone mapping | `ACESFilmicToneMapping` |
| Environment | `studio_small_08_1k.exr` via `EXRLoader` (loaded from the `sunthings-test` folder of another project) |
| Lights | 3 × `DirectionalLight`, 2 × `SpotLight` |
| Materials | `MeshStandardMaterial` (+ `MeshBasicMaterial` for video screen) |
| Camera | `PerspectiveCamera` |
| Clock | `THREE.Clock` for idle motion |
| Video | 2 × `VideoTexture` (UI + terminal) |

### 6.3 Exploded renderer settings

| Setting | Value |
| --- | --- |
| Lights | 3 × `PointLight`, 2 × `DirectionalLight`, 1 × `AmbientLight` |
| Explosion | Each child mesh stores `start: child.position.clone()`; scroll progress interpolates to an exploded offset computed from bounding boxes (`THREE.Box3`) |
| Labels | 3D anchor points projected to screen space each frame → HTML hotspots positioned in `#labels-container` |
| Debug | `DEBUG = false`, `#debug-hud`, `#explode-scrub` element hooks, lil-gui import |

### 6.4 Responsive 3D fitting (the most engineered part)

Instead of one camera fit, both scripts carry **dozens of breakpoint constants**:

| Constant group | Examples | Meaning |
| --- | --- | --- |
| Desktop | `HERO_DESKTOP_MODEL_SCALE_FACTOR 1.06`, `DESKTOP_992_TO_1420_SCALE_BOOST 1.24`, `ABOVE_1440_MODEL_SCALE_BOOST_AT_1920 1.224` | Scale per width band |
| Safe-fit | `DESKTOP_SAFE_FIT_X 0.54–0.70`, `Y 0.62–0.80`, height 650–900 px | Fraction of viewport the model may occupy |
| Short screens | `HERO_SHORT_HEIGHT_SCALE_START 800 → END 600`, `MIN_FACTOR 0.76` | Shrink on laptops with low height |
| Tablet | `TABLET_LAYOUT 768–991`, `TABLET_PORTRAIT_SCALE_BOOST 1.16–1.28` | |
| Mobile | `MOBILE_SAFE_FIT_X 0.86`, `Y 0.54–0.72`, `MOBILE_MODEL_X_SHIFT_RATIO 0.05`, `HERO_MOBILE_IPHONE_SHORT_HEIGHT_SCALE_ADJUSTMENT 1.18` | Device-class tuning (iPhone widths ≤ 480, short ≤ 720) |
| Text clearance | `MOBILE_TEXT_CLEARANCE_*` | Keeps the model from overlapping headings |
| Resize | `MOBILE_HEIGHT_RESIZE_THRESHOLD 24` px | Ignores mobile URL-bar height jitter |

UX implication: visually precise at the tuned sizes, but fragile at untested ones — which is likely why the team
added the **reload-on-resize** fallback.

---

## 7. Scroll choreography

### 7.1 Smooth scroll (Lenis)

Enabled only when `innerWidth >= 480` **and** (not a mobile UA **or** a mobile device in landscape):

```js
new Lenis({ duration: 1.25, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  direction: 'vertical', gestureDirection: 'vertical', smooth: true,
  wheelMultiplier: 0.8, mouseMultiplier: 0.8, smoothTouch: true, touchMultiplier: 2, lerp: 0.15 })
```

- Driven by its own `requestAnimationFrame` loop — **not** synced to `gsap.ticker` and **no**
  `lenis.on('scroll', ScrollTrigger.update)` call was found in the inline init. ScrollTrigger therefore reads native
  scroll positions while Lenis interpolates them; works, but can cause small desyncs on scrubbed timelines.

### 7.2 Timeline map

| Phase | Trigger | Start → End | Scrub | What moves |
| --- | --- | --- | --- | --- |
| P0 Preloader | asset progress | — | — | % counter, panels |
| P1 Hero intro | load complete | — | — | Logo letters, model scale-in |
| P2 Hero exit | `#hero` | `top top` → `+=25%` | 1.5 (mobile 0.45) | Logo to nav, model rises/rotates |
| P3 Device → About | `#about` / `#target` | `top bottom` → … | 1.5 | Device travels to the about column |
| P4 Defence Lottie | `#lottiee-section` | `top bottom` → `+= 2 × innerHeight` | true | Lottie frames 200→500, scroll video frames (`VIDEO_FPS 30`, `SCRUB_SMOOTHING 0.5`) |
| P5 Router reveal | `#router-details` | Lottie fade `top 92%`, content `top 76%` | — | Fade/stagger in |
| P6 Exploded | `#section1` | pinned over spacer | true | Parts separate, hotspots reveal |
| P7 Text reveals | each `[data-reveal]` | `top 85%` | — | See §8 |
| P8 Header block | `top 80%` → `top top` | true | Section headers |

### 7.3 Scroll-scrubbed video

`#scroll-video` is advanced by scroll, not played: frame = progress × duration × 30 fps, smoothed by
`SCRUB_SMOOTHING 0.5`. `DEBUG_LOGS = true` — it **logs every frame number and Lottie percentage to the console**
(throttled to every 180 ms) in production.

---

## 8. Micro-interactions and text effects

### 8.1 Attribute-driven reveal system

Elements opt in with `data-reveal` and optional `data-duration` (default 1), `data-delay` (0.25), `data-stagger` (0.1):

| `data-reveal` | Desktop behaviour | Touch behaviour |
| --- | --- | --- |
| `block` | `y: 40 → 0`, `opacity 0 → 1`, `power2.out`, at `top 85%`, plays once | same |
| `text` | After `document.fonts.ready`: SplitText into lines → each line `yPercent 100 → 0` + fade, staggered | **Simple fade only** (no splitting) |
| `scramble` | Fade in while ScrambleText decodes the real text with uppercase noise, `revealDelay 0.1`, `speed 0.3` | same |

The inline script exists **twice** (a 2,604-char and a 2,982-char version) — both register on `load`, so elements may
be animated by two competing tweens.

### 8.2 Buttons

- **Polygon button** (`.polygon-border-wrapper > .polygon-btn`): a 1 px "border" created by a wrapper with
  `padding: .06rem` and a translucent grey fill (`#98989899`) behind an inner `#2d2d2d` button
  (`padding .81rem 1.75rem`, JetBrains Mono) — clip-path gives the angled corners *(clip-path inferred from class
  name; set in embed CSS)*. Text colour `#989898`.
- Hover states are defined in Webflow interactions / embed CSS *(not verifiable statically)*.

### 8.3 Other

- **Divider lines** grow (`scaleX`) as they enter.
- **Wireframe globe** (`#wf-globe`): pure 2D canvas, latitude/longitude dots, DPR-aware, `R = SIZE × 0.41`,
  re-sizes on window resize. (Guard comment says it may not exist on every page.)
- **Grid canvas** (`#gridCanvas`) and SVG `#noise-turbulence` filter for texture.
- **`#animatedDiagonalGradient`** SVG gradient animation.
- **Countdown digits** update every second with per-character text replacement.

---

## 9. Visual design system

### 9.1 Colour

| Role | Value | Usage |
| --- | --- | --- |
| Page black | `#060606` | Base background |
| Section black | `#0E0E0E` | Feature section gradient |
| Footer | `#161616` | Footer |
| Surface | `#2D2D2D` | Number tiles, buttons |
| Accent (primary) | **`#1FE477`** | Eyebrows, card numbers, highlights |
| Accent (LCD) | **`#56FF8E`** | Countdown digits |
| Text primary | `#FFFFFF` / `#F4F4F4` | Headings |
| Text secondary | `#959595` / `#989898` / `#9C9C9C` | Body, descriptions |
| Light neutrals | `#C8C8C8`, `#E2E2E2`, `#FAFAFA` | Gradients, dividers |
| Gradient text | `#3E3E3E → #D4D4D4 → #999` and `#D7D7D7 → #474747` | Hero wordmark, giant scroll words |
| Template leftovers | `#2D62FF` blue, `#DD23BB` pink, `#080331`, `#D9E5FF`, `#FFAEFE` | Variables from a Webflow starter — unused by the visible design |

**Contrast spot-check:** `#959595` on `#060606` ≈ **6.8 : 1** (passes AA). `#1FE477` on black ≈ **12 : 1**.

### 9.2 Typography

| Family | Role | Example sizes |
| --- | --- | --- |
| **Neue Machina** | Display (hero H1) | 12 rem, letter-spacing −21.26 px |
| **Neue Haas Unica** | Headings + body | `clamp(1.25rem, .63rem + 2.91vw, 3.25rem)`; body ~0.97 rem / lh 1.2 |
| **JetBrains Mono (variable)** | Labels, nav, buttons, card titles, form | 1.03–1.38 rem; preloader 1.88 rem / weight 200 |
| **Digital-7 Mono** | Countdown digits | 2.22 rem |
| Space Grotesk | Loaded from Google Fonts | Not used by stylesheet *(possibly embed-only or unused)* |

Typographic signatures: **tight negative tracking** on all large text (−0.48 px to −21 px), line-height 1–1.2,
measure capped in `ch` (17–30 ch).

### 9.3 Spacing / shape

- Rem-based, mostly derived from a 16 px base with Figma-exported fractions (1.56, 1.88, 2.25, 2.5, 4.56, 7.5 rem).
- Radius: inputs 0.75 rem; most surfaces square or polygon-clipped (hard-edged "hardware" feel).
- Layering: preloader z 100 → nav z 999 → features z 6 → CTA z 2.

### 9.4 Iconography and imagery

Inline SVG embeds (`w-embed`) for logo, social icons, decorative arrows and card shapes; PNG/SVG images for spec
icons, grid textures, form backgrounds and the skeleton illustration; WebM for device UI demos; Lottie for line art.

---

## 10. Component library

| Component | Class | Anatomy | Variants |
| --- | --- | --- | --- |
| Fixed nav | `.nav_component` | brand, split menu, centred logo, countdown | mobile hamburger, two clip-path frames |
| LCD timer | `.nav_timer` | label, digits, colon, ghost layer, bg image | month / days / hours |
| Polygon CTA | `.polygon-border-wrapper` | 1 px wrapper + inner `.polygon-btn` | — |
| Eyebrow | `.section_*-eyebrow` | JetBrains Mono, green | dark / light (`getupdate-eyebrow` black) |
| Feature card | `.section_slider-card` | number tile, title, text | left / right column, mobile list |
| Defence block | `.home_defence-component` | media (video + Lottie), heading, text, divider | — |
| Secure feature row | `.home_secure-features` | icon, highlighted lead, body | router / RF |
| Hotspot | `.hotspot-number/line/text` | number, leader line, label | projected (desktop) / list (mobile) |
| Spec card | `.home_features-card` | icon, heading ×2, description, svg | — |
| Inline-submit input | `.update_form-input` + `.update_form-submit` | input with embedded square button | success / error |
| Footer social row | `.footer_social-icons` | 7 icon links | mobile / desktop copies |

---

## 11. Responsive behaviour

### 11.1 Breakpoints

| Query | Count in CSS | Purpose |
| --- | --- | --- |
| `max-width: 991px` | 4 blocks | Tablet: hamburger nav, stacked layouts |
| `max-width: 767px` | 4 | Mobile landscape |
| `max-width: 479px` | 4 | Mobile portrait |
| `min-width: 768px` | 1 | |
| `min-width: 1280px`, `1440px`, `1920px` | 1 each | Large-screen scaling |

Visibility utilities: `hide-above-lanscape`, `hide-mobile-landscape`, `hide`, `hide-new` (sic).

### 11.2 What changes

| Feature | Desktop | Mobile |
| --- | --- | --- |
| Smooth scroll | Lenis | Native |
| Features | 3-column orbit layout + grid overlay | Single 01–16 list |
| Exploded labels | Projected 3D hotspots | Static numbered list |
| Giant scroll text | Visible | Hidden |
| Text reveal | Line-split slide-up | Fade only |
| Hero scrub | 1.5 | 0.45 (snappier) |
| Spacer sections | `trigger-1/2` visible | `hide-mobile-landscape` |
| Spec card heading | Position A | Position B |
| Footer | Single row | Stacked block |
| Resize across breakpoints | **Full page reload** | **Full page reload** (height changes < 24 px ignored) |

---

## 12. Forms, data and third parties

| Item | Detail |
| --- | --- |
| Waitlist form | Webflow form `wf-form-Waitlist-form`, `method="get"`, redirect `https://socials.neoconda.com/signup` |
| Field | single input, `id="name"` (collects email) |
| Analytics | Google Analytics 4 `G-647MTCB238`, first-party tag config |
| Optimisation | Webflow Optimize / Intellimize `117911758` — A/B tests; **anti-flicker hides the page up to 4 s** |
| Consent | Custom `NCConsent` manager: cookie `nc_consent`, version 1, max age 180 days, banner after 1.4 s, links to `/privacy-policy`, GA consent mode wiring |
| Inline override | Script writes `intellimize_data_tracking_type = 'disabled'` and an opt-out flag to `localStorage` before Intellimize loads — tracking is opt-in by default |

---

## 13. SEO and metadata

| Tag | Value |
| --- | --- |
| `<title>` / `og:title` | "Neoconda \| The Revolution in Cybersecurity Tech" |
| Description | "Neoconda: The Ultimate Portable Cyber Device for Hacking & Security. Run Linux, perform RF reconnaissance, and secure networks with an AI-driven engine. Join now." |
| OG / Twitter image | Webflow-hosted `opengraph.png`, `summary_large_image` |
| Structured data | JSON-LD `@type: Product` with name + description |
| Headings | H1 present but `display:none` at base breakpoint; H2/H3 hierarchy otherwise reasonable; spec cards render two H3s each (one hidden) |
| Single page | All content on `/`, anchor navigation |

---

## 14. Performance audit

### 14.1 Payload (measured where possible)

| Asset | Size |
| --- | --- |
| HTML | 152 KB |
| Webflow CSS | 97 KB |
| Custom JS (3 active) | 259 KB unminified |
| Hero GLB | 2.19 MB |
| **Exploded GLB** | **38.30 MB** |
| UI video `ui-video-2026-mar-26.webm` | 2.76 MB |
| `Responsive-screen1.webm` | 1.24 MB (referenced twice) |
| `res_screen-2.webm` | not measured |
| EXR HDRI 1k | not measured (typically 1–3 MB) |
| Three.js module | ~1.2 MB unminified from unpkg |
| GSAP ×4, Lottie ×2, split-type, Lenis, jQuery, Webflow | several hundred KB |

**Estimated first full experience: 45–50 MB**, dominated by the exploded model.

### 14.2 Findings

| # | Issue | Impact | Fix |
| --- | --- | --- | --- |
| P-1 | 38 MB uncompressed GLB | Long load on mobile data; memory pressure | Draco/meshopt + KTX2 textures, decimate hidden internals; target < 4 MB |
| P-2 | GSAP loaded 4× (global 3.12.5, module 3.12.5, SplitText 3.14.2, Scramble 3.14.1) | Duplicate parse; **two ScrollTrigger instances** that don't share refresh/scroll state | One GSAP build; expose `window.gsap` to modules or bundle |
| P-3 | Unminified module scripts from R2 + Three from unpkg (no bundling) | Waterfall of module imports | Vite/esbuild bundle, minify, tree-shake Three |
| P-4 | Two Lottie runtimes, two text splitters | Redundant JS | Keep one of each |
| P-5 | 4 s anti-flicker | Delays first paint if Intellimize is slow | Lower timeout or drop A/B on this page |
| P-6 | Page reload on breakpoint resize | Re-downloads (cache helps) and resets state | Recompute camera fit on resize instead |
| P-7 | `DEBUG_LOGS = true` | Console spam every 180 ms while scrolling | Disable in prod |
| P-8 | Lenis not synced to ScrollTrigger | Possible scrub jitter | `lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker.add` |
| P-9 | `r2.dev` delivery | Rate-limited, no caching controls | Custom domain on R2 + Cache Rules |

---

## 15. Accessibility audit

| # | Issue | WCAG | Fix |
| --- | --- | --- | --- |
| A-1 | No `prefers-reduced-motion` handling found in active scripts or inline code | 2.3.3 | Disable Lenis, scrubbing and explosions; show stills |
| A-2 | Scroll-jacking (Lenis) changes scroll physics | 2.1.1 / usability | Keep native on reduced motion; respect keyboard paging |
| A-3 | Submit button has no visible text; label relies on an SVG dash | 4.1.2, 2.4.6 | `aria-label="Join waitlist"` + visible text on focus |
| A-4 | Email input has `id="name"`; no visible `<label>` captured | 1.3.1, 3.3.2 | `<label for>` + `type="email"` + `autocomplete="email"` |
| A-5 | Social links are icon-only | 2.4.4 | `aria-label` per network |
| A-6 | Content duplicated for responsive variants (cards, headings, footer) | 1.3.2 | Screen readers may read duplicates if hidden only visually — use `display:none` consistently |
| A-7 | WebGL hotspots are HTML (good) but the 3D content itself has no text alternative | 1.1.1 | `aria-label`/`role="img"` on canvases with a description |
| A-8 | LCD countdown updates every second | 4.1.3 | `aria-live="off"`; provide a static date text |
| A-9 | Preloader blocks content until 100 % | 2.2.x | Allow skip / show content progressively |
| A-10 | Very negative letter-spacing on large display text | Readability | Acceptable for display; keep body tracking ≥ 0 |

---

## 16. Content and UX issues

| # | Where | Issue |
| --- | --- | --- |
| C-1 | Nav countdown | Target **4 Aug 2026 10:00 (US)** has passed → timer shows `00:00:00` — reads as "launch stalled" |
| C-2 | Nav | "Order" label leads to a waitlist, not ordering — expectation mismatch |
| C-3 | RF Protection | Anti Spoofing card duplicated; second copy truncated mid-sentence ("…preventing fake") |
| C-4 | Features | 16 cards rendered twice in DOM (desktop columns + mobile list) — fine visually, duplicated for crawlers/AT |
| C-5 | Form | Error copy "Something went wrong..!" — no recovery guidance |
| C-6 | Form | Redirect to an external subdomain after submit — user leaves the page; success message may never be seen |
| C-7 | Specs | Some cards ("Storage and SD Card", "Battery", "Audio") lack concrete numbers compared to others |
| C-8 | Hero | Primary CTA "Explore Neoconda" scrolls down instead of converting; the conversion CTA is only at the bottom |

---

## 17. Engineering hygiene

- **Debug code shipped:** `lil-gui` import, `#debug-hud`, `#explode-scrub`, `DEBUG_LOGS = true`, `#test-button`, `#dummy`.
- **Naming:** `neoconda-script.copy.js`, `heroScript-stagging` (log prefix), `3dtest/` root, `.home_securre-content-left`,
  `.home_fetures-image`, `.home_neoconda-skelton`, `.three-hundred-vh` = 200 svh, `#lottiee-section`.
- **Cross-project asset:** HDRI pulled from `3dtest/sunthings-test/` (another project's folder).
- **Dead code:** seven commented-out script versions; Webflow starter colour variables unused.
- **Unpinned dependencies:** `@latest` Lottie players, unversioned `split-type`.
- **Old Lenis:** `@studio-freight/lenis@0.2.28` (package since moved to `lenis`, darkroom.engineering).
- **Duplicate inline scripts:** two `data-reveal` initialisers.

---

## 18. Prioritised recommendations

| Priority | Action | Effort |
| --- | --- | --- |
| P0 | Update or replace the expired countdown (or switch to "Launching soon") | XS |
| P0 | Fix truncated/duplicated Anti Spoofing copy | XS |
| P0 | Compress `Explode model.glb` (meshopt/Draco + KTX2), lazy-load when `#section1` is near | M |
| P0 | Serve R2 assets from a custom domain with caching | S |
| P1 | Single GSAP instance; sync Lenis ↔ ScrollTrigger | S |
| P1 | Add `prefers-reduced-motion` path | M |
| P1 | Accessible form: label, `type=email`, named submit, inline success instead of redirect | S |
| P1 | Remove debug code and logs; pin all CDN versions; delete dead script tags | S |
| P2 | Replace reload-on-resize with a recompute of camera fit | M |
| P2 | Bundle custom JS (Vite) and minify; tree-shake Three | M |
| P2 | Rename "Order" → "Join waitlist" until ordering exists; add a CTA in the hero | XS |
| P2 | Trim duplicated responsive DOM where CSS alone can reflow | M |

---

## 19. How to rebuild this experience

A reference blueprint that keeps the art direction and fixes the issues above.

### 19.1 Stack

```
Vite + vanilla TS (or Astro)        one bundle, code-split per section
three@0.16x  (tree-shaken)          GLTFLoader + MeshoptDecoder + KTX2Loader
gsap@3.12+   (single instance)      ScrollTrigger, SplitText, ScrambleText
lenis@1.x                           synced to gsap.ticker
@lottiefiles/dotlottie-web          one Lottie runtime
```

### 19.2 Skeleton

```html
<div id="preloader" aria-hidden="true">…<span id="pct">0</span>%</div>
<header class="nav" role="banner">…<time class="lcd" datetime="2026-08-04T10:00-04:00">…</time></header>
<main>
  <section id="hero">   <canvas id="hero-canvas" role="img" aria-label="Neoconda device"></canvas> … </section>
  <section id="about">  <div id="device-target"></div> … </section>
  <section id="features"> … </section>
  <section id="explode" style="height:300svh"><div class="stage" style="position:sticky;top:0;height:100svh">
      <canvas id="explode-canvas" role="img" aria-label="Exploded view of components"></canvas>
      <ol id="hotspots"></ol></div></section>
  <section id="specs"> … </section>
  <section id="waitlist"><form>…<label for="email">Email</label><input id="email" type="email" autocomplete="email" required>
      <button type="submit">Join waitlist</button></form></section>
</main>
```

### 19.3 Core wiring

```js
import gsap from 'gsap'; import { ScrollTrigger } from 'gsap/ScrollTrigger'; import Lenis from 'lenis';
gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduce && matchMedia('(min-width: 480px) and (pointer: fine)').matches) {
  const lenis = new Lenis({ lerp: 0.15, wheelMultiplier: 0.8 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
}

// Preloader: real progress from THREE.LoadingManager
manager.onProgress = (_, loaded, total) => (pct.textContent = Math.round((loaded / total) * 100));

// Exploded view: lazy-load when near
ScrollTrigger.create({ trigger: '#explode', start: 'top 200%', once: true, onEnter: loadExplodeModel });

// Scrub explosion
gsap.timeline({ scrollTrigger: { trigger: '#explode', start: 'top top', end: 'bottom bottom', scrub: 1 } })
    .to(state, { t: 1, ease: 'none', onUpdate: () => parts.forEach(p => p.position.lerpVectors(p.userData.a, p.userData.b, state.t)) });

// Resize: recompute fit, never reload
new ResizeObserver(() => fitCameraToBox(camera, box, safeFitFor(innerWidth, innerHeight))).observe(document.body);

if (reduce) { /* swap canvases for posters, skip scrubs, show hotspot list */ }
```

### 19.4 Asset budget

| Asset | Budget |
| --- | --- |
| Hero GLB | ≤ 1.5 MB (meshopt + KTX2) |
| Exploded GLB | ≤ 4 MB, lazy |
| HDRI | 1k `.hdr`/KTX2 ≤ 1 MB, or baked lighting |
| Videos | ≤ 1.5 MB each, AV1/VP9, `preload="none"` until visible |
| JS (initial) | ≤ 200 KB gzipped |

---

## 20. Appendix — raw inventories

### 20.1 Element IDs (selected)

`preloader`, `preloader-first`, `preloader-number`, `pre-one`, `pre-two`, `pre-three`, `nav-logo`,
`nav-logo-destination`, `timer-month`, `timer-days`, `timer-hours`, `hero`, `section-hero`, `hero-logo-container`,
`start-target`, `hero-logo-source`, `hero-logo-large-to-move`, `app`, `hero-content`, `test-button`, `about`,
`target`, `features-padding`, `features`, `scope-1`, `mob-res`, `trigger-1`, `lottiee-section`, `scope-2`,
`trigger-2`, `router-details`, `trigger-3`, `section1`, `text-animation`, `canvas-explode`, `labels-container`,
`specs`, `CTA`, `wf-form-Waitlist-form`, `name`, `launching`, `gridCanvas`, `scroll-video`, `dummy`,
`animatedDiagonalGradient`, `card-bg-shape`, `card-graphic`, `icon-circle`.

### 20.2 Key animation constants

| Constant | Value | File |
| --- | --- | --- |
| `HERO_SCROLL_SCRUB` | 1.5 | hero |
| `HERO_MOBILE_SCROLL_SCRUB` | 0.45 | hero |
| `HERO_MODEL_ENTRANCE_START_SCALE_RATIO` | 0.18 | hero |
| `HERO_LOGO_REVEAL_DURATION_SECONDS` | 1.8 | hero |
| `HERO_LOGO_REVEAL_STAGGER_SECONDS` | 0.06 | hero |
| `HERO_LOGO_REVEAL_EASE` | `expo.out` | hero |
| `HERO_MODEL_REVEAL_HANDOFF_LEAD_SECONDS` | 1.15 | hero |
| `VIDEO_FPS` | 30 | main |
| `SCRUB_SMOOTHING` | 0.5 | main |
| `LOTTIE_PHASE4_START/MID/END_FRAME` | 200 / 409 / 500 | main |
| `LOTTIE_PHASE4_MID/END_PCT` | 20 / 50 | main |
| `PHASE5_LOTTIE_FADE_START` | `top 92%` | main |
| `PHASE5_CONTENT_REVEAL_START` | `top 76%` | main |
| `REVEAL_DURATION / STEP` | 0.62 / 0.24 s | main |
| Most common eases | `power2.inOut` (hero), `none` (scrubs), `power2.out` | both |

### 20.3 External hosts contacted

`cdn.prod.website-files.com`, `d3e54v103j8qbb.cloudfront.net` (jQuery), `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`,
`unpkg.com`, `pub-28ca259d32274e718fe1f5d0e35661bf.r2.dev`, `fonts.googleapis.com`, `fonts.gstatic.com`,
`cdn.intellimize.co`, `api.intellimize.co`, `log.intellimize.co`, `117911758.intellimizeio.com`,
Google Analytics, `socials.neoconda.com`.
