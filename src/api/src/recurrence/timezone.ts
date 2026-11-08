import { Info } from 'luxon';

/**
 * R-12: whether a string names an IANA time zone. Shared by the validation
 * every write passes and by the engine, so the two cannot disagree.
 *
 * Two questions, answered by two different authorities.
 *
 * Does the zone exist? The runtime's tz data decides, through Intl: the same
 * data the engine computes with. So every zone accepted here is one the engine
 * can compute in, and a zone added by a later tz release needs no change here.
 *
 * Is it an IANA name? Intl cannot say. It also accepts offsets ("+03:00",
 * since ECMA-402 added them) and ICU's own legacy IDs, some of which mislead:
 * "BST" is Bangladesh, not British Summer Time, and "IST" is India. So the
 * name must also be shaped like an IANA name - an area and a location
 * ("America/Toronto", "Etc/GMT-3"), or one of the single-word names IANA keeps
 * for compatibility ("UTC", "EST5EDT"). IANA stopped adding both long ago, so
 * the two lists below are closed; they were checked against PostgreSQL's copy
 * of the tz database. Neither lists zones: those stay the runtime's.
 *
 * Luxon's own specifiers fail both questions, and are what the check this
 * replaced let through. To setZone, "system", "local" and "default" mean the
 * zone of whatever machine runs the server - UTC on Render, the developer's
 * own zone on a laptop - and "UTC+3" is a fixed offset.
 *
 * Case is ignored, as ECMA-402 and PostgreSQL ignore it: "america/toronto"
 * passes and is kept as written. Insisting on IANA's exact spelling would need
 * a copy of every link name, which the runtime does not expose.
 *
 * One known gap: "US/Pacific-New" and "Canada/East-Saskatchewan", which IANA
 * has withdrawn, still pass because ICU still knows them. Each computes
 * exactly as the zone it always named.
 */
export function isIanaTimeZone(name: string): boolean {
  const slash = name.indexOf('/');
  const shapedLikeIana =
    slash === -1
      ? SINGLE_WORD_NAMES.has(name.toLowerCase())
      : AREAS.has(name.slice(0, slash).toLowerCase());

  return shapedLikeIana && Info.isValidIANAZone(name);
}

function lowercased(names: string[]): ReadonlySet<string> {
  return new Set(names.map((name) => name.toLowerCase()));
}

/** The areas IANA files zones under. The last five are country aliases it keeps for compatibility. */
const AREAS = lowercased([
  'Africa',
  'America',
  'Antarctica',
  'Arctic',
  'Asia',
  'Atlantic',
  'Australia',
  'Etc',
  'Europe',
  'Indian',
  'Pacific',
  'Brazil',
  'Canada',
  'Chile',
  'Mexico',
  'US',
]);

/**
 * Every single-word name in the tz database except "Factory", which is IANA's
 * placeholder for a zone nobody has set rather than a place an alarm could be.
 */
const SINGLE_WORD_NAMES = lowercased([
  'CET',
  'CST6CDT',
  'Cuba',
  'EET',
  'Egypt',
  'Eire',
  'EST',
  'EST5EDT',
  'GB',
  'GB-Eire',
  'GMT',
  'GMT-0',
  'GMT+0',
  'GMT0',
  'Greenwich',
  'Hongkong',
  'HST',
  'Iceland',
  'Iran',
  'Israel',
  'Jamaica',
  'Japan',
  'Kwajalein',
  'Libya',
  'MET',
  'MST',
  'MST7MDT',
  'Navajo',
  'NZ',
  'NZ-CHAT',
  'Poland',
  'Portugal',
  'PRC',
  'PST8PDT',
  'ROC',
  'ROK',
  'Singapore',
  'Turkey',
  'UCT',
  'Universal',
  'UTC',
  'W-SU',
  'WET',
  'Zulu',
]);
