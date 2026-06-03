const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, 'scratch');
const PROFILE = path.join(SCRATCH, 'posting-agent-profile');
const SITE_URL = 'https://www.global-lms.org/';
const SUPPORT_EMAIL = 'support@global-lms.org';

fs.mkdirSync(SCRATCH, { recursive: true });

const args = new Set(process.argv.slice(2).map((arg) => arg.toLowerCase()));
const requestedTarget = process.argv.find((arg) => arg.startsWith('--target='))?.split('=')[1]?.toLowerCase();
const requestedLimit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 0);

const campaign = {
  shortPitch:
    'Global LMS is a standards-centered K-12 curriculum warehouse that loads ready lessons, units, and full courses by country, grade, subject, and build type.',
  teacherPost:
    'Teachers should not have to rebuild every lesson from scratch. Global LMS gives educators ready-to-load K-12 lessons, units, and courses by country, grade, and subject. The goal is simple: save planning time, keep learning standards-aligned, and make curriculum access fairer worldwide.',
  fundingPitch:
    'Global LMS supports paid access in standard regions so free access can stay open in high-need communities. Funding helps with accessibility, content review, school outreach, infrastructure, and educator partnerships.',
  directoryDescription:
    'Global LMS is a K-12 curriculum warehouse for teachers, families, and schools. It provides ready-to-load lessons, units, and full courses organized by country, grade, subject, and learning need. It is designed to reduce teacher planning time, support regional standards, and keep access affordable with free access in high-need regions.'
};

const socialProfile = `Name: Global LMS
Handle idea: @GlobalLMS or @GlobalLMSLearning
Public email: ${SUPPORT_EMAIL}
Website: ${SITE_URL}
Tagline: Standards-aligned K-12 lessons, units, and courses for every country.
Bio: Global LMS helps teachers, families, and schools load ready-to-use K-12 lessons, units, and full courses by country, grade, and subject. Paid access helps support free access in high-need regions.`;

const targets = [
  {
    id: 'facebook-page',
    name: 'Facebook Page Setup',
    url: 'https://www.facebook.com/pages/creation/',
    draft: socialProfile,
    expected: 'Create or update the official Global LMS Facebook Page. The profile copy is on the clipboard.'
  },
  {
    id: 'linkedin-company',
    name: 'LinkedIn Company Page Setup',
    url: 'https://www.linkedin.com/company/setup/new/',
    draft: socialProfile,
    expected: 'Create or update the official Global LMS LinkedIn Company Page. The profile copy is on the clipboard.'
  },
  {
    id: 'youtube-channel',
    name: 'YouTube Channel Setup',
    url: 'https://www.youtube.com/create_channel',
    draft: `${socialProfile}\n\nFirst video idea: 60-second how-to showing how to build a lesson, unit, or course on Global LMS.`,
    expected: 'Create or update the YouTube channel. Use this for demo videos and how-to clips.'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE_URL)}`,
    draft: `${campaign.teacherPost}\n\n${campaign.shortPitch}\n\n${SITE_URL}`,
    expected: 'A Facebook share window should open. If Facebook blocks prefilled text, the draft is already on the clipboard.'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE_URL)}`,
    draft: `${campaign.teacherPost}\n\nLooking for early teachers, school leaders, funders, and partners.\n\n${campaign.fundingPitch}\n\n${SITE_URL}`,
    expected: 'A LinkedIn share window should open. The draft is on the clipboard for the post body.'
  },
  {
    id: 'facebook-groups',
    name: 'Facebook Education Groups Search',
    url: 'https://www.facebook.com/search/groups/?q=homeschool%20curriculum%20teachers',
    draft: `${campaign.teacherPost}\n\nI am looking for teachers, homeschool families, and school leaders who can test Global LMS and tell us what would make it more useful.\n\n${SITE_URL}`,
    expected: 'Search for relevant groups. Join only appropriate groups, read rules, and post only where self-promotion is allowed.'
  },
  {
    id: 'linkedin-search',
    name: 'LinkedIn Education Search',
    url: 'https://www.linkedin.com/search/results/content/?keywords=K-12%20curriculum%20teachers%20homeschool',
    draft: `${campaign.shortPitch}\n\nI would love feedback from K-12 educators, homeschool families, and school leaders.\n\n${SITE_URL}`,
    expected: 'Search LinkedIn for relevant conversations and paste the draft only where it is appropriate.'
  },
  {
    id: 'elearning-industry',
    name: 'eLearning Industry LMS Directory',
    url: 'https://elearningindustry.com/advertise/elearning-marketing-resources/blog/listing-learning-management-system-in-elearning-industry-lms-directory',
    draft: `Product: Global LMS\nWebsite: ${SITE_URL}\nCategory: Learning Management System, K-12 Curriculum, Education Technology\n\n${campaign.directoryDescription}`,
    expected: 'The directory information page should open. Use the copied draft for any listing/contact form.'
  },
  {
    id: 'capterra',
    name: 'Capterra',
    url: 'https://www.capterra.com/legal/listing-guidelines/',
    draft: `Product: Global LMS\nWebsite: ${SITE_URL}\nCategory: LMS / K-12 Curriculum / Education Technology\n\n${campaign.directoryDescription}\n\nPricing: Lessons start at $5, units at $10, and full courses at $100 in standard regions, with regional pricing and free access in high-need areas.`,
    expected: 'The Capterra listing guidance should open. The draft is on the clipboard for vendor/listing submission.'
  },
  {
    id: 'edsurge',
    name: 'EdSurge',
    url: 'https://www.edsurge.com/submission-guidelines',
    draft: `Pitch: What happens when curriculum is already waiting on the server for every country?\n\nI am building Global LMS, a standards-centered K-12 curriculum warehouse that loads lessons, units, and full courses by country, grade, and subject. The story angle is teacher workload, global access, and how educators can get classroom-ready material without rebuilding from zero.\n\n${campaign.fundingPitch}\n\nSuggested link: ${SITE_URL}`,
    expected: 'The EdSurge submission page should open. The pitch is on the clipboard.'
  },
  {
    id: 'tes',
    name: 'TES Resources',
    url: 'https://www.tes.com/teaching-resources/become-an-author',
    draft: `Resource title: Standards-Aligned K-12 Lesson Pack from Global LMS\n\nDescription:\n${campaign.directoryDescription}\n\nSuggested free sample: one lesson plan, worksheet, quiz, answer key, and activity from the LMS.`,
    expected: 'The TES author page should open. The resource description is on the clipboard.'
  },
  {
    id: 'product-hunt',
    name: 'Product Hunt',
    url: 'https://www.producthunt.com/posts/new',
    draft: `Name: Global LMS\nTagline: Standards-aligned K-12 lessons, units, and courses for every country\n\nDescription:\n${campaign.directoryDescription}\n\nMaker comment:\n${campaign.teacherPost}`,
    expected: 'Product Hunt new product flow should open. The launch copy is on the clipboard.'
  },
  {
    id: 'k12-digest',
    name: 'K12 Digest',
    url: 'https://www.k12digest.com/school-experts-network/',
    draft: `Global LMS would like to connect with K-12 education leaders, school communities, and edtech partners.\n\n${campaign.shortPitch}\n\n${campaign.fundingPitch}\n\n${SITE_URL}`,
    expected: 'K12 Digest network page should open. The outreach copy is on the clipboard.'
  }
];

function setClipboard(text) {
  const clipFile = path.join(SCRATCH, 'posting-agent-clipboard.txt');
  fs.writeFileSync(clipFile, text, 'utf8');
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Get-Content -Raw -LiteralPath '${clipFile.replace(/'/g, "''")}' | Set-Clipboard`
    ]);
  }
}

async function fillLikelyFields(page, target) {
  const attempts = [];
  const fillValue = async (locator, value, label) => {
    try {
      if (await locator.count()) {
        const first = locator.first();
        await first.waitFor({ state: 'visible', timeout: 2500 });
        await first.fill(value, { timeout: 2500 });
        attempts.push(`filled ${label}`);
        return true;
      }
    } catch {
      attempts.push(`could not fill ${label}`);
    }
    return false;
  };

  await fillValue(page.locator('textarea'), target.draft, 'textarea');
  await fillValue(page.locator('input[name*="title" i], input[placeholder*="title" i]'), 'Global LMS', 'title');
  await fillValue(page.locator('input[name*="name" i], input[placeholder*="name" i]'), 'Global LMS', 'name');
  await fillValue(page.locator('input[name*="url" i], input[placeholder*="url" i], input[type="url"]'), SITE_URL, 'url');

  try {
    const editable = page.locator('[contenteditable="true"]').first();
    if (await editable.count()) {
      await editable.click({ timeout: 2500 });
      await page.keyboard.insertText(target.draft);
      attempts.push('filled editable post box');
    }
  } catch {
    attempts.push('could not fill editable post box');
  }

  return attempts;
}

function writeReport(results) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Global LMS Neural Posting Agent Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; background: #071a3a; color: #0f172a; }
    main { max-width: 980px; margin: 0 auto; }
    h1, .lead { color: white; }
    article { background: white; border-radius: 14px; padding: 18px; margin: 14px 0; }
    pre { white-space: pre-wrap; background: #f8fbff; border: 1px solid #dbeafe; border-radius: 10px; padding: 12px; }
    a { color: #1d4ed8; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <h1>Global LMS Neural Posting Agent Report</h1>
    <p class="lead">The agent opened targets, copied drafts, and filled obvious fields where possible. Review each page before clicking any final Post, Submit, Publish, or Create button.</p>
    ${results.map((result) => `<article>
      <h2>${result.name}</h2>
      <p><a href="${result.url}">${result.url}</a></p>
      <p>${result.expected}</p>
      <p><strong>Status:</strong> ${result.status}</p>
      <pre>${result.draft.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>
    </article>`).join('')}
  </main>
</body>
</html>`;
  const reportPath = path.join(SCRATCH, 'posting-agent-report.html');
  fs.writeFileSync(reportPath, html, 'utf8');
  return reportPath;
}

async function launchContext() {
  try {
    return await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1365, height: 850 },
      args: ['--start-maximized']
    });
  } catch {
    return chromium.launchPersistentContext(PROFILE, {
      headless: false,
      viewport: { width: 1365, height: 850 }
    });
  }
}

(async () => {
  const context = await launchContext();
  const results = [];
  let runTargets = targets;
  if (requestedTarget) {
    runTargets = targets.filter((target) => (
      target.id.toLowerCase().includes(requestedTarget)
      || target.name.toLowerCase().includes(requestedTarget)
    ));
  }
  if (requestedLimit > 0) runTargets = runTargets.slice(0, requestedLimit);
  if (!runTargets.length) {
    console.log('No matching targets. Try --target=facebook, --target=linkedin, or --limit=3.');
    await context.close();
    return;
  }

  for (const target of runTargets) {
    setClipboard(target.draft);
    const page = await context.newPage();
    let status = 'opened; draft copied to clipboard';
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const attempts = await fillLikelyFields(page, target);
      if (attempts.length) status += `; ${attempts.join(', ')}`;
      await page.bringToFront();
      await page.waitForTimeout(900);
    } catch (err) {
      status = `opened with issue: ${err.message}`;
    }
    results.push({ ...target, status });
  }

  const reportPath = writeReport(results);
  const report = await context.newPage();
  await report.goto(`file://${reportPath.replace(/\\/g, '/')}`);
  await report.bringToFront();

  console.log(`Neural posting agent opened ${runTargets.length} targets.`);
  console.log(`Report: ${reportPath}`);
  console.log('Leave this window open while you review and approve posts/submissions.');
})();
