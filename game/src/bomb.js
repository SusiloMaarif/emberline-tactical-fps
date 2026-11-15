// bomb.js: the bomb mesh — the charge itself, dropped or planted. One job:
// show where the bomb is and blink while it is armed. The plant/defuse state
// machine lives in rounds.js; this file only renders the object.
import * as THREE from 'three';

export function createBomb(scene) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3b30, emissiveIntensity: 2 }),
  );
  light.position.set(0.18, 0.14, 0);
  group.add(box, light);
  group.visible = false;
  scene.add(group);

  return {
    group,
    place(x, z) {
      group.position.set(x, 0.12, z);
      group.visible = true;
    },
    hide() { group.visible = false; },
    // Blink the arming light while the bomb ticks.
    blink(t) {
      light.material.emissiveIntensity = (Math.sin(t * 6) > 0) ? 2.5 : 0.2;
    },
  };
}
