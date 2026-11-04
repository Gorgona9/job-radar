// Country name → aliases and cities, used to give every job a country for the dashboard filter.
const MAP = {
  Germany: ['germany', 'deutschland', 'de', 'berlin', 'munich', 'münchen', 'muenchen', 'hamburg', 'frankfurt', 'cologne', 'köln', 'koeln', 'stuttgart', 'düsseldorf', 'duesseldorf', 'leipzig', 'dresden', 'karlsruhe', 'nuremberg', 'nürnberg', 'hannover', 'hanover', 'bonn', 'potsdam', 'aachen', 'heidelberg', 'mannheim', 'freiburg', 'bremen', 'dortmund', 'essen', 'münster', 'augsburg', 'regensburg', 'darmstadt', 'wiesbaden', 'mainz', 'kiel', 'ulm', 'jena', 'erlangen', 'walldorf', 'braunschweig', 'bochum', 'krefeld', 'lübeck', 'halle (saale)', 'saarbrücken', 'oldenburg', 'gießen', 'fürth', 'wuppertal', 'bielefeld', 'kassel', 'würzburg', 'ingolstadt', 'magdeburg', 'rostock', 'erfurt', 'chemnitz', 'osnabrück', 'paderborn', 'göttingen', 'bayern', 'bavaria', 'baden-württemberg', 'nordrhein-westfalen', 'north rhine-westphalia', 'niedersachsen', 'lower saxony', 'hessen', 'hesse', 'sachsen', 'saxony', 'sachsen-anhalt', 'thüringen', 'thuringia', 'rheinland-pfalz', 'saarland', 'schleswig-holstein', 'mecklenburg-vorpommern', 'brandenburg'],
  Netherlands: ['netherlands', 'the netherlands', 'holland', 'nederland', 'nl', 'amsterdam', 'rotterdam', 'eindhoven', 'utrecht', 'the hague', 'den haag', 'delft', 'groningen', 'nijmegen', 'arnhem', 'tilburg', 'breda', 'haarlem'],
  Austria: ['austria', 'österreich', 'at', 'vienna', 'wien', 'graz', 'linz', 'salzburg', 'innsbruck', 'klagenfurt'],
  Switzerland: ['switzerland', 'schweiz', 'suisse', 'ch', 'zurich', 'zürich', 'geneva', 'genève', 'basel', 'lausanne', 'bern', 'lucerne', 'luzern', 'zug', 'st. gallen', 'winterthur', 'lugano', 'nyon'],
  Poland: ['poland', 'polska', 'pl', 'warsaw', 'warszawa', 'krakow', 'kraków', 'wroclaw', 'wrocław', 'gdansk', 'gdańsk', 'gdynia', 'poznan', 'poznań', 'lodz', 'łódź', 'katowice', 'lublin', 'szczecin', 'bialystok'],
  Estonia: ['estonia', 'ee', 'tallinn', 'tartu'],
  Latvia: ['latvia', 'lv', 'riga', 'daugavpils', 'jelgava'],
  Lithuania: ['lithuania', 'lt', 'vilnius', 'kaunas', 'klaipeda', 'klaipėda'],
  Czechia: ['czechia', 'czech republic', 'cz', 'prague', 'praha', 'brno', 'ostrava', 'plzen'],
  Slovakia: ['slovakia', 'slovak republic', 'sk', 'bratislava', 'kosice', 'košice'],
  Slovenia: ['slovenia', 'si', 'ljubljana', 'maribor'],
  Hungary: ['hungary', 'magyarország', 'hu', 'budapest', 'debrecen'],
  Romania: ['romania', 'românia', 'ro', 'bucharest', 'bucurești', 'cluj', 'cluj-napoca', 'timisoara', 'iași', 'iasi', 'brasov'],
  Bulgaria: ['bulgaria', 'bg', 'sofia', 'plovdiv', 'varna'],
  Croatia: ['croatia', 'hrvatska', 'hr', 'zagreb', 'split'],
  Greece: ['greece', 'gr', 'athens', 'thessaloniki'],
  Serbia: ['serbia', 'rs', 'belgrade', 'novi sad'],
  Montenegro: ['montenegro', 'podgorica'],
  'North Macedonia': ['north macedonia', 'skopje'],
  Bosnia: ['bosnia', 'sarajevo'],
  Albania: ['albania', 'tirana'],
  Moldova: ['moldova', 'chisinau', 'chișinău'],
  Georgia: ['georgia', 'tbilisi'],
  Armenia: ['armenia', 'yerevan', 'gyumri', 'vanadzor', 'ereván', 'армения', 'ереван', 'гюмри', 'հայաստան', 'երևան'],
  Belgium: ['belgium', 'be', 'brussels', 'antwerp', 'ghent', 'leuven', 'liège', 'liege'],
  Luxembourg: ['luxembourg', 'lu', 'luxembourg city', 'esch-sur-alzette'],
  Ireland: ['ireland', 'ie', 'dublin', 'cork', 'galway', 'limerick'],
  'United Kingdom': ['united kingdom', 'uk', 'gb', 'england', 'scotland', 'wales', 'london', 'manchester', 'edinburgh', 'cambridge', 'oxford', 'bristol', 'leeds', 'birmingham', 'glasgow', 'belfast', 'newcastle'],
  Portugal: ['portugal', 'pt', 'lisbon', 'lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'faro'],
  Spain: ['spain', 'españa', 'es', 'barcelona', 'madrid', 'valencia', 'malaga', 'málaga', 'seville', 'sevilla', 'bilbao', 'zaragoza'],
  France: ['france', 'fr', 'paris', 'lyon', 'toulouse', 'nantes', 'bordeaux', 'lille', 'grenoble', 'sophia antipolis', 'nice'],
  Italy: ['italy', 'it', 'milan', 'milano', 'rome', 'roma', 'turin', 'torino', 'bologna', 'florence', 'naples', 'padova'],
  Sweden: ['sweden', 'se', 'stockholm', 'gothenburg', 'göteborg', 'malmö', 'malmo', 'uppsala', 'lund', 'linköping'],
  Denmark: ['denmark', 'dk', 'copenhagen', 'aarhus', 'odense', 'aalborg'],
  Finland: ['finland', 'fi', 'helsinki', 'espoo', 'tampere', 'oulu', 'turku'],
  Norway: ['norway', 'no', 'oslo', 'bergen', 'trondheim', 'stavanger'],
  Iceland: ['iceland', 'reykjavik'],
  Cyprus: ['cyprus', 'cy', 'limassol', 'nicosia', 'larnaca', 'paphos'],
  Malta: ['malta', 'mt', 'valletta', 'sliema'],
  'United Arab Emirates': ['united arab emirates', 'uae', 'dubai', 'abu dhabi'],
  Canada: ['canada', 'ca', 'toronto', 'vancouver', 'montreal'],
  Japan: ['japan', 'jp', 'tokyo'],
  Singapore: ['singapore', 'sg'],
  Australia: ['australia', 'au', 'sydney', 'melbourne'],
  'New Zealand': ['new zealand', 'nz', 'auckland'],
  'United States': ['united states', 'usa', 'us', 'u.s.', 'san francisco', 'new york', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'palo alto', 'washington dc', 'arlington, va', 'colorado', 'texas', 'illinois'],
  Turkey: ['turkey', 'türkiye', 'istanbul', 'ankara'],
  Ukraine: ['ukraine', 'kyiv', 'kiev', 'lviv'],
  India: ['india', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'chennai', 'noida', 'gurgaon', 'gurugram', 'mumbai', 'delhi'],
  Philippines: ['philippines', 'manila', 'cebu'],
  Brazil: ['brazil', 'brasil', 'são paulo', 'sao paulo'],
  Mexico: ['mexico', 'méxico'],
  Israel: ['israel', 'tel aviv'],
  China: ['china', 'shanghai', 'beijing', 'shenzhen'],
};

// Two-letter codes only count when written in upper case ("Lisbon, PT"), so "it" / "no" in text don't match.
const ENTRIES = Object.entries(MAP).flatMap(([country, names]) => names.map((n) => {
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { country, re: n.length === 2 ? new RegExp(`(?:^|[^A-Za-z])${n.toUpperCase()}(?:[^A-Za-z]|$)`) : new RegExp(`(?:^|[^\p{L}])${esc}(?:[^\p{L}]|$)`, 'iu') };
}));

const ALIASES = Object.fromEntries(Object.entries(MAP).flatMap(([c, names]) => [[c.toLowerCase(), c], ...names.filter((n) => n.length > 2).map((n) => [n, c])]));

// Best guess of the job's country: the AI's answer first, then the location text. Remote → "Remote".
export function jobCountry(job) {
  const ai = String(job.verdict?.country || '').trim();
  if (ai && !/remote|worldwide|anywhere|global|multiple|various|unknown|n\/a/i.test(ai)) {
    const norm = ALIASES[ai.toLowerCase()] || ENTRIES.find((e) => e.re.test(ai))?.country;
    if (norm) return norm;
  }
  const loc = String(job.location || '');
  const remote = job.verdict?.work_mode === 'remote' || /^(remote|homeoffice|home office)\b/i.test(loc);
  if (remote) return 'Remote';
  const hit = ENTRIES.find((e) => e.re.test(loc));
  if (hit) return hit.country;
  if (ai) return ai.replace(/\b\w/g, (c) => c.toUpperCase());
  if (/kreis\b/i.test(loc)) return 'Germany'; // Adzuna's German district format ("Starnberg (Kreis)", "Ostalbkreis")
  if (job.source === 'arbeitnow' && loc) return 'Germany'; // German board; small towns aren't in the city list
  return loc ? 'Other' : 'Unknown';
}

// Which section of the dashboard a job belongs to: a job in Armenia (no move needed), a remote job,
// or a job abroad that needs relocation. A remote job at an Armenian company counts as Armenia.
export function jobRegion(job, country = jobCountry(job)) {
  if (country === 'Armenia' || ENTRIES.some((e) => e.country === 'Armenia' && e.re.test(job.location || ''))) return 'armenia';
  if (country === 'Remote' || job.verdict?.work_mode === 'remote' || job.remote === true) return 'remote';
  return 'abroad';
}
