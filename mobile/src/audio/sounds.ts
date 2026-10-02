import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSettings } from '../store/settings';

const FILES = {
  click: require('../../assets/sounds/click.wav'),
  shot: require('../../assets/sounds/shot.wav'),
  hit: require('../../assets/sounds/hit.wav'),
  wall: require('../../assets/sounds/wall.wav'),
  pocket: require('../../assets/sounds/pocket.wav'),
  queen: require('../../assets/sounds/queen.wav'),
  foul: require('../../assets/sounds/foul.wav'),
  win: require('../../assets/sounds/win.wav'),
  loss: require('../../assets/sounds/loss.wav'),
  countdown: require('../../assets/sounds/countdown.wav'),
  go: require('../../assets/sounds/go.wav'),
  notification: require('../../assets/sounds/notification.wav'),
  reward: require('../../assets/sounds/reward.wav'),
} as const;
export type SoundName = keyof typeof FILES;

// A small pool per sound so rapid collisions can overlap instead of cutting each other off.
const POOL = 3;
const pools = new Map<SoundName, AudioPlayer[]>();
const cursor = new Map<SoundName, number>();
let music: AudioPlayer | null = null;
let ready = false;

export async function initAudio() {
  if (ready) return;
  ready = true;
  try { await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }); } catch { /* not supported on this platform */ }
}

function playerFor(name: SoundName): AudioPlayer | null {
  try {
    let list = pools.get(name);
    if (!list) { list = Array.from({ length: name === 'hit' || name === 'wall' ? POOL : 1 }, () => createAudioPlayer(FILES[name])); pools.set(name, list); }
    const i = ((cursor.get(name) ?? -1) + 1) % list.length;
    cursor.set(name, i);
    return list[i];
  } catch { return null; }
}

/** Sound effects respect the user's "Sound" toggle. Never throws: audio problems must not break gameplay. */
export function play(name: SoundName, volume = 1) {
  if (!useSettings.getState().sound) return;
  const p = playerFor(name);
  if (!p) return;
  try { p.volume = Math.max(0, Math.min(1, volume)); p.seekTo(0); p.play(); } catch { /* ignore */ }
}

/** Collision loudness scales with impact speed (units/s from the physics engine). */
export const impactVolume = (v: number) => Math.max(0.15, Math.min(1, v / 1500));

export function setMusic(on: boolean) {
  try {
    if (!on) { music?.pause(); return; }
    if (!music) { music = createAudioPlayer(require('../../assets/sounds/music.wav')); music.loop = true; music.volume = 0.35; }
    music.play();
  } catch { /* ignore */ }
}

/** Keep the background loop in sync with the Music toggle for the app's lifetime. */
export function bindMusicToSettings() {
  setMusic(useSettings.getState().music);
  return useSettings.subscribe((s, prev) => { if (s.music !== prev.music) setMusic(s.music); });
}
