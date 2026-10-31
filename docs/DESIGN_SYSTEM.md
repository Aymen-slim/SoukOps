# Wassalha Design System — "Souk & Signal"

Wassalha bridges two worlds: the warm, fast-paced human energy of **Tunisian WhatsApp/Instagram commerce** (Derja voice notes, story screenshots, lively bargaining) and the **deterministic precision of financial & logistics guardrails** (integer millimes, price firewall, GPS pin verification, risk scoring, and automated courier waybills).

The **"Souk & Signal"** design system gives the product a distinctive North African editorial warmth paired with Swiss-grade operational clarity.

---

## 1. Design Principles

1. **Warm Surfaces, Crisp Signals**
   Interfaces sit on warm Tunisian limestone and parchment tones (`oklch(0.978 0.007 82)`), reducing eye fatigue and evoking tactile paper waybills, while status badges, prices, and AI traces use high-contrast semantic ink.
2. **Deterministic Numbers are Sacred**
   Every monetary amount (`112,500 DT`), risk score (`Green 90`), GPS coordinate (`36.8065, 10.1815`), barcode (`FD0000000123`), and model latency (`340ms`) uses `font-mono` or `tabular-nums` so numbers never jitter or misalign.
3. **Bilingual & Script-Resilient by Default**
   French seller UI, English judge controls, and Derja/Arabizi/Arabic buyer messages coexist seamlessly. Dynamic user text always carries `dir="auto"` and generous line height.
4. **Tactile, Interruptible Motion**
   Buttons respond immediately to press (`transform: scale(0.97)` over `150ms cubic-bezier(0.23, 1, 0.32, 1)`). Transitions target explicit properties (`transform`, `opacity`, `background-color`, `border-color`, `box-shadow`) — never `transition: all`.

---

## 2. Token Architecture (3-Tier OKLCH)

### Tier 1 & 2: Surface & Ink Palette

| Token | CSS Variable | Value (Light) | Role |
| :--- | :--- | :--- | :--- |
| **Canvas** | `--background` | `oklch(0.976 0.008 82)` | Primary page background (Warm Limestone) |
| **Surface Raised** | `--card` | `oklch(0.996 0.003 85)` | Elevated cards, sheets, and panels (Alabaster) |
| **Surface Sunken** | `--muted` | `oklch(0.946 0.012 80)` | Secondary wells, code blocks, table headers (Travertine) |
| **Surface Ink** | `--surface-ink` | `oklch(0.185 0.018 55)` | Dark header bars, phone bezel, primary CTAs (Medina Ink) |
| **Foreground** | `--foreground` | `oklch(0.185 0.018 55)` | Primary body and heading text |
| **Muted Foreground** | `--muted-foreground` | `oklch(0.46 0.018 65)` | Secondary labels, captions, metadata |
| **Border** | `--border` | `oklch(0.895 0.014 80)` | Hairline dividers and card outlines |

### Brand & Accent Tokens

| Token | CSS Variable | Value | Role |
| :--- | :--- | :--- | :--- |
| **Brand Terracotta** | `--brand-terracotta` | `oklch(0.56 0.165 36)` | Brand accent, active highlights, Tunisian clay |
| **Brand Saffron** | `--brand-saffron` | `oklch(0.83 0.165 84)` (`#ffc244`) | GPS pin badge, primary dark-surface CTA, waybill highlight |
| **Brand Cobalt** | `--brand-cobalt` | `oklch(0.49 0.16 254)` | AI pipeline telemetry, model/provider badges |
| **WhatsApp Sand** | `--chat-wallpaper` | `oklch(0.955 0.014 82)` (`#f4EFE6`) | Buyer simulator chat canvas |

### Semantic Status & Risk Tokens

| Semantic Role | Foreground | Surface / Background | Border | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Success / Low Risk (Green)** | `oklch(0.38 0.11 155)` | `oklch(0.95 0.035 155)` | `oklch(0.84 0.075 155)` | Risk ≥ 70, Provider Ready, AI Active, Waybill Done |
| **Warning / Medium Risk (Amber)** | `oklch(0.44 0.13 68)` | `oklch(0.96 0.045 82)` | `oklch(0.86 0.09 78)` | Risk 40–69, Worker Offline, AI Paused / Handover |
| **Danger / High Risk (Red)** | `oklch(0.45 0.18 26)` | `oklch(0.95 0.03 25)` | `oklch(0.85 0.075 25)` | Risk < 40, Read-back Mismatch, Error Alerts |
| **Info / Telemetry (Cobalt)** | `oklch(0.42 0.14 254)` | `oklch(0.955 0.025 250)` | `oklch(0.86 0.06 250)` | Model trace events, active courier job states |

---

## 3. Typography Scale

- **Display / Editorial (`--font-display`)**: `Instrument Serif` — Used for hero headlines and high-impact editorial callouts.
- **UI Sans (`--font-sans`)**: `Geist` — Used for all interface controls, tables, chat messages, and navigation.
- **Technical Mono (`--font-mono`)**: `Geist Mono` — Used for millime/dinar ledger values, `FD` barcodes, GPS coordinates, latency badges, and JSON payloads.

| Scale Step | Class / Size | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Display** | `text-4xl sm:text-6xl` | `1.06` | `-0.025em` | Landing hero headline |
| **Page Title (H1)** | `text-2xl sm:text-3xl font-semibold` | `1.2` | `-0.02em` | Dashboard section titles |
| **Section Heading (H2)** | `text-lg font-semibold` | `1.3` | `-0.015em` | Card titles, modal headers |
| **Eyebrow / Kicker** | `text-[11px] font-semibold uppercase` | `1.4` | `0.16em` | Section kickers, table headers |
| **Body Default** | `text-sm` (14px) | `1.5` | `0` | Default dashboard and chat copy |
| **Technical / Caption** | `text-xs font-mono tabular-nums` | `1.4` | `0` | Barcodes, timestamps, latencies |

---

## 4. Elevation, Radius & Spacing

- **Base Radius (`--radius`)**: `0.75rem` (12px)
  - `rounded-lg`: `10px` (Inputs, small buttons)
  - `rounded-xl`: `14px` (Cards, trace rows)
  - `rounded-2xl`: `18px` (Chat bubbles, feature panels)
  - `rounded-[32px]`: Phone simulator frame
- **Shadow Scale**:
  - `--shadow-card`: `0 1px 2px rgba(28, 25, 23, 0.04), 0 4px 12px -2px rgba(28, 25, 23, 0.04)`
  - `--shadow-elevated`: `0 12px 32px -8px rgba(28, 25, 23, 0.10), 0 2px 6px rgba(28, 25, 23, 0.05)`

---

## 5. Motion & Interaction Tokens

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — Default for UI entrances, dropdowns, and button feedback.
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` — On-screen state morphs.
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` — Bottom sheet and mobile pin drawer curves.
- **Press Feedback**: Interactive buttons scale down to `0.97` on `:active` in `150ms var(--ease-out)`.
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` disables transform animations while preserving opacity/color feedback.

---

## 6. Live Showcase

Visit `/design-system` in the running application to inspect all live tokens, typography specimens, button & badge variants, risk indicators, and domain components.
