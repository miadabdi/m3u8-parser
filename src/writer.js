import isEqual from 'lodash/isEqual';

const handleMediaGroups = function(obj) {
  const keys = Object.keys(obj);
  let result = '';

  keys.forEach((key) => {
    // samples
    // #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="fra",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="fra",URI="audio_64_fra_rendition.m3u8"
    // #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subtitles0",NAME="eng_subtitle",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="eng",URI="subtitle_eng_rendition.m3u8"
    // #EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="low",NAME="Dugout",DEFAULT=NO,URI="low/dugout/audio-video.m3u8"

    // iterating group-id
    const keyGroupId = Object.keys(obj[key]);

    keyGroupId.forEach((groupId) => {
      const groupData = obj[key][groupId];

      // iterating languages
      const keyName = Object.keys(groupData);

      keyName.forEach((Name) => {
        let mediaGroupItem = `#EXT-X-MEDIA:TYPE=${key}`;

        mediaGroupItem += `,GROUP-ID="${groupId}"`;
        mediaGroupItem += `,NAME="${Name}"`;

        const entryKeys = Object.keys(groupData[Name]);

        entryKeys.forEach((entryKey) => {
          const value = groupData[Name][entryKey];

          const QuotedAttributes = [
            'URI',
            'LANGUAGE',
            'ASSOC-LANGUAGE',
            'INSTREAM-ID',
            'CHARACTERISTICS',
            'CHANNELS'
          ];

          if (entryKey === 'instreamId') {
            // special case: key not compatible with rfc
            entryKey = 'INSTREAM-ID';
          }

          const isQuoted = QuotedAttributes.includes(entryKey.toUpperCase());

          mediaGroupItem += `,${entryKey.toUpperCase()}=${
            isQuoted ? '"' : ''
          }${value}${isQuoted ? '"' : ''}`;
        });

        result += mediaGroupItem + '\n';
      });
    });
  });

  return result + '\n';
};

function handlePlaylists(arrPlaylists) {
  // samples
  // #EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=20985770,BANDWIDTH=28058971,VIDEO-RANGE=SDR,CODECS="hvc1.2.4.L150.B0",RESOLUTION=3840x2160,FRAME-RATE=23.976,CLOSED-CAPTIONS=NONE,HDCP-LEVEL=TYPE-1
  // sdr_2160/prog_index.m3u8

  let result = '';

  arrPlaylists.forEach((playlist) => {
    let playlistItem = '#EXT-X-STREAM-INF:';

    const attrKeys = Object.keys(playlist.attributes);

    attrKeys.forEach((attribute) => {
      // FIXME: an enumarated-string NONE should not be quoted in CLOSED-CAPTION attr

      const QuotedAttributes = [
        'CODECS',
        'AUDIO',
        'VIDEO',
        'SUBTITLES',
        'CLOSED-CAPTIONS'
      ];

      const isQuoted = QuotedAttributes.includes(attribute.toUpperCase());

      let value = playlist.attributes[attribute];

      if (attribute === 'RESOLUTION') {
        // changing object data to hls desired format
        value = `${value.width}x${value.height}`;
      }

      if (attribute === 'FRAME-RATE') {
        // rounding FRAME-RATE to 3 decimal places
        value = parseFloat(value).toFixed(3);
      }

      playlistItem += `,${attribute.toUpperCase()}=${
        isQuoted ? '"' : ''
      }${value}${isQuoted ? '"' : ''}`;
    });

    // adding uri
    playlistItem += `\n${playlist.uri}\n`;

    result += playlistItem + '\n';
  });

  return result;
}

function toHexString(uint32) {
  return uint32.reduce(
    (output, elem) => output + ('00000000' + elem.toString(16)).slice(-8),
    ''
  );
}

function handleSegments(segments) {
  let result = '';
  let lastKey = {};
  let lastMap = {};

  segments.forEach((segment) => {
    let segmentString = '\n';

    // if segment.key does not exists, it does not mean that no tag should be placed there
    // it just mean there is no key associated with that segment
    // As the HLS RFC points out, if we have set an encryption method at some point (maybe segment 30)
    // and from now on (segment 50) we don't need that (segments are not encrypted anymore),
    // we cannot just leave it like that. we should add "#EXT-X-KEY:METHOD=NONE" to tell no encrption from now on
    // more info: https://tools.ietf.org/html/rfc8216#section-4.3.2.4

    // NOTE: if we have #EXT-X-KEY:METHOD=NONE , segment.key won't be present at all
    // NOTE: encryption for Widevine is not supported in stringifying

    // lodash.isequal is a little bit overkill for this usecase, but I didn't want to
    // add object equality function. They are confusing and ugly
    if (segment.key && !isEqual(segment.key, lastKey)) {
      // segment key exists and is not equel to last key
      const IV = segment.key.iv ? `,IV=0x${toHexString(segment.key.iv)}` : '';

      segmentString += `#EXT-X-KEY:METHOD=${segment.key.method},URI="${segment.key.uri}"${IV}\n`;

      lastKey = segment.key;
    } else if (!segment.key && !isEmpty(lastKey)) {
      // segment.key does not exists and if we have a lastkey, we sould add #EXT-X-KEY:METHOD=NONE
      segmentString += '#EXT-X-KEY:METHOD=NONE\n';
    }

    if (segment.map && !isEqual(segment.map, lastMap)) {
      // segment map exists and is not equel to last map

      if (typeof segment.map.byterange.offset === 'undefined') {
        segment.map.byterange.offset = 0;
      }

      const BYTERANGE = segment.map.byterange ?
        `,BYTERANGE="${segment.map.byterange.length}@${segment.map.byterange.offset}"` :
        '';

      segmentString += `#EXT-X-MAP:URI="${segment.map.uri}"${BYTERANGE}\n`;

      lastMap = segment.map;
    }

    if (segment.discontinuity) {
      segmentString += '#EXT-X-DISCONTINUITY\n';
    }

    /*
      "A Media Playlist MUST indicate an EXT-X-VERSION of 3 or higher if it contains:
        Floating-point EXTINF duration values." - https://tools.ietf.org/html/rfc8216#section-7

      So, we cannot alter or parse decimal target duration to floating point
      because it might introduce version incompatibility
    */

    // FIXME: What about name after duration?
    segmentString += `#EXTINF:${segment.duration},\n`;

    // TODO: which one should appear first? byterange or program date time?

    if (segment.dateTimeString) {
      segmentString += `#EXT-X-PROGRAM-DATE-TIME:${segment.dateTimeString}\n`;
    }

    if (segment.byterange) {
      // even though offset is optional in hls specs, but it is always present in manifest object
      const length = segment.byterange.length;
      const offset = segment.byterange.offset;

      segmentString += `#EXT-X-BYTERANGE:${length}@${offset}\n`;
    }

    segmentString += segment.uri;

    result += segmentString + '\n';
  });

  return result;
}

function stringifyTag(key, value) {
  // key indicated the tag

  // TODO: should we include #EXT-X-PROGRAM-DATE-TIME as playlist tag?

  if (key === 'allowCache') {
    // FIXME: this tag is deprecated
    return `#EXT-X-ALLOW-CACHE:${value ? 'YES' : 'NO'}\n`;
  } else if (key === 'discontinuityStarts') {
    // not implemented
    return '';
  } else if (key === 'version') {
    return `#EXT-X-VERSION:${value}\n`;
  } else if (key === 'mediaGroups') {
    // handling media groups seperately
    return handleMediaGroups(value);
  } else if (key === 'playlists') {
    // handling media groups seperately
    return handlePlaylists(value);
  } else if (key === 'targetDuration') {
    return `#EXT-X-TARGETDURATION:${value}\n`;
  } else if (key === 'mediaSequence') {
    return `#EXT-X-MEDIA-SEQUENCE:${value}\n`;
  } else if (key === 'playlistType') {
    return `#EXT-X-PLAYLIST-TYPE:${value}\n`;
  } else if (key === 'segments') {
    // handle segments seperately
    return handleSegments(value);
  } else if (key === 'discontinuitySequence') {
    return `#EXT-X-DISCONTINUITY-SEQUENCE:${value}\n`;
  } else if (key === 'start') {
    return `#EXT-X-START:TIME-OFFSET=${value.timeOffset},PRECISE=${value.precise}\n`;
  } else if (key === 'endList') {
    if (value) {
      return '#EXT-X-ENDLIST\n';
    }

    // if value is false tag should not be present
    return '';
  } else if (key === 'independentSegments') {
    return '#EXT-X-INDEPENDENT-SEGMENTS\n';
  }

  // unknown tag
  return '';
}

function isEmpty(element) {
  if (
    typeof element === 'object' &&
    (element.constructor === Object || element.constructor === Array) &&
    Object.keys(element).length === 0
  ) {
    // typeof [] === 'object'
    // Object.keys(["One", "Two", "Three"]) === ["0", "1", "2"]
    return true;
  }

  return false;
}

// EXTM3U is not present, becuase it is not present in manifest object
// ["EXT-X-VERSION", "#EXT-X-MEDIA", "#EXT-X-STREAM-INF", "#EXT-X-TARGETDURATION", "#EXT-X-MEDIA-SEQUENCE", "#EXT-X-PLAYLIST-TYPE", "#EXT-X-DISCONTINUITY-SEQUENCE", "#EXT-X-INDEPENDENT-SEGMENTS", "#EXT-X-START", "#EXTINF", "#EXT-X-ENDLIST"];
// #EXT-X-PROGRAM-DATE-TIME , #EXT-X-KEY , #EXT-X-MAP , #EXT-X-BYTERANGE and #EXT-X-DISCONTINUITY will be created in segments
// below is equivalent in manifest object
const tagsInOrder = [
  'version',
  'mediaGroups',
  'playlists',
  'targetDuration',
  'mediaSequence',
  'playlistType',
  'discontinuitySequence',
  'independentSegments',
  'start',
  'segments',
  'endList'
];

export default function Writer(manifest) {
  let stringified = '';

  // adding #EXTM3U in the first place
  // adding new line manullay in every line
  stringified += '#EXTM3U\n';

  const manifestKeys = Object.keys(manifest);

  tagsInOrder.forEach((tag) => {
    if (manifestKeys.includes(tag) && !isEmpty(manifestKeys[tag])) {
      // tag === keys in manifestKeys
      stringified += stringifyTag(tag, manifest[tag]);
    }
  });

  // remove , after :
  stringified = stringified.replace(/:,/g, ':');

  // replacing true and false with YES and NO
  // because true and false were used in manifest obj
  stringified = stringified.replace(/true/g, 'YES');
  stringified = stringified.replace(/false/g, 'NO');

  return stringified;
}
