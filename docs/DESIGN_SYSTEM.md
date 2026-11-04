# Unstuck Design System

**Intent:** a calm financial back office. It borrows the vernacular of bookkeeping (ledger paper, bottle-green ink, ruled lines) and keeps one warm accent for the single thing that matters: money starting to move again.

## Colour (`src/app/globals.css` → `@theme`)

| Token | Hex | Use |
|---|---|---|
| `paper` | `#eef2eb` | Page background (ledger paper) |
| `surface` | `#fafbf8` | Cards, drawer content, grid rows |
| `ink` | `#17312a` | Text, primary buttons, the agent panel |
| `ink-soft` / `ink-faint` | `#52645c` / `#7d8d85` | Secondary text / metadata |
| `rule` / `rule-strong` | `#d3ddd2` / `#b7c6b8` | Hairlines, input borders |
| `marigold` (+ `-deep`, `-wash`) | `#e3a02f` | **Only** for money-moving actions, items waiting for approval, and change highlights |
| `alert` / `ok` (+ washes) | `#b2442f` / `#2f6f4e` | Errors and high risk / done and low risk |
| Reason hues (`r-*`) | sky, amber, violet, rose, teal, emerald, slate, stone | One per stuck reason; muted, AA on `surface` |

No gradients, glass or decorative shadows. Shadows appear only on overlays (drawer, toasts).

## Type

- **Fraunces** (variable, soft optical size) for the human layer: the diagnosis sentence, the stuck-reason phrase (italic), money figures (tabular lining numerals).
- **Instrument Sans** for UI text. Sentence case everywhere: no all-caps labels, no eyebrow text, no middle-dot meta strings, no arrows in buttons.
- Scale: 40 / 28 / 20 / 17 / 15 (base) / 13 / 12 px.

## Layout

- 1320 px max width, 16 px gutter on phones.
- Two columns on desktop: the story (left) and the agent and decisions (right, 400 px). They collapse to one column below `lg`; on phones "Needs you" moves above the invoice list.
- Figures are a ruled row (a ledger line), not a set of cards.

## Components

| Component | Rule |
|---|---|
| Button | `primary` (ink) for the main action, `money` (marigold) **only** when PayPal money terms change, `quiet` (outlined), `ghost` (text), `danger` |
| ReasonPhrase | Dot plus Fraunces italic label: the product's signature element |
| RiskPill | Band plus score. Its title lists every factor and its points, because the model is transparent by design |
| ActionCard | Origin and time → label → status pill → rationale → typed parameters → "In PayPal: endpoint" → policy checks (expandable) → actions. Money-moving actions require an inline confirmation that states the consequence |
| Drawer | Right side, 640 px, Esc and Close button, backdrop click; sections: money, plan, diagnosis (evidence, inference, recommendation, outcome, risks, alternatives, risk factors), next steps, conversation, payer link, timeline |
| Agent trace | Icon (✓ • ! ✕ –), step kind, label and detail, grouped under the client name; live polling while running |
| Toasts | Bottom centre; `status` (auto-dismiss) or `alert` (sticky) |
| Data grid | AG Grid Quartz theme with these tokens; custom cell renderers; default sort by risk |

## Accessibility

- Visible focus ring (2 px marigold-deep).
- `prefers-reduced-motion` respected.
- Dialog semantics on the drawer.
- `aria-live` on toasts and the running trace.
- `aria-pressed` on reason filters.
- Colour is never the only signal: reasons and risk carry text labels.
