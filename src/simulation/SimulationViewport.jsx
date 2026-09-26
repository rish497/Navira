import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const INK = 0x0f1113;
const PAPER = 0xf1eee9;
const STEEL = 0x72797d;
const SIGNAL = 0xff3b1f;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function normalizedShape(model) {
  const raw = model?.footprint || [];
  if (raw.length < 3) return [new THREE.Vector2(-4, -3), new THREE.Vector2(4, -3), new THREE.Vector2(4, 3), new THREE.Vector2(-4, 3)];
  if (model.kind === 'imported') {
    const lons = raw.map((point) => point[0]);
    const lats = raw.map((point) => point[1]);
    const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const projected = raw.map(([lon, lat]) => new THREE.Vector2((lon - centerLon) * Math.cos(centerLat * Math.PI / 180), lat - centerLat));
    const span = Math.max(
      Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x)),
      Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y)),
      .000001,
    );
    return projected.map((point) => new THREE.Vector2(point.x / span * 12, point.y / span * 12));
  }
  const width = Math.max(4, Number(model.width) || 20);
  const length = Math.max(4, Number(model.length) || 28);
  return raw.map((point) => new THREE.Vector2((point.x - .5) * width * .45, (.5 - point.y) * length * .45));
}

function normalizedLine(model) {
  const raw = model?.footprint || [];
  if (raw.length < 2) return [];
  const lons = raw.map((point) => point[0]);
  const lats = raw.map((point) => point[1]);
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const projected = raw.map(([lon, lat]) => new THREE.Vector2((lon - centerLon) * Math.cos(centerLat * Math.PI / 180), lat - centerLat));
  const span = Math.max(
    Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x)),
    Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y)),
    .000001,
  );
  return projected.map((point) => new THREE.Vector3(point.x / span * 22, .45, point.y / span * 22));
}

function normalizedSiteFeatures(model) {
  const features = model?.siteFeatures || [];
  const all = features.flatMap((feature) => feature.geometry || []);
  if (!all.length) return [];
  const reference = model.center || [all.reduce((sum, point) => sum + point[0], 0) / all.length, all.reduce((sum, point) => sum + point[1], 0) / all.length];
  const latitude = reference[1];
  const projected = all.map(([longitude, pointLatitude]) => [(longitude - reference[0]) * Math.cos(latitude * Math.PI / 180), pointLatitude - latitude]);
  const span = Math.max(Math.max(...projected.map((point) => point[0])) - Math.min(...projected.map((point) => point[0])), Math.max(...projected.map((point) => point[1])) - Math.min(...projected.map((point) => point[1])), .000001);
  return features.map((feature) => ({
    ...feature,
    points: (feature.geometry || []).map(([longitude, pointLatitude]) => new THREE.Vector3((longitude - reference[0]) * Math.cos(latitude * Math.PI / 180) / span * 42, .025, (pointLatitude - latitude) / span * 42)),
  }));
}

function addStrip(group, points, width, color, y = .04) {
  if (points.length < 2) return;
  const material = new THREE.MeshStandardMaterial({ color, roughness: .94, metalness: 0 });
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < .01) continue;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(length, .07, width), material);
    segment.position.set((start.x + end.x) / 2, y, (start.z + end.z) / 2);
    segment.rotation.y = -Math.atan2(dz, dx);
    segment.receiveShadow = true;
    segment.userData.assembly = { type: 'site', start: .04, end: .2, finalY: y, centered: false };
    group.add(segment);
  }
}

function addAirportSite(group, model) {
  const features = normalizedSiteFeatures(model);
  features.forEach((feature) => {
    if (feature.type === 'runway') addStrip(group, feature.points, 1.05, 0x4e5355, .04);
    else if (feature.type === 'taxiway') addStrip(group, feature.points, .28, 0x777b79, .055);
    else if (feature.type === 'jet_bridge') addStrip(group, feature.points, .22, 0xa7a49e, .28);
    else if (feature.type === 'apron' && feature.points.length >= 3) {
      const shape = new THREE.Shape(feature.points.map((point) => new THREE.Vector2(point.x, point.z)));
      const apron = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x696d6d, roughness: .96 }));
      apron.rotation.x = -Math.PI / 2;
      apron.position.y = .03;
      apron.receiveShadow = true;
      apron.userData.assembly = { type: 'site', start: .02, end: .18, finalY: .03, centered: false };
      group.add(apron);
    }
  });
}

function shapeBounds(points) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.y);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
    width: Math.max(2, Math.max(...xs) - Math.min(...xs)), depth: Math.max(2, Math.max(...zs) - Math.min(...zs)),
  };
}

function modelColor(value, fallback) {
  try { return new THREE.Color(value || fallback); } catch { return new THREE.Color(fallback); }
}

function extrudedMass(points, height, color, startY = 0, scale = 1, assemblyStart = .42, assemblyEnd = .78) {
  const scaled = points.map((point) => new THREE.Vector2(point.x * scale, point.y * scale));
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(scaled), { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: .05 }));
  mesh.position.y = startY;
  mesh.userData.assembly = { type: 'envelope', start: assemblyStart, end: assemblyEnd, finalY: startY, centered: false };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: .48 }));
  edges.position.y = startY;
  edges.userData.assembly = { type: 'edge', start: Math.max(.68, assemblyEnd - .05), end: Math.min(.9, assemblyEnd + .08), finalY: startY, centered: false };
  return { mesh, edges };
}

function markAssembly(object, type, start, end, centered = false) {
  object.traverse((child) => {
    if (!child.isMesh && !child.isLine && !child.isLineSegments) return;
    child.userData.assembly = { type, start, end, finalY: child.position.y, centered };
  });
}

function addLinearInfrastructure(group, model, bridge = false) {
  const line = normalizedLine(model);
  if (line.length < 2) return false;
  const curve = new THREE.CatmullRomCurve3(line);
  const deckHeight = bridge ? .7 : .3;
  const deck = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(18, line.length * 4), bridge ? .72 : .48, bridge ? 8 : 6, false),
    new THREE.MeshStandardMaterial({ color: bridge ? 0x9a9b98 : 0x6f7475, roughness: .93, metalness: bridge ? .14 : 0 }),
  );
  deck.position.y = deckHeight;
  deck.userData.assembly = { type: 'envelope', start: .32, end: .72, finalY: deckHeight, centered: true };
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  const centerLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: .7 }));
  centerLine.position.y = deckHeight + .55;
  centerLine.userData.assembly = { type: 'edge', start: .72, end: .84, finalY: deckHeight + .55, centered: false };
  group.add(centerLine);
  if (bridge) {
    const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x555b5e, roughness: .8 });
    line.filter((_, index) => index > 0 && index < line.length - 1).forEach((point) => {
      const support = new THREE.Mesh(new THREE.BoxGeometry(.45, 2.8, .45), supportMaterial);
      support.position.set(point.x, -.95, point.z);
      support.userData.assembly = { type: 'structure', start: .12, end: .42, finalY: -.95, centered: true };
      group.add(support);
    });
  }
  group.userData.height = bridge ? 2.4 : .8;
  return true;
}

function addRoof(group, type, bounds, height, color) {
  if (!type || ['flat', 'unknown', 'unspecified'].includes(type)) return;
  const roofMaterial = new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: .08 });
  let roof;
  if (type === 'dome') {
    roof = new THREE.Mesh(new THREE.SphereGeometry(Math.min(bounds.width, bounds.depth) * .28, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), roofMaterial);
    roof.position.y = height;
  } else if (type === 'vaulted') {
    roof = new THREE.Mesh(new THREE.CylinderGeometry(bounds.depth * .34, bounds.depth * .34, bounds.width * .8, 24, 1, false, 0, Math.PI), roofMaterial);
    roof.rotation.z = Math.PI / 2;
    roof.position.y = height;
  } else if (type === 'sawtooth') {
    const roofGroup = new THREE.Group();
    for (let index = 0; index < 4; index += 1) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(bounds.depth * .14, bounds.width * .22, 3), roofMaterial);
      tooth.rotation.z = Math.PI / 2;
      tooth.position.set(-bounds.width * .3 + index * bounds.width * .2, height + bounds.depth * .08, 0);
      roofGroup.add(tooth);
    }
    markAssembly(roofGroup, 'roof', .88, 1, true);
    group.add(roofGroup);
    return;
  } else {
    roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bounds.width, bounds.depth) * .52, type === 'gable' ? 2.2 : 1.7, 4), roofMaterial);
    roof.position.y = height + (type === 'gable' ? 1.1 : .85);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, bounds.depth / bounds.width);
  }
  roof.castShadow = true;
  roof.userData.assembly = { type: 'roof', start: .88, end: 1, finalY: roof.position.y, centered: true };
  group.add(roof);
}

function edgeFaceId(start, end, bounds) {
  const x = (start.x + end.x) / 2 - (bounds.minX + bounds.maxX) / 2;
  const z = (start.y + end.y) / 2 - (bounds.minZ + bounds.maxZ) / 2;
  if (Math.abs(x / bounds.width) > Math.abs(z / bounds.depth)) return x >= 0 ? 'east' : 'west';
  return z >= 0 ? 'south' : 'north';
}

function customFacade(model) {
  const openingMap = {
    'regular bays': 'grid', 'limited openings': 'limited', 'open ground floor': 'horizontal-bands', unspecified: 'none',
  };
  return {
    windowPattern: openingMap[model.openings] || 'grid', glazingRatio: model.openings === 'limited openings' ? .18 : .42,
    baysX: 7, baysZ: 5, primaryColor: '#c7c3bb', secondaryColor: '#273137', horizontalBands: false, verticalFins: false,
  };
}

function addWrappedFacade(group, model, points, bounds, height, floors) {
  const baseFacade = model.visualDescriptor?.facade || customFacade(model);
  const rows = Math.max(1, Math.min(18, floors));
  const edgeCount = points.length;
  for (let index = 0; index < edgeCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % edgeCount];
    const dx = end.x - start.x;
    const dz = end.y - start.y;
    const length = Math.hypot(dx, dz);
    if (length < .08) continue;
    const faceId = edgeFaceId(start, end, bounds);
    const facade = { ...baseFacade, ...(model.faceOverrides?.[faceId] || {}) };
    const angle = -Math.atan2(dz, dx);
    const normalX = -dz / length;
    const normalZ = dx / length;
    const midpointX = (start.x + end.x) / 2;
    const midpointZ = (start.y + end.y) / 2;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, height),
      new THREE.MeshStandardMaterial({ color: modelColor(facade.primaryColor, '#c7c3bb'), roughness: .82, side: THREE.DoubleSide }),
    );
    wall.position.set(midpointX + normalX * .018, height / 2, midpointZ + normalZ * .018);
    wall.rotation.y = angle;
    wall.userData.faceId = faceId;
    wall.userData.selectableFace = model.kind === 'custom';
    wall.userData.assembly = { type: 'envelope', start: .56, end: .8, finalY: height / 2, centered: true };
    group.add(wall);

    if (!facade || ['none', 'unknown'].includes(facade.windowPattern) || Number(facade.glazingRatio) <= .02) continue;
    const windowMaterial = new THREE.MeshPhysicalMaterial({ color: modelColor(facade.secondaryColor, '#293238'), roughness: .24, metalness: .12, transparent: true, opacity: .9, side: THREE.DoubleSide });
    const relativeSpan = length / Math.max(bounds.width, bounds.depth);
    const baseBays = faceId === 'north' || faceId === 'south' ? facade.baysX : facade.baysZ;
    const bays = Math.max(1, Math.min(28, Math.round((Number(baseBays) || 6) * Math.max(.35, relativeSpan))));
    const paneHeight = Math.max(.16, height / rows * Math.min(.74, .3 + Number(facade.glazingRatio) * .52));
    const paneWidth = Math.max(.14, length / bays * (facade.windowPattern === 'horizontal-bands' ? .94 : .64));
    for (let floor = 0; floor < rows; floor += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        if (facade.windowPattern === 'limited' && (bay + floor) % 2) continue;
        const along = -length / 2 + length * (bay + .5) / bays;
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(paneWidth, paneHeight), windowMaterial);
        pane.position.set(midpointX + Math.cos(angle) * along + normalX * .035, height * (floor + .54) / rows, midpointZ - Math.sin(angle) * along + normalZ * .035);
        pane.rotation.y = angle;
        pane.userData.faceId = faceId;
        pane.userData.selectableFace = model.kind === 'custom';
        pane.userData.assembly = { type: 'facade', start: .72 + floor / rows * .13, end: .95, finalY: pane.position.y, centered: true };
        group.add(pane);
      }
    }
    if (facade.verticalFins) {
      const finMaterial = new THREE.MeshStandardMaterial({ color: modelColor(facade.primaryColor, '#c7c3bb'), roughness: .8 });
      for (let bay = 1; bay < bays; bay += 1) {
        const along = -length / 2 + length * bay / bays;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(.055, height * .9, .2), finMaterial);
        fin.position.set(midpointX + Math.cos(angle) * along + normalX * .09, height * .5, midpointZ - Math.sin(angle) * along + normalZ * .09);
        fin.rotation.y = angle;
        fin.userData.assembly = { type: 'facade', start: .8, end: .96, finalY: fin.position.y, centered: true };
        group.add(fin);
      }
    }
  }
}

function addWeakPointLayers(group, points, bounds, height) {
  const stressMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, depthWrite: false });
  const crackMaterial = new THREE.LineBasicMaterial({ color: 0x111315, transparent: true, opacity: 0 });
  points.slice(0, 12).forEach((point, index) => {
    const stress = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 9), stressMaterial.clone());
    stress.position.set(point.x, index % 2 ? height * .72 : height * .18, point.y);
    stress.scale.set(1.4, .7, 1.4);
    stress.userData.isStress = true;
    stress.userData.threshold = .2 + (index % 4) * .08;
    stress.userData.baseScale = [1.4, .7, 1.4];
    group.add(stress);
  });
  for (let index = 0; index < Math.min(points.length, 8); index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const dx = end.x - start.x;
    const dz = end.y - start.y;
    const length = Math.hypot(dx, dz);
    if (length < .4) continue;
    const normalX = -dz / length;
    const normalZ = dx / length;
    const t = .28 + (index % 3) * .18;
    const anchorX = start.x + dx * t + normalX * .05;
    const anchorZ = start.y + dz * t + normalZ * .05;
    const crackPoints = [
      new THREE.Vector3(anchorX, height * .08, anchorZ),
      new THREE.Vector3(anchorX + dx / length * .18, height * .22, anchorZ + dz / length * .18),
      new THREE.Vector3(anchorX - dx / length * .12, height * .36, anchorZ - dz / length * .12),
      new THREE.Vector3(anchorX + dx / length * .24, height * .53, anchorZ + dz / length * .24),
      new THREE.Vector3(anchorX + dx / length * .05, height * .68, anchorZ + dz / length * .05),
    ];
    const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crackPoints), crackMaterial.clone());
    crack.userData.isCrack = true;
    crack.userData.threshold = .52 + (index % 3) * .09;
    crack.userData.pointCount = crackPoints.length;
    crack.geometry.setDrawRange(0, 0);
    group.add(crack);
  }
  group.userData.weakPointBasis = 'Geometry corners and facade discontinuities only; not structural analysis';
}

function createBuilding(model) {
  const group = new THREE.Group();
  if (!model) return group;
  if (model.category === 'roads' && addLinearInfrastructure(group, model, false)) return group;
  if (model.category === 'bridges' && model.footprint?.length >= 2 && addLinearInfrastructure(group, model, true)) return group;
  if (model.category === 'airports') addAirportSite(group, model);
  const points = normalizedShape(model);
  const bounds = shapeBounds(points);
  const height = Math.max(2, Math.min(28, (Number(model?.height) || 12) * .55));
  const materialColors = {
    'reinforced concrete': 0xb9b6b0,
    'structural steel': 0x737a7d,
    masonry: 0xb89c84, concrete: 0xb9b6b0, glass: 0x5f737b, brick: 0xa16f55,
    stone: 0xaaa397, metal: 0x747c80, stucco: 0xd6cec0, mixed: 0xb7b0a7,
    timber: 0x9a7356,
  };
  const descriptor = model.visualDescriptor;
  const baseColor = descriptor?.facade?.primaryColor || materialColors[model.material] || 0xd7d2ca;
  const setbacks = descriptor?.setbacks || [];
  const breaks = [0, ...setbacks.map((item) => item.startRatio), 1];
  for (let index = 0; index < breaks.length - 1; index += 1) {
    const start = breaks[index] * height;
    const end = breaks[index + 1] * height;
    const scale = index === 0 ? 1 : setbacks[index - 1]?.scale || 1;
    const segmentCount = breaks.length - 1;
    const segmentStart = .4 + index / segmentCount * .28;
    const segmentEnd = .66 + (index + 1) / segmentCount * .16;
    const mass = extrudedMass(points, end - start, baseColor, start, scale, segmentStart, segmentEnd);
    group.add(mass.mesh, mass.edges);
  }

  (descriptor?.wings || []).forEach((wing) => {
    const wingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(bounds.width * wing.widthRatio, height * wing.heightRatio, bounds.depth * wing.depthRatio),
      new THREE.MeshStandardMaterial({ color: modelColor(baseColor, '#c7c3bb'), roughness: .77 }),
    );
    wingMesh.position.set(wing.offsetX * bounds.width * .55, height * wing.heightRatio / 2, wing.offsetZ * bounds.depth * .55);
    wingMesh.userData.assembly = { type: 'envelope', start: .48, end: .8, finalY: wingMesh.position.y, centered: true };
    wingMesh.rotation.y = wing.rotationDeg * Math.PI / 180;
    wingMesh.castShadow = true;
    wingMesh.receiveShadow = true;
    group.add(wingMesh);
  });

  addRoof(group, model.roof, bounds, height, model.faceOverrides?.roof?.primaryColor || descriptor?.roof?.color || '#555b5e');
  if (model.kind === 'custom') {
    const roofSelector = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(points)),
      new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    roofSelector.rotation.x = -Math.PI / 2;
    roofSelector.position.y = height + .045;
    roofSelector.userData.faceId = 'roof';
    roofSelector.userData.selectableFace = true;
    group.add(roofSelector);
  }

  const floors = Math.max(1, Math.min(16, Number(model?.floors) || 1));
  for (let floor = 1; floor < floors; floor += 1) {
    const y = height * floor / floors;
    const loopPoints = [...points, points[0]].map((point) => new THREE.Vector3(point.x, y, point.y));
    const floorLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(loopPoints), new THREE.LineBasicMaterial({ color: STEEL, transparent: true, opacity: .25 }));
    floorLine.userData.assembly = { type: 'floor', start: .22 + floor / floors * .24, end: .5, finalY: y, centered: false };
    group.add(floorLine);
  }

  addWrappedFacade(group, model, points, bounds, height, floors);

  if (model?.structuralLayout && model.structuralLayout !== 'unavailable') {
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x565d60, roughness: .7 });
    [[-3, -2], [3, -2], [-3, 2], [3, 2]].forEach(([x, z]) => {
      const column = new THREE.Mesh(new THREE.BoxGeometry(.24, height, .24), columnMaterial);
      column.position.set(x, height / 2, z);
      column.userData.assembly = { type: 'structure', start: .1, end: .38, finalY: height / 2, centered: true };
      group.add(column);
    });
  }

  const constructionMaterial = new THREE.MeshStandardMaterial({ color: SIGNAL, roughness: .62, metalness: .16 });
  [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]].forEach(([x, z], index) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(.13, height, .13), constructionMaterial);
    pillar.position.set(x, height / 2, z);
    pillar.userData.assembly = { type: 'temporary-pillar', start: .06 + index * .04, end: .34 + index * .04, finalY: height / 2, centered: true };
    group.add(pillar);
  });

  addWeakPointLayers(group, points, bounds, height);
  group.userData.height = height;
  return group;
}

function applyAssemblyProgress(building, value) {
  const progress = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
  building.traverse((child) => {
    const assembly = child.userData.assembly;
    if (!assembly) return;
    const local = Math.min(1, Math.max(0, (progress - assembly.start) / Math.max(.001, assembly.end - assembly.start)));
    const eased = 1 - (1 - local) ** 3;
    if (assembly.type === 'temporary-pillar') {
      child.visible = progress < .7 && local > 0;
      child.scale.y = Math.max(.001, eased);
      child.position.y = assembly.finalY * eased;
      return;
    }
    child.visible = local > 0;
    if (assembly.type === 'envelope' || assembly.type === 'structure') {
      child.scale.y = Math.max(.001, eased);
      child.position.y = assembly.centered ? assembly.finalY * eased : assembly.finalY;
    } else if (assembly.type === 'roof') {
      child.scale.setScalar(Math.max(.001, eased));
      child.position.y = assembly.finalY;
    } else {
      child.scale.set(1, 1, 1);
      child.position.y = assembly.finalY;
    }
    if (progress >= 1) {
      child.visible = true;
      child.scale.set(1, 1, 1);
      child.position.y = assembly.finalY;
    }
  });
}

function addWindField(scene) {
  const geometry = new THREE.BufferGeometry();
  const points = [];
  for (let index = 0; index < 70; index += 1) {
    const x = -18 + (index % 10) * 4;
    const y = 1 + (index % 7) * 1.7;
    const z = -12 + Math.floor(index / 10) * 3.2;
    points.push(x, y, z, x + 1.2, y, z);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const wind = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0 }));
  wind.userData.isWind = true;
  scene.add(wind);
  return wind;
}

export default function SimulationViewport({ model, scenario, progress, running, reducedMotion, assemblyProgress = 1, editable = false, selectedFace = null, onFaceSelect }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ model, scenario, progress, running, reducedMotion, assemblyProgress, editable, selectedFace, onFaceSelect });
  stateRef.current = { model, scenario, progress, running, reducedMotion, assemblyProgress, editable, selectedFace, onFaceSelect };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(INK);
    scene.fog = new THREE.FogExp2(INK, .018);
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
    camera.position.set(22, 18, 27);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.minDistance = 14;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI / 2.04;
    controls.target.set(0, 4, 0);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerOrigin = null;
    const onPointerDown = (event) => { pointerOrigin = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event) => {
      const current = stateRef.current;
      if (!current.editable || !pointerOrigin || Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(building.children, true).find((entry) => entry.object.userData.selectableFace);
      if (hit?.object.userData.faceId) current.onFaceSelect?.(hit.object.userData.faceId);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    scene.add(new THREE.HemisphereLight(PAPER, 0x24282a, 2.1));
    const key = new THREE.DirectionalLight(PAPER, 3.2);
    key.position.set(-14, 24, 16);
    key.castShadow = true;
    scene.add(key);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1b1f21, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(80, 40, 0x565d60, 0x292e30);
    grid.position.y = .012;
    scene.add(grid);

    const flood = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x687f88, transparent: true, opacity: 0, roughness: .22, metalness: .05 }));
    flood.rotation.x = -Math.PI / 2;
    flood.userData.isFlood = true;
    scene.add(flood);
    const wind = addWindField(scene);

    let building = createBuilding(stateRef.current.model);
    scene.add(building);
    let previousModel = stateRef.current.model;
    let frame;
    const clock = new THREE.Clock();

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const current = stateRef.current;
      if (current.model !== previousModel) {
        scene.remove(building);
        disposeObject(building);
        building = createBuilding(current.model);
        scene.add(building);
        previousModel = current.model;
      }
      const elapsed = clock.getElapsedTime();
      const active = current.progress > 0;
      const responseLevel = current.scenario.type === 'earthquake'
        ? Math.min(1, Number(current.scenario.magnitude) / 9.5) * current.progress
        : current.scenario.type === 'flood'
          ? Math.min(1, Number(current.scenario.waterLevel) / 12) * current.progress
          : Math.min(1, Number(current.scenario.windSpeed) / 320) * current.progress;
      const motion = current.reducedMotion ? 0 : 1;
      building.position.set(0, 0, 0);
      building.rotation.set(0, 0, 0);
      flood.material.opacity = 0;
      wind.material.opacity = 0;
      applyAssemblyProgress(building, current.assemblyProgress);

      if (active && current.scenario.type === 'earthquake') {
        const strength = Math.min(1, Number(current.scenario.magnitude) / 10) * current.progress;
        building.position.x = Math.sin(elapsed * 18) * .42 * strength * motion;
        building.position.z = Math.cos(elapsed * 15) * .28 * strength * motion;
        building.rotation.z = Math.sin(elapsed * 8) * .018 * strength * motion;
      }
      if (active && current.scenario.type === 'flood') {
        const level = Math.max(0, Number(current.scenario.waterLevel) || 0);
        flood.position.y = Math.min(9, level * current.progress * .55) + .04;
        flood.material.opacity = .36;
        flood.position.x = Math.sin(elapsed * .8) * .25 * motion;
      }
      if (active && current.scenario.type === 'wind') {
        const strength = Math.min(1, Number(current.scenario.windSpeed) / 220) * current.progress;
        building.rotation.z = Math.sin(elapsed * 2.8) * .028 * strength * motion;
        wind.material.opacity = .24 + strength * .48;
        wind.position.x = ((elapsed * 7 * motion) % 8) - 4;
        wind.rotation.y = -(Number(current.scenario.direction) || 0) * Math.PI / 180;
      }

      building.traverse((child) => {
        if (child.userData.isStress) {
          const threshold = child.userData.threshold ?? .2;
          child.material.opacity = active ? Math.min(.72, Math.max(0, responseLevel - threshold) * 1.25) : 0;
          const pulse = 1 + Math.max(0, responseLevel - threshold) * .08 * Math.sin(elapsed * 4);
          const baseScale = child.userData.baseScale || [1, 1, 1];
          child.scale.set(baseScale[0] * pulse, baseScale[1] * pulse, baseScale[2] * pulse);
        }
        if (child.userData.isCrack) {
          const threshold = child.userData.threshold ?? .58;
          const fracture = Math.max(0, Math.min(1, (responseLevel - threshold) / Math.max(.01, 1 - threshold)));
          child.material.opacity = active ? fracture * .9 : 0;
          child.geometry.setDrawRange(0, fracture > 0 ? Math.max(2, Math.ceil((child.userData.pointCount || 5) * fracture)) : 0);
        }
        if (child.userData.selectableFace && child.material) {
          const selected = current.editable && current.selectedFace === child.userData.faceId;
          if ('emissive' in child.material) child.material.emissive.set(selected ? SIGNAL : 0x000000);
          if ('emissiveIntensity' in child.material) child.material.emissiveIntensity = selected ? .22 : 0;
          if (child.userData.faceId === 'roof') child.material.opacity = selected ? .18 : 0;
        }
      });
      controls.update();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="simulation-viewport__canvas" ref={hostRef} role="img" aria-label="Interactive three-dimensional infrastructure simulation viewport" />;
}
