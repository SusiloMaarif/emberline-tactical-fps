// Combat: hitscan shooting. One resolver serves the player and the bots, so a
// bot's shot and the player's shot obey the same rules: raycast against map
// meshes first, then against bodies (head sphere, torso capsule), with armor
// and helmets applied in one place. Grenades live in grenade.js.
import * as THREE from 'three';
import { damageAt } from './weapons.js';

const HEAD_RADIUS = 0.26;
const BODY_RADIUS = 0.42;

export function createCombat(scene, shootables, effects) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const tmpDir = new THREE.Vector3();

  function bodyHit(origin, direction, bodies) {
    // bodies: [{ kind, ref, head: Vector3, chest: Vector3 }]
    let best = null;
    let bestDist = Infinity;
    let bestPart = 'body';
    for (const b of bodies) {
      for (const part of [{ p: b.head, r: HEAD_RADIUS, name: 'head' }, { p: b.chest, r: BODY_RADIUS, name: 'body' }]) {
        const toPart = new THREE.Vector3().copy(part.p).sub(origin);
        const t = toPart.dot(direction);
        if (t < 0 || t > bestDist) continue;
        const closest = new THREE.Vector3().copy(origin).addScaledVector(direction, t);
        if (closest.distanceTo(part.p) < part.r) {
          best = b; bestDist = t; bestPart = part.name;
        }
      }
    }
    return best ? { body: best, distance: bestDist, part: bestPart } : null;
  }

  function wallHit(origin, direction) {
    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(shootables, false);
    return hits.length ? hits[0] : null;
  }

  return {
    // Resolve one shot. Returns { hit, part, distance, point } or null.
    shoot(origin, direction, weapon, bodies) {
      const wall = wallHit(origin, direction);
      const wallDist = wall ? wall.distance : Infinity;
      const body = bodyHit(origin, direction, bodies);
      if (body && body.distance < wallDist) {
        const point = new THREE.Vector3().copy(origin).addScaledVector(direction, body.distance);
        return { hit: body.body, part: body.part, distance: body.distance, point };
      }
      if (wall) return { hit: null, part: 'wall', distance: wall.distance, point: wall.point.clone(), normal: wall.face ? wall.face.normal.clone() : new THREE.Vector3(0, 1, 0) };
      return null;
    },
    damageFor(weapon, distance, head, helmet) {
      return damageAt(weapon, distance, head, helmet);
    },
  };
}
