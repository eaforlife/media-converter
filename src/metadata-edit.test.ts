import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { applyStreamMetadataPatch, metadataTemporaryPath, streamMetadataChanged, streamMetadataPatch } from './metadata-edit.ts';

const metadata = (language = 'eng', defaultFlag = true) => ({
  language,
  flags: { default: defaultFlag, forced: false, hearingImpaired: false },
});

test('metadata changes are compared against each source stream', () => {
  equal(streamMetadataChanged(metadata(), metadata()), false);
  equal(streamMetadataChanged(metadata(), metadata('jpn')), true);
  equal(streamMetadataChanged(metadata(), metadata('eng', false)), true);
});

test('metadata patches copy only fields changed on the origin stream', () => {
  const source = metadata('eng', true);
  const edited = metadata('jpn', true);
  edited.flags.forced = true;
  const patch = streamMetadataPatch(source, edited);
  deepEqual(patch, { language: 'jpn', flags: { forced: true } });

  const target = metadata('fra', false);
  applyStreamMetadataPatch(target, patch);
  deepEqual(target, {
    language: 'jpn',
    flags: { default: false, forced: true, hearingImpaired: false },
  });
  equal(applyStreamMetadataPatch(target, patch), false);
});

test('metadata replacement outputs use deterministic zero-based temporary suffixes', () => {
  equal(metadataTemporaryPath('C:\\Media\\Episode.mkv', 0), 'C:\\Media\\Episode_tmp00.mkv');
  equal(metadataTemporaryPath('/media/Episode.final.mp4', 12), '/media/Episode.final_tmp12.mp4');
  equal(metadataTemporaryPath('/media/Episode', 1), '/media/Episode_tmp01');
});
