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

          mediaGroupItem += `,${entryKey.toUpperCase()}=${isQuoted ? '"' : ''}${value}${isQuoted ? '"' : ''}`;

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

      playlistItem += `,${attribute.toUpperCase()}=${isQuoted ? '"' : ''}${value}${isQuoted ? '"' : ''}`;

    });

    // adding uri
    playlistItem += `\n${playlist.uri}\n`;

    result += playlistItem + '\n';
  });

  return result;
}

function stringifyTag(key, value) {
  // key indicated the tag

  if (key === 'allowCache') {
    return `#EXT-X-ALLOW-CACHE:${value ? 'YES' : 'NO'}\n`;
  } else if (key === 'discontinuityStarts') {
    // not implemented
    return '';
  } else if (key === 'segments') {
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
  }

  // unknown tag
  return '';

}

export default function Writer(manifest) {

  let stringified = '';

  // adding #EXTM3U in the first place
  // adding new line manullay in every line
  stringified += '#EXTM3U\n';

  const manifestKeys = Object.keys(manifest);

  manifestKeys.forEach((key) => {
    stringified += stringifyTag(key, manifest[key]);
  });

  // remove , after :
  stringified = stringified.replace(/:,/g, ':');

  // replacing true and false with YES and NO
  // because true and false were used in manifest obj
  stringified = stringified.replace(/true/g, 'YES');
  stringified = stringified.replace(/false/g, 'NO');

  return stringified;

}