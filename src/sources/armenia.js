import { stripHtml, sleep } from '../util.js';

const UA = 'job-radar/1.0 (personal job search)';

// The page data Next.js sites embed in every page (<script id="__NEXT_DATA__">).
function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('page format changed (no __NEXT_DATA__)');
  return JSON.parse(m[1]).props?.pageProps || {};
}

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!res.ok) { const e = new Error(`${res.status} ${res.statusText} for ${url}`); e.status = res.status; throw e; }
  return res.text();
}

const en = (o) => (o && (o.en || o.am_en || o.ru || o.am)) || '';

// staff.am — Armenia's biggest job board. Reads the ordinary public category pages and job pages
// (the paths its robots.txt allows; search URLs with "?query" are not used), with a pause between pages.
export async function fetchStaffAm(cfg, config) {
  const titleOk = new RegExp(config.titleMustMatch, 'i');
  const titleBad = new RegExp(config.titleExclude, 'i');
  const known = config._knownIds || new Set();
  const jobs = [], errors = [];
  let details = 0;
  for (const category of cfg.categories || ['software-development']) {
    for (let page = 1; page <= (cfg.maxPages ?? 3); page++) {
      let list;
      try { list = nextData(await getText(`https://staff.am/en/jobs/${category}${page > 1 ? `?page=${page}` : ''}`)).jobs || []; }
      catch (e) {
        errors.push(`staff.am ${category}: ${e.message}`);
        if (e.status === 403 || e.status === 429) return { jobs, errors }; // blocked or rate-limited: stop, don't push
        break;
      }
      if (!list.length) break;
      for (const j of list) {
        const title = en(j.title).replace(/&amp;/g, '&');
        const slug = j.slug?.en || j.slug?.am_en;
        if (!j.id || !slug || !titleOk.test(title) || titleBad.test(title)) continue;
        const job = {
          source: 'staffam', sourceId: String(j.id),
          title, company: en(j.companiesStruct?.title).trim(),
          location: `${en(j.job_city?.title) || 'Yerevan'}, Armenia${j.is_remote ? ' (remote possible)' : ''}`,
          url: `https://staff.am/en/jobs/${j.category?.code || category}/${slug}`,
          description: '', postedAt: j.activated_at?.staffam ? new Date(j.activated_at.staffam.replace(' ', 'T') + '+04:00').toISOString() : null,
          remote: null, tags: ['staff.am'],
        };
        // Full text from the job page, for jobs we don't have yet (capped per run; the rest wait for the next run).
        if (!known.has(`staffam:${job.sourceId}`)) {
          if (details >= (cfg.maxDetails ?? 40)) continue;
          try {
            const d = nextData(await getText(job.url)).job || {};
            job.description = [en(d.description), en(d.responsibilities) && 'Responsibilities:\n' + en(d.responsibilities),
              en(d.required_qualifications) && 'Requirements:\n' + en(d.required_qualifications), en(d.additional_information)]
              .filter(Boolean).map(stripHtml).join('\n\n');
            const skills = (d.skills || []).map((s) => en(s.title)).filter(Boolean);
            if (skills.length) job.tags.push(...skills.slice(0, 12));
            if (d.job_type) job.tags.push(en(d.job_type.title));
            details++;
          } catch (e) { errors.push(`staff.am job ${job.sourceId}: ${e.message}`); continue; }
          await sleep(cfg.delayMs ?? 1500);
        }
        jobs.push(job);
      }
      await sleep(cfg.delayMs ?? 1500);
    }
  }
  return { jobs, errors };
}

// hh.ru (HeadHunter) — covers Armenia (area 13) and remote jobs from Russian-speaking companies.
// Its vacancy search only answers registered apps: create one at https://dev.hh.ru (free), get an
// application token, and put it in HH_ACCESS_TOKEN. Without it this source is skipped.
const HH_COUNTRY = { 13: 'Armenia', 113: 'Russia', 40: 'Kazakhstan', 28: 'Georgia', 16: 'Belarus', 97: 'Uzbekistan', 9: 'Azerbaijan' };

export async function fetchHh(cfg, config) {
  const token = process.env.HH_ACCESS_TOKEN;
  if (!token) return { jobs: [], skipped: 'no HH_ACCESS_TOKEN — hh.ru only answers registered apps (free at dev.hh.ru)' };
  const headers = { 'HH-User-Agent': UA, 'user-agent': UA, authorization: `Bearer ${token}` };
  const get = async (url) => {
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`${res.status} ${body.errors?.map((x) => x.value || x.type).join(', ') || res.statusText}`);
      e.stop = [401, 403, 429].includes(res.status);
      throw e;
    }
    return body;
  };
  const known = config._knownIds || new Set();
  const jobs = new Map(), errors = [];
  // Each search: an area, optionally remote-only. Armenia: everything; Russia etc.: remote jobs only.
  const searches = [
    ...(cfg.areas || ['13']).map((area) => ({ area, remote: false })),
    ...(cfg.remoteAreas || []).map((area) => ({ area, remote: true })),
  ];
  outer: for (const s of searches) {
    for (const text of cfg.searchTerms || config.searchTerms) {
      const qs = new URLSearchParams({ text, area: s.area, per_page: String(cfg.perPage ?? 50), period: String(cfg.daysBack ?? 7), search_field: 'name' });
      if (s.remote) qs.set('schedule', 'remote');
      try {
        const body = await get(`https://api.hh.ru/vacancies?${qs}`);
        for (const v of body.items || []) {
          if (jobs.has(v.id)) continue;
          const remote = s.remote || v.schedule?.id === 'remote';
          const country = HH_COUNTRY[s.area] || '';
          const sal = v.salary;
          jobs.set(v.id, {
            source: 'hh', sourceId: String(v.id),
            title: v.name, company: v.employer?.name || '',
            location: remote ? `Remote — ${country || v.area?.name || 'unspecified'}` : [v.area?.name, country].filter(Boolean).join(', '),
            url: v.alternate_url,
            description: stripHtml([v.snippet?.responsibility, v.snippet?.requirement].filter(Boolean).join('\n')),
            shortDescription: true,
            postedAt: v.published_at ? new Date(v.published_at).toISOString() : null,
            remote: remote || null, tags: ['hh.ru'],
            salaryText: sal ? `${sal.from || ''}–${sal.to || ''} ${sal.currency}${sal.gross ? ' gross' : ' net'} / month` : null,
          });
        }
      } catch (e) { errors.push(`hh "${text}" area ${s.area}: ${e.message}`); if (e.stop) break outer; }
      await sleep(cfg.delayMs ?? 600);
    }
  }
  // Full text for new vacancies (capped per run).
  let details = 0;
  for (const job of jobs.values()) {
    if (details >= (cfg.maxDetails ?? 60) || known.has(`hh:${job.sourceId}`)) continue;
    try {
      const d = await get(`https://api.hh.ru/vacancies/${job.sourceId}`);
      job.description = stripHtml(d.description || '') || job.description;
      job.shortDescription = false;
      job.tags.push(...(d.key_skills || []).map((k) => k.name).slice(0, 12));
      details++;
    } catch (e) { errors.push(`hh vacancy ${job.sourceId}: ${e.message}`); if (e.stop) break; }
    await sleep(cfg.delayMs ?? 600);
  }
  return { jobs: [...jobs.values()], errors };
}
