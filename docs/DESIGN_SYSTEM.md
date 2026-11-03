# Wassalha Design System — Untitled UI

Wassalha uses the stock [Untitled UI React](https://www.untitledui.com/react) design system (Free / open-source components only). There is no public `/design-system` showcase route; the system lives in tokens and components in the codebase.

## Stack

- Tailwind CSS v4 with the Untitled UI theme in `src/styles/untitledui.css`, imported by `src/app/globals.css`.
- Components are copied into the codebase with the Untitled UI CLI (`npx untitledui@latest add <component>`) and built on React Aria Components. They are owned and editable — not a runtime dependency.
- Icons: `@untitledui/icons` (aliased imports keep semantic names, e.g. `MarkerPin01 as MapPin`).
- Font: Inter via `next/font/google` (`--font-inter` in `src/app/layout.tsx`).

## Tokens

Use Untitled semantic classes only — never raw color scales (`text-gray-900`, `bg-blue-700`) and never the removed Souk & Signal tokens (`brand-terracotta`, `surface-ink`, `status-*`, `bg-card`, `text-muted-foreground`).

| Role | Classes |
| :--- | :--- |
| Page canvas / wells | `bg-secondary`, `bg-tertiary` |
| Card / raised surface | `bg-primary` + `ring-1 ring-secondary shadow-xs` (see `Card` below) |
| Primary / secondary / tertiary text | `text-primary`, `text-secondary`, `text-tertiary` |
| Brand (stock Untitled purple, `--color-brand-600: rgb(127 86 217)`) | `bg-brand-solid`, `text-brand-secondary`, `fg-brand-primary`, `ring-brand` |
| Success / warning / error / info | `bg-success-primary` + `text-success-primary`, `bg-warning-primary`, `bg-error-primary`, `bg-utility-blue-50` + `text-utility-blue-700` |
| Borders | `border-primary` (inputs), `border-secondary` (cards/dividers), `border-utility-{green,yellow,red,blue}-200` for status |
| Radius / shadow | `rounded-lg` (inputs/buttons), `rounded-xl` (cards), `shadow-xs` |

Dark mode tokens ship in the `.dark` block of `src/styles/untitledui.css`; no theme toggle is wired in the UI yet.

## Components

| Need | Use |
| :--- | :--- |
| Button | `src/components/base/buttons/button.tsx` — `color="primary\|secondary\|tertiary\|primary-destructive\|link-color…"`, `size="xs\|sm\|md\|lg\|xl"`, `isDisabled`, `isLoading`, `iconLeading/iconTrailing`. It renders a React Aria `Link` when `href` is passed. |
| Badge | `src/components/base/badges/badges.tsx` — `color="gray\|brand\|success\|warning\|error\|blue…"`, `type="pill-color"` default. |
| Input | `src/components/base/input/input.tsx` — built-in `label`/`hint`; `onChange` receives the string value, not an event. `isDisabled`, `isRequired`, `isReadOnly`, `inputClassName` styles the inner input. File inputs stay native `<input type="file">` styled with Untitled tokens. |
| Label | `src/components/base/input/label.tsx` |
| Select / TextArea / Checkbox / Toggle / Radio / Dropdown / Tooltip / Avatar | `src/components/base/select/`, `textarea/`, `checkbox/` (also auto-inserted by Table selection), `toggle/`, `radio-buttons/`, `dropdown/`, `tooltip/`, `avatar/` — wired in orders (Select/Dropdown), conversations (Toggle/Avatar/Tabs), settings (NativeSelect/RadioGroup) |
| Table / Tabs / Pagination / EmptyState | `src/components/application/table/` (`Table` + `TableCard`, used for orders, analytics, demand, delivery fees), `application/tabs/` (conversation filters), `application/pagination/` (`PaginationCardMinimal` in orders), `application/empty-state/` (orders + inbox empty views) |
| Card / Alert / Metric / Modal | Local wrappers on Untitled tokens in `src/components/foundations/{card,alert,metric,modal}/` (Untitled has no free generic Card; its metric/modal/alert equivalents are PRO and must not be copied). `Alert` replaces inline `role="alert"` blocks, `Metric` replaces KPI boxes, `Modal` (React Aria Dialog) confirms demo reset and channel disconnects. |

Numbers (millimes from `src/lib/domain/pricing.ts`, barcodes, coordinates, latencies) keep `font-mono tabular-nums`. Buyer chat content stays Derja with `dir="auto"`; UI copy stays English.

## Rules

- Free components only. Do not add PRO components or another component library (no shadcn/@base-ui, no Lucide).
- Model/domain code is unaffected by the design system: `src/lib/domain/`, `src/lib/pipeline/`, `src/lib/ai/` do not import UI components.
- Add new components with the CLI so props stay upstream-compatible: `npx untitledui@latest add <component>`.
