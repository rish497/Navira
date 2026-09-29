import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/mitta/Documents/Navira";
const SKILL_DIR = "C:/Users/mitta/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const TMP_DIR = path.join(workspaceDir, "artifacts/navira-hackathon-deck/build");
const SCREEN_DIR = path.join(TMP_DIR, "screens");
const OUT_DIR = path.join(workspaceDir, "artifacts/navira-hackathon-deck/output");
const FINAL_PPTX = path.join(OUT_DIR, "NAVIRA-Hackathon-Presentation-Rishabh-Mittal-Final.pptx");
const RUNTIME_PYTHON = "C:/Users/mitta/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(OUT_DIR, { recursive: true });

const W = 1280;
const H = 720;
const C = {
  graphite: "#0F1113",
  ink: "#191C1F",
  bone: "#F1EEE9",
  paper: "#FAF8F4",
  vermilion: "#FF3B1F",
  signalInk: "#A52210",
  amber: "#F4B800",
  steel: "#68737A",
  rule: "#CBC7C0",
  green: "#15775A",
  white: "#FFFFFF",
};
const FONT = "Arial";
const FONT_NARROW = "Bahnschrift";

const presentation = Presentation.create({ slideSize: { width: W, height: H } });

function rect(slide, x, y, w, h, fill, lineFill = "none", lineWidth = 0, radius = false) {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: lineFill, width: lineWidth },
  });
}

function textBox(slide, text, x, y, w, h, opts = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    typeface: opts.typeface ?? FONT,
    fontSize: opts.size ?? 24,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: opts.color ?? C.graphite,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
    autoFit: opts.autoFit ?? "shrinkText",
    wrap: "square",
    lineSpacing: opts.lineSpacing ?? 1,
    insets: opts.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return box;
}

function rule(slide, x, y, w, color = C.vermilion, h = 4) {
  return rect(slide, x, y, w, h, color);
}

function sectionLabel(slide, label, x, y, color = C.vermilion) {
  textBox(slide, label.toUpperCase(), x, y, 320, 20, {
    size: 12, bold: true, color, typeface: FONT_NARROW,
  });
  rule(slide, x, y + 26, 32, color, 3);
}

function chrome(slide, index, dark = true) {
  const fg = dark ? C.bone : C.graphite;
  textBox(slide, "NAVIRA", 48, 26, 120, 22, { size: 14, bold: true, color: fg, typeface: FONT_NARROW });
  textBox(slide, String(index).padStart(2, "0"), 1188, 26, 44, 22, { size: 13, bold: true, color: dark ? C.steel : C.steel, align: "right", typeface: FONT_NARROW });
  rule(slide, 48, 59, 1184, dark ? "#34393D" : C.rule, 1);
}

function notes(slide, talk, sourceLines = []) {
  const sourceText = sourceLines.length ? `\n\nSources:\n${sourceLines.map((s) => `- ${s}`).join("\n")}` : "";
  slide.speakerNotes.textFrame.setText(`${talk}${sourceText}`);
  slide.speakerNotes.setVisible(true);
}

async function imageBytes(name) {
  return new Uint8Array(await fs.readFile(path.join(SCREEN_DIR, name)));
}

async function addScreenshot(slide, name, x, y, w, h, alt, fit = "cover") {
  rect(slide, x - 2, y - 2, w + 4, h + 4, C.rule);
  return slide.images.add({
    blob: await imageBytes(name),
    contentType: "image/png",
    alt,
    fit,
    position: { left: x, top: y, width: w, height: h },
    geometry: "rect",
  });
}

function iconDot(slide, x, y, color = C.vermilion, size = 12) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: size, height: size },
    fill: color,
    line: { fill: "none", width: 0 },
  });
}

function arrow(slide, x1, y, x2, color = C.vermilion) {
  rule(slide, x1, y, Math.max(0, x2 - x1 - 12), color, 3);
  slide.shapes.add({
    geometry: "triangle",
    position: { left: x2 - 14, top: y - 6, width: 14, height: 14 },
    fill: color,
    line: { fill: "none", width: 0 },
    rotation: 90,
  });
}

// 01 — Cover
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  textBox(slide, "LIVE PRODUCT", 662, 88, 180, 22, { size: 12, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  await addScreenshot(slide, "01-landing.png", 662, 124, 570, 321, "NAVIRA landing page and live disaster interface");
  rule(slide, 662, 482, 570, "#34393D", 1);
  textBox(slide, "UNDERSTAND", 662, 508, 150, 24, { size: 14, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  textBox(slide, "PROTECT", 856, 508, 130, 24, { size: 14, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "TEST", 1037, 508, 90, 24, { size: 14, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Real data", 662, 544, 150, 22, { size: 14, color: C.steel });
  textBox(slide, "Safer action", 856, 544, 130, 22, { size: 14, color: C.steel });
  textBox(slide, "3D scenarios", 1037, 544, 150, 22, { size: 14, color: C.steel });
  rule(slide, 48, 44, 46, C.vermilion, 4);
  textBox(slide, "HACKATHON SUBMISSION", 48, 62, 260, 24, { size: 13, bold: true, color: C.steel, typeface: FONT_NARROW });
  textBox(slide, "NAVIRA", 48, 142, 520, 96, { size: 76, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Disaster response from\nverified signal to safer action.", 48, 255, 520, 126, { size: 35, bold: true, color: C.bone, lineSpacing: 0.92 });
  textBox(slide, "Understand the hazard. Protect people in its path. Test what comes next.", 48, 410, 500, 70, { size: 20, color: "#AAB0B4", lineSpacing: 1.12 });
  rule(slide, 48, 548, 520, "#34393D", 1);
  textBox(slide, "RISHABH MITTAL", 48, 575, 300, 28, { size: 17, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Civilians · Responders · Command centers", 48, 610, 420, 24, { size: 14, color: C.steel });
  notes(slide, "NAVIRA is a disaster-response platform that connects real hazard intelligence to civilian protection, operator coordination, and infrastructure testing. I’m Rishabh Mittal, and this is the system I built for this hackathon.");
}

// 02 — The problem
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 2, false);
  sectionLabel(slide, "The response gap", 48, 88);
  textBox(slide, "ONE DISASTER.\nTHREE BROKEN HANDOFFS.", 48, 132, 760, 132, { size: 51, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.9 });
  textBox(slide, "A warning can be accurate and still fail people if it never becomes a clear local decision.", 840, 148, 355, 90, { size: 23, color: C.ink, lineSpacing: 1.08 });
  const cols = [
    ["01", "SIGNAL", "Hazard feeds, official alerts, maps, closures and reporting arrive separately."],
    ["02", "DECISION", "Civilians need to know whether they are affected and where to go now."],
    ["03", "ACTION", "Operators need one incident context for help, dispatch, resources and accountability."],
  ];
  cols.forEach((c, i) => {
    const x = 48 + i * 404;
    rule(slide, x, 332, 356, i === 1 ? C.vermilion : C.graphite, 3);
    textBox(slide, c[0], x, 356, 62, 46, { size: 34, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    textBox(slide, c[1], x + 76, 362, 240, 28, { size: 18, bold: true, color: C.graphite, typeface: FONT_NARROW });
    textBox(slide, c[2], x, 430, 342, 132, { size: 21, color: C.ink, lineSpacing: 1.14 });
  });
  textBox(slide, "NAVIRA closes the handoff from verified data to coordinated response.", 48, 638, 860, 28, { size: 18, bold: true, color: C.signalInk });
  notes(slide, "The core problem is the handoff. Data may exist, but civilians, field teams, and command centers need different answers from the same verified geographic record. NAVIRA turns that shared record into a connected response workflow.");
}

// 03 — Three pillars
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  chrome(slide, 3, true);
  sectionLabel(slide, "One connected product story", 48, 88);
  textBox(slide, "UNDERSTAND → PROTECT → TEST", 48, 128, 980, 66, { size: 43, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Disaster happens. NAVIRA detects it, finds people at risk, helps them act, and lets teams test infrastructure against the same hazard context.", 48, 206, 1090, 70, { size: 21, color: "#AAB0B4", lineSpacing: 1.12 });
  const pillars = [
    ["01", "UNDERSTAND", "Real disaster intelligence", "NASA EONET · GDACS · USGS\nVerified geometry · Freshness · Provenance"],
    ["02", "PROTECT", "Civilian and operator action", "Near You · Help requests · Escape routes\nIncidents · Dispatch · Resources · Audit"],
    ["03", "TEST", "Infrastructure resilience lab", "Real infrastructure · Custom models\nHazard scenarios · Side-by-side comparison"],
  ];
  pillars.forEach((p, i) => {
    const x = 48 + i * 404;
    rect(slide, x, 338, 356, 264, i === 1 ? C.ink : C.graphite, i === 1 ? C.vermilion : "#34393D", i === 1 ? 3 : 1);
    textBox(slide, p[0], x + 20, 356, 60, 44, { size: 34, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    textBox(slide, p[1], x + 20, 420, 310, 30, { size: 20, bold: true, color: C.bone, typeface: FONT_NARROW });
    textBox(slide, p[2], x + 20, 466, 310, 44, { size: 20, bold: true, color: C.bone });
    textBox(slide, p[3], x + 20, 528, 310, 60, { size: 15, color: C.steel, lineSpacing: 1.1 });
    if (i < 2) arrow(slide, x + 356, 470, x + 404, C.vermilion);
  });
  notes(slide, "NAVIRA is organized around three pillars. Understand consolidates verified disaster intelligence. Protect turns that intelligence into civilian and operator action. Test extends the same disaster context into infrastructure simulation and design comparison.", [
    "NASA EONET — https://eonet.gsfc.nasa.gov/",
    "GDACS — https://www.gdacs.org/",
    "USGS Earthquake Hazards Program — https://earthquake.usgs.gov/",
  ]);
}

// 04 — Live intelligence
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  chrome(slide, 4, true);
  await addScreenshot(slide, "02-live-map.png", 48, 98, 806, 525, "NAVIRA live global disaster map with selected verified event");
  sectionLabel(slide, "Understand / 01", 894, 108);
  textBox(slide, "A live operating picture,\nnot a decorative map.", 894, 154, 330, 94, { size: 32, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.96 });
  const items = [
    "MapLibre + OpenStreetMap-based geography",
    "NASA EONET, GDACS and USGS event feeds",
    "Coordinates, source, status and timestamps",
    "Source-native geometry where available",
    "Explicit unavailable and degraded states",
  ];
  items.forEach((item, i) => {
    iconDot(slide, 896, 300 + i * 55, i === 4 ? C.amber : C.vermilion, 9);
    textBox(slide, item, 919, 292 + i * 55, 290, 40, { size: 17, color: i === 4 ? C.bone : "#C9CDCF" });
  });
  textBox(slide, "Every layer carries source attribution and freshness.", 894, 595, 320, 44, { size: 15, bold: true, color: C.vermilion });
  notes(slide, "The map is the operational center of NAVIRA. It uses real geographic proportions and live sources. Each record keeps its coordinates, category, timestamp, status, source and freshness. When a source does not provide enough geometry or availability, NAVIRA says so instead of inventing it.", [
    "MapLibre GL JS — https://maplibre.org/",
    "OpenFreeMap — https://openfreemap.org/",
    "OpenStreetMap — https://www.openstreetmap.org/",
    "NASA EONET — https://eonet.gsfc.nasa.gov/",
    "GDACS — https://www.gdacs.org/",
    "USGS Earthquake Hazards Program — https://earthquake.usgs.gov/",
  ]);
}

// 05 — Near You
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 5, false);
  sectionLabel(slide, "Protect / Near You", 48, 88);
  textBox(slide, "THE GLOBAL MAP BECOMES\nA LOCAL SAFETY DECISION.", 48, 130, 440, 112, { size: 38, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.93 });
  textBox(slide, "With permission, NAVIRA centers on the person—not on a random event—and ranks reviewed hazards by real distance.", 48, 270, 420, 106, { size: 22, color: C.ink, lineSpacing: 1.12 });
  const facts = [
    ["01", "Browser geolocation with explicit permission"],
    ["02", "Distance from the person to verified events"],
    ["03", "Deterministic point-versus-geometry checks"],
    ["04", "No invented danger radius"],
  ];
  facts.forEach((f, i) => {
    textBox(slide, f[0], 48, 420 + i * 51, 38, 30, { size: 16, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    textBox(slide, f[1], 102, 419 + i * 51, 350, 35, { size: 17, color: C.graphite });
  });
  await addScreenshot(slide, "03-near-you.png", 518, 100, 714, 535, "NAVIRA Near You mode centered on a civilian location with nearby verified events");
  notes(slide, "Near You starts from the civilian’s actual location, with permission. It centers the map on the user, retrieves the surrounding verified events, computes distance, and checks the user’s coordinates against source geometry where that geometry exists. NAVIRA never creates a danger circle just to fill a gap.");
}

// 06 — Escape flow
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  await addScreenshot(slide, "04-civilian-safety.png", 452, 88, 780, 439, "NAVIRA civilian safety workflow and local route planning interface");
  rule(slide, 48, 47, 46, C.vermilion, 4);
  textBox(slide, "PROTECT / CIVILIAN FLOW", 48, 68, 300, 24, { size: 13, bold: true, color: C.steel, typeface: FONT_NARROW });
  textBox(slide, "FROM “AM I IN DANGER?”\nTO “HOW DO I LEAVE?”", 48, 130, 352, 112, { size: 36, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.94 });
  const stages = ["WORLD", "NEAR YOU", "HAZARD", "DESTINATION", "ROUTES", "ESCAPE"];
  stages.forEach((s, i) => {
    const y = 286 + i * 51;
    textBox(slide, String(i + 1).padStart(2, "0"), 48, y, 38, 24, { size: 13, bold: true, color: i < 2 ? C.vermilion : C.steel, typeface: FONT_NARROW });
    textBox(slide, s, 100, y - 1, 250, 26, { size: 18, bold: true, color: i < 2 ? C.bone : "#7F888E", typeface: FONT_NARROW });
    if (i < stages.length - 1) rule(slide, 65, y + 28, 1, "#34393D", 22);
  });
  textBox(slide, "Real road routes. Verified exposure checks. Clear reasons when a route changes.", 48, 620, 340, 64, { size: 16, color: "#AAB0B4", lineSpacing: 1.1 });
  rule(slide, 452, 575, 780, "#34393D", 1);
  textBox(slide, "FASTEST", 452, 600, 110, 24, { size: 14, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  textBox(slide, "LOWER VERIFIED EXPOSURE", 658, 600, 240, 24, { size: 14, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "MONITORED NAVIGATION", 982, 600, 220, 24, { size: 14, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Time + distance", 452, 635, 150, 22, { size: 14, color: C.steel });
  textBox(slide, "Explains hazard differences", 658, 635, 240, 22, { size: 14, color: C.steel });
  textBox(slide, "Rechecks meaningful changes", 982, 635, 220, 22, { size: 14, color: C.steel });
  notes(slide, "This is the civilian safety sequence: World, Near You, Hazard, Destination, Routes, Escape. NAVIRA only exposes escape planning when verified geometry supports the risk state. It uses a real routing engine for travel time and road geometry, then compares route exposure to verified hazards. During navigation it can re-evaluate when hazards, alerts or verified closures materially change, and it tells the user why.", [
    "OSRM routing engine — https://project-osrm.org/",
    "Open511 road-event data standard — https://open511.org/",
  ]);
}

// 07 — Evidence and help loop
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 7, false);
  sectionLabel(slide, "Protect / Community evidence", 48, 88);
  textBox(slide, "A HUMAN-VERIFIED PATH FROM\nTHE STREET TO THE OPERATING MAP.", 48, 130, 890, 104, { size: 40, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.92 });
  const steps = [
    ["01", "CAPTURE", "Take or upload a photo and provide the event type."],
    ["02", "LOCATE", "Attach device location after explicit permission."],
    ["03", "VERIFY", "An operator reviews the evidence and classifies it."],
    ["04", "PUBLISH", "A verified community incident enters the shared map."],
    ["05", "PROTECT", "Nearby civilians receive the context and can open routes."],
  ];
  steps.forEach((s, i) => {
    const x = 48 + i * 238;
    textBox(slide, s[0], x, 318, 50, 32, { size: 22, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    rule(slide, x, 362, 196, i === 2 ? C.vermilion : C.graphite, i === 2 ? 4 : 2);
    textBox(slide, s[1], x, 388, 196, 28, { size: 17, bold: true, color: C.graphite, typeface: FONT_NARROW });
    textBox(slide, s[2], x, 433, 196, 105, { size: 17, color: C.ink, lineSpacing: 1.1 });
    if (i < steps.length - 1) arrow(slide, x + 198, 364, x + 228, C.vermilion);
  });
  rect(slide, 48, 592, 1184, 62, C.graphite);
  textBox(slide, "Help requests remain gated by verified local hazard context; evidence is never promoted without human review.", 70, 610, 1140, 28, { size: 18, bold: true, color: C.bone, align: "center" });
  notes(slide, "Civilians can contribute evidence without letting unverified reports become operational truth. They capture or upload an image, attach their location with permission, and submit a small incident form. An operator must review the evidence before it becomes a community incident on the map. Help requests remain tied to verified nearby hazards.");
}

// 08 — Operator command
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  chrome(slide, 8, true);
  sectionLabel(slide, "Protect / Operator command", 48, 88);
  textBox(slide, "ONE INCIDENT CONTEXT ACROSS\nTHE ENTIRE RESPONSE CHAIN.", 48, 128, 720, 95, { size: 40, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.92 });
  textBox(slide, "An active incident stays visible while operators move from hazards to people, assignments, resources and accountability.", 820, 139, 380, 84, { size: 20, color: "#AAB0B4", lineSpacing: 1.1 });
  await addScreenshot(slide, "05-operator-command.png", 48, 270, 1184, 390, "NAVIRA operator command dashboard with active incident context");
  notes(slide, "The operator workspace is built around an active incident context. That context links hazards, alerts, help requests, assignments, resources, road restrictions and notes. Operators can create incidents, switch between authorized incidents, change operational phase, and keep the same context visible across the response modules.");
}

// 09 — People, dispatch, resources
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 9, false);
  await addScreenshot(slide, "06-people-hazards.png", 48, 100, 726, 522, "NAVIRA operator people and hazards map");
  sectionLabel(slide, "Protect / Field operations", 818, 106);
  textBox(slide, "SEE PEOPLE.\nMOVE RESPONSE.", 818, 150, 360, 86, { size: 38, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.9 });
  const rows = [
    ["PEOPLE + HAZARDS", "Consented civilian locations, verified events and reviewed evidence."],
    ["HELP QUEUE", "Requests progress from verified to assigned, dispatched, on scene and resolved."],
    ["RESPONDER DISPATCH", "Role-checked assignments with acknowledgement and status transitions."],
    ["RESOURCE COORDINATION", "Allocate verified stock without exceeding available quantities."],
    ["ROUTE MONITORING", "Surface hazards and trusted restrictions that intersect active routes."],
  ];
  rows.forEach((r, i) => {
    const y = 278 + i * 72;
    rule(slide, 818, y, 360, "#D9D5CF", 1);
    textBox(slide, r[0], 818, y + 12, 160, 24, { size: 14, bold: true, color: C.signalInk, typeface: FONT_NARROW });
    textBox(slide, r[1], 982, y + 8, 206, 50, { size: 15, color: C.ink, lineSpacing: 1.05 });
  });
  notes(slide, "The operator can see consented civilian positions alongside verified hazards and reviewed community evidence. Help requests follow a server-authoritative lifecycle. Responders can be assigned and acknowledge work. Resources can be allocated only from known stock. Active routes can be monitored against verified hazard and road-restriction changes.");
}

// 10 — Incident + audit
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  chrome(slide, 10, true);
  sectionLabel(slide, "Command + accountability", 48, 88);
  textBox(slide, "EVERY DECISION KEEPS ITS CONTEXT—\nAND ITS HISTORY.", 48, 126, 900, 94, { size: 39, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.92 });
  await addScreenshot(slide, "07-incidents.png", 48, 264, 568, 320, "NAVIRA incident command context and incident creation workspace");
  await addScreenshot(slide, "08-audit.png", 664, 264, 568, 320, "NAVIRA immutable operational audit trail");
  textBox(slide, "INCIDENT CONTEXT", 48, 604, 260, 24, { size: 15, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  textBox(slide, "AUDIT TRAIL", 664, 604, 260, 24, { size: 15, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  textBox(slide, "Name · type · geography · severity · phase · lead · linked records", 48, 638, 560, 22, { size: 14, color: C.steel });
  textBox(slide, "System · civilian · responder · operator actions with before/after state", 664, 638, 568, 22, { size: 14, color: C.steel });
  notes(slide, "Command context and accountability are connected. An incident stores its area, severity, phase, status, organization, lead and linked operational records. The audit trail records server time, actor, role, action, affected record, previous state, resulting state and metadata. The interface distinguishes system, civilian, responder and operator actions.");
}

// 11 — Analytics and context
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 11, false);
  sectionLabel(slide, "Shared intelligence", 48, 88);
  textBox(slide, "FILTER THE WORLD\nDOWN TO A PLACE.", 48, 130, 400, 92, { size: 41, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.92 });
  textBox(slide, "Both civilians and operators can inspect location-specific analytics, event types, source coverage, timelines and reporting context.", 48, 250, 400, 104, { size: 21, color: C.ink, lineSpacing: 1.12 });
  const strips = [
    ["ANALYTICS", "Country, city or area filters over the same live event records."],
    ["EVENT LEDGER", "Traceable source records with timestamps and status."],
    ["NEWS CONTEXT", "Reporting is visually separated from verified agency data."],
  ];
  strips.forEach((s, i) => {
    const y = 405 + i * 72;
    textBox(slide, s[0], 48, y, 128, 24, { size: 14, bold: true, color: C.signalInk, typeface: FONT_NARROW });
    textBox(slide, s[1], 182, y - 2, 270, 46, { size: 16, color: C.ink, lineSpacing: 1.05 });
    rule(slide, 48, y + 52, 400, C.rule, 1);
  });
  await addScreenshot(slide, "09-analytics.png", 500, 101, 732, 521, "NAVIRA live disaster analytics filtered from verified source records");
  notes(slide, "NAVIRA also provides shared intelligence views. Civilians and operators can filter analytics by place, inspect event categories and source coverage, follow the event ledger and timeline, and open related reporting. News remains clearly labeled as reporting context rather than agency-verified operational data.");
}

// 12 — Simulation lab
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  chrome(slide, 12, true);
  sectionLabel(slide, "Test / Infrastructure simulation", 48, 88);
  textBox(slide, "FROM MAPPED STRUCTURE\nTO TESTABLE 3D SCENARIO.", 48, 130, 540, 98, { size: 40, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.92 });
  textBox(slide, "A visual and heuristic lab—never an unsupported engineering verdict.", 718, 156, 470, 48, { size: 20, color: "#AAB0B4", align: "right" });
  await addScreenshot(slide, "11-simulation.png", 48, 260, 774, 402, "NAVIRA infrastructure simulation lab with 3D viewport and hazard controls");
  const features = [
    ["IMPORT", "Search real infrastructure or resolve an address."],
    ["VERIFY", "Review exterior imagery before grounded AI description."],
    ["BUILD", "Generate or directly edit faces, edges and vertices."],
    ["SIMULATE", "Earthquake, flood and wind scenarios over time."],
    ["COMPARE", "Same building + same hazard, Design A versus Design B."],
  ];
  features.forEach((f, i) => {
    const y = 274 + i * 74;
    textBox(slide, f[0], 864, y, 100, 24, { size: 15, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    textBox(slide, f[1], 864, y + 27, 330, 42, { size: 16, color: C.bone, lineSpacing: 1.05 });
    if (i < features.length - 1) rule(slide, 864, y + 67, 330, "#34393D", 1);
  });
  notes(slide, "The Test pillar is the Infrastructure Simulation Lab. Operators can import mapped infrastructure, search by address, review exterior imagery in a human-in-the-loop workflow, use AI only to describe approved visual evidence, or build a custom structure. The 3D editor supports direct face, edge and vertex manipulation. Hazard scenarios animate deformation, water, wind, cracks and damage regions. Scenario comparison keeps the building and hazard constant while design parameters differ. Outputs are clearly labeled visual or heuristic and never claim engineering safety without a validated solver.");
}

// 13 — Trust architecture
{
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  chrome(slide, 13, false);
  sectionLabel(slide, "Trust architecture", 48, 88);
  textBox(slide, "FACTS STAY DETERMINISTIC.\nAI STAYS IN ITS LANE.", 48, 128, 820, 94, { size: 41, bold: true, color: C.graphite, typeface: FONT_NARROW, lineSpacing: 0.92 });
  const layers = [
    ["01", "AUTHORITATIVE / OPEN SOURCES", "Disasters · alerts · roads · geography · infrastructure"],
    ["02", "DETERMINISTIC CORE", "Geometry checks · distance · routing · state transitions · allocations"],
    ["03", "ROLE-BASED WORKFLOWS", "Civilian · responder · operator · organization and incident access"],
    ["04", "GROUNDED AI EXPLANATION", "Explain retrieved facts and approved images; never create operational truth"],
  ];
  layers.forEach((l, i) => {
    const y = 284 + i * 78;
    rect(slide, 48, y, 1184, 62, i === 3 ? C.graphite : "#EFECE6", i === 3 ? C.graphite : C.rule, 1);
    textBox(slide, l[0], 68, y + 17, 54, 26, { size: 17, bold: true, color: C.vermilion, typeface: FONT_NARROW });
    textBox(slide, l[1], 148, y + 15, 330, 28, { size: 17, bold: true, color: i === 3 ? C.bone : C.graphite, typeface: FONT_NARROW });
    textBox(slide, l[2], 506, y + 15, 688, 30, { size: 17, color: i === 3 ? "#C9CDCF" : C.ink });
  });
  textBox(slide, "Server-side secrets · HttpOnly auth cookies · role enforcement · durable Upstash-backed state · explicit source freshness", 48, 632, 1184, 28, { size: 15, bold: true, color: C.signalInk, align: "center" });
  notes(slide, "Trust is an architectural choice. Source data enters through explicit adapters. Geographic risk, route geometry, state transitions and allocations remain deterministic. Roles and incident access are enforced on the server. AI can explain already retrieved facts and interpret operator-approved images, but it cannot decide whether a disaster exists, invent coordinates, create hazard boundaries, choose routes or issue evacuation decisions. Secrets remain server-side, authentication uses HttpOnly cookies, and durable state can run on Upstash-backed storage.");
}

// 14 — Demo
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  rule(slide, 92, 146, 72, C.vermilion, 6);
  textBox(slide, "DEMO", 82, 207, 1116, 250, { size: 142, bold: true, color: C.bone, align: "center", valign: "middle", typeface: FONT_NARROW });
  rule(slide, 1116, 518, 72, C.vermilion, 6);
  textBox(slide, "LIVE NAVIRA WALKTHROUGH", 440, 544, 400, 30, { size: 16, bold: true, color: C.steel, align: "center", typeface: FONT_NARROW });
  notes(slide, "This is the live demo. I’ll move through the civilian and operator sides, show the real-data map and Near You flow, trace the operational response, and finish in the Infrastructure Simulation Lab.");
}

// 15 — Close
{
  const slide = presentation.slides.add();
  slide.background.fill = C.graphite;
  rule(slide, 48, 44, 46, C.vermilion, 4);
  textBox(slide, "NAVIRA", 48, 114, 460, 82, { size: 68, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "FROM VERIFIED SIGNAL\nTO COORDINATED ACTION.", 48, 244, 820, 130, { size: 50, bold: true, color: C.bone, typeface: FONT_NARROW, lineSpacing: 0.9 });
  textBox(slide, "UNDERSTAND", 52, 458, 210, 30, { size: 18, bold: true, color: C.vermilion, typeface: FONT_NARROW });
  arrow(slide, 226, 473, 342, C.vermilion);
  textBox(slide, "PROTECT", 366, 458, 180, 30, { size: 18, bold: true, color: C.bone, typeface: FONT_NARROW });
  arrow(slide, 530, 473, 646, C.vermilion);
  textBox(slide, "TEST", 670, 458, 150, 30, { size: 18, bold: true, color: C.bone, typeface: FONT_NARROW });
  rule(slide, 48, 570, 1184, "#34393D", 1);
  textBox(slide, "RISHABH MITTAL", 48, 604, 300, 32, { size: 18, bold: true, color: C.bone, typeface: FONT_NARROW });
  textBox(slide, "Hackathon submission", 48, 640, 300, 24, { size: 14, color: C.steel });
  textBox(slide, "A serious disaster-response system built around real geography, verified sources and human decisions.", 714, 603, 518, 60, { size: 18, color: "#AAB0B4", align: "right", lineSpacing: 1.08 });
  notes(slide, "NAVIRA brings verified disaster intelligence, civilian protection, operator coordination and infrastructure testing into one coherent system. It is built to make the next decision clearer, faster and more accountable. Thank you.");
}

const draftPath = path.join(TMP_DIR, "NAVIRA-Hackathon-Presentation-draft.pptx");
await (await PresentationFile.exportPptx(presentation)).save(draftPath);

const previewDir = path.join(TMP_DIR, "previews");
await fs.mkdir(previewDir, { recursive: true });
for (let i = 0; i < presentation.slides.items.length; i += 1) {
  const slide = presentation.slides.items[i];
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(previewDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await preview.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(previewDir, `slide-${String(i + 1).padStart(2, "0")}.layout.json`), await layout.text());
}

const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);
const stagingDir = path.join(TMP_DIR, ".codex-finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const requirements = {
  explicitTotalSlideCount: 15,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
};
const fontPolicy = { basis: "design", families: [FONT, FONT_NARROW] };
const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  requiredNativeTableOwnerSlides: [],
  fontPolicy,
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "NAVIRA-Hackathon-Presentation-Final.validation.json"),
});

console.log(JSON.stringify({ draftPath, finalPath: FINAL_PPTX, previews: previewDir, finalizer: result }, null, 2));
