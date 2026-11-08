import { RELOCATION_POSITIVE, germanRequiredHeuristic } from './filter.js';
import { sleep } from './util.js';
import { jobCountry, jobRegions } from './countries.js';

const SYSTEM = `You screen job postings for one specific candidate. She lives in Yerevan, Armenia, and has NO EU work permit. A job abroad (Germany, other EU countries, etc.) only works if the employer hires from abroad (EU Blue Card, visa sponsorship, relocation). A job in Armenia works without any move, and a remote job works if it is open to people living in Armenia. Her profile is below.

Return ONLY a JSON object, no prose, no code fences:
{
 "relocation": "yes" | "likely" | "unclear" | "no",
 "relocation_evidence": "the exact short phrase from the posting that justifies the verdict (max 25 words), or a short reason if nothing is stated",
 "german": "none" | "nice" | "required",
 "work_mode": "onsite" | "hybrid" | "remote" | "unknown",
 "country": "country of the office in English (e.g. \"Germany\", \"Armenia\") — also when remote work is possible; \"Remote\" only if there is no office location at all",
 "other_language": "name of a language other than English, Russian or Armenian that is a MUST at working level (e.g. \"Portuguese\", \"Dutch\", \"French\"), or null — do not repeat German here",
 "role": "backend" | "frontend" | "fullstack" | "other",
 "primary_stack": "java" | "kotlin" | "vue" | "angular" | "react" | "node" | "python" | "php" | "mobile" | "other",
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
- Job in Armenia: she can take it without moving, so relocation is "yes" (evidence: "In Armenia — no move needed"). Never answer "no" just because no relocation is needed.
- Remote job: "yes" if it is explicitly open to Armenia, worldwide, or anywhere in a region that includes Armenia (e.g. EMEA, CIS); "likely"/"unclear" if it doesn't say; "no" if limited to countries she doesn't live in.
- role: "backend" = server-side work with NO frontend tasks (a frontend framework at most as a "nice to have"); "frontend" = UI work only; "fullstack" = both sides are part of the job; "other" = mobile, data, QA, management, unclear, etc.
- german "required" only when German at business/fluent/C1+ level is a must. "A plus" = "nice". (Armenian and Russian requirements are fine — she is native/C2.)
- primary_stack: the main BACKEND language/framework when the job has backend work (Java + Spring → "java", Java backend + React UI → "java", Node/Express/NestJS → "node", Django/FastAPI → "python", Laravel/Symfony → "php", Go/C#/.NET/Ruby/Scala/C++ etc. → "other"). For a frontend-only job, the main framework ("vue", "angular", "react"). "mobile" = iOS/Android/React Native/Flutter is the main work.
- seniority "lead" also covers staff, principal, architect, founding engineer, tech lead and head-of roles.
- salary: yearly EUR if stated, else nulls. Convert monthly to yearly and other currencies (AMD, RUB, USD…) to EUR.
- fit: her REALISTIC chance of being invited to interview, judged like a recruiter screening her CV. Ignore relocation and language when scoring fit. Use the "Realistic chances" section of the profile: CORE and CLOSE skills count fully, SECOND-tier (Kotlin, Python) a little lower, PERSONAL-only skills about half, and "NOT her profile" stacks (PHP, Node.js) barely at all. Bands:
  85–100: main stack is her core (Java / Spring Boot backend, Vue/TypeScript, or Java + Vue/Angular full stack), senior/mid level, at most one minor learnable gap.
  70–84: core stack with 1–2 real gaps (e.g. Kafka, Kubernetes, Hibernate, a cloud provider, a domain), or Angular-heavy roles.
  55–70: Kotlin or Python backend roles (second tier — part of her profile, a little below Java), OR core stack with many must-have gaps, OR the description is too short to judge.
  35–54: React-heavy role where her React is personal-project only; React Native / Flutter / Next.js as the main thing; lead/staff/founding level.
  0–34: PHP or Node.js backend roles (not her profile), or a main language/domain she doesn't have (Go, C#, Ruby, Scala, native mobile, ML/data, embedded, DevOps/SRE), or clearly junior/intern.
  Do not give high fit just because many keywords match — weigh the 2–3 MUST-HAVE technologies the role is built around. List personal-only skills that are must-haves in "gaps" (e.g. "React — only from personal projects").

CANDIDATE PROFILE:
`;

export function hasApiKey() { return Boolean(process.env.ANTHROPIC_API_KEY); }

// Current models think before answering by default, and that thinking counts toward max_tokens —
// leave room for it, or pass thinking: { type: 'disabled' } where the model allows it.
export async function callClaude({ model, system, user, maxTokens = 2000, thinking }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], ...(thinking ? { thinking } : {}) }),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    const body = await res.json();
    if (!res.ok) {
      const msg = body?.error?.message || JSON.stringify(body);
      const err = new Error(`Claude API ${res.status}: ${msg}`);
      // Account-level problems fail every call the same way — no point trying the next job.
      if (/credit balance/i.test(msg)) err.fatal = 'Anthropic credit balance is too low — add credits at console.anthropic.com → Plans & Billing';
      else if (res.status === 401) err.fatal = 'Anthropic API key was rejected — check ANTHROPIC_API_KEY';
      else if (res.status === 403) err.fatal = `Anthropic API refused access: ${msg}`;
      throw err;
    }
    if (body.stop_reason === 'max_tokens') throw new Error(`Claude answer was cut off at max_tokens (${maxTokens})`);
    if (body.stop_reason === 'refusal') throw new Error('Claude declined to answer this one');
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
  // A short classification doesn't need thinking; Haiku 5.5 allows turning it off at its default effort.
  // (Other models, e.g. Sonnet 5.5 / Opus 5.5, reject this — set scoring.thinking to null in config then.)
  const thinking = config.scoring.thinking === undefined ? { type: 'disabled' } : config.scoring.thinking || undefined;
  const text = await callClaude({ model: config.scoring.model, system: SYSTEM + profile, user, maxTokens: 1500, thinking });
  return { ...parseJson(text), by: 'ai' };
}

// Used when there's no Claude API key: simple keyword rules, so the radar still works.
function scoreWithRules(job, profile) {
  const text = `${job.title}\n${job.description || ''}`;
  const pos = text.match(RELOCATION_POSITIVE);
  const english = /\b(english|international team|nationalities)\b/i.test(text);
  // Commercial core skills weigh most; side-project skills count a little.
  const core = ['Java', 'Spring', 'Dropwizard', 'Vue', 'TypeScript', 'PostgreSQL', 'MongoDB', 'microservices', 'REST', 'Maven', 'GitLab', 'Docker', 'RabbitMQ', 'Keycloak'];
  const close = ['Kotlin', 'Python', 'FastAPI', 'Angular', 'MySQL', 'Jenkins', 'JavaScript'];
  const side = ['React', 'Next.js', 'Flutter', 'AWS'];
  const has = (s) => new RegExp(`\\b${s.replace('.', '\\.')}\\b`, 'i').test(text);
  const mc = core.filter(has), ml = close.filter(has), ms = side.filter(has);
  const matched = [...mc, ...ml, ...ms];
  const primary_stack = /\b(java|spring)\b/i.test(text) ? 'java' : /\bkotlin\b/i.test(text) ? 'kotlin' : /\bvue/i.test(text) ? 'vue'
    : /\bangular/i.test(text) ? 'angular' : /\b(django|fastapi|flask|python)\b/i.test(text) ? 'python' : /\b(php|laravel|symfony)\b/i.test(text) ? 'php'
    : /\b(node(?:\.?js)?|nestjs|express)\b/i.test(text) ? 'node' : /\breact\b/i.test(text) ? 'react' : 'other';
  return {
    relocation: pos ? 'yes' : english && job.description ? 'likely' : 'unclear',
    relocation_evidence: pos ? `Mentions "${pos[0]}"` : english ? 'English-speaking/international team mentioned' : 'Nothing stated',
    german: germanRequiredHeuristic(text) ? 'required' : /german|deutsch/i.test(text) ? 'nice' : 'none',
    work_mode: /hybrid/i.test(text) ? 'hybrid' : job.remote ? 'remote' : 'unknown',
    seniority: /\b(lead|principal|staff|architect|founding|head of)\b/i.test(job.title) ? 'lead' : /senior|sr\./i.test(job.title) ? 'senior' : /junior/i.test(job.title) ? 'junior' : 'unknown',
    salary: job.salary || { min: null, max: null },
    matched_skills: matched.slice(0, 6),
    gaps: [],
    primary_stack,
    fit: Math.min(90, 20 + mc.length * 10 + ml.length * 6 + ms.length * 3),
    summary: 'Keyword-based estimate (add ANTHROPIC_API_KEY for a real read of the posting).',
    by: 'rules',
  };
}

const RELOC_WEIGHT = { yes: 1, likely: 0.85, unclear: 0.6, no: 0.1 };
const GERMAN_WEIGHT = { none: 1, nice: 0.9, required: 0.3 };

// Bump when the scoring rules change: open matches scored with an older version get re-scored in later runs.
export const SCORING_VERSION = 3;

// Hard ceilings on fit, so the model can't rate a job highly on side-project skills alone.
// Java/Spring Boot/Vue are her core; Kotlin and Python a step lower; React is side-project only; PHP and Node are not her profile.
const STACK_CAP = { java: 100, vue: 100, angular: 85, kotlin: 70, python: 70, react: 55, mobile: 35, node: 30, php: 30, other: 30 };
const SENIORITY_CAP = { lead: 58, junior: 65 };

export function realisticFit(job, verdict) {
  let fit = verdict.fit ?? 50;
  const stack = String(verdict.primary_stack || '').toLowerCase();
  if (STACK_CAP[stack] != null) fit = Math.min(fit, STACK_CAP[stack]);
  if (SENIORITY_CAP[verdict.seniority] != null) fit = Math.min(fit, SENIORITY_CAP[verdict.seniority]);
  if ((job.description || '').length < 300) fit = Math.min(fit, 60); // can't judge requirements from a title
  return Math.round(fit);
}

export function finalize(job, verdict, config) {
  const salary = verdict.salary?.min || verdict.salary?.max ? verdict.salary : job.salary || null;
  const known = config.knownSponsors.some((c) => job.company && job.company.toLowerCase().includes(c.toLowerCase()));
  let relocation = verdict.relocation;
  let evidence = verdict.relocation_evidence;
  const regions = jobRegions({ ...job, verdict }, jobCountry({ ...job, verdict }));
  // A job in Armenia needs no move. Models tend to read "no relocation needed" as relocation "no", so fix it here.
  if (regions.includes('armenia') && relocation !== 'yes') { relocation = 'yes'; evidence = 'In Armenia — no move needed'; }
  if (known && (relocation === 'unclear' || relocation === 'likely')) relocation = 'likely';
  const t = config.scoring.blueCardMinEur;
  const top = salary?.max || salary?.min;
  // The Blue Card salary line only matters when she moves to the EU, not for jobs in Armenia or remote.
  const blueCard = !regions.includes('abroad') || !top ? 'unknown' : (salary.min || top) >= t ? 'ok' : top < t ? 'below' : 'unknown';
  const aiFit = verdict.fit_ai ?? verdict.fit;
  const fit = realisticFit(job, { ...verdict, fit: aiFit });
  // Known sponsors help with the move, not with the skill match — so the bonus is small and only for jobs abroad.
  const sponsorBonus = known && regions.includes('abroad') ? 5 : 0;
  const score = Math.round(Math.max(0, Math.min(100, fit * (RELOC_WEIGHT[relocation] ?? 0.6) * (GERMAN_WEIGHT[verdict.german] ?? 1) * (blueCard === 'below' ? 0.7 : 1) + sponsorBonus)));
  return { ...verdict, fit, fit_ai: aiFit, relocation, relocation_evidence: evidence, knownSponsor: known, salary, blueCard, score, v: SCORING_VERSION };
}

export async function scoreJobs(jobs, profile, config, log = console.log) {
  const useAi = hasApiKey();
  if (!useAi) log('  (no ANTHROPIC_API_KEY — using keyword rules)');
  const results = new Map();
  const queue = [...jobs];
  let done = 0;
  let failed = 0, firstError = null;
  async function worker() {
    while (queue.length && !results.fatal) {
      const job = queue.shift();
      try {
        const v = useAi ? await scoreWithClaude(job, profile, config) : scoreWithRules(job, profile);
        results.set(job.id, finalize(job, v, config));
      } catch (e) {
        if (e.fatal) {
          if (!results.fatal) log(`  AI scoring stopped: ${e.fatal}`);
          results.fatal = e.fatal; // other workers stop too; unscored jobs stay pending for the next run
          results.set(job.id, { error: e.message });
          break;
        }
        log(`  scoring failed for "${job.title}": ${e.message}`);
        results.set(job.id, { error: e.message });
        failed++; firstError ??= e.message;
      }
      if (++done % 20 === 0) log(`  scored ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: useAi ? config.scoring.concurrency : 1 }, worker));
  results.failed = failed;
  results.firstError = firstError;
  return results;
}
