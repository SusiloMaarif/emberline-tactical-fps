// Rounds: the match state machine. One round is freeze (buy) -> live ->
// planted (optional) -> end, then the next round. First to 7 rounds wins the
// match (max 13). The economy pays for kills, plants, defuses and round wins,
// with a loss-streak bonus, exactly like the genre: money between rounds buys
// weapons, armor and grenades in the buy menu.
export const WIN_ROUNDS = 7;
export const ROUND_TIME = 100;
export const FREEZE_TIME = 6;
export const PLANT_TIME = 40;
export const WIN_MONEY = 3250;
export const LOSS_MONEY = 1900;
export const LOSS_STREAK_BONUS = 500;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;
export const DEFUSE_MONEY = 300;

export function createRounds() {
  const state = {
    phase: 'freeze', // freeze | live | planted | over
    round: 1,
    score: { ember: 0, slate: 0 },
    timer: FREEZE_TIME,
    plantTimer: 0,
    lossStreak: 0,
    bomb: { state: 'carried', holder: 'player', site: null, position: { x: 0, z: 0 }, plantedAt: 0 },
    winner: null,
    matchWinner: null,
    reason: '',
  };

  return {
    state,
    startRound() {
      state.phase = 'freeze';
      state.timer = FREEZE_TIME;
      state.plantTimer = 0;
      state.winner = null;
      state.reason = '';
      state.bomb = { state: 'carried', holder: 'player', site: null, position: { x: 0, z: 0 }, plantedAt: 0 };
    },
    beginLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    plant(site, x, z) {
      state.bomb = { state: 'planted', holder: null, site, position: { x, z }, plantedAt: 0 };
      state.phase = 'planted';
      state.plantTimer = PLANT_TIME;
    },
    dropBomb(x, z) {
      if (state.bomb.state !== 'carried') return;
      state.bomb = { state: 'dropped', holder: null, site: null, position: { x, z }, plantedAt: 0 };
    },
    pickupBomb(holder) {
      if (state.bomb.state !== 'dropped') return false;
      state.bomb = { state: 'carried', holder, site: null, position: { x: 0, z: 0 }, plantedAt: 0 };
      return true;
    },
    // Returns 'ember' | 'slate' | null when the round ends this step.
    step(dt, alive) {
      if (state.phase === 'over') return null;
      if (state.phase === 'freeze') {
        state.timer -= dt;
        if (state.timer <= 0) { this.beginLive(); return 'live'; }
        return null;
      }
      if (state.phase === 'live') {
        state.timer -= dt;
        if (alive.slate === 0) return this.endRound('ember', 'Slate team eliminated');
        if (alive.ember === 0) return this.endRound('slate', 'Ember team eliminated');
        if (state.timer <= 0) return this.endRound('slate', 'Time expired — bomb never planted');
        return null;
      }
      // planted
      state.plantTimer -= dt;
      state.timer = state.plantTimer;
      if (alive.slate === 0 && state.bomb.state === 'planted') {
        // Defenders dead but the bomb still ticks: Ember wins on detonation.
      }
      if (alive.ember === 0 && state.bomb.state === 'planted') {
        // Attackers dead: Slate still has to defuse before the timer ends.
      }
      if (state.plantTimer <= 0) return this.endRound('ember', 'Bomb detonated at Site ' + state.bomb.site);
      return null;
    },
    endRound(winner, reason) {
      state.winner = winner;
      state.reason = reason;
      state.phase = 'over';
      if (winner === 'ember') {
        state.score.ember += 1;
        state.lossStreak = 0;
      } else {
        state.score.slate += 1;
        state.lossStreak += 1;
      }
      if (state.score.ember >= WIN_ROUNDS) state.matchWinner = 'ember';
      else if (state.score.slate >= WIN_ROUNDS) state.matchWinner = 'slate';
      else if (state.round >= 13) state.matchWinner = state.score.ember > state.score.slate ? 'ember' : state.score.slate > state.score.ember ? 'slate' : 'draw';
      return winner;
    },
    defuse() {
      state.bomb.state = 'defused';
      return this.endRound('slate', 'Bomb defused');
    },
    nextRound() {
      state.round += 1;
      this.startRound();
    },
    roundPayout(won) {
      return won ? WIN_MONEY : LOSS_MONEY + Math.min(2, state.lossStreak - (won ? 0 : 1)) * LOSS_STREAK_BONUS;
    },
  };
}
