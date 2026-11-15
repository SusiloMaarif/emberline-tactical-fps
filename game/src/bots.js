// Bots: nine teammates and opponents with one state machine each. A bot
// perceives through line of sight (raycast against the map, blocked by smoke)
// and hearing (gunshots and steps raise a noise event); it walks the waypoint
// graph toward its objective, holds angles at sites, rotates on sound or on
// the plant, and fires in bursts with aim error that grows with distance and
// target speed. Roles: entry, holder, rotator, carrier, planter, defuser.
import * as THREE from 'three';
import { TEAM_COLORS } from './palette.js';
import { SITES } from './map.js';
import { WAYPOINTS, nearestWaypoint, findRoute } from './nav.js';
import { resolveAABB, clampBounds } from './collide.js';
import { WEAPONS, damageAt } from './weapons.js';
import { range } from './rng.js';

const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.72;
const EYE = 1.55;
const WALK = 4.4;
const RUN = 5.4;

const NAMES_EMBER = ['Ash', 'Coal', 'Flint', 'Spark'];
const NAMES_SLATE = ['Gravel', 'Iron', 'Slate', 'Stone', 'Pebble'];

function makeMesh(scene, team) {
  const group = new THREE.Group();
  const color = TEAM_COLORS[team];
  const bodyMat = new THREE.MeshStandardMaterial({ color: team === 'ember' ? 0x7a4a28 : 0x3d565e, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.95, 10), bodyMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.5), accentMat);
  band.position.y = 1.9;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.6, 8), bodyMat);
  legs.position.y = 0.3;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.6 }));
  gun.position.set(0.28, 1.35, 0.3);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.42), accentMat);
  vest.position.y = 1.15;
  group.add(torso, head, band, legs, gun, vest);
  scene.add(group);
  return { group, head, torso };
}

export function createBots(scene, colliders, random) {
  const bots = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;

  function spawnBot(team, index, spawn, weaponId, role) {
    const mesh = makeMesh(scene, team);
    const bot = {
      team, name: team === 'ember' ? NAMES_EMBER[index] : NAMES_SLATE[index],
      weapon: WEAPONS[weaponId],
      role, health: 100, armor: team === 'slate' ? 50 : 0, helmet: false,
      alive: true, position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw, pitch: 0, speed: 0,
      route: [], routeIndex: 0, holdUntil: 0, target: null,
      kills: 0, deaths: 0,
      lastSeen: null, lastSeenAt: -99, lastHeard: null, lastHeardAt: -99,
      reactAt: 0, burstLeft: 0, burstPause: 0, cooldown: 0,
      plantProgress: 0, defuseProgress: 0, carrying: false,
      skill: range(random, 0.55, 0.95),
      mesh, velocity: new THREE.Vector3(),
    };
    mesh.group.position.copy(bot.position);
    bots.push(bot);
    return bot;
  }

  function collide(bot, dt) {
    const p = bot.position;
    p.x += bot.velocity.x * dt;
    p.z += bot.velocity.z * dt;
    resolveAABB(p, BOT_RADIUS, BOT_HEIGHT, colliders);
    clampBounds(p, BOT_RADIUS, -22, 22, -18, 18);
  }

  // Line of sight from a bot's eye to a point, against map meshes.
  function los(from, to, shootables, smokeBlocked) {
    if (smokeBlocked(from, to)) return false;
    const dir = new THREE.Vector3().copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    raycaster.set(from, dir.normalize());
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(shootables, false);
    return hits.length === 0;
  }

  function eyePos(bot, out) {
    return out.set(bot.position.x, EYE, bot.position.z);
  }

  function aimError(bot, targetPos, targetSpeed) {
    const dist = bot.position.distanceTo(targetPos);
    const base = 0.02 + dist * 0.0016 + targetSpeed * 0.006;
    return base * (1.35 - bot.skill * 0.7);
  }

  function moveToward(bot, tx, tz, dt, run) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) return true;
    const speed = run ? RUN : WALK;
    bot.velocity.x = (dx / dist) * speed;
    bot.velocity.z = (dz / dist) * speed;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.speed = speed;
    collide(bot, dt);
    return dist < 0.5;
  }

  function followRoute(bot, dt, run) {
    if (!bot.route.length) return true;
    const node = WAYPOINTS[bot.route[bot.routeIndex]];
    if (moveToward(bot, node.x, node.z, dt, run)) {
      bot.routeIndex += 1;
      if (bot.routeIndex >= bot.route.length) { bot.route = []; return true; }
    }
    return false;
  }

  function setRoute(bot, targetNode) {
    const from = nearestWaypoint(bot.position.x, bot.position.z);
    bot.route = findRoute(from, targetNode);
    bot.routeIndex = 0;
  }

  return {
    bots,
    spawnRound(emberSpawns, slateSpawns, carrierName) {
      bots.length = 0;
      const emberWeapons = ['ar77', 'ar77', 'vk9', 'm12', 'vk9'];
      const slateWeapons = ['ar77', 'ar77', 'vk9', 'lr50', 'm12'];
      emberSpawns.forEach((s, i) => {
        const b = spawnBot('ember', i, s, emberWeapons[i], i === 0 ? 'carrier' : 'entry');
        b.carrying = b.name === carrierName;
      });
      slateSpawns.forEach((s, i) => {
        spawnBot('slate', i, s, slateWeapons[i], i < 2 ? 'holdA' : i < 4 ? 'holdB' : 'mid');
      });
      // Holders start at their sites; the mid bot patrols the connector.
      for (const b of bots) {
        if (b.role === 'holdA') setRoute(b, 11);
        else if (b.role === 'holdB') setRoute(b, 12);
        else if (b.role === 'mid') setRoute(b, 16);
        else if (b.team === 'ember') setRoute(b, Math.random() < 0.5 ? 11 : 12);
      }
    },
    resetMeshes() {
      for (const b of bots) {
        b.mesh.group.visible = b.alive;
        b.mesh.group.position.copy(b.position);
      }
    },
    // One fixed step. Returns shot intents and objective events for main to resolve.
    step(dt, time, world) {
      const shots = [];
      const events = [];
      const { player, shootables, smokeBlocked, hearing } = world;
      const playerAlive = player.alive;

      for (const bot of bots) {
        if (!bot.alive) continue;
        bot.cooldown -= dt;
        bot.burstPause -= dt;
        const eye = eyePos(bot, new THREE.Vector3());

        // --- Perception: nearest visible enemy (player or opposing bot). ---
        let target = null;
        let targetPos = null;
        let targetSpeed = 0;
        const candidates = [];
        if (playerAlive && bot.team !== player.team) candidates.push({ kind: 'player', pos: new THREE.Vector3(player.position.x, player.position.y + 1.4, player.position.z), speed: player.speed || 0, ref: player });
        for (const other of bots) {
          if (!other.alive || other.team === bot.team) continue;
          candidates.push({ kind: 'bot', pos: new THREE.Vector3(other.position.x, 1.4, other.position.z), speed: other.speed, ref: other });
        }
        for (const c of candidates) {
          const dist = eye.distanceTo(c.pos);
          if (dist > 55) continue;
          // Field of view: 110 degrees around the bot's facing.
          const toTarget = new THREE.Vector3().copy(c.pos).sub(eye).normalize();
          const facing = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
          if (toTarget.dot(facing) < 0.25 && dist > 4) continue;
          if (!los(eye, c.pos, shootables, smokeBlocked)) continue;
          target = c;
          targetPos = c.pos;
          targetSpeed = c.speed;
          break;
        }
        if (target) {
          if (!bot.target) bot.reactAt = time + (0.25 + (1 - bot.skill) * 0.35);
          bot.target = target;
          bot.lastSeen = targetPos.clone();
          bot.lastSeenAt = time;
        } else if (bot.target && time - bot.lastSeenAt > 1.2) {
          bot.target = null;
        }

        // --- Hearing: a recent noise pulls a bot toward it. ---
        const heard = hearing.heardAt(bot.position.x, bot.position.z, time);
        if (heard) { bot.lastHeard = heard; bot.lastHeardAt = time; }

        // --- Combat: burst fire once reacted (only while the target is in view this step). ---
        if (bot.target && targetPos && time >= bot.reactAt && bot.burstPause <= 0) {
          if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(random() * 3); bot.burstPause = 0.45 + random() * 0.5; }
          if (bot.cooldown <= 0 && bot.burstLeft > 0) {
            bot.cooldown = bot.weapon.fireInterval * (bot.weapon.auto ? 1 : 1.4);
            bot.burstLeft -= 1;
            const err = aimError(bot, targetPos, targetSpeed);
            const dir = new THREE.Vector3().copy(targetPos).sub(eye).normalize();
            dir.x += (random() * 2 - 1) * err;
            dir.y += (random() * 2 - 1) * err * 0.7;
            dir.z += (random() * 2 - 1) * err;
            dir.normalize();
            const head = random() < 0.12;
            shots.push({ shooter: bot, origin: eye.clone(), direction: dir, weapon: bot.weapon, head, range: eye.distanceTo(targetPos) });
            bot.yaw = Math.atan2(-dir.x, -dir.z);
          }
        } else if (!bot.target) {
          bot.burstLeft = 0;
        }

        // --- Objective behaviour. ---
        const bomb = world.bomb;
        if (bot.team === 'ember' && bot.carrying && bomb.state === 'carried') {
          const site = bot.role === 'carrier' ? (bot.assignedSite || 'A') : 'A';
          const center = SITES[site].center;
          const dSite = Math.hypot(center.x - bot.position.x, center.z - bot.position.z);
          if (dSite < SITES[site].radius && !bot.target) {
            bot.plantProgress += dt;
            bot.velocity.set(0, 0, 0);
            bot.speed = 0;
            if (bot.plantProgress >= 3.5) events.push({ type: 'planted', by: bot, site });
          } else {
            bot.plantProgress = 0;
            if (!bot.route.length) setRoute(bot, site === 'A' ? 11 : 12);
            followRoute(bot, dt, true);
          }
        } else if (bot.team === 'slate' && bomb.state === 'planted') {
          const dBomb = Math.hypot(bomb.position.x - bot.position.x, bomb.position.z - bot.position.z);
          if (dBomb < 2.2 && !bot.target) {
            bot.defuseProgress += dt;
            bot.velocity.set(0, 0, 0);
            bot.speed = 0;
            if (bot.defuseProgress >= 5) events.push({ type: 'defused', by: bot });
          } else {
            bot.defuseProgress = 0;
            if (!bot.route.length) setRoute(bot, bomb.site === 'A' ? 11 : 12);
            followRoute(bot, dt, true);
          }
        } else if (bot.team === 'slate' && bomb.state === 'planted') {
          // unreachable: kept for clarity, defuse branch above handles it.
        } else if (bot.team === 'slate' && bot.lastHeard && time - bot.lastHeardAt < 2 && !bot.target) {
          // Rotate toward the noise.
          const node = nearestWaypoint(bot.lastHeard.x, bot.lastHeard.z);
          if (!bot.route.length) setRoute(bot, node);
          followRoute(bot, dt, true);
        } else if (!bot.target) {
          // Hold or push along the route; holders wait at their site.
          if (bot.route.length) {
            const done = followRoute(bot, dt, bot.team === 'ember');
            if (done && (bot.role === 'holdA' || bot.role === 'holdB')) {
              bot.holdUntil = time + 4;
              // Look down the lane the enemy comes from.
              bot.yaw += Math.sin(time * 0.5 + bot.position.x) * 0.002;
            }
          } else if (bot.team === 'ember') {
            setRoute(bot, random() < 0.5 ? 11 : 12);
          } else {
            bot.yaw += Math.sin(time * 0.4) * 0.001;
          }
        } else {
          // In a fight: strafe sideways a little, stay planted.
          bot.velocity.set(0, 0, 0);
          bot.speed = 0;
        }

        bot.mesh.group.position.copy(bot.position);
        bot.mesh.group.rotation.y = bot.yaw;
        // Aim the head/gun at the target when fighting.
        if (bot.target && targetPos) {
          const dy = targetPos.y - EYE;
          bot.pitch = Math.atan2(dy, Math.hypot(targetPos.x - bot.position.x, targetPos.z - bot.position.z));
        }
      }
      return { shots, events };
    },
    damage(bot, amount) {
      let rest = amount;
      if (bot.armor > 0) {
        const absorbed = Math.min(bot.armor, rest * 0.5);
        bot.armor -= absorbed;
        rest -= absorbed;
      }
      bot.health -= rest;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.deaths += 1;
        bot.mesh.group.visible = false;
        return true;
      }
      return false;
    },
    aliveCount(team) {
      return bots.filter((b) => b.alive && b.team === team).length;
    },
  };
}
