// EMBERLINE — Cinderworks. Boot and the one loop: a fixed 60 Hz simulation
// feeding a render at the display's rate. ?shot=start|play|buy|end with
// &seed=N sets up a deterministic frame for a capture, renders it twice, then
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, range } from './rng.js';
import { createMap, SPAWNS, SITES } from './map.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createGrenades } from './grenade.js';
import { createBomb } from './bomb.js';
import { createViewmodel } from './viewmodel.js';
import { createHearing } from './hearing.js';
import { createRounds, KILL_MONEY, PLANT_MONEY, DEFUSE_MONEY } from './rounds.js';
import { createHud } from './hud.js';
import { WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE, createWeaponState, shotSpread, damageAt } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 72);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(map.colliders);
const input = createInput(renderer.domElement, onLockChange);
const botsApi = createBots(scene, map.colliders, random);
const combat = createCombat(scene, map.shootables, effects);
const grenadesApi = createGrenades(scene, map.shootables);
const hearing = createHearing();
const viewmodel = createViewmodel(camera);
const rounds = createRounds();

const raycaster = new THREE.Raycaster();
const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();

// --- Player loadout and economy (one place: the buy menu reads this too). ---
const loadout = {
  money: 800,
  weapons: ['p9'],
  current: 0,
  grenades: { frag: 0, smoke: 0, flash: 0 },
  selectedGrenade: 'frag',
  armor: 0,
  kit: false,
};
let weapon = createWeaponState('p9');
const weaponStates = { p9: weapon }; // per-weapon ammo persists across switches
let plantProgress = 0;
let prevFiring = false;
let flashBlind = 0;
let roundEndAt = -1;
let matchOver = false;
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let stepCount = 0;
let playerKills = 0;
let playerDeaths = 0;

const knownEnemies = new Map(); // name -> { x, z, at }
const playerView = {
  team: 'ember',
  position: player.state.position,
  get alive() { return player.state.alive; },
  get speed() { return player.groundSpeed(); },
};

// Bomb mesh: shown dropped or planted, blinking while armed.
const bombMesh = createBomb(scene);

function scoreRows() {
  const rows = botsApi.bots.map((b) => ({ name: b.name, team: b.team, kills: b.kills, deaths: b.deaths }));
  rows.push({ name: 'You', team: 'ember', kills: playerKills, deaths: playerDeaths });
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  return rows;
}

function currentWeaponDef() { return WEAPONS[loadout.weapons[loadout.current]]; }

function switchWeapon(index) {
  if (index < 0 || index >= loadout.weapons.length) return;
  weaponStates[loadout.weapons[loadout.current]] = weapon;
  loadout.current = index;
  const id = loadout.weapons[index];
  weapon = weaponStates[id] || createWeaponState(id);
  weaponStates[id] = weapon;
  viewmodel.setWeapon(weapon.def.kind);
  hud.setWeapon(weapon.def.name);
  hud.setAmmo(weapon.mag, weapon.reserve);
}

function bodiesFor(shooterKind, shooterRef) {
  const bodies = [];
  for (const b of botsApi.bots) {
    if (!b.alive || (shooterKind === 'bot' && b === shooterRef)) continue;
    if (shooterKind === 'bot' && b.team === shooterRef.team) continue; // no friendly fire
    bodies.push({
      kind: 'bot', ref: b, team: b.team,
      head: new THREE.Vector3(b.position.x, 1.78, b.position.z),
      chest: new THREE.Vector3(b.position.x, 1.2, b.position.z),
    });
  }
  if (player.state.alive && shooterKind !== 'player') {
    bodies.push({
      kind: 'player', ref: playerView, team: 'ember',
      head: new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye - 0.12, player.state.position.z),
      chest: new THREE.Vector3(player.state.position.x, player.state.position.y + 1.1, player.state.position.z),
    });
  }
  return bodies;
}

function addNoise(x, z, radius) {
  hearing.add(x, z, radius, elapsed);
}

function killfeedAndMoney(killerName, killerTeam, victimName, victimTeam, head) {
  hud.killfeed(killerName, victimName, head, killerTeam);
}

function applyKill(victimKind, victim, killerKind, killerRef, killerName, killerTeam, head) {
  const victimName = victimKind === 'player' ? 'You' : victim.name;
  killfeedAndMoney(killerName, killerTeam, victimName, victimKind === 'player' ? 'ember' : victim.team, head);
  if (killerKind === 'player') playerKills += 1;
  else if (killerKind === 'bot' && killerRef) killerRef.kills += 1;
  if (victimKind === 'player') playerDeaths += 1; // bot deaths are counted in bots.damage()
  if (killerKind === 'player') {
    loadout.money += KILL_MONEY;
    hud.setMoney(loadout.money);
    audio.kill();
  }
  if (victimKind === 'player') {
    audio.hurt();
    hud.damageFlash();
    if (rounds.state.bomb.holder === 'player') {
      rounds.dropBomb(player.state.position.x, player.state.position.z);
      bombMesh.place(player.state.position.x, player.state.position.z);
    }
  }
}

function resolveShot(origin, dir, weaponDef, shooterKind, shooterRef, shooterName, shooterTeam) {
  const result = combat.shoot(origin, dir, weaponDef, bodiesFor(shooterKind, shooterRef));
  const end = result ? result.point : new THREE.Vector3().copy(origin).addScaledVector(dir, 90);
  effects.tracer(origin, end, weaponDef.tracer);
  if (!result) return;
  if (result.hit) {
    const target = result.hit;
    const head = result.part === 'head';
    const dmg = damageAt(weaponDef, result.distance, head, target.kind === 'bot' ? target.ref.helmet : player.state.helmet);
    let died = false;
    if (target.kind === 'player') {
      died = !player.damage(dmg);
      audio.hurt();
      hud.damageFlash();
    } else {
      died = botsApi.damage(target.ref, dmg);
    }
    if (shooterKind === 'player') {
      hud.hitMarker(died);
      audio.hit(head);
    }
    if (died) applyKill(target.kind, target.ref, shooterKind, shooterRef, shooterName, shooterTeam, head);
  } else if (result.part === 'wall') {
    effects.impact(result.point, result.normal || new THREE.Vector3(0, 1, 0));
  }
}

function playerShoot() {
  if (weapon.reloading > 0 || weapon.cooldown > 0) return;
  if (weapon.mag <= 0) { audio.dryFire(); weapon.cooldown = 0.25; return; }
  weapon.mag -= 1;
  weapon.cooldown = weapon.def.fireInterval;
  weapon.heat = Math.min(1, weapon.heat + 0.12);
  const spread = shotSpread(weapon, player.groundSpeed(), player.state.crouched, input.state.aiming, player.state.airborne);
  camera.getWorldDirection(direction);
  const pellets = weapon.def.pellets || 1;
  for (let i = 0; i < pellets; i += 1) {
    const d = direction.clone();
    d.x += (random() * 2 - 1) * spread;
    d.y += (random() * 2 - 1) * spread;
    d.z += (random() * 2 - 1) * spread;
    d.normalize();
    resolveShot(camera.position.clone(), d, weapon.def, 'player', null, 'You', 'ember');
  }
  eyePos.copy(camera.position).addScaledVector(direction, 0.7);
  effects.muzzleFlash(eyePos);
  viewmodel.fire();
  audio.shot(weapon.def.kind, 0);
  addNoise(player.state.position.x, player.state.position.z, 26);
  player.recoil(weapon.def.recoil * (0.8 + random() * 0.5), (random() * 2 - 1) * weapon.def.recoil * 0.5);
  hud.setAmmo(weapon.mag, weapon.reserve);
}

function throwSelectedGrenade() {
  const kind = loadout.selectedGrenade;
  if (loadout.grenades[kind] <= 0) { audio.denied(); return; }
  loadout.grenades[kind] -= 1;
  camera.getWorldDirection(direction);
  eyePos.copy(camera.position).addScaledVector(direction, 0.6);
  grenadesApi.throwGrenade(kind, eyePos, direction);
  audio.grenadePin();
  hud.setGrenades([
    { icon: '◉', count: loadout.grenades.frag },
    { icon: '☁', count: loadout.grenades.smoke },
    { icon: '✦', count: loadout.grenades.flash },
  ]);
}

function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (Math.hypot(x - s.center.x, z - s.center.z) < s.radius) return key;
  }
  return null;
}

function startRound() {
  rounds.startRound();
  grenadesApi.clear();
  hud.hideScoreboard();
  plantProgress = 0;
  roundEndAt = -1;
  // Respawn the player and the bots; refill owned weapons.
  player.reset(SPAWNS.ember[4]);
  player.state.armor = loadout.armor || 0;
  player.state.helmet = !!loadout.armor;
  botsApi.spawnRound(SPAWNS.ember.slice(0, 4), SPAWNS.slate, null);
  // Player spawns at the back; teammates take the other four spots.
  botsApi.bots.filter((b) => b.team === 'ember').forEach((b, i) => {
    const s = SPAWNS.ember[i];
    b.position.set(s.x, 0, s.z);
    b.yaw = s.yaw;
    b.mesh.group.position.copy(b.position);
  });
  for (const id of loadout.weapons) weaponStates[id] = createWeaponState(id);
  weapon = weaponStates[loadout.weapons[loadout.current]];
  viewmodel.setWeapon(weapon.def.kind);
  bombMesh.hide();
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(weapon.mag, weapon.reserve);
  hud.setWeapon(weapon.def.name);
  hud.setMoney(loadout.money);
  hud.setScore(rounds.state.score);
  hud.setTimer(rounds.state.timer, false);
  hud.setObjective('Plant the charge at Site A or B, or eliminate the Slate team.');
  hud.setBomb('BOMB — you are carrying it', false);
  hud.setAlive(5, 5);
  hud.setGrenades([
    { icon: '◉', count: loadout.grenades.frag },
    { icon: '☁', count: loadout.grenades.smoke },
    { icon: '✦', count: loadout.grenades.flash },
  ]);
  document.getElementById('round-label').textContent = `ROUND ${rounds.state.round}`;
  if (!shot) hud.banner(`Round ${rounds.state.round}`, 'Buy phase — press B to open the buy menu', 2600);
  audio.roundStart();
}

function endRoundUI(winner) {
  const won = winner === 'ember';
  const payout = rounds.roundPayout(won);
  loadout.money += payout;
  hud.setMoney(loadout.money);
  hud.setScore(rounds.state.score);
  hud.showScoreboard(scoreRows(), rounds.state.score);
  hud.banner(
    won ? 'Round won' : 'Round lost',
    `${rounds.state.reason} · +$${payout}`,
    3600,
  );
  if (won) audio.roundWin(); else audio.roundLose();
  if (rounds.state.matchWinner) {
    matchOver = true;
    roundEndAt = elapsed + 4;
  } else {
    roundEndAt = elapsed + 4.5;
  }
}

function onBuy(id) {
  if (id.startsWith('grenade:')) {
    const kind = id.slice(8);
    const price = GRENADES[kind].price;
    if (loadout.money < price) { audio.denied(); return; }
    loadout.money -= price;
    loadout.grenades[kind] += 1;
    loadout.selectedGrenade = kind;
  } else if (id === 'armor') {
    if (loadout.money < ARMOR_PRICE || loadout.armor) { audio.denied(); return; }
    loadout.money -= ARMOR_PRICE;
    loadout.armor = 100;
    player.state.armor = 100;
    player.state.helmet = true;
    hud.setHealth(player.state.health, 100);
  } else if (id === 'kit') {
    if (loadout.money < KIT_PRICE || loadout.kit) { audio.denied(); return; }
    loadout.money -= KIT_PRICE;
    loadout.kit = true;
  } else {
    const def = WEAPONS[id];
    if (!def || loadout.money < def.price || loadout.weapons.includes(id)) { audio.denied(); return; }
    loadout.money -= def.price;
    loadout.weapons.push(id);
    switchWeapon(loadout.weapons.length - 1);
  }
  audio.buy();
  hud.setMoney(loadout.money);
  hud.setGrenades([
    { icon: '◉', count: loadout.grenades.frag },
    { icon: '☁', count: loadout.grenades.smoke },
    { icon: '✦', count: loadout.grenades.flash },
  ]);
  hud.buildBuy({ money: loadout.money, weapons: loadout.weapons, grenades: loadout.grenades, armor: loadout.armor || 0, kit: loadout.kit }, onBuy);
}

function syncCamera() {
  if (!player.state.alive) {
    const mate = botsApi.bots.find((b) => b.alive && b.team === 'ember');
    if (mate) {
      camera.position.set(mate.position.x, mate.position.y + 1.55, mate.position.z);
      camera.rotation.set(mate.pitch || 0, mate.yaw, 0, 'YXZ');
      return;
    }
  }
  const targetFov = input.state.aiming ? 74 / weapon.def.zoom : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(
    player.state.pitch + player.state.recoilPitch,
    player.state.yaw + player.state.recoilYaw,
    0, 'YXZ',
  );
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const phase = rounds.state.phase;

  // Round timer and phase transitions.
  if (phase !== 'over' && !matchOver) {
    const result = rounds.step(dt, {
      ember: (player.state.alive ? 1 : 0) + botsApi.aliveCount('ember'),
      slate: botsApi.aliveCount('slate'),
    });
    if (result === 'live') hud.setObjective('Plant the charge at Site A or B, or eliminate the Slate team.');
    else if (typeof result === 'string' && result !== 'live') endRoundUI(result);
  }

  // Match / round flow after the banner.
  if (roundEndAt > 0 && elapsed >= roundEndAt) {
    roundEndAt = -1;
    if (matchOver) {
      hud.showOverlay('match', rounds.state.score);
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      rounds.nextRound();
      startRound();
    }
  }

  const live = phase === 'live' || phase === 'planted';
  if (live && player.state.alive) {
    player.step(dt, input.state.keys);
    const look = input.takeLook();
    player.look(look.x, look.y);
  } else {
    input.takeLook();
  }

  // Weapon switching, reload, fire.
  if (live && player.state.alive && !hud.isBuyOpen()) {
    for (let i = 0; i < 5; i += 1) {
      if (input.consume(`Digit${i + 1}`)) switchWeapon(i);
    }
    if (input.consume('Digit6')) loadout.selectedGrenade = 'frag';
    if (input.consume('Digit7')) loadout.selectedGrenade = 'smoke';
    if (input.consume('Digit8')) loadout.selectedGrenade = 'flash';
    if (input.consume('KeyG')) throwSelectedGrenade();
    if (input.consume('KeyR') && weapon.mag < weapon.def.mag && weapon.reserve > 0 && weapon.reloading <= 0) {
      weapon.reloading = weapon.def.reloadTime;
      audio.reload();
    }
    const firing = input.state.firing;
    const edge = firing && !prevFiring;
    if (firing && (weapon.def.auto || edge) && weapon.reloading <= 0) playerShoot();
    prevFiring = firing;
  }
  if (weapon.reloading > 0) {
    weapon.reloading -= dt;
    if (weapon.reloading <= 0) {
      const need = weapon.def.mag - weapon.mag;
      const take = Math.min(need, weapon.reserve);
      weapon.mag += take;
      weapon.reserve -= take;
      hud.setAmmo(weapon.mag, weapon.reserve);
    }
  }
  if (weapon.cooldown > 0) weapon.cooldown -= dt;
  weapon.heat = Math.max(0, weapon.heat - dt * 0.55);

  // Buy menu toggle (freeze phase only, or any time before the round starts).
  if (input.consume('KeyB')) {
    if (hud.isBuyOpen()) {
      hud.hideBuy();
      if (started && !shot) input.requestLock();
    } else if (phase === 'freeze') {
      hud.buildBuy({ money: loadout.money, weapons: loadout.weapons, grenades: loadout.grenades, armor: loadout.armor || 0, kit: loadout.kit }, onBuy);
      input.releaseLock();
    }
  }

  // Planting: hold E inside a site while carrying the bomb.
  const bomb = rounds.state.bomb;
  if (live && player.state.alive && bomb.state === 'carried' && bomb.holder === 'player' && input.state.keys.has('KeyE')) {
    const site = siteAt(player.state.position.x, player.state.position.z);
    if (site) {
      plantProgress += dt;
      hud.setBomb(`PLANTING… ${Math.ceil(3.5 - plantProgress)}s`, false);
      if (plantProgress >= 3.5) {
        rounds.plant(site, player.state.position.x, player.state.position.z);
        loadout.money += PLANT_MONEY;
        hud.setMoney(loadout.money);
        bombMesh.place(player.state.position.x, player.state.position.z);
        hud.setBomb(`BOMB PLANTED — Site ${site}`, true);
        hud.setObjective(`Bomb planted at Site ${site}. Defend it until it detonates.`);
        audio.plantBeep();
        addNoise(player.state.position.x, player.state.position.z, 30);
      }
    } else plantProgress = 0;
  } else if (bomb.state === 'carried' && bomb.holder === 'player') {
    plantProgress = Math.max(0, plantProgress - dt * 2);
    hud.setBomb('BOMB — you are carrying it', false);
  }

  // Pick up a dropped bomb by walking over it; teammates do the same.
  if (bomb.state === 'dropped') {
    const d = Math.hypot(player.state.position.x - bomb.position.x, player.state.position.z - bomb.position.z);
    if (player.state.alive && d < 1.2) {
      rounds.pickupBomb('player');
      bombMesh.hide();
      hud.setBomb('BOMB — you are carrying it', false);
    } else {
      for (const b of botsApi.bots) {
        if (!b.alive || b.team !== 'ember') continue;
        if (Math.hypot(b.position.x - bomb.position.x, b.position.z - bomb.position.z) < 1.2) {
          rounds.pickupBomb('bot');
          b.carrying = true;
          b.assignedSite = siteAt(b.position.x, b.position.z) || 'A';
          bombMesh.hide();
          hud.setBomb('BOMB — a teammate is carrying it', false);
          break;
        }
      }
    }
  }

  // Bots: only during live play.
  if (live) {
    const { shots, events } = botsApi.step(dt, elapsed, {
      player: playerView, shootables: map.shootables,
      smokeBlocked: (a, b) => effects.blockedBySmoke(a, b),
      hearing, bomb: rounds.state.bomb,
    });
    for (const s of shots) {
      resolveShot(s.origin, s.direction, s.weapon, 'bot', s.shooter, s.shooter.name, s.shooter.team);
      const dist = s.origin.distanceTo(camera.position);
      audio.shot(s.weapon.kind, dist);
      addNoise(s.shooter.position.x, s.shooter.position.z, 26);
    }
    for (const e of events) {
      if (e.type === 'planted') {
        rounds.plant(e.site, e.by.position.x, e.by.position.z);
        e.by.carrying = false;
        bombMesh.place(e.by.position.x, e.by.position.z);
        hud.setBomb(`BOMB PLANTED — Site ${e.site}`, true);
        hud.banner('Bomb planted', `Site ${e.site} — defend it`, 2600);
        audio.plantBeep();
      } else if (e.type === 'defused') {
        rounds.defuse();
        loadout.money += 0;
        endRoundUI('slate');
        hud.setBomb('', false);
        bombMesh.hide();
      }
    }
  }

  // Grenades.
  const gEvents = grenadesApi.stepGrenades(dt, map.colliders);
  for (const g of gEvents) {
    if (g.type === 'frag') {
      effects.explosion(g.position);
      audio.explosion(g.position.distanceTo(camera.position));
      addNoise(g.position.x, g.position.z, 40);
      const bodies = bodiesFor('grenade', null);
      for (const hit of grenadesApi.fragDamage(g.position, GRENADES.frag.radius, bodies)) {
        let died = false;
        if (hit.body.kind === 'player') died = !player.damage(hit.damage);
        else died = botsApi.damage(hit.body.ref, hit.damage);
        if (died) applyKill(hit.body.kind, hit.body.ref, 'grenade', null, 'Frag', 'ember', false);
      }
    } else if (g.type === 'smoke') {
      effects.smoke(g.position);
    } else if (g.type === 'flash') {
      effects.flashAt(g.position);
      eyePos.copy(camera.position);
      const strength = grenadesApi.flashStrength(g.position, eyePos, player.state.yaw, player.state.pitch);
      if (strength > 0.05) {
        flashBlind = Math.max(flashBlind, strength);
        hud.flashBlind(strength);
      }
      for (const b of botsApi.bots) {
        if (!b.alive) continue;
        const s = grenadesApi.flashStrength(g.position, new THREE.Vector3(b.position.x, 1.55, b.position.z), b.yaw, 0);
        if (s > 0.6) { b.target = null; b.reactAt = elapsed + 2; }
      }
    }
  }
  if (flashBlind > 0) flashBlind = Math.max(0, flashBlind - dt * 0.45);

  // Bomb beeps while planted; blink the bomb light.
  if (rounds.state.bomb.state === 'planted') {
    bombMesh.blink(elapsed);
    if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.bombBeep(rounds.state.plantTimer < 10);
  }

  // HUD refresh.
  hud.setHealth(player.state.health, player.state.armor);
  hud.setTimer(rounds.state.phase === 'planted' ? rounds.state.plantTimer : rounds.state.timer, rounds.state.phase === 'planted');
  hud.setAlive((player.state.alive ? 1 : 0) + botsApi.aliveCount('ember'), botsApi.aliveCount('slate'));
  const spreadPx = 4 + (weapon.heat * 14) + player.groundSpeed() * 1.6;
  hud.setCrosshairSpread(Math.min(26, spreadPx));

  // Minimap: enemies only where the player has recently seen them.
  for (const b of botsApi.bots) {
    if (!b.alive || b.team !== 'slate') continue;
    const toBot = new THREE.Vector3(b.position.x, 1.4, b.position.z);
    const eye = new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    const dist = eye.distanceTo(toBot);
    if (dist < 48) {
      raycaster.set(eye, new THREE.Vector3().copy(toBot).sub(eye).normalize());
      raycaster.far = dist;
      if (raycaster.intersectObjects(map.shootables, false).length === 0) {
        knownEnemies.set(b.name, { x: b.position.x, z: b.position.z, at: elapsed });
      }
    }
  }
  const freshEnemies = [];
  for (const [name, e] of knownEnemies) {
    if (elapsed - e.at < 4) freshEnemies.push(e);
    else knownEnemies.delete(name);
  }
  const mates = botsApi.bots.filter((b) => b.alive && b.team === 'ember').map((b) => ({ x: b.position.x, z: b.position.z }));
  hud.drawMinimap(map, player.state.position, player.state.yaw, mates, freshEnemies);

  effects.step(dt);
  viewmodel.update(dt, player.groundSpeed(), input.state.aiming);
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  started = true;
  player.state.god = true; // a capture frame never ends with the player dead
  if (name === 'start') {
    startRound();
    player.state.position.set(0, 0, 14);
    player.state.yaw = Math.PI;
    player.state.pitch = 0.02;
    settle(20);
    hud.showOverlay('start', rounds.state.score);
    syncCamera();
  } else if (name === 'buy') {
    startRound();
    player.state.position.set(-2, 0, 13);
    player.state.yaw = Math.PI + 0.35;
    settle(20);
    hud.buildBuy({ money: 4250, weapons: loadout.weapons, grenades: loadout.grenades, armor: 0, kit: false }, onBuy);
    syncCamera();
  } else if (name === 'play') {
    // Show the loadout systems in the HUD: kevlar on, one frag carried.
    loadout.armor = 50;
    loadout.grenades.frag = 1;
    startRound();
    rounds.beginLive();
    // Down B-long: the player, a teammate on the flank, and a Slate holder
    // in the open, so the frame shows a real firefight.
    player.state.position.set(17, 0, 10);
    settle(30);
    const target = botsApi.bots.find((b) => b.alive && b.team === 'slate');
    const mate = botsApi.bots.find((b) => b.alive && b.team === 'ember');
    if (target) {
      target.position.set(17, 0, -2);
      target.mesh.group.position.copy(target.position);
      if (mate) { mate.position.set(14, 0, 5); mate.mesh.group.position.copy(mate.position); }
      const dx = target.position.x - player.state.position.x;
      const dz = target.position.z - player.state.position.z;
      player.state.yaw = Math.atan2(-dx, -dz);
      player.state.pitch = 0.02;
      settle(10);
      loadout.weapons = ['ar77', 'p9'];
      loadout.current = 0;
      weapon = createWeaponState('ar77');
      weaponStates.ar77 = weapon;
      viewmodel.setWeapon('rifle');
      hud.setWeapon(weapon.def.name);
      for (let i = 0; i < 4; i += 1) { playerShoot(); settle(6); }
      settle(20);
    }
    syncCamera();
  } else { // end
    startRound();
    rounds.beginLive();
    rounds.plant('A', -16, -9);
    bombMesh.place(-16, -9);
    hud.setBomb('BOMB PLANTED — Site A', true);
    effects.smoke(new THREE.Vector3(-14, 1, -7));
    player.state.position.set(-13, 0, -1);
    const dx = -16 - player.state.position.x;
    const dz = -9 - player.state.position.z;
    player.state.yaw = Math.atan2(-dx, -dz);
    player.state.pitch = 0.05;
    settle(40);
    hud.banner('Round won', 'Bomb detonated at Site A · +$3250', 60000); // long hold: the capture may take seconds to paint
    hud.setScore({ ember: 1, slate: 0 });
    hud.showScoreboard(scoreRows(), { ember: 1, slate: 0 });
    syncCamera();
  }
  hud.setScore(rounds.state.score);
  hud.setAmmo(weapon.mag, weapon.reserve);
  paintTwiceThenReady();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (started && !hud.isBuyOpen() && !matchOver) {
    hud.showOverlay('paused', rounds.state.score);
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (matchOver) {
    matchOver = false;
    loadout.money = 800;
    loadout.weapons = ['p9'];
    loadout.current = 0;
    loadout.grenades = { frag: 0, smoke: 0, flash: 0 };
    loadout.armor = 0;
    playerKills = 0;
    playerDeaths = 0;
    rounds.state.round = 1;
    rounds.state.score = { ember: 0, slate: 0 };
    rounds.state.matchWinner = null;
    startRound();
  }
  input.requestLock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// First round, before the player clicks Play.
startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
