// collide.js: AABB resolution for anything that walks the map. A walker moves,
// then this pushes it out of every box it overlaps along the shallowest axis
// and clamps it inside the yard. One job: never let a body inside solid geometry.
export function resolveAABB(pos, radius, height, colliders) {
  for (const box of colliders) {
    if (pos.x + radius <= box.min.x || pos.x - radius >= box.max.x) continue;
    if (height <= box.min.y || 0 >= box.max.y) continue;
    if (pos.z + radius <= box.min.z || pos.z - radius >= box.max.z) continue;
    const pushLeft = (pos.x + radius) - box.min.x;
    const pushRight = box.max.x - (pos.x - radius);
    const pushBack = (pos.z + radius) - box.min.z;
    const pushFront = box.max.z - (pos.z - radius);
    const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
    if (min === pushLeft) pos.x = box.min.x - radius;
    else if (min === pushRight) pos.x = box.max.x + radius;
    else if (min === pushBack) pos.z = box.min.z - radius;
    else pos.z = box.max.z + radius;
  }
}

export function clampBounds(pos, radius, minX, maxX, minZ, maxZ) {
  pos.x = Math.max(minX + radius, Math.min(maxX - radius, pos.x));
  pos.z = Math.max(minZ + radius, Math.min(maxZ - radius, pos.z));
}
