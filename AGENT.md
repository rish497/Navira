# NAVIRA Agent Instructions

NAVIRA is a sophisticated disaster-response platform connecting civilians, emergency responders, and command centers. It will eventually include a live disaster map, verified incident reports, dynamic evacuation routes, responder dispatch, resource coordination, infrastructure monitoring, disaster simulation, timelines, and analytics.

Do not build product surfaces, features, routes, components, pages, mockups, prototypes, or visual assets unless the user explicitly asks for implementation work. This file is the project contract for future work.

## Primary Design Authority

Before any future NAVIRA implementation, read the relevant installed skills from the local Codex skills directory and treat them as the primary design authority for the work:

- `C:\Users\mitta\.codex\skills\taste-skill\SKILL.md`
- `C:\Users\mitta\.codex\skills\impeccable\SKILL.md`
- `C:\Users\mitta\.codex\skills\high-end-visual-design\SKILL.md`
- `C:\Users\mitta\.codex\skills\brandkit\SKILL.md`
- `C:\Users\mitta\.codex\skills\brutalist-skill\SKILL.md`
- `C:\Users\mitta\.codex\skills\minimalist-skill\SKILL.md`
- `C:\Users\mitta\.codex\skills\emil-design-eng\SKILL.md`
- `C:\Users\mitta\.codex\skills\animation-vocabulary\SKILL.md`
- `C:\Users\mitta\.codex\skills\find-animation-opportunities\SKILL.md`
- `C:\Users\mitta\.codex\skills\improve-animations\SKILL.md`
- `C:\Users\mitta\.codex\skills\review-animations\SKILL.md`
- `C:\Users\mitta\.codex\skills\apple-design\SKILL.md`
- `C:\Users\mitta\.codex\skills\prototype\SKILL.md`
- `C:\Users\mitta\.codex\skills\output-skill\SKILL.md`

Use the installed skills as binding guidance over generic model taste. If a skill gives a stricter rule than this file, follow the stricter rule unless the user explicitly overrides it.

## Locked Design Directives

Apply these directives to all future NAVIRA user-facing interfaces:

```text
/taste --theme=industrial-brutalist --font-primary="Urbanist" --font-secondary="Google Sans"
/impeccable --layout=asymmetric --spacing=strict-fluid --contrast=high
```

Interpretation:

- Theme: industrial brutalist, tactical, civic, operational, and editorial.
- Layout: asymmetric composition with sharp grid systems and visible structure.
- Spacing: strict fluid spacing using responsive constraints, not arbitrary padding.
- Contrast: high contrast by default, with emergency-critical legibility treated as a product requirement.
- Primary font: Urbanist for major UI and display typography.
- Secondary font: Google Sans for supporting interface text where appropriate.

## NAVIRA Product Posture

NAVIRA is not a generic emergency-themed landing page or SaaS dashboard. It is an operational disaster-response system where design must imply:

- urgency without panic
- trust without softness
- field readiness without visual clutter
- civic authority without bureaucracy
- technical precision without sterile sameness
- civilian clarity without consumer-app gloss

Every design decision must serve disaster response, situational awareness, triage, routing, dispatch, coordination, verification, or command clarity.

## Anti-AI-Slop Guardrails

The following patterns are banned unless the user explicitly asks for them and the reason is documented:

- generic purple or blue gradients
- excessive glow
- glassmorphism as a dominant style
- floating-card layouts
- repetitive icon-card grids
- generic SaaS dashboard aesthetics
- predictable left-text/right-image hero layouts
- unnecessary rounded containers everywhere
- weak typography
- low-contrast text
- decorative elements without operational purpose
- generic stock-photo atmosphere
- fake product screenshots with meaningless tiny UI
- centered everything
- uniform three-column feature blocks
- template copy such as "seamless", "next-gen", "elevate", "unlock", or "supercharge"

If a proposed design contains any of these, revise it before delivery.

## Visual Language

NAVIRA should use a distinctive editorial and industrial language:

- asymmetric layouts
- strong typographic hierarchy
- strict modular grids
- visible structural rules and compartments
- restrained color
- purposeful warning accents
- tactile map, report, route, infrastructure, and command-center artifacts
- dense but readable operational data
- sharp, deliberate spacing
- high-contrast foreground/background relationships
- concrete labels and real disaster-response language

Use visual weight, alignment, spacing, contrast, and real product artifacts before adding decoration.

## Color Direction

Prefer one disciplined substrate per surface:

- Tactical dark substrate for command, dispatch, simulation, and monitoring.
- Industrial light substrate for public-facing civilian guidance, reports, and editorial explanations.

Do not mix unrelated light and dark section flips on the same page unless the product state requires it. Use one accent color consistently per surface. Hazard red, amber, phosphor green, and civic blue may appear only when they carry semantic meaning such as danger, caution, active status, or route guidance.

Avoid one-note palettes. Avoid making the interface look like a generic dark-blue security dashboard.

## Typography

Typography is a core NAVIRA interface material.

- Use Urbanist as the primary typeface when available.
- Use Google Sans as the secondary typeface when available.
- Use monospace only for coordinates, telemetry, incident IDs, logs, timestamps, units, and system codes.
- Use large type only where it creates hierarchy or civic/editorial force.
- Keep body and operational text highly legible.
- Do not rely on tiny uppercase labels as decoration.
- Do not use weak gray text for critical information.
- Do not scale font size directly with viewport width. Use `clamp()` with sensible minimums and maximums where fluid type is needed.
- Keep letter spacing at `0` for normal UI text. Use wider tracking only for short technical labels.

## Layout Rules

Build with engineered structure:

- Start with the information architecture and task priority.
- Use CSS Grid for complex operational layouts.
- Use asymmetric composition intentionally.
- Use full-width bands or unframed layouts for major page sections.
- Use cards only for repeated items, modals, discrete records, tools, or genuinely framed modules.
- Do not put cards inside cards.
- Keep corners sharp or minimally rounded unless a local component system requires otherwise.
- Use stable dimensions and responsive constraints for maps, grids, timelines, controls, counters, boards, and panels.
- Ensure every mobile layout is explicitly designed, not merely stacked by accident.
- Ensure text never overlaps controls or other content.

## Component Standards

Components must feel designed for NAVIRA:

- Incident reports should feel verified, attributable, and time-aware.
- Maps should prioritize routes, hazards, infrastructure state, and responder/civilian context.
- Timelines should make causality and escalation readable.
- Dispatch controls should separate recommendation, assignment, confirmation, and status.
- Resource coordination should show scarcity, location, destination, and responsible unit.
- Infrastructure monitoring should make failure, degradation, dependency, and confidence visible.
- Simulation controls should expose variables, consequences, and scenario state without turning into a toy.
- Analytics should support decision-making, not decorative metric display.

Never use icons as filler. Icons must clarify action, status, type, or severity.

## Motion Rules

Motion must be meaningful, fast, and operationally useful.

Use motion for:

- feedback
- state indication
- spatial consistency
- preventing jarring changes
- explaining rare or complex transitions

Do not use motion just to make the interface feel expensive. High-frequency command workflows, keyboard actions, and dense monitoring surfaces should be restrained.

Implementation rules:

- Animate `transform` and `opacity` by default.
- Avoid animating layout properties such as `width`, `height`, `top`, `left`, `margin`, and `padding`.
- UI motion should generally stay under 300ms.
- Use strong custom easing curves, not default weak easings.
- Use press feedback for important buttons.
- Respect `prefers-reduced-motion`.
- Use scroll-driven, spring, or gesture motion only when it improves orientation, direct manipulation, or comprehension.
- Run `find-animation-opportunities`, `improve-animations`, or `review-animations` only when the user asks for animation discovery, planning, or review.

## Prototyping Rules

Use the `prototype` skill only when the user explicitly asks for variants, explorations, or a picker. When used:

- Create genuinely different directions.
- Keep prototypes isolated from production code.
- Do not promote a variant until the user chooses it.
- Remove the prototype surface after promotion unless the user asks to keep it.

## Visual Asset Rules

NAVIRA interfaces should use meaningful visual assets when a page needs imagery:

- maps
- satellite or terrain-inspired surfaces
- infrastructure schematics
- route diagrams
- verified report artifacts
- command-room or field-response references
- generated bitmap visuals when real assets are unavailable

Avoid fake atmospheric decoration. A visual must help the user understand NAVIRA's world, function, or operational stakes.

Use `brandkit` when generating identity boards, brand systems, logo-world explorations, or presentation-ready visual systems.

## Accessibility And Safety

NAVIRA is emergency-adjacent software. Accessibility is product safety.

- Critical text must pass contrast checks.
- Do not encode emergency state through color alone.
- Use clear labels for civilians and operators.
- Keep tap targets usable on mobile.
- Preserve keyboard navigation.
- Provide visible focus states.
- Avoid motion patterns that make alerts harder to read.
- Avoid ambiguous severity language.
- Distinguish confirmed incidents, unverified reports, simulation outputs, and recommendations.

## Implementation Discipline

Before future implementation:

1. Read this `AGENT.md`.
2. Read the relevant installed skills listed above.
3. Identify the NAVIRA surface being built and its primary user: civilian, responder, dispatcher, analyst, or command center.
4. Define the operational job of the surface before designing visuals.
5. Choose the substrate, grid, typography scale, accent semantics, and motion level.
6. Implement with real content-shaped data where possible.
7. Verify desktop and mobile layouts visually.
8. Run appropriate build or test checks.
9. Review against the anti-slop guardrails before delivery.

If any future implementation starts to look like a generic AI-generated website, stop and redesign before shipping.

## Current Instruction

The current request is documentation only. Do not build NAVIRA yet.
