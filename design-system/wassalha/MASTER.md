# Wassalha Design System Master File

**Project:** Wassalha  
**Direction:** Swiss Editorial Architectural (aligned with `gurusup.com`)  
**Scope:** Whole site — Public marketing (`/`, `/login`, `/signup`, `/demo`, `/pin`) + Seller (`/dashboard/*`) & Creator/Pro (`/pro/*`) workspaces.

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
| :--- | :--- | :--- |
| Canvas | `#FFFFFF` | `--color-bg-primary` |
| Workspace / Soft Band | `#FAFAF9` | `--color-bg-secondary` / `--gs-soft` |
| Visual Tray | `#F4F4F5` | `--color-bg-tertiary` / `--gs-tray` |
| Primary Ink | `#09090B` | `--gs-ink` / `--color-text-primary` |
| Primary Button Fill (Warm Ink) | `#1D1E1A` (hover `#27272A`) | `--gs-ink-warm` / `--gs-ink-hover` |
| Body Copy | `#52525B` | `--gs-muted` / `--color-text-tertiary` |
| Subdued Label (AA >= 4.5:1) | `#71717A` | `--gs-subtle` / `--color-text-quaternary` |
| Hairline Border | `#E4E4E7` (strong `#D4D4D8`) | `--gs-line` / `--gs-line-strong` |
| Brand Emerald (Approval / Live / Focus) | `#1B8A5E` (hover `#15704C`, tint `#F2FBF7`) | `--gs-emerald` / `--color-brand-600` |
| Alert / Destructive | `#D13C2E` (tint `#FBF3F2`) | `--gs-alert` / `--color-error-primary` |

### Typography

- **Display & UI Sans:** `Geist` (`--font-geist-sans`, `next/font/google`), `font-weight: 500` on headings, `-0.04em` to `-0.02em` tracking, `text-wrap: balance` on headings and `text-wrap: pretty` on body paragraphs.
- **Monospace UI / Actions / Numbers:** `Geist Mono` (`--font-geist-mono`, `next/font/google`) for uppercase tracked (`0.06em–0.1em`) CTA buttons, underlined `→` links, diagram labels, and `tabular-nums` DT currency amounts.
- **Zoom Safety:** Fluid `clamp()` scales always combine `rem` + viewport units with `max <= 2.5x min`; interactive buttons use `min-block-size` (never fixed `height`) to satisfy WCAG 1.4.4 & 1.4.12.

### Geometry & Elevation

- **Corner Radius:** `0px` (`rounded-none`) across buttons, cards, badges, inputs, tables, modals, and rails.
- **Elevation:** Flat architectural hierarchy via `1px solid #E4E4E7` borders and contrast fills (`#FFFFFF` on `#FAFAF9` / `#F4F4F5`). No decorative glassmorphism or soft SaaS drop shadows.
- **Photography & Texture:** Full-bleed Tunisia-inspired editorial photography (`public/brand/hero-tunis.jpg`, `public/brand/cta-tunis.jpg`) layered beneath `.gs-dot-overlay` halftone dot matrix and calibrated dark scrims for `> 7:1` white text contrast.
