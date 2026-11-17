export const MAX_PLAYERS_PER_ROOM = Number.parseInt(process.env.MAX_PLAYERS_PER_ROOM || '50', 10);

export const WORLD = {
  width: 3600,
  height: 2200,
  spawn: { x: 164, y: 2090 },
  platforms: [
    { x: 0, y: 2140, w: 3600, h: 60, type: 'base' },
    { x: 90, y: 1980, w: 320, h: 28, type: 'ice' },
    { x: 350, y: 1840, w: 330, h: 28, type: 'stone' },
    { x: 615, y: 1700, w: 300, h: 28, type: 'ice' },
    { x: 405, y: 1560, w: 305, h: 28, type: 'stone' },
    { x: 155, y: 1420, w: 295, h: 28, type: 'ice' },
    { x: 390, y: 1280, w: 315, h: 28, type: 'stone' },
    { x: 675, y: 1140, w: 330, h: 28, type: 'ice' },
    { x: 920, y: 1000, w: 315, h: 28, type: 'stone' },
    { x: 700, y: 860, w: 305, h: 28, type: 'ice' },
    { x: 455, y: 720, w: 300, h: 28, type: 'stone' },
    { x: 690, y: 580, w: 320, h: 28, type: 'ice' },
    { x: 960, y: 440, w: 330, h: 28, type: 'stone' },
    { x: 1240, y: 300, w: 355, h: 28, type: 'ice' },
    { x: 1530, y: 160, w: 390, h: 28, type: 'stone' },
    { x: 1870, y: 40, w: 560, h: 28, type: 'ice' },
    { x: 2630, y: -100, w: 500, h: 28, type: 'stone' },
  ],
  hazards: [
    { x: 430, y: 1815, w: 70, h: 25 },
    { x: 710, y: 1675, w: 90, h: 25 },
    { x: 220, y: 1395, w: 78, h: 25 },
    { x: 540, y: 1255, w: 82, h: 25 },
    { x: 950, y: 975, w: 90, h: 25 },
    { x: 520, y: 695, w: 80, h: 25 },
    { x: 790, y: 555, w: 92, h: 25 },
    { x: 1335, y: 275, w: 90, h: 25 },
    { x: 1680, y: 135, w: 110, h: 25 },
    { x: 2140, y: 15, w: 110, h: 25 },
  ],
  checkpoints: [
    { id: 'camp-01', name: 'CLOUD CAMP', x: 420, y: 1500, spawnX: 470, spawnY: 1510 },
    { id: 'camp-02', name: 'AURORA LEDGE', x: 735, y: 1080, spawnX: 790, spawnY: 1090 },
    { id: 'camp-03', name: 'STARFALL POST', x: 1000, y: 380, spawnX: 1060, spawnY: 390 },
    { id: 'camp-04', name: 'SUMMIT GATE', x: 1610, y: 100, spawnX: 1660, spawnY: 110 },
  ],
  goal: { x: 2160, y: -42, w: 180, h: 90, name: 'THE SUMMIT' },
};

export const ROOM_TEMPLATES = [
  { id: 'aurora', name: 'Aurora Ridge', mood: 'CALM WINDS', theme: 'aurora' },
  { id: 'storm', name: 'Stormline 07', mood: 'HIGH VOLTAGE', theme: 'storm' },
  { id: 'sunset', name: 'Last Light', mood: 'GOLDEN HOUR', theme: 'sunset' },
];

export function getPublicWorld() {
  return {
    width: WORLD.width,
    height: WORLD.height,
    spawn: WORLD.spawn,
    platforms: WORLD.platforms,
    hazards: WORLD.hazards,
    checkpoints: WORLD.checkpoints,
    goal: WORLD.goal,
  };
}

