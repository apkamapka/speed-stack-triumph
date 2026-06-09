// Country picker data. We store only the ISO 3166-1 alpha-2 code (e.g. "PL")
// in the database; the flag and display name are derived at render time.

// Comprehensive list of ISO alpha-2 codes (UN members + common territories).
export const COUNTRY_CODES: string[] = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ " +
  "CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ " +
  "FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML " +
  "MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY " +
  "QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM " +
  "TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW"
).split(" ");

// Two letters -> regional indicator symbols -> flag emoji.
export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const regionNamer =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string): string {
  try {
    return regionNamer?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export type Country = { code: string; name: string; flag: string };

// Sorted alphabetically by display name, computed once.
export const COUNTRIES: Country[] = COUNTRY_CODES.map((code) => ({
  code,
  name: countryName(code),
  flag: flagEmoji(code),
})).sort((a, b) => a.name.localeCompare(b.name));
