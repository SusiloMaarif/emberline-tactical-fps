// HUD: every DOM readout the player sees — health and armor bars, ammo,
// money, round timer and score, alive counts, killfeed, crosshair spread,
// damage vignette, minimap, buy menu and round banners. The minimap draws the
// map walls, the sites, teammates (orange) and enemies only at their last
// known position (teal outline), never live through walls.
import { WEAPONS, GRENADES, ARMOR_PRICE, KIT_PRICE } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    health: $('health-value'), healthBar: $('health-bar'), armor: $('armor-value'),
    money: $('money-value'), timer: $('timer-value'), scoreEmber: $('score-ember'),
    scoreSlate: $('score-slate'), aliveEmber: $('alive-ember'), aliveSlate: $('alive-slate'),
    killfeed: $('killfeed'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    vignette: $('vignette'), flash: $('flash'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    buy: $('buy'), buyGrid: $('buy-grid'), bomb: $('bomb-status'),
    weaponName: $('weapon-name'), minimap: $('minimap'),
    objective: $('objective'), grenades: $('grenade-slots'),
  };
  const mapCtx = els.minimap ? els.minimap.getContext('2d') : null;
  let hitTimer = null;
  let bannerTimer = null;

  function showOverlay(kind, score) {
    els.overlay.hidden = false;
    if (kind === 'start') {
      els.overlayTitle.textContent = 'EMBERLINE — Cinderworks';
      els.overlayCopy.textContent = 'Round-based tactical FPS. Plant the charge at Site A or B, or eliminate the Slate team. Click to play.';
      els.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'Paused';
      els.overlayCopy.textContent = 'Click to resume the round.';
      els.play.textContent = 'Resume';
    } else if (kind === 'end') {
      els.overlayTitle.textContent = 'Round over';
      els.overlayCopy.textContent = `Score ${score.ember} — ${score.slate}. Click to play the next round.`;
      els.play.textContent = 'Next round';
    } else if (kind === 'match') {
      els.overlayTitle.textContent = score.ember > score.slate ? 'Ember wins the match' : score.slate > score.ember ? 'Slate wins the match' : 'Match drawn';
      els.overlayCopy.textContent = `Final score ${score.ember} — ${score.slate}. Thanks for playing Cinderworks.`;
      els.play.textContent = 'Play again';
    }
  }

  return {
    setHealth(health, armor) {
      els.health.textContent = Math.ceil(health);
      els.healthBar.style.width = `${Math.max(0, health)}%`;
      els.healthBar.style.background = health > 50 ? '#7ddc7d' : health > 25 ? '#f0a830' : '#ff3b30';
      els.armor.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setAmmo(mag, reserve) {
      els.ammoMag.textContent = mag;
      els.ammoReserve.textContent = `/ ${reserve}`;
    },
    setWeapon(name) { els.weaponName.textContent = name; },
    setMoney(money) { els.money.textContent = `$${money}`; },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      els.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      els.timer.style.color = planted ? '#ff3b30' : s <= 10 ? '#f0a830' : '#ece5d8';
    },
    setScore(score) {
      els.scoreEmber.textContent = score.ember;
      els.scoreSlate.textContent = score.slate;
    },
    setAlive(ember, slate) {
      els.aliveEmber.textContent = ember;
      els.aliveSlate.textContent = slate;
    },
    setObjective(text) { els.objective.textContent = text; },
    setBomb(text, planted) {
      els.bomb.textContent = text;
      els.bomb.style.color = planted ? '#ff3b30' : '#ece5d8';
    },
    setGrenades(list) {
      els.grenades.textContent = list.map((g) => `${g.icon} ${g.count}`).join('  ');
    },
    hitMarker(kill) {
      els.hitmarker.classList.add('on');
      els.hitmarker.style.color = kill ? '#ff3b30' : '#f0a830';
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on'), kill ? 220 : 110);
    },
    damageFlash() {
      els.vignette.style.opacity = '0.85';
      setTimeout(() => { els.vignette.style.opacity = '0'; }, 180);
    },
    flashBlind(strength) {
      els.flash.style.opacity = String(Math.min(1, strength));
      if (strength > 0) setTimeout(() => { els.flash.style.opacity = '0'; }, Math.max(200, strength * 1200));
    },
    setCrosshairSpread(px) {
      els.crosshair.style.setProperty('--gap', `${px}px`);
    },
    killfeed(killer, victim, head, killerTeam) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="${killerTeam === 'ember' ? 't-ember' : 't-slate'}">${killer}</span> ${head ? '◉' : '✕'} <span class="${killerTeam === 'ember' ? 't-slate' : 't-ember'}">${victim}</span>`;
      els.killfeed.prepend(row);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    },
    banner(title, sub, ms = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub;
      els.banner.hidden = false;
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { els.banner.hidden = true; }, ms);
    },
    hideBanner() { els.banner.hidden = true; },
    showOverlay,
    hideOverlay() { els.overlay.hidden = true; },
    onPlay(fn) { els.play.addEventListener('click', fn); },
    // Buy menu: built from the weapon table, so prices never drift from the game.
    buildBuy(state, onBuy) {
      const items = [];
      for (const w of Object.values(WEAPONS)) {
        items.push({ id: w.id, label: `${w.name} — $${w.price}`, afford: state.money >= w.price, owned: state.weapons.includes(w.id) });
      }
      for (const g of Object.values(GRENADES)) {
        items.push({ id: `grenade:${g.id}`, label: `${g.name} — $${g.price} (x${state.grenades[g.id] || 0})`, afford: state.money >= g.price, owned: false });
      }
      items.push({ id: 'armor', label: `Kevlar + Helmet — $${ARMOR_PRICE}`, afford: state.money >= ARMOR_PRICE, owned: state.armor > 0 });
      items.push({ id: 'kit', label: `Defuse Kit — $${KIT_PRICE}`, afford: state.money >= KIT_PRICE, owned: state.kit });
      els.buyGrid.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.textContent = item.label + (item.owned ? ' ✓' : '');
        button.disabled = !item.afford;
        button.addEventListener('click', () => onBuy(item.id));
        els.buyGrid.appendChild(button);
      }
      els.buy.hidden = false;
    },
    hideBuy() { els.buy.hidden = true; },
    isBuyOpen() { return !els.buy.hidden; },
    // Minimap: walls, sites, teammates live, enemies at last known spots.
    drawMinimap(map, playerPos, playerYaw, teammates, knownEnemies) {
      if (!mapCtx) return;
      const c = mapCtx;
      const W = 150;
      const H = 124;
      const sx = (x) => ((x + 22) / 44) * W;
      const sz = (z) => ((z + 18) / 36) * H;
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(20,18,16,0.85)';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#4a423a';
      c.lineWidth = 2;
      c.strokeRect(1, 1, W - 2, H - 2);
      // Site zones.
      c.fillStyle = 'rgba(255,122,26,0.25)';
      c.fillRect(sx(-19.5), sz(-13.5), sx(-12.5) - sx(-19.5), sz(-4.5) - sz(-13.5));
      c.fillStyle = 'rgba(55,200,195,0.25)';
      c.fillRect(sx(12.5), sz(-13.5), sx(19.5) - sx(12.5), sz(-4.5) - sz(-13.5));
      c.fillStyle = '#ff7a1a';
      c.font = 'bold 11px sans-serif';
      c.fillText('A', sx(-16.6), sz(-8.6));
      c.fillStyle = '#37c8c3';
      c.fillText('B', sx(15.4), sz(-8.6));
      // Cover blocks (approximate from the map's big boxes).
      c.fillStyle = '#4a423a';
      const blocks = [
        [-20.5, -12.2, -18.5, -9.8], [-14.6, -12.4, -12.4, -10.6], [17.4, 19.6, -14.1, -11.9],
        [-1.5, 1.5, -1.5, 1.5], [-9.8, -6.2, 8.3, 9.7], [6.2, 9.8, 8.3, 9.7], [-2.4, 2.4, -16.3, -14.7],
      ];
      for (const [x0, x1, z0, z1] of blocks) c.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
      // Enemies at last known position (hollow teal).
      c.strokeStyle = '#37c8c3';
      for (const e of knownEnemies) {
        c.beginPath();
        c.arc(sx(e.x), sz(e.z), 4, 0, Math.PI * 2);
        c.stroke();
      }
      // Teammates (orange dots) and the player (white triangle, rotated).
      c.fillStyle = '#ff7a1a';
      for (const t of teammates) {
        c.beginPath();
        c.arc(sx(t.x), sz(t.z), 3.5, 0, Math.PI * 2);
        c.fill();
      }
      c.save();
      c.translate(sx(playerPos.x), sz(playerPos.z));
      c.rotate(Math.atan2(-Math.sin(playerYaw), -Math.cos(playerYaw)) + Math.PI / 2);
      c.fillStyle = '#ece5d8';
      c.beginPath();
      c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath();
      c.fill();
      c.restore();
    },
  };
}
