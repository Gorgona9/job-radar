// Backend / frontend / full stack, for the dashboard's role filter.
// The AI's answer (verdict.role, newer jobs) wins; older jobs are classified from title + description.
// "backend" means the job has no real frontend work in it — that is what a pure backend developer filters for.

const ROLES = ['backend', 'frontend', 'fullstack', 'other'];

const FULL_T = /full[\s-]?stack/i;
const FRONT_T = /front[\s-]?end|\b(react|angular|vue(?:\.?js)?|svelte|next\.?js|ui|javascript|typescript|web)\b.*\b(developer|engineer|entwickler)\b|\bui engineer/i;
const BACK_T = /back[\s-]?end|\b(java|kotlin|spring|jvm|node(?:\.?js)?|nest(?:js)?|python|php|laravel|django|fastapi|api|server|microservices?)\b/i;
const BACK_ONLY_T = /back[\s-]?end/i;

// Distinct frontend technologies a posting asks for. One passing mention ("our React team") is common in
// backend postings, so it takes two or more before a backend job counts as having frontend work.
const FRONT_TECH = [/\breact(?:\.?js)?\b/i, /\bangular(?:js)?\b/i, /\bvue(?:\.?js)?\b/i, /\bsvelte\b/i, /\bnext\.?js\b/i, /\bnuxt\b/i,
  /\bredux\b/i, /\btailwind\b/i, /\bcss3?\b/i, /\bhtml5?\b/i, /\bfront[\s-]?end\b/i, /\bui\/ux\b|\bui components?\b/i];
const BACK_TECH = [/\bjava\b/i, /\bspring\b/i, /\bkotlin\b/i, /\bnode(?:\.?js)?\b/i, /\bpython\b/i, /\bphp\b/i, /\bsql\b|postgres|mysql|mongodb/i,
  /\bmicroservices?\b/i, /\brest(?:ful)?\b|\bapis?\b/i, /\bkafka\b|rabbitmq/i, /\bback[\s-]?end\b/i];

const count = (list, text) => list.filter((re) => re.test(text)).length;

export function jobRole(job) {
  const ai = String(job.verdict?.role || '').toLowerCase().replace(/[^a-z]/g, '');
  if (ROLES.includes(ai)) return ai;
  const title = job.title || '';
  const text = `${(job.description || '').slice(0, 6000)}\n${(job.tags || []).join(' ')}`;
  const fe = count(FRONT_TECH, text), be = count(BACK_TECH, text);
  if (FULL_T.test(title)) return 'fullstack';
  const front = FRONT_T.test(title), back = BACK_T.test(title);
  if (front && !back) return 'frontend';
  if (BACK_ONLY_T.test(title) && !front) return fe >= 3 ? 'fullstack' : 'backend';
  if (back) return fe >= 2 ? 'fullstack' : 'backend';
  // Generic title ("Software Engineer"): go by what the posting asks for.
  if (fe >= 2 && be >= 2) return 'fullstack';
  if (fe >= 2) return 'frontend';
  if (be >= 2) return 'backend';
  return 'other';
}
