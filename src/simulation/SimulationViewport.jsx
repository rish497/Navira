import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const INK = 0x0f1113;
const PAPER = 0xf1eee9;
const STEEL = 0x72797d;
const SIGNAL = 0xff3b1f;

function disposeObject(object) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    childMaterials.forEach((material) => {
      materials.add(material);
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'].forEach((key) => {
        if (material[key]?.isTexture) textures.add(material[key]);
      });
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
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
    } else if (['gate', 'entrance'].includes(feature.type) && feature.points.length) {
      const point = feature.points[0];
      const marker = new THREE.Mesh(
        feature.type === 'gate' ? new THREE.CylinderGeometry(.11, .11, .62, 8) : new THREE.BoxGeometry(.22, .5, .12),
        new THREE.MeshStandardMaterial({ color: feature.type === 'gate' ? 0xf4b800 : SIGNAL, emissive: feature.type === 'gate' ? 0x5c4500 : 0x4d0f08, roughness: .5 }),
      );
      marker.position.set(point.x, feature.type === 'gate' ? .34 : .27, point.z);
      marker.userData.assembly = { type: 'site', start: .72, end: .9, finalY: marker.position.y, centered: false };
      group.add(marker);
    }
  });
  return features;
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

function proceduralSurfaceTexture(materialType, colorValue, repeatX = 2, repeatY = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const color = modelColor(colorValue, '#c7c3bb');
  const base = `#${color.getHexString()}`;
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  const type = String(materialType || 'unknown').toLowerCase();
  const light = color.clone().offsetHSL(0, 0, .09);
  const dark = color.clone().offsetHSL(0, 0, -.11);
  context.lineWidth = 2;
  if (type.includes('brick') || type.includes('masonry')) {
    context.strokeStyle = `#${dark.getHexString()}`;
    for (let y = 0; y <= 256; y += 32) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(256, y); context.stroke();
      const offset = (y / 32) % 2 ? 0 : 32;
      for (let x = offset; x <= 256; x += 64) { context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + 32); context.stroke(); }
    }
  } else if (type.includes('metal')) {
    for (let x = 0; x < 256; x += 24) {
      context.fillStyle = x % 48 ? `#${dark.getHexString()}` : `#${light.getHexString()}`;
      context.fillRect(x, 0, 3, 256);
    }
  } else if (type.includes('timber') || type.includes('wood')) {
    context.strokeStyle = `#${dark.getHexString()}`;
    for (let x = 12; x < 256; x += 22) {
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) context.lineTo(x + Math.sin((x + y) * .08) * 3, y);
      context.stroke();
    }
  } else if (type.includes('stone')) {
    context.strokeStyle = `#${dark.getHexString()}`;
    for (let y = 0; y < 256; y += 42) {
      context.beginPath(); context.moveTo(0, y); context.lineTo(256, y + (y % 84 ? 5 : -4)); context.stroke();
      for (let x = (y % 84 ? 28 : 4); x < 256; x += 58) { context.beginPath(); context.moveTo(x, y); context.lineTo(x + 5, y + 42); context.stroke(); }
    }
  } else if (type.includes('glass')) {
    const gradient = context.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, `#${dark.getHexString()}`);
    gradient.addColorStop(.45, base);
    gradient.addColorStop(.54, `#${light.getHexString()}`);
    gradient.addColorStop(1, `#${dark.getHexString()}`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  } else {
    context.strokeStyle = `#${dark.getHexString()}`;
    context.globalAlpha = .34;
    for (let x = 0; x <= 256; x += 64) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 256); context.stroke(); }
    for (let y = 0; y <= 256; y += 64) { context.beginPath(); context.moveTo(0, y); context.lineTo(256, y); context.stroke(); }
    for (let index = 0; index < 220; index += 1) {
      const x = (index * 73) % 256;
      const y = (index * 151) % 256;
      context.fillStyle = index % 2 ? `#${light.getHexString()}` : `#${dark.getHexString()}`;
      context.fillRect(x, y, 1, 1);
    }
    context.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  texture.anisotropy = 4;
  texture.userData.proceduralMaterial = type;
  return texture;
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

function beamBetween(start, end, radius, material, assembly = { type: 'structure', start: .18, end: .7 }) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  beam.position.copy(start).add(end).multiplyScalar(.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  beam.userData.assembly = { ...assembly, finalY: beam.position.y, centered: true };
  beam.castShadow = true;
  return beam;
}

function addBridgeSuperstructure(group, curve, model, deckHeight) {
  const description = `${model.tags?.['bridge:structure'] || ''} ${model.visualDescriptor?.summary || ''} ${(model.visualDescriptor?.distinctiveElements || []).join(' ')}`.toLowerCase();
  const style = /suspension|cable/.test(description) ? 'suspension' : /arch/.test(description) ? 'arch' : /truss|cantilever|lattice/.test(description) ? 'truss' : 'beam';
  const steel = new THREE.MeshStandardMaterial({ color: style === 'truss' ? 0x737a7d : 0x676e72, roughness: .62, metalness: .34 });
  const divisions = 10;
  const points = Array.from({ length: divisions + 1 }, (_, index) => curve.getPoint(index / divisions));
  points.forEach((point, index) => {
    if (index === points.length - 1) return;
    const next = points[index + 1];
    const tangent = new THREE.Vector3().subVectors(next, point).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const side of [-1, 1]) {
      const lowerA = point.clone().addScaledVector(normal, side * .72).setY(deckHeight + .48);
      const lowerB = next.clone().addScaledVector(normal, side * .72).setY(deckHeight + .48);
      const topHeightA = style === 'arch' ? deckHeight + .7 + Math.sin(index / divisions * Math.PI) * 2.5 : deckHeight + (style === 'truss' ? 2.5 : .85);
      const topHeightB = style === 'arch' ? deckHeight + .7 + Math.sin((index + 1) / divisions * Math.PI) * 2.5 : deckHeight + (style === 'truss' ? 2.5 : .85);
      const topA = lowerA.clone().setY(topHeightA);
      const topB = lowerB.clone().setY(topHeightB);
      group.add(beamBetween(lowerA, lowerB, .055, steel), beamBetween(topA, topB, .065, steel));
      if (style === 'truss' || style === 'arch') {
        group.add(beamBetween(lowerA, topA, .05, steel));
        group.add(beamBetween(index % 2 ? topA : lowerA, index % 2 ? lowerB : topB, .045, steel));
      }
    }
  });
  if (style === 'suspension') {
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x5f676b, roughness: .6, metalness: .3 });
    [.28, .72].forEach((ratio) => {
      const point = curve.getPoint(ratio);
      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(.22, 4.6, .22), towerMaterial);
        const tangent = curve.getTangent(ratio);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        tower.position.copy(point).addScaledVector(normal, side * .7).setY(deckHeight + 2.3);
        tower.userData.assembly = { type: 'structure', start: .18, end: .55, finalY: tower.position.y, centered: true };
        group.add(tower);
      }
    });
    for (const side of [-1, 1]) {
      const cablePoints = Array.from({ length: 33 }, (_, index) => {
        const ratio = index / 32;
        const point = curve.getPoint(ratio);
        const tangent = curve.getTangent(ratio);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const towerLift = Math.max(0, 1 - Math.min(Math.abs(ratio - .28), Math.abs(ratio - .72)) / .28);
        return point.addScaledVector(normal, side * .7).setY(deckHeight + .7 + towerLift * 3.9);
      });
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePoints), 64, .035, 6, false), steel);
      cable.userData.assembly = { type: 'structure', start: .52, end: .82, finalY: 0, centered: false };
      group.add(cable);
    }
  }
  group.userData.bridgeStyle = style;
}

function addLinearInfrastructure(group, model, bridge = false) {
  const line = normalizedLine(model);
  if (line.length < 2) return false;
  const curve = new THREE.CatmullRomCurve3(line);
  const deckHeight = bridge ? .7 : .3;
  const deckMaterial = new THREE.MeshStandardMaterial({ color: bridge ? 0x8d9090 : 0x6f7475, roughness: .93, metalness: bridge ? .14 : 0 });
  if (bridge) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(length, .32, 1.45), deckMaterial);
      deck.position.set((start.x + end.x) / 2, deckHeight, (start.z + end.z) / 2);
      deck.rotation.y = -Math.atan2(dz, dx);
      deck.userData.assembly = { type: 'envelope', start: .32, end: .72, finalY: deckHeight, centered: true };
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);
    }
    addBridgeSuperstructure(group, curve, model, deckHeight);
  } else {
    const deck = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(18, line.length * 4), .48, 6, false), deckMaterial);
    deck.position.y = deckHeight;
    deck.userData.assembly = { type: 'envelope', start: .32, end: .72, finalY: deckHeight, centered: true };
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
  }
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
      const sensitivity = new THREE.Mesh(new THREE.SphereGeometry(.48, 14, 9), new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, depthWrite: false }));
      sensitivity.position.set(point.x, .65, point.z);
      sensitivity.scale.set(1.5, .65, 1.5);
      sensitivity.userData.isStress = true;
      sensitivity.userData.threshold = .24;
      sensitivity.userData.baseScale = [1.5, .65, 1.5];
      group.add(sensitivity);
    });
    line.slice(1, -1).slice(0, 5).forEach((point, index) => {
      const crackPoints = [
        new THREE.Vector3(point.x - .42, 1.24, point.z),
        new THREE.Vector3(point.x - .1, 1.18, point.z + .08),
        new THREE.Vector3(point.x + .16, 1.26, point.z - .06),
        new THREE.Vector3(point.x + .45, 1.2, point.z),
      ];
      const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crackPoints), new THREE.LineBasicMaterial({ color: 0x111315, transparent: true, opacity: 0 }));
      crack.userData.isCrack = true;
      crack.userData.threshold = .6 + index * .035;
      crack.userData.pointCount = crackPoints.length;
      crack.geometry.setDrawRange(0, 0);
      group.add(crack);
    });
  }
  group.userData.height = bridge ? 2.4 : .8;
  group.traverse((child) => {
    child.userData.restX = child.position.x;
    child.userData.restZ = child.position.z;
    child.userData.restRotationZ = child.rotation.z;
  });
  return true;
}

function addRoof(group, type, bounds, height, color, materialType = 'metal') {
  if (!type || ['flat', 'unknown', 'unspecified'].includes(type)) return;
  const roofMap = proceduralSurfaceTexture(materialType, color, Math.max(1, bounds.width / 4), Math.max(1, bounds.depth / 4));
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofMap, roughness: .78, metalness: materialType === 'metal' ? .18 : .05 });
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
    const wallMap = proceduralSurfaceTexture(facade.material || model.material, facade.primaryColor, Math.max(1, length / 3), Math.max(1, height / 3));
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, height),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: wallMap, roughness: facade.material === 'glass' ? .38 : .78, metalness: facade.material === 'metal' ? .16 : .03, side: THREE.DoubleSide }),
    );
    wall.position.set(midpointX + normalX * .018, height / 2, midpointZ + normalZ * .018);
    wall.rotation.y = angle;
    wall.userData.faceId = faceId;
    wall.userData.edgeIndex = index;
    wall.userData.selectableFace = model.kind === 'custom';
    wall.userData.assembly = { type: 'envelope', start: .56, end: .8, finalY: height / 2, centered: true };
    group.add(wall);

    if (!facade || ['none', 'unknown'].includes(facade.windowPattern) || Number(facade.glazingRatio) <= .02) continue;
    const windowMaterial = new THREE.MeshPhysicalMaterial({ color: modelColor(facade.secondaryColor, '#293238'), roughness: .2, metalness: .16, clearcoat: .62, clearcoatRoughness: .24, transparent: true, opacity: .92, side: THREE.DoubleSide });
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
        pane.userData.edgeIndex = index;
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

function addModelerHandles(group, model, points, height) {
  if (model.kind !== 'custom') return;
  const vertexMaterial = new THREE.MeshStandardMaterial({ color: SIGNAL, emissive: 0x471108, emissiveIntensity: .45, roughness: .52, metalness: .12, depthTest: false });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xf4b800, emissive: 0x493800, emissiveIntensity: .28, roughness: .65, depthTest: false, transparent: true, opacity: .92 });
  points.forEach((point, index) => {
    const vertex = new THREE.Mesh(new THREE.SphereGeometry(.29, 14, 10), vertexMaterial.clone());
    vertex.position.set(point.x, height + .22, point.y);
    vertex.renderOrder = 20;
    vertex.userData.modelerHandle = 'vertex';
    vertex.userData.vertexIndex = index;
    vertex.userData.assembly = { type: 'gizmo', start: .96, end: 1, finalY: vertex.position.y, centered: true };
    group.add(vertex);

    const next = points[(index + 1) % points.length];
    const dx = next.x - point.x;
    const dz = next.y - point.y;
    const length = Math.hypot(dx, dz);
    if (length < .08) return;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(length, .18, .32), edgeMaterial.clone());
    edge.position.set((point.x + next.x) / 2, height + .13, (point.y + next.y) / 2);
    edge.rotation.y = -Math.atan2(dz, dx);
    edge.renderOrder = 19;
    edge.userData.modelerHandle = 'edge';
    edge.userData.edgeIndex = index;
    edge.userData.assembly = { type: 'gizmo', start: .96, end: 1, finalY: edge.position.y, centered: true };
    group.add(edge);
  });
  const bounds = shapeBounds(points);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, .62, 8), vertexMaterial.clone());
  roof.position.set((bounds.minX + bounds.maxX) / 2, height + .66, (bounds.minZ + bounds.maxZ) / 2);
  roof.renderOrder = 20;
  roof.userData.modelerHandle = 'roof';
  roof.userData.faceId = 'roof';
  roof.userData.assembly = { type: 'gizmo', start: .96, end: 1, finalY: roof.position.y, centered: true };
  group.add(roof);
}

function addWeakPointLayers(group, points, bounds, height) {
  const stressMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, depthWrite: false });
  const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x1b0c09, transparent: true, opacity: 0, depthWrite: false });
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
    const crackGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crackPoints), 18, .036, 4, false);
    const crack = new THREE.Mesh(crackGeometry, crackMaterial.clone());
    crack.userData.isCrack = true;
    crack.userData.crackMesh = true;
    crack.userData.threshold = .52 + (index % 3) * .09;
    crack.userData.indexCount = crackGeometry.index?.count || 0;
    crack.geometry.setDrawRange(0, 0);
    group.add(crack);
    const branchPoints = [
      crackPoints[2],
      new THREE.Vector3(crackPoints[2].x - normalX * .22, crackPoints[2].y + height * .07, crackPoints[2].z - normalZ * .22),
      new THREE.Vector3(crackPoints[2].x - normalX * .46 + dx / length * .08, crackPoints[2].y + height * .13, crackPoints[2].z - normalZ * .46 + dz / length * .08),
    ];
    const branchGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPoints), 10, .028, 4, false);
    const branch = new THREE.Mesh(branchGeometry, crackMaterial.clone());
    branch.userData.isCrack = true;
    branch.userData.crackMesh = true;
    branch.userData.threshold = crack.userData.threshold + .06;
    branch.userData.indexCount = branchGeometry.index?.count || 0;
    branch.geometry.setDrawRange(0, 0);
    group.add(branch);
  }
  const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x6b6762, roughness: .88, metalness: .04 });
  for (let index = 0; index < Math.min(18, Math.max(8, points.length * 3)); index += 1) {
    const point = points[index % points.length];
    const next = points[(index + 1) % points.length];
    const ratio = ((index * 37) % 100) / 100;
    const fragment = new THREE.Mesh(new THREE.BoxGeometry(.22 + index % 3 * .07, .16 + index % 4 * .06, .18 + index % 2 * .08), debrisMaterial.clone());
    fragment.position.set(point.x + (next.x - point.x) * ratio, .12 + index % 3 * .06, point.y + (next.y - point.y) * ratio);
    fragment.visible = false;
    fragment.castShadow = true;
    fragment.userData.isDebris = true;
    fragment.userData.basePosition = fragment.position.clone();
    fragment.userData.velocity = new THREE.Vector3(Math.sin(index * 2.7) * (1.2 + index % 4 * .25), 1.1 + index % 5 * .28, Math.cos(index * 1.9) * (1.1 + index % 3 * .3));
    group.add(fragment);
  }
  group.userData.weakPointBasis = 'Geometry corners and facade discontinuities only; not structural analysis';
  group.userData.failureEligible = true;
}

function createBuilding(model) {
  const group = new THREE.Group();
  if (!model) return group;
  if (model.category === 'roads' && addLinearInfrastructure(group, model, false)) return group;
  if (model.category === 'bridges' && model.footprint?.length >= 2 && addLinearInfrastructure(group, model, true)) return group;
  const airportFeatures = model.category === 'airports' ? addAirportSite(group, model) : [];
  const mappedTerminals = airportFeatures.filter((feature) => feature.type === 'terminal' && feature.points.length >= 3).sort((a, b) => {
    const area = (feature) => Math.abs(feature.points.reduce((sum, point, index) => {
      const next = feature.points[(index + 1) % feature.points.length];
      return sum + point.x * next.z - next.x * point.z;
    }, 0));
    return area(b) - area(a);
  });
  const points = mappedTerminals.length ? mappedTerminals[0].points.map((point) => new THREE.Vector2(point.x, point.z)) : normalizedShape(model);
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

  mappedTerminals.slice(1, 10).forEach((terminal, index) => {
    const terminalPoints = terminal.points.map((point) => new THREE.Vector2(point.x, point.z));
    const satelliteHeight = Math.max(1.8, height * .55);
    const satellite = extrudedMass(terminalPoints, satelliteHeight, baseColor, 0, 1, .3 + index * .025, .72 + index * .018);
    group.add(satellite.mesh, satellite.edges);
    addWrappedFacade(group, model, terminalPoints, shapeBounds(terminalPoints), satelliteHeight, Math.max(1, Math.round((Number(model?.floors) || 2) * .55)));
  });

  (model.category === 'airports' ? [] : descriptor?.wings || []).forEach((wing) => {
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

  addRoof(group, model.roof, bounds, height, model.faceOverrides?.roof?.primaryColor || descriptor?.roof?.color || '#555b5e', descriptor?.roof?.type === 'unknown' ? 'metal' : model.material);
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
  addModelerHandles(group, model, points, height);

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
  group.userData.failureEligible = !['airports', 'roads'].includes(model.category);
  group.userData.height = height;
  group.userData.physicsBounds = { width: Math.max(1, bounds.width), depth: Math.max(1, bounds.depth), height };
  group.traverse((child) => {
    child.userData.restX = child.position.x;
    child.userData.restZ = child.position.z;
    child.userData.restRotationZ = child.rotation.z;
  });
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

function addEarthquakeField(scene) {
  const field = new THREE.Group();
  for (let index = 0; index < 11; index += 1) {
    const angle = index / 11 * Math.PI * 2 + Math.sin(index * 2.1) * .18;
    const points = [];
    for (let step = 0; step < 7; step += 1) {
      const radius = 2.2 + step * (1.55 + index % 3 * .16);
      const kink = Math.sin(index * 3.2 + step * 2.7) * (.18 + step * .035);
      points.push(new THREE.Vector3(Math.cos(angle + kink) * radius, .045, Math.sin(angle + kink) * radius));
    }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, .026 + index % 3 * .008, 4, false);
    const fissure = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x08090a, transparent: true, opacity: 0, depthWrite: false }));
    fissure.visible = false;
    fissure.userData.threshold = .28 + index % 4 * .075;
    fissure.userData.indexCount = geometry.index?.count || 0;
    geometry.setDrawRange(0, 0);
    field.add(fissure);
  }
  scene.add(field);
  return field;
}

function addFloodField(scene) {
  const geometry = new THREE.PlaneGeometry(90, 90, 80, 80);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uAlpha: { value: 0 }, uVelocity: { value: 1 }, uProgress: { value: 0 }, uDirection: { value: 0 },
    },
    vertexShader: `
      uniform float uTime; uniform float uVelocity; uniform float uProgress; uniform float uDirection;
      varying float vFoam; varying float vFront;
      void main() {
        vec3 p = position;
        vec2 dir = vec2(cos(uDirection), sin(uDirection));
        float axis = dot(p.xy, dir);
        float front = -44.0 + uProgress * 88.0;
        float frontDistance = axis - front;
        float crest = exp(-frontDistance * frontDistance * 0.09) * (0.65 + min(1.6, uVelocity * 0.17));
        float chop = sin(axis * 1.05 - uTime * (1.8 + uVelocity * .28)) * .12 + sin((p.x - p.y) * .48 - uTime * 1.35) * .075;
        float flooded = 1.0 - smoothstep(-4.0, 8.0, frontDistance);
        p.z += crest + chop * flooded;
        vFoam = clamp(crest * 1.45 + abs(chop) * .8, 0.0, 1.0);
        vFront = 1.0 - smoothstep(-2.0, 7.0, frontDistance);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uAlpha; varying float vFoam; varying float vFront;
      void main() {
        if (vFront < .015) discard;
        vec3 deep = vec3(.18, .31, .35);
        vec3 surface = vec3(.36, .55, .59);
        vec3 foam = vec3(.82, .87, .84);
        vec3 color = mix(deep, surface, vFront); color = mix(color, foam, smoothstep(.5, 1.0, vFoam));
        float edgeFade = smoothstep(.015, .24, vFront);
        gl_FragColor = vec4(color, uAlpha * edgeFade * (.64 + vFoam * .26));
      }
    `,
  });
  const surface = new THREE.Mesh(geometry, material);
  surface.rotation.x = -Math.PI / 2;
  surface.visible = false;
  surface.renderOrder = 4;
  scene.add(surface);

  const count = 120;
  const positions = new Float32Array(count * 3);
  const impactGeometry = new THREE.BufferGeometry();
  impactGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const impact = new THREE.Points(impactGeometry, new THREE.PointsMaterial({ color: 0xd8e4df, size: .12, transparent: true, opacity: 0, depthWrite: false }));
  impact.visible = false;
  impact.userData.count = count;
  scene.add(impact);

  const drift = new THREE.Group();
  const driftMaterial = new THREE.MeshStandardMaterial({ color: 0x5f5144, roughness: .92, metalness: 0 });
  for (let index = 0; index < 18; index += 1) {
    const fragment = new THREE.Mesh(
      new THREE.BoxGeometry(.2 + index % 4 * .09, .07 + index % 2 * .035, .12 + index % 3 * .06),
      driftMaterial.clone(),
    );
    fragment.castShadow = true;
    fragment.visible = false;
    fragment.userData.seed = index * 1.713;
    fragment.userData.lateral = -10 + index % 9 * 2.5;
    drift.add(fragment);
  }
  scene.add(drift);
  return { surface, impact, drift };
}

export default function SimulationViewport({
  model, scenario, progress, running, reducedMotion, assemblyProgress = 1,
  editable = false, selectedFace = null, onFaceSelect,
  modelerMode = 'select', selectedElement = null, onElementSelect,
  onGeometryEditStart, onGeometryEditEnd, onGeometryChange,
  cameraState = null, onCameraChange, viewportId = 'primary',
}) {
  const hostRef = useRef(null);
  const stateRef = useRef({ model, scenario, progress, running, reducedMotion, assemblyProgress, editable, selectedFace, onFaceSelect, modelerMode, selectedElement, onElementSelect, onGeometryEditStart, onGeometryEditEnd, onGeometryChange, cameraState, onCameraChange, viewportId });
  stateRef.current = { model, scenario, progress, running, reducedMotion, assemblyProgress, editable, selectedFace, onFaceSelect, modelerMode, selectedElement, onElementSelect, onGeometryEditStart, onGeometryEditEnd, onGeometryChange, cameraState, onCameraChange, viewportId };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(INK);
    scene.fog = new THREE.FogExp2(INK, .018);
    const camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
    camera.position.set(22, 18, 27);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.minDistance = 14;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI / 2.04;
    controls.target.set(0, 4, 0);
    let applyingSharedCamera = false;
    let appliedCameraRevision = null;
    const publishCamera = () => {
      if (applyingSharedCamera) return;
      const current = stateRef.current;
      current.onCameraChange?.({ source: current.viewportId, revision: performance.now(), position: camera.position.toArray(), target: controls.target.toArray() });
    };
    controls.addEventListener('change', publishCamera);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const editPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let pointerOrigin = null;
    let dragState = null;
    const setRay = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    };
    const groundPoint = (event) => {
      setRay(event);
      return raycaster.ray.intersectPlane(editPlane, new THREE.Vector3());
    };
    const selectionForHit = (object, mode = 'select') => {
      if (object.userData.modelerHandle === 'vertex') return { type: 'vertex', index: object.userData.vertexIndex };
      if (object.userData.modelerHandle === 'edge') return { type: 'edge', index: object.userData.edgeIndex };
      if (object.userData.modelerHandle === 'roof' || object.userData.faceId === 'roof') return { type: 'roof', faceId: 'roof' };
      if (mode === 'edge' && object.userData.selectableFace) return { type: 'edge', index: object.userData.edgeIndex, faceId: object.userData.faceId };
      if (object.userData.selectableFace) return { type: 'face', index: object.userData.edgeIndex, faceId: object.userData.faceId };
      return null;
    };
    const hitForMode = (event, mode) => {
      setRay(event);
      const hits = raycaster.intersectObjects(building.children, true);
      const match = hits.find(({ object }) => {
        if (mode === 'vertex') return object.userData.modelerHandle === 'vertex';
        if (mode === 'edge') return object.userData.modelerHandle === 'edge' || (object.userData.selectableFace && object.userData.faceId !== 'roof');
        if (mode === 'roof') return object.userData.modelerHandle === 'roof' || object.userData.faceId === 'roof';
        if (mode === 'face') return object.userData.selectableFace && object.userData.faceId !== 'roof';
        return object.userData.modelerHandle || object.userData.selectableFace;
      });
      return match || null;
    };
    const onPointerDown = (event) => {
      pointerOrigin = { x: event.clientX, y: event.clientY };
      const current = stateRef.current;
      if (!current.editable) return;
      const hit = hitForMode(event, current.modelerMode);
      const selection = hit ? selectionForHit(hit.object, current.modelerMode) : null;
      if (!selection) return;
      current.onElementSelect?.(selection);
      if (selection.faceId) current.onFaceSelect?.(selection.faceId);
      if (current.modelerMode === 'select') return;
      const originalFootprint = (current.model?.footprint || []).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
      const startPoint = selection.type === 'roof' ? null : groundPoint(event);
      if (selection.type !== 'roof' && !startPoint) return;
      current.onGeometryEditStart?.();
      dragState = { selection, originalFootprint, originalHeight: Number(current.model?.height) || 15, startPoint, startY: event.clientY };
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event) => {
      if (!dragState) return;
      const current = stateRef.current;
      if (dragState.selection.type === 'roof') {
        current.onGeometryChange?.({ height: dragState.originalHeight + (dragState.startY - event.clientY) * .08 });
        return;
      }
      const nextPoint = groundPoint(event);
      if (!nextPoint) return;
      const width = Math.max(4, Number(current.model?.width) || 20) * .45;
      const length = Math.max(4, Number(current.model?.length) || 28) * .45;
      const delta = { x: (nextPoint.x - dragState.startPoint.x) / width, y: -(nextPoint.z - dragState.startPoint.z) / length };
      const next = dragState.originalFootprint.map((point) => ({ ...point }));
      if (dragState.selection.type === 'vertex') {
        const vertex = next[dragState.selection.index];
        if (vertex) next[dragState.selection.index] = { x: vertex.x + delta.x, y: vertex.y + delta.y };
      } else {
        const index = dragState.selection.index;
        const start = next[index];
        const end = next[(index + 1) % next.length];
        if (start && end) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const edgeLength = Math.hypot(dx, dy) || 1;
          const normal = { x: dy / edgeLength, y: -dx / edgeLength };
          const amount = delta.x * normal.x + delta.y * normal.y;
          next[index] = { x: start.x + normal.x * amount, y: start.y + normal.y * amount };
          next[(index + 1) % next.length] = { x: end.x + normal.x * amount, y: end.y + normal.y * amount };
        }
      }
      current.onGeometryChange?.({ footprint: next });
    };
    const onPointerUp = (event) => {
      const current = stateRef.current;
      if (dragState) {
        dragState = null;
        controls.enabled = true;
        current.onGeometryEditEnd?.();
        renderer.domElement.releasePointerCapture?.(event.pointerId);
      } else if (current.editable && pointerOrigin && Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) <= 5) {
        const hit = hitForMode(event, current.modelerMode);
        const selection = hit ? selectionForHit(hit.object, current.modelerMode) : null;
        if (selection) {
          current.onElementSelect?.(selection);
          if (selection.faceId) current.onFaceSelect?.(selection.faceId);
        }
      }
      pointerOrigin = null;
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    scene.add(new THREE.HemisphereLight(0xdce4e6, 0x25282a, 1.55));
    const key = new THREE.DirectionalLight(0xfff4e6, 3.15);
    key.position.set(-14, 24, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.camera.left = -32;
    key.shadow.camera.right = 32;
    key.shadow.camera.top = 32;
    key.shadow.camera.bottom = -32;
    key.shadow.bias = -.00015;
    key.shadow.normalBias = .025;
    key.target.position.set(0, 3.5, 0);
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x9fb4bd, .72);
    fill.position.set(18, 10, -14);
    fill.target.position.set(0, 4, 0);
    scene.add(fill, fill.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1b1f21, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(80, 40, 0x565d60, 0x292e30);
    grid.position.y = .012;
    scene.add(grid);

    const physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    physicsWorld.allowSleep = true;
    physicsWorld.defaultContactMaterial.friction = .72;
    physicsWorld.defaultContactMaterial.restitution = .025;
    const physicsGround = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    physicsGround.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physicsWorld.addBody(physicsGround);

    const flood = addFloodField(scene);
    const wind = addWindField(scene);
    const earthquakeField = addEarthquakeField(scene);

    let building = createBuilding(stateRef.current.model);
    scene.add(building);
    controls.target.y = Math.min(8, Math.max(2.4, (building.userData.height || 8) * .38));
    let previousModel = stateRef.current.model;
    let physicsBody = null;
    let physicsMass = 0;
    let physicsFailed = false;
    let previousProgress = stateRef.current.progress;
    let frame;
    const animationStartedAt = performance.now();
    let previousFrameAt = animationStartedAt;

    const removePhysicsBody = () => {
      if (physicsBody) physicsWorld.removeBody(physicsBody);
      physicsBody = null;
      physicsMass = 0;
      physicsFailed = false;
    };
    const resetPhysicsBody = () => {
      removePhysicsBody();
      const bounds = building.userData.physicsBounds;
      if (!bounds || !building.userData.failureEligible) return;
      physicsMass = Math.max(18, Math.min(280, bounds.width * bounds.depth * bounds.height * .11));
      physicsBody = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(bounds.width / 2, bounds.height / 2, bounds.depth / 2)),
        position: new CANNON.Vec3(0, bounds.height / 2, 0),
        linearDamping: .18,
        angularDamping: .24,
        allowSleep: true,
        sleepSpeedLimit: .08,
        sleepTimeLimit: .6,
      });
      physicsWorld.addBody(physicsBody);
    };
    const parkPhysicsBody = () => {
      if (!physicsBody) return;
      const height = building.userData.physicsBounds?.height || building.userData.height || 1;
      physicsBody.type = CANNON.Body.STATIC;
      physicsBody.mass = 0;
      physicsBody.position.set(0, height / 2, 0);
      physicsBody.quaternion.set(0, 0, 0, 1);
      physicsBody.velocity.setZero();
      physicsBody.angularVelocity.setZero();
      physicsBody.force.setZero();
      physicsBody.torque.setZero();
      physicsBody.updateMassProperties();
      physicsBody.aabbNeedsUpdate = true;
      physicsFailed = false;
    };
    resetPhysicsBody();

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
      if (current.cameraState && current.cameraState.source !== current.viewportId && current.cameraState.revision !== appliedCameraRevision) {
        applyingSharedCamera = true;
        camera.position.fromArray(current.cameraState.position);
        controls.target.fromArray(current.cameraState.target);
        appliedCameraRevision = current.cameraState.revision;
        controls.update();
        applyingSharedCamera = false;
      }
      const frameAt = performance.now();
      const frameDelta = Math.min(.04, Math.max(0, (frameAt - previousFrameAt) / 1000));
      previousFrameAt = frameAt;
      if (current.model !== previousModel) {
        scene.remove(building);
        disposeObject(building);
        building = createBuilding(current.model);
        scene.add(building);
        controls.target.y = Math.min(8, Math.max(2.4, (building.userData.height || 8) * .38));
        previousModel = current.model;
        resetPhysicsBody();
      }
      if (current.progress < previousProgress - .01 || (current.progress <= .001 && previousProgress > .001)) parkPhysicsBody();
      previousProgress = current.progress;
      const elapsed = (frameAt - animationStartedAt) / 1000;
      const active = current.progress > 0;
      const responseLevel = current.scenario.type === 'earthquake'
        ? Math.min(1, (Number(current.scenario.magnitude) / 9.5 * .38 + Number(current.scenario.groundMotion) / 1.5 * .62)) * current.progress
        : current.scenario.type === 'flood'
          ? Math.min(1, (Number(current.scenario.waterLevel) / 12 * .62 + Number(current.scenario.flowVelocity) / 8 * .38)) * current.progress
          : Math.min(1, Number(current.scenario.windSpeed) / 320) * current.progress;
      const motion = current.reducedMotion ? 0 : 1;
      building.position.set(0, 0, 0);
      building.rotation.set(0, 0, 0);
      flood.surface.visible = false;
      flood.surface.material.uniforms.uAlpha.value = 0;
      flood.impact.visible = false;
      flood.impact.material.opacity = 0;
      flood.drift.visible = false;
      wind.material.opacity = 0;
      earthquakeField.visible = false;
      applyAssemblyProgress(building, current.assemblyProgress);
      building.traverse((child) => {
        if (Number.isFinite(child.userData.restX)) child.position.x = child.userData.restX;
        if (Number.isFinite(child.userData.restZ)) child.position.z = child.userData.restZ;
        if (Number.isFinite(child.userData.restRotationZ)) child.rotation.z = child.userData.restRotationZ;
      });

      if (active && current.scenario.type === 'earthquake') {
        const strength = responseLevel;
        earthquakeField.visible = true;
        earthquakeField.children.forEach((fissure) => {
          const fracture = Math.max(0, Math.min(1, (strength - fissure.userData.threshold) / Math.max(.01, 1 - fissure.userData.threshold)));
          fissure.visible = fracture > .01;
          fissure.material.opacity = .3 + fracture * .68;
          const count = fissure.userData.indexCount || 0;
          fissure.geometry.setDrawRange(0, Math.floor(count * fracture / 3) * 3);
        });
        const groundWave = Math.sin(elapsed * 17) * .7 + Math.sin(elapsed * 29) * .3;
        building.position.x = groundWave * .26 * strength * motion;
        building.position.z = Math.cos(elapsed * 14) * .17 * strength * motion;
        building.traverse((child) => {
          if (!child.userData.assembly || ['site', 'temporary-pillar'].includes(child.userData.assembly.type)) return;
          const heightRatio = Math.min(1, Math.max(0, child.position.y / Math.max(1, building.userData.height || 1)));
          child.position.x += groundWave * .34 * strength * heightRatio * motion;
          child.rotation.z += groundWave * .012 * strength * heightRatio * motion;
        });
      }
      if (active && current.scenario.type === 'flood') {
        const level = Math.max(0, Number(current.scenario.waterLevel) || 0);
        const flowVelocity = Math.max(.1, Number(current.scenario.flowVelocity) || .1);
        const direction = -(Number(current.scenario.direction) || 0) * Math.PI / 180;
        const displayedLevel = Math.min(9, level * current.progress * .55) + .04;
        flood.surface.visible = true;
        flood.surface.position.y = displayedLevel;
        flood.surface.material.uniforms.uTime.value = elapsed * motion;
        flood.surface.material.uniforms.uAlpha.value = .68;
        flood.surface.material.uniforms.uVelocity.value = flowVelocity;
        flood.surface.material.uniforms.uProgress.value = current.progress;
        flood.surface.material.uniforms.uDirection.value = direction;
        const impactPulse = Math.exp(-(((current.progress - .5) / .105) ** 2));
        const wake = current.progress > .5 ? Math.max(0, (1 - current.progress) * .24) : 0;
        const impactStrength = Math.max(impactPulse, wake);
        flood.impact.visible = impactStrength > .018;
        flood.impact.material.opacity = Math.min(.95, impactStrength * (.72 + flowVelocity * .07));
        const positions = flood.impact.geometry.attributes.position.array;
        for (let index = 0; index < flood.impact.userData.count; index += 1) {
          const angle = index / flood.impact.userData.count * Math.PI * 2;
          const phase = (elapsed * (.32 + flowVelocity * .06) + index * .173) % 1;
          const radius = 2.7 + (index % 9) * .12;
          const outward = phase * (1.2 + flowVelocity * .18);
          positions[index * 3] = Math.cos(angle) * radius + Math.cos(direction) * outward;
          positions[index * 3 + 1] = displayedLevel + Math.sin(phase * Math.PI) * (1 + flowVelocity * .16) + (index % 5) * .025;
          positions[index * 3 + 2] = Math.sin(angle) * radius + Math.sin(direction) * outward;
        }
        flood.impact.geometry.attributes.position.needsUpdate = true;
        flood.drift.visible = current.progress > .18;
        flood.drift.children.forEach((fragment, index) => {
          const dirX = Math.cos(direction);
          const dirZ = Math.sin(direction);
          const sideX = -dirZ;
          const sideZ = dirX;
          const travel = -32 + current.progress * 67 + ((elapsed * flowVelocity * .34 + fragment.userData.seed) % 8);
          const lateral = fragment.userData.lateral + Math.sin(elapsed * .8 + index) * .55;
          fragment.position.set(dirX * travel + sideX * lateral, displayedLevel + .06 + Math.sin(elapsed * 1.6 + index) * .045, dirZ * travel + sideZ * lateral);
          fragment.rotation.set(.08 * Math.sin(elapsed + index), direction + elapsed * (.12 + index % 3 * .04), .06 * Math.cos(elapsed * 1.2 + index));
          fragment.visible = travel < 30;
        });
      }
      if (active && current.scenario.type === 'wind') {
        const strength = Math.min(1, Number(current.scenario.windSpeed) / 220) * current.progress;
        wind.material.opacity = .24 + strength * .48;
        wind.position.x = ((elapsed * 7 * motion) % 8) - 4;
        const direction = -(Number(current.scenario.direction) || 0) * Math.PI / 180;
        wind.rotation.y = direction;
        building.traverse((child) => {
          if (!child.userData.assembly || ['site', 'temporary-pillar'].includes(child.userData.assembly.type)) return;
          const heightRatio = Math.min(1, Math.max(0, child.position.y / Math.max(1, building.userData.height || 1)));
          const gust = (.72 + Math.sin(elapsed * 2.8) * .28) * strength * heightRatio ** 1.6 * motion;
          child.position.x += Math.cos(direction) * gust * .34;
          child.position.z += Math.sin(direction) * gust * .34;
          child.rotation.z += Math.cos(direction) * gust * .012;
        });
      }

      const failure = active && building.userData.failureEligible ? Math.max(0, Math.min(1, (responseLevel - .82) / .18)) : 0;
      if (failure > .015 && current.running && physicsBody && !physicsFailed) {
        const direction = current.scenario.type === 'earthquake'
          ? -(Number(current.scenario.direction) || 32) * Math.PI / 180
          : -(Number(current.scenario.direction) || 0) * Math.PI / 180;
        const height = building.userData.physicsBounds?.height || building.userData.height || 1;
        const intensity = current.scenario.type === 'flood'
          ? 1.5 + Number(current.scenario.flowVelocity || 0) * .55
          : current.scenario.type === 'earthquake'
            ? 1.8 + Number(current.scenario.groundMotion || 0) * 2.4 + Number(current.scenario.magnitude || 0) * .1
            : 1.2 + Number(current.scenario.windSpeed || 0) / 105;
        physicsBody.type = CANNON.Body.DYNAMIC;
        physicsBody.mass = physicsMass;
        physicsBody.updateMassProperties();
        physicsBody.wakeUp();
        const impulse = new CANNON.Vec3(Math.cos(direction) * physicsMass * intensity, current.scenario.type === 'earthquake' ? physicsMass * .32 : 0, Math.sin(direction) * physicsMass * intensity);
        const contactHeight = current.scenario.type === 'flood' ? -height * .3 : current.scenario.type === 'wind' ? height * .28 : 0;
        physicsBody.applyImpulse(impulse, new CANNON.Vec3(0, contactHeight, 0));
        if (current.scenario.type === 'earthquake') {
          physicsBody.angularVelocity.set(Math.sin(direction) * 1.05, .12, -Math.cos(direction) * 1.05);
        } else if (current.scenario.type === 'flood') {
          const overturn = Math.min(2.05, .82 + Number(current.scenario.flowVelocity || 0) * .15);
          physicsBody.angularVelocity.set(Math.sin(direction) * overturn, .08, -Math.cos(direction) * overturn);
        } else {
          const overturn = Math.min(1.55, .42 + Number(current.scenario.windSpeed || 0) / 280);
          physicsBody.angularVelocity.set(Math.sin(direction) * overturn, .06, -Math.cos(direction) * overturn);
        }
        physicsFailed = true;
      }
      if (physicsFailed && physicsBody && current.running) physicsWorld.step(1 / 60, frameDelta, 4);
      if (physicsFailed && physicsBody) {
        building.quaternion.set(physicsBody.quaternion.x, physicsBody.quaternion.y, physicsBody.quaternion.z, physicsBody.quaternion.w);
        const centerOffset = new THREE.Vector3(0, (building.userData.physicsBounds?.height || building.userData.height || 1) / 2, 0).applyQuaternion(building.quaternion);
        building.position.set(physicsBody.position.x - centerOffset.x, physicsBody.position.y - centerOffset.y, physicsBody.position.z - centerOffset.z);
      } else if (failure > 0) {
        const direction = current.scenario.type === 'earthquake' ? Math.PI * .18 : -(Number(current.scenario.direction) || 0) * Math.PI / 180;
        const fall = failure * failure * (1.25 - .25 * Math.cos(failure * Math.PI));
        building.rotation.z += Math.cos(direction) * fall * .72 * motion;
        building.rotation.x += Math.sin(direction) * fall * .5 * motion;
        building.position.y -= fall * .7;
        building.position.x += Math.cos(direction) * fall * .55;
        building.position.z += Math.sin(direction) * fall * .55;
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
          const baseAmplification = current.scenario.type === 'flood' ? .07 * current.progress : current.scenario.type === 'earthquake' ? .05 * current.progress : 0;
          const fracture = Math.max(0, Math.min(1, (responseLevel + baseAmplification - threshold) / Math.max(.01, 1 - threshold)));
          child.material.opacity = active ? fracture * .9 : 0;
          if (child.userData.crackMesh) {
            const count = child.userData.indexCount || 0;
            child.geometry.setDrawRange(0, fracture > 0 ? Math.floor(count * fracture / 3) * 3 : 0);
          } else {
            child.geometry.setDrawRange(0, fracture > 0 ? Math.max(2, Math.ceil((child.userData.pointCount || 5) * fracture)) : 0);
          }
        }
        if (child.userData.isDebris) {
          child.visible = failure > .02;
          if (child.visible) {
            const t = failure * 1.8;
            const base = child.userData.basePosition;
            const velocity = child.userData.velocity;
            child.position.set(base.x + velocity.x * t, Math.max(.04, base.y + velocity.y * t - 1.9 * t * t), base.z + velocity.z * t);
            child.rotation.set(t * velocity.z * 1.6, t * velocity.x * 1.2, t * velocity.y);
          }
        }
        if (child.userData.modelerHandle) {
          const handleType = child.userData.modelerHandle;
          const selected = current.selectedElement?.type === handleType
            && (handleType === 'roof' || current.selectedElement?.index === (handleType === 'vertex' ? child.userData.vertexIndex : child.userData.edgeIndex));
          child.visible = current.editable && (current.modelerMode === 'select' || current.modelerMode === handleType || selected);
          if (child.visible) {
            const scale = selected ? 1.48 : current.modelerMode === handleType ? 1.12 : .78;
            child.scale.setScalar(scale);
            if ('emissiveIntensity' in child.material) child.material.emissiveIntensity = selected ? .95 : .32;
            if ('opacity' in child.material) child.material.opacity = selected ? 1 : .78;
          }
        }
        if (child.userData.selectableFace && child.material) {
          const selectedByElement = current.selectedElement?.type === 'face' && current.selectedElement?.index === child.userData.edgeIndex;
          const selected = current.editable && (selectedByElement || current.selectedFace === child.userData.faceId);
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
      controls.removeEventListener('change', publishCamera);
      controls.dispose();
      removePhysicsBody();
      physicsWorld.removeBody(physicsGround);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="simulation-viewport__canvas" ref={hostRef} role="img" aria-label="Interactive three-dimensional infrastructure simulation viewport" />;
}
