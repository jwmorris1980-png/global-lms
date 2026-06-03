#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { buildVideoQueryKeys } = require('./video-query-utils.cjs');

const ROOT = path.join(__dirname, '..');
const LESSONS_DIR = path.join(ROOT, 'warehouse', 'lessons');
const PACKAGES_DIR = path.join(ROOT, 'warehouse', 'packages');
const MAP_PATH = path.join(ROOT, 'video-map.json');

function walk(dir, suffix = '.json') {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full, suffix));
    } else if (entry.name.endsWith(suffix)) {
      files.push(full);
    }
  }
  return files;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function findVideoIdForLesson(lesson, videoMap) {
  for (const key of buildVideoQueryKeys(lesson)) {
    if (Object.prototype.hasOwnProperty.call(videoMap, key) && videoMap[key]) {
      return videoMap[key];
    }
  }
  return null;
}

function buildVideoUrls(videoId) {
  return {
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
  };
}

function applyVideoToLesson(lesson, videoId) {
  if (!lesson || !videoId) return false;
  const media = lesson.media && typeof lesson.media === 'object' ? lesson.media : {};
  const next = buildVideoUrls(videoId);
  const changed =
    media.videoId !== next.videoId ||
    media.video !== next.watchUrl ||
    media.embedUrl !== next.embedUrl;

  if (!changed) return false;

  lesson.media = {
    ...media,
    videoId: next.videoId,
    video: next.watchUrl,
    embedUrl: next.embedUrl,
  };
  return true;
}

function syncVideoMapToCourses() {
  const videoMap = fs.existsSync(MAP_PATH) ? readJson(MAP_PATH) : {};
  const lessons = walk(LESSONS_DIR, '.json');
  const packages = walk(PACKAGES_DIR, '.json');

  let lessonFilesUpdated = 0;
  let packageFilesUpdated = 0;
  let packageLessonsUpdated = 0;

  for (const file of lessons) {
    let lesson;
    try {
      lesson = readJson(file);
    } catch (_) {
      continue;
    }

    const videoId = findVideoIdForLesson(lesson, videoMap);
    if (!videoId) continue;

    if (applyVideoToLesson(lesson, videoId)) {
      writeJson(file, lesson);
      lessonFilesUpdated++;
    }
  }

  for (const file of packages) {
    let pkg;
    try {
      pkg = readJson(file);
    } catch (_) {
      continue;
    }

    let changed = false;
    const lessonEntries = pkg?.lessons && typeof pkg.lessons === 'object'
      ? Object.entries(pkg.lessons)
      : [];

    for (const [, lesson] of lessonEntries) {
      const videoId = findVideoIdForLesson(lesson, videoMap);
      if (!videoId) continue;
      if (applyVideoToLesson(lesson, videoId)) {
        changed = true;
        packageLessonsUpdated++;
      }
    }

    if (!changed) continue;

    const json = JSON.stringify(pkg, null, 2);
    fs.writeFileSync(file, json, 'utf8');
    packageFilesUpdated++;

    const gzPath = `${file}.gz`;
    if (fs.existsSync(gzPath)) {
      fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(json, 'utf8')));
    }
  }

  return {
    lessonFilesUpdated,
    packageFilesUpdated,
    packageLessonsUpdated,
  };
}

module.exports = { syncVideoMapToCourses };

if (require.main === module) {
  const result = syncVideoMapToCourses();
  console.log(
    `Synced videos into ${result.lessonFilesUpdated} lesson files and ${result.packageFilesUpdated} package files (${result.packageLessonsUpdated} embedded lessons updated).`
  );
}
