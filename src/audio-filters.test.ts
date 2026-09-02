import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_PEAK_LIMITER_FILTER, encodedAudioFilter, FEISHIN_DEFAULT_COMPRESSOR_FILTER, surroundDownmixFilter,
} from './audio-filters.ts';

test('normalizes surround coefficients and guards compressed peaks', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 6, channelLayout: '5.1' }, true),
    `pan=stereo|c0<c0+0.707*c2+0.707*c4|c1<c1+0.707*c2+0.707*c5,${FEISHIN_DEFAULT_COMPRESSOR_FILTER},${AUDIO_PEAK_LIMITER_FILTER}`,
  );
  assert.equal(
    surroundDownmixFilter({ channels: 8, channelLayout: '7.1' }, true),
    `pan=stereo|c0<c0+0.707*c2+0.707*c4+0.707*c6|c1<c1+0.707*c2+0.707*c5+0.707*c7,${FEISHIN_DEFAULT_COMPRESSOR_FILTER},${AUDIO_PEAK_LIMITER_FILTER}`,
  );
});

test('compresses every surround layout after downmixing but leaves mono and stereo alone', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 4, channelLayout: 'quad' }, true),
    `aformat=channel_layouts=stereo,${FEISHIN_DEFAULT_COMPRESSOR_FILTER},${AUDIO_PEAK_LIMITER_FILTER}`,
  );
  assert.equal(surroundDownmixFilter({ channels: 2, channelLayout: 'Stereo' }, true), null);
  assert.equal(surroundDownmixFilter({ channels: 1, channelLayout: 'Mono' }, true), null);
});

test('keeps the normalized downmix when compression is disabled', () => {
  assert.equal(
    surroundDownmixFilter({ channels: 6, channelLayout: '5.1' }, false),
    'pan=stereo|c0<c0+0.707*c2+0.707*c4|c1<c1+0.707*c2+0.707*c5',
  );
});

test('stabilizes timestamps for every encoded track and combines optional processing', () => {
  const stereo = { channels: 2, channelLayout: 'stereo' };
  const surround = { channels: 6, channelLayout: '5.1' };
  assert.equal(encodedAudioFilter(stereo, false, false, false), 'aresample=async=1');
  assert.equal(encodedAudioFilter(stereo, false, false, true), 'aresample=48000:async=1');
  assert.equal(
    encodedAudioFilter(surround, true, true, false),
    `aresample=async=1,${surroundDownmixFilter(surround, true)}`,
  );
});
