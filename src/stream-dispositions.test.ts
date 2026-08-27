import assert from 'node:assert/strict';
import test from 'node:test';
import { consolidatePrimaryDispositions, setPrimaryDisposition } from './stream-dispositions.ts';

const setting = (defaultFlag: boolean, forced: boolean, hearingImpaired = false) => ({
  enabled: true,
  flags: { default: defaultFlag, forced, hearingImpaired },
});

test('keeps the first flagged track and inherits default and forced while retaining SDH independently', () => {
  const tracks = {
    2: setting(true, false),
    4: setting(false, true, true),
    6: setting(false, false, true),
  };
  consolidatePrimaryDispositions(tracks);
  assert.deepEqual(tracks[2].flags, { default: true, forced: true, hearingImpaired: false });
  assert.deepEqual(tracks[4].flags, { default: false, forced: false, hearingImpaired: true });
  assert.equal(tracks[6].flags.hearingImpaired, true);
});

test('moving a primary flag to another track carries its companion flag with it', () => {
  const tracks = { 0: setting(true, true), 1: setting(false, false) };
  setPrimaryDisposition(tracks, 1, 'forced', true);
  assert.deepEqual(tracks[0].flags, { default: false, forced: false, hearingImpaired: false });
  assert.deepEqual(tracks[1].flags, { default: true, forced: true, hearingImpaired: false });
  setPrimaryDisposition(tracks, 1, 'default', false);
  assert.deepEqual(tracks[1].flags, { default: false, forced: true, hearingImpaired: false });
});
