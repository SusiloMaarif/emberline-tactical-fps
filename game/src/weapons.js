// Weapons: every gun is data, so the buy menu, the HUD and the shooting code
// all read the same table. Damage falls off with range; headshots pay x4 (x2
// through a helmet, which the rifle and sniper ignore half of); spread grows
// while moving and firing, and recoil kicks the aim up, so stopping to aim pays.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0, auto: false,
    damage: 34, headMult: 4, range: 40, falloff: 0.45, fireInterval: 0.16,
    mag: 12, reserve: 36, reloadTime: 1.1, spread: 0.011, moveSpread: 0.02,
    recoil: 0.011, adsSpread: 0.005, zoom: 1.0, tracer: 0xffd27d,
  },
  vk9: {
    id: 'vk9', name: 'VK-9 Spray', kind: 'smg', price: 1500, auto: true,
    damage: 26, headMult: 4, range: 32, falloff: 0.4, fireInterval: 0.085,
    mag: 32, reserve: 96, reloadTime: 1.9, spread: 0.016, moveSpread: 0.03,
    recoil: 0.009, adsSpread: 0.008, zoom: 1.0, tracer: 0xffd27d,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Ember', kind: 'rifle', price: 2700, auto: true,
    damage: 33, headMult: 4, range: 60, falloff: 0.55, fireInterval: 0.1,
    mag: 30, reserve: 90, reloadTime: 2.2, spread: 0.009, moveSpread: 0.024,
    recoil: 0.013, adsSpread: 0.004, zoom: 1.15, tracer: 0xffb347,
  },
  lr50: {
    id: 'lr50', name: 'LR-50 Longshot', kind: 'sniper', price: 4750, auto: false,
    damage: 88, headMult: 4, range: 90, falloff: 0.85, fireInterval: 1.15,
    mag: 5, reserve: 15, reloadTime: 2.8, spread: 0.002, moveSpread: 0.05,
    recoil: 0.05, adsSpread: 0.0008, zoom: 2.2, tracer: 0x9fd8ff,
  },
  m12: {
    id: 'm12', name: 'M12 Breacher', kind: 'shotgun', price: 1700, auto: false,
    damage: 13, headMult: 3, range: 18, falloff: 0.25, fireInterval: 0.8,
    mag: 6, reserve: 24, reloadTime: 2.6, spread: 0.045, moveSpread: 0.05,
    recoil: 0.035, adsSpread: 0.03, zoom: 1.0, pellets: 8, tracer: 0xffd27d,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, radius: 7, damage: 110 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, radius: 5, duration: 14 },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, radius: 14 },
};

export const ARMOR_PRICE = 650;
export const KIT_PRICE = 400;

// One weapon instance: ammo, reload timer and heat (spread bloom while firing).
export function createWeaponState(id) {
  const def = WEAPONS[id];
  return {
    def, mag: def.mag, reserve: def.reserve,
    reloading: 0, cooldown: 0, heat: 0,
  };
}

// Spread for one shot: base, worse while moving or airborne, better aimed,
// worse as the gun heats up from sustained fire.
export function shotSpread(state, speed, crouched, aiming, airborne) {
  const def = state.def;
  let spread = aiming ? def.adsSpread : def.spread;
  spread += Math.min(1, speed / 6) * def.moveSpread;
  if (crouched) spread *= 0.7;
  if (airborne) spread *= 1.8;
  spread += state.heat * 0.02;
  return spread;
}

// Damage at a distance, with falloff past half the gun's range.
export function damageAt(def, distance, head, helmet) {
  const fall = distance > def.range * 0.5
    ? 1 - (1 - def.falloff) * Math.min(1, (distance - def.range * 0.5) / def.range)
    : 1;
  let damage = def.damage * fall;
  if (head) damage *= helmet ? def.headMult / 2 : def.headMult;
  return damage;
}
