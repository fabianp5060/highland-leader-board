// Track & field event codes used in athletic.net result URLs.
// Format: /TrackAndField/meet/{meetId}/results/{gender}/{division}/{code}
// gender: m | f, division: 1 = Varsity
export const EVENTS = [
  { code: "100m",   label: "100 Meters",     type: "track" },
  { code: "200m",   label: "200 Meters",     type: "track" },
  { code: "400m",   label: "400 Meters",     type: "track" },
  { code: "800m",   label: "800 Meters",     type: "track" },
  { code: "1600m",  label: "1600 Meters",    type: "track" },
  { code: "3200m",  label: "3200 Meters",    type: "track" },
  { code: "100mh",  label: "100m Hurdles",   type: "track", womenOnly: true },
  { code: "110mh",  label: "110m Hurdles",   type: "track", menOnly: true },
  { code: "300mh",  label: "300m Hurdles",   type: "track" },
  { code: "4x100m", label: "4x100 Relay",    type: "relay" },
  { code: "4x400m", label: "4x400 Relay",    type: "relay" },
  { code: "4x800m", label: "4x800 Relay",    type: "relay" },
  { code: "shot",   label: "Shot Put",       type: "field" },
  { code: "discus", label: "Discus",         type: "field" },
  { code: "javelin",label: "Javelin",        type: "field" },
  { code: "hj",     label: "High Jump",      type: "field" },
  { code: "pv",     label: "Pole Vault",     type: "field" },
  { code: "lj",     label: "Long Jump",      type: "field" },
  { code: "tj",     label: "Triple Jump",    type: "field" },
];

// Top-8 scoring table. Index 0 = 1st place.
export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

export function pointsForPlace(place) {
  if (!Number.isInteger(place) || place < 1 || place > PLACE_POINTS.length) return 0;
  return PLACE_POINTS[place - 1];
}

export function eventUrl(meetId, gender, code, division = 1) {
  return `https://www.athletic.net/TrackAndField/meet/${meetId}/results/${gender}/${division}/${code}`;
}

export function allEventUrls(meetId, division = 1) {
  const urls = [];
  for (const ev of EVENTS) {
    if (!ev.menOnly) urls.push({ ...ev, gender: "f", url: eventUrl(meetId, "f", ev.code, division) });
    if (!ev.womenOnly) urls.push({ ...ev, gender: "m", url: eventUrl(meetId, "m", ev.code, division) });
  }
  return urls;
}
