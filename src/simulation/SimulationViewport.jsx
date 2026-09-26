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

function createBuilding(model) {
  const group = new THREE.Group();
  if (!model) return group;
  if (model.category === 'roads' && model.footprint?.length >= 2) {
    const line = normalizedLine(model);
    const curve = new THREE.CatmullRomCurve3(line);
    const road = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(10, line.length * 3), .48, 6, false),
      new THREE.MeshStandardMaterial({ color: 0x6f7475, roughness: .96 }),
    );
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);
    const roadEdge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: .62 }));
    roadEdge.position.y = .52;
    group.add(roadEdge);
    group.userData.height = .6;
    return group;
  }
  const points = normalizedShape(model);
  const shape = new THREE.Shape(points);
  const height = Math.max(2, Math.min(28, (Number(model?.height) || 12) * .55));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const materialColors = {
    'reinforced concrete': 0xb9b6b0,
    'structural steel': 0x737a7d,
    masonry: 0xb89c84,
    timber: 0x9a7356,
  };
  const material = new THREE.MeshStandardMaterial({ color: materialColors[model.material] || 0xd7d2ca, roughness: .82, metalness: model.material === 'structural steel' ? .34 : .04 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: .62 }));
  group.add(edges);

  if (model.roof && !['flat', 'unspecified'].includes(model.roof)) {
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(5.8, model.roof === 'gable' ? 2.4 : 1.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x565d60, roughness: .9 }),
    );
    roof.position.y = height + (model.roof === 'gable' ? 1.2 : .9);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = model.roof === 'gable' ? .62 : .82;
    roof.castShadow = true;
    group.add(roof);
  }

  const floors = Math.max(1, Math.min(16, Number(model?.floors) || 1));
  for (let floor = 1; floor < floors; floor += 1) {
    const y = height * floor / floors;
    const floorLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(9, .02, 7)), new THREE.LineBasicMaterial({ color: STEEL, transparent: true, opacity: .25 }));
    floorLine.position.y = y;
    group.add(floorLine);
  }

  if (model.openings && model.openings !== 'unspecified') {
    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x25292b, transparent: true, opacity: .78 });
    const windowCount = model.openings === 'limited openings' ? 2 : 4;
    for (let floor = 0; floor < Math.min(floors, 8); floor += 1) {
      for (let bay = 0; bay < windowCount; bay += 1) {
        const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(.7, .48), windowMaterial);
        windowPane.position.set(-3 + bay * (6 / Math.max(1, windowCount - 1)), height * (floor + .55) / floors, 3.515);
        group.add(windowPane);
      }
    }
  }

  if (model?.structuralLayout && model.structuralLayout !== 'unavailable') {
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x565d60, roughness: .7 });
    [[-3, -2], [3, -2], [-3, 2], [3, 2]].forEach(([x, z]) => {
      const column = new THREE.Mesh(new THREE.BoxGeometry(.24, height, .24), columnMaterial);
      column.position.set(x, height / 2, z);
      group.add(column);
    });
  }

  const stressMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL, transparent: true, opacity: 0, depthWrite: false });
  const stress = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 12), stressMaterial);
  stress.position.set(2.5, Math.min(height * .62, height - 1), 1.7);
  stress.scale.set(1.8, .7, 1.3);
  stress.userData.isStress = true;
  group.add(stress);

  const crackMaterial = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0 });
  const crackGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(3.2, Math.min(height * .72, height - .4), 3.52),
    new THREE.Vector3(2.7, Math.min(height * .6, height - .8), 3.53),
    new THREE.Vector3(3.05, Math.min(height * .48, height - 1.2), 3.54),
    new THREE.Vector3(2.45, Math.min(height * .33, height - 1.5), 3.55),
  ]);
  const crack = new THREE.Line(crackGeometry, crackMaterial);
  crack.userData.isCrack = true;
  group.add(crack);
  group.userData.height = height;
  return group;
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

export default function SimulationViewport({ model, scenario, progress, running, reducedMotion }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ model, scenario, progress, running, reducedMotion });
  stateRef.current = { model, scenario, progress, running, reducedMotion };

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
        if (child.userData.isStress) child.material.opacity = active ? Math.max(0, responseLevel - .14) * .7 : 0;
        if (child.userData.isCrack) child.material.opacity = active ? Math.max(0, responseLevel - .58) * 2.1 : 0;
      });
      controls.update();
      renderer.render(scene, camera);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="simulation-viewport__canvas" ref={hostRef} role="img" aria-label="Interactive three-dimensional infrastructure simulation viewport" />;
}
