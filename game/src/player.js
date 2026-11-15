// Player body: a capsule approximated by a vertical AABB against the map's
// box colliders. Movement has acceleration and friction, so stopping to aim
// pays and strafing has weight; crouching lowers the eye and the spread.
import * as THREE from 'three';
import { MAP } from './map.js';

const GRAVITY = 22;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 11;
const JUMP_SPEED = 7.2;
const RADIUS = 0.38;
const HEIGHT = 1.72;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    airborne: false,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
    god: false, // capture mode only: the player cannot die in a ?shot= frame
    recoilPitch: 0,
    recoilYaw: 0,
  };

  function collideAxis(axis) {
    const p = state.position;
    const min = new THREE.Vector3(p.x - RADIUS, p.y, p.z - RADIUS);
    const max = new THREE.Vector3(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS);
    for (const box of colliders) {
      if (max.x <= box.min.x || min.x >= box.max.x) continue;
      if (max.y <= box.min.y || min.y >= box.max.y) continue;
      if (max.z <= box.min.z || min.z >= box.max.z) continue;
      if (axis === 0) {
        if (state.velocity.x > 0) p.x = box.min.x - RADIUS;
        else if (state.velocity.x < 0) p.x = box.max.x + RADIUS;
        state.velocity.x = 0;
      } else if (axis === 2) {
        if (state.velocity.z > 0) p.z = box.min.z - RADIUS;
        else if (state.velocity.z < 0) p.z = box.max.z + RADIUS;
        state.velocity.z = 0;
      } else {
        if (state.velocity.y > 0) p.y = box.min.y - HEIGHT;
        else if (state.velocity.y < 0) { p.y = box.max.y; state.airborne = false; }
        state.velocity.y = 0;
      }
      min.set(p.x - RADIUS, p.y, p.z - RADIUS);
      max.set(p.x + RADIUS, p.y + HEIGHT, p.z + RADIUS);
    }
  }

  return {
    state,
    reset(spawn) {
      state.position.set(spawn.x, 0, spawn.z);
      state.velocity.set(0, 0, 0);
      state.yaw = spawn.yaw;
      state.pitch = 0;
      state.health = 100;
      state.armor = 0;
      state.helmet = false;
      state.alive = true;
      state.crouched = false;
      state.eye = EYE_STAND;
    },
    look(dx, dy) {
      state.yaw -= dx * 0.0021;
      state.pitch -= dy * 0.0021;
      state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch));
    },
    recoil(pitch, yaw) {
      state.recoilPitch += pitch;
      state.recoilYaw += yaw;
    },
    step(dt, keys) {
      if (!state.alive) return;
      const crouched = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = crouched;
      const targetEye = crouched ? EYE_CROUCH : EYE_STAND;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);
      // Recoil decays back toward zero every step.
      state.recoilPitch *= Math.max(0, 1 - dt * 7);
      state.recoilYaw *= Math.max(0, 1 - dt * 7);

      const speed = crouched ? CROUCH_SPEED : WALK_SPEED;
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      let wx = -sin * forward + cos * strafe;
      let wz = -cos * forward - sin * strafe;
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
      state.velocity.x += wx * ACCEL * dt;
      state.velocity.z += wz * ACCEL * dt;
      const drag = Math.max(0, 1 - FRICTION * dt);
      if (len === 0) { state.velocity.x *= drag; state.velocity.z *= drag; }
      const hSpeed = Math.hypot(state.velocity.x, state.velocity.z);
      if (hSpeed > speed) {
        state.velocity.x *= speed / hSpeed;
        state.velocity.z *= speed / hSpeed;
      }
      if ((keys.has('Space')) && !state.airborne) {
        state.velocity.y = JUMP_SPEED;
        state.airborne = true;
      }
      state.velocity.y -= GRAVITY * dt;

      state.position.x += state.velocity.x * dt;
      collideAxis(0);
      state.position.z += state.velocity.z * dt;
      collideAxis(2);
      state.position.y += state.velocity.y * dt;
      collideAxis(1);
      state.position.x = Math.max(MAP.minX + RADIUS, Math.min(MAP.maxX - RADIUS, state.position.x));
      state.position.z = Math.max(MAP.minZ + RADIUS, Math.min(MAP.maxZ - RADIUS, state.position.z));
      if (state.position.y < 0) { state.position.y = 0; state.velocity.y = 0; state.airborne = false; }
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    // Damage through armor: armor absorbs half, losing a point per point absorbed.
    damage(amount) {
      if (state.god) return true;
      let rest = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, rest * 0.5);
        state.armor -= absorbed;
        rest -= absorbed;
      }
      state.health -= rest;
      if (state.health <= 0) { state.health = 0; state.alive = false; }
      return state.alive;
    },
    heal(amount) { state.health = Math.min(100, state.health + amount); },
  };
}
