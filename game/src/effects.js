// Effects: tracers, muzzle flashes, impact sparks and smoke. All effects are
// pooled and reused: no new objects are made in the hot loop, the tracer and
// spark pools are fixed-size arrays recycled in place.
import * as THREE from 'three';

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;
const MAX_SMOKE = 6;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27d, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  let sparkIndex = 0;

  const muzzle = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
  scene.add(muzzle);
  let muzzleLife = 0;

  // Smoke clouds: one expanding sphere of translucent puffs each. Bots test
  // line of sight against the cloud spheres, so smoke really blocks vision.
  const smokes = [];
  for (let i = 0; i < MAX_SMOKE; i += 1) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a938a, transparent: true, opacity: 0.5, roughness: 1 });
    for (let j = 0; j < 7; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), mat);
      puff.position.set((j % 3 - 1) * 1.1, (j % 2) * 0.8 + 0.6, (Math.floor(j / 3) - 1) * 1.1);
      group.add(puff);
    }
    group.visible = false;
    scene.add(group);
    smokes.push({ group, center: new THREE.Vector3(), radius: 4.5, life: 0, active: false });
  }
  let smokeIndex = 0;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to, color = 0xffd27d) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
      const pos = t.line.geometry.attributes.position.array;
      pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
      pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.color.setHex(color);
      t.line.material.opacity = 0.9;
      t.life = 0.07;
    },
    muzzleFlash(position) {
      muzzle.position.copy(position);
      muzzle.intensity = 26;
      muzzleLife = 0.05;
    },
    impact(point, normal) {
      for (let i = 0; i < 8; i += 1) {
        const s = sparkIndex;
        sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
        sparkPos[s * 3] = point.x; sparkPos[s * 3 + 1] = point.y; sparkPos[s * 3 + 2] = point.z;
        sparkVel[s * 3] = normal.x * 2 + (Math.random() - 0.5) * 4;
        sparkVel[s * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 3;
        sparkVel[s * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * 4;
        sparkLife[s] = 0.35;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    explosion(point) {
      for (let i = 0; i < 40; i += 1) {
        const s = sparkIndex;
        sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
        sparkPos[s * 3] = point.x; sparkPos[s * 3 + 1] = point.y; sparkPos[s * 3 + 2] = point.z;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * 6;
        sparkVel[s * 3] = Math.cos(a) * 6; sparkVel[s * 3 + 1] = up; sparkVel[s * 3 + 2] = Math.sin(a) * 6;
        sparkLife[s] = 0.8;
      }
      muzzle.position.copy(point);
      muzzle.intensity = 60;
      muzzleLife = 0.25;
    },
    smoke(point) {
      const s = smokes[smokeIndex];
      smokeIndex = (smokeIndex + 1) % MAX_SMOKE;
      s.center.copy(point);
      s.center.y = Math.max(1, point.y);
      s.group.position.copy(s.center);
      s.group.visible = true;
      s.life = 14;
      s.active = true;
      return s;
    },
    // Line-of-sight test against active smoke clouds.
    blockedBySmoke(from, to) {
      for (const s of smokes) {
        if (!s.active) continue;
        tmp.copy(to).sub(from);
        const len = tmp.length();
        if (len === 0) continue;
        const dir = tmp.multiplyScalar(1 / len);
        const toCenter = new THREE.Vector3().copy(s.center).sub(from);
        const t = Math.max(0, Math.min(len, toCenter.dot(dir)));
        const closest = new THREE.Vector3().copy(from).addScaledVector(dir, t);
        if (closest.distanceTo(s.center) < s.radius * 0.8) return true;
      }
      return false;
    },
    flashAt(point) {
      muzzle.position.copy(point);
      muzzle.position.y += 1;
      muzzle.intensity = 40;
      muzzleLife = 0.12;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
      if (muzzleLife > 0) {
        muzzleLife -= dt;
        if (muzzleLife <= 0) muzzle.intensity = 0;
      }
      let anySpark = false;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anySpark = true;
        sparkLife[i] -= dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        sparkVel[i * 3 + 1] -= 9 * dt;
        if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -100; }
      }
      if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
      for (const s of smokes) {
        if (!s.active) continue;
        s.life -= dt;
        const scale = 1 + (14 - Math.max(0, s.life)) * 0.04;
        s.group.scale.setScalar(scale);
        s.group.children.forEach((puff, i) => { puff.material.opacity = Math.min(0.55, s.life / 6); void i; });
        if (s.life <= 0) { s.active = false; s.group.visible = false; }
      }
    },
  };
}
