import assert from 'node:assert/strict';
import test from 'node:test';
import { FEISHIN_DEFAULT_COMPRESSOR_FILTER, surroundDownmixFilter } from './audio-filters.ts';

test('places the Feishin default compressor immediately after surround downmix and volume filters', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 6, channelLayout: '5.1' }, true),
    `pan=stereo|c0=c0+0.707*c2+0.707*c4|c1=c1+0.707*c2+0.707*c5,volume=1.8,${FEISHIN_DEFAULT_COMPRESSOR_FILTER}`,
  );
  assert.equal(
    surroundDownmixFilter({ channels: 8, channelLayout: '7.1' }, true),
    `pan=stereo|c0=c0+0.707*c2+0.707*c4+0.707*c6|c1=c1+0.707*c2+0.707*c5+0.707*c7,volume=1.8,${FEISHIN_DEFAULT_COMPRESSOR_FILTER}`,
  );
});

test('compresses every surround layout after downmixing but leaves mono and stereo alone', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 4, channelLayout: 'quad' }, true),
    `aformat=channel_layouts=stereo,volume=1.8,${FEISHIN_DEFAULT_COMPRESSOR_FILTER}`,
  );
  assert.equal(surroundDownmixFilter({ channels: 2, channelLayout: 'Stereo' }, true), null);
  assert.equal(surroundDownmixFilter({ channels: 1, channelLayout: 'Mono' }, true), null);
});

test('keeps the downmix and volume chain when compression is disabled', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 6, channelLayout: '5.1' }, false),
    'pan=stereo|c0=c0+0.707*c2+0.707*c4|c1=c1+0.707*c2+0.707*c5,volume=1.8',
  );
});
