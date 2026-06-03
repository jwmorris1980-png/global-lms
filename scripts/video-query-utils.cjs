'use strict';

function normalizeWhitespace(value) {
  return String(value || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}

function stripMarkdown(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~>#]+/g, ' ')
      .replace(/\r/g, ' ')
  );
}

function firstContentLine(value) {
  const text = String(value || '').replace(/\r/g, '');
  const lines = text.split('\n').map(line => stripMarkdown(line)).filter(Boolean);
  for (const line of lines) {
    if (/^=+\s*[A-Z _-]+\s*=+$/i.test(line)) break;
    if (/^(grade level|subject|time allotment|learning objectives|materials|standards|curriculum)/i.test(line)) break;
    return line;
  }
  return '';
}

function parseNamedField(content, field) {
  const raw = String(content || '');
  const mdMatch = raw.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, 'i'));
  if (mdMatch) return stripMarkdown(mdMatch[1]);

  const markerMatch = raw.match(new RegExp(`===\\s*${field.toUpperCase()}\\s*===\\s*\\n([^\\n]+)`, 'i'));
  if (markerMatch) return stripMarkdown(markerMatch[1]);

  return '';
}

function parseGradeNumber(grade) {
  const match = String(grade || '').match(/(\d{1,2})/);
  return match ? match[1] : '';
}

function canonicalSubject(value) {
  const text = normalizeWhitespace(String(value || '').toLowerCase());
  if (!text) return '';
  if (/(^|[^a-z])(math|mathematics|algebra|geometry|trigonometry|statistics)([^a-z]|$)/.test(text)) return 'Mathematics';
  if (/(^|[^a-z])(english|ela|language arts|writing|reading|literature)([^a-z]|$)/.test(text)) return 'English Language Arts';
  if (/(^|[^a-z])(science|biology|chemistry|physics|earth science|life science)([^a-z]|$)/.test(text)) return 'Science';
  if (/(^|[^a-z])(history|social studies|world history|civics|geography)([^a-z]|$)/.test(text)) return 'Social Studies';
  if (/(^|[^a-z])(computer science|computing|coding|programming|digital citizenship)([^a-z]|$)/.test(text)) return 'Computer Science';
  if (/(^|[^a-z])(art|visual arts|art history)([^a-z]|$)/.test(text)) return 'Art';
  return normalizeWhitespace(value);
}

function extractLessonContext(lesson) {
  const title = firstContentLine(lesson?.title || '');
  const topic = firstContentLine(lesson?.topic || '');
  const content = String(lesson?.content || '');
  const subject = canonicalSubject(
    lesson?.subject ||
    parseNamedField(content, 'Subject') ||
    parseNamedField(content, 'Subjects') ||
    topic
  );
  const grade = normalizeWhitespace(lesson?.grade || parseNamedField(content, 'Grade Level') || parseNamedField(content, 'Grade'));
  const gradeNumber = parseGradeNumber(grade);

  return {
    grade,
    gradeNumber,
    subject,
    title,
    topic,
  };
}

function sanitizeFocusText(text) {
  return normalizeWhitespace(
    stripMarkdown(text)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^0-9A-Za-zÀ-ÿ+\-/ ]+/g, ' ')
  );
}

function buildPrimaryQuery(lesson) {
  const ctx = extractLessonContext(lesson);
  const focus = sanitizeFocusText(ctx.topic || ctx.title);
  const title = sanitizeFocusText(ctx.title);
  const subject = sanitizeFocusText(ctx.subject);
  const grade = ctx.gradeNumber ? `Grade ${ctx.gradeNumber}` : sanitizeFocusText(ctx.grade);
  const parts = [grade, subject];

  if (focus) {
    parts.push(focus);
  } else if (title) {
    parts.push(title);
  }

  if (subject === 'Mathematics' && !/\b(math|mathematics|algebra|geometry|trigonometry|statistics)\b/i.test(parts.join(' '))) {
    parts.push('math');
  }

  return normalizeWhitespace(parts.filter(Boolean).join(' '));
}

function buildLegacyQuery(lesson) {
  const grade = lesson?.grade || '';
  const title = lesson?.title || lesson?.topic || '';
  return normalizeWhitespace(`${grade} ${title} explained for students`);
}

function buildVideoQueryKeys(lesson) {
  return Array.from(new Set([buildPrimaryQuery(lesson), buildLegacyQuery(lesson)].filter(Boolean)));
}

function tokenize(text) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'for', 'from', 'grade', 'in', 'into', 'lesson', 'of', 'on',
    'students', 'the', 'through', 'to', 'with'
  ]);

  return Array.from(
    new Set(
      normalizeWhitespace(String(text || '').toLowerCase())
        .replace(/[^a-z0-9+\-/ ]+/g, ' ')
        .split(' ')
        .map(token => token.trim())
        .filter(token => token.length > 2 && !stopWords.has(token))
    )
  );
}

module.exports = {
  buildLegacyQuery,
  buildPrimaryQuery,
  buildVideoQueryKeys,
  canonicalSubject,
  extractLessonContext,
  normalizeWhitespace,
  stripMarkdown,
  tokenize,
};
