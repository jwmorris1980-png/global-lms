#!/usr/bin/env node
/**
 * prebake-videos.cjs
 *
 * Pre-fetch one YouTube video ID per lesson and save to video-map.json.
 * Run daily until all lessons are covered (free quota: 100 searches/day).
 *
 * Usage:
 *   node scripts/prebake-videos.cjs
 *
 * Requires YOUTUBE_API_KEY in .env or as an environment variable.
 * Processes up to BATCH (default 90) new lessons per run.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { syncVideoMapToCourses } = require('./sync-video-map-to-courses.cjs');
const {
  buildPrimaryQuery,
  buildVideoQueryKeys,
  canonicalSubject,
  extractLessonContext,
  normalizeWhitespace,
  tokenize,
} = require('./video-query-utils.cjs');

// Load .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
}

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_KEY_HERE') {
  console.error('Set YOUTUBE_API_KEY in .env before running this script.');
  process.exit(1);
}

const LESSONS_DIR = path.join(__dirname, '..', 'warehouse', 'lessons');
const MAP_PATH = path.join(__dirname, '..', 'video-map.json');
const args = process.argv.slice(2);
const subjectArg = args.find(arg => arg.startsWith('--subject='));
const refreshExisting = args.includes('--refresh-existing');
const onlyCached = args.includes('--only-cached');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const BATCH = parseInt((limitArg && limitArg.split('=')[1]) || process.env.BATCH || '90', 10);
const DELAY_MS = 7000;
const SAVE_RETRIES = 5;
const SAVE_RETRY_MS = 750;
const requestedSubject = canonicalSubject(subjectArg ? subjectArg.split('=')[1] : '');

let videoMap = {};
try {
  videoMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
} catch (_) {}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.name.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walk(LESSONS_DIR);
console.log(`Found ${allFiles.length} lesson files.`);

const todo = [];
const seenQueries = new Set();
for (const file of allFiles) {
  try {
    const lesson = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ctx = extractLessonContext(lesson);
    if (!ctx.title && !ctx.topic) continue;
    if (requestedSubject && ctx.subject !== requestedSubject) continue;

    const queryKeys = buildVideoQueryKeys(lesson);
    const primaryQuery = buildPrimaryQuery(lesson);
    if (!primaryQuery) continue;

    const alreadyCached = queryKeys.some(key => Object.prototype.hasOwnProperty.call(videoMap, key));
    if (onlyCached && !alreadyCached) continue;
    if (!refreshExisting && alreadyCached) continue;
    if (seenQueries.has(primaryQuery)) continue;

    seenQueries.add(primaryQuery);
    todo.push({ ctx, file, lesson, primaryQuery, queryKeys });
  } catch (_) {}
}

console.log(`${Object.keys(videoMap).length} already cached, ${todo.length} remaining.`);

if (todo.length === 0) {
  console.log('All lessons already have video IDs - nothing to do.');
  process.exit(0);
}

const batch = todo.slice(0, BATCH);
console.log(`Processing ${batch.length} lessons this run...\n`);

async function fetchJson(url) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (err) {
    throw new Error(`fetch failed: ${err.message}`);
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`YouTube API ${resp.status}: ${JSON.stringify(body)}`);
  }

  return resp.json();
}

function scoreCandidate(ctx, item, details) {
  const title = normalizeWhitespace(details?.snippet?.title || item?.snippet?.title || '').toLowerCase();
  const description = normalizeWhitespace(details?.snippet?.description || item?.snippet?.description || '').toLowerCase();
  const channel = normalizeWhitespace(details?.snippet?.channelTitle || item?.snippet?.channelTitle || '').toLowerCase();
  const haystack = `${title} ${description} ${channel}`;
  const desiredTokens = tokenize(`${ctx.subject} ${ctx.topic} ${ctx.title}`);

  let score = 0;
  for (const token of desiredTokens) {
    if (title.includes(token)) score += token.length >= 6 ? 7 : 4;
    else if (haystack.includes(token)) score += token.length >= 6 ? 4 : 2;
  }

  if (ctx.gradeNumber && haystack.includes(`grade ${ctx.gradeNumber}`)) score += 4;
  if (ctx.subject === 'Mathematics' && /\bmath|mathematics|algebra|geometry|trigonometry|fraction|ratio|proportion|equation|functions?|domain|range|coordinate|integer\b/.test(haystack)) score += 8;
  if (ctx.subject === 'Mathematics' && /\bmath\b/.test(channel)) score += 4;
  if (details?.snippet?.categoryId === '27') score += 3;
  if (/tutorial|explained|lesson|introduction|practice|review/.test(title)) score += 2;

  if (/all of .* in \d+ minutes|quick practice|shorts?\b|trailer\b|song\b|music\b/.test(title)) score -= 10;
  if (ctx.subject === 'Mathematics' && /\bfunny|meme|gameplay\b/.test(haystack)) score -= 20;

  return score;
}

async function fetchBestVideo(q, ctx) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('maxResults', '8');
  url.searchParams.set('relevanceLanguage', 'en');
  url.searchParams.set('safeSearch', 'strict');
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const data = await fetchJson(url.toString());
  const items = data.items || [];
  const ids = items.map(item => item.id?.videoId).filter(Boolean);
  if (!ids.length) return null;

  const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  detailsUrl.searchParams.set('part', 'snippet');
  detailsUrl.searchParams.set('id', ids.join(','));
  detailsUrl.searchParams.set('key', YOUTUBE_API_KEY);
  const detailsData = await fetchJson(detailsUrl.toString());
  const detailMap = new Map((detailsData.items || []).map(item => [item.id, item]));

  let best = null;
  for (const item of items) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const score = scoreCandidate(ctx, item, detailMap.get(videoId));
    if (!best || score > best.score) {
      best = { score, videoId };
    }
  }

  return best && best.score >= 6 ? best.videoId : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveVideoMap() {
  const tempPath = `${MAP_PATH}.tmp`;
  const payload = JSON.stringify(videoMap, null, 2);

  for (let attempt = 1; attempt <= SAVE_RETRIES; attempt++) {
    try {
      fs.writeFileSync(tempPath, payload, 'utf8');
      fs.renameSync(tempPath, MAP_PATH);
      return;
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}

      const retryable = ['EPERM', 'EBUSY', 'EACCES'].includes(err.code);
      if (!retryable || attempt === SAVE_RETRIES) {
        throw new Error(`Failed to save video map after ${attempt} attempt(s): ${err.message}`);
      }

      console.log(`   save retry ${attempt}/${SAVE_RETRIES - 1} after ${err.code}`);
      await sleep(SAVE_RETRY_MS * attempt);
    }
  }
}

(async () => {
  let added = 0;
  let skipped = 0;
  let processed = 0;

  for (let i = 0; i < batch.length; i++) {
    const { ctx, primaryQuery, queryKeys } = batch[i];
    processed++;
    process.stdout.write(`[${i + 1}/${batch.length}] ${primaryQuery.slice(0, 80)}... `);

    try {
      const videoId = await fetchBestVideo(primaryQuery, ctx);
      if (videoId) {
        for (const key of queryKeys) {
          if (key !== primaryQuery && videoMap[key] === videoId) delete videoMap[key];
        }
        videoMap[primaryQuery] = videoId;
        added++;
        console.log(`ok ${videoId}`);
      } else {
        videoMap[primaryQuery] = null;
        skipped++;
        console.log('(no result)');
      }
    } catch (err) {
      console.log(`\n  warning: ${err.message}`);
      if (err.message.includes('quotaExceeded')) {
        console.error('\nDaily quota exceeded. Run again tomorrow.');
        break;
      }
    }

    if ((i + 1) % 10 === 0) {
      await saveVideoMap();
      console.log(`   saved (${Object.keys(videoMap).length} total in map)`);
    }

    if (i < batch.length - 1) await sleep(DELAY_MS);
  }

  await saveVideoMap();
  const remaining = todo.length - processed;
  const syncResult = syncVideoMapToCourses();
  console.log(`\nDone. Added ${added}, no-result ${skipped}.`);
  console.log(`video-map.json now has ${Object.keys(videoMap).length} entries.`);
  console.log(
    `Synced videos into ${syncResult.lessonFilesUpdated} lesson files and ${syncResult.packageFilesUpdated} package files (${syncResult.packageLessonsUpdated} embedded lessons updated).`
  );
  if (remaining > 0) {
    console.log(`~${remaining} lessons remain - run again tomorrow.`);
  } else {
    console.log('All lessons covered.');
  }
})();
