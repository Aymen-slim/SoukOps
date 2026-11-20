# Wassalha Design System — Swiss Editorial (Gurusup-Aligned)

Wassalha uses a single, unified Swiss-editorial design system across public pages (`/`, `/login`, `/signup`, `/demo`, `/pin`) and logged-in workspaces (`/dashboard/*`, `/pro/*`), built on Tailwind CSS v4 + owned React Aria primitives (`src/components/base/`, `src/components/foundations/`, `src/components/application/`).

## Stack

- **CSS tokens:** `src/styles/untitledui.css` + `src/app/globals.css` (imported in `src/app/layout.tsx`).
- **Fonts:** `Geist` (`--font-geist-sans`) for display headings and UI text, paired with `Geist Mono` (`--font-geist-mono`) for tabular figures, uppercase micro-actions, buttons, and status metadata via `next/font/google`.
- **Icons:** `@untitledui/icons` + monochrome geometric `<BrandMark />` (`src/components/brand-mark.tsx`) + channel marks (`WhatsAppIcon`, `InstagramIcon`, `MessengerIcon`).
- **Editorial Media:** Tunisia-inspired atmospheric photography (`public/brand/hero-tunis.jpg`, `public/brand/cta-tunis.jpg`) layered under `.gs-dot-overlay` halftone dot texture on hero and closing CTA banners.

## Core Tokens

| Role | Value | Semantic Token / Utility |
| :--- | :--- | :--- |
| Primary canvas | `#FFFFFF` | `bg-primary` |
| Soft stone workspace / band | `#FAFAF9` | `bg-secondary` |
| Diagram / visual tray | `#F4F4F5` | `bg-tertiary` |
| Primary ink (headings & solid actions) | `#09090B` / `#1D1E1A` | `text-primary`, `.gs-btn-ink`, `Button color="primary"` |
| Secondary / muted copy | `#27272A` / `#52525B` | `text-secondary`, `text-tertiary` |
| Subdued metadata / captions | `#71717A` | `text-quaternary` |
| Hairline borders | `#E4E4E7` (strong `#D4D4D8`) | `border-secondary`, `ring-secondary`, `border-primary` |
| Brand Forest Emerald (approvals, live states, focus) | `#1B8A5E` (hover `#15704C`, tint `#F2FBF7`) | `bg-brand-solid`, `text-brand-secondary`, `bg-brand-primary` |
| Alert / Error | `#D13C2E` (tint `#FBF3F2`) | `text-error-primary`, `bg-error-primary` |
| Geometry | `0px` square edges | `rounded-none` on buttons, cards, badges, inputs, tables, modals |

## Layout & Copy Principles

- **Homepage (`/`):** Sticky `264px` desktop left rail (`src/components/home/home-experience.tsx`) with `Online Shops | Creators & Pros` segmented toggle, clean navigation, `ON THIS PAGE` jump links, and pinned bottom CTAs; collapses to a compact sticky bar + drawer on mobile.
- **Plain language first:** Public copy explains Wassalha in everyday words (zero internal AI model names or endpoint telemetry on `/`). Technical provider details stay in `/dashboard/ai`.
- **Workspaces (`/dashboard/*`, `/pro/*`):** Same `264px` white sticky rail, `#FAFAF9` workspace ground, sharp `#FFFFFF` cards with `1px` `#E4E4E7` hairlines, tabular `font-mono` DT amounts from `src/lib/domain/pricing.ts`, and Derja buyer chat bubbles with `dir="auto"`.
- **Isolation:** `/courier-clone/*` pins its own `#0C4A6E` header to remain visually distinct as the simulated First Delivery portal.
