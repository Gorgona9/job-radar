import { germanRatio } from './util.js';

// Phrases that rule a job out for someone without an EU work permit.
const NO_SPONSOR = [
  /\b(?:no|without)\s+(?:visa\s+)?sponsorship/i,
  /\b(?:unable|not able|not in a position)\s+to\s+(?:offer\s+|provide\s+)?(?:any\s+)?(?:visa\s+|work permit\s+)?sponsor/i,
  /\b(?:cannot|can't|can not|do not|don't|does not|doesn't|will not|won't|are not able to)\s+(?:offer\s+|provide\s+|support\s+)?(?:any\s+)?(?:visa|work permit|relocation)?\s*sponsor/i,
  /\b(?:must|need to|required to|should)\s+(?:already\s+)?(?:have|hold|possess|be eligible for)\s+(?:a\s+|the\s+|valid\s+|an?\s+existing\s+)*(?:eu\s+|german\s+)?(?:work(?:ing)?\s+permit|right\s+to\s+work|work\s+authori[sz]ation|residence\s+permit)/i,
  /\b(?:eu|eea)\s+(?:citizens?|nationals?|passport holders?)\s+only/i,
  /\bonly\s+(?:consider\s+)?(?:candidates|applicants)\s+(?:who\s+are\s+)?(?:already\s+)?(?:based|located|residing|living)\s+in\s+(?:germany|the eu|europe)/i,
  /\bkein(?:e)?\s+(?:visa|visum)/i,
  /\bgültige\s+arbeitserlaubnis\s+(?:ist\s+)?(?:erforderlich|voraussetzung)/i,
];

export const RELOCATION_POSITIVE = /(visa sponsorship|sponsor(?:ing)? (?:your |a |the )?visa|relocation (?:package|support|assistance|budget|bonus|allowance|help)|support (?:you )?with (?:your )?(?:relocation|visa)|help (?:you )?(?:with )?(?:your )?(?:relocation|visa|moving)|blue card|we (?:hire|welcome applicants?) (?:from )?(?:all over the world|internationally|from abroad)|relocate to (?:germany|berlin|munich|hamburg)|umzugs(?:unterstützung|kosten)|relocation)/i;

const GERMAN_REQUIRED = /\b(?:(?:fluent|native|business[- ]?(?:level|fluent)|c1|c2|excellent|very good|strong)\s+(?:command of\s+)?(?:level\s+)?(?:in\s+)?german|german\s*\(?(?:c1|c2|native|fluent)|(?:fließend|verhandlungssicher|sehr gut)e?[snr]?\s+deutsch|deutsch\s*(?:\(|-|auf)?\s*(?:c1|c2|muttersprach|verhandlungssicher|fließend))/i;
const PLUS_NEARBY = /(plus|advantage|nice to have|bonus|beneficial|von vorteil|wünschenswert|wuenschenswert|desirable)/i;

export function germanRequiredHeuristic(text) {
  const m = text.match(GERMAN_REQUIRED);
  if (!m) return false;
  const around = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
  return !PLUS_NEARBY.test(around);
}

// Location terms match as whole words, so "uk" doesn't hit "Ukraine" and "rome" doesn't hit "Jerome".
const termRe = (t) => new RegExp(`(?:^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'iu');
const cache = new WeakMap();
function locationRules(config) {
  if (!cache.has(config)) {
    cache.set(config, {
      target: [...(config.targetLocations || []), ...(config.germanyLocations || []), 'armenia', 'yerevan', 'gyumri', 'vanadzor', 'армения', 'ереван', 'հայաստան', 'երևան'].map(termRe),
      blocked: (config.blockedLocations || []).map(termRe),
    });
  }
  return cache.get(config);
}
const REMOTE = /\b(remote|anywhere|worldwide|work from home|homeoffice|home office|wfh)\b/gi;
const REMOTE_OPEN = /\b(armenia|yerevan|anywhere|worldwide|world-wide|global(?:ly)?|unspecified|emea|international)\b/i;
const REMOTE_RESTRICTED = /\b(eu|eea|europe|european union|schengen|americas?|north america|apac|asia|only)\b/i;

// Onsite/hybrid: fine in any target country (relocation is judged later). Remote: must be open to Armenia.
export function locationProblem(job, config) {
  const loc = String(job.location || '').trim();
  if (!loc) return null;
  const { target, blocked } = locationRules(config);
  const remote = job.remote === true || new RegExp(REMOTE.source, 'i').test(loc); // REMOTE is /g: .test() would keep state

  if (remote) {
    const allowed = job.allowedCountries; // Himalayas gives an explicit list; empty = worldwide
    if (Array.isArray(allowed) && allowed.length && !allowed.some((c) => /armenia/i.test(c))) return `Remote, not open to Armenia (${loc})`;
    if (REMOTE_OPEN.test(loc)) return null;
    // "Remote — Germany" can still mean "relocate to Germany"; let the AI decide those.
    if (target.some((re) => re.test(loc))) return null;
    if (blocked.some((re) => re.test(loc)) || REMOTE_RESTRICTED.test(loc.replace(REMOTE, ''))) return `Remote, not open to Armenia (${loc})`;
    return null; // nothing recognizable — the AI reads the description
  }

  if (target.some((re) => re.test(loc))) return null;
  if (blocked.some((re) => re.test(loc))) return `Location outside target countries (${loc})`;
  return null; // unknown place name (small town, odd format) — the AI gets the country from the text
}

// Returns null if the job should be scored, or a short human reason if it's filtered out.
export function prefilter(job, config) {
  const title = job.title || '';
  if (!new RegExp(config.titleMustMatch, 'i').test(title)) return 'Not a developer role';
  if (new RegExp(config.titleExclude, 'i').test(title)) return 'Excluded role type (student, intern, embedded, SAP…)';

  const why = locationProblem(job, config);
  if (why) return why;

  const text = `${title}\n${job.description || ''}`;
  for (const re of NO_SPONSOR) {
    const m = text.match(re);
    if (m) return `Says: "${m[0].trim()}"`;
  }
  if (config.skipGermanLanguagePostings && germanRatio(job.description) > 0.06) return 'Posting written in German';
  return null;
}
