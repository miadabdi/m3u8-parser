import testDataManifests from 'data-files!manifests';
import QUnit from 'qunit';
import { Parser } from '../src';

// parse -> stringify -> re-parse, then check the essentials survived
const roundTrip = (manifestString) => {
  const parser = new Parser();

  parser.push(manifestString);
  parser.end();

  const reparsed = new Parser();

  reparsed.push(parser.stringify());
  reparsed.end();

  return reparsed.manifest;
};

QUnit.module('writer');

QUnit.test('round-trips a media playlist', function(assert) {
  const manifest = roundTrip(testDataManifests.playlist());

  assert.equal(manifest.targetDuration, 10, 'targetDuration survives');
  assert.equal(manifest.version, 4, 'version survives');
  assert.equal(manifest.mediaSequence, 0, 'mediaSequence survives');
  assert.equal(manifest.playlistType, 'VOD', 'playlistType survives');
  assert.ok(manifest.endList, 'endList survives');
  assert.equal(manifest.segments.length, 17, 'all segments survive');
  assert.deepEqual(
    manifest.segments[1].byterange,
    { length: 587500, offset: 522828 },
    'segment byterange survives'
  );
  assert.equal(
    manifest.segments[0].uri,
    'hls_450k_video.ts',
    'segment uri survives'
  );
});

QUnit.test('round-trips a master playlist', function(assert) {
  const manifest = roundTrip(testDataManifests.multipleVideo());

  assert.equal(manifest.playlists.length, 2, 'all variant streams survive');
  assert.equal(
    manifest.playlists[0].attributes.BANDWIDTH,
    300000,
    'stream-inf bandwidth survives'
  );
  assert.equal(
    manifest.playlists[0].attributes['PROGRAM-ID'],
    1,
    'stream-inf program-id survives'
  );
  assert.equal(
    manifest.mediaGroups.AUDIO.aac.English.uri,
    'eng/prog_index.m3u8',
    'media group uri survives'
  );
  assert.equal(
    manifest.mediaGroups.VIDEO['200kbs'].Angle2.uri,
    'Angle2/200kbs/prog_index.m3u8',
    'media group name/uri mapping survives'
  );
});

QUnit.test('round-trips #EXT-X-DEFINE', function(assert) {
  const manifest = roundTrip([
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-DEFINE:NAME="foo",VALUE="bar"',
    '#EXTINF:10,',
    'segment.ts',
    '#EXT-X-ENDLIST'
  ].join('\n'));

  assert.deepEqual(
    manifest.definitions,
    { foo: 'bar' },
    'definitions survive'
  );
});

QUnit.test('round-trips #EXT-X-I-FRAMES-ONLY', function(assert) {
  const manifest = roundTrip([
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-I-FRAMES-ONLY',
    '#EXTINF:10,',
    'segment.ts',
    '#EXT-X-ENDLIST'
  ].join('\n'));

  assert.ok(manifest.iFramesOnly, 'iFramesOnly survives');
});

QUnit.test('round-trips #EXT-X-I-FRAME-STREAM-INF', function(assert) {
  const manifest = roundTrip([
    '#EXTM3U',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=300000,RESOLUTION=800x600,CODECS="avc1.4d401e",URI="iframe/prog_index.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=400000',
    'video/prog_index.m3u8'
  ].join('\n'));

  assert.equal(manifest.iFramePlaylists.length, 1, 'i-frame playlist survives');
  assert.equal(
    manifest.iFramePlaylists[0].attributes.BANDWIDTH,
    300000,
    'bandwidth survives'
  );
  assert.deepEqual(
    manifest.iFramePlaylists[0].attributes.RESOLUTION,
    { width: 800, height: 600 },
    'resolution survives'
  );
  assert.equal(
    manifest.iFramePlaylists[0].uri,
    'iframe/prog_index.m3u8',
    'uri survives'
  );
  assert.equal(
    manifest.playlists[0].attributes.BANDWIDTH,
    400000,
    'regular stream-inf untouched'
  );
});
