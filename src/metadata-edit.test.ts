import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { metadataTemporaryPath, streamMetadataChanged } from './metadata-edit.ts';

const metadata = (language = 'eng', defaultFlag = true) => ({
  language,
  flags: { default: defaultFlag, forced: false, hearingImpaired: false },
});

test('metadata changes are compared against each source stream', () => {
  equal(streamMetadataChanged(metadata(), metadata()), false);
  equal(streamMetadataChanged(metadata(), metadata('jpn')), true);
  equal(streamMetadataChanged(metadata(), metadata('eng', false)), true);
});

test('metadata replacement outputs use deterministic zero-based temporary suffixes', () => {
  equal(metadataTemporaryPath('C:\\Media\\Episode.mkv', 0), 'C:\\Media\\Episode_tmp00.mkv');
  equal(metadataTemporaryPath('/media/Episode.final.mp4', 12), '/media/Episode.final_tmp12.mp4');
  equal(metadataTemporaryPath('/media/Episode', 1), '/media/Episode_tmp01');
});
