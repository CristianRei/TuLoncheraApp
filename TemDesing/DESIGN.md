---
name: Tu Lonchera Operations
colors:
  surface: '#fff8f6'
  surface-dim: '#f5d3c5'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ec'
  surface-container: '#ffe9e2'
  surface-container-high: '#ffe2d7'
  surface-container-highest: '#fedbce'
  on-surface: '#29170f'
  on-surface-variant: '#554241'
  inverse-surface: '#402c23'
  inverse-on-surface: '#ffede7'
  outline: '#877270'
  outline-variant: '#dac1be'
  surface-tint: '#984541'
  primary: '#370003'
  on-primary: '#ffffff'
  primary-container: '#541212'
  on-primary-container: '#d67670'
  inverse-primary: '#ffb3ae'
  secondary: '#815600'
  on-secondary: '#ffffff'
  secondary-container: '#fcaf1e'
  on-secondary-container: '#6a4600'
  tertiary: '#001c03'
  on-tertiary: '#ffffff'
  tertiary-container: '#003307'
  on-tertiary-container: '#54a353'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad7'
  primary-fixed-dim: '#ffb3ae'
  on-primary-fixed: '#3f0305'
  on-primary-fixed-variant: '#7a2e2b'
  secondary-fixed: '#ffddb1'
  secondary-fixed-dim: '#ffba48'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#614000'
  tertiary-fixed: '#a3f69c'
  tertiary-fixed-dim: '#88d982'
  on-tertiary-fixed: '#002204'
  on-tertiary-fixed-variant: '#005312'
  background: '#fff8f6'
  on-background: '#29170f'
  surface-variant: '#fedbce'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  numeric-metric:
    fontFamily: JetBrains Mono
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 32px
  numeric-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style
The design system drives an operations-first back-office platform crafted for high-density administrative workflows, logistics tracking, and order fulfillment. The brand identity bridges institutional kitchen management with culinary warmth: authoritative, disciplined, and uncompromisingly utilitarian, yet approachable.

The style draws from Modern Corporate Operations with low-contrast structural outlines and subtle tonal surfaces. Visual density prioritizes high information throughput, rapid data triage, and cognitive ease under prolonged screen exposure. It rejects purely decorative illustrations, superfluous gradients, and heavy drop shadows in favor of strict grid alignment, explicit data boundaries, and instant visual status confirmation.

## Colors
The color architecture relies on a controlled, warm-tinted neutral foundation layered under an authoritative deep wine red (`#541212`) and tactical harvest gold (`#F3A712`).

- **Canvas & Surface**: Base canvas is Warm White (`#FBF8F6`), with elevated workspace modules resting on pure White (`#FFFFFF`). Surface division uses a precise structural border (`#EADFD7`).
- **Typography Hierarchy**: Primary headings, metrics, and actionable titles utilize Deep Cacao (`#2A1810`). Secondary labels, hints, and tabular metadata employ Roasted Umber (`#735D54`).
- **Functional Semantics**: System state signaling is strictly isolated. Positive statuses, batch completions, and active inventory use Dark Olive Green (`#2E7D32`). Pending queues, stock alerts, and warnings leverage Gold Amber (`#F3A712`). Errors, missed deliveries, and critical blockers default to Deep Crimson (`#941B1B`).

## Typography
The typographic system utilizes **Hanken Grotesk** for primary structural reading and structural hierarchy, paired with **JetBrains Mono** for numerical values, inventory IDs, timestamps, and currency tokens.

- **Tabular Figures**: All data tables, numeric metrics, price columns, and timestamp logs must enforce proportional monospace alignment (`fontVariant: ['tabular-nums']` in React Native or using `JetBrains Mono`) to ensure strict vertical scanning without column drifting.
- **Micro-Copy**: Labels below 12px must enforce uppercase styling with tracking expanded to `0.04em` to preserve legibility on low-dpi industrial displays or small tablets.

## Layout & Spacing
The layout follows a fluid-structural grid calibrated for tablet landscape (pos/operations screen) and desktop administration consoles.

- **Grid Architecture**: 
  - Tablet Portrait: 6-column fluid grid, 16px margins, 12px gutters.
  - Tablet Landscape / Small Desktop: 8-column layout, 24px margins, 16px gutters.
  - Desktop (>1200px): 12-column layout pinned to a maximum canvas width of 1440px, 32px margins, 24px gutters.
- **Rhythm**: Component interiors follow a base-4 grid (`space-xs` = 4px, `space-sm` = 8px, `space-md` = 12px, `space-lg` = 20px, `space-xl` = 32px). Data table cells maintain a consistent vertical hit target of 44px on tablets for touch-safe operation without wasting desktop horizontal density.

## Elevation & Depth
Depth is created through low-contrast structural outlines and subtle tonal layering rather than floating drop shadows. This optimizes rendering performance in React Native FlatLists and prevents visual fatigue.

- **Layer 0 (Base Canvas)**: Background tint `#FBF8F6`.
- **Layer 1 (Cards, Metric Modules, Data Grid)**: Surface `#FFFFFF`, bounded by a 1px solid hairline border in `#EADFD7`. No drop shadow.
- **Layer 2 (Popovers, Sticky Headers, Context Menus)**: Surface `#FFFFFF`, 1px solid `#D8C9BF`, backed by a minimal ambient diffusion: `shadowColor: "#2A1810"`, `shadowOffset: { width: 0, height: 4 }`, `shadowOpacity: 0.06`, `shadowRadius: 12`, `elevation: 3`.
- **Layer 3 (Modals, Operational Drawers)**: 1px border `#EADFD7`, backdrop dimmed using `#2A1810` at 45% opacity.

## Shapes
Geometry is disciplined, architectural, and compact (`roundedness: 1`). Soft curves (4px base, 8px on cards/containers) soften harsh screen borders without yielding the playful consumer tone of pill-heavy designs.

- **Data Tables & Module Panels**: 8px corner radius (`rounded-lg`), with clipped internal borders to maintain crisp row dividers.
- **Inputs, Buttons, and Select Triggers**: 4px corner radius (`rounded-sm`), establishing solid tactile anchors.
- **Badges and Status Tags**: 4px corner radius. Rounded pill shapes are prohibited to avoid confusion with interactive primary buttons.

## Components

### Buttons (`Pressable`)
- **Primary**: Background `#541212`, text `#FFFFFF` (Hanken Grotesk Medium, 14px), 4px radius. Padding: 10px vertical, 16px horizontal. Active state: background `#3D0B0B`.
- **Accent / Action**: Background `#F3A712`, text `#2A1810` (Hanken Grotesk Bold, 14px). Used exclusively for critical single actions (e.g., "Despachar Lote", "Confirmar Pedido"). Active: `#D69009`.
- **Secondary / Outline**: Background transparent, 1px solid border `#EADFD7`, text `#2A1810`. Active state: background `#F5EFEB`.
- **Destructive**: Background transparent, 1px solid border `#941B1B`, text `#941B1B`. Active state: background `#FDF2F2`.

### Metric & Summary Cards (`View`)
- Background `#FFFFFF`, 1px border `#EADFD7`, 8px corner radius, padding 16px.
- Internal hierarchy: Label at top (`label-sm`, color `#735D54`), metric value centered (`numeric-metric`, color `#2A1810`), contextual delta indicator at bottom right using `#2E7D32` (growth/success) or `#941B1B` (loss/alert) in monospace.

### Data Tables & List Rows (`FlatList` / `View`)
- Header row: `#F5EFEB` background, height 36px, typography `label-sm` in `#735D54`.
- Content row: `#FFFFFF` base, bottom border 1px `#EADFD7`, minimum height 48px. 
- Alternating row styling is avoided; hover/active states use subtle tint `#F9F4F0`. Numeric columns are right-aligned; text labels left-aligned.

### Status Badges (`View` + `Text`)
- Fixed 4px corner radius, padding: 2px vertical, 8px horizontal. Typography: `label-sm` (bold, uppercase).
- **Success / Entregado**: Background `#EAF5EA`, border 1px `#C3E3C3`, text `#2E7D32`.
- **Pending / En Preparación**: Background `#FEF6E7`, border 1px `#FBDCA3`, text `#976200`.
- **Alert / Cancelado**: Background `#FDF2F2`, border 1px `#F8C8C8`, text `#941B1B`.

### Input Fields (`TextInput` inside wrapper `View`)
- Background `#FFFFFF`, 1px border `#EADFD7`, 4px corner radius, height 40px, padding 8px horizontal. Text: `body-md` in `#2A1810`.
- Placeholder color: `#A8988F`.
- Focus state: Border color `#541212`, 1px outer ring outline `#54121220`. Error state: Border `#941B1B`.

### Checkbox & Switch (`Pressable`)
- Checkbox: 18x18px, 3px corner radius, 1.5px border `#735D54`. Checked state: background `#541212`, border `#541212`, white inner glyph.
- Switch: 40x22px track, 1px solid border `#EADFD7`. Active track `#541212`, thumb `#FFFFFF`.