---
name: NAVIRA Signal Foundry
description: Civic signal infrastructure that keeps evidence, action, assurance, and public guidance attached to one disaster.
colors:
  graphite: "#0f1113"
  ink: "#191c1f"
  bone: "#f1eee9"
  paper: "#faf8f4"
  signal-vermilion: "#ff3b1f"
  signal-ink: "#a52210"
  safety-amber: "#f4b800"
  steel: "#68737a"
  rule: "#cbc7c0"
  white: "#ffffff"
  verified-green: "#15775a"
  app-canvas: "#e8e5df"
  audit-surface: "#e2ded6"
  receipt-surface: "#dce9df"
typography:
  display:
    fontFamily: "Urbanist Variable, Google Sans, Arial, sans-serif"
    fontSize: "clamp(4.6rem, 8.5vw, 8.8rem)"
    fontWeight: 820
    lineHeight: 0.83
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Urbanist Variable, Google Sans, Arial, sans-serif"
    fontSize: "clamp(1.8rem, 2.35vw, 2.85rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Urbanist Variable, Google Sans, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "Urbanist Variable, Google Sans, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 480
    lineHeight: 1.5
  label:
    fontFamily: "Urbanist Variable, Google Sans, Arial, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 780
    letterSpacing: "0.16em"
rounded:
  structural: "0px"
  status: "50%"
spacing:
  compact: "6px"
  control: "12px"
  inset: "18px"
  panel: "22px"
  section: "28px"
components:
  button-signal:
    backgroundColor: "{colors.signal-vermilion}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.structural}"
    padding: "0 18px"
    height: "46px"
  button-dark:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.structural}"
    padding: "0 18px"
    height: "46px"
  action-receipt:
    backgroundColor: "{colors.receipt-surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.structural}"
    padding: "12px 16px"
    height: "70px"
  mobile-status:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.white}"
    rounded: "{rounded.structural}"
    padding: "0 14px"
    height: "42px"
---

# Design System: NAVIRA Signal Foundry

## Live Geographic Authority

The MapLibre map is NAVIRA's primary evidence surface. Use OpenFreeMap's Liberty style with OpenStreetMap attribution so borders, labels, coastlines, and geographic proportions remain legible. Never stretch, crop into an illustrative shape, or replace the map with SVG geography. Map chrome uses the graphite substrate; source points use stable layer colors: EONET steel-blue, GDACS vermilion, and USGS amber.

Live points, lines, and boundaries must retain their upstream geometry. A selected record may be emphasized, but the interface must not redraw its footprint. Every map surface is paired with source condition, retrieval time, and explicit unavailable states for operational routes or boundaries that are not supplied.

## Overview

**Creative North Star: "Signal Foundry"**

NAVIRA behaves like civic signal infrastructure built into a city: hard-edged, legible under pressure, and visibly connected from observation to action, assurance, and public output. The redesign preserves the protected-path N, Urbanist, graphite command surfaces, bone field surfaces, signal vermilion, and the language of routes, rails, ledgers, bands, and boundaries.

The public landing surface is cinematic and centered. One oversized two-line proposition gives way to a full-width disaster frame, while a tightly cropped inline photo fragment turns environmental context into punctuation inside the editorial story. The operational product is denser and quieter: compressed headers, a persistent incident ribbon, grouped response-loop navigation, durable receipts, and explicit audit language keep the current event and the result of each action visible across modules.

**Key Characteristics:**

- A centered cinematic landing sequence with environmental photography used as evidence, not decoration.
- A 36-column-equivalent system grid assembled from durable 5/3/4 proportions.
- Observe, Act, Assure, and Output as the persistent information architecture.
- Incident identity, response phase, and latest audit record visible across operational modules.
- Square ruled surfaces, accessible state redundancy, and restrained state-based motion.

## Colors

The palette reads like powder-coated command hardware, field paper, route vinyl, and safety markings.

### Primary

- **Signal Vermilion** (`signal-vermilion`): active routes, primary actions, selected navigation, active accordion panels, and critical fields.
- **Signal Ink** (`signal-ink`): the contrast-safe vermilion extension for identifiers, timeline values, links, and fine route details on pale surfaces.

### Secondary

- **Safety Amber** (`safety-amber`): caution, the scenario band, low-stock bars, and keyboard focus.
- **Verified Green** (`verified-green`): confirmed states, successful assignments, offline assurance, and receipt edges.

### Neutral

- **Graphite** (`graphite`): structural ink, navigation substrate, chart bars, and high-contrast bands.
- **Ink** (`ink`): supporting near-black hierarchy.
- **Bone** (`bone`): public field surface and light-on-dark text partner.
- **Paper** (`paper`): operational panels, controls, drawers, and ledgers.
- **App Canvas** (`app-canvas`): recessed workspace background.
- **Steel** (`steel`): secondary data, timestamps, and quiet metadata.
- **Rule Gray** (`rule`): internal dividers and subordinate boundaries.
- **Audit Surface** (`audit-surface`): the latest-record cell in the persistent ribbon.
- **Receipt Surface** (`receipt-surface`): durable successful-action confirmation.
- **White** (`white`): text and marks on graphite.

### Named Rules

**The Signal Has a Job Rule.** Vermilion marks an active route, direct action, current selection, or critical field; signal ink carries the same family where small text needs stronger contrast.

**The Redundant State Rule.** Never communicate emergency meaning with hue alone. Pair color with a plain label and, where useful, a dot, icon, threshold, boundary pattern, or receipt state.

## Typography

**Display Font:** Urbanist Variable (with Google Sans, Arial, and sans-serif fallbacks)  
**Body Font:** Urbanist Variable (with Google Sans, Arial, and sans-serif fallbacks)  
**Data Treatment:** Urbanist with tabular numerals for time, metrics, quantities, telemetry, and receipts.

**Character:** One wide, direct family carries cinematic public confidence and dense operational scanning. The public hero uses extreme scale and compressed leading; operational headings compress so the incident ribbon and working surface remain above the fold.

### Hierarchy

- **Display** (weight 820, fluid 4.6–8.8rem, line-height 0.83, tracking -0.055em): centered two-line landing proposition.
- **Headline** (weight 700, fluid 1.8–2.85rem, line-height 0.98, tracking -0.035em): compressed operational introductions.
- **Editorial Section** (weight 700, fluid 3–6rem, line-height 0.9, tracking -0.04em): public proof, system, and closing statements.
- **Title** (weight 700, 1.25rem, line-height 1): panel titles and incident names.
- **Body** (weight 480, 1rem, line-height 1.5): guidance, evidence notes, and explanation.
- **Label** (weight 780, 0.68rem, tracking 0.16em): response-loop groups, rails, legends, and audit fields.

### Named Rules

**The Broad Signal Rule.** Use the oversized display only for one decisive public proposition; use compressed operational headings to preserve working space.

**The Numeric Integrity Rule.** Times, quantities, telemetry, thresholds, and response metrics use tabular numerals so changing values do not disturb alignment.

## Layout

The landing hero is a centered vertical sequence: a minimum 590px proposition field, a full-width image frame capped at 760px, and a three-cell metadata rail. On mobile, the image frame becomes 72vh and the metadata cells stack. The inline photo fragment is a 1.42em by 0.66em crop with a two-pixel graphite boundary, reduced to 1.15em wide on mobile.

The public system demonstration uses a 5/3/4 fractional grid. Treating each fraction as three columns yields a 36-column-equivalent structure: 15 columns for the primary field, 9 for supporting evidence, and 12 for the map or consequence field. Dense placement, shared one-pixel boundaries, and full-row route bands keep it one instrument.

The desktop product uses a 220px fixed navigation rail and a fluid workspace capped at 1540px. The 76px application header is followed by the scenario bar and a persistent 76px incident ribbon. Page introductions compress to an 88px minimum; the working surface uses 20px 22px 32px insets. At 1180px, public compositions simplify. At 820px, navigation becomes an off-canvas drawer, a 42px critical-status rail appears, the incident ribbon stacks, and dense tables expose per-value field labels.

**The Connected Instrument Rule.** Map, ledger, route, resource, audit, and receipt regions share borders and alignment so the interface reads as one operating picture.

## Elevation & Depth

The system is flat by default. Tonal contrast, hard rules, cropped photography, and inset semantic edges create depth. Cast shadows are reserved for the civilian device and open mobile drawer; operational feedback uses inset edges and starting-state transitions.

### Shadow Vocabulary

- **Signal Edge** (`inset 0 5px 0 var(--signal)`): connects an incident plate to the active signal system.
- **Audit Edge** (`inset 4px 0 0 var(--signal)`): marks the latest persistent audit record.
- **Receipt Edge** (`inset 4px 0 0 var(--green)`): confirms a durable successful action.
- **Civilian Device Offset** (`18px 18px 0 var(--graphite)`; `9px 9px 0` on mobile): frames public guidance as a physical artifact.
- **Mobile Navigation Cast** (`14px 0 40px rgba(0,0,0,.3)`): separates the open drawer from the workspace.

### Named Rules

**The Flat Command Rule.** Operational surfaces remain flat at rest; use rules, fills, and inset state edges before a cast shadow.

## Shapes

Structural panels, buttons, ledgers, ribbons, toolbars, receipts, and controls use square corners. Route and timeline nodes use circles or 45-degree diamonds because their geometry communicates sequence and location. Interactive map targets expand to 44px while retaining a 20px visible node. The protected-path mark keeps open center space and one contrasting route stroke.

## Components

Components are direct, auditable, and built for high-stress scanning.

### Buttons

- **Shape:** square, 46px minimum height and 18px horizontal inset; operational row actions use a 44px minimum target.
- **Primary:** signal vermilion with graphite text for direct actions; graphite with white text for command entry and neutral confirmation.
- **Hover / Focus:** transform uses 140ms with the exit ease and color uses 160ms; fine pointers compress to 0.98 scale on press. Focus is a 3px amber outline with 3px offset.
- **Light / Text:** bone reverses the palette on dark or vermilion fields; text links stay unboxed.

### Chips

- **Style:** filter segments are square, ruled 47px cells; status indicators pair uppercase labels with semantic dots.
- **State:** active filters fill graphite. `aria-pressed`, `aria-current`, and `aria-expanded` expose matching programmatic state.

### Cards / Containers

- **Corner Style:** square.
- **Background:** paper for operations, bone for public fields, graphite for command bands, vermilion for active fields, audit surface for latest record, and receipt surface for completed actions.
- **Shadow Strategy:** flat hierarchy with documented inset state edges.
- **Border:** one-pixel graphite outer boundaries and rule-gray internal division.
- **Internal Padding:** compact rows use 12–18px; panels commonly use 22–28px.

### Inputs / Fields

- **Style:** inherited Urbanist text, square geometry, and vermilion caret or range accent.
- **Focus:** a 3px amber outline with 3px offset.
- **Error / Disabled:** warning surfaces combine pale amber, a dark boundary, an icon, and explicit copy; disabled actions retain their label and result.

### Navigation

The 220px graphite rail expresses the response loop as four persistent groups: **Observe** contains Command, Live map, and Incidents; **Act** contains Evacuation, Dispatch, and Resources; **Assure** contains Infrastructure, Simulation, Timeline, and Analytics; **Output** contains Civilian guidance. Active state fills vermilion and keeps icon and label visible. On mobile the closed drawer is inert; opening moves focus inside, Escape and backdrop close it, and focus returns to the trigger.

### Cinematic Hero and Inline Photo Fragment

The centered hero uses a two-line display, one lede, two actions, a full-width command frame, and a ruled metadata rail. Disaster photography carries environmental reality; the inline fragment reuses the image as a sharply bordered editorial cut inside a sentence.

### Persistent Incident Ribbon and Mobile Status Rail

Every operational route begins with active incident, response phase, and latest audit record. Below 820px, a separate 42px graphite rail keeps severity, sync time, and network status visible while the ribbon stacks underneath.

### Durable Action Receipts

Consequential actions produce a ruled receipt containing action, actor/time metadata, delivery or state result, and optional supersede control. Receipts use the green inset edge and `aria-live="polite"`; the same action updates the persistent ribbon and status toast.

### Map, Ledger, and Route Instruments

Maps use a quiet steel field, district outlines, a dashed vermilion danger boundary, a solid viable route, and labeled 44px incident targets. Ledgers keep source, state, evidence, time, and responsibility aligned with explicit expanded-state relationships. Routes connect endpoints with a continuous spine, checkpoints, travel data, conditions, and expiry.

### Charts and Accessible Data

Charts pair written interpretation with a visible scale, labeled dashed threshold, semantic status, and concise `role="img"` summary. Each chart also provides a screen-reader-only data table. Responsive comparison tables replace hidden column headers with per-value `data-label` text.

### Motion and State

Four exact easing tokens govern motion: system settle (`cubic-bezier(.22, 1, .36, 1)`), exit/entry (`cubic-bezier(.23, 1, .32, 1)`), controlled pulse (`cubic-bezier(.77, 0, .175, 1)`), and drawer (`cubic-bezier(.32, .72, 0, 1)`). Hero copy enters over 800ms with 70ms stagger; the image resolves over 1.2s; the route traces over 1.6s after 450ms. Buttons respond in 140–160ms, drawers in 240ms, panel handoffs in 200ms, and receipts/toasts in 220ms with a 160ms toast exit. Scroll motion reduces the command image to 0.96 scale and introduces system cards from 28px at 0.985 scale. A repeating 1.8s pulse is reserved for a running simulation. Reduced-motion mode removes transforms, drawer movement, route animation, pulse, and loading animation while preserving content and opacity feedback.

## Do's and Don'ts

### Do:

- **Do** preserve the protected-path mark, exact Signal Foundry palette, Urbanist, hard rules, and square geometry.
- **Do** use the centered hero, inline photo fragment, and 36-column-equivalent grid as the public composition grammar.
- **Do** organize every operational module within Observe, Act, Assure, or Output.
- **Do** keep incident, response phase, result, actor, time, expiry, and audit state visible after consequential actions.
- **Do** pair charts with interpretation, thresholds, accessible summaries, and underlying table values.
- **Do** preserve 44px targets, focus visibility, keyboard drawer behavior, redundant state, and reduced-motion equivalents.

### Don't:

- **Don't** introduce gradients, glow, glassmorphism, translucent floating layers, or soft card stacks.
- **Don't** use vermilion as ambient decoration or use signal vermilion for small text where signal ink is required.
- **Don't** let navigation labels, the incident ribbon, or receipts disappear in favor of icon-only compression.
- **Don't** animate static reading content continuously; reserve repeating motion for a running simulation.
- **Don't** replace ledgers, rails, route spines, thresholds, and audit records with generic icon-card grids.
- **Don't** add shields, crosses, sirens, heartbeats, radar, or lightning motifs to the protected-path mark.
