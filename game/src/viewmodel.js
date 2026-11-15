// viewmodel.js: the first-person weapon. A low-poly rifle built from boxes,
// hung off the camera so the player always sees their gun: receiver, barrel,
// handguard, magazine, stock and sight, with an ember accent stripe. It bobs
// with movement, kicks when fired and centres when aiming. One job: the gun
// in the player's hands. Fog never touches it, so it stays crisp.
import * as THREE from 'three';

const KINDS = {
  pistol: { scale: 0.62, barrel: 0.5, scope: false },
  smg: { scale: 0.85, barrel: 0.8, scope: false },
  rifle: { scale: 1.0, barrel: 1.0, scope: false },
  shotgun: { scale: 1.05, barrel: 0.9, scope: false },
  sniper: { scale: 1.15, barrel: 1.45, scope: true },
};

export function createViewmodel(camera) {
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.35, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, emissive: 0xff7a1a, emissiveIntensity: 0.5 });
  for (const m of [gunmetal, dark, accent]) m.fog = false;

  const group = new THREE.Group();
  function part(w, h, d, x, y, z, mat, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    group.add(mesh);
    return mesh;
  }
  part(0.09, 0.13, 0.42, 0, 0, 0, gunmetal); // receiver
  part(0.08, 0.09, 0.3, 0, 0.01, -0.28, dark); // handguard
  const barrel = part(0.035, 0.035, 0.34, 0, 0.02, -0.55, gunmetal); // barrel
  part(0.07, 0.16, 0.12, 0, -0.12, -0.02, dark, 0.12); // magazine
  part(0.08, 0.11, 0.2, 0, 0.01, 0.28, dark); // stock
  part(0.03, 0.06, 0.08, 0, 0.1, -0.05, dark); // rear sight
  part(0.095, 0.02, 0.2, 0, -0.045, -0.2, accent); // ember stripe
  const scope = part(0.05, 0.06, 0.22, 0, 0.11, -0.1, gunmetal); // sniper scope
  scope.visible = false;

  group.position.set(0.22, -0.22, -0.45);
  camera.add(group);

  let kick = 0;
  let bobPhase = 0;
  let currentKind = 'rifle';

  return {
    group,
    get kind() { return currentKind; },
    setWeapon(kind) {
      const k = KINDS[kind] || KINDS.rifle;
      currentKind = kind;
      group.scale.setScalar(k.scale);
      barrel.scale.z = k.barrel;
      barrel.position.z = -0.38 - 0.17 * (k.barrel - 1);
      scope.visible = k.scope;
    },
    fire() { kick = 1; },
    update(dt, speed, aiming) {
      bobPhase += dt * (2 + speed * 1.6);
      const move = Math.min(1, speed / 4);
      const bobY = Math.sin(bobPhase * 2) * 0.006 * move;
      const bobX = Math.cos(bobPhase) * 0.004 * move;
      kick = Math.max(0, kick - dt * 6);
      group.position.set(
        aiming ? 0 : 0.22 + bobX,
        aiming ? -0.155 : -0.22 + bobY,
        aiming ? -0.32 : -0.45 + kick * 0.06,
      );
      group.rotation.x = kick * 0.12;
      group.rotation.z = aiming ? 0 : 0.02;
    },
  };
}
