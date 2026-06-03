#!/usr/bin/env node
/**
 * directory-submitter.cjs
 *
 * Finds and submits Global LMS to EdTech directories, LMS listings,
 * software review sites, and school-facing marketplaces automatically.
 *
 * Usage:
 *   node scripts/directory-submitter.cjs                  -- all directories
 *   node scripts/directory-submitter.cjs --category=edtech
 *   node scripts/directory-submitter.cjs --category=software
 *   node scripts/directory-submitter.cjs --category=schools
 *   node scripts/directory-submitter.cjs --category=startup
 *   node scripts/directory-submitter.cjs --reset           -- re-submit everything
 *   node scripts/directory-submitter.cjs --list            -- show all directories
 *
 * Status is saved to scratch/directory-status.json so already-submitted
 * directories are skipped on future runs.
 */
'use strict';

require('dotenv').config();
const { chromium }     = require('playwright');
const fs               = require('fs');
const path             = require('path');
const { execFileSync } = require('child_process');

const ROOT        = path.resolve(__dirname, '..');
const SCRATCH     = path.join(ROOT, 'scratch');
const STATUS_FILE = path.join(SCRATCH, 'directory-status.json');
const REPORT_PATH = path.join(SCRATCH, 'directory-report.html');
const PROFILE     = path.join(SCRATCH, 'directory-agent-profile');

fs.mkdirSync(SCRATCH, { recursive: true });

const SITE_URL      = 'https://www.global-lms.org/';
const SITE_NAME     = 'Global LMS';
const SUPPORT_EMAIL = 'support@global-lms.org';

const CATEGORY_ARG = (process.argv.find(a => a.startsWith('--category=')) || '').replace('--category=', '').toLowerCase();
const RESET        = process.argv.includes('--reset');
const LIST_ONLY    = process.argv.includes('--list');

// ── Product info used to fill submission forms ────────────────────────────────
const product = {
  name:        SITE_NAME,
  url:         SITE_URL,
  email:       SUPPORT_EMAIL,
  tagline:     'Standards-aligned K-12 lessons, units, and courses for every country.',
  shortDesc:   `${SITE_NAME} is a K-12 curriculum warehouse that gives teachers, homeschool families, and schools instantly ready lessons, units, and full courses — organized by country, grade, and subject. Standards-aligned. No setup required.`,
  longDesc:    `${SITE_NAME} is a standards-aligned K-12 curriculum warehouse designed to reduce teacher planning time and improve access to quality curriculum worldwide. Educators choose a country, grade, and subject, and receive a complete package: student reading, teacher plan, worksheet, quiz, answer key, and a hands-on activity. Curriculum is mapped to national standards frameworks for the US, UK, Canada, Australia, and dozens of other countries. The access model uses tiered pricing — paid in standard regions, reduced pricing in emerging markets, and free access in high-need communities worldwide. Paid subscriptions directly subsidize free access elsewhere.`,
  category:    'Learning Management System / K-12 Curriculum / Education Technology',
  pricing:     'Freemium — free in high-need regions; lessons from $5, units from $10, courses from $100 in standard regions.',
  keywords:    'LMS, K-12 curriculum, lesson plans, teacher resources, homeschool, education technology, standards-aligned, global education',
  logo:        `${SITE_URL}favicon.ico`,
  founded:     '2024',
};

// ── Directory database ────────────────────────────────────────────────────────
// Each entry: id, name, category, url (submission page), formStrategy, notes
const directories = [

  // ── EdTech-specific ───────────────────────────────────────────
  {
    id: 'edsurge',
    name: 'EdSurge Product Index',
    category: 'edtech',
    url: 'https://www.edsurge.com/research/guides/what-research-says-about-edtech-products',
    submitUrl: 'https://www.edsurge.com/news/submission-guidelines',
    notes: 'Submit an article pitch or product update via their editorial form.',
  },
  {
    id: 'elearning-industry',
    name: 'eLearning Industry LMS Directory',
    category: 'edtech',
    url: 'https://elearningindustry.com/lms-software',
    submitUrl: 'https://elearningindustry.com/advertise/elearning-marketing-resources/blog/listing-learning-management-system-in-elearning-industry-lms-directory',
    notes: 'Submit for free LMS listing.',
  },
  {
    id: 'common-sense',
    name: 'Common Sense Education',
    category: 'edtech',
    url: 'https://www.commonsense.org/education',
    submitUrl: 'https://www.commonsense.org/education/articles/submit-an-app-or-website',
    notes: 'Submit for educator review and listing.',
  },
  {
    id: 'iste',
    name: 'ISTE Product and Tool Finder',
    category: 'edtech',
    url: 'https://www.iste.org/learn/tools-for-teachers',
    submitUrl: 'https://www.iste.org/membership/vendor',
    notes: 'Submit as an EdTech vendor/partner.',
  },
  {
    id: 'edtech-hub',
    name: 'EdTech Hub',
    category: 'edtech',
    url: 'https://edtechhub.org',
    submitUrl: 'https://edtechhub.org/contact/',
    notes: 'Global EdTech research and directory — contact form submission.',
  },
  {
    id: 'digital-promise',
    name: 'Digital Promise EdTech Index',
    category: 'edtech',
    url: 'https://digitalpromise.org',
    submitUrl: 'https://digitalpromise.org/contact-us/',
    notes: 'Research-backed EdTech catalog.',
  },
  {
    id: 'tcea',
    name: 'TCEA Product Reviews',
    category: 'edtech',
    url: 'https://www.tcea.org/apps-resources/',
    submitUrl: 'https://www.tcea.org/contact/',
    notes: 'Texas Computer Education Association product directory.',
  },
  {
    id: 'edshelf',
    name: 'EdShelf',
    category: 'edtech',
    url: 'https://edshelf.com',
    submitUrl: 'https://edshelf.com/add',
    notes: 'Curated collection of EdTech tools — add your tool.',
  },

  // ── Software review sites ─────────────────────────────────────
  {
    id: 'g2',
    name: 'G2 (Software Reviews)',
    category: 'software',
    url: 'https://www.g2.com/categories/learning-management-system',
    submitUrl: 'https://sell.g2.com/free-listing',
    notes: 'Largest software review site. Free vendor listing.',
  },
  {
    id: 'capterra',
    name: 'Capterra LMS Directory',
    category: 'software',
    url: 'https://www.capterra.com/learning-management-system-software/',
    submitUrl: 'https://www.capterra.com/vendors/sign-up',
    notes: 'Major software comparison site. Free listing available.',
  },
  {
    id: 'getapp',
    name: 'GetApp',
    category: 'software',
    url: 'https://www.getapp.com/learning-e-learning-software/learning-management-systems/',
    submitUrl: 'https://www.getapp.com/add-product',
    notes: 'Gartner-owned comparison site.',
  },
  {
    id: 'software-advice',
    name: 'Software Advice',
    category: 'software',
    url: 'https://www.softwareadvice.com/lms/',
    submitUrl: 'https://www.softwareadvice.com/vendors/',
    notes: 'Gartner-owned. Submit for LMS category listing.',
  },
  {
    id: 'trustradius',
    name: 'TrustRadius',
    category: 'software',
    url: 'https://www.trustradius.com/learning-management-systems',
    submitUrl: 'https://www.trustradius.com/vendor',
    notes: 'B2B software review platform.',
  },
  {
    id: 'alternativeto',
    name: 'AlternativeTo',
    category: 'software',
    url: 'https://alternativeto.net/tag/lms/',
    submitUrl: 'https://alternativeto.net/software/add',
    notes: 'Add Global LMS as an alternative to Canvas, Moodle, etc.',
  },
  {
    id: 'sourceforge',
    name: 'SourceForge',
    category: 'software',
    url: 'https://sourceforge.net/software/lms/',
    submitUrl: 'https://sourceforge.net/software/add/',
    notes: 'Long-standing software directory — free listing.',
  },
  {
    id: 'saasworthy',
    name: 'SaaSworthy LMS',
    category: 'software',
    url: 'https://www.saasworthy.com/list/learning-management-system-lms',
    submitUrl: 'https://www.saasworthy.com/add-software',
    notes: 'SaaS discovery platform.',
  },
  {
    id: 'slant',
    name: 'Slant (tech recommendations)',
    category: 'software',
    url: 'https://www.slant.co/topics/3480/~best-learning-management-systems',
    submitUrl: 'https://www.slant.co/options/add',
    notes: 'Community-driven comparison tool.',
  },

  // ── School / K-12 specific ────────────────────────────────────
  {
    id: 'clever',
    name: 'Clever App Library',
    category: 'schools',
    url: 'https://apps.clever.com',
    submitUrl: 'https://clever.com/partners/become-a-partner',
    notes: 'Used by thousands of US school districts. Partner submission.',
  },
  {
    id: 'classlink',
    name: 'ClassLink App Library',
    category: 'schools',
    url: 'https://www.classlink.com/apps',
    submitUrl: 'https://www.classlink.com/partners',
    notes: 'SSO platform used by K-12 schools. Partner/app listing.',
  },
  {
    id: 'tes',
    name: 'TES Resources Marketplace',
    category: 'schools',
    url: 'https://www.tes.com/teaching-resources',
    submitUrl: 'https://www.tes.com/teaching-resources/become-an-author',
    notes: 'Largest teacher resource marketplace globally. List as author/partner.',
  },
  {
    id: 'share-my-lesson',
    name: 'Share My Lesson (AFT)',
    category: 'schools',
    url: 'https://sharemylesson.com',
    submitUrl: 'https://sharemylesson.com/partner',
    notes: 'American Federation of Teachers resource platform.',
  },
  {
    id: 'k12-digest',
    name: 'K-12 Digest',
    category: 'schools',
    url: 'https://www.k12digest.com',
    submitUrl: 'https://www.k12digest.com/school-experts-network/',
    notes: 'K-12 school network and directory.',
  },
  {
    id: 'cosn',
    name: 'CoSN EdTech Marketplace',
    category: 'schools',
    url: 'https://www.cosn.org',
    submitUrl: 'https://www.cosn.org/about/corporate-membership/',
    notes: 'Consortium for School Networking — EdTech vendor directory.',
  },
  {
    id: 'sxswedu',
    name: 'SXSW Edu Marketplace',
    category: 'schools',
    url: 'https://www.sxswedu.com',
    submitUrl: 'https://www.sxswedu.com/exhibiting/',
    notes: 'Annual EdTech event with year-round exhibitor directory.',
  },

  // ── Startup / product discovery ───────────────────────────────
  {
    id: 'product-hunt',
    name: 'Product Hunt',
    category: 'startup',
    url: 'https://www.producthunt.com',
    submitUrl: 'https://www.producthunt.com/posts/new',
    notes: 'High-traffic product launch platform. Free listing.',
  },
  {
    id: 'betalist',
    name: 'BetaList',
    category: 'startup',
    url: 'https://betalist.com',
    submitUrl: 'https://betalist.com/startups/new',
    notes: 'Early-stage startup discovery platform.',
  },
  {
    id: 'startup-base',
    name: 'StartupBase',
    category: 'startup',
    url: 'https://startupbase.io',
    submitUrl: 'https://startupbase.io/startups/new',
    notes: 'Startup discovery and ranking site.',
  },
  {
    id: 'indie-hackers',
    name: 'Indie Hackers Products',
    category: 'startup',
    url: 'https://www.indiehackers.com/products',
    submitUrl: 'https://www.indiehackers.com/products/new',
    notes: 'Founder community — add your product.',
  },
  {
    id: 'crunchbase',
    name: 'Crunchbase',
    category: 'startup',
    url: 'https://www.crunchbase.com',
    submitUrl: 'https://www.crunchbase.com/add/organization',
    notes: 'Business and startup database. Free company profile.',
  },
  {
    id: 'wellfound',
    name: 'Wellfound (AngelList)',
    category: 'startup',
    url: 'https://wellfound.com',
    submitUrl: 'https://wellfound.com/company/new',
    notes: 'Startup jobs and investor platform — company profile.',
  },
  {
    id: 'f6s',
    name: 'F6S',
    category: 'startup',
    url: 'https://www.f6s.com',
    submitUrl: 'https://www.f6s.com/join/startup',
    notes: 'Global startup network — free founder/company profile.',
  },
];

// ── Status tracker ────────────────────────────────────────────────────────────
function loadStatus() {
  if (RESET) return {};
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { return {}; }
}
function saveStatus(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

// ── Clipboard helper ──────────────────────────────────────────────────────────
function setClipboard(text) {
  const tmp = path.join(SCRATCH, '_clip.txt');
  fs.writeFileSync(tmp, text, 'utf8');
  if (process.platform === 'win32') {
    try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Get-Content -Raw -LiteralPath '${tmp.replace(/'/g, "''")}' | Set-Clipboard`]); } catch {}
  }
}

// ── Form filler ───────────────────────────────────────────────────────────────
async function fillDirectoryForm(page, dir) {
  const filled = [];

  const tryFill = async (selector, value, label) => {
    try {
      const el = page.locator(selector).first();
      if (await el.count()) {
        await el.waitFor({ state: 'visible', timeout: 3000 });
        await el.fill(value, { timeout: 3000 });
        filled.push(label);
        return true;
      }
    } catch {}
    return false;
  };

  const trySelect = async (selector, value, label) => {
    try {
      const el = page.locator(selector).first();
      if (await el.count()) { await el.selectOption({ label: value }, { timeout: 2000 }).catch(() => el.selectOption(value, { timeout: 2000 })); filled.push(label); }
    } catch {}
  };

  // Standard fields
  await tryFill('input[name*="name" i], input[placeholder*="product name" i], input[placeholder*="company name" i], input[id*="name" i]', product.name, 'name');
  await tryFill('input[name*="url" i], input[placeholder*="url" i], input[placeholder*="website" i], input[type="url"]', product.url, 'url');
  await tryFill('input[name*="email" i], input[placeholder*="email" i], input[type="email"]', product.email, 'email');
  await tryFill('input[name*="tagline" i], input[placeholder*="tagline" i], input[placeholder*="slogan" i]', product.tagline, 'tagline');

  // Description fields
  const descSelectors = [
    'textarea[name*="desc" i]', 'textarea[name*="about" i]', 'textarea[name*="overview" i]',
    'textarea[placeholder*="describe" i]', 'textarea[placeholder*="description" i]',
    'textarea[placeholder*="about" i]', 'textarea',
  ];
  for (const sel of descSelectors) {
    const ok = await tryFill(sel, product.longDesc, 'description');
    if (ok) break;
  }

  // Contenteditable
  try {
    const ce = page.locator('[contenteditable="true"]').first();
    if (await ce.count()) {
      await ce.click({ timeout: 2000 });
      await page.keyboard.insertText(product.longDesc);
      filled.push('contenteditable description');
    }
  } catch {}

  await tryFill('input[name*="category" i]', 'Learning Management System', 'category');
  await tryFill('input[name*="keyword" i], input[name*="tag" i]', product.keywords, 'keywords');
  await tryFill('input[name*="price" i], input[name*="pricing" i]', 'Freemium', 'pricing');
  await tryFill('input[name*="found" i], input[name*="year" i]', product.founded, 'founded year');

  return filled;
}

// ── HTML report ───────────────────────────────────────────────────────────────
function writeReport(results, status) {
  const total = results.length;
  const done  = results.filter(r => r.result === 'submitted' || r.result === 'form-filled').length;
  const skipped = results.filter(r => r.result === 'already-done').length;

  const badge = (r) => {
    const colors = { submitted: '#16a34a', 'form-filled': '#2563eb', 'already-done': '#6b7280', error: '#dc2626', opened: '#d97706' };
    const c = colors[r.result] || '#374151';
    return `<span style="background:${c};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px">${r.result}</span>`;
  };

  const categoryLabel = { edtech: '📚 EdTech Directories', software: '💻 Software Review Sites', schools: '🏫 School & K-12 Platforms', startup: '🚀 Startup Discovery' };

  const byCategory = {};
  for (const r of results) {
    const cat = r.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }

  const sections = Object.entries(byCategory).map(([cat, rows]) => `
    <section>
      <h2>${categoryLabel[cat] || cat}</h2>
      <table>
        <thead><tr><th>Directory</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><a href="${r.submitUrl || r.url}" target="_blank">${r.name}</a></td>
            <td>${badge(r)}</td>
            <td style="font-size:13px;color:#374151">${r.note || r.notes || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Directory Submission Report — ${SITE_NAME}</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#1e293b;margin:0;padding:32px}
    main{max-width:1060px;margin:0 auto}
    h1,h2{color:#fff}.lead{color:#94a3b8}
    section{background:#fff;border-radius:16px;padding:24px;margin:20px 0}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 14px;background:#f1f5f9;font-size:13px;color:#475569}
    td{padding:10px 14px;border-bottom:1px solid #f1f5f9}
    a{color:#2563eb;font-weight:600}
    .stats{display:flex;gap:20px;margin:16px 0}
    .stat{background:#1e293b;border-radius:12px;padding:16px 24px;color:#fff;min-width:120px;text-align:center}
    .stat-num{font-size:32px;font-weight:800;color:#38bdf8}
    .stat-label{font-size:13px;color:#94a3b8}
  </style>
</head>
<body>
<main>
  <h1>Directory Submission Report</h1>
  <p class="lead">${SITE_NAME} · ${new Date().toLocaleString()}</p>
  <div class="stats">
    <div class="stat"><div class="stat-num">${total}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-num">${done}</div><div class="stat-label">Submitted/Filled</div></div>
    <div class="stat"><div class="stat-num">${skipped}</div><div class="stat-label">Already Done</div></div>
    <div class="stat"><div class="stat-num">${total - done - skipped}</div><div class="stat-label">Need Review</div></div>
  </div>
  <p style="color:#fff;background:#1e293b;padding:14px 20px;border-radius:10px;font-size:14px">
    ℹ️ For any directory showing "form-filled" or "opened": the submission form was opened and filled. Click <strong>Submit / Create / List</strong> in the browser tab if it is still open, or visit the link to complete manually.
  </p>
  ${sections}
</main>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
  return REPORT_PATH;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const status = loadStatus();

  // Filter by category
  let targets = directories;
  if (CATEGORY_ARG) targets = directories.filter(d => d.category === CATEGORY_ARG);

  if (LIST_ONLY) {
    console.log('\nDirectory List:\n');
    const cats = [...new Set(directories.map(d => d.category))];
    for (const cat of cats) {
      console.log(`\n[${cat}]`);
      directories.filter(d => d.category === cat).forEach(d => {
        const done = status[d.id] ? '✓' : ' ';
        console.log(`  ${done} ${d.name.padEnd(40)} ${d.submitUrl || d.url}`);
      });
    }
    console.log(`\nTotal: ${directories.length} directories\n`);
    return;
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(`  ${SITE_NAME} Directory Submitter`);
  console.log(`  Targets: ${targets.length}${CATEGORY_ARG ? ` (category: ${CATEGORY_ARG})` : ''}`);
  if (RESET) console.log('  MODE: RESET — re-submitting all directories');
  console.log('──────────────────────────────────────────────\n');

  // Launch browser
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome', headless: false,
      viewport: { width: 1280, height: 860 }, args: ['--start-maximized']
    });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: false, viewport: { width: 1280, height: 860 }
    });
  }

  const results = [];

  for (const dir of targets) {
    const url = dir.submitUrl || dir.url;
    const clip = `${product.name}\n${product.url}\n\n${product.longDesc}\n\nCategory: ${product.category}\nPricing: ${product.pricing}\nKeywords: ${product.keywords}`;

    // Skip if already submitted
    if (status[dir.id] && !RESET) {
      console.log(`  [skip] ${dir.name} — already submitted`);
      results.push({ ...dir, result: 'already-done', note: `Submitted ${status[dir.id]}` });
      continue;
    }

    setClipboard(clip);
    const page = await context.newPage();
    let result = 'opened';
    let note = '';

    try {
      console.log(`  → ${dir.name}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(1500);

      const filled = await fillDirectoryForm(page, dir);

      if (filled.length > 0) {
        result = 'form-filled';
        note = `Filled: ${filled.join(', ')}`;

        // Try to find and click a submit button
        const submitSelectors = [
          'button[type="submit"]',
          'button:has-text("Submit")', 'button:has-text("Add")', 'button:has-text("List")',
          'button:has-text("Publish")', 'button:has-text("Create")', 'button:has-text("Save")',
          'input[type="submit"]',
        ];
        for (const sel of submitSelectors) {
          try {
            const btn = page.locator(sel).first();
            if (await btn.count()) {
              const disabled = await btn.getAttribute('disabled');
              if (!disabled) {
                await btn.click({ timeout: 4000 });
                await page.waitForTimeout(2000);
                result = 'submitted';
                note += ' · auto-submitted';
                break;
              }
            }
          } catch {}
        }
      } else {
        note = `Opened — full product info on clipboard. ${dir.notes}`;
      }

      await page.bringToFront();
    } catch (err) {
      result = 'error';
      note = err.message.split('\n')[0].slice(0, 120);
    }

    const timestamp = new Date().toLocaleDateString();
    if (result === 'submitted' || result === 'form-filled') {
      status[dir.id] = timestamp;
      saveStatus(status);
    }

    console.log(`     ${result}${note ? ' — ' + note.slice(0, 80) : ''}`);
    results.push({ ...dir, result, note });

    // Brief pause between pages to avoid being flagged as a bot
    await new Promise(r => setTimeout(r, 1200));
  }

  // Write and open report
  const reportPath = writeReport(results, status);
  console.log(`\nReport: ${reportPath}`);

  try {
    const reportPage = await context.newPage();
    await reportPage.goto(`file://${reportPath.replace(/\\/g, '/')}`);
    await reportPage.bringToFront();
  } catch {}

  const done  = results.filter(r => r.result === 'submitted' || r.result === 'form-filled').length;
  console.log(`\n✅  Done. ${done}/${targets.length} directories filled or submitted.`);
  console.log('   Review any open tabs and click the final Submit button where needed.');
  console.log('   Already-submitted directories will be skipped on future runs.\n');
})();
