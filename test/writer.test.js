import testDataManifests from 'data-files!manifests';
import QUnit from 'qunit';
import { Parser } from '../src';

// parse -> stringify -> re-parse, then check the essentials survived
const parse = (manifestString) => {
  const parser = new Parser();

  parser.push(manifestString);
  parser.end();

  return parser.manifest;
};

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

QUnit.test('round-trips #EXT-X-KEY with IV', function(assert) {
  const manifest = roundTrip(testDataManifests.encrypted());

  assert.deepEqual(
    manifest.segments[0].key,
    parse(testDataManifests.encrypted()).segments[0].key,
    'key with IV round-trips identically'
  );
});

QUnit.test('round-trips #EXT-X-KEY:METHOD=NONE transitions', function(assert) {
  const manifest = roundTrip(testDataManifests['diff-init-key']());
  const keysOf = (m) => m.segments.map((s) => s.key || null);

  assert.deepEqual(
    keysOf(manifest),
    keysOf(parse(testDataManifests['diff-init-key']())),
    'key drops when METHOD=NONE is declared, identically'
  );
});

QUnit.test('round-trips #EXT-X-MAP and #EXT-X-INDEPENDENT-SEGMENTS', function(assert) {
  const manifest = roundTrip(testDataManifests.fmp4());
  const mapsOf = (m) => m.segments.map((s) => s.map || null);

  assert.ok(manifest.independentSegments, 'independentSegments survives');
  assert.deepEqual(
    mapsOf(manifest),
    mapsOf(parse(testDataManifests.fmp4())),
    'segment maps with byterange survive'
  );
});

QUnit.test('round-trips #EXT-X-START', function(assert) {
  const manifest = roundTrip(testDataManifests.start());

  assert.deepEqual(
    manifest.start,
    parse(testDataManifests.start()).start,
    'start survives (without PRECISE=undefined)'
  );
});

QUnit.test('round-trips #EXT-X-ALLOW-CACHE:NO', function(assert) {
  const manifest = roundTrip(testDataManifests.disallowCache());

  assert.notOk(manifest.allowCache, 'allowCache NO survives');
});

QUnit.test('round-trips #EXT-X-DISCONTINUITY', function(assert) {
  const manifest = roundTrip(testDataManifests.discontinuity());
  const discsOf = (m) => m.segments.map((s) => !!s.discontinuity);

  assert.deepEqual(
    discsOf(manifest),
    discsOf(parse(testDataManifests.discontinuity())),
    'discontinuity markers survive'
  );
});

QUnit.test('round-trips #EXT-X-PROGRAM-DATE-TIME', function(assert) {
  const manifest = roundTrip(testDataManifests.dateTime());
  const datesOf = (m) => m.segments.map((s) => s.dateTimeString);

  assert.deepEqual(
    datesOf(manifest),
    datesOf(parse(testDataManifests.dateTime())),
    'program date times survive'
  );
});

QUnit.test('round-trips RESOLUTION, FRAME-RATE and CLOSED-CAPTIONS groups', function(assert) {
  const manifest = roundTrip([
    '#EXTM3U',
    '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="CC1",INSTREAM-ID="CC1",AUTOSELECT=YES,DEFAULT=YES',
    '#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=800x600,FRAME-RATE=29.97,CLOSED-CAPTIONS="cc"',
    'video/prog_index.m3u8'
  ].join('\n'));

  assert.deepEqual(
    manifest.playlists[0].attributes.RESOLUTION,
    { width: 800, height: 600 },
    'resolution survives'
  );
  assert.equal(
    manifest.playlists[0].attributes['FRAME-RATE'],
    29.97,
    'frame-rate survives'
  );
  assert.equal(
    manifest.mediaGroups['CLOSED-CAPTIONS'].cc.CC1.instreamId,
    'CC1',
    'instream-id survives'
  );
});
