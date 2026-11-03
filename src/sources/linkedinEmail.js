// Reads LinkedIn job-alert emails from your mailbox over IMAP — no LinkedIn scraping,
// your LinkedIn account is never touched. Set up alerts on LinkedIn (e.g. "Java Developer",
// Germany, filter "Visa sponsorship"/"Relocation" in the keywords), delivered daily by email.
//
// Alert emails only contain title / company / location, so the AI usually marks these
// "unclear" unless the company is on your knownSponsors list. Open the link to check.

const SENDERS = ['jobalerts-noreply@linkedin.com', 'jobs-noreply@linkedin.com', 'jobs-listings@linkedin.com'];

export async function fetchLinkedinEmails(cfg) {
  const { IMAP_USER, IMAP_PASSWORD, IMAP_HOST = 'imap.gmail.com' } = process.env;
  if (!IMAP_USER || !IMAP_PASSWORD) return { skipped: 'no IMAP_USER / IMAP_PASSWORD in .env' };

  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');
  const client = new ImapFlow({ host: IMAP_HOST, port: 993, secure: true, auth: { user: IMAP_USER, pass: IMAP_PASSWORD }, logger: false });
  const since = new Date(Date.now() - (cfg.daysBack ?? 4) * 864e5);
  const jobs = [];

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    for (const from of SENDERS) {
      const uids = await client.search({ from, since }, { uid: true });
      if (!uids?.length) continue;
      for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
        const mail = await simpleParser(msg.source);
        jobs.push(...parseLinkedinAlert(mail.text || '', mail.html || '', mail.date));
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return jobs;
}

// Exported for testing. The plain-text part of an alert lists each job as:
//   Title \n Company \n Location \n ...optional lines... \n View job: https://www.linkedin.com/comm/jobs/view/123/...
export function parseLinkedinAlert(text, html = '', date = new Date()) {
  const out = new Map();
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
    if (!m || out.has(m[1])) continue;
    const before = [];
    for (let k = i - 1; k >= 0 && before.length < 6; k--) {
      const l = lines[k];
      if (!l || /^-{3,}$/.test(l)) { if (before.length >= 3) break; continue; }
      if (/linkedin\.com\/(?:comm\/)?jobs\/view\//.test(l)) break;
      before.unshift(l);
    }
    const clean = before.filter((l) => !/^(view job|apply|easy apply|actively recruiting|promoted|\d+ (connection|alum)|be an early applicant|this company is actively hiring|school alumni|new)\b/i.test(l));
    const [title, company, location] = clean;
    if (!title) continue;
    out.set(m[1], {
      source: 'linkedin',
      sourceId: m[1],
      title, company: company || '', location: location || '',
      url: `https://www.linkedin.com/jobs/view/${m[1]}/`,
      description: '',
      postedAt: new Date(date).toISOString(),
      remote: /remote/i.test(location || '') || null,
      tags: [],
      shortDescription: true,
    });
  }
  // HTML fallback: just ids + anchor text, when the text part is missing
  if (!out.size && html) {
    const re = /href="[^"]*linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title || out.has(m[1]) || /view job|see all/i.test(title)) continue;
      out.set(m[1], { source: 'linkedin', sourceId: m[1], title, company: '', location: '', url: `https://www.linkedin.com/jobs/view/${m[1]}/`, description: '', postedAt: new Date(date).toISOString(), remote: null, tags: [], shortDescription: true });
    }
  }
  return [...out.values()];
}
