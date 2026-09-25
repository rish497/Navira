# Product

<!-- impeccable:product-schema 1 -->

## Platform

web application

## Stack

React 19, Vite, MapLibre GL JS, and a Vite server middleware layer for protected upstream requests and normalization. Deployment remains open.

## Users

- Civilians seeking verified, understandable guidance during a disaster.
- Emergency responders coordinating incidents, routes, assignments, and field status.
- Dispatchers, analysts, and command-center teams maintaining shared situational awareness and allocating limited resources.

The current request does not designate one audience as permanently primary. Future surfaces must name their active user and use scene before implementation.

## Product Purpose

NAVIRA connects civilians, emergency responders, and command centers through one disaster-response system. It is intended to make verified incident information, evacuation guidance, responder coordination, resource movement, infrastructure condition, simulation, timelines, and analysis legible and actionable under pressure.

Success means the right person can understand what is happening, what is verified, what action is recommended, and who is responsible without losing time to visual ambiguity.

## Positioning

NAVIRA treats disaster response as a shared operational picture rather than a collection of disconnected alerts, maps, and dashboards. Its distinguishing mechanism is the continuous relationship between evidence, route, action, responsibility, and changing conditions across civilian and command contexts.

## Operating Context

- High-stress, time-sensitive use during disasters and emergency exercises.
- Mixed environments ranging from civilian mobile devices to responder field hardware and command-center displays.
- Variable connectivity, uncertain or conflicting reports, changing routes, scarce resources, and degraded infrastructure.
- Workflows that move from report intake and verification to decision, dispatch, guidance, monitoring, and post-event analysis.

## Capabilities and Constraints

Implemented capabilities include a live MapLibre geographic map, current event records from NASA EONET, GDACS, and USGS, source-native points and geometries, GDACS boundaries, event-linked GDACS news context, a source chronology, and analytics derived from the current API response.

Evacuation routes, responder dispatch, resource coordination, infrastructure monitoring, and disaster simulation intentionally report `Data unavailable` until an authoritative operational source is connected. Public disaster events are never converted into invented operational data.

Confirmed constraints:

- Every displayed event fact must retain source identity, event identifier, source link, geometry, timestamp, and retrieval freshness where provided.
- Missing source fields must display `Data unavailable`; they must never be guessed or generated.
- API secrets remain server-side and must never use the `VITE_` prefix.
- Confirmed, unverified, recommended, simulated, and resolved states must remain distinguishable.
- Emergency meaning cannot depend on color alone.

Open decisions:

- Hosting target, authentication model, local operational data connectors, and offline behavior.
- Which audience and use case the first production surface will prioritize.
- Regulatory, geographic, language, and accessibility standards beyond the safety commitments below.

## Brand Commitments

- Name: NAVIRA.
- The brand must feel like world-class emergency technology: distinctive, confident, intentional, memorable, and designed for real operational stakes.
- Industrial-brutalist theme, asymmetric composition, strict fluid spacing, and high contrast.
- Urbanist is the primary typeface. Google Sans is the secondary typeface when available.
- The visual language must avoid generic SaaS dashboards, generic AI styling, purple-blue gradients, excessive glow, glassmorphism, repetitive icon-card grids, predictable split heroes, floating-card compositions, and ornamental emergency imagery.
- Design decisions must follow the installed design skills and the project contract in `AGENT.md`.

## Evidence on Hand

The application currently reads public live feeds from NASA EONET, GDACS, and USGS. OpenFreeMap provides the OpenStreetMap-based basemap. GDACS event-linked Europe Media Monitor items are labeled as news reporting and kept separate from agency event records. These integrations do not imply a partnership or endorsement.

## Product Principles

1. Make uncertainty explicit.
2. Convert situational awareness into a clear next action.
3. Preserve trust across civilian and professional contexts.
4. Keep evidence, decision, responsibility, and consequence visibly connected.
5. Communicate urgency without manufacturing panic.

## Accessibility & Inclusion

Accessibility is a safety requirement. Critical content needs strong contrast, visible focus, keyboard support, usable touch targets, plain labels, redundant status cues, and reduced-motion behavior. Future localization and assistive-technology requirements remain open and must be resolved before production implementation.

## Assumption Record

This file was inferred from the user's explicit NAVIRA brief because the current run did not provide a structured answer mechanism for the required init interview. All unresolved product and stack decisions are recorded as open rather than invented.
