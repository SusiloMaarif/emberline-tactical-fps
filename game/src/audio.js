// Sound: every effect is synthesised with WebAudio, so the game ships no audio
// files and makes no network request. A shot is a short noise burst through a
// low-pass filter plus a click; the plant is a beep train; the explosion is
// filtered noise with a long decay. Volume follows distance for bot shots.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(duration) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.12, freq = 1800, gain = 0.5, type = 'lowpass', when = 0 }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone({ freq = 880, duration = 0.08, gain = 0.25, type = 'square', when = 0, slide = 0 }) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // distance in metres from the listener; 0 is point-blank.
  function attenuation(distance) {
    return Math.max(0.08, 1 / (1 + distance * 0.09));
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') void ctx.resume(); },
    toggleMute() { muted = !muted; return muted; },
    shot(kind, distance = 0) {
      const a = attenuation(distance);
      if (kind === 'rifle') { burst({ duration: 0.14, freq: 1400, gain: 0.55 * a }); tone({ freq: 160, duration: 0.09, gain: 0.3 * a, type: 'sawtooth', slide: -90 }); }
      else if (kind === 'sniper') { burst({ duration: 0.3, freq: 900, gain: 0.7 * a }); tone({ freq: 110, duration: 0.2, gain: 0.35 * a, type: 'sawtooth', slide: -60 }); }
      else if (kind === 'shotgun') { burst({ duration: 0.2, freq: 700, gain: 0.65 * a }); }
      else if (kind === 'smg') { burst({ duration: 0.09, freq: 2100, gain: 0.4 * a }); }
      else { burst({ duration: 0.1, freq: 2400, gain: 0.42 * a }); } // pistol
    },
    dryFire() { tone({ freq: 1200, duration: 0.03, gain: 0.15, type: 'square' }); },
    reload() { tone({ freq: 500, duration: 0.04, gain: 0.18 }); tone({ freq: 700, duration: 0.04, gain: 0.18, when: 0.18 }); tone({ freq: 900, duration: 0.04, gain: 0.2, when: 0.45 }); },
    hit(head) { tone({ freq: head ? 1500 : 1100, duration: 0.05, gain: 0.22 }); },
    kill() { tone({ freq: 660, duration: 0.07, gain: 0.22 }); tone({ freq: 990, duration: 0.1, gain: 0.22, when: 0.08 }); },
    hurt() { tone({ freq: 220, duration: 0.12, gain: 0.3, type: 'sawtooth', slide: -80 }); },
    step(distance = 0) { burst({ duration: 0.05, freq: 500, gain: 0.1 * attenuation(distance) }); },
    plantBeep() { tone({ freq: 1200, duration: 0.09, gain: 0.25 }); },
    bombBeep(final) { tone({ freq: final ? 1600 : 1000, duration: final ? 0.16 : 0.08, gain: 0.25 }); },
    explosion(distance = 0) {
      const a = attenuation(distance);
      burst({ duration: 0.9, freq: 300, gain: 0.9 * a });
      tone({ freq: 70, duration: 0.7, gain: 0.5 * a, type: 'sine', slide: -30 });
    },
    grenadePin() { tone({ freq: 1800, duration: 0.03, gain: 0.15 }); },
    roundStart() { tone({ freq: 440, duration: 0.12, gain: 0.2 }); tone({ freq: 660, duration: 0.16, gain: 0.2, when: 0.12 }); },
    roundWin() { [523, 659, 784].forEach((f, i) => tone({ freq: f, duration: 0.16, gain: 0.2, when: i * 0.13 })); },
    roundLose() { [392, 330, 262].forEach((f, i) => tone({ freq: f, duration: 0.18, gain: 0.2, when: i * 0.14 })); },
    buy() { tone({ freq: 880, duration: 0.06, gain: 0.2 }); tone({ freq: 1320, duration: 0.08, gain: 0.18, when: 0.06 }); },
    denied() { tone({ freq: 180, duration: 0.15, gain: 0.22, type: 'sawtooth' }); },
  };
}
