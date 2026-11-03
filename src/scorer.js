import { RELOCATION_POSITIVE, germanRequiredHeuristic } from './filter.js';
import { sleep } from './util.js';

const SYSTEM = `You screen job postings for one specific candidate. She lives in Armenia and has NO EU work permit, so a job in Germany only works if the employer hires from abroad (EU Blue Card, visa sponsorship, relocation). Her profile is below.

Return ONLY a JSON object, no prose, no code fences:
{
 "relocation": "yes" | "likely" | "unclear" | "no",
 "relocation_evidence": "the exact short phrase from the posting that justifies the verdict (max 25 words), or a short reason if nothing is stated",
 "german": "none" | "nice" | "required",
 "work_mode": "onsite" | "hybrid" | "remote" | "unknown",
 "seniority": "junior" | "mid" | "senior" | "lead" | "unknown",
 "salary": { "min": number|null, "max": number|null } ,
 "matched_skills": ["max 6 of her skills that this job asks for"],
 "gaps": ["max 4 must-have requirements she does not have"],
 "fit": 0-100,
 "summary": "one plain sentence: what the job is and why it does or doesn't suit her"
}

Rules:
- relocation "yes": explicitly offers visa sponsorship, relocation support/package, Blue Card help, or says they hire from abroad.
- "likely": no explicit statement but strong signals: English as the working language, team of many nationalities, international hiring language, or the company is well known for sponsoring.
- "unclear": nothing either way, or the description is missing/very short.
- "no": requires existing EU work authorization or residence, says no sponsorship, or is remote only within a country/region she isn't in.
- german "required" only when German at business/fluent/C1+ level is a must. "A plus" = "nice".
- salary: yearly gross EUR if stated, else nulls. Convert monthly to yearly.
- fit: how well her real skills cover the MUST-HAVE requirements and seniority. Ignore relocation and language when scoring fit.

CANDIDATE PROFILE:
`;

export function hasApiKey() { return Boolean(process.env.ANTHROPIC_API_KEY); }

export async function callClaude({ model, system, user, maxTokens = 800 }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    const body = await res.json();
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${body?.error?.message || JSON.stringify(body)}`);
    return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }
  throw new Error('Claude API kept returning 429/5xx');
}

function parseJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  return JSON.parse(clean.slice(start, end + 1));
}

async function scoreWithClaude(job, profile, config) {
  const desc = job.description ? job.description.slice(0, 7000) : '(no description available — only title, company and location)';
  const user = `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}${job.remote ? ' (remote)' : ''}\nSource: ${job.source}\nTags: ${(job.tags || []).join(', ')}\n\nDescription:\n${desc}`;
  const text = await callClaude({ model: config.scoring.model, system: SYSTEM + profile, user });
  return { ...parseJson(text), by: 'ai' };
}

// Used when there's no Claude API key: simple keyword rules, so the radar still works.
function scoreWithRules(job, profile) {
  const text = `${job.title}\n${job.description || ''}`;
  const pos = text.match(RELOCATION_POSITIVE);
  const english = /\b(english|international team|nationalities)\b/i.test(text);
  const skills = ['Java', 'Spring', 'Kotlin', 'Vue', 'Angular', 'TypeScript', 'PostgreSQL', 'MongoDB', 'MySQL', 'Docker', 'AWS', 'PHP', 'Laravel', 'Flutter', 'Node', 'NestJS', 'REST', 'GitLab'];
  const matched = skills.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(text));
  return {
    relocation: pos ? 'yes' : english && job.description ? 'likely' : 'unclear',
    relocation_evidence: pos ? `Mentions "${pos[0]}"` : english ? 'English-speaking/international team mentioned' : 'Nothing stated',
    german: germanRequiredHeuristic(text) ? 'required' : /german|deutsch/i.test(text) ? 'nice' : 'none',
    work_mode: /hybrid/i.test(text) ? 'hybrid' : job.remote ? 'remote' : 'unknown',
    seniority: /senior|sr\./i.test(job.title) ? 'senior' : /lead|principal|staff/i.test(job.title) ? 'lead' : /junior/i.test(job.title) ? 'junior' : 'unknown',
    salary: job.salary || { min: null, max: null },
    matched_skills: matched.slice(0, 6),
    gaps: [],
    fit: Math.min(95, 25 + matched.length * 12),
    summary: 'Keyword-based estimate (add ANTHROPIC_API_KEY for a real read of the posting).',
    by: 'rules',
  };
}

const RELOC_WEIGHT = { yes: 1, likely: 0.85, unclear: 0.6, no: 0.1 };
const GERMAN_WEIGHT = { none: 1, nice: 0.9, required: 0.3 };

export function finalize(job, verdict, config) {
  const salary = verdict.salary?.min || verdict.salary?.max ? verdict.salary : job.salary || null;
  const known = config.knownSponsors.some((c) => job.company && job.company.toLowerCase().includes(c.toLowerCase()));
  let relocation = verdict.relocation;
  if (known && (relocation === 'unclear' || relocation === 'likely')) relocation = 'likely';
  const t = config.scoring.blueCardMinEur;
  const top = salary?.max || salary?.min;
  const blueCard = !top ? 'unknown' : (salary.min || top) >= t ? 'ok' : top < t ? 'below' : 'unknown';
  const score = Math.round(Math.max(0, Math.min(100, (verdict.fit ?? 50) * (RELOC_WEIGHT[relocation] ?? 0.6) * (GERMAN_WEIGHT[verdict.german] ?? 1) * (blueCard === 'below' ? 0.7 : 1) + (known ? 8 : 0))));
  return { ...verdict, relocation, knownSponsor: known, salary, blueCard, score };
}

export async function scoreJobs(jobs, profile, config, log = console.log) {
  const useAi = hasApiKey();
  if (!useAi) log('  (no ANTHROPIC_API_KEY — using keyword rules)');
  const results = new Map();
  const queue = [...jobs];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        const v = useAi ? await scoreWithClaude(job, profile, config) : scoreWithRules(job, profile);
        results.set(job.id, finalize(job, v, config));
      } catch (e) {
        log(`  scoring failed for "${job.title}": ${e.message}`);
        results.set(job.id, { error: e.message });
      }
      if (++done % 20 === 0) log(`  scored ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: useAi ? config.scoring.concurrency : 1 }, worker));
  return results;
}
