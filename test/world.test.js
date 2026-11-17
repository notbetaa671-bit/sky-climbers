import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PLAYERS_PER_ROOM, ROOM_TEMPLATES, WORLD, getPublicWorld } from '../server/world.js';

test('world exposes a climbable route and all room templates', () => {
  assert.equal(WORLD.width, 3600);
  assert.ok(WORLD.platforms.length >= 15);
  assert.ok(WORLD.checkpoints.length >= 4);
  assert.ok(WORLD.hazards.length >= 8);
  assert.equal(ROOM_TEMPLATES.length, 3);
  assert.equal(MAX_PLAYERS_PER_ROOM, 50);
});

test('public world is serializable and does not expose mutable server-only state', () => {
  const publicWorld = getPublicWorld();
  assert.ok(publicWorld.platforms.every((platform) => platform.w > 0 && platform.h > 0));
  assert.equal(publicWorld.platforms.length, WORLD.platforms.length);
  assert.equal(publicWorld.players, undefined);
});

