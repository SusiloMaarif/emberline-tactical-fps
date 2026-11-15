// Cinderworks: an original dusk-lit industrial yard, built from boxes and
// cylinders only. Two bomb sites (A Foundry west, B Silos east), three lanes:
// A-long down the west wall, B-long down the east wall, and Mid through the
// furnace hall. Every solid is both a mesh and an AABB collider, and every
// bullet stops on it. Cylinders collide as their bounding boxes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = { minX: -22, maxX: 22, minZ: -18, maxZ: 18 };

export const SITES = {
  A: { name: 'A · Foundry', center: { x: -16, z: -9 }, radius: 4.5 },
  B: { name: 'B · Silos', center: { x: 16, z: -9 }, radius: 4.5 },
};

export const SPAWNS = {
  ember: [
    { x: -6, z: 15, yaw: Math.PI }, { x: -2, z: 15.5, yaw: Math.PI },
    { x: 2, z: 15.5, yaw: Math.PI }, { x: 6, z: 15, yaw: Math.PI },
    { x: 0, z: 13.5, yaw: Math.PI },
  ],
  slate: [
    { x: -6, z: -15, yaw: 0 }, { x: -2, z: -15.5, yaw: 0 },
    { x: 2, z: -15.5, yaw: 0 }, { x: 6, z: -15, yaw: 0 },
    { x: 0, z: -13.5, yaw: 0 },
  ],
};

// Waypoint graph, routing and hearing live in nav.js / hearing.js now; this
// file only knows sites, spawns and geometry.
export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mats = {};
  for (const name of Object.keys(PALETTE)) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'accentB' ? 0.5 : 0.92,
      metalness: name === 'hairline' ? 0.35 : 0.05,
    });
  }
  const rust = new THREE.MeshStandardMaterial({ color: 0x6e3b1e, roughness: 0.85, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.45, metalness: 0.7 });
  const glowA = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff7a1a, emissiveIntensity: 1.6 });
  const glowB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x37c8c3, emissiveIntensity: 1.6 });

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(r, h, x, z, mat, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter walls (5 m high, open sky above).
  box(45, 0.4, 37, 0, -0.2, 0, mats.surface, false);
  box(0.6, 5, 37, -22.3, 2.5, 0, mats.surface);
  box(0.6, 5, 37, 22.3, 2.5, 0, mats.surface);
  box(45, 5, 0.6, 0, 2.5, -18.3, mats.surface);
  box(45, 5, 0.6, 0, 2.5, 18.3, mats.surface);

  // Site markers: glowing strips on the ground at A and B.
  box(7, 0.06, 0.5, -16, 0.03, -4.8, glowA, false);
  box(7, 0.06, 0.5, -16, 0.03, -13.2, glowA, false);
  box(0.5, 0.06, 8.9, -19.6, 0.03, -9, glowA, false);
  box(7, 0.06, 0.5, 16, 0.03, -4.8, glowB, false);
  box(7, 0.06, 0.5, 16, 0.03, -13.2, glowB, false);
  box(0.5, 0.06, 8.9, 19.6, 0.03, -9, glowB, false);

  // Ground markings: lane dashes and hazard chevrons, so the floor reads as
  // a yard, not a blank plane.
  for (let z = -2; z <= 10; z += 3) {
    box(0.35, 0.02, 1.4, -19.5, 0.02, z, mats.muted, false);
    box(0.35, 0.02, 1.4, 19.5, 0.02, z, mats.muted, false);
  }
  for (let x = -6; x <= 6; x += 3) {
    box(1.4, 0.02, 0.35, x, 0.02, 12.5, mats.muted, false);
  }
  box(2.2, 0.02, 0.5, -16, 0.02, -1.5, glowA, false);
  box(2.2, 0.02, 0.5, 16, 0.02, -1.5, glowB, false);

  // Site A Foundry: furnace block, crates, pipe stack.
  box(4, 3.4, 2.4, -19.5, 1.7, -11, rust);
  box(2.2, 1.1, 2.2, -13.5, 0.55, -11.5, mats.hairline);
  box(1.2, 1.1, 1.2, -13.5, 1.65, -11.5, mats.hairline);
  box(1.4, 1.1, 3.4, -18.5, 0.55, -5.5, mats.hairline);
  cylinder(0.9, 4.6, -11.5, -6.5, steel);
  box(3.2, 0.9, 1.2, -15, 0.45, -6.8, mats.hairline);

  // Site B Silos: two tall silos, container, crates.
  cylinder(2.2, 6.5, 18.5, -13, steel);
  cylinder(2.2, 6.5, 13.5, -14.5, rust);
  box(4.4, 2.4, 1.6, 16, 1.2, -5.6, mats.accentB);
  box(1.6, 1.1, 1.6, 12.5, 0.55, -8, mats.hairline);
  box(1.6, 1.1, 1.6, 19, 0.55, -10.5, mats.hairline);

  // Mid furnace hall: central furnace, pillars, low cover.
  box(3, 4.2, 3, 0, 2.1, 0, rust);
  box(1.2, 3.6, 1.2, -5, 1.8, 3, mats.surface);
  box(1.2, 3.6, 1.2, 5, 1.8, -3, mats.surface);
  box(2.6, 1.0, 1.2, -3.5, 0.5, -5.5, mats.hairline);
  box(2.6, 1.0, 1.2, 3.5, 0.5, 5.5, mats.hairline);
  cylinder(0.7, 5, -2.5, -1.5, steel);
  cylinder(0.7, 5, 2.5, 1.5, steel);

  // Lane cover: crates and containers along A-long, B-long and the connectors.
  box(2.4, 1.2, 1.2, -18, 0.6, 2, mats.hairline);
  box(1.2, 1.2, 1.2, -18, 1.8, 2, mats.hairline);
  box(2.4, 1.2, 1.2, 18, 0.6, 2, mats.hairline);
  box(3.6, 2.2, 1.4, -8, 1.1, 9, mats.surface);
  box(3.6, 2.2, 1.4, 8, 1.1, 9, mats.surface);
  box(1.4, 1.0, 1.4, -12, 0.5, -13.5, mats.hairline);
  box(1.4, 1.0, 1.4, 12, 0.5, -13.5, mats.hairline);
  box(4.8, 2.4, 1.6, 0, 1.2, -15.5, mats.surface);
  box(2.2, 1.1, 2.2, -5, 0.55, 12.5, mats.hairline);
  box(2.2, 1.1, 2.2, 5, 0.55, 12.5, mats.hairline);

  // Lighting: bright midday sun over the yard, cool fill, warm site lights —
// the scene must read at a glance, not hide in dusk.
  const hemi = new THREE.HemisphereLight(0x9a8a76, 0x2a211a, 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc98f, 3.6);
  sun.position.set(-14, 18, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x7d94b8, 1.3);
  fill.position.set(12, 10, -14);
  scene.add(fill);
  const siteA = new THREE.PointLight(0xff7a1a, 45, 18, 1.8);
  siteA.position.set(-16, 4.5, -9);
  scene.add(siteA);
  const siteB = new THREE.PointLight(0x37c8c3, 45, 18, 1.8);
  siteB.position.set(16, 4.5, -9);
  scene.add(siteB);

  return { colliders, shootables, group };
}
