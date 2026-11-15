// Palette: one dusk-industrial palette for the whole game. Every colour in the
// scene and the HUD comes from these six entries, so the map reads at a glance:
// ember orange against slate blue-grey, with hot metal as the accent.
export const PALETTE = {
  canvas: '#191411', // dusk sky / fog
  surface: '#2b2622', // concrete and steel
  hairline: '#4a423a', // crates, pipes, trim
  ink: '#ece5d8', // HUD text, muzzle light
  muted: '#8d8578', // distant metal, dim signage
  accent: '#ff7a1a', // ember orange: Ember team, bomb site A markers
  accentB: '#37c8c3', // teal: Slate team, site B markers
  danger: '#ff3b30',
  good: '#7ddc7d',
};

// Team colours, shared by bot meshes, HUD chips and the minimap.
export const TEAM_COLORS = {
  ember: 0xff7a1a,
  slate: 0x37c8c3,
};
