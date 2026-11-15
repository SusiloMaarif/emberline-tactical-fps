// grenade.js: grenade projectiles. Real balls with gravity and wall bounces;
// frags damage by radius and line of sight, smoke blocks vision, flashes
// blind by view angle and distance. One job: everything a thrown grenade does
// from the pin to the bang. Hitscan shooting stays in combat.js.
import * as THREE from 'three';

export function createGrenades(scene, shootables) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const grenades = [];
  const tmpDir = new THREE.Vector3();

  return {
    grenades,
    throwGrenade(kind, origin, direction, power = 14) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: kind === 'smoke' ? 0x9a938a : kind === 'flash' ? 0xfff2b0 : 0x3a3a3a, roughness: 0.4, metalness: 0.5 }),
      );
      mesh.position.copy(origin);
      scene.add(mesh);
      grenades.push({
        kind, mesh,
        velocity: new THREE.Vector3().copy(direction).multiplyScalar(power).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: kind === 'frag' ? 1.4 : kind === 'smoke' ? 1.1 : 1.2,
        bounced: 0,
      });
    },
    // Step grenades; returns events: { type: 'frag'|'smoke'|'flash', position }.
    stepGrenades(dt, colliders) {
      const events = [];
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.velocity.y -= 18 * dt;
        g.mesh.position.addScaledVector(g.velocity, dt);
        const p = g.mesh.position;
        // Bounce off map boxes (cheap: clamp and reflect the velocity axis).
        for (const box of colliders) {
          if (p.x < box.min.x || p.x > box.max.x || p.y < box.min.y || p.y > box.max.y || p.z < box.min.z || p.z > box.max.z) continue;
          const dxMin = Math.min(p.x - box.min.x, box.max.x - p.x);
          const dzMin = Math.min(p.z - box.min.z, box.max.z - p.z);
          const dyMin = Math.min(p.y - box.min.y, box.max.y - p.y);
          if (dyMin <= dxMin && dyMin <= dzMin) { p.y = g.velocity.y > 0 ? box.min.y - 0.09 : box.max.y + 0.09; g.velocity.y *= -0.45; }
          else if (dxMin <= dzMin) { p.x = g.velocity.x > 0 ? box.min.x - 0.09 : box.max.x + 0.09; g.velocity.x *= -0.45; }
          else { p.z = g.velocity.z > 0 ? box.min.z - 0.09 : box.max.z + 0.09; g.velocity.z *= -0.45; }
          g.velocity.multiplyScalar(0.7);
          g.bounced += 1;
          break;
        }
        if (p.y < 0.09) { p.y = 0.09; g.velocity.y = Math.abs(g.velocity.y) * 0.45; g.velocity.x *= 0.7; g.velocity.z *= 0.7; }
        if (g.fuse <= 0) {
          events.push({ type: g.kind, position: p.clone() });
          scene.remove(g.mesh);
          grenades.splice(i, 1);
        }
      }
      return events;
    },
    // Frag damage: radius falloff, blocked by walls (raycast from blast).
    fragDamage(center, radius, bodies) {
      const out = [];
      for (const b of bodies) {
        const dist = center.distanceTo(b.chest);
        if (dist > radius) continue;
        tmpDir.copy(b.chest).sub(center).normalize();
        raycaster.set(center, tmpDir);
        raycaster.far = dist;
        if (raycaster.intersectObjects(shootables, false).length) continue;
        out.push({ body: b, damage: 110 * (1 - (dist / radius) * 0.7) });
      }
      return out;
    },
    // Flash blindness 0..1 for a viewer at eye with a facing yaw/pitch.
    flashStrength(center, eye, yaw, pitch) {
      const dist = center.distanceTo(eye);
      if (dist > 16) return 0;
      tmpDir.copy(center).sub(eye).normalize();
      const facing = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const facingDot = Math.max(0, tmpDir.dot(facing));
      const base = (1 - dist / 16) * (0.35 + 0.65 * facingDot);
      return Math.min(1, base);
    },
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
    },
  };
}
