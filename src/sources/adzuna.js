import { fetchJson, stripHtml, sleep } from '../util.js';
import { jobCountry } from '../countries.js';

// Adzuna's country codes → the name we add to the location, so the dashboard's country filter
// always gets it right (Adzuna often gives just a city or region).
const COUNTRY_NAMES = {
  de: 'Germany', nl: 'Netherlands', gb: 'United Kingdom', at: 'Austria', pl: 'Poland', es: 'Spain',
  ch: 'Switzerland', be: 'Belgium', it: 'Italy', fr: 'France', ie: 'Ireland', pt: 'Portugal',
  ca: 'Canada', au: 'Australia', nz: 'New Zealand', sg: 'Singapore', us: 'United States',
};
// Salaries are only kept where Adzuna reports euros; other currencies would be compared
// against the (euro) Blue Card threshold and shown with a € sign.
const EURO = new Set(['de', 'nl', 'at', 'es', 'be', 'it', 'fr', 'ie', 'pt']);

// Free key from https://developer.adzuna.com. Descriptions are shortened (~500 chars),
// so the AI verdict is often "unclear" — open the link for the full text.
// Searches every country in sources.adzuna.countries (default: Germany only).
export async function fetchAdzuna(cfg, searchTerms) {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return { skipped: 'no ADZUNA_APP_ID / ADZUNA_APP_KEY in .env' };
  const countries = cfg.countries?.length ? cfg.countries.map((c) => String(c).toLowerCase()) : ['de'];
  const terms = cfg.searchTerms?.length ? cfg.searchTerms : searchTerms;
  const jobs = [], errors = [];
  for (const cc of countries) {
    for (const term of terms) {
      const qs = new URLSearchParams({
        app_id: id, app_key: key, what: term,
        results_per_page: String(cfg.resultsPerTerm ?? 50),
        max_days_old: String(cfg.maxDaysOld ?? 7),
        sort_by: 'date',
      });
      try {
        const body = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${cc}/search/1?${qs}`);
        for (const j of body.results || []) jobs.push(toJob(j, cc));
      } catch (e) {
        // The API puts the key in the query string — keep it out of logs and Telegram.
        errors.push(`adzuna/${cc} "${term}": ${e.message.replace(/app_(id|key)=[^&\s]+/g, 'app_$1=…')}`);
        if (/^(401|403)\b/.test(e.message)) return { jobs, errors }; // bad key: every call would fail
      }
      await sleep(cfg.delayMs ?? 2600); // stay under Adzuna's per-minute limit
    }
  }
  return { jobs, errors };
}

function toJob(j, cc) {
  const predicted = String(j.salary_is_predicted) === '1';
  const name = COUNTRY_NAMES[cc];
  const place = j.location?.display_name || '';
  // Add the country unless the place already names it ("Deutschland", "London, UK"…).
  const location = name && jobCountry({ location: place }) !== name ? [place, name].filter(Boolean).join(', ') : place;
  return {
    source: 'adzuna',
    sourceId: String(j.id),
    title: stripHtml(j.title),
    company: j.company?.display_name || '',
    location,
    url: j.redirect_url,
    description: stripHtml(j.description),
    postedAt: j.created || null,
    remote: null,
    tags: [],
    // Figures under €10k are day/hour rates, not yearly salaries.
    salary: !predicted && EURO.has(cc) && j.salary_min >= 10000 ? { min: Math.round(j.salary_min), max: Math.round(j.salary_max || j.salary_min), currency: 'EUR' } : null,
    shortDescription: true,
  };
}
