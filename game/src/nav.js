// nav.js: the waypoint graph the bots walk. Nodes sit on the lanes, edges join
// neighbours; routes are breadth-first searches through it. One job: where a
// bot can walk, and the shortest path between two nodes. The map's geometry
// lives in map.js; this file only knows the graph.
export const WAYPOINTS = [
  { id: 0, x: 0, z: 14, links: [1, 2, 3] }, // ember spawn
  { id: 1, x: -10, z: 12, links: [0, 4] }, // to A-long
  { id: 2, x: 0, z: 8, links: [0, 5] }, // to mid
  { id: 3, x: 10, z: 12, links: [0, 6] }, // to B-long
  { id: 4, x: -17, z: 6, links: [1, 7] }, // A-long
  { id: 5, x: 0, z: 0, links: [2, 8, 9] }, // mid hall
  { id: 6, x: 17, z: 6, links: [3, 10] }, // B-long
  { id: 7, x: -17, z: -3, links: [4, 11] }, // A approach
  { id: 8, x: -8, z: -2, links: [5, 11] }, // mid to A
  { id: 9, x: 8, z: -2, links: [5, 12] }, // mid to B
  { id: 10, x: 17, z: -3, links: [6, 12] }, // B approach
  { id: 11, x: -16, z: -9, links: [7, 8, 13] }, // site A
  { id: 12, x: 16, z: -9, links: [9, 10, 14] }, // site B
  { id: 13, x: -10, z: -13, links: [11, 15] }, // A back / slate side
  { id: 14, x: 10, z: -13, links: [12, 15] }, // B back / slate side
  { id: 15, x: 0, z: -14, links: [13, 14, 16] }, // slate spawn
  { id: 16, x: 0, z: -6, links: [15, 5] }, // connector
];

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (const w of WAYPOINTS) {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bestD) { bestD = d; best = w.id; }
  }
  return best;
}

// Breadth-first route through the waypoint graph.
export function findRoute(from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of WAYPOINTS[cur].links) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev.get(node) !== null) { node = prev.get(node); path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}
