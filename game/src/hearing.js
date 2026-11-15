// hearing.js: the noise bus. Gunshots, explosions and steps push a noise
// event onto it; a bot asks what it can hear from where it stands. One bus,
// owned by main, read by the bots every step. Nothing here moves or shoots.
export function createHearing() {
  const noises = [];
  return {
    noises,
    add(x, z, radius, at) {
      noises.push({ x, z, radius, at });
      if (noises.length > 40) noises.shift();
    },
    // Every noise still fresh at `time` (default window 1.5 s).
    recent(time, window = 1.5) {
      return noises.filter((n) => time - n.at <= window);
    },
    // The closest fresh noise within earshot of (x, z), or null.
    heardAt(x, z, time, window = 1.5) {
      let best = null;
      let bestD = Infinity;
      for (const n of noises) {
        if (time - n.at > window) continue;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < n.radius && d < bestD) { bestD = d; best = n; }
      }
      return best ? { x: best.x, z: best.z, at: best.at } : null;
    },
  };
}
