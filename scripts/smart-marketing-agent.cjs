#!/usr/bin/env node
/**
 * smart-marketing-agent.cjs
 *
 * One command does everything:
 *  1. Gemini writes fresh, platform-specific content for you
 *  2. Auto-posts a full article to Dev.to and Hashnode (no clicks)
 *  3. Opens social share dialogs with Playwright, fills them, and submits
 *  4. Writes an HTML report so you can see what was done
 *
 * Usage:
 *   node scripts/smart-marketing-agent.cjs
 *   node scripts/smart-marketing-agent.cjs --dry-run   (preview content, no posting)
 *   node scripts/smart-marketing-agent.cjs --only=devto,hashnode
 *   node scripts/smart-marketing-agent.cjs --only=social
 */
'use strict';

require('dotenv').config();
const { chromium }     = require('playwright');
const fs               = require('fs');
const path             = require('path');
const https            = require('https');
const { execFileSync } = require('child_process');
const crypto           = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Config ────────────────────────────────────────────────────────────────────
const ROOT         = path.resolve(__dirname, '..');
const SCRATCH      = path.join(ROOT, 'scratch');
const PROFILE      = path.join(SCRATCH, 'posting-agent-profile');
const REPORT_PATH  = path.join(SCRATCH, 'smart-marketing-report.html');
const CONTENT_CACHE = path.join(SCRATCH, 'marketing-content-cache.json');

const SITE_URL       = 'https://www.global-lms.org/';
const SITE_NAME      = 'Global LMS';
const SUPPORT_EMAIL  = 'support@global-lms.org';

const GEMINI_API_KEY  = process.env.GOOGLE_API_KEY || '';
const DEVTO_API_KEY   = process.env.DEVTO_API_KEY  || '';
const HASHNODE_TOKEN  = process.env.HASHNODE_TOKEN  || '';
const HASHNODE_PUB_ID = process.env.HASHNODE_PUB_ID || ''; // optional Publication ID

fs.mkdirSync(SCRATCH, { recursive: true });

const DRY_RUN  = process.argv.includes('--dry-run');
const FRESH    = process.argv.includes('--fresh');
const ONLY_ARG = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '').toLowerCase();
const ONLY     = ONLY_ARG ? ONLY_ARG.split(',').map(s => s.trim()) : [];

const shouldRun = (name) => ONLY.length === 0 || ONLY.some(o => name.toLowerCase().includes(o));

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[agent] ${msg}`); }

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({ hostname, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'Mozilla/5.0 (compatible; GlobalLMS-Bot/1.0)', ...headers } }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function setClipboard(text) {
  const tmp = path.join(SCRATCH, '_clip.txt');
  fs.writeFileSync(tmp, text, 'utf8');
  if (process.platform === 'win32') {
    try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Get-Content -Raw -LiteralPath '${tmp.replace(/'/g, "''")}' | Set-Clipboard`]); } catch {}
  }
}

// ── Content cache (7-day TTL so Gemini isn't called on every run) ─────────────
function loadContentCache() {
  if (FRESH) return null;  // --fresh forces regeneration
  try {
    const c = JSON.parse(fs.readFileSync(CONTENT_CACHE, 'utf8'));
    if (Date.now() - (c.ts || 0) < 7 * 24 * 60 * 60 * 1000) return c;
  } catch {}
  return null;
}
function saveContentCache(content) {
  fs.writeFileSync(CONTENT_CACHE, JSON.stringify({ ...content, ts: Date.now() }, null, 2));
}

// ── AI content generation via Gemini ─────────────────────────────────────────
async function generateContent() {
  const cached = loadContentCache();
  if (cached) { log('Using cached AI content (< 7 days old)'); return cached; }
  if (!GEMINI_API_KEY) {
    log('No GOOGLE_API_KEY — using static fallback content');
    return buildStaticContent();
  }

  log('Generating fresh content with Gemini…');
  const prompt = `You are a marketing writer for "${SITE_NAME}" (${SITE_URL}).

${SITE_NAME} is a standards-aligned K-12 curriculum warehouse. It gives teachers, homeschool families, and schools instantly ready lessons, units, and full courses organized by country, grade, and subject. Paid access in standard regions keeps free access open in high-need communities worldwide.

Write all of the following. Use a warm, confident, educator-friendly tone. Do not use buzzwords or hype. Be specific.

1. BLOG_TITLE: A compelling blog post title (max 12 words)
2. BLOG_INTRO: An engaging 2-paragraph introduction for a blog post about a real teaching problem that ${SITE_NAME} solves. Start with a teacher's situation or story — put them in the scene. Then introduce ${SITE_NAME} as the solution.
3. BLOG_BODY: Three sections of the blog post, each with a heading and 3–4 paragraphs. Cover: (a) the problem teachers face with lesson planning time, (b) how ${SITE_NAME} works (curriculum by country/grade/subject, standards-aligned), (c) global access and the free/paid model. Make it feel like a real article a teacher would read and share.
4. BLOG_CTA: A strong 2-sentence call to action to visit ${SITE_URL}
5. LINKEDIN_POST: A LinkedIn post for K-12 educators and school leaders. 200–250 words. Professional, specific, starts with a hook. Ends with a question that invites comments. Include ${SITE_URL}
6. FACEBOOK_POST: A Facebook post for teacher communities. 100–150 words. Warm and conversational. Ends with a question. Include ${SITE_URL}
7. TWITTER_POST: A tweet. Max 270 chars. Hook + one specific benefit + URL. No hashtag spam — max 2 relevant hashtags.
8. FORUM_POST: A post for a teacher forum or subreddit (r/Teachers, r/homeschool). 100–130 words. Community-first tone, not promotional. Offers real value, mentions ${SITE_NAME} as a resource naturally.

Format your response EXACTLY like this — use the labels as section delimiters:
===BLOG_TITLE===
(text)
===BLOG_INTRO===
(text)
===BLOG_BODY===
(text)
===BLOG_CTA===
(text)
===LINKEDIN_POST===
(text)
===FACEBOOK_POST===
(text)
===TWITTER_POST===
(text)
===FORUM_POST===
(text)`;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.8, maxOutputTokens: 3000 } });
    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    if (!raw) throw new Error('Empty Gemini response');

    const parse = (key) => {
      const m = raw.match(new RegExp(`===\\s*${key}\\s*===\\s*([\\s\\S]*?)(?====|$)`));
      return m ? m[1].trim() : '';
    };

    const content = {
      blogTitle:   parse('BLOG_TITLE')   || `How ${SITE_NAME} Is Cutting K-12 Lesson Planning Time Worldwide`,
      blogIntro:   parse('BLOG_INTRO')   || '',
      blogBody:    parse('BLOG_BODY')    || '',
      blogCta:     parse('BLOG_CTA')     || `Visit ${SITE_URL} and load your first lesson in minutes. No setup required.`,
      linkedin:    parse('LINKEDIN_POST') || buildStaticContent().linkedin,
      facebook:    parse('FACEBOOK_POST') || buildStaticContent().facebook,
      twitter:     parse('TWITTER_POST')  || buildStaticContent().twitter,
      forum:       parse('FORUM_POST')    || buildStaticContent().forum,
    };

    saveContentCache(content);
    log('Content generated and cached.');
    return content;
  } catch (err) {
    log(`Gemini error: ${err.message} — using static fallback`);
    return buildStaticContent();
  }
}

function buildStaticContent() {
  return {
    blogTitle:  `Teachers Shouldn't Rebuild Every Lesson — Here's the Alternative`,
    blogIntro:  `Picture this: it's Sunday evening, and a teacher is building tomorrow's lesson from scratch — again. Not because they don't know their subject, but because curriculum prep takes hours that should be spent on students.\n\nGlobal LMS was built to change that. It's a K-12 curriculum warehouse where teachers, homeschool families, and schools can load standards-aligned lessons, units, and full courses instantly — organized by country, grade, and subject.`,
    blogBody:   `## The Planning Problem Nobody Talks About Enough\n\nTeachers spend an average of 7–12 hours per week on lesson planning. For a profession already stretched thin by grading, communication, and classroom management, that time is a serious cost. And it falls disproportionately on newer teachers who haven't built a personal archive yet, and on educators in regions where quality curriculum materials are expensive or simply unavailable.\n\nThe result is that classroom quality depends heavily on individual teacher capacity — not just on what they know, but on how much time they had to prepare. That's a system problem, not a teacher problem.\n\n## How Global LMS Works\n\nGlobal LMS gives you a curriculum warehouse, not another tool to learn. You choose a country, grade, and subject — and the lesson is ready. Each package includes a student lesson, teacher plan, worksheet, quiz, answer key, and a mix-and-match activity. Standards are mapped to the relevant national framework so you're not guessing about alignment.\n\nCurriculums are available across K-12 for dozens of subjects, from core academics to career and technical education, arts, health, and world languages. The system supports multiple languages and adapts to regional standards, so it's genuinely usable by educators in the US, UK, Canada, Australia, and well beyond.\n\n## Access That Reflects Reality\n\nGlobal LMS uses a tiered pricing model: paid access in standard regions, lower pricing in emerging markets, and free access in high-need communities. The goal is that the teachers and families who need curriculum most don't get priced out of it. Paid access from standard-tier regions directly subsidizes free access elsewhere — it's built into the model.`,
    blogCta:    `Visit ${SITE_URL} and load your first lesson in under two minutes. No account required to browse — just pick a grade, subject, and country.`,
    linkedin:   `Most teachers spend Sunday evenings doing something they shouldn't have to: rebuilding lessons from scratch.\n\nI've been working on a curriculum warehouse called Global LMS (${SITE_URL}) that gives K-12 educators ready-to-load lessons, units, and full courses — organized by country, grade, and subject. Standards-aligned. No setup. The package includes a student lesson, teacher plan, worksheet, quiz, and answer key.\n\nThe access model matters to me: paid tiers in standard regions, regional pricing elsewhere, and free access in high-need communities. If teachers with resources pay a modest amount, that directly subsidizes access for teachers who can't.\n\nI'm looking for feedback from educators at all levels — what would make this more useful in your classroom or school? What's missing? What would you trust and what would you question?\n\nIf you know a teacher who'd find this useful, I'd appreciate a share more than a like. ${SITE_URL}`,
    facebook:   `Hey teachers and homeschool families — quick question: how many hours a week do you spend on lesson planning?\n\nI built Global LMS (${SITE_URL}) to cut that time significantly. You pick a country, grade, and subject, and you get a ready lesson package: student reading, teacher plan, worksheet, quiz, and answer key. Standards-aligned for your region.\n\nFree access in high-need regions. Affordable everywhere else.\n\nWould love feedback from real teachers — what's your biggest planning pain point right now?`,
    twitter:    `Teachers spend ~10 hrs/week on lesson planning. Global LMS gives K-12 educators ready lessons, units & courses by country, grade & subject — standards-aligned, no setup. Free in high-need regions. ${SITE_URL} #edtech #teachers`,
    forum:      `Hey everyone — I've been quietly working on something for the last year and finally feel ready to share it with a real teacher community. It's called Global LMS (${SITE_URL}) — basically a curriculum warehouse where you can load a standards-aligned lesson, unit, or full course by country, grade, and subject. Includes a student reading, teacher plan, worksheet, quiz, and answer key.\n\nI'm not here to pitch. I'd genuinely like to know: what do real teachers actually need from a tool like this? What would make you trust it or dismiss it? Free to browse, no account needed.`,
  };
}

// ── Build full blog article ───────────────────────────────────────────────────
function buildBlogArticle(content) {
  return `${content.blogIntro}

${content.blogBody}

---

${content.blogCta}`;
}

// ── Post to Dev.to ────────────────────────────────────────────────────────────
async function postToDevTo(content) {
  if (!DEVTO_API_KEY) return { status: 'skipped', reason: 'No DEVTO_API_KEY in .env' };
  log('Posting to Dev.to…');
  try {
    const body = buildBlogArticle(content);
    const res = await httpsPost(
      'dev.to',
      '/api/articles',
      { 'api-key': DEVTO_API_KEY },
      { article: { title: content.blogTitle, body_markdown: body, published: true, tags: ['education', 'teaching', 'k12', 'curriculum'] } }
    );
    if (res.status === 201) {
      const url = res.body?.url || 'https://dev.to';
      log(`✓ Dev.to posted: ${url}`);
      return { status: 'posted', url };
    }
    const errMsg = (typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.body)).slice(0, 300);
    log(`Dev.to error (HTTP ${res.status}): ${errMsg}`);
    return { status: 'error', reason: `HTTP ${res.status}: ${errMsg}` };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

// ── Post to Hashnode ──────────────────────────────────────────────────────────
async function postToHashnode(content) {
  if (!HASHNODE_TOKEN) return { status: 'skipped', reason: 'No HASHNODE_TOKEN in .env' };
  log('Posting to Hashnode…');
  try {
    const body = buildBlogArticle(content);
    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { url title }
        }
      }`;
    const input = {
      title: content.blogTitle,
      contentMarkdown: body,
      tags: [{ slug: 'education', name: 'Education' }, { slug: 'teaching', name: 'Teaching' }],
      ...(HASHNODE_PUB_ID ? { publicationId: HASHNODE_PUB_ID } : {})
    };
    const res = await httpsPost(
      'gql.hashnode.com',
      '/graphql',
      { Authorization: HASHNODE_TOKEN },
      { query: mutation, variables: { input } }
    );
    const post = res.body?.data?.publishPost?.post;
    if (post) {
      log(`✓ Hashnode posted: ${post.url}`);
      return { status: 'posted', url: post.url };
    }
    const err = res.body?.errors?.[0]?.message || JSON.stringify(res.body).slice(0, 200);
    return { status: 'error', reason: err };
  } catch (err) {
    return { status: 'error', reason: err.message };
  }
}

// ── Social share via Playwright ───────────────────────────────────────────────
async function runSocialPlatforms(content) {
  const socialTargets = [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE_URL)}`,
      draft: content.linkedin,
      submitSelector: 'button[type="submit"], button.share-actions__primary-action, button[aria-label*="Post" i], button[aria-label*="Share" i]',
    },
    {
      id: 'facebook',
      name: 'Facebook',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE_URL)}`,
      draft: content.facebook,
      submitSelector: 'button[type="submit"], div[aria-label*="Post" i], span[data-testid*="post" i]',
    },
    {
      id: 'twitter',
      name: 'X / Twitter',
      url: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(content.twitter),
      draft: content.twitter,
      submitSelector: 'div[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]',
    },
    {
      id: 'reddit-teachers',
      name: 'Reddit r/Teachers',
      url: 'https://www.reddit.com/r/Teachers/submit?type=text',
      draft: content.forum,
      titleValue: content.blogTitle,
      submitSelector: 'button[type="submit"]',
    },
  ];

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 860 },
      args: ['--start-maximized'],
    });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: false,
      viewport: { width: 1280, height: 860 },
    });
  }

  const results = [];

  for (const target of socialTargets) {
    if (!shouldRun('social') && !shouldRun(target.id)) continue;
    setClipboard(target.draft);
    const page = await context.newPage();
    let status = 'opened';

    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(2000);

      // Fill title field if present (Reddit, Product Hunt)
      if (target.titleValue) {
        try {
          const titleInput = page.locator('input[name*="title" i], input[placeholder*="title" i], textarea[placeholder*="title" i]').first();
          if (await titleInput.count()) { await titleInput.fill(target.titleValue); }
        } catch {}
      }

      // Fill main text area / contenteditable
      let filled = false;
      try {
        const ta = page.locator('textarea').first();
        if (await ta.count()) { await ta.fill(target.draft); filled = true; }
      } catch {}
      if (!filled) {
        try {
          const ce = page.locator('[contenteditable="true"]').first();
          if (await ce.count()) { await ce.click(); await page.keyboard.insertText(target.draft); filled = true; }
        } catch {}
      }
      status = filled ? 'filled' : 'opened (could not fill — logged in?)';

      // Auto-submit if we filled successfully (and not dry run)
      if (filled && !DRY_RUN) {
        try {
          await page.waitForTimeout(1000);
          const btn = page.locator(target.submitSelector).first();
          if (await btn.count()) {
            const disabled = await btn.getAttribute('disabled');
            if (!disabled) {
              await btn.click({ timeout: 5000 });
              await page.waitForTimeout(2500);
              status = 'submitted';
            } else {
              status = 'filled — submit button disabled (needs login?)';
            }
          } else {
            status = 'filled — submit button not found (needs login?)';
          }
        } catch (e) {
          status = `filled — submit error: ${e.message.split('\n')[0]}`;
        }
      } else if (DRY_RUN) {
        status = 'dry run — filled, not submitted';
      }

      await page.bringToFront();
    } catch (err) {
      status = `error: ${err.message.split('\n')[0]}`;
    }

    log(`${target.name}: ${status}`);
    results.push({ ...target, status });
  }

  // Keep browser open so user can review / retry manually if anything failed
  log('Browser open — review any pages that need manual login, then close it when done.');
  return { context, results };
}

// ── HTML Report ───────────────────────────────────────────────────────────────
function writeReport({ content, devto, hashnode, social }) {
  const statusBadge = (s) => {
    if (!s) return '';
    const color = s.status === 'posted' ? '#16a34a' : s.status === 'submitted' ? '#2563eb' : s.status === 'skipped' ? '#6b7280' : s.status.startsWith('dry') ? '#d97706' : '#dc2626';
    return `<span style="background:${color};color:#fff;padding:2px 10px;border-radius:999px;font-size:13px">${s.status}</span>`;
  };

  const platformRow = (r) => `
    <tr>
      <td style="padding:10px 14px;font-weight:600">${r.name}</td>
      <td style="padding:10px 14px">${statusBadge(r)}</td>
      <td style="padding:10px 14px;color:#374151;font-size:13px">${r.reason || r.url || r.status || ''}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Smart Marketing Agent Report</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#1e293b;margin:0;padding:32px}
    main{max-width:1020px;margin:0 auto}
    h1,h2{color:#fff}.lead{color:#94a3b8}
    section{background:#fff;border-radius:16px;padding:24px;margin:20px 0}
    pre{white-space:pre-wrap;background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:13px;line-height:1.6}
    table{width:100%;border-collapse:collapse}
    tr{border-bottom:1px solid #e2e8f0}
    a{color:#2563eb}
  </style>
</head>
<body>
<main>
  <h1>Smart Marketing Agent — Report</h1>
  <p class="lead">Run at ${new Date().toLocaleString()}${DRY_RUN ? ' · DRY RUN' : ''}</p>

  <section>
    <h2>Auto-Posted (API)</h2>
    <table>
      <tr>${platformRow({ name: 'Dev.to', ...devto })}</tr>
      <tr>${platformRow({ name: 'Hashnode', ...hashnode })}</tr>
    </table>
  </section>

  <section>
    <h2>Social Platforms (Browser)</h2>
    <table>
      ${social.map(platformRow).join('')}
    </table>
  </section>

  <section>
    <h2>Generated Content Preview</h2>
    <h3>Blog Article</h3>
    <pre>${(content.blogTitle + '\n\n' + buildBlogArticle(content)).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
    <h3>LinkedIn</h3>
    <pre>${content.linkedin.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
    <h3>Facebook</h3>
    <pre>${content.facebook.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
    <h3>X / Twitter</h3>
    <pre>${content.twitter.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
    <h3>Forum Post</h3>
    <pre>${content.forum.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>
  </section>
</main>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
  return REPORT_PATH;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n──────────────────────────────────────────────');
  console.log('  Smart Marketing Agent for Global LMS');
  if (DRY_RUN) console.log('  MODE: DRY RUN — content generated, nothing posted');
  console.log('──────────────────────────────────────────────\n');

  // 1. Generate content
  const content = await generateContent();
  log(`Blog title: "${content.blogTitle}"`);

  // 2. API posts (no browser, fully automatic)
  let devto    = { status: 'skipped', reason: 'No DEVTO_API_KEY' };
  let hashnode = { status: 'skipped', reason: 'No HASHNODE_TOKEN' };

  if (!DRY_RUN) {
    if (shouldRun('devto') || shouldRun('api') || ONLY.length === 0) devto    = await postToDevTo(content);
    if (shouldRun('hashnode') || shouldRun('api') || ONLY.length === 0) hashnode = await postToHashnode(content);
  } else {
    devto    = { status: 'dry run', reason: 'Would post if API key is set' };
    hashnode = { status: 'dry run', reason: 'Would post if API key is set' };
  }

  // 3. Social via browser
  let socialResults = [];
  let browserContext;
  if (shouldRun('social') || ONLY.length === 0) {
    const { context, results } = await runSocialPlatforms(content);
    socialResults = results;
    browserContext = context;
  }

  // 4. Write report and open it
  const reportPath = writeReport({ content, devto, hashnode, social: socialResults });
  log(`\nReport saved: ${reportPath}`);

  if (browserContext) {
    try {
      const reportPage = await browserContext.newPage();
      await reportPage.goto(`file://${reportPath.replace(/\\/g, '/')}`);
      await reportPage.bringToFront();
    } catch {}
  } else {
    // Open report in default browser if no Playwright context
    try { execFileSync('cmd', ['/c', 'start', reportPath]); } catch {}
  }

  console.log('\n✅  Done. Check the report page and the browser tabs above.');
  console.log('   Any platform that needs login: log in now, then the draft is already on your clipboard.\n');
})();
