import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, BookOpen, GraduationCap, Clock, CheckCircle, ArrowRight, User, Shield, Info, CreditCard, Trophy, Users, BarChart3, Star, Image, Video, MonitorOff, Printer, Mail, Play, Pause, Square, Volume2, ChevronLeft, ChevronRight, Copy, Share2, Download, PenTool, Eraser, Trash2, Save, Upload, ScreenShare, Type, MousePointer2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  BUILD_STAMP,
  mergeMarketplaceCatalog,
  findSampleLesson,
  findSampleCurriculum,
  READING_SAMPLE_LESSON,
  imageSetForTopic,
  topicSpecificQuiz,
  SOCIAL_PROOF,
  PRODUCT_TOUR,
  STANDARD_PRICING,
  viewFromPath,
  pathForView,
  pageTitleFor
} from './visitorTrust';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
const stripePromise = stripePublishableKey && !stripePublishableKey.includes('placeholder')
  ? loadStripe(stripePublishableKey)
  : Promise.resolve(null);
const AI_CREDIT_PACKS = [
  { id: 'starter', label: '$5', credits: 20 },
  { id: 'builder', label: '$10', credits: 45 }
];
const FREE_LESSON_LIMIT = 6;
const GUEST_FREE_LESSON_LIMIT = 1;

// --- Components ---

const getVideoResource = (url, topic) => {
  const fallbackSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${topic || 'educational lesson'} educational lesson for students`)}`;
  if (!url) return { type: 'search', url: fallbackSearch };

  try {
    const parsed = new URL(url);
    const isYouTube = parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be');

    if (isYouTube && parsed.pathname.includes('/results')) {
      return { type: 'search', url };
    }

    let id = '';

    if (parsed.hostname.includes('youtu.be')) {
      id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else if (parsed.pathname.includes('/embed/')) {
      id = parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
    } else if (parsed.pathname.includes('/shorts/')) {
      id = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
    } else {
      id = parsed.searchParams.get('v') || '';
    }

    if (isYouTube && id && parsed.pathname.includes('/embed/')) {
      return {
        type: 'embed',
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    }

    return { type: 'search', url: isYouTube && !id ? url : fallbackSearch };
  } catch {
    return { type: 'search', url: fallbackSearch };
  }
};

const cleanLessonText = (value = '') => (
  value
    .replace(/\*\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const extractYouTubeVideoId = (url = '') => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
    if (parsed.pathname.includes('/embed/')) {
      return parsed.pathname.split('/embed/')[1]?.split(/[/?#]/)[0] || '';
    }
    if (parsed.pathname.includes('/shorts/')) {
      return parsed.pathname.split('/shorts/')[1]?.split(/[/?#]/)[0] || '';
    }
    return parsed.searchParams.get('v') || '';
  } catch {
    return '';
  }
};

const AccessibleReadAloud = ({ text, label = 'lesson' }) => {
  const [status, setStatus] = useState('idle');
  const utteranceRef = useRef(null);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => () => {
    if (canSpeak) window.speechSynthesis.cancel();
  }, [canSpeak]);

  const startReading = () => {
    if (!canSpeak || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanLessonText(text));
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onend = () => setStatus('idle');
    utterance.onerror = () => setStatus('idle');
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setStatus('playing');
  };

  const pauseOrResume = () => {
    if (!canSpeak) return;
    if (status === 'playing') {
      window.speechSynthesis.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
    }
  };

  const stopReading = () => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setStatus('idle');
  };

  if (!canSpeak) {
    return <p className="read-aloud-note">Read aloud is not available in this browser.</p>;
  }

  return (
    <div className="read-aloud-controls" aria-label={`Read ${label} aloud controls`}>
      <button type="button" onClick={startReading} disabled={!text} aria-label={`Read ${label} aloud`}>
        <Volume2 size={16} />
        {status === 'playing' ? 'Restart Read Aloud' : 'Read Aloud'}
      </button>
      <button type="button" onClick={pauseOrResume} disabled={status === 'idle'} aria-label={status === 'paused' ? 'Resume read aloud' : 'Pause read aloud'}>
        {status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
        {status === 'paused' ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={stopReading} disabled={status === 'idle'} aria-label="Stop read aloud">
        <Square size={14} />
        Stop
      </button>
      <span aria-live="polite">{status === 'playing' ? 'Reading aloud' : status === 'paused' ? 'Read aloud paused' : 'Ready to read aloud'}</span>
    </div>
  );
};

const slugifyFileName = (value = 'global-lms-resource') => (
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'global-lms-resource'
);

const escapeHtml = (value = '') => (
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const imageQueryFor = (title = '', course = 'education') => {
  const text = `${title} ${course}`.toLowerCase();
  if (/math|number|algebra|geometry|data|probability|measurement/.test(text)) return 'math classroom manipulatives';
  if (/physics|motion|force|energy|waves|electricity|magnetism|kinematics/.test(text)) return `${title} physics lab classroom`;
  if (/financial|money|budget|income|saving|credit|debt|invest/.test(text)) return `${title} financial literacy classroom`;
  if (/law|legal|civics|rights|court|constitution/.test(text)) return `${title} law civics classroom`;
  if (/resume|cover letter|interview|job|career/.test(text)) return `${title} career skills classroom`;
  if (/programming|coding|app development|algorithm/.test(text)) return `${title} coding classroom computers`;
  if (/science|ecosystem|matter|energy|earth|space|environment|inquiry/.test(text)) return 'science classroom experiment';
  if (/reading|literature|vocabulary|text|discussion|interpretation/.test(text)) return 'students reading books classroom';
  if (/writing|grammar|communication|argument|research|presentation/.test(text)) return 'student writing notebook classroom';
  if (/history|civilization|government|civics|geography|maps|culture/.test(text)) return 'history geography classroom map';
  if (/computer|algorithm|programming|data|network|cyber/.test(text)) return 'students coding classroom computers';
  if (/art|music|creative|poetry|composition/.test(text)) return 'creative arts classroom students';
  if (/health|physical|fitness|wellness/.test(text)) return 'students wellness physical education';
  if (/economics|market|trade|money/.test(text)) return 'economics classroom students';
  return `${course} students learning classroom`;
};

const imageSignature = (value = '') => (
  Array.from(String(value)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
);

const buildTopicImageUrl = (title, course, index = 0) => {
  const set = imageSetForTopic(title, course);
  return set[index % set.length];
};

const getLessonImages = (lesson, topic) => {
  const baseTitle = lesson?.title || topic || 'lesson';
  const course = lesson?.course || lesson?.subject || 'education';
  const generated = imageSetForTopic(baseTitle, course);
  const existing = (lesson?.media?.images || []).filter(Boolean);
  const combined = [...existing, ...generated];
  return combined.filter((url, index, list) => list.indexOf(url) === index).slice(0, 3);
};

const downloadTextFile = (filename, content, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 300);
};

const readSharedPlanFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const hasPlan = ['country', 'grade', 'course', 'topic'].some((key) => params.has(key));
  if (!hasPlan) return null;
  return {
    country: params.get('country') || 'USA',
    state: params.get('state') || '',
    language: params.get('language') || 'English',
    grade: params.get('grade') || 'Grade 5',
    course: params.get('course') || 'General Education',
    need: params.get('need') || 'Lesson',
    role: params.get('role') || 'Teacher',
    topic: params.get('topic') || ''
  };
};

const buildShareUrl = (studentData = {}, curriculum = {}, topic = '') => {
  const url = new URL(window.location.origin + window.location.pathname);
  const values = {
    country: studentData.country || curriculum.country || 'USA',
    state: studentData.state || curriculum.state || '',
    language: studentData.language || curriculum.language || 'English',
    grade: studentData.grade || curriculum.grade || 'Grade 5',
    course: curriculum.course || studentData.course || 'General Education',
    need: studentData.need || curriculum.need || 'Lesson',
    role: studentData.role || 'Teacher',
    topic
  };

  Object.entries(values).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

const topicTitle = (topic) => (
  typeof topic === 'string'
    ? topic
    : topic?.title || topic?.name || topic?.topic || topic?.lessonTitle || topic?.label || topic?.heading || topic?.standard || topic?.description || ''
);

const topicDescription = (topic, fallback = '') => (
  typeof topic === 'string'
    ? fallback
    : topic?.description || topic?.summary || fallback
);

const normalizeLessonItem = (lesson, sequence = 1, fallback = '') => ({
  ...((typeof lesson === 'object' && lesson) ? lesson : {}),
  title: topicTitle(lesson) || fallback || `Lesson ${sequence}`,
  description: topicDescription(lesson),
  sequence: (typeof lesson === 'object' && lesson?.sequence) || sequence
});

const buildTeacherScriptSections = (lesson, topic) => {
  if (Array.isArray(lesson?.teacherScript) && lesson.teacherScript.length) {
    return lesson.teacherScript;
  }
  const lessonTitle = lesson?.title || topic || 'Today\'s lesson';
  const grade = lesson?.grade || 'the selected grade';
  const region = lesson?.export_metadata?.region || lesson?.state || lesson?.country || 'your classroom context';
  const standard = (lesson?.standards || [])
    .map((item) => `${item.code || ''} ${item.description || item.body || ''}`.trim())
    .filter(Boolean)[0] || 'the selected grade-level standard';
  const firstQuizQuestion = lesson?.quiz?.[0]?.question || `How can you show understanding of ${lessonTitle}?`;

  return [
    {
      title: 'Teacher Plan: 45-Minute Start-to-Finish Script',
      items: [
        `Lesson goal: Students will understand ${lessonTitle.toLowerCase()} well enough to explain it, practice it with support, and complete an independent check.`,
        `Standard focus: ${standard}`,
        `Materials: board or projector, student paper or notebooks, the quiz below, any vocabulary supports, and the downloadable offline lesson packet if internet is limited.`,
        `Before students enter: Write the title, objective, three vocabulary words, and the exit question on the board. Prepare one local example from ${region}.`
      ]
    },
    {
      title: '0-5 Minutes: Welcome, Hook, and Objective',
      items: [
        `Say: "Today we are working on ${lessonTitle}. By the end, you should be able to explain the idea, use the vocabulary, and solve or respond to a new example on your own."`,
        `Read or paraphrase the hook: ${cleanLessonText(lesson?.hook || `Connect ${lessonTitle.toLowerCase()} to something students already know.`)}`,
        'Ask students to write one notice and one wonder. Take two quick responses, then connect their ideas back to the lesson objective.',
        'Check for readiness: thumbs up, sideways, or down. If many students show sideways/down, define the topic in simpler words before moving on.'
      ]
    },
    {
      title: '5-12 Minutes: Vocabulary and Background',
      items: [
        `Introduce 3-5 key terms connected to ${lessonTitle}. For each term, give a student-friendly definition, one example, and one non-example.`,
        'Say: "A definition is helpful, but an example proves we know what the word means."',
        'Students copy the terms, then turn to a partner and explain one term without reading it word-for-word.',
        'Support: provide sentence frames such as "This means ___ because ___" and "An example is ___."'
      ]
    },
    {
      title: '12-22 Minutes: Direct Instruction',
      items: [
        `Model the main skill or idea for ${lessonTitle.toLowerCase()} step by step. Think aloud so students hear the reasoning process.`,
        'Use one clear worked example. Label what you do first, second, and third.',
        'Show a common mistake or non-example. Ask: "Why does this not fully meet the goal?"',
        `Teacher talk move: "I am not just looking for the answer. I am looking for the thinking that proves the answer."`
      ]
    },
    {
      title: '22-32 Minutes: Guided Practice',
      items: [
        'Give students a similar task to try with a partner. Keep it close to the model so the cognitive jump is manageable.',
        'Circulate and listen for misunderstandings. Stop the room for a 30-second reteach if the same issue appears three times.',
        'Ask pairs: "What evidence supports your answer?" or "Which step helped you decide?"',
        'Invite one pair to share. Have the class add, correct, or clarify using respectful academic language.'
      ]
    },
    {
      title: '32-40 Minutes: Independent Practice',
      items: [
        `Students complete an independent task: explain ${lessonTitle.toLowerCase()}, solve a new example, or write a short response using evidence.`,
        'Require students to show their work, underline evidence, or label the steps they used.',
        'Small-group option: pull students who need support and complete the first item together. Give advanced students a transfer question tied to their community or another global context.',
        `Use this question as a quick check: ${firstQuizQuestion}`
      ]
    },
    {
      title: '40-45 Minutes: Assessment, Exit Ticket, and Close',
      items: [
        'Students complete the quiz or a one-minute exit ticket.',
        `Exit ticket: "In 3-5 sentences, explain ${lessonTitle.toLowerCase()} and give one example."`,
        'Collect responses and sort them into three piles: ready to move on, needs a small reteach, needs full reteach.',
        'Close by saying: "Today you practiced explaining your thinking, not just giving an answer. That is what helps learning transfer."'
      ]
    },
    {
      title: 'Differentiation and Teacher Notes',
      items: [
        'For multilingual learners: preview vocabulary, allow first-language discussion, and provide sentence frames.',
        'For students needing support: reduce the number of items, read directions aloud, and model one extra example.',
        'For advanced students: ask for a second method, a counterexample, or a real-world transfer connection.',
        'Offline plan: print or download the lesson HTML/TXT before class. Students can complete the full lesson without internet once the packet is saved.'
      ]
    }
  ];
};

const buildTeacherScriptText = (lesson, topic) => (
  buildTeacherScriptSections(lesson, topic)
    .map((section) => [
      section.title,
      ...section.items.map((item) => `- ${item}`)
    ].join('\n'))
    .join('\n\n')
);

const buildPortableLessonText = (lesson, topic) => {
  if (!lesson) return '';
  return [
    `Title: ${lesson.title}`,
    `Grade: ${lesson.grade || ''}`,
    `Topic: ${lesson.topic || topic || lesson.title}`,
    `Standards: ${(lesson.standards || []).map((standard) => `${standard.code || ''} ${standard.description || standard.body || ''}`.trim()).join('; ') || lesson.export_metadata?.region || 'Standards-aligned'}`,
    '',
    'Teacher Directions:',
    buildTeacherScriptText(lesson, topic),
    '',
    'Editable Lesson Content:',
    cleanLessonText(lesson.content),
    '',
    'Quiz:',
    ...(lesson.quiz || []).map((item, index) => `${index + 1}. ${item.question}${item.options ? `\nOptions: ${item.options.join(' | ')}` : ''}${item.answer ? `\nAnswer: ${item.answer}` : ''}`),
    '',
    'Google Classroom / LMS Use:',
    'Paste this into an assignment, material, module, or page. Edit names, due dates, accommodations, and student instructions before posting.',
    '',
    'Raw LMS JSON:',
    JSON.stringify(lesson, null, 2)
  ].join('\n');
};

const buildOfflineLessonHtml = (lesson, topic) => {
  const title = lesson?.title || topic || 'Global LMS Lesson';
  const teacherScript = buildTeacherScriptSections(lesson, topic).map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </section>
  `).join('');
  const quiz = (lesson?.quiz || []).map((item, index) => `
    <section class="quiz-item">
      <h3>${index + 1}. ${escapeHtml(item.question)}</h3>
      ${item.options ? `<p><strong>Options:</strong> ${escapeHtml(item.options.join(' | '))}</p>` : ''}
      ${item.answer ? `<p><strong>Answer:</strong> ${escapeHtml(item.answer)}</p>` : ''}
    </section>
  `).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #f8fbff; line-height: 1.55; }
    main { width: min(100% - 32px, 880px); margin: 0 auto; padding: 28px 0 46px; }
    header { padding: 24px; border-radius: 18px; background: #071a3a; color: #fff; }
    h1 { margin: 0; font-size: 32px; line-height: 1.08; }
    .pill { display: inline-block; margin-bottom: 12px; padding: 6px 10px; border-radius: 999px; background: #dbeafe; color: #1e3a8a; font-weight: 800; font-size: 12px; }
    section { margin-top: 18px; padding: 20px; border: 1px solid #dbeafe; border-radius: 14px; background: #fff; }
    pre { white-space: pre-wrap; font-family: inherit; }
    @media print { body { background: #fff; } main { width: 100%; padding: 0; } section, header { border-radius: 0; } }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="pill">Global LMS offline lesson</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(cleanLessonText(lesson?.hook || ''))}</p>
    </header>
    <section>
      <h2>Standards</h2>
      <p>${escapeHtml((lesson?.standards || []).map((standard) => `${standard.code || ''} ${standard.description || standard.body || ''}`.trim()).join('; ') || lesson?.export_metadata?.region || 'Standards-aligned')}</p>
    </section>
    ${teacherScript}
    <section>
      <h2>Editable Lesson Content</h2>
      <pre>${escapeHtml(cleanLessonText(lesson?.content || ''))}</pre>
    </section>
    <section>
      <h2>Quiz</h2>
      ${quiz || '<p>No quiz included.</p>'}
    </section>
    <section>
      <h2>Offline Use</h2>
      <p>This file can be opened without internet after download. Copy any section into Google Classroom, Canvas, Moodle, Schoology, Blackboard, Brightspace, Microsoft Teams, or another LMS when internet is available.</p>
    </section>
  </main>
</body>
</html>`;
};

const createLessonCastSlides = (lesson) => {
  if (!lesson) return [];

  const imagePool = getLessonImages(lesson, lesson.topic);
  const body = cleanLessonText(lesson.content);
  const studentSections = buildStudentReadingSections(lesson, lesson.topic || lesson.title);
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 55)
    .slice(0, 5);
  const lessonNarration = sentences.length >= 3
    ? sentences
    : studentSections.map((section) => `${section.heading}: ${section.body}`).slice(0, 5);

  const baseSlides = [
    {
      eyebrow: 'Lesson Preview',
      title: lesson.title,
      narration: cleanLessonText(lesson.hook) || `Today we are learning about ${lesson.topic || lesson.title}.`,
    },
    ...lessonNarration.map((sentence, index) => ({
      eyebrow: `Video Step ${index + 1}`,
      title: studentSections[index]?.heading || (index === 0 ? 'Build the Core Idea' : index === 1 ? 'Connect the Details' : 'Practice the Skill'),
      narration: sentence,
    })),
    {
      eyebrow: 'Check Yourself',
      title: 'Ready for the Knowledge Check',
      narration: lesson.quiz?.[0]?.question
        ? `Think about this: ${cleanLessonText(lesson.quiz[0].question)}`
        : 'Review the main idea, then try the questions below.',
    },
  ];

  return baseSlides.slice(0, 7).map((slide, index) => ({
    ...slide,
    image: imagePool[index % imagePool.length],
  }));
};

const CourseCard = ({ id, title, category, description, price, image, onAction, actionLabel = "Start Learning" }) => {
  const displayTitle = title || category || 'Lesson';
  return (
  <div className="course-card" id={`card-${id}`}>
    <div className="course-media">
      <img 
        src={image || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60"} 
        alt={displayTitle} 
        className="course-image"
        onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=60" }}
      />
    </div>
    <div className="course-content">
      {category && <div className="course-category">{category}</div>}
      <h3 className="course-title">{displayTitle}</h3>
      <p className="course-description">{description}</p>
      <div className="course-footer">
        <span className="course-price">{price}</span>
        <button 
          id={`btn-${id}`}
          aria-label={`${actionLabel} ${displayTitle}`}
          className="btn-buy" 
          onClick={onAction}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  </div>
  );
};

const UnitLessonPanel = ({ unit, unitIndex, onSelectTopic, onSelectUnit }) => (
  <article className="unit-panel">
    <div className="unit-panel-header">
      <div>
        <span className="unit-kicker">Unit {unit.sequence || unitIndex + 1}</span>
        <h3>{unit.title}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        <span className="unit-duration">{unit.duration || '3-5 class periods'}</span>
        {onSelectUnit && (
          <button type="button" className="unit-view-all-btn" onClick={() => onSelectUnit(unit, unitIndex)}>
            View all lessons →
          </button>
        )}
      </div>
    </div>
    {unit.standardsFocus && <p className="unit-standards">{unit.standardsFocus}</p>}
    <div className="lesson-list">
      {(unit.lessons || []).map((lesson, lessonIndex) => (
        <button
          key={`${unit.title}-${topicTitle(lesson)}`}
          type="button"
          className="lesson-row"
          onClick={() => onSelectTopic(topicTitle(lesson))}
        >
          <span className="lesson-number">{lesson.sequence || lessonIndex + 1}</span>
          <span className="lesson-row-title">{topicTitle(lesson)}</span>
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  </article>
);

const SUPPORT_EMAIL = 'support@global-lms.org';

const ContactModal = ({ isOpen, onClose, userEmail }) => {
  const [msg, setMsg] = useState('');
  const [replyEmail, setReplyEmail] = useState(userEmail || '');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setReplyEmail(userEmail || '');
  }, [userEmail, isOpen]);

  const handleSend = async () => {
    if (!replyEmail || !msg.trim()) return;
    const response = await fetch(`${API_BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: replyEmail, message: msg })
    });
    if (!response.ok) return;
    setSent(true);
    setTimeout(() => { setSent(false); onClose(); }, 2000);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass max-w-md w-full p-8 space-y-6">
        <h3 className="text-2xl font-black">Contact Global Support</h3>
        <p className="text-sm text-dim">
          How can we help you today? Our team is standing by at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        {sent ? (
          <div className="bg-green-50 text-green-600 p-4 rounded-xl font-bold flex items-center gap-2">
            <CheckCircle size={20} /> Message Sent Successfully!
          </div>
        ) : (
          <div className="space-y-4">
            <input
              className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:border-primary"
              type="email"
              placeholder="Your email"
              value={replyEmail}
              onChange={(e) => setReplyEmail(e.target.value)}
            />
            <textarea 
              className="w-full p-4 border border-slate-200 rounded-xl min-h-[150px] outline-none focus:border-primary"
              placeholder="Type your question or feedback here..."
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            <div className="flex gap-4">
              <button className="flex-1 p-4 rounded-xl font-bold bg-slate-100" onClick={onClose}>Cancel</button>
              <button className="flex-1 p-4 rounded-xl font-bold bg-primary text-white" onClick={handleSend}>Send Message</button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const SOCIAL_SHARE_URL = 'https://global-lms.org/';
const SOCIAL_SHARE_TEXT = 'Global LMS has already-loaded standards-aligned K-12 lessons, units, and full courses by country, grade, subject, and build type. Editable and easy to move into any LMS.';
const FACEBOOK_PROFILE_URL = 'https://www.facebook.com/profile.php?id=61590056415154';

const SocialShareButtons = () => {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(SOCIAL_SHARE_URL);
  const encodedText = encodeURIComponent(`${SOCIAL_SHARE_TEXT} ${SOCIAL_SHARE_URL}`);
  const encodedTitle = encodeURIComponent('Global LMS');
  const shareLinks = [
    {
      label: 'Facebook',
      shortLabel: 'FB',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: 'Facebook Profile',
      shortLabel: 'Pf',
      url: FACEBOOK_PROFILE_URL,
    },
    {
      label: 'Bluesky',
      shortLabel: 'BS',
      url: `https://bsky.app/intent/compose?text=${encodedText}`,
    },
    {
      label: 'LinkedIn',
      shortLabel: 'In',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      label: 'WhatsApp',
      shortLabel: 'WA',
      url: `https://wa.me/?text=${encodedText}`,
    },
    {
      label: 'Email',
      shortLabel: 'Email',
      url: `mailto:?subject=${encodedTitle}&body=${encodedText}`,
    },
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${SOCIAL_SHARE_TEXT}\n${SOCIAL_SHARE_URL}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="social-share-strip" aria-label="Share Global LMS">
      <span className="social-share-label">
        <Share2 size={14} /> Share
      </span>
      {shareLinks.map((link) => (
        <a key={link.label} href={link.url} target="_blank" rel="noreferrer" aria-label={`Share Global LMS on ${link.label}`}>
          <span className="social-share-short">{link.shortLabel}</span>
          <span className="social-share-full">{link.label}</span>
        </a>
      ))}
      <button type="button" onClick={copyLink} aria-label="Copy Global LMS share text">
        <Copy size={14} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

const NewsletterSignup = ({ defaultEmail = '', onTrack }) => {
  const [email, setEmail] = useState(defaultEmail || '');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setEmail(defaultEmail || '');
  }, [defaultEmail]);

  const handleSubscribe = async () => {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setStatus('Enter a valid email.');
      return;
    }
    setStatus('Saving...');
    try {
      const res = await fetch(`${API_BASE}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: clean,
          name: name.trim(),
          source: 'homepage-newsletter'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save subscription.');
      onTrack?.('newsletter_signup', { email: clean });
      setStatus('You are on the list.');
    } catch (err) {
      setStatus(err.message || 'Could not save subscription.');
    }
  };

  return (
    <div className="newsletter-card">
      <div className="newsletter-copy">
        <strong>Monthly updates</strong>
        <span>Get product news, lesson drops, and classroom notes by email.</span>
      </div>
      <div className="newsletter-fields">
        <input
          className="newsletter-input"
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="newsletter-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="button" className="lesson-nav-btn" onClick={handleSubscribe}>
          Join Newsletter
        </button>
      </div>
      <small>{status || 'No spam. Just updates you can use.'}</small>
    </div>
  );
};

const HelpBot = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: 'Ask me about using Global LMS, pricing, saving plans, uploading resources, payments, or finding a lesson.'
    }
  ]);

  const suggestCourse = (text) => {
    const lower = text.toLowerCase();
    if (/math|algebra|geometry|calculus|statistics/.test(lower)) return 'Try Mathematics, Algebra I, Geometry, Statistics, AP Calculus AB, or AP Statistics.';
    if (/science|biology|chemistry|physics|environment/.test(lower)) return 'Try Science, Biology, Chemistry, Physics, Environmental Science, or AP Biology.';
    if (/read|ela|english|writing|literature/.test(lower)) return 'Try English Language Arts, Reading Literature, Writing and Communication, AP English Language, or AP English Literature.';
    if (/history|government|civics|geography|economics/.test(lower)) return 'Try World History, US History, Civics and Government, Geography, AP Human Geography, or Economics.';
    if (/computer|coding|robot|technology|game development|game design/.test(lower)) return 'Try Computer Science, Robotics, Game Development, Coding and Robotics, AP Computer Science Principles, or AP Computer Science A.';
    if (/spanish|french|language|esl|english learner/.test(lower)) return 'Try World Languages, Spanish, French, or ESL / English Learners.';
    return 'Try starting with General Education, then choose your grade, country, and build type. If you know the subject, use the course dropdown or search box.';
  };

  const answerFor = (text) => {
    const lower = text.toLowerCase();
    if (/cost|price|pricing|lesson|unit|course/.test(lower) && /cost|price|pricing|\$|how much/.test(lower)) {
      return 'Standard pricing is Lesson $5, Unit $10, Course $100. Some regions may show free or regional pricing. SIS access includes starter seats, with expanded school rosters planned at $25/student.';
    }
    if (/how.*use|start|build.*plan|use.*site|begin/.test(lower)) {
      return 'Start on Home. Pick Student Level, Course Selection, Global Region, and Build Type. Click Build My Plan. Then open a lesson, unit, or course. Each lesson includes a 45-minute teacher script, quiz, answer key, LMS copy/export, TXT, JSON, and offline HTML.';
    }
    if (/save|sign in|account|login/.test(lower)) {
      return 'Use Sign In with your name, email, and role. After that, Build My Plan saves your selected country, grade, course, and build type so usage can be tracked.';
    }
    if (/offline|no internet|download/.test(lower)) {
      return 'Open any lesson and use TXT, Offline HTML, or JSON download. Offline HTML can be opened later without internet. It includes the teacher plan, lesson content, quiz, and answer key.';
    }
    if (/google classroom|canvas|moodle|schoology|blackboard|brightspace|teams|lms/.test(lower)) {
      return 'Open a lesson and click Copy for Any LMS. Then paste it into Google Classroom, Canvas, Moodle, Schoology, Blackboard, Brightspace, Teams, or another LMS. You can also download TXT or JSON.';
    }
    if (/upload|sell|marketplace|creator|resource/.test(lower)) {
      return 'Go to Marketplace. Creators can sell lessons, units, or courses and set their own price. Add your certification status. Verified teacher resources show a certified badge; non-certified resources show a clear notice so buyers know before using them. Paid resources currently use an 80% creator / 20% platform split.';
    }
    if (/payment|processor|stripe|paid|payout|split/.test(lower)) {
      return 'Payments are designed around Stripe Checkout. Marketplace items can carry creator email, creator share, platform fee, and item metadata. The planned split is 80% creator and 20% platform for paid marketplace resources.';
    }
    if (/sis|student information|gradebook|communication|roster/.test(lower)) {
      return 'Student Info opens the live SIS tools. It has student records, gradebook scores, communications, and offline packet tools, with deeper permanent SIS records planned.';
    }
    if (/find|recommend|suggest|try|need.*lesson|which course/.test(lower)) {
      return `${suggestCourse(text)} Click Home, choose the matching course and grade, then Build My Plan.`;
    }
    if (/support|contact|help/.test(lower)) {
      return 'Click Support in the top bar to send a message. If the help bot does not know an answer yet, support is the best next step.';
    }
    return 'I can help with pricing, how to use the site, saving plans, offline downloads, LMS export, SIS tools, marketplace uploads, payments, and finding a lesson. Try asking: "How much is a unit?" or "Find me a science lesson."';
  };

  const ask = (event) => {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;
    setMessages((current) => [
      ...current,
      { from: 'user', text: cleanQuestion },
      { from: 'bot', text: answerFor(cleanQuestion) }
    ]);
    setQuestion('');
  };

  const quickPrompts = [
    'How much does it cost?',
    'How do I upload a lesson?',
    'How do payments work?',
    'Find me a science lesson'
  ];

  return (
    <div className={`helpbot ${isOpen ? 'is-open' : ''}`}>
      {isOpen && (
        <div className="helpbot-panel">
          <div className="helpbot-header">
            <div>
              <strong>Ask Global LMS</strong>
              <span>Site help and lesson suggestions</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)}>Close</button>
          </div>
          <div className="helpbot-messages">
            {messages.map((msg, index) => (
              <div key={`${msg.from}-${index}`} className={`helpbot-message ${msg.from}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <div className="helpbot-prompts">
            {quickPrompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => {
                setQuestion(prompt);
                setMessages((current) => [...current, { from: 'user', text: prompt }, { from: 'bot', text: answerFor(prompt) }]);
              }}>
                {prompt}
              </button>
            ))}
          </div>
          <form className="helpbot-form" onSubmit={ask}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question..." />
            <button type="submit"><ArrowRight size={16} /></button>
          </form>
          <button type="button" className="helpbot-home" onClick={() => onNavigate('onboarding')}>Go to Home builder</button>
        </div>
      )}
      <button type="button" className="helpbot-toggle" onClick={() => setIsOpen((value) => !value)}>
        <Info size={18} /> Ask Global LMS
      </button>
    </div>
  );
};

const normalizeLoginEmail = (value = '') => (
  String(value || '')
    .trim()
    .replace(/\s*@\s*/g, '@')
    .replace(/@gmail\s+com$/i, '@gmail.com')
    .replace(/\s*\.\s*/g, '.')
    .toLowerCase()
);
const OWNER_EMAILS = ['jwmorris1980@gmail.com', SUPPORT_EMAIL].map(normalizeLoginEmail);
const isOwnerAdminEmail = (email = '') => OWNER_EMAILS.includes(normalizeLoginEmail(email));
const publicAccountRole = (role = 'Teacher') => (role === 'Student' ? 'Student' : 'Teacher');
const roleForEmail = (email = '', requestedRole = 'Teacher') => (
  isOwnerAdminEmail(email) ? 'Admin' : publicAccountRole(requestedRole)
);
const isOwnerAdmin = (user) => isOwnerAdminEmail(user?.email);

const Navbar = ({ onNavigate, user, onOpenContact, onSignOut }) => {
  const ownerAdmin = isOwnerAdmin(user);
  const accessLabel = ownerAdmin ? 'Owner access' : user ? `${user.role} access` : 'Guest access';
  return (
  <nav className="navbar sticky top-0 z-50">
    <div className="brand-lockup" onClick={() => onNavigate('onboarding')}>
      <div className="brand-mark">
        <Globe size={24} />
      </div>
      <div className="brand-copy">
        <span>GLOBAL LMS</span>
        <small>Warehouse Engine</small>
      </div>
    </div>
    
    <div className="nav-links">
      <button type="button" className="nav-link" onClick={() => onNavigate('onboarding')}>Home</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('pricing')}>Pricing</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('sample')}>Free sample</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('path')}>Courses</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('marketplace')}>Marketplace</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('sis')}>Student Info</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('about')}>About</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('lms-guide')}>LMS Guide</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('whiteboard')}>Whiteboard</button>
      {ownerAdmin && <button type="button" className="nav-link nav-admin-link" onClick={() => onNavigate('usage')}>Admin</button>}
      <button type="button" className="nav-link" onClick={() => onNavigate('safety')}>Safety</button>
      <button type="button" className="nav-link" onClick={() => onNavigate('security')}>Security</button>
    </div>

    <div className="nav-actions">
      <button 
        className="support-btn" 
        onClick={onOpenContact}>
        <Mail size={14} /> Support
      </button>
      {user && (
        <div className="points-counter">
          <Trophy size={16} />
          <span>{user.points || 0}</span>
        </div>
      )}
      
      {user ? (
        <div className="flex items-center gap-3">
          <div className={`nav-user-access ${ownerAdmin ? 'is-admin' : ''}`} title={user.email}>
            <span>{ownerAdmin ? 'Admin access' : accessLabel}</span>
            <strong>{user.email}</strong>
          </div>
          {ownerAdmin && <span className="nav-admin-pill">ADMIN</span>}
          <span className={`badge-role ${ownerAdmin || user.role === 'Teacher' ? 'role-teacher' : 'role-student'}`}>
            {ownerAdmin ? 'Admin' : user.role}
          </span>
          <button type="button" className="nav-mini-btn" onClick={() => onNavigate('auth')}>Switch</button>
          <button type="button" className="nav-mini-btn" onClick={onSignOut}>Sign Out</button>
          <div className="user-avatar">
            <User size={16} />
          </div>
        </div>
      ) : (
        <button className="btn-buy" onClick={() => onNavigate('auth')}>Sign In</button>
      )}
    </div>
  </nav>
  );
};

const PrivacyShield = () => (
  <div className="flex flex-wrap justify-center gap-8 py-8 border-y border-slate-100 bg-slate-50/50">
    <div className="flex items-center gap-3 text-slate-500">
      <Shield className="text-primary" size={24} />
      <div className="text-left">
        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">COPPA / FERPA-minded</p>
        <p className="text-xs font-medium">K-12 curriculum, not a medical product</p>
      </div>
    </div>
    <div className="flex items-center gap-3 text-slate-500">
      <CheckCircle className="text-green-500" size={24} />
      <div className="text-left">
        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Private Database</p>
        <p className="text-xs font-medium">No 3rd-Party Data Sharing</p>
      </div>
    </div>
    <div className="flex items-center gap-3 text-slate-500">
      <Clock className="text-amber-500" size={24} />
      <div className="text-left">
        <p className="text-[10px] font-black uppercase tracking-widest leading-tight">Warehouse Ready</p>
        <p className="text-xs font-medium">Pre-generated & Secure</p>
      </div>
    </div>
  </div>
);

// ── About / How It Works ──────────────────────────────────────────────────────
const AboutView = ({ onBack, onOpenContact, onNavigate }) => (
  <section className="about-shell">
    <button type="button" className="lesson-nav-btn lms-guide-back" onClick={onBack}>
      <ChevronLeft size={16} /> Back to builder
    </button>

    <div className="about-hero">
      <span className="onboarding-eyebrow">About Global LMS</span>
      <h1>AI-built warehouse lessons teachers can actually preview</h1>
      <p>
        Global LMS is a K-12 curriculum warehouse: packaged lessons, units, and courses by country, grade, and subject. Stripe checkout is $5 / $10 / $100 in standard regions, with a 30-day money-back guarantee. Built by a teacher, for teachers.
      </p>
    </div>

    <div className="about-section">
      <h2>How It Works</h2>
      <div className="about-steps">
        {[
          { n: '1', title: 'Pick your context', body: 'Choose country, grade, subject, and language. Packages follow that region’s standards format so you are not starting from a blank page.' },
          { n: '2', title: 'Open a packaged lesson', body: 'Warehouse lessons arrive as a 45-minute teacher script, student text, worksheet, quiz, and answer key — not a live chatbot conversation.' },
          { n: '3', title: 'Use it your way', body: 'Preview on-screen, print, export to Google Classroom, Canvas, or any LMS, or download offline. You remain the editor of record.' },
        ].map(s => (
          <div key={s.n} className="about-step">
            <div className="about-step-num">{s.n}</div>
            <div>
              <strong>{s.title}</strong>
              <p>{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="about-section">
      <h2>See it in action</h2>
      <div className="about-videos">
        {PRODUCT_TOUR.map(v => (
          <div key={v.id} className="about-video-card about-tour-card">
            <button type="button" className="about-video-placeholder about-tour-preview" onClick={() => onNavigate?.(viewFromPath(v.href) === 'onboarding' && v.href === '/' ? 'onboarding' : viewFromPath(v.href))}>
              <Play size={32} />
              <span>{v.action}</span>
            </button>
            <div className="about-video-meta">
              <strong>{v.title}</strong>
              <p>{v.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="about-section about-mission">
      <h2>The Mission</h2>
      <p>
        Teachers in high-need and conflict-affected regions — including Ukraine, Haiti, Yemen, Palestine, Pakistan, Sudan, and others — get <strong>free access</strong>, no credit card. Everyone else pays a country-tiered scale. A lesson that costs $5 in the US costs $2 in Mexico or Brazil.
      </p>
      <p>
        This is a one-person project built by a teacher with a physical disability who wanted curriculum that is ready for tomorrow’s class — not a demo toy.
      </p>
    </div>

    <div className="about-section">
      <h2>Transparency</h2>
      <div className="about-transparency">
        {[
          { icon: '📦', title: 'AI-built, then packaged', body: 'Lessons are generated into a stable warehouse format (script, text, quiz, key). They are not live unconstrained chat. Teachers should still review before high-stakes or official use. That is the same promise as Safety: packaged for classrooms, not “secretly hand-vetted line by line.”' },
          { icon: '📋', title: 'Standards-aligned format', body: 'Content is structured against the curriculum format for the selected country and grade. Verify alignment for high-stakes use.' },
          { icon: '🔒', title: 'Privacy', body: 'We do not sell your data. Email is used for receipts, account save, and support. This is a K-12 curriculum product (COPPA/FERPA-minded), not a medical records system.' },
          { icon: '💳', title: 'Payments', body: `All payments are processed by Stripe. We never store card numbers. ${STANDARD_PRICING.guarantee} on all purchases.` },
        ].map(t => (
          <div key={t.title} className="about-transparency-item">
            <span className="about-transparency-icon">{t.icon}</span>
            <div>
              <strong>{t.title}</strong>
              <p>{t.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="about-contact">
      <h2>Questions or Feedback?</h2>
      <p>This is a real person on the other end — not a support bot.</p>
      <button type="button" className="cta-primary-btn" onClick={onOpenContact}>
        <Mail size={16} /> Get in touch
      </button>
    </div>
  </section>
);
// ─────────────────────────────────────────────────────────────────────────────

const LmsCompatibilityView = ({ onBack }) => {
  const lmsTargets = [
    {
      name: 'Google Classroom',
      detail: 'Copy, export, or adapt the editable lesson into assignments, classwork, and shared materials.'
    },
    {
      name: 'Canvas',
      detail: 'Move lesson plans, quizzes, worksheets, and unit outlines into modules, pages, and assignments.'
    },
    {
      name: 'Moodle',
      detail: 'Use the content in courses, topics, activities, resources, quizzes, and downloadable materials.'
    },
    {
      name: 'Schoology',
      detail: 'Place curriculum into courses, folders, assignments, assessments, and classroom resources.'
    },
    {
      name: 'Blackboard',
      detail: 'Use lessons and units inside content areas, modules, assignments, discussions, and assessments.'
    },
    {
      name: 'Brightspace',
      detail: 'Move editable plans into content modules, lessons, quizzes, assignments, and course resources.'
    },
    {
      name: 'Microsoft Teams',
      detail: 'Share lesson materials through class teams, assignments, files, notebooks, and posts.'
    },
    {
      name: 'Any LMS',
      detail: 'Because the curriculum is editable and portable, it can be moved into almost any page, assignment, or course shell.'
    }
  ];

  return (
    <section className="lms-guide-shell">
      <button type="button" className="lesson-nav-btn lms-guide-back" onClick={onBack}>
        <ChevronLeft size={16} /> Back to builder
      </button>
      <div className="lms-guide-header">
        <span className="onboarding-eyebrow">Portable Curriculum</span>
        <h1>Works With Your LMS</h1>
        <p>
          Pick a country, grade, subject, and build type. Then move the editable lesson, unit, or course into the platform your school already uses.
        </p>
      </div>
      <div className="lms-guide-grid">
        {lmsTargets.map((target) => (
          <article key={target.name} className="lms-guide-card">
            <h2>{target.name}</h2>
            <p>{target.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

const OnboardingView = ({ onComplete, onOpenLmsGuide, onBuildAiDraft, onBuyAiCredits, onPurchase, aiBuildStatus, user, onTrack }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiIdea, setAiIdea] = useState('');
  const [feedbackChoice, setFeedbackChoice] = useState('');
  const [data, setData] = useState({ 
    country: 'USA', 
    language: 'English', 
    grade: 'Grade 5', 
    course: 'General Education', 
    email: '',
    role: 'Teacher',
    need: 'Lesson',
    workspaceType: 'Individual teacher',
    workspaceName: ''
  });
  
  const [catalog, setCatalog] = useState({
    countries: ["USA", "UK", "Canada", "Mexico", "Spain", "Pakistan", "Zimbabwe", "Afghanistan", "Ethiopia", "Yemen", "Somalia", "South Sudan", "Ukraine", "Palestine"],
    grades: Array.from({length: 12}, (_, i) => `Grade ${i + 1}`),
    courses: [
      "General Education", "English Language Arts", "Mathematics", "Algebra I", "Geometry", "Biology", "Chemistry", "Physics", "World History", "US History",
      "Civics and Government", "Computer Science", "Coding and Robotics", "Robotics", "Game Development", "Career and Technical Education", "Business and Entrepreneurship", "World Languages",
      "Spanish", "ESL / English Learners", "Visual Arts", "Music Theory", "Physical Education", "Health", "Personal Finance", "Financial Literacy", "Law and Legal Literacy",
      "Exam Prep", "Job Skills", "Resume and Cover Letter Writing", "Interview Skills", "Programming and App Development", "Media Literacy", "Consumer Skills", "Home and Independent Living", "First Aid and Safety", "Social Emotional Learning",
      "AP English Language", "AP Calculus AB", "AP Statistics", "AP Biology", "AP Chemistry", "AP Computer Science Principles", "AP World History", "AP US History", "AP Psychology"
    ],
    needs: ["Lesson", "Unit", "Course"]
  });
  const countries = catalog.countries;
  const grades = catalog.grades;
  const courses = catalog.courses;
  const needs = ["Lesson", "Unit", "Course"];
  const freeAccessCountries = ["Pakistan", "Zimbabwe", "Afghanistan", "Ethiopia", "Yemen", "Somalia", "South Sudan", "Ukraine", "Palestine"];
  const tier1Countries = ["Mexico", "Brazil", "India", "Vietnam", "Egypt", "Indonesia", "Philippines", "Nigeria", "Kenya", "South Africa"];
  const getRegionalPricing = (country) => {
    if (freeAccessCountries.includes(country)) return { lesson: 0, unit: 0, course: 0, label: 'Free access region' };
    if (tier1Countries.includes(country)) return { lesson: 2, unit: 8, course: 50, label: 'Regional access pricing' };
    return { lesson: 5, unit: 10, course: 100, label: 'Standard access pricing' };
  };
  const regionalPricing = getRegionalPricing(data.country);
  const priceForNeed = {
    Lesson: regionalPricing.lesson,
    Unit: regionalPricing.unit,
    Course: regionalPricing.course
  }[data.need];
  const getNeedLabel = (need) => {
    const price = {
      Lesson: regionalPricing.lesson,
      Unit: regionalPricing.unit,
      Course: regionalPricing.course
    }[need];
    return `${need} ${price === 0 ? 'Free' : `$${price}`}`;
  };
  const accessLabel = `${regionalPricing.label} - ${priceForNeed === 0 ? 'Free' : `$${priceForNeed}`}`;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredCountries = normalizedSearch
    ? countries.filter((country) => country.toLowerCase().includes(normalizedSearch)).slice(0, 8)
    : [];
  const filteredCourses = normalizedSearch
    ? courses.filter((course) => course.toLowerCase().includes(normalizedSearch)).slice(0, 8)
    : [];
  const filteredNeeds = normalizedSearch
    ? needs.filter((need) => need.toLowerCase().includes(normalizedSearch))
    : [];
  const searchResults = [
    ...filteredCountries.map((value) => ({ type: 'country', value, label: `Region: ${value}` })),
    ...filteredCourses.map((value) => ({ type: 'course', value, label: `Course: ${value}` })),
    ...filteredNeeds.map((value) => ({ type: 'need', value, label: `Build Type: ${value}` }))
  ].slice(0, 8);
  const applySearchResult = (result) => {
    onTrack?.('catalog_search_select', { searchTerm, resultType: result.type, resultValue: result.value });
    if (result.type === 'country') setData({ ...data, country: result.value });
    if (result.type === 'course') setData({ ...data, course: result.value });
    if (result.type === 'need') setData({ ...data, need: result.value });
    setSearchTerm('');
  };
  const updateField = (field, value) => {
    setData((current) => ({ ...current, [field]: value }));
    onTrack?.('builder_field_change', { field, value });
  };
  const launchDemo = (need, course, grade = data.grade, topic = '') => {
    onTrack?.('instant_demo_click', { need, course, grade, topic });
    onComplete({
      ...data,
      need,
      course,
      grade,
      topic,
      role: 'Teacher',
      workspaceType: data.workspaceType,
      workspaceName: data.workspaceName,
      email: data.email || 'demo@global-lms.local'
    });
  };
  const buildPlan = () => {
    onTrack?.('build_plan_click', {
      country: data.country,
      grade: data.grade,
      course: data.course,
      need: data.need,
      role: data.role,
      workspaceType: data.workspaceType,
      workspaceName: data.workspaceName
    });
    onComplete(data);
  };
  const giveFeedback = (choice) => {
    setFeedbackChoice(choice);
    onTrack?.('visitor_intent_feedback', { topic: choice, plan: { source: 'homepage_feedback', choice } });
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/catalog`)
      .then((res) => res.ok ? res.json() : null)
      .then((result) => {
        if (result?.countries?.length) setCatalog(result);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="onboarding-shell">
      <div className="onboarding-header">
        <div className="creator-hero-callout">
          <strong>Teachers can sell here too</strong>
          <span>List lessons, units, or courses, set your own price, and show a certified-teacher badge when verified.</span>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('global-lms-open-marketplace'))}>
            Sell resources
          </button>
        </div>
        <span className="onboarding-eyebrow">Every K-12 lesson, anywhere on the planet</span>
        <h1 className="onboarding-title">
          Already-loaded <span className="text-gradient">standards-aligned</span> curriculum
        </h1>
        <p className="onboarding-subtitle">
          Pick a grade and subject. Preview a real lesson — story, script, quiz, and answer key — then buy with Stripe. Lesson ${STANDARD_PRICING.lesson} · Unit ${STANDARD_PRICING.unit} · Course ${STANDARD_PRICING.course}. {STANDARD_PRICING.guarantee}.
        </p>
        {user?.email && isRealEmail(user.email) && (
          <div className="free-lessons-welcome" role="status">
            <strong>Welcome, glad to have you{user.name ? `, ${user.name}` : ''}.</strong>
            <span>
              You can open {user.freeLessonRemaining ?? FREE_LESSON_LIMIT} of {user.freeLessonLimit ?? FREE_LESSON_LIMIT} lessons for free. No credit card is needed to start.
            </span>
          </div>
        )}
        <button type="button" className="lms-inline-link" onClick={onOpenLmsGuide}>
          See LMS compatibility
        </button>
        <div className="proof-strip">
          <span><strong>197</strong> countries</span>
          <span><strong>95</strong> courses</span>
          <span><strong>39,552</strong> packages</span>
          <span><strong>${STANDARD_PRICING.lesson}</strong> / lesson</span>
          <span><strong>${STANDARD_PRICING.unit}</strong> / unit</span>
          <span><strong>${STANDARD_PRICING.course}</strong> / course</span>
          <span><strong>Stripe</strong> checkout</span>
          <span><strong>30-day</strong> money-back</span>
        </div>
        <div className="social-proof-row" aria-label="Classroom proof">
          {SOCIAL_PROOF.map((item) => (
            <blockquote key={item.name} className="social-proof-card">
              <p>“{item.quote}”</p>
              <footer><strong>{item.name}</strong> · {item.role}</footer>
            </blockquote>
          ))}
        </div>
        <div className="instant-demo-panel" aria-label="Instant curriculum demos">
          <span className="instant-demo-label">Try a ready-built example</span>
          <div className="instant-demo-row">
            <button type="button" onClick={() => launchDemo('Lesson', 'Reading Literature', 'Grade 5', 'Analyzing Story Elements: Characters, Setting, Plot Structure & Figurative Language')}>
              Open Reading Lesson
            </button>
            <button type="button" onClick={() => launchDemo('Lesson', 'Physics', 'Grade 9', 'Introduction to Physics & Scientific Inquiry (NGSS: Science & Engineering Practices, Crosscutting Concepts)')}>
              Open Physics Lesson
            </button>
            <button type="button" onClick={() => launchDemo('Unit', 'Financial Literacy', 'Grade 6')}>
              See Money Unit
            </button>
            <button type="button" onClick={() => launchDemo('Course', 'Game Development', 'Grade 9')}>
              Preview Coding Course
            </button>
            <button type="button" onClick={() => launchDemo('Unit', 'Robotics', 'Grade 7')}>
              Try Robotics Unit
            </button>
          </div>
        </div>
      </div>

      <div className="onboarding-card">
        <div className="onboarding-form">
          <div className="catalog-builder-panel">
              <div className="search-block">
                <label htmlFor="catalog-search">Search the catalog</label>
                <div className="search-shell">
                  <input
                    id="catalog-search"
                    className="search-input"
                    type="search"
                    placeholder="Find a country, course, lesson, unit, or course plan..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onBlur={() => searchTerm.trim() && onTrack?.('catalog_search_blur', { searchTerm: searchTerm.trim() })}
                  />
                  {searchResults.length > 0 && (
                    <div className="search-results">
                      {searchResults.map((result) => (
                        <button
                          key={`${result.type}-${result.value}`}
                          type="button"
                          onClick={() => applySearchResult(result)}
                        >
                          {result.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="grade-select">Student Level</label>
                  <select
                    id="grade-select"
                    className="form-control"
                    value={data.grade} onChange={e => updateField('grade', e.target.value)}>
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="course-select">Course Selection</label>
                  <select
                    id="course-select"
                    className="form-control"
                    value={data.course} onChange={e => updateField('course', e.target.value)}>
                    {courses.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="country-select">Global Region</label>
                  <select
                    id="country-select"
                    className="form-control"
                    value={data.country} onChange={e => updateField('country', e.target.value)}>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="need-select">Build Type</label>
                  <select
                    id="need-select"
                    className="form-control"
                    value={data.need}
                    onChange={e => updateField('need', e.target.value)}
                  >
                    {needs.map(n => <option key={n} value={n}>{getNeedLabel(n)}</option>)}
                  </select>
                </div>
              </div>

              <div className="onboarding-action">
                <button
                  id="btn-initialize"
                  className="initialize-btn"
                  onClick={buildPlan}
                >
                  Build My Plan <ArrowRight size={18} />
                </button>
              </div>
          </div>

          <div className="advanced-tab-row">
            <button
              type="button"
              className="advanced-tab"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
            >
              Advanced
              <span>{advancedOpen ? 'Hide details' : `${data.need} request - ${accessLabel}`}</span>
            </button>
          </div>

          <div className="sis-pricing-note">
            <div>
              <strong>Student Information System</strong>
              <span>Starter rosters include 50 students, then planned at $25/student for expanded SIS access.</span>
            </div>
            <p>
              Schools under 50 students can use starter SIS access, with paid plans intended for teams that need faster help, larger rosters, and deeper setup support.
            </p>
          </div>

          <div className="creator-home-blurb">
            <div>
              <strong>Sell your own lessons, units, or courses</strong>
              <span>Set your own price in the Marketplace. Certified teachers can show a trust badge; non-certified resources are clearly labeled before buyers use them.</span>
            </div>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('global-lms-open-marketplace'))}>
              Open Marketplace
            </button>
          </div>

          <div className="paid-access-panel">
            <div>
              <strong>Buy ready-made Global LMS access</strong>
              <span>Stripe Checkout for a lesson (${STANDARD_PRICING.lesson}), unit (${STANDARD_PRICING.unit}), or full course (${STANDARD_PRICING.course}). Guests can check out without creating a Student account — Stripe collects email for the receipt.</span>
            </div>
            <div className="paid-access-actions">
              <button type="button" onClick={() => onPurchase?.('Global LMS Lesson Access', '$5')}>Buy Lesson $5</button>
              <button type="button" onClick={() => onPurchase?.('Global LMS Unit Access', '$10')}>Buy Unit $10</button>
              <button type="button" onClick={() => onPurchase?.('Global LMS Full Course Access', '$100')}>Buy Course $100</button>
            </div>
            <div className="guarantee-badge">
              <Shield size={15} />
              <span>30-day money-back guarantee — if it doesn't work for you, email us and we'll refund in full, no questions asked.</span>
            </div>
          </div>

          {advancedOpen && (
            <div className="advanced-panel">
              <div className="form-group">
                <div className="compact-label-row">
                  <label>Tell it exactly what to build</label>
                  <span>{accessLabel}</span>
                </div>
                <div className="need-selector">
                  <button type="button" className={`need-btn ${data.need === 'Lesson' ? 'is-active' : ''}`} onClick={() => setData({...data, need: 'Lesson'})}>
                    Single lesson
                  </button>
                  <button type="button" className={`need-btn ${data.need === 'Unit' ? 'is-active' : ''}`} onClick={() => setData({...data, need: 'Unit'})}>
                    Unit sequence
                  </button>
                  <button type="button" className={`need-btn ${data.need === 'Course' ? 'is-active' : ''}`} onClick={() => setData({...data, need: 'Course'})}>
                    Full course
                  </button>
                  <button type="button" className="need-btn" onClick={() => setData({...data, need: 'Lesson', course: 'General Education'})}>
                    Emergency sub plan
                  </button>
                </div>
                <p className="advanced-helper">Your selection controls what appears first on the results page.</p>
              </div>

              <div className="form-group">
                <label htmlFor="email-input">Optional email for saving progress</label>
                <input 
                  id="email-input"
                  type="email" 
                  placeholder="explorer@world.com" 
                  className="form-control"
                  value={data.email} onChange={e => setData({...data, email: e.target.value})} 
                />
              </div>

              <div className="form-group role-group">
                <label>I am joining as a</label>
                <div className="role-selector">
                  <button 
                    type="button"
                    className={`role-btn ${data.role === 'Teacher' ? 'is-active' : ''}`}
                    onClick={() => setData({...data, role: 'Teacher'})}>
                    Teacher / buyer
                  </button>
                  <button 
                    type="button"
                    className={`role-btn ${data.role === 'Student' ? 'is-active' : ''}`}
                    onClick={() => setData({...data, role: 'Student'})}>
                    Student
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Workspace type</label>
                <div className="role-selector">
                  {WORKSPACE_TYPES.map((workspace) => (
                    <button
                      key={workspace.value}
                      type="button"
                      className={`role-btn ${data.workspaceType === workspace.value ? 'is-active' : ''}`}
                      onClick={() => setData({
                        ...data,
                        workspaceType: workspace.value,
                        workspaceName: workspace.value === 'Individual teacher' ? '' : data.workspaceName
                      })}
                    >
                      {workspace.label}
                    </button>
                  ))}
                </div>
              </div>

              {data.workspaceType !== 'Individual teacher' && (
                <div className="form-group">
                  <label htmlFor="workspace-name">
                    {data.workspaceType === 'Class' ? 'Class name' : 'Organization name'}
                  </label>
                  <input
                    id="workspace-name"
                    className="form-control"
                    type="text"
                    placeholder={data.workspaceType === 'Class' ? '5th Grade Science' : 'Global LMS Academy'}
                    value={data.workspaceName}
                    onChange={(e) => setData({ ...data, workspaceName: e.target.value })}
                  />
                </div>
              )}

              <div className="deliverable-strip">
                <span>LessonCast</span>
                <span>Teacher plan</span>
                <span>SIS roster</span>
                <span>Gradebook</span>
                <span>Communications</span>
                <span>Worksheet</span>
                <span>Quiz</span>
                <span>Answer key</span>
                <span>Mix & match</span>
              </div>
            </div>
          )}
        </div>

          <div className="onboarding-divider" />
      </div>

      <div className="visitor-feedback-strip" aria-label="Visitor intent feedback">
        <strong>What were you hoping to find?</strong>
        {['Ready lesson', 'Full unit', 'AI builder', 'Whiteboard', 'LMS export'].map((choice) => (
          <button
            key={choice}
            type="button"
            className={feedbackChoice === choice ? 'is-active' : ''}
            onClick={() => giveFeedback(choice)}
          >
            {feedbackChoice === choice ? 'Thanks' : choice}
          </button>
        ))}
      </div>

      <div className="ai-builder-panel ai-builder-bottom">
        <div className="ai-builder-copy">
          <strong>Build a missing lesson, unit, or course with AI</strong>
          <span>Write the idea in plain English. The draft will match the selected region, grade, course, and standards format for human review.</span>
        </div>
        <input
          type="text"
          className="ai-builder-input"
          value={aiIdea}
          onChange={(e) => setAiIdea(e.target.value)}
          placeholder="Example: Grade 5 Texas fractions unit with quiz and accommodations"
        />
        <div className="ai-builder-actions">
          <button
            type="button"
            className="lesson-nav-btn"
                    onClick={() => {
                      onTrack?.('ai_builder_click', { country: data.country, grade: data.grade, course: data.course, need: data.need, hasIdea: Boolean(aiIdea.trim()) });
                      onBuildAiDraft({ ...data, idea: aiIdea });
                    }}
            disabled={!aiIdea.trim() || aiBuildStatus === 'Building draft...'}
          >
            Build With AI <ArrowRight size={16} />
          </button>
          <span>{aiBuildStatus || 'Sign in to use monthly AI Builder credits.'}</span>
        </div>
        <div className="ai-credit-pack-row" aria-label="Buy AI Builder credits">
          {AI_CREDIT_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => onBuyAiCredits(pack.id)}
            >
              Buy {pack.credits} credits {pack.label}
            </button>
          ))}
          {!isRealEmail(user?.email) && <span>Sign in first</span>}
        </div>
      </div>

      <div className="onboarding-share-footer">
        <NewsletterSignup defaultEmail={user?.email || ''} onTrack={onTrack} />
        <SocialShareButtons />
      </div>

    </section>
  );
};
const SecurityView = () => (
  <div className="container py-20 max-w-5xl">
    <div className="glass p-12 space-y-16">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-black tracking-tight">Security & <span className="text-gradient">Compliance</span></h1>
        <p className="text-xl text-dim max-w-2xl mx-auto">We protect your educational journey with world-class security standards and a commitment to student privacy.</p>
      </div>

      <PrivacyShield />

      <div className="grid md:grid-cols-2 gap-16">
        <div className="space-y-6">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <Shield size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">COPPA Compliance</h3>
          <p className="text-dim leading-relaxed text-lg">
            Our platform is strictly engineered to meet and exceed <b>COPPA (Children's Online Privacy Protection Act)</b> requirements. We do not collect unnecessary data from students, and we provide parents and teachers with full transparency into how the platform is used.
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-green-500/10 text-green-600 rounded-xl flex items-center justify-center">
            <CheckCircle size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">Private Data Policy</h3>
          <p className="text-dim leading-relaxed text-lg">
            <b>Your data is not for sale.</b> We operate a closed-loop private database architecture. This means student information, grades, and progress are stored securely and are <b>never shared, sold, or traded with 3rd-party advertisers or data brokers.</b>
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center">
            <Clock size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">The Packaged Warehouse</h3>
          <p className="text-dim leading-relaxed text-lg">
            Warehouse lessons are pre-generated into a classroom package — teacher plan, student text, quiz, and key — so students are not chatting with an unconstrained live model. That is the same promise as About: AI-built, then packaged. Teachers remain the editor of record and should review before high-stakes use.
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-slate-900/10 text-slate-900 rounded-xl flex items-center justify-center">
            <Globe size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">Global Data Isolation</h3>
          <p className="text-dim leading-relaxed text-lg">
            We use regional data isolation to ensure that educational records stay within their respective jurisdictions when required by local laws, providing a safe and legally compliant experience for schools worldwide.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const SafetyView = () => (
  <div className="container py-20 max-w-5xl">
    <div className="glass p-12 space-y-16">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield size={40} />
        </div>
        <h1 className="text-5xl font-black tracking-tight">Our <span className="text-gradient">Safety Guarantee</span></h1>
        <p className="text-xl text-dim max-w-2xl mx-auto font-medium">Providing a protected, distraction-free environment for the next generation of explorers.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-16">
        <div className="space-y-6">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
            <Shield size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">Information Encryption</h3>
          <p className="text-dim leading-relaxed text-lg">
            The site uses HTTPS/TLS in transit, keeps identity data minimal, and avoids password collection. User identity is limited to name, email, account type, and local progress points unless a creator chooses to publish marketplace content.
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-amber-500/10 text-amber-600 rounded-xl flex items-center justify-center">
            <Users size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">No Public Profiles</h3>
          <p className="text-dim leading-relaxed text-lg">
            Global LMS is not a social network. Students do not have public profiles, cannot message each other, and cannot share personal information with anyone except their verified teacher.
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-green-500/10 text-green-600 rounded-xl flex items-center justify-center">
            <CheckCircle size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">Teacher Guardrails</h3>
          <p className="text-dim leading-relaxed text-lg">
            Adults are always in control. Teachers have a dedicated dashboard to monitor 100% of student activity, ensuring that the learning journey stays on track and within a safe educational context.
          </p>
        </div>

        <div className="space-y-6">
          <div className="w-12 h-12 bg-indigo-500/10 text-indigo-600 rounded-xl flex items-center justify-center">
            <Globe size={28} />
          </div>
          <h3 className="text-2xl font-black uppercase">The Packaged Warehouse</h3>
          <p className="text-dim leading-relaxed text-lg">
            Unlike a live AI chatbot, warehouse content is packaged before a student opens it. Students see structured educational material — not an open prompt box. We do not claim every line was hand-vetted in secret; we claim the format is stable, previewable, and teacher-editable. That matches the About page.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 text-white p-10 rounded-3xl text-center space-y-4 shadow-2xl">
        <h3 className="text-2xl font-black uppercase">Your Data, Your Privacy</h3>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Global LMS is built on a foundation of trust. We never sell student data, we never show ads, and we never track your activity across other websites.
        </p>
      </div>
    </div>
  </div>
);

const AuthView = ({ onSignIn }) => {
  const [authData, setAuthData] = useState({
    email: '',
    role: 'Teacher',
    name: '',
    workspaceType: 'Individual teacher',
    workspaceName: ''
  });
  const [error, setError] = useState('');
  const ownerEmail = isOwnerAdminEmail(authData.email);
  const visibleRole = roleForEmail(authData.email, authData.role);

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalizedEmail = normalizeLoginEmail(authData.email);
    if (!normalizedEmail) {
      setError('Enter an email so your account and plans can be saved.');
      return;
    }
    setError('');
    onSignIn({
      email: normalizedEmail,
      role: roleForEmail(normalizedEmail, authData.role),
      name: authData.name.trim().slice(0, 80) || 'Global Learner',
      workspaceType: authData.workspaceType,
      workspaceName: authData.workspaceName.trim().slice(0, 100),
      points: 0
    });
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="onboarding-eyebrow">Secure LMS Access</span>
          <h1>Sign in to Global LMS</h1>
          <p>Welcome, glad to have you. Sign in with your name and email to open 6 lessons for free. No credit card or password is collected here.</p>
          <div className="auth-free-note">
            <strong>Free starter access</strong>
            <span>Use your first 6 lessons before choosing paid lesson, unit, or course access.</span>
          </div>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="auth-name">Name</label>
            <input
              id="auth-name"
              className="form-control"
              type="text"
              placeholder="Your name"
              value={authData.name}
              onChange={(e) => setAuthData({ ...authData, name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="form-control"
              type="text"
              inputMode="email"
              placeholder="teacher@school.org"
              required
              value={authData.email}
              onChange={(e) => {
                const nextEmail = e.target.value;
                setAuthData({ ...authData, email: nextEmail, role: roleForEmail(nextEmail, authData.role) });
              }}
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <div className="form-group">
            <label htmlFor="auth-role">Account Type</label>
            <select
              id="auth-role"
              className="form-control"
              value={visibleRole}
              disabled={ownerEmail}
              onChange={(e) => setAuthData({ ...authData, role: publicAccountRole(e.target.value) })}
            >
              <option>Teacher</option>
              <option>Student</option>
              {ownerEmail && <option>Admin</option>}
            </select>
            <small className="form-help">
              {ownerEmail ? 'Owner email verified. Admin access is unlocked.' : 'Teachers and curriculum buyers should keep Teacher selected. Student is only for learners using a class code later.'}
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="auth-workspace">Workspace type</label>
            <select
              id="auth-workspace"
              className="form-control"
              value={authData.workspaceType}
              onChange={(e) => setAuthData({
                ...authData,
                workspaceType: e.target.value,
                workspaceName: e.target.value === 'Individual teacher' ? '' : authData.workspaceName
              })}
            >
              {WORKSPACE_TYPES.map((workspace) => (
                <option key={workspace.value} value={workspace.value}>{workspace.label}</option>
              ))}
            </select>
          </div>
          {authData.workspaceType !== 'Individual teacher' && (
            <div className="form-group">
              <label htmlFor="auth-workspace-name">
                {authData.workspaceType === 'Class' ? 'Class name' : 'Organization name'}
              </label>
              <input
                id="auth-workspace-name"
                className="form-control"
                type="text"
                placeholder={authData.workspaceType === 'Class' ? '5th Grade Science' : 'Global LMS Academy'}
                value={authData.workspaceName}
                onChange={(e) => setAuthData({ ...authData, workspaceName: e.target.value })}
              />
            </div>
          )}
          <button className="initialize-btn" type="submit">
            Sign In <ArrowRight size={18} />
          </button>
        </form>
      </div>

    </section>
  );
};

const MARKETING_PRESETS = [
  {
    label: 'Funding',
    audience: 'Education funders and philanthropists',
    goal: 'attract grant or donor support',
    brief: 'I need funding so Global LMS can keep free access open in high-need regions while improving accessibility, content review, outreach, and infrastructure.'
  },
  {
    label: 'Teachers',
    audience: 'Teachers and homeschool parents',
    goal: 'find teachers to test lessons',
    brief: 'I need teachers to try the lesson, unit, and course warehouse and give feedback on whether it saves planning time.'
  },
  {
    label: 'Schools',
    audience: 'School leaders and districts',
    goal: 'get early users and funding',
    brief: 'I need school leaders to understand that Global LMS can load standards-aligned K-12 curriculum by country, grade, subject, and build type.'
  },
  {
    label: 'Awareness',
    audience: 'Parent groups and community leaders',
    goal: 'grow social media awareness',
    brief: 'I need people to share Global LMS because curriculum should be available quickly for families, teachers, and students everywhere.'
  }
];

const MARKETING_TARGETS = [
  {
    id: 'facebook-page-setup',
    title: 'Create Facebook Page',
    kind: 'Social page setup',
    url: 'https://www.facebook.com/pages/creation/',
    why: 'Set up the official Global LMS page so posts can come from the brand instead of only a personal profile.',
    voice: ['facebook page', 'create facebook']
  },
  {
    id: 'linkedin-company-setup',
    title: 'Create LinkedIn Company Page',
    kind: 'Social page setup',
    url: 'https://www.linkedin.com/company/setup/new/',
    why: 'A company page helps school leaders, funders, and partners trust the project.',
    voice: ['linkedin company', 'create linkedin']
  },
  {
    id: 'youtube-channel-setup',
    title: 'Create YouTube Channel',
    kind: 'Video channel setup',
    url: 'https://www.youtube.com/create_channel',
    why: 'Use this for the how-to video and short demo clips showing teachers how fast lessons load.',
    voice: ['youtube', 'you tube']
  },
  {
    id: 'facebook',
    title: 'Facebook',
    kind: 'Social post',
    url: FACEBOOK_PROFILE_URL,
    why: 'Good for teacher groups, homeschool groups, parent communities, and quick launch updates.',
    voice: ['facebook', 'face book']
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    kind: 'Professional post',
    url: 'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fglobal-lms.org%2F',
    why: 'Best for school leaders, funders, edtech professionals, and partner introductions.',
    voice: ['linkedin', 'linked in']
  },
  {
    id: 'elearning-industry',
    title: 'eLearning Industry LMS Directory',
    kind: 'Directory listing',
    url: 'https://elearningindustry.com/advertise/elearning-marketing-resources/blog/listing-learning-management-system-in-elearning-industry-lms-directory',
    why: 'Directory credibility for LMS buyers comparing platforms.',
    voice: ['elearning', 'e learning']
  },
  {
    id: 'capterra',
    title: 'Capterra',
    kind: 'LMS review directory',
    url: 'https://www.capterra.com/legal/listing-guidelines/',
    why: 'Important B2B software comparison site for schools and organizations.',
    voice: ['capterra']
  },
  {
    id: 'edsurge',
    title: 'EdSurge',
    kind: 'Story pitch',
    url: 'https://www.edsurge.com/submission-guidelines',
    why: 'Strong fit for an educator-centered story about access, teacher workload, and global curriculum.',
    voice: ['edsurge', 'ed surge']
  },
  {
    id: 'tes',
    title: 'TES Resources',
    kind: 'Teacher resource upload',
    url: 'https://www.tes.com/teaching-resources/become-an-author',
    why: 'Teacher home turf for sharing lesson resources and building credibility.',
    voice: ['tes', 'times educational']
  },
  {
    id: 'product-hunt',
    title: 'Product Hunt',
    kind: 'Launch listing',
    url: 'https://www.producthunt.com/posts/new',
    why: 'Useful for startup visibility once demo video, screenshots, and positioning are ready.',
    voice: ['product hunt']
  },
  {
    id: 'k12-digest',
    title: 'K12 Digest Experts Network',
    kind: 'Community network',
    url: 'https://www.k12digest.com/school-experts-network/',
    why: 'A K-12 education network with a LinkedIn group for school and edtech professionals.',
    voice: ['k12 digest', 'k 12 digest']
  }
];

const SOCIAL_PROFILE_SETUP = [
  'Name: Global LMS',
  'Handle idea: @GlobalLMS or @GlobalLMSLearning',
  `Public email: ${SUPPORT_EMAIL}`,
  'Website: https://www.global-lms.org/',
  'Tagline: Standards-aligned K-12 lessons, units, and courses for every country.',
  'Bio: Global LMS helps teachers, families, and schools load ready-to-use K-12 lessons, units, and full courses by country, grade, and subject. Paid access helps support free access in high-need regions.'
];

const OUTREACH_GROUPS = [
  'Local homeschool Facebook groups',
  'Teacher planning and curriculum groups',
  'School principal and district leader LinkedIn groups',
  'Parent support and tutoring communities',
  'Education nonprofit and grantmaker contacts',
  'ESL, special education, and multilingual education communities',
  'Rural schools and alternative education programs',
  'After-school, tutoring, and youth program directors'
];

const buildMarketingBundle = ({ brief, audience, region, goal }) => {
  const context = brief || 'Global LMS gives every K-12 student standards-aligned lessons, units, and courses for every country, with free access in high-need regions.';
  const target = audience || 'teachers, parents, homeschool families, school leaders, and education funders';
  const place = region || 'global communities';
  const objective = goal || 'grow early users and attract funding';

  return {
    headline: `Campaign for ${objective}`,
    posts: [
      `Teachers should not have to rebuild every lesson from scratch. Global LMS loads standards-aligned K-12 lessons, units, and full courses by country, grade, and subject. Built for ${place}. ${context}`,
      `A student in California, Pakistan, Ethiopia, or Brazil should be able to open the right lesson fast. Global LMS is building that warehouse: 197 countries, 95 courses, and prebuilt K-12 learning paths.`,
      `We are looking for ${target} who believe curriculum access should be fast, local, and affordable. Standard pricing supports free access in high-need regions.`,
      `Global LMS is made for the real classroom moment: choose the grade, country, course, and whether you need a lesson, unit, or full course. The material is already sitting on the server ready to load.`,
      `If you know one teacher, funder, homeschool group, or school leader who cares about curriculum access, send them Global LMS today: https://global-lms.org/`
    ],
    email: `Subject: Standards-aligned K-12 curriculum access for ${place}\n\nHi,\n\nI'm building Global LMS, a standards-centered K-12 curriculum warehouse that lets teachers and families load lessons, units, and full courses by country, grade, and subject.\n\nThe mission is simple: paid access in standard regions helps keep learning free in high-need communities. The platform already has prebuilt course packages and is designed for fast classroom use.\n\nI'm reaching out because we need early users, partners, and funding support to keep expanding this responsibly.\n\nWould you be open to a short conversation or sharing this with one educator who might care?\n\nThank you,\nGlobal LMS`,
    funding: `Global LMS is a standards-centered K-12 learning warehouse built to make curriculum instantly available across countries, grades, and subjects. The platform supports lesson, unit, and course access, with regional pricing and free access for high-need areas. Funding will support accessibility, content review, school outreach, infrastructure, and educator partnerships.`,
    shortPitch: `Global LMS makes standards-aligned K-12 lessons, units, and full courses instantly available by country, grade, and subject. We are seeking ${target} to help grow access in ${place}.`,
    voiceScript: `I am building Global LMS because teachers and families should not have to start from zero. The platform loads standards-aligned K-12 lessons, units, and courses by country, grade, and subject. I am looking for ${target} who can help us ${objective}.`,
    videoScript: `Quick how-to video script:\n\n1. Start on https://www.global-lms.org/ and say: "This is Global LMS, a K-12 curriculum warehouse."\n2. Choose a country, grade, course, and whether you need a lesson, unit, or full course.\n3. Click Build My Plan and show that the lesson materials load quickly.\n4. Point out the worksheet, quiz, answer key, activities, and offline export.\n5. Close with: "If this saves you planning time, try it and send feedback to ${SUPPORT_EMAIL}."`,
    directoryDescription: `Global LMS is a standards-centered K-12 curriculum warehouse for teachers, families, and schools. It provides ready-to-load lessons, units, and full courses organized by country, grade, course, and learning need. The platform is designed to reduce teacher planning time, support regional standards, and keep access affordable with free access in high-need regions.`,
    dailyPlan: [
      'Post one short teacher-focused story on LinkedIn or Facebook.',
      'Send five outreach emails to school leaders, homeschool groups, or education nonprofits.',
      'Ask one person for a warm introduction to a funder, principal, or parent community.',
      'Record one 60-second voice demo showing how fast a lesson loads.',
      "Save replies and questions so the agent can turn them into tomorrow's campaign."
    ]
  };
};

const MarketingView = () => {
  const [brief, setBrief] = useState('');
  const [audience, setAudience] = useState('Teachers and homeschool parents');
  const [region, setRegion] = useState('United States and high-need global regions');
  const [goal, setGoal] = useState('get early users and funding');
  const [bundle, setBundle] = useState(() => buildMarketingBundle({
    brief: '',
    audience: 'Teachers and homeschool parents',
    region: 'United States and high-need global regions',
    goal: 'get early users and funding'
  }));
  const [voiceStatus, setVoiceStatus] = useState('Voice command ready');
  const [copyStatus, setCopyStatus] = useState('');
  const [postedTargets, setPostedTargets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('globalLmsMarketingPostedTargets')) || {};
    } catch {
      return {};
    }
  });

  const generate = (next = {}) => {
    const payload = {
      brief: next.brief ?? brief,
      audience: next.audience ?? audience,
      region: next.region ?? region,
      goal: next.goal ?? goal
    };
    setBundle(buildMarketingBundle(payload));
    setVoiceStatus('Campaign generated');
  };

  const bundleText = () => [
    bundle.headline,
    '',
    'SHORT PITCH',
    bundle.shortPitch,
    '',
    'VOICE SCRIPT',
    bundle.voiceScript,
    '',
    'HOW-TO VIDEO SCRIPT',
    bundle.videoScript,
    '',
    'SOCIAL PAGE SETUP',
    ...SOCIAL_PROFILE_SETUP,
    '',
    'OUTREACH GROUPS',
    ...OUTREACH_GROUPS.map((item, index) => `${index + 1}. ${item}`),
    '',
    'SOCIAL POSTS',
    ...bundle.posts.map((post, index) => `${index + 1}. ${post}`),
    '',
    'OUTREACH EMAIL',
    bundle.email,
    '',
    'FUNDING PITCH',
    bundle.funding,
    '',
    'DAILY PLAN',
    ...bundle.dailyPlan.map((item, index) => `${index + 1}. ${item}`)
  ].join('\n');

  const copyAll = async () => {
    await navigator.clipboard.writeText(bundleText());
    setCopyStatus('Copied');
    setVoiceStatus('Campaign copied');
    setTimeout(() => setCopyStatus(''), 1600);
  };

  const targetDraft = (target) => {
    if (target.id.includes('setup')) {
      return SOCIAL_PROFILE_SETUP.join('\n');
    }
    if (target.id === 'facebook') {
      return `${bundle.posts[0]}\n\n${bundle.shortPitch}\n\nTry it here: https://global-lms.org/`;
    }
    if (target.id === 'linkedin') {
      return `${bundle.voiceScript}\n\nWhat I am looking for now: early educators, school leaders, funders, and partners who care about curriculum access.\n\n${bundle.shortPitch}\n\nhttps://global-lms.org/`;
    }
    if (target.id === 'edsurge') {
      return `Pitch: What happens when curriculum is already waiting on the server for every country?\n\nGlobal LMS is a live standards-centered K-12 curriculum warehouse that loads lessons, units, and full courses by country, grade, and subject. The story angle is teacher workload, global access, and the practical question of how educators can get classroom-ready material without rebuilding from zero.\n\nPaid access in standard regions helps support free access in high-need regions.\n\nSuggested links: https://global-lms.org/`;
    }
    if (target.id === 'tes') {
      return `Resource title: Standards-Aligned K-12 Lesson Pack from Global LMS\n\nDescription:\n${bundle.directoryDescription}\n\nSuggested free sample: include one lesson plan, worksheet, quiz, answer key, and activity from the LMS.`;
    }
    if (target.id === 'product-hunt') {
      return `Name: Global LMS\nTagline: Standards-aligned K-12 lessons, units, and courses for every country\n\nDescription:\n${bundle.directoryDescription}\n\nMaker comment:\n${bundle.voiceScript}`;
    }
    return `Product name: Global LMS\nWebsite: https://global-lms.org/\nCategory: Learning Management System, K-12 Curriculum, Education Technology\n\nDescription:\n${bundle.directoryDescription}\n\nPricing note: Lessons start at $5, units at $10, and full courses at $100 in standard regions, with regional pricing and free access in high-need areas.`;
  };

  const copyTarget = async (target) => {
    await navigator.clipboard.writeText(targetDraft(target));
    setVoiceStatus(`${target.title} draft copied`);
  };

  const openTarget = (target) => {
    window.open(target.url, '_blank', 'noopener,noreferrer');
    setVoiceStatus(`${target.title} opened`);
  };

  const markTargetDone = (target) => {
    const next = { ...postedTargets, [target.id]: !postedTargets[target.id] };
    setPostedTargets(next);
    localStorage.setItem('globalLmsMarketingPostedTargets', JSON.stringify(next));
  };

  const applyPreset = (preset) => {
    setAudience(preset.audience);
    setGoal(preset.goal);
    setBrief(preset.brief);
    generate(preset);
  };

  const handleVoiceText = (transcript) => {
    const spoken = transcript.toLowerCase();
    if (spoken.includes('copy')) {
      const target = MARKETING_TARGETS.find((item) => item.voice.some((phrase) => spoken.includes(phrase)));
      if (target) {
        copyTarget(target);
        return;
      }
      copyAll();
      return;
    }
    if (spoken.includes('open') || spoken.includes('post')) {
      const target = MARKETING_TARGETS.find((item) => item.voice.some((phrase) => spoken.includes(phrase)));
      if (target) {
        openTarget(target);
        return;
      }
    }
    if (spoken.includes('done') || spoken.includes('mark')) {
      const target = MARKETING_TARGETS.find((item) => item.voice.some((phrase) => spoken.includes(phrase)));
      if (target) {
        markTargetDone(target);
        setVoiceStatus(`${target.title} status updated`);
        return;
      }
    }
    if (spoken.includes('generate') || spoken.includes('campaign')) {
      generate();
      return;
    }
    if (spoken.includes('clear')) {
      setBrief('');
      setVoiceStatus('Brief cleared');
      return;
    }

    const preset = MARKETING_PRESETS.find((item) => spoken.includes(item.label.toLowerCase()));
    if (preset) {
      applyPreset(preset);
      setVoiceStatus(`${preset.label} campaign loaded`);
      return;
    }

    const nextBrief = brief ? `${brief} ${transcript}` : transcript;
    setBrief(nextBrief);
    generate({ brief: nextBrief });
  };

  const startVoiceCommand = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('Voice commands need Chrome or Edge');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    setVoiceStatus('Listening...');
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      setVoiceStatus(transcript ? `Heard: ${transcript}` : 'No speech heard');
      if (transcript) handleVoiceText(transcript);
    };
    recognition.onerror = () => setVoiceStatus('Voice command stopped');
    recognition.onend = () => setVoiceStatus((status) => status === 'Listening...' ? 'Voice command ready' : status);
    recognition.start();
  };

  return (
    <section className="marketing-shell">
      <div className="marketing-header">
        <span className="onboarding-eyebrow">Voice-Friendly Growth Agent</span>
        <h1>Marketing Agent</h1>
        <p>Run the launch from one page: dictate the need, pick a preset, generate, then copy the campaign.</p>
      </div>

      <div className="marketing-grid">
        <div className="marketing-card">
          <div className="voice-command-bar">
            <button type="button" className="voice-command-btn" onClick={startVoiceCommand}>
              <Mail size={16} /> Voice Command
            </button>
            <span>{voiceStatus}</span>
          </div>

          <div className="marketing-presets" aria-label="Marketing campaign presets">
            {MARKETING_PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label htmlFor="marketing-brief">Say what you need</label>
            <textarea
              id="marketing-brief"
              className="marketing-textarea"
              placeholder="Example: I need funding and teachers to try Global LMS. Mention that it is free in high-need regions."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="marketing-audience">Audience</label>
              <select id="marketing-audience" className="form-control" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option>Teachers and homeschool parents</option>
                <option>School leaders and districts</option>
                <option>Education funders and philanthropists</option>
                <option>Parent groups and community leaders</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="marketing-goal">Goal</label>
              <select id="marketing-goal" className="form-control" value={goal} onChange={(e) => setGoal(e.target.value)}>
                <option>get early users and funding</option>
                <option>find teachers to test lessons</option>
                <option>attract grant or donor support</option>
                <option>grow social media awareness</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="marketing-region">Region</label>
            <input id="marketing-region" className="form-control" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div className="marketing-actions">
            <button type="button" className="initialize-btn" onClick={generate}>Generate Campaign</button>
            <button type="button" className="support-btn" onClick={copyAll}>{copyStatus || 'Copy All'}</button>
          </div>

          <div className="voice-command-list">
            <span>Say "Funding", "Copy Facebook", "Open LinkedIn", "Post Capterra", "Mark EdSurge done", "Generate campaign", or dictate a new brief.</span>
          </div>
        </div>

        <div className="marketing-output">
          <h2>{bundle.headline}</h2>
          <h3>Short Pitch</h3>
          <p>{bundle.shortPitch}</p>
          <h3>Voice Script</h3>
          <p>{bundle.voiceScript}</p>
          <h3>How-To Video Script</h3>
          <pre>{bundle.videoScript}</pre>
          <h3>Social Page Setup</h3>
          <ul>{SOCIAL_PROFILE_SETUP.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Groups to Reach Out To</h3>
          <ul>{OUTREACH_GROUPS.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Social Posts</h3>
          {bundle.posts.map((post, index) => <p key={`post-${index}`}>{post}</p>)}
          <h3>Outreach Email</h3>
          <pre>{bundle.email}</pre>
          <h3>Funding Pitch</h3>
          <p>{bundle.funding}</p>
          <h3>Directory Description</h3>
          <p>{bundle.directoryDescription}</p>
          <h3>Daily Plan</h3>
          <ul>{bundle.dailyPlan.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>

      <section className="marketing-targets">
        <div className="marketing-targets-header">
          <h2>Posting and Listing Queue</h2>
          <p>Copy the right draft, open the destination, then mark it done. The status stays saved on this device.</p>
        </div>
        <div className="target-grid">
          {MARKETING_TARGETS.map((target) => (
            <article className={`target-card ${postedTargets[target.id] ? 'is-done' : ''}`} key={target.id}>
              <div>
                <span>{target.kind}</span>
                <h3>{target.title}</h3>
                <p>{target.why}</p>
              </div>
              <div className="target-actions">
                <button type="button" onClick={() => copyTarget(target)}>Copy Draft</button>
                <button type="button" onClick={() => openTarget(target)}>Open</button>
                <button type="button" onClick={() => markTargetDone(target)}>
                  {postedTargets[target.id] ? 'Done' : 'Mark Done'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
};

const OwnerMarketingGate = () => {
  const [allowed, setAllowed] = useState(() => localStorage.getItem('globalLmsOwnerMarketing') === 'allowed');
  const [status, setStatus] = useState('Owner access locked');
  const unlockPhrase = 'unlock marketing';

  const unlock = () => {
    localStorage.setItem('globalLmsOwnerMarketing', 'allowed');
    setAllowed(true);
  };

  const startVoiceUnlock = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('Voice unlock needs Chrome or Edge');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    setStatus('Listening for owner phrase...');
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim()
        .toLowerCase();
      if (transcript.includes(unlockPhrase)) {
        setStatus('Owner access unlocked');
        unlock();
      } else {
        setStatus('Owner phrase not recognized');
      }
    };
    recognition.onerror = () => setStatus('Voice unlock stopped');
    recognition.start();
  };

  if (allowed) return <MarketingView />;

  return (
    <section className="owner-gate-shell">
      <div className="owner-gate-card">
        <span className="onboarding-eyebrow">Private Owner Site</span>
        <h1>Owner Marketing Desk</h1>
        <p>This growth workspace is hidden from the public LMS and locked for owner use.</p>
        <button type="button" className="voice-command-btn" onClick={startVoiceUnlock}>
          <Mail size={16} /> Voice Unlock
        </button>
        <span className="owner-gate-status">{status}</span>
      </div>
    </section>
  );
};

const PricingView = ({ onPurchase, onOpenSample, onOpenMarketplace }) => (
  <section className="pricing-shell about-shell">
    <span className="onboarding-eyebrow">Shareable pricing</span>
    <h1>Lesson ${STANDARD_PRICING.lesson} · Unit ${STANDARD_PRICING.unit} · Course ${STANDARD_PRICING.course}</h1>
    <p>
      One public price list for teachers, ads, and school buyers. Stripe Checkout. {STANDARD_PRICING.guarantee}. High-need countries stay free.
    </p>
    <div className="pricing-grid">
      {[
        { name: 'Lesson', price: STANDARD_PRICING.lesson, detail: 'One 45-minute warehouse lesson: teacher script, student text, worksheet, quiz, answer key, LMS export.', sku: 'Global LMS Lesson Access' },
        { name: 'Unit', price: STANDARD_PRICING.unit, detail: 'A five-lesson sequence with the same classroom package on every day.', sku: 'Global LMS Unit Access' },
        { name: 'Course', price: STANDARD_PRICING.course, detail: 'Full-course path with units, lessons, and a culminating task.', sku: 'Global LMS Full Course Access' }
      ].map((tier) => (
        <article key={tier.name} className="pricing-card">
          <h2>{tier.name}</h2>
          <p className="pricing-amount">${tier.price}</p>
          <p>{tier.detail}</p>
          <button type="button" className="initialize-btn" onClick={() => onPurchase?.(tier.sku, `$${tier.price}`)}>
            Buy {tier.name} ${tier.price}
          </button>
        </article>
      ))}
    </div>
    <div className="pricing-regions">
      <h2>Regional scale</h2>
      <ul>
        <li>Standard regions: ${STANDARD_PRICING.lesson} / ${STANDARD_PRICING.unit} / ${STANDARD_PRICING.course}</li>
        <li>Tier-1 regions (for example Mexico, Brazil, India): $2 / $8 / $50</li>
        <li>Free-access regions (high-need / conflict-affected): $0</li>
      </ul>
      <p>AI Builder credits are a separate optional pack ($5 / $10) for generating a missing draft. Warehouse catalog purchases do not require a Student login.</p>
    </div>
    <div className="pricing-actions">
      <button type="button" className="btn-buy" onClick={onOpenSample}>Preview the Grade 5 sample</button>
      <button type="button" className="nav-mini-btn" onClick={onOpenMarketplace}>Browse catalog</button>
    </div>
    <div className="social-proof-row">
      {SOCIAL_PROOF.map((item) => (
        <blockquote key={item.name} className="social-proof-card">
          <p>“{item.quote}”</p>
          <footer><strong>{item.name}</strong> · {item.role}</footer>
        </blockquote>
      ))}
    </div>
  </section>
);

const GuestPaywall = ({ onPurchase, onSignIn, message }) => (
  <div className="guest-paywall glass">
    <h2>Keep going with a lesson, unit, or course</h2>
    <p>{message || 'Preview is open. Paid access unlocks the rest of the warehouse. You can check out as a teacher without creating a Student account.'}</p>
    <div className="paid-access-actions">
      <button type="button" onClick={() => onPurchase?.('Global LMS Lesson Access', '$5')}>Buy Lesson $5</button>
      <button type="button" onClick={() => onPurchase?.('Global LMS Unit Access', '$10')}>Buy Unit $10</button>
      <button type="button" onClick={() => onPurchase?.('Global LMS Full Course Access', '$100')}>Buy Course $100</button>
    </div>
    <p className="guarantee-badge"><Shield size={15} /> 30-day money-back · Stripe Checkout</p>
    <button type="button" className="lms-inline-link" onClick={onSignIn}>Optional: save progress with email</button>
  </div>
);

const marketplacePriceFor = (type) => type === 'Course' ? 100 : type === 'Unit' ? 10 : 5;

const CreatorMarketplaceView = ({ user, onPreview, onPurchase }) => {
  const [items, setItems] = useState(() => mergeMarketplaceCatalog([]));
  const [status, setStatus] = useState('Loading creator marketplace...');
  const [paymentConfig, setPaymentConfig] = useState({ configured: false, mode: 'checking' });
  const [mode, setMode] = useState('paid-marketplace');
  const [needsEmailFor, setNeedsEmailFor] = useState(null);
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [form, setForm] = useState({
    title: '',
    type: 'Lesson',
    creatorName: user?.email?.split('@')[0] || '',
    creatorEmail: user?.email || '',
    price: 5,
    grade: 'Grade 5',
    country: 'USA',
    course: 'General Education',
    summary: '',
    standards: '',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    content: ''
  });

  const loadMarketplace = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/marketplace`);
      const data = await res.json();
      setItems(mergeMarketplaceCatalog(data.items || []));
      setStatus('Catalog listings ready. Preview without signing in; Stripe collects email at checkout.');
    } catch {
      setItems(mergeMarketplaceCatalog([]));
      setStatus('Showing the warehouse catalog. Live creator feed is temporarily offline.');
    }
  };

  const loadPaymentConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/payments/config`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment config unavailable');
      setPaymentConfig(data);
    } catch {
      setPaymentConfig({ configured: false, mode: 'unreachable' });
    }
  };

  useEffect(() => {
    loadMarketplace();
    loadPaymentConfig();
  }, []);

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));
  const setType = (type) => updateForm({ type, price: marketplacePriceFor(type) });

  const submitItem = async (event) => {
    event.preventDefault();
    setStatus('Saving creator item...');
    try {
      const res = await fetch(`${API_BASE}/api/marketplace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, contributionMode: mode })
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Save failed');
      setItems((current) => [saved, ...current]);
      setStatus(mode === 'free-country-expansion'
        ? 'Volunteer contribution saved. It is not a paid marketplace item.'
        : 'Paid marketplace item saved. Creator split is 80%.');
      updateForm({ title: '', summary: '', standards: '', remixOf: '', content: '' });
    } catch (err) {
      setStatus(err.message || 'Could not save item');
    }
  };

  const buyItem = async (item, checkoutEmail = user?.email) => {
    if (item.price <= 0) return;
    const email = isRealEmail(checkoutEmail) ? checkoutEmail : '';
    if (!email) {
      setStatus('Enter an email on the buy form (or in Stripe) — no Student account required.');
      setNeedsEmailFor(item);
      return;
    }
    if (!paymentConfig.configured) {
      setStatus('Stripe Checkout is not configured yet. Add Stripe keys on the server, then redeploy.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          cancelPath: '/marketplace',
          successPath: '/marketplace?success=true',
          items: [{
            name: item.title,
            price: `$${item.price}`,
            image: item.image || `${window.location.origin}/sample-reading.svg`,
            marketplaceItemId: item.id,
            creatorEmail: item.creatorEmail,
            creatorShare: item.creatorShare,
            platformFee: item.platformFee
          }]
        })
      });
      const session = await res.json();
      if (!res.ok) throw new Error(session.detail || session.error || 'Checkout unavailable');
      if (session.url) {
        window.location.href = session.url;
        return;
      }
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe publishable key is not configured.');
      await stripe.redirectToCheckout({ sessionId: session.id });
    } catch (err) {
      setStatus(err.message || 'Payment system is not ready yet.');
    }
  };

  return (
    <section className="creator-marketplace">
      <div className="marketplace-hero">
        <span className="onboarding-eyebrow">Creator Marketplace</span>
        <h1>Ready-to-teach lessons, units, and courses</h1>
        <p>Warehouse catalog first. Guest preview is open. Buy with Stripe — no Student account required. Certified-teacher badges stay visible when a creator is verified.</p>
        <p className="marketplace-status">
          {paymentConfig.configured
            ? `Stripe Checkout is ${paymentConfig.mode === 'live' ? 'live' : 'configured for this environment'}.`
            : 'Stripe Checkout needs server keys before paid purchases can open.'}
        </p>
      </div>

      <div className="marketplace-policy-grid">
        <div>
          <strong>Paid creator work</strong>
          <span>Lessons, units, and courses are separate from the five free starter lessons. Buyers pay for creator-made resources.</span>
        </div>
        <div>
          <strong>Remix and resell</strong>
          <span>Creators can remix existing Global LMS resources only when they make meaningful improvements, add attribution, and publish as a new marketplace item.</span>
        </div>
        <div>
          <strong>Certification transparency</strong>
          <span>Certified teacher resources show a trust badge. If a creator is not certified for that lesson, buyers see a clear notice before using it.</span>
        </div>
        <div>
          <strong>Free-country library work</strong>
          <span>Creators may help build lessons for free-access countries, but that work is volunteer contribution, not paid creator marketplace work.</span>
        </div>
      </div>

      <div className="marketplace-layout">
        <form className="creator-form" onSubmit={submitItem}>
          <h2>Add a creator item</h2>
          <div className="mode-switch">
            <button type="button" className={mode === 'paid-marketplace' ? 'is-active' : ''} onClick={() => setMode('paid-marketplace')}>Paid item</button>
            <button type="button" className={mode === 'free-country-expansion' ? 'is-active' : ''} onClick={() => setMode('free-country-expansion')}>Volunteer free-country work</button>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Title</label>
              <input className="form-control" value={form.title} onChange={(e) => updateForm({ title: e.target.value })} placeholder="Lesson, unit, or course title" />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-control" value={form.type} onChange={(e) => setType(e.target.value)}>
                <option>Lesson</option>
                <option>Unit</option>
                <option>Course</option>
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Creator name</label>
              <input className="form-control" value={form.creatorName} onChange={(e) => updateForm({ creatorName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Payout email</label>
              <input className="form-control" value={form.creatorEmail} onChange={(e) => updateForm({ creatorEmail: e.target.value })} />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Price</label>
              <input className="form-control" type="number" min="1" disabled={mode === 'free-country-expansion'} value={mode === 'free-country-expansion' ? 0 : form.price} onChange={(e) => updateForm({ price: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Certification status</label>
              <select className="form-control" value={form.certificationStatus} onChange={(e) => updateForm({ certificationStatus: e.target.value })}>
                <option>Certified teacher for this subject/grade</option>
                <option>Certified teacher, different subject/grade</option>
                <option>Educator or tutor, not state-certified</option>
                <option>Not certified for this lesson</option>
              </select>
            </div>
            <div className="creator-split">
              <span>Creator: ${mode === 'free-country-expansion' ? '0.00' : (Number(form.price || 0) * 0.8).toFixed(2)}</span>
              <span>Platform: ${mode === 'free-country-expansion' ? '0.00' : (Number(form.price || 0) * 0.2).toFixed(2)}</span>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Grade</label>
              <input className="form-control" value={form.grade} onChange={(e) => updateForm({ grade: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Country</label>
              <input className="form-control" value={form.country} onChange={(e) => updateForm({ country: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Course</label>
            <input className="form-control" value={form.course} onChange={(e) => updateForm({ course: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Remix source</label>
            <input className="form-control" value={form.remixOf} onChange={(e) => updateForm({ remixOf: e.target.value })} placeholder="Optional: original lesson/unit/course name" />
          </div>
          <div className="form-group">
            <label>Summary</label>
            <textarea className="creator-textarea" value={form.summary} onChange={(e) => updateForm({ summary: e.target.value })} placeholder="What does this help a teacher or student do?" />
          </div>
          <div className="form-group">
            <label>Standards alignment</label>
            <textarea className="creator-textarea" value={form.standards} onChange={(e) => updateForm({ standards: e.target.value })} placeholder="List the standards, country, state, or ministry alignment." />
          </div>
          <div className="form-group">
            <label>Lesson, unit, or course content</label>
            <textarea className="creator-textarea tall" value={form.content} onChange={(e) => updateForm({ content: e.target.value })} placeholder="Paste or dictate the full resource here." />
          </div>
          <button type="submit" className="initialize-btn">Publish Creator Item</button>
          <p className="marketplace-status">{status}</p>
        </form>

        <div className="marketplace-list">
          <h2>Warehouse catalog</h2>
          {needsEmailFor && (
            <form
              className="guest-checkout-form"
              onSubmit={(event) => {
                event.preventDefault();
                buyItem(needsEmailFor, guestEmail);
              }}
            >
              <label htmlFor="market-guest-email">Email for Stripe receipt</label>
              <input
                id="market-guest-email"
                className="form-control"
                type="email"
                required
                placeholder="teacher@school.org"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
              <button type="submit" className="btn-buy">Continue to Stripe for ${needsEmailFor.price}</button>
              <button type="button" className="nav-mini-btn" onClick={() => setNeedsEmailFor(null)}>Cancel</button>
            </form>
          )}
          {items.map((item) => (
            <article className="marketplace-item" key={item.id}>
              <div>
                <span className="marketplace-type">{item.type}</span>
                <span className={`certification-badge ${String(item.certificationStatus || '').toLowerCase().includes('not certified') ? 'is-warning' : ''}`}>
                  {item.certificationStatus || 'Certification not provided'}
                </span>
                <h3>{item.title}</h3>
                <p>{item.summary || item.content}</p>
                <small>{item.creatorName} | {item.grade} | {item.country} | {item.course} | ${item.price}</small>
                {item.remixOf && <small>Remix of: {item.remixOf}</small>}
              </div>
              <div className="marketplace-buy-row">
                <span>{item.price > 0 ? `$${item.price}` : 'Volunteer'}</span>
                <em>{item.price > 0 ? `Creator earns $${item.creatorShare}` : 'Not paid'}</em>
                <button
                  type="button"
                  onClick={() => onPreview?.(item)}
                >
                  Preview
                </button>
                <button type="button" disabled={item.price <= 0 || !paymentConfig.configured} onClick={() => buyItem(item, guestEmail || user?.email)}>
                  {item.price > 0 ? (paymentConfig.configured ? 'Buy' : 'Setup Needed') : 'Free Library Work'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

const AiDraftView = ({ packageData, onBack, onSelectTopic, onAwardPoints }) => {
  if (!packageData?.draft) {
    return (
      <div className="container text-center py-32">
        <div className="glass max-w-2xl mx-auto">
          <h2 className="text-3xl font-black mb-4">No AI draft open</h2>
          <button type="button" className="lesson-nav-btn" onClick={onBack}>Back to Builder</button>
        </div>
      </div>
    );
  }

  const { draft, request, usage } = packageData;
  const estimateLabel = usage?.estimatedCost?.estimatedCost !== undefined
    ? `Estimated AI cost: $${usage.estimatedCost.estimatedCost.toFixed(4)}`
    : 'Estimated AI cost unavailable';
  const isLessonDraft = Boolean(draft.content && draft.quiz);
  if (isLessonDraft) {
    return (
      <div>
        <div className="ai-draft-review-bar">
          <div>
            <strong>AI draft for human review</strong>
            <span>{usage?.remaining ?? 0} free credits remaining this month | {estimateLabel}</span>
          </div>
          <button type="button" className="lesson-nav-btn" onClick={onBack}>Back to Builder</button>
        </div>
        <LessonView
          topic={draft.title}
          lesson={draft}
          onBack={onBack}
          onAwardPoints={onAwardPoints}
          onTrack={() => {}}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="ai-draft-review-bar">
        <div>
          <strong>AI draft for human review</strong>
          <span>{usage?.remaining ?? 0} free credits remaining this month | {estimateLabel}</span>
        </div>
        <button type="button" className="lesson-nav-btn" onClick={onBack}>Back to Builder</button>
      </div>
      <PathView
        studentData={request}
        curriculum={draft}
        onSelectTopic={onSelectTopic}
        planSaveStatus="AI draft generated. Review standards, facts, and local requirements before classroom use."
      />
    </div>
  );
};

const UnitOverviewView = ({ unit, unitIndex, curriculum, studentData, onSelectTopic, onBack }) => {
  const [activeLessonIdx, setActiveLessonIdx] = useState(null);
  const lessons = (unit.lessons || []);
  const course = curriculum?.course || studentData?.course || '';
  const isFree = curriculum?.isFree;
  const price = isFree ? 'FREE' : `$${curriculum?.pricing?.lesson || 5}`;

  return (
    <div className="container unit-overview-shell">
      <button type="button" className="unit-overview-back" onClick={onBack}>
        ← Back to course
      </button>
      <div className="unit-overview-header">
        <span className="unit-kicker">Unit {unit.sequence || unitIndex + 1}</span>
        <h1>{unit.title}</h1>
        {unit.standardsFocus && <p className="unit-standards">{unit.standardsFocus}</p>}
        <div className="unit-overview-meta">
          <span>{lessons.length} lessons</span>
          {unit.duration && <span>{unit.duration}</span>}
          <span>{isFree ? 'Free access region' : price + ' per lesson'}</span>
        </div>
      </div>

      <div className="unit-lessons-grid">
        {lessons.map((lesson, idx) => {
          const title = topicTitle(lesson);
          const isActive = activeLessonIdx === idx;
          return (
            <div key={`unit-lesson-${idx}`} className={`unit-lesson-card ${isActive ? 'is-active' : ''}`}>
              <div className="unit-lesson-card-img">
                <img src={buildTopicImageUrl(title, course, idx)} alt={title} loading="lazy" />
                <span className="unit-lesson-num">{lesson.sequence || idx + 1}</span>
              </div>
              <div className="unit-lesson-card-body">
                <h3>{title}</h3>
                {lesson.description && <p>{lesson.description}</p>}
                <button
                  type="button"
                  className="unit-lesson-open-btn"
                  onClick={() => { setActiveLessonIdx(idx); onSelectTopic(title); }}
                >
                  Open Lesson
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {lessons.length > 1 && (
        <div className="unit-lesson-nav">
          {lessons.map((lesson, idx) => (
            <button
              key={`nav-${idx}`}
              type="button"
              className={`unit-nav-dot ${activeLessonIdx === idx ? 'is-active' : ''}`}
              onClick={() => { setActiveLessonIdx(idx); onSelectTopic(topicTitle(lesson)); }}
              title={topicTitle(lesson)}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PathView = ({ studentData, curriculum, onSelectTopic, onSelectUnit, planSaveStatus, user }) => {
  const [shareStatus, setShareStatus] = useState('');
  if (!curriculum) return (
    <div className="container text-center py-32">
      <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-8" />
      <h2 className="text-3xl font-black mb-2">Accessing Global Library</h2>
      <p className="text-dim">Retrieving standards-aligned modules from the Warehouse...</p>
    </div>
  );

  if (!curriculum.subjects?.length) return (
    <div className="container text-center py-32">
      <div className="glass max-w-2xl mx-auto">
        <h2 className="text-3xl font-black mb-4">Plan Not Available Yet</h2>
        <p className="text-dim">
          The warehouse did not return a readable course plan. Please go back and try another grade, country, or course.
        </p>
      </div>
    </div>
  );

  const sourceUnits = curriculum.units?.length
    ? curriculum.units
    : curriculum.subjects.map((subject, idx) => ({
      title: subject.name,
      sequence: idx + 1,
      standardsFocus: curriculum.standardsBody,
      lessons: subject.topics || []
    }));
  const units = sourceUnits.map((unit, idx) => ({
    ...unit,
    title: unit.title || unit.name || `Unit ${idx + 1}`,
    sequence: unit.sequence || idx + 1,
    standardsFocus: unit.standardsFocus || unit.standards || curriculum.standardsBody,
    lessons: (unit.lessons || unit.topics || []).map((lesson, sequence) => normalizeLessonItem(lesson, sequence + 1, `${unit.title || unit.name || 'Unit'} Lesson ${sequence + 1}`))
  }));
  const featuredLessons = units
    .flatMap((unit) => (unit.lessons || []).map((lesson) => ({
      ...lesson,
      unitTitle: unit.title
    })))
    .slice(0, 4);
  const requestedNeed = studentData?.need || curriculum.need || 'Lesson';
  const starterLessonsRemaining = !curriculum.isFree && user?.email && isRealEmail(user.email)
    ? Number(user.freeLessonRemaining ?? FREE_LESSON_LIMIT)
    : 0;
  const lessonPriceLabel = curriculum.isFree
    ? 'FREE'
    : starterLessonsRemaining > 0
      ? `${starterLessonsRemaining} free left`
      : !isRealEmail(user?.email)
        ? `${GUEST_FREE_LESSON_LIMIT} free guest lesson`
      : `$${curriculum.pricing.lesson}`;
  const requestedPrice = requestedNeed === 'Course'
    ? curriculum.pricing.course
    : requestedNeed === 'Unit'
      ? curriculum.pricing.unit
      : curriculum.pricing.lesson;
  const requestedLabel = requestedNeed === 'Course'
    ? 'Full Course'
    : requestedNeed === 'Unit'
      ? 'Unit Results'
      : 'Lesson Results';
  const courseDownloadBase = slugifyFileName(`${studentData?.country || curriculum.country || 'global'}-${studentData?.grade || curriculum.grade || 'grade'}-${curriculum.course || studentData?.course || 'course'}-${requestedNeed}`);
  const buildCourseOutlineText = () => [
    `Global LMS ${requestedLabel}`,
    `Country: ${studentData?.country || curriculum.country || ''}`,
    `Grade: ${studentData?.grade || curriculum.grade || ''}`,
    `Course: ${curriculum.course || studentData?.course || ''}`,
    `Standards: ${curriculum.standardsBody || 'Standards-aligned'}`,
    '',
    `Pricing in this region: Lesson ${curriculum.isFree ? 'FREE' : `$${curriculum.pricing.lesson}`}, Unit ${curriculum.isFree ? 'FREE' : `$${curriculum.pricing.unit}`}, Course ${curriculum.isFree ? 'FREE' : `$${curriculum.pricing.course}`}`,
    '',
    'Units and Lessons:',
    ...units.flatMap((unit, unitIndex) => [
      '',
      `Unit ${unit.sequence || unitIndex + 1}: ${unit.title}`,
      unit.standardsFocus ? `Standards focus: ${unit.standardsFocus}` : '',
      ...(unit.lessons || []).map((lesson, lessonIndex) => `  ${lesson.sequence || lessonIndex + 1}. ${topicTitle(lesson) || `Lesson ${lessonIndex + 1}`}`)
    ]).filter(Boolean),
    '',
    'Offline note:',
    'Save this outline for low-bandwidth planning. Open an individual lesson to download the full offline TXT, HTML, or JSON package.'
  ].join('\n');

  const downloadCourseOutline = () => {
    downloadTextFile(`${courseDownloadBase}-offline-outline.txt`, buildCourseOutlineText());
  };

  const downloadCourseJson = () => {
    downloadTextFile(`${courseDownloadBase}-portable.json`, JSON.stringify({
      studentData,
      curriculum,
      offlineNote: 'Open individual lessons to download full lesson TXT, HTML, or JSON files.'
    }, null, 2), 'application/json;charset=utf-8');
  };

  const copyCourseLink = async () => {
    await navigator.clipboard.writeText(buildShareUrl(studentData, curriculum));
    setShareStatus('Link copied');
    window.setTimeout(() => setShareStatus(''), 1600);
  };

  const lessonSection = (
    <section className="path-section" key="lessons">
      <h2 className="path-section-title">Top Lesson Matches</h2>
      <div className="course-grid">
        {featuredLessons.map((lesson, idx) => (
          <CourseCard 
            key={`featured-lesson-${topicTitle(lesson)}`}
            id={`featured-${idx}`}
            title={topicTitle(lesson)}
            category={lesson.unitTitle}
            description={(lesson.objectives || [
              topicDescription(lesson, `A focused standards-aligned lesson from ${lesson.unitTitle}.`),
              'Includes teacher plan, worksheet, quiz, answer key, and activity.'
            ]).join(' ')}
            price={lessonPriceLabel}
            image={buildTopicImageUrl(topicTitle(lesson), curriculum.course || studentData?.course, idx)}
            onAction={() => onSelectTopic(topicTitle(lesson))}
          />
        ))}
      </div>
    </section>
  );

  const unitSection = (
    <section className="path-section" key="units">
      <h2 className="path-section-title">Top Unit Matches</h2>
      <div className="course-grid">
        {units.map((unit, idx) => (
          <CourseCard
            key={unit.id || unit.title}
            id={`unit-${idx}`}
            title={unit.title}
            category={`Unit ${unit.sequence || idx + 1} · ${(unit.lessons || []).length} lessons`}
            description={(unit.lessons || []).slice(0, 5).map((lesson) => topicTitle(lesson)).join(", ")}
            price={curriculum.isFree ? "FREE" : `$${curriculum.pricing.unit}`}
            image={buildTopicImageUrl(unit.title, curriculum.course || studentData?.course, idx + 10)}
            actionLabel="Open Unit"
            onAction={() => onSelectUnit ? onSelectUnit(unit, idx) : onSelectTopic(unit.lessons?.[0] ? topicTitle(unit.lessons[0]) : unit.title)}
          />
        ))}
      </div>
    </section>
  );

  const courseSection = (
    <section className="path-section course-overview-section" key="course">
      <h2 className="path-section-title">Full Course Path</h2>
      <div className="course-overview-card">
        <div>
          <span className="course-overview-kicker">{curriculum.course || studentData.course}</span>
          <h3>{studentData.grade} {curriculum.course || studentData.course}</h3>
          <p>{curriculum.standardsBody}</p>
          <div className="course-overview-meta">
            <span>{units.length} units</span>
            <span>{featuredLessons.length}+ ready lessons shown</span>
            <span>{curriculum.isFree ? 'Free access region' : `$${curriculum.pricing.course} full course`}</span>
          </div>
        </div>
        <button type="button" className="btn-buy" onClick={() => onSelectTopic(featuredLessons[0] ? topicTitle(featuredLessons[0]) : units[0]?.title)}>
          Start Course
        </button>
      </div>
    </section>
  );

  const librarySection = (
    <section className="path-section" key="library">
      <h2 className="path-section-title">Lesson Library</h2>
      <div className="unit-library">
        {units.map((unit, idx) => (
          <UnitLessonPanel
            key={`lesson-library-${unit.id || unit.title}`}
            unit={unit}
            unitIndex={idx}
            onSelectTopic={onSelectTopic}
            onSelectUnit={onSelectUnit}
          />
        ))}
      </div>
    </section>
  );

  const orderedSections = requestedNeed === 'Course'
    ? [courseSection, unitSection, librarySection, lessonSection]
    : requestedNeed === 'Unit'
      ? [unitSection, librarySection, lessonSection, courseSection]
      : [lessonSection, librarySection, unitSection, courseSection];

  return (
    <div className="container learning-path">
      <div className="path-header">
        <span className="requested-result-chip">
          Showing {requestedLabel} first {requestedNeed === 'Lesson' && starterLessonsRemaining > 0 ? `${starterLessonsRemaining} free lessons left` : requestedNeed === 'Lesson' && !isRealEmail(user?.email) && !curriculum.isFree ? '1 free guest lesson' : curriculum.isFree ? 'FREE' : `$${requestedPrice}`}
        </span>
        <h1 className="section-title">{requestedLabel}</h1>
        <p className="text-dim">
          Tailored for {studentData.grade} in {studentData.country}. Other available formats are below.
        </p>
        {!curriculum.isFree && user?.email && isRealEmail(user.email) && (
          <p className="free-lesson-status">
            Welcome, glad to have you. You have {user.freeLessonRemaining ?? FREE_LESSON_LIMIT} of {user.freeLessonLimit ?? FREE_LESSON_LIMIT} free lessons left.
          </p>
        )}
        {!curriculum.isFree && !isRealEmail(user?.email) && (
          <p className="free-lesson-status">
            You can open 1 lesson for free as a guest. After that, sign in to get {FREE_LESSON_LIMIT} more free lessons.
          </p>
        )}
        {planSaveStatus && <p className="save-status">{planSaveStatus}</p>}
        <div className="offline-download-row" aria-label="Offline course downloads">
          <button type="button" onClick={copyCourseLink}>
            <Share2 size={15} /> {shareStatus || 'Copy course link'}
          </button>
          <button type="button" onClick={downloadCourseOutline}>
            <Download size={15} /> Download small outline
          </button>
          <button type="button" onClick={downloadCourseJson}>
            <Download size={15} /> Download portable JSON
          </button>
        </div>
      </div>
      {orderedSections}
    </div>
  );
};

const WhiteboardView = ({ compact = false, storageKey = 'globalLmsWhiteboardStandalone', pendingText = '' }) => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const textInputRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const historyRef = useRef([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(6);
  const [background, setBackground] = useState('grid');
  const [textDraft, setTextDraft] = useState('');
  const [textPoint, setTextPoint] = useState(null);
  const [shareStatus, setShareStatus] = useState('Ready');
  const [historyCount, setHistoryCount] = useState(0);
  const colors = ['#0f172a', '#2563eb', '#0f766e', '#f97316', '#dc2626', '#7c3aed', '#111827'];

  const context = () => canvasRef.current?.getContext('2d');

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current = [...historyRef.current.slice(-14), canvas.toDataURL('image/png')];
    setHistoryCount(historyRef.current.length);
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      percentX: ((event.clientX - rect.left) / rect.width) * 100,
      percentY: ((event.clientY - rect.top) / rect.height) * 100
    };
  };

  const clearBoard = (remember = true) => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    if (remember) saveSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const persistBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas || !storageKey) return;
    try {
      localStorage.setItem(storageKey, canvas.toDataURL('image/png'));
    } catch {
      // Local storage can be full or disabled; drawing still works in memory.
    }
  };

  useEffect(() => {
    clearBoard(false);
    const canvas = canvasRef.current;
    const ctx = context();
    const saved = storageKey ? localStorage.getItem(storageKey) : '';
    if (canvas && ctx && saved) {
      const image = new window.Image();
      image.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
      };
      image.src = saved;
    }
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [storageKey]);

  useEffect(() => {
    if (textPoint) {
      window.setTimeout(() => textInputRef.current?.focus(), 0);
    }
  }, [textPoint]);

  useEffect(() => {
    if (!pendingText) return;
    const textToDraw = String(pendingText).split('|').slice(1).join('|') || pendingText;
    const ctx = context();
    if (!ctx) return;
    saveSnapshot();
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = '700 32px Inter, Arial, sans-serif';
    ctx.textBaseline = 'top';
    const lines = textToDraw.match(/.{1,48}(\s|$)/g) || [textToDraw];
    lines.slice(0, 6).forEach((line, index) => ctx.fillText(line.trim(), 52, 52 + index * 42));
    ctx.restore();
    persistBoard();
  }, [pendingText]);

  const beginDraw = (event) => {
    if (tool === 'pointer') return;
    if (tool === 'text') {
      const point = getPoint(event);
      setTextDraft('');
      setTextPoint(point);
      return;
    }
    saveSnapshot();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    const ctx = context();
    const last = lastPointRef.current;
    const next = getPoint(event);
    if (!ctx || !last) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    ctx.restore();
    lastPointRef.current = next;
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    persistBoard();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    const snapshot = historyRef.current.pop();
    if (!canvas || !ctx || !snapshot) return;
    const image = new window.Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      persistBoard();
    };
    image.src = snapshot;
    setHistoryCount(historyRef.current.length);
  };

  const addText = () => {
    if (!textDraft.trim()) return;
    const ctx = context();
    if (!ctx) return;
    saveSnapshot();
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.max(24, size * 5)}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const lines = textDraft.match(/.{1,44}(\s|$)/g) || [textDraft];
    const x = textPoint?.x ?? 72;
    const y = textPoint?.y ?? 72;
    const lineHeight = Math.max(32, size * 6);
    lines.forEach((line, index) => ctx.fillText(line.trim(), x, y + index * lineHeight));
    ctx.restore();
    setTextDraft('');
    setTextPoint(null);
    persistBoard();
  };

  const exportBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `global-lms-whiteboard-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const uploadImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const canvas = canvasRef.current;
        const ctx = context();
        if (!canvas || !ctx) return;
        saveSnapshot();
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        persistBoard();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => setShareStatus('Screen share stopped'));
      setShareStatus('Screen share preview live');
    } catch {
      setShareStatus('Screen share was cancelled');
    }
  };

  const stopScreenShare = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setShareStatus('Screen share stopped');
  };

  const captureScreen = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = context();
    if (!video?.srcObject || !canvas || !ctx || video.videoWidth === 0) {
      setShareStatus('Start screen share first');
      return;
    }
    saveSnapshot();
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    persistBoard();
    setShareStatus('Screen captured to board');
  };

  return (
    <div className={`whiteboard-shell ${compact ? 'is-compact' : ''}`}>
      <section className="whiteboard-toolbar" aria-label="Whiteboard tools">
        <div className="whiteboard-tool-group">
          <button type="button" className={tool === 'pen' ? 'is-active' : ''} onClick={() => setTool('pen')} title="Pen">
            <PenTool size={18} /> Pen
          </button>
          <button type="button" className={tool === 'text' ? 'is-active' : ''} onClick={() => setTool('text')} title="Text">
            <Type size={18} /> Text
          </button>
          <button type="button" className={tool === 'eraser' ? 'is-active' : ''} onClick={() => setTool('eraser')} title="Eraser">
            <Eraser size={18} /> Eraser
          </button>
          <button type="button" className={tool === 'pointer' ? 'is-active' : ''} onClick={() => setTool('pointer')} title="Pointer mode">
            <MousePointer2 size={18} /> Point
          </button>
        </div>

        <div className="whiteboard-tool-group color-group" aria-label="Ink colors">
          {colors.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`color-swatch ${color === swatch ? 'is-active' : ''}`}
              style={{ backgroundColor: swatch }}
              onClick={() => setColor(swatch)}
              aria-label={`Use ${swatch}`}
            />
          ))}
        </div>

        <label className="whiteboard-slider">
          <span>Stroke</span>
          <input type="range" min="2" max="34" value={size} onChange={(event) => setSize(Number(event.target.value))} />
          <strong>{size}px</strong>
        </label>

        <select className="whiteboard-select" value={background} onChange={(event) => setBackground(event.target.value)} aria-label="Board background">
          <option value="grid">Grid</option>
          <option value="lines">Lines</option>
          <option value="blank">Blank</option>
        </select>

        <div className="whiteboard-tool-group">
          <button type="button" onClick={undo} disabled={!historyCount}>Undo</button>
          <button type="button" onClick={() => { clearBoard(true); window.setTimeout(persistBoard, 0); }}>
            <Trash2 size={18} /> Clear
          </button>
          <button type="button" onClick={exportBoard}>
            <Save size={18} /> PNG
          </button>
          <label className="whiteboard-upload">
            <Upload size={18} /> Image
            <input type="file" accept="image/*" onChange={uploadImage} />
          </label>
        </div>
      </section>

      <section className="whiteboard-layout">
        <div className={`whiteboard-canvas-wrap board-${background}`}>
          <canvas
            ref={canvasRef}
            width="1400"
            height="820"
            className={`whiteboard-canvas tool-${tool}`}
            onPointerDown={beginDraw}
            onPointerMove={draw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
            onPointerLeave={endDraw}
            aria-label="Drawable classroom whiteboard"
          />
          {textPoint && (
            <input
              ref={textInputRef}
              className="whiteboard-inline-text"
              style={{ left: `${textPoint.percentX}%`, top: `${textPoint.percentY}%`, color, fontSize: `${Math.max(18, size * 3)}px` }}
              value={textDraft}
              placeholder="Type here"
              onChange={(event) => setTextDraft(event.target.value)}
              onBlur={addText}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addText();
                }
                if (event.key === 'Escape') {
                  setTextDraft('');
                  setTextPoint(null);
                }
              }}
            />
          )}
        </div>

        <aside className="whiteboard-side">
          {!compact && (
            <div className="whiteboard-side-section">
              <span className="whiteboard-kicker">Live classroom</span>
              <h2>Draw, present, capture, explain</h2>
              <p>
                Use this as a teacher board during lessons, a student scratchpad, or a quick way to mark up a screen before exporting.
              </p>
            </div>
          )}

          <div className="whiteboard-text-box">
            <label htmlFor="whiteboard-text">Add text to board</label>
            <textarea
              id="whiteboard-text"
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              placeholder={tool === 'text' ? 'Or click the board and type there...' : 'Type directions, vocabulary, an equation, or an exit ticket...'}
            />
            <button type="button" onClick={addText}>
              <Type size={17} /> Add Text
            </button>
          </div>

          <div className="screen-share-panel">
            <div className="screen-share-actions">
              <button type="button" onClick={startScreenShare}>
                <ScreenShare size={17} /> Share Screen
              </button>
              <button type="button" onClick={captureScreen}>Capture</button>
              <button type="button" onClick={stopScreenShare}>Stop</button>
            </div>
            <video ref={videoRef} muted playsInline className="screen-preview" />
            <p>{shareStatus}</p>
          </div>
        </aside>
      </section>
    </div>
  );
};

const StudentInformationSystemView = ({ onBuildPlan, onOpenDashboard }) => {
  const [activeTab, setActiveTab] = useState('records');
  const [students, setStudents] = useState([
    { id: 1, name: 'Avery Johnson', grade: 'Grade 5', guardian: 'Morgan Johnson', email: 'morgan@example.com', attendance: 'Present', average: 92, accommodations: 'Reading support' },
    { id: 2, name: 'Sam Rivera', grade: 'Grade 5', guardian: 'Elena Rivera', email: 'elena@example.com', attendance: 'Present', average: 84, accommodations: 'English vocabulary preview' },
    { id: 3, name: 'Mina Patel', grade: 'Grade 5', guardian: 'Dev Patel', email: 'dev@example.com', attendance: 'Absent', average: 78, accommodations: 'Small-group reteach' }
  ]);
  const [draft, setDraft] = useState({ name: '', grade: 'Grade 5', guardian: '', email: '', accommodations: '' });
  const [message, setMessage] = useState('Reminder: offline lesson packets are ready for this week.');

  const addStudent = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setStudents((current) => [
      ...current,
      {
        id: Date.now(),
        name: draft.name.trim(),
        grade: draft.grade,
        guardian: draft.guardian.trim() || 'Guardian not added',
        email: draft.email.trim(),
        attendance: 'Present',
        average: 0,
        accommodations: draft.accommodations.trim() || 'None'
      }
    ]);
    setDraft({ name: '', grade: 'Grade 5', guardian: '', email: '', accommodations: '' });
  };

  const updateAverage = (id, value) => {
    setStudents((current) => current.map((student) => (
      student.id === id ? { ...student, average: Number(value) || 0 } : student
    )));
  };

  return (
    <section className="container sis-site">
      <div className="sis-overview-card mb-12">
        <div>
          <span className="course-overview-kicker">Live SIS tools</span>
          <h1>LMS, SIS, gradebook, and communications</h1>
          <p>
            Add students, manage records, update grades, prepare family communications, and keep offline
            lesson access together. This live workflow supports classroom records while deeper account permissions continue to expand.
          </p>
        </div>
        <div className="sis-price-box">
          <strong>{Math.max(50 - students.length, 0)}</strong>
          <span>free seats left</span>
          <small>$25/student after 50, planned</small>
        </div>
      </div>

      <div className="sis-tabs" role="tablist" aria-label="SIS tools">
        <button type="button" className={activeTab === 'records' ? 'is-active' : ''} onClick={() => setActiveTab('records')}><Users size={16} /> Records</button>
        <button type="button" className={activeTab === 'gradebook' ? 'is-active' : ''} onClick={() => setActiveTab('gradebook')}><BarChart3 size={16} /> Gradebook</button>
        <button type="button" className={activeTab === 'parent' ? 'is-active' : ''} onClick={() => setActiveTab('parent')}><User size={16} /> Parent Portal</button>
        <button type="button" className={activeTab === 'analytics' ? 'is-active' : ''} onClick={() => setActiveTab('analytics')}><Trophy size={16} /> Analytics</button>
        <button type="button" className={activeTab === 'communications' ? 'is-active' : ''} onClick={() => setActiveTab('communications')}><Mail size={16} /> Communications</button>
        <button type="button" className={activeTab === 'integrations' ? 'is-active' : ''} onClick={() => setActiveTab('integrations')}><Shield size={16} /> SSO + Privacy</button>
        <button type="button" className={activeTab === 'offline' ? 'is-active' : ''} onClick={() => setActiveTab('offline')}><MonitorOff size={16} /> Offline</button>
      </div>

      {activeTab === 'records' && (
        <div className="sis-workspace">
          <form className="sis-panel" onSubmit={addStudent}>
            <h2>Add Student</h2>
            <input className="form-control" placeholder="Student name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className="form-control" value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })}>
              {Array.from({ length: 12 }, (_, index) => <option key={index}>Grade {index + 1}</option>)}
            </select>
            <input className="form-control" placeholder="Guardian name" value={draft.guardian} onChange={(e) => setDraft({ ...draft, guardian: e.target.value })} />
            <input className="form-control" placeholder="Guardian email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <input className="form-control" placeholder="Accommodations / notes" value={draft.accommodations} onChange={(e) => setDraft({ ...draft, accommodations: e.target.value })} />
            <button type="submit" className="initialize-btn">Add Student</button>
          </form>
          <div className="sis-panel">
            <h2>Student Records</h2>
            <div className="sis-record-list">
              {students.map((student) => (
                <article key={student.id} className="sis-record-card">
                  <strong>{student.name}</strong>
                  <span>{student.grade} | {student.attendance}</span>
                  <small>Guardian: {student.guardian}</small>
                  <small>Support: {student.accommodations}</small>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gradebook' && (
        <div className="sis-panel">
          <h2>Gradebook</h2>
          <div className="sis-gradebook">
            {students.map((student) => (
              <label key={student.id} className="sis-grade-row">
                <span>{student.name}</span>
                <input type="number" min="0" max="100" value={student.average} onChange={(e) => updateAverage(student.id, e.target.value)} />
                <strong>{student.average}%</strong>
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'parent' && (
        <div className="sis-workspace">
          <div className="sis-panel">
            <h2>Parent / Guardian Portal</h2>
            <p className="advanced-helper">Families can check attendance, assignments, grades, accommodations, teacher notes, and missing work from a phone-friendly view.</p>
            <div className="deliverable-strip">
              <span>Attendance</span>
              <span>Assignments</span>
              <span>Grades</span>
              <span>Teacher notes</span>
              <span>Guardian contacts</span>
            </div>
          </div>
          <div className="sis-panel">
            <h2>Family Snapshot</h2>
            {students.map((student) => (
              <article key={student.id} className="sis-record-card">
                <strong>{student.name}</strong>
                <span>{student.average}% average | {student.attendance}</span>
                <small>Guardian: {student.guardian} | {student.email || 'No email yet'}</small>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="sis-panel">
          <h2>Analytics + Intervention Queue</h2>
          <div className="sis-gradebook">
            {students.map((student) => {
              const needsHelp = student.average < 80 || student.attendance === 'Absent';
              return (
                <div key={student.id} className="sis-grade-row">
                  <span>{student.name}</span>
                  <strong>{student.average}%</strong>
                  <small>{needsHelp ? 'Intervention' : 'On track'}</small>
                </div>
              );
            })}
          </div>
          <div className="deliverable-strip">
            <span>Real-time dashboards</span>
            <span>Engagement alerts</span>
            <span>Missing work</span>
            <span>Mastery trends</span>
            <span>Badge progress</span>
          </div>
        </div>
      )}

      {activeTab === 'communications' && (
        <div className="sis-workspace">
          <div className="sis-panel">
            <h2>Class Message + Translation</h2>
            <textarea className="creator-textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="deliverable-strip">
              <span>English</span>
              <span>Spanish</span>
              <span>French</span>
              <span>Arabic</span>
              <span>Family language</span>
            </div>
            <button type="button" className="initialize-btn">Queue Message</button>
          </div>
          <div className="sis-panel">
            <h2>Recipients</h2>
            {students.map((student) => (
              <div key={student.id} className="sis-message-row">
                <Mail size={15} />
                <span>{student.guardian}</span>
                <small>{student.email || 'No email yet'}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="sis-panel">
          <h2>SSO, Tool Integration, and Compliance</h2>
          <p>Designed for Google Classroom, Google Drive, Canvas, Moodle, Schoology, Blackboard, Brightspace, Teams, SIS import/export, and future SSO.</p>
          <div className="deliverable-strip">
            <span>Google Classroom</span>
            <span>Google Drive</span>
            <span>SIS sync</span>
            <span>SSO ready</span>
            <span>FERPA</span>
            <span>COPPA</span>
            <span>Secure exports</span>
          </div>
        </div>
      )}

      {activeTab === 'offline' && (
        <div className="sis-panel">
          <h2>Offline Packet Builder</h2>
          <p>Prepare rosters, grade summaries, guardian contacts, lesson HTML, TXT packets, quizzes, and answer keys before internet drops.</p>
          <div className="deliverable-strip">
            <span>Roster CSV</span>
            <span>Gradebook PDF</span>
            <span>Guardian contacts</span>
            <span>Lesson HTML</span>
            <span>Quiz + answer key</span>
            <span>Self-paced packets</span>
            <span>Live class support</span>
          </div>
        </div>
      )}

      <div className="sis-grid sis-grid-five mb-12">
        <div className="sis-feature">
          <User size={20} />
          <h3>Parent Portal</h3>
          <p>Guardian views for grades, attendance, assignments, teacher notes, and support needs.</p>
        </div>
        <div className="sis-feature">
          <Shield size={20} />
          <h3>SSO + Privacy</h3>
          <p>SSO-ready structure with FERPA, COPPA, secure data handling, and LMS/SIS integrations.</p>
        </div>
        <div className="sis-feature">
          <Star size={20} />
          <h3>Engagement</h3>
          <p>Points, badges, certificates, LessonCast, polls, and interactive checks for young learners.</p>
        </div>
        <div className="sis-feature">
          <BarChart3 size={20} />
          <h3>Interventions</h3>
          <p>Real-time progress, grade trends, attendance flags, and students needing support.</p>
        </div>
        <div className="sis-feature">
          <Globe size={20} />
          <h3>Blended Learning</h3>
          <p>Mobile-first online lessons, offline packets, live class use, and self-paced study.</p>
        </div>
      </div>

      <div className="sis-actions">
        <button type="button" className="initialize-btn" onClick={onBuildPlan}>Build My Plan <ArrowRight size={18} /></button>
        <button type="button" className="lesson-nav-btn" onClick={onOpenDashboard}>Open Dashboard Preview</button>
      </div>
    </section>
  );
};

const TeacherDashboard = ({ curriculum, studentData }) => (
  <div className="container">
    <div className="flex justify-between items-end mb-12">
      <div>
        <h1 className="section-title">Teacher Dashboard</h1>
        <p className="text-dim">
          {workspaceSummary(studentData?.workspaceType, studentData?.workspaceName)} | {curriculum?.subjects?.[0]?.name || 'General'} | {studentData?.grade}
        </p>
      </div>
      <div className="flex gap-4">
        <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
          <Users size={18} />
          <span>50 Students Free</span>
        </div>
      </div>
    </div>

    <div className="sis-overview-card mb-12">
      <div>
        <span className="course-overview-kicker">All-in-one school system</span>
        <h2>Gradebook, communications, student information, lessons, and offline access.</h2>
        <p>
          Global LMS can grow from a curriculum warehouse into a full school operating system:
          student profiles, enrollment, attendance, guardian contacts, accommodations, gradebook,
          class communications, AI translation, lesson progress, SSO-ready integrations, parent portals,
          badges, certificates, intervention analytics, and downloadable offline work packets.
        </p>
        <p className="text-sm font-bold text-dim">
          Workspace: {workspaceSummary(studentData?.workspaceType, studentData?.workspaceName)}
        </p>
      </div>
      <div className="sis-price-box">
        <strong>First 50</strong>
        <span>students free</span>
        <small>$25/student after that, planned</small>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      <div className="stat-card">
        <div className="stat-value">24</div>
        <div className="stat-label">Active Students</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">26</div>
        <div className="stat-label">Free Seats Left</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">$25</div>
        <div className="stat-label">Per Student After 50</div>
      </div>
    </div>

    <div className="sis-grid mb-12">
      <div className="sis-feature">
        <Users size={20} />
        <h3>Student Records</h3>
        <p>Profiles, enrollment status, guardian contacts, language needs, accommodations, and class placement.</p>
      </div>
      <div className="sis-feature">
        <BarChart3 size={20} />
        <h3>Gradebook</h3>
        <p>Track assignments, quiz scores, lesson completion, mastery, teacher comments, and grade trends.</p>
      </div>
      <div className="sis-feature">
        <Mail size={20} />
        <h3>Parent + Communication Portal</h3>
        <p>Family messages, guardian dashboards, attendance, assignments, teacher notes, and multilingual follow-up.</p>
      </div>
      <div className="sis-feature">
        <MonitorOff size={20} />
        <h3>Integrations + Blended Mode</h3>
        <p>Google Classroom, Drive, SIS sync, FERPA/COPPA-ready privacy, offline packets, and self-paced or live learning.</p>
      </div>
    </div>

    <div className="sis-grid sis-grid-five mb-12">
      <div className="sis-feature">
        <Shield size={20} />
        <h3>SSO Ready</h3>
        <p>Designed for school identity systems and plug-and-play classroom tool workflows.</p>
      </div>
      <div className="sis-feature">
        <Trophy size={20} />
        <h3>Badges + Certificates</h3>
        <p>Points, mastery badges, certificates, quizzes, polls, and interactive engagement.</p>
      </div>
      <div className="sis-feature">
        <BarChart3 size={20} />
        <h3>Intervention Analytics</h3>
        <p>Real-time progress, missing work, attendance risk, and mastery trend tracking.</p>
      </div>
      <div className="sis-feature">
        <BookOpen size={20} />
        <h3>Content Builder</h3>
        <p>Teacher-friendly lesson, unit, and course creation aligned to regional standards.</p>
      </div>
      <div className="sis-feature">
        <Globe size={20} />
        <h3>Translation Support</h3>
        <p>Family communication planning for multilingual classrooms and global regions.</p>
      </div>
    </div>

    <div className="glass">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        <BarChart3 size={20} className="text-primary" />
        Curriculum Mastery
      </h3>
      <div className="space-y-6">
        {curriculum?.subjects?.map((sub, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span>{sub.name}</span>
              <span className="text-primary">75% Complete</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: '75%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const UsageView = ({ user, onNavigate }) => {
  const [token, setToken] = useState(() => localStorage.getItem('globalLmsAdminToken') || '');
  const [summary, setSummary] = useState(null);
  const [usage, setUsage] = useState(null);
  const [status, setStatus] = useState('Loading dashboard...');
  const [showOwnerDetails, setShowOwnerDetails] = useState(true);
  const explainUsageFailure = (err) => {
    const message = String(err?.message || '');
    if (/failed to fetch|networkerror|cors|blocked|econnreset|connection was reset|preflight/i.test(message)) {
      return 'The usage dashboard cannot reach the backend right now. If this is the live site, the server likely needs a redeploy or CORS update for this origin.';
    }
    return `${message || 'Usage load failed.'} Check that the server is running at ${API_BASE}.`;
  };

  const loadSummary = async () => {
    setStatus('Loading dashboard...');
    try {
      const res = await fetch(`${API_BASE}/api/usage/summary`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Usage summary failed');
      setSummary(data);
      setStatus(`Updated ${new Date(data.generatedAt).toLocaleString()}`);
    } catch (err) {
      setStatus(explainUsageFailure(err));
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const loadUsage = async (event) => {
    event?.preventDefault();
    if (!token.trim()) {
      setStatus('Owner token is optional in local mode. Loading owner details...');
    }
    setStatus('Loading usage...');
    try {
      localStorage.setItem('globalLmsAdminToken', token.trim());
      const url = token.trim()
        ? `${API_BASE}/api/admin/usage?token=${encodeURIComponent(token.trim())}`
        : `${API_BASE}/api/admin/usage`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Usage load failed');
      setUsage(data);
      setStatus('Usage loaded.');
    } catch (err) {
      setUsage(null);
      setStatus(explainUsageFailure(err));
    }
  };

  useEffect(() => {
    if (token.trim()) {
      loadUsage();
    }
  }, []);

  useEffect(() => {
    if (user && isOwnerAdmin(user)) {
      loadUsage();
    }
  }, [user?.email]);

  return (
    <section className="container usage-shell">
      <div className="usage-header">
        <span className="course-overview-kicker">Owner Usage</span>
        <h1>Platform Activity</h1>
        <p>See how many people are checking out the site, what lessons they open, and which courses are getting attention.</p>
      </div>
      <div className="usage-user-access">
        <div>
          <span className="course-overview-kicker">Signed In</span>
          <h2>{user?.email ? user.email : 'Not signed in'}</h2>
          <p>
            {user
              ? `${isOwnerAdmin(user) ? 'Owner login detected.' : `Standard ${user.role || 'user'} access.`} Login shows your account, while the owner token unlocks protected usage rows.`
              : 'Sign in to see your account badge and saved plan access.'}
          </p>
        </div>
        <div className="usage-user-access-badge">
          <span>Current access</span>
          <strong>{user ? (isOwnerAdmin(user) ? 'Owner' : user.role || 'Signed in') : 'Guest'}</strong>
        </div>
      </div>
      <div className="usage-refresh-row">
        <p className="save-status">{status}</p>
        <button type="button" className="initialize-btn" onClick={() => onNavigate?.('marketing')}>
          Open Marketing Agent
        </button>
        <button type="button" className="lesson-nav-btn" onClick={loadSummary}>Refresh</button>
      </div>
      {/backend|cors|redeploy/i.test(status) && (
        <div className="usage-admin-detail" style={{ marginTop: 0 }}>
          <div className="usage-admin-detail-head">
            <div>
              <h2>Backend Needs Attention</h2>
              <p>Login and the admin badge are working. This message means the dashboard data endpoint is not reachable from the current site yet.</p>
            </div>
          </div>
        </div>
      )}
      {summary && (
        <>
          <div className="usage-stat-grid">
            <div className="stat-card stat-card-payments"><div className="stat-value">{summary.counts.totalPurchases || 0}</div><div className="stat-label">💳 Paid Orders</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.pageViews}</div><div className="stat-label">Page Views</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.uniqueVisitors}</div><div className="stat-label">Unique Visitors</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.lessonOpens}</div><div className="stat-label">Lesson Opens</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.interactiveEvents}</div><div className="stat-label">Interactive Events</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.signIns}</div><div className="stat-label">Sign Ins</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.savedPlans}</div><div className="stat-label">Saved Plans</div></div>
            <div className="stat-card"><div className="stat-value">{summary.counts.newsletterSubscribers || 0}</div><div className="stat-label">Newsletter Subs</div></div>
          </div>

          <div className="usage-today-card">
            <div>
              <span className="course-overview-kicker">Today</span>
              <h2>{summary.today.pageViews} page views from {summary.today.uniqueVisitors} visitors</h2>
            </div>
            <div className="usage-today-metrics">
              <span>{summary.today.lessonOpens} lesson opens</span>
              <span>{summary.today.interactiveEvents} interactions</span>
              <span>{summary.today.events} total events</span>
            </div>
          </div>

          <div className="usage-grid">
            <div className="usage-panel">
              <h2>Daily Trend</h2>
              <div className="usage-table">
                {(summary.daily || []).map((day) => (
                  <div key={day.date} className="usage-row usage-day-row">
                    <strong>{day.date}</strong>
                    <span>{day.pageViews} views | {day.uniqueVisitors} visitors | {day.lessonOpens} lessons</span>
                    <div className="usage-bar"><span style={{ width: `${Math.min(100, day.pageViews * 3)}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="usage-panel">
              <h2>Top Courses</h2>
              <div className="usage-table">
                {(summary.topCourses || []).map((item) => (
                  <div key={item.name} className="usage-row">
                    <strong>{item.name}</strong>
                    <span>{item.count} events</span>
                  </div>
                ))}
                {!summary.topCourses?.length && <p>No course activity yet.</p>}
              </div>
            </div>
            <div className="usage-panel">
              <h2>Top Lessons</h2>
              <div className="usage-table">
                {(summary.topLessons || []).map((item) => (
                  <div key={item.name} className="usage-row">
                    <strong>{item.name}</strong>
                    <span>{item.count} opens</span>
                  </div>
                ))}
                {!summary.topLessons?.length && <p>No lesson opens yet.</p>}
              </div>
            </div>
            <div className="usage-panel">
              <h2>What People Do</h2>
              <div className="usage-table">
                {(summary.eventTypes || []).map((item) => (
                  <div key={item.name} className="usage-row">
                    <strong>{item.name}</strong>
                    <span>{item.count} events</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="usage-admin-detail">
          <div className="usage-admin-detail-head">
          <div>
            <h2>Owner Details</h2>
            <p>Public stats load automatically. Recent users and activity rows are protected by the owner token, so login alone will not reveal them unless you are the owner account.</p>
          </div>
          <button type="button" className="lesson-nav-btn" onClick={() => setShowOwnerDetails((value) => !value)}>
            {showOwnerDetails ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>
      {showOwnerDetails && (
        <>
          <form className="usage-token-row" onSubmit={loadUsage}>
            <input
              className="form-control"
              type="password"
              placeholder="Owner token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button type="submit" className="initialize-btn">Load Owner Details</button>
          </form>
          {usage && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="stat-card"><div className="stat-value">{usage.counts.users}</div><div className="stat-label">Saved Users</div></div>
                <div className="stat-card"><div className="stat-value">{usage.counts.usageEvents}</div><div className="stat-label">Usage Events</div></div>
                <div className="stat-card"><div className="stat-value">{usage.counts.savedCurriculums}</div><div className="stat-label">Curriculum Records</div></div>
                <div className="stat-card"><div className="stat-value">{usage.counts.newsletterSubscribers || 0}</div><div className="stat-label">Newsletter Subs</div></div>
                <div className="stat-card"><div className="stat-value">{usage.counts.totalPurchases || 0}</div><div className="stat-label">Completed Purchases</div></div>
              </div>
              <div className="usage-grid">
                <div className="usage-panel">
                  <h2>Marketplace Purchases</h2>
                  <div className="usage-table">
                    {(usage.purchases || []).map((item) => (
                      <div key={item.id} className="usage-row">
                        <strong>{item.itemName || 'Marketplace item'}</strong>
                        <span>{formatCents(item.amountTotal, item.currency)} | {item.paymentStatus || 'paid'} | {item.customerEmail || 'customer'}</span>
                        <small>
                          {item.creatorEmail ? `Creator: ${item.creatorEmail} | ` : ''}
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                        </small>
                      </div>
                    ))}
                    {!usage.purchases?.length && <p>No completed marketplace purchases yet.</p>}
                  </div>
                </div>
                <div className="usage-panel">
                  <h2>AI Credit Purchases</h2>
                  <div className="usage-table">
                    {(usage.aiCreditPurchases || []).map((item) => (
                      <div key={item.id} className="usage-row">
                        <strong>{item.packId || 'Credit pack'}</strong>
                        <span>{formatCents(item.amountTotal, item.currency)} | {item.credits || 0} credits | {item.customerEmail || 'customer'}</span>
                        <small>{item.paymentStatus || 'paid'} | {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small>
                      </div>
                    ))}
                    {!usage.aiCreditPurchases?.length && <p>No AI credit purchases yet.</p>}
                  </div>
                </div>
                <div className="usage-panel">
                  <h2>Recent Users</h2>
                  <div className="usage-table">
                    {(usage.users || []).map((item) => (
                      <div key={item.id} className="usage-row">
                        <strong>{item.name || item.email}</strong>
                        <span>{item.email}</span>
                        <small>
                          {item.role || 'User'} | {workspaceSummary(item.workspaceType, item.workspaceName)} | Plans: {item.planCount || 0} | Lessons: {item.lessonOpenCount || 0}
                        </small>
                      </div>
                    ))}
                    {!usage.users?.length && <p>No saved users yet.</p>}
                  </div>
                </div>
                <div className="usage-panel">
                  <h2>Recent Activity</h2>
                  <div className="usage-table">
                    {(usage.events || []).slice(0, 30).map((item) => (
                      <div key={item.id} className="usage-row">
                        <strong>{item.type}</strong>
                        <span>{item.email || item.path || item.topic || 'anonymous visitor'}</span>
                        <small>{item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}</small>
                      </div>
                    ))}
                    {!usage.events?.length && <p>No events yet.</p>}
                  </div>
                </div>
                <div className="usage-panel">
                  <h2>Newsletter List</h2>
                  <div className="usage-table">
                    {(usage.newsletter || []).map((item) => (
                      <div key={item.id} className="usage-row">
                        <strong>{item.name || item.email}</strong>
                        <span>{item.email}</span>
                        <small>{item.source || 'homepage'} | {item.active ? 'active' : 'inactive'} | {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}</small>
                      </div>
                    ))}
                    {!usage.newsletter?.length && <p>No newsletter subscribers yet.</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};

const buildClassActivities = (lesson, topic) => {
  const title = lesson?.title || topic || 'this lesson';
  const content = cleanLessonText(lesson?.content || lesson?.hook || title);
  const words = Array.from(new Set(content.split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ''))
    .filter((word) => word.length > 5 && !/students|lesson|teacher|understand|example|practice/i.test(word))))
    .slice(0, 4);
  const matchTerms = (words.length >= 3 ? words : ['Evidence', 'Model', 'Explain', 'Apply']).slice(0, 4);
  const firstQuestion = lesson?.quiz?.[0]?.question || `What is the most important idea in ${title}?`;

  return {
    thinkPairShare: {
      title: 'Think-Pair-Share',
      prompt: `Think: What is one real-world example of ${title}? Pair: explain it to a partner. Share: say one sentence that starts with "This matters because..."`,
      steps: ['Think quietly for 60 seconds', 'Compare with a partner', 'Share one answer with evidence']
    },
    quickPoll: {
      title: 'Quick Poll',
      question: firstQuestion,
      options: ['I can explain it', 'I need one example', 'I need reteaching', 'I can teach someone else']
    },
    matchGame: {
      title: 'Vocabulary Match',
      terms: matchTerms.map((term, index) => ({
        term,
        definition: index === 0
          ? `A key idea connected to ${title}.`
          : index === 1
            ? 'A detail students should explain with evidence.'
            : index === 2
              ? 'A word to use during partner discussion.'
              : 'A concept to apply in a new example.'
      }))
    },
    exitTicket: {
      title: 'Exit Ticket',
      prompt: `In 2-3 sentences, explain ${title} and give one example or piece of evidence.`
    },
    challenge: {
      title: 'Mini Challenge',
      prompt: `Create a diagram, example, short script, or problem that teaches ${title} to another student.`
    }
  };
};

const buildDepthOfKnowledgeQuiz = (lesson, topic) => {
  const title = lesson?.title || topic || 'this lesson';
  const course = lesson?.course || lesson?.subject || 'this course';
  const region = lesson?.state || lesson?.country || lesson?.export_metadata?.region || 'your community';
  return [
    {
      type: 'choice',
      question: `Which response best analyzes why ${title.toLowerCase()} matters in ${course}?`,
      options: ['It repeats one definition from the lesson.', 'It connects the idea to evidence, consequences, and a new example.', 'It lists unrelated facts without explaining them.', 'It says the topic is important without support.'],
      answer: 'It connects the idea to evidence, consequences, and a new example.'
    },
    {
      type: 'choice',
      question: `What should a student do to strengthen two possible explanations for ${title.toLowerCase()}?`,
      options: ['Choose the shorter explanation.', 'Compare both explanations against evidence or examples from the lesson.', 'Ignore evidence and rely on opinion.', 'Rewrite it as a yes-or-no answer.'],
      answer: 'Compare both explanations against evidence or examples from the lesson.'
    },
    {
      type: 'choice',
      question: `Which task best shows transfer of ${title.toLowerCase()} to a new situation?`,
      options: [`Use the concept to solve or explain a related problem in ${region}.`, 'Copy the vocabulary list exactly.', 'Circle the longest paragraph.', 'Say whether the lesson felt easy or hard.'],
      answer: `Use the concept to solve or explain a related problem in ${region}.`
    },
    {
      type: 'choice',
      question: `Which feedback best improves a claim about ${title.toLowerCase()}?`,
      options: ['I agree because it sounds right.', 'Add evidence, explain your reasoning, and address another possible interpretation.', 'Make it shorter.', 'Use more colorful words.'],
      answer: 'Add evidence, explain your reasoning, and address another possible interpretation.'
    },
    {
      type: 'choice',
      question: `Which question pushes beyond basic recall?`,
      options: ['What is one word from the title?', `How would changing one condition affect the outcome or meaning of ${title.toLowerCase()}?`, 'What page are we on?', 'Are you ready to continue?'],
      answer: `How would changing one condition affect the outcome or meaning of ${title.toLowerCase()}?`
    },
    { type: 'short', question: `Explain ${title.toLowerCase()} in 4-6 sentences using at least two pieces of evidence, examples, data points, or lesson details.` },
    { type: 'short', question: `Compare two strategies, interpretations, models, or examples from the lesson. Which is stronger, and why?` },
    { type: 'short', question: `Design a real-world task in ${region} where someone would apply ${title.toLowerCase()}. Include the goal, evidence needed, and success criteria.` },
    { type: 'short', question: `Identify one possible misconception about ${title.toLowerCase()}. Explain why it is incorrect and how you would correct it.` },
    { type: 'short', question: `Make a claim about ${title.toLowerCase()}, support it with reasoning, and explain one limitation or counterexample.` }
  ];
};

const isWeakQuizQuestion = (item = {}) => {
  const question = String(item.question || '').trim().toLowerCase();
  const hasDepthSignal = /analyz|evidence|justify|compare|evaluat|design|transfer|misconception|claim|counterexample|reasoning|interpretation|solution|consequence|apply|real-world|new situation/.test(question);
  return !question || question.length < 35 || /\bready\b|\bare you\b|\bis this lesson ready\b|\byes\b.*\bno\b/.test(question) || !hasDepthSignal;
};

const getHighValueKnowledgeCheck = (lesson, topic) => {
  const specific = topicSpecificQuiz(lesson, topic);
  const existing = Array.isArray(lesson?.quiz) ? lesson.quiz.filter((item) => !isWeakQuizQuestion(item)) : [];
  if (specific?.length >= 8 && (lesson?.isPublicSample || existing.length < 8)) {
    return specific.slice(0, 10);
  }
  const generated = specific || buildDepthOfKnowledgeQuiz(lesson, topic);
  const merged = [...existing, ...generated].slice(0, 10);
  return merged.length >= 8 ? merged : generated;
};

const stripLessonMarkdown = (value = '') => String(value || '')
  .replace(/\*\*/g, '')
  .replace(/^\s*[-*]\s+/, '')
  .trim();

const isTeacherOnlyLine = (line = '') => (
  /^(materials?|teacher plan|lesson procedure|procedure|direct instruction|guided practice|independent practice|differentiation|assessment|answer key|worksheet|mix-and-match|formative assessment|summative assessment|teacher'?s notes?|wrap-up|conclusion)\b/i.test(stripLessonMarkdown(line))
);

const isMetadataLine = (line = '') => (
  /^(grade level|grade|subject|course|topic|time allotment|standards?|standard code|teks|ccss|ngss|nys standards|learning standards)\s*:/i.test(stripLessonMarkdown(line))
);

const extractLessonBullets = (content = '', headingPattern) => {
  const lines = String(content || '').split('\n');
  const start = lines.findIndex((line) => headingPattern.test(stripLessonMarkdown(line)));
  if (start < 0) return [];
  const bullets = [];
  for (const line of lines.slice(start + 1)) {
    const clean = stripLessonMarkdown(line);
    if (!clean) {
      if (bullets.length) break;
      continue;
    }
    if (/^[A-Z][A-Za-z\s/&-]{2,}:$/.test(clean) && bullets.length) break;
    if (isTeacherOnlyLine(clean) && bullets.length) break;
    bullets.push(clean.replace(/^\d+\.\s*/, '').slice(0, 220));
    if (bullets.length >= 6) break;
  }
  return bullets.filter(Boolean);
};

const buildStudentReadingSections = (lesson, topic) => {
  const title = lesson?.title || topic || 'today\'s topic';
  const lowerTitle = title.toLowerCase();
  const course = lesson?.course || '';
  const grade = lesson?.grade || 'this grade';
  const region = lesson?.export_metadata?.region || lesson?.state || lesson?.country || 'your community';

  if (/story|figurative|character|plot|harbor light|literary/.test(lowerTitle) || /reading literature/i.test(course)) {
    return [
      {
        heading: 'Character, Setting, and Plot Work Together',
        body: 'In “The Harbor Light,” Mira is not brave because the author labels her brave. She is responsible because of what she does: she checks oil, trims the wick, waits until the beam hits the channel marker, and writes the log. The stormy harbor is the setting that makes those actions urgent. Plot is the sequence: routine checklist, wick sputtering, her choice to restore the lamp, the boat coming in.'
      },
      {
        heading: 'Metaphor vs Simile vs Personification',
        body: 'A metaphor says one thing is another: “The lighthouse was a stubborn spine against the dark.” A simile uses like or as: “The rain hit the windows like thrown pebbles.” Personification gives a human action to something nonhuman: “The wind clawed at the door.” Grade 5 readers should name the device and explain the job it does — usually showing danger, toughness, or mood.'
      },
      {
        heading: 'How to Use Text Evidence',
        body: 'A strong answer quotes or closely paraphrases the story. “Mira is responsible” is a claim. “She trimmed the wick, added oil, and waited until the light landed clean on the outer marker” is evidence. Without the second sentence, the claim is only an opinion.'
      },
      {
        heading: 'A Common Misconception',
        body: 'Figurative language is not extra decoration you can skip. If you drop “stubborn spine,” the tower is merely tall. The metaphor shows it holding position, which matches Mira holding the job when Grandfather cannot.'
      },
      {
        heading: 'Transfer the Skill',
        body: `Try the same analysis on a local story from ${region}: name the turning point, quote one metaphor or simile, and explain how setting raises the stakes. That is the skill this $5 lesson is selling — not a quiz that repeats the title.`
      }
    ];
  }

  if (/decimal|place value/.test(lowerTitle) && /decimal/.test(lowerTitle)) {
    return [
      {
        heading: 'What Decimals Show',
        body: 'Decimals are numbers that describe parts of a whole. The digits to the right of the decimal point have place values such as tenths, hundredths, and thousandths. In money, $4.75 means 4 whole dollars and 75 hundredths of a dollar. In measurement, 2.5 meters means 2 whole meters and 5 tenths of another meter.'
      },
      {
        heading: 'Adding and Subtracting Decimals',
        body: 'When adding or subtracting decimals, the most important step is lining up the decimal points. This keeps tenths with tenths, hundredths with hundredths, and whole numbers with whole numbers. For example, 3.40 + 2.75 is easier to solve when the digits are stacked by place value, because each column represents the same size part.'
      },
      {
        heading: 'Multiplying Decimals',
        body: 'Multiplying decimals is about finding a part of a part or scaling a quantity. If one notebook costs $1.25, then 4 notebooks cost 4 groups of $1.25. Students should estimate first, multiply carefully, and then decide where the decimal point belongs by thinking about the size of the answer.'
      },
      {
        heading: 'Dividing Decimals',
        body: 'Dividing decimals helps answer questions about equal groups, rates, and sharing. If 6.0 liters of water are shared equally among 4 containers, each container gets 1.5 liters. A good strategy is to connect the division problem to a real situation and ask whether the answer should be larger or smaller than the starting number.'
      },
      {
        heading: 'Using Decimals in Real Life',
        body: 'Decimals appear in prices, distances, sports times, recipes, science measurements, and classroom data. To show mastery, students should do more than calculate. They should explain why the operation fits the situation, use place-value language, check that the answer is reasonable, and describe what the answer means in context.'
      }
    ];
  }

  if (/robot|sensor|input|process|output|automation/.test(lowerTitle) || /robotics/i.test(course)) {
    return [
      {
        heading: 'What Is Robotics?',
        body: 'Robotics is the study of machines that sense information, make decisions, and perform actions. A robot is not just any machine. It usually has inputs such as sensors, a processing step such as code or a controller, and outputs such as movement, lights, sounds, or tool actions. Every robot is designed to solve a specific problem or complete a specific task.'
      },
      {
        heading: 'Inputs, Processing, and Outputs',
        body: 'An input gives the robot information about the world. A sensor can detect light, temperature, distance, color, sound, or touch. The processing step uses rules or code to decide what to do with that information. The output is the action the robot takes. For example, a floor-cleaning robot may sense a wall, process that it should turn, and then output movement in a new direction.'
      },
      {
        heading: 'How Engineers Design Robots',
        body: 'Robotics requires testing and improvement. Engineers identify a problem, brainstorm solutions, build a prototype, test it, and revise based on what they observe. This cycle is called the engineering design process. Students should learn to explain not only what a robot does, but why each part of the system helps the robot complete its task safely and accurately.'
      },
      {
        heading: 'Programming and Control',
        body: 'Most robots are controlled by code, which is a set of instructions written in a programming language. Code tells the robot what to sense, when to act, and how to respond to different situations. Even simple robots follow complex logical rules. Debugging, which means finding and fixing errors in code, is one of the most important skills in robotics.'
      },
      {
        heading: 'Real-World Connection',
        body: `Robots help in homes, hospitals, farms, factories, schools, space exploration, and dangerous environments around the world including ${region}. The important question is not whether a robot is impressive, but whether it solves a real problem safely, reliably, and in a way that benefits people.`
      }
    ];
  }

  if (/matter|solid|liquid|gas(es)?|states of matter|particle|molecule|atom|physical property|mass|volume|density/.test(lowerTitle)) {
    return [
      {
        heading: 'What Is Matter?',
        body: 'Everything around you is made of matter. Matter is anything that has mass and takes up space. The air you breathe, the water you drink, the chair you sit on, and even your own body are all examples of matter. Scientists study matter to understand what the physical world is built from and how different materials behave.'
      },
      {
        heading: 'The Three States of Matter',
        body: 'Matter commonly exists in three states: solid, liquid, and gas. A solid has a definite shape and a definite volume, meaning it holds its form and takes up the same amount of space no matter what container holds it. A liquid has a definite volume but no definite shape, so it flows to fit the shape of its container. A gas has no definite shape and no definite volume, spreading out to fill all available space.'
      },
      {
        heading: 'Particles and How They Move',
        body: 'All matter is made of tiny particles that are too small to see without a microscope. In a solid, particles are packed tightly together and vibrate in place, which is why solids hold their shape. In a liquid, particles are close but can slide past each other, allowing liquids to flow. In a gas, particles move quickly and are spread far apart. The arrangement and motion of particles determines which state a substance is in.'
      },
      {
        heading: 'Changing States',
        body: 'Matter can change from one state to another when energy is added or removed. Heating ice causes it to melt into liquid water. Heating liquid water causes it to evaporate into water vapor, which is a gas. Cooling water vapor causes it to condense back into liquid, and freezing liquid water turns it back into ice. These are physical changes because the substance stays the same — only its state changes.'
      },
      {
        heading: 'Why This Matters',
        body: `Understanding matter and its properties helps scientists, engineers, doctors, chefs, and builders make good decisions every day. In ${region}, people use knowledge of matter when building structures, purifying water, preparing food, developing medicines, and designing materials for different environments. Observing, measuring, and describing physical properties are foundational skills in all sciences.`
      }
    ];
  }

  if (/force|motion|gravity|friction|newton|speed|velocity|acceleration|energy|work|power|simple machine|push|pull|magnetic/.test(lowerTitle) || (/physics/i.test(course) && !/bio|chem|earth/i.test(course))) {
    return [
      {
        heading: 'Forces and Motion',
        body: 'A force is a push or pull on an object. Forces can change the speed, direction, or shape of an object. When forces on an object are balanced, the object stays still or keeps moving at a constant speed. When forces are unbalanced, the object accelerates, slows down, or changes direction. Newton\'s Laws of Motion describe how objects respond to the forces acting on them.'
      },
      {
        heading: 'Types of Forces',
        body: 'Common forces include gravity, which pulls objects toward each other; friction, which resists sliding motion between surfaces; magnetism, which attracts or repels magnetic materials; and applied force, which is any direct push or pull. Air resistance is a type of friction that slows objects moving through air. Each force has a direction and a strength that can be measured in units called newtons.'
      },
      {
        heading: 'Energy and Work',
        body: 'Energy is the ability to cause a change. Work is done when a force moves an object across a distance. Kinetic energy is the energy of moving objects, and potential energy is stored energy. When a ball rolls down a hill, potential energy converts to kinetic energy. Energy cannot be created or destroyed, only transformed from one type to another. This is the law of conservation of energy.'
      },
      {
        heading: 'Simple Machines',
        body: 'Simple machines make work easier by changing the direction or size of a force. The six classic simple machines are the lever, wheel and axle, pulley, inclined plane, wedge, and screw. A ramp makes it easier to lift a heavy object because it spreads the effort across a longer distance. Complex machines, like bicycles and cranes, combine simple machines to accomplish larger tasks.'
      },
      {
        heading: 'Real-World Connection',
        body: `Forces and energy are at work in everything from throwing a ball to launching a spacecraft. In ${region}, engineers use these principles to design safe buildings, vehicles, bridges, and sports equipment. Understanding how forces work helps you explain why things move, why some surfaces are slippery, and why seatbelts save lives.`
      }
    ];
  }

  if (/ecosystem|food web|food chain|organism|habitat|biome|adaptation|evolution|natural selection|cell|photosynthesis|respiration|living|plant|animal|genetics|heredity|dna|species|classification/.test(lowerTitle) || /biology|life science/i.test(course)) {
    return [
      {
        heading: 'Living Things and Their Needs',
        body: 'All living things share certain characteristics. They grow, reproduce, respond to their environment, and use energy. Living things need water, nutrients, and an energy source to survive. Plants get energy from sunlight through photosynthesis, converting carbon dioxide and water into sugar and oxygen. Animals get energy by eating plants or other animals. These relationships connect every living thing in an ecosystem.'
      },
      {
        heading: 'Cells: The Building Blocks of Life',
        body: 'All living organisms are made of cells, which are the smallest units of life. Some organisms, like bacteria, are made of just one cell. Others, like humans, are made of trillions of specialized cells. Every cell contains genetic material in the form of DNA, which carries the instructions for building and running the organism. The cell membrane controls what enters and exits the cell, while the nucleus directs cellular activity.'
      },
      {
        heading: 'Ecosystems and Food Webs',
        body: 'An ecosystem is a community of living organisms interacting with each other and with their non-living environment, including sunlight, water, soil, and air. Energy flows through ecosystems along food chains and food webs. Producers like plants make their own food; consumers eat other organisms; and decomposers break down dead matter and return nutrients to the soil. Removing any part of a food web affects the whole system.'
      },
      {
        heading: 'Adaptations and Survival',
        body: 'Adaptations are features of an organism that help it survive in its environment. A cactus stores water in its thick stem to survive dry deserts. A polar bear has thick fur and a layer of fat to stay warm in the Arctic. Camouflage helps prey animals avoid predators. Over many generations, natural selection causes organisms with helpful traits to reproduce more, gradually changing the characteristics of a population.'
      },
      {
        heading: 'Real-World Connection',
        body: `Understanding life science helps people protect species, manage farmland, develop medicines, and respond to environmental change. In ${region}, local ecosystems provide clean air, fresh water, and food. When ecosystems are disrupted by pollution or habitat loss, all the organisms in them including humans are affected. Science helps us understand these connections and make better decisions about protecting the natural world.`
      }
    ];
  }

  if (/earth|rock|mineral|soil|weather|climate|atmosphere|water cycle|erosion|plate tectonic|volcano|earthquake|fossil|layer|space|planet|star|solar system|moon|universe/.test(lowerTitle) || /earth science|geology|astronomy/i.test(course)) {
    return [
      {
        heading: 'Earth\'s Structure and Systems',
        body: 'Earth is made up of several layers: the inner core, outer core, mantle, and crust. The crust is the thin outer shell where humans live. Beneath it, the mantle is made of hot, slow-moving rock. Earth\'s surface is divided into large pieces called tectonic plates that move slowly over millions of years. When plates collide or separate, they create mountains, earthquakes, volcanoes, and ocean trenches.'
      },
      {
        heading: 'Rocks, Minerals, and the Rock Cycle',
        body: 'Rocks are made of one or more minerals, which are natural solid substances with a specific chemical composition. There are three types of rocks: igneous rocks form when magma or lava cools; sedimentary rocks form when layers of sediment are compressed over time; and metamorphic rocks form when heat and pressure change existing rocks. These types can transform from one to another through the rock cycle over millions of years.'
      },
      {
        heading: 'Weather and the Water Cycle',
        body: 'Weather is the short-term condition of the atmosphere, including temperature, humidity, wind, and precipitation. Climate is the average weather pattern of a region over many years. The water cycle moves water between the ocean, atmosphere, land, and living things through evaporation, condensation, and precipitation. This cycle distributes fresh water across the planet and drives many weather patterns.'
      },
      {
        heading: 'Earth, Moon, and Solar System',
        body: 'Earth is the third planet from the Sun in our solar system. It orbits the Sun once each year and rotates on its axis once every 24 hours, creating day and night. The Moon orbits Earth, causing tides and the phases of the moon we see each night. Our solar system also includes seven other planets, dwarf planets, moons, asteroids, and comets. Beyond our solar system are billions of other stars and galaxies in the universe.'
      },
      {
        heading: 'Real-World Connection',
        body: `Earth science knowledge helps communities in ${region} prepare for natural events like earthquakes, hurricanes, floods, and droughts. Understanding climate patterns helps farmers plan crops. Knowing how rocks and minerals form helps engineers find building materials and energy resources. Earth science connects everyday decisions to processes that have shaped our planet for billions of years.`
      }
    ];
  }

  if (/fraction|ratio|proportion|percent|number|integer|equation|algebra|variable|expression|inequality|linear|function|geometry|area|volume|angle|triangle|quadrilateral|coordinate|statistic|probability|graph|data/.test(lowerTitle) || /math|algebra|geometry|calculus|statistics/i.test(course)) {
    return [
      {
        heading: 'Understanding the Concept',
        body: `${title} is a mathematical idea that builds on number sense, patterns, and logical reasoning. In mathematics, every concept connects to others you have already learned. Understanding definitions is a starting point, but the real goal is to recognize when and how to apply the idea, explain your reasoning, and check whether an answer makes sense.`
      },
      {
        heading: 'Key Vocabulary and Notation',
        body: 'Mathematics uses precise vocabulary and symbols so that ideas can be communicated without confusion. When learning a new math concept, study the vocabulary carefully. Knowing the difference between related terms helps you read problems accurately and write clear explanations. Notation, such as fractions, exponents, or coordinate notation, is a shorthand that lets mathematicians express complex ideas efficiently.'
      },
      {
        heading: 'Strategies and Procedures',
        body: 'A strategy is a general approach to solving a type of problem. A procedure is a specific step-by-step method. Good mathematicians know multiple strategies so they can choose the one that fits the problem best. Estimation is a powerful tool — if an answer seems unreasonably large or small, check your work. Show each step clearly so your reasoning can be followed and any error can be found and corrected.'
      },
      {
        heading: 'Worked Example',
        body: `The best way to understand ${title.toLowerCase()} is to study a worked example carefully, identifying what was done in each step and why. Then try a similar problem on your own. Compare your approach to the example. If your answer differs, work backward to find where the solutions diverged. Learning from mistakes is one of the most effective ways to build mathematical understanding.`
      },
      {
        heading: 'Real-World Connection',
        body: `Mathematics appears in every career and every aspect of daily life in ${region}. ${title} specifically connects to situations involving measurement, design, finance, data analysis, planning, or scientific reasoning. When you understand how a mathematical idea works, you gain a tool that can be applied in many different settings and problems that you have not seen before.`
      }
    ];
  }

  if (/history|civilization|empire|war|revolution|independence|democracy|government|constitution|rights|civil|slavery|colonialism|ancient|medieval|colonial|world war|cold war/.test(lowerTitle) || /history|civics|government|social studies/i.test(course)) {
    return [
      {
        heading: 'Historical Context',
        body: `${title} refers to an important period, event, or development in history. To understand history, you need to understand the context — the time, place, and circumstances that shaped what happened. Events do not occur in isolation. They are caused by earlier decisions, conflicts, economic conditions, cultural beliefs, and the actions of individuals and groups. Identifying this context is the first step to understanding why history unfolded the way it did.`
      },
      {
        heading: 'Key People and Events',
        body: 'History is shaped by the actions of many people, not just famous leaders. Ordinary people — farmers, soldiers, merchants, enslaved people, women, and children — also influenced major events. When studying a historical period, identify who was involved, what they wanted, what obstacles they faced, and what choices they made. Consider whose voices are well documented and whose are missing or underrepresented in the historical record.'
      },
      {
        heading: 'Causes and Consequences',
        body: 'Historical events have both immediate causes, which are the direct triggers, and long-term causes, which are deeper underlying factors that built up over time. Similarly, events produce both short-term and long-term consequences. The consequences of one event often become the causes of the next. Building this chain of cause and effect helps you understand how historical periods connect and why the past matters to the present.'
      },
      {
        heading: 'Multiple Perspectives',
        body: 'A single historical event is experienced differently by different people. A war, a revolution, or a government policy may be seen as a victory by one group and a catastrophe by another. Reading multiple primary and secondary sources, including documents, letters, speeches, and images from the period, helps historians build a more complete and accurate picture. Strong historical thinking means evaluating sources and recognizing bias and point of view.'
      },
      {
        heading: 'Real-World Connection',
        body: `Understanding ${title.toLowerCase()} helps explain why societies in ${region} and around the world are organized the way they are today. Laws, borders, cultural traditions, economic systems, and political institutions all have historical roots. Studying the past does not just help you understand where we came from — it equips you to make more informed decisions about where society is headed.`
      }
    ];
  }

  if (/reading|literature|story|character|plot|theme|author|text|passage|comprehension|poetry|figurative|metaphor|genre|narrative|writing|grammar|sentence|paragraph|essay|argument|claim|evidence/.test(lowerTitle) || /english|ela|reading|writing|language arts|literature/i.test(course)) {
    const isPoetry    = /poem|poet|poetry|verse|rhyme|stanza/.test(lowerTitle);
    const isGrammar   = /grammar|punctuation|sentence|verb|noun|adjective|adverb|subject|predicate/.test(lowerTitle);
    const isWriting   = /essay|argument|claim|evidence|persuasive|expository|narrative writing|draft|revision/.test(lowerTitle);
    const isFigurative = /figurative|metaphor|simile|personification|alliteration|imagery|symbolism/.test(lowerTitle);
    const isCharacter = /character|protagonist|antagonist|point of view|narrator|voice/.test(lowerTitle);

    const passageLabel = isPoetry ? 'Poem' : isGrammar ? 'Model Paragraph' : isWriting ? 'Sample Argument' : 'Story Passage';

    const storyPassage = isPoetry
      ? `"The old oak stands like a sentinel,\nIts branches — arms stretched wide.\nEach ring a year it cannot tell,\nEach leaf a story, worn inside.\nThe wind asks questions it will not answer.\nThe roots hold answers no one hears."\n\nAs you read this poem, notice how the poet compares the tree to a sentinel — a guard standing watch. The branches become arms. The rings inside the trunk become years of lived experience. This kind of comparison, where one thing is given the qualities of something else, is what makes poetry feel alive. The best poems do not just describe — they transform ordinary things into something you see in a new way.`
      : isGrammar
      ? `Read this passage carefully:\n\n"Maria runs every morning before school. She sets her alarm for 5:30, laces up her shoes, and steps into the cool air. The neighborhood sleeps while she moves through the quiet streets. Some mornings are hard. But she runs anyway."\n\nEvery sentence here follows a clear structure: a subject acts, and a verb shows the action. Short sentences like "But she runs anyway" carry enormous weight because of their simplicity. Varied sentence length — mixing short punchy sentences with longer, flowing ones — keeps readers engaged. Correct structure is not just a grammar rule; it is how writers control pace, emphasis, and meaning.`
      : isFigurative
      ? `Read this short passage:\n\n"The classroom was a beehive the moment the announcement ended. Students buzzed from desk to desk, voices climbing over each other. Excitement flew through the air like electricity — you could almost feel it on your skin. Even the walls seemed to hum with the news."\n\nThis writer uses figurative language to bring the scene alive. "The classroom was a beehive" is a metaphor — a direct comparison that says one thing IS another, not just like another. "Excitement flew through the air like electricity" is a simile — a comparison using like or as. These devices do more than describe a room; they create a feeling that the reader can almost experience. That is the purpose of figurative language: to close the distance between words on a page and real experience.`
      : isWriting
      ? `Read this model argument:\n\n"Schools should start later in the morning. Research shows that teenagers need eight to ten hours of sleep each night to learn and grow effectively, yet most schools begin before 8 a.m. When students are consistently sleep-deprived, test scores fall, attention drops, absences increase, and mental health suffers. A later start time is not a convenience — it is a decision backed by decades of scientific evidence. The question is not whether we can afford to change. The question is whether we can afford not to."\n\nNotice how this argument is structured: a clear claim opens the paragraph, evidence follows immediately, the consequences of the problem are explained, and the conclusion reframes the issue as urgent. Every sentence has a job. Nothing is wasted. This is what strong academic writing looks like — purposeful, supported, and persuasive.`
      : isCharacter
      ? `Read this passage:\n\n"Amara did not speak in class for the first three weeks. She sat near the window, watching everything, filling a small green notebook with observations nobody else thought to make. Nobody asked why she was quiet. Then one afternoon, the teacher posed a question that stumped the entire room. After a long silence, Amara slowly raised her hand. What she said made everyone rethink the problem from the beginning."\n\nAmara is revealed through her actions, not through a list of personality traits. This is called indirect characterization — the author shows the character behaving, and you infer who she is. Her silence is not passivity; it is attention. Her notebook suggests she is a careful thinker. Her eventual answer changes the room. A strong reader asks: What do this character's choices reveal about what she values and how she sees the world?`
      : `Read this short passage:\n\n"The first time Kofi read the letter, he did not understand it. The second time, he sat very still. The third time, he folded it carefully, tucked it into his jacket pocket, and walked out the door without saying a word to anyone. Something had shifted — not in the world, but in him. The street looked the same. The sky was the same pale grey. But Kofi was not the person who had walked in an hour earlier."\n\nThis passage does a great deal with very little. The repetition of "the first time… the second time… the third time" builds tension deliberately, letting the reader feel the weight increasing with each reading. The physical details — sitting still, folding the letter carefully — show emotion without naming it. The contrast between the unchanged world and the changed person tells us this is a turning point. Strong readers pause at moments like this and ask: What just happened? What does this reveal? What will happen next?`;

    return [
      {
        heading: `Read This ${passageLabel}`,
        body: storyPassage
      },
      {
        heading: 'What Makes It Work',
        body: `${title} is the skill at the center of this lesson. When you study language and literature, the goal is not just to identify terms — it is to understand why authors make the choices they do and what those choices create in the reader. Every technique exists because it does something a simpler version of the writing could not do. Your job as a careful reader is to notice those choices and explain their effect.`
      },
      {
        heading: 'Going Deeper: Annotate the Text',
        body: `Go back and re-read the passage above. Mark specific words or phrases that stand out. Ask yourself: Why did the author choose this word and not a simpler one? What image or feeling does this sentence create? What would be lost if this line were removed? When you write your observations in the margin of a text — a practice called annotation — you begin thinking like a writer yourself. Strong readers leave tracks of their thinking.`
      },
      {
        heading: 'Try It Yourself',
        body: `Understanding ${title.toLowerCase()} means being able to use it, not just recognize it. After studying the example above, try writing your own version: a sentence, a short paragraph, or a few lines that use the same technique. Your first attempt does not need to be polished. The act of trying, then reading it back and revising, is exactly how writers learn to control language and make deliberate choices.`
      },
      {
        heading: 'Real-World Connection',
        body: `Language shapes how people understand the world, persuade others, tell their stories, and preserve their cultures. In ${region} and beyond, the ability to read critically and write with clarity and purpose opens doors in every field — law, journalism, medicine, engineering, business, and the arts. What you practice in this lesson is not just school work; it is a tool you will use for the rest of your life.`
      }
    ];
  }

  if (/coding|program|algorithm|function|variable|loop|condition|sequence|debug|computer science|app|software|game|web/.test(lowerTitle) || /computer science|coding|programming|game development/i.test(course)) {
    return [
      {
        heading: 'What Is Computer Science?',
        body: 'Computer science is the study of computation — how problems can be solved using algorithms, data, and programs. An algorithm is a precise, step-by-step procedure for solving a problem. Algorithms are at the heart of every computer program, every search engine, and every app on your phone. Computer science is both a creative discipline and a rigorous one, combining logic, mathematics, and design.'
      },
      {
        heading: 'Core Programming Concepts',
        body: 'Every program is built from a small set of core concepts. A sequence is a series of instructions executed in order. A condition allows a program to make decisions using if/then logic. A loop repeats a set of instructions multiple times. A variable stores a value that can change as the program runs. Functions are reusable blocks of code that perform specific tasks. Understanding these concepts lets you read and write programs in almost any language.'
      },
      {
        heading: 'Algorithms and Problem Solving',
        body: 'Before writing code, a good programmer thinks carefully about the problem. What information do I have? What result do I need? What steps will transform the input into the output? Breaking a large problem into smaller sub-problems is called decomposition. Looking for patterns that repeat helps you avoid writing the same code twice. Testing each part before combining everything reduces errors and makes debugging easier.'
      },
      {
        heading: 'Debugging and Iteration',
        body: 'Even experienced programmers make mistakes. A bug is an error in code that causes unexpected behavior. Debugging is the process of finding and fixing bugs systematically. Good debugging means reading error messages carefully, testing small sections of code at a time, and checking whether each variable holds the expected value. Programs are almost never finished on the first try — iteration, meaning revising and improving, is a normal and essential part of programming.'
      },
      {
        heading: 'Real-World Connection',
        body: `Software runs nearly every modern system in ${region} and around the world: hospitals, banks, schools, transportation networks, and communication platforms. Understanding how programs work makes you a more informed and capable citizen in a digital world. Coding skills open paths to careers in technology, science, business, design, and many other fields that did not even exist a generation ago.`
      }
    ];
  }

  if (/health|nutrition|fitness|wellness|exercise|mental health|body|disease|immune|hygiene|substance|drug|first aid|safety/.test(lowerTitle) || /health|physical education/i.test(course)) {
    return [
      {
        heading: 'Why Health Education Matters',
        body: `${title} is a health and wellness concept that affects daily life, physical wellbeing, and long-term outcomes. Good health is not just the absence of illness — it includes physical fitness, mental and emotional wellbeing, healthy relationships, and informed decision-making. Learning about health gives you knowledge and skills to take care of yourself and support others.`
      },
      {
        heading: 'Key Health Concepts',
        body: 'The body is a complex system where different parts work together. The choices you make about food, sleep, exercise, hygiene, and stress management directly affect how your body and mind function. Understanding how the body works helps you recognize when something is wrong, respond to illness or injury, and build habits that protect your health over time.'
      },
      {
        heading: 'Mental and Emotional Health',
        body: 'Mental health is just as important as physical health. Emotions like stress, anxiety, and sadness are normal, but they should be managed rather than ignored. Healthy coping strategies include talking to a trusted person, exercising, getting enough sleep, and practicing mindfulness. Knowing when to ask for help is a sign of strength, not weakness. Emotional regulation skills learned early in life have lasting benefits.'
      },
      {
        heading: 'Making Healthy Decisions',
        body: 'Good health decisions require accurate information, the ability to think through consequences, and the confidence to act on what you know. Advertising, peer pressure, and misinformation can all influence health decisions. Learning to evaluate sources of health information critically — asking who produced the message, what evidence it cites, and what it might be leaving out — is an essential skill for lifelong wellbeing.'
      },
      {
        heading: 'Real-World Connection',
        body: `In ${region} and around the world, access to clean water, nutritious food, safe spaces to exercise, and mental health support varies widely. Understanding health concepts helps you advocate for your own wellbeing and the wellbeing of your community. Public health decisions — from vaccination policies to city park design — are shaped by the same scientific knowledge you are studying now.`
      }
    ];
  }

  if (/art|music|draw|paint|sculpt|design|create|composition|color|rhythm|melody|harmony|visual|perform|creative|expression/.test(lowerTitle) || /art|music|creative/i.test(course)) {
    return [
      {
        heading: 'The Purpose of Art and Creative Expression',
        body: `${title} is a concept in the arts that involves creating, analyzing, or responding to works of art, music, or creative expression. The arts allow humans to communicate ideas, emotions, and experiences that cannot always be expressed in words. Every artwork is the result of deliberate choices — choices about form, color, sound, movement, and meaning. Understanding these choices is the foundation of arts education.`
      },
      {
        heading: 'Elements and Principles',
        body: 'Art, music, and design are built from fundamental elements. In visual art, these include line, shape, color, value, texture, form, and space. In music, they include melody, harmony, rhythm, tempo, and dynamics. Principles such as balance, contrast, repetition, and unity describe how elements are arranged and combined. Learning these elements gives you a shared vocabulary for discussing and creating artistic works.'
      },
      {
        heading: 'Creative Process',
        body: 'Creating art is a process that involves exploration, decision-making, and revision. Artists and musicians do not always know exactly what their finished work will look like when they begin. They experiment, make mistakes, try new approaches, and refine their ideas over time. The willingness to explore and revise is more important than technical perfection. Reflection — thinking carefully about your choices and their effects — is essential to artistic growth.'
      },
      {
        heading: 'Responding to Art',
        body: 'Understanding and responding to art means more than saying whether you like something. It involves describing what you observe, analyzing the choices the artist made, interpreting what the work communicates, and evaluating how effectively it achieves its purpose. This kind of thoughtful response deepens your experience of art and helps you develop your own aesthetic sensibilities and creative voice.'
      },
      {
        heading: 'Real-World Connection',
        body: `The arts are present in every culture and every era of human history. In ${region} and around the world, art, music, and design shape public spaces, cultural identity, political movements, and everyday products. Careers in graphic design, film, architecture, advertising, game development, and performance all draw on artistic knowledge and skill. The creative thinking cultivated by arts education is valuable in every field.`
      }
    ];
  }

  // Generic fallback — narrative, story-driven approach
  return [
    {
      heading: 'The Big Idea',
      body: `Imagine you need to explain ${title.toLowerCase()} to a friend who has never heard of it. Where would you start? You would probably describe what it is, show them an example, and then explain why it matters. That structure — what it is, what it looks like in practice, and why it is worth knowing — is exactly how experts think about any important concept. By the end of this lesson, you should be able to do all three clearly and confidently.`
    },
    {
      heading: 'How It Works',
      body: `${title} is not just a definition to memorize — it is an idea with a logic to it. As you study it, look for the pattern underneath: What are its key parts? How do those parts work together? What happens when you apply it to a new situation? Understanding the structure of a concept is what allows you to use it flexibly, not just repeat it back. Ask yourself: if one part changed, what else would change? That kind of questioning turns surface knowledge into real understanding.`
    },
    {
      heading: 'A Closer Look',
      body: `Think about a specific, real example of ${title.toLowerCase()} — something you might actually encounter in ${region} or in your daily life. Picture the situation clearly: who is involved, what is happening, and what decision or outcome depends on this concept. The more specific your example, the more clearly it shows that you can recognize the idea outside the textbook. Generic examples prove you memorized something. Specific examples prove you understood it.`
    },
    {
      heading: 'What Goes Wrong — and Why',
      body: `Most learners make a few predictable mistakes when first studying ${title.toLowerCase()}. They confuse it with a related concept. They apply it too broadly or too narrowly. They can recite a definition but cannot explain the reasoning behind it. The way to avoid these mistakes is to practice explaining the concept in more than one way — in words, in examples, in comparison to something else — until you can answer questions you have never seen before. That flexibility is what mastery looks like.`
    },
    {
      heading: 'Showing What You Know',
      body: `To demonstrate real understanding of ${title.toLowerCase()}, the strongest response goes beyond repeating information. Explain the reasoning behind it. Give an example from ${region} or another real context and describe why it fits. Compare two situations or interpretations and explain which is stronger and why. Identify one mistake someone might make and show how to correct it. The standard for genuine mastery is not whether you can recall — it is whether you can think with what you have learned.`
    }
  ];
};

const buildStudentLessonArticle = (lesson, topic) => {
  const content = String(lesson?.content || '');
  const lines = content.split('\n').map(stripLessonMarkdown).filter(Boolean);
  const title = lesson?.title || topic || 'Today\'s Lesson';
  const goals = extractLessonBullets(content, /^(learning objectives?|lesson goals?|objectives?)\b/i);
  const vocabulary = extractLessonBullets(content, /^(vocabulary|key vocabulary|words to know|concepts?)\b/i);
  const readingLines = [];

  for (const line of lines) {
    if (isMetadataLine(line)) continue;
    if (isTeacherOnlyLine(line)) break;
    if (/^(learning objectives?|objectives?|standards alignment|vocabulary|key vocabulary|materials?)\b/i.test(line)) continue;
    if (/^[A-Z][A-Za-z\s/&-]{2,}:$/.test(line)) continue;
    if (line.length < 30 && readingLines.length) continue;
    readingLines.push(line);
    if (readingLines.join(' ').length > 1800) break;
  }

  const isTemplateLine = (line) => {
    const cleaned = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[a-z][\.\)]\s*/i, '').replace(/^[-•*]\s*/, '').trim();
    return /^(define and use|explain the concept|complete a short performance task|big idea|note to teacher|teacher note|teacher only|for the teacher|learning outcome|by the end of|students will be able|you will learn|lesson overview|essential question)\b/i.test(cleaned);
  };
  const weakReading = readingLines.length < 4 || readingLines.some(isTemplateLine);
  const generatedSections = buildStudentReadingSections(lesson, topic);

  return {
    title,
    goal: goals[0] || `Understand ${title.toLowerCase()} well enough to explain it, apply it, and support your thinking with evidence.`,
    concepts: (vocabulary.length ? vocabulary : goals.slice(0, 4)).slice(0, 4),
    sections: weakReading
      ? generatedSections
      : readingLines.slice(0, 8).map((line, index) => ({
          heading: index === 0 ? 'Lesson Reading' : `Part ${index + 1}`,
          body: line
        }))
  };
};

const StudentLessonArticle = ({ lesson, topic }) => {
  const article = buildStudentLessonArticle(lesson, topic);
  const readAloudText = [
    `Lesson for students: ${article.title}.`,
    `Learning goal: ${article.goal}`,
    ...article.concepts.map((concept) => `Key concept: ${concept}`),
    ...article.sections.map((section) => `${section.heading}. ${section.body}`)
  ].join(' ');
  return (
    <article className="student-lesson-article" aria-labelledby="student-lesson-heading">
      <div className="student-lesson-kicker">Student Lesson</div>
      <h2 id="student-lesson-heading">Lesson for Students</h2>
      <AccessibleReadAloud text={readAloudText} label="student lesson" />
      <h3 className="student-lesson-title">{article.title}</h3>
      <div className="student-learning-goal">
        <span>Learning goal</span>
        <p>{article.goal}</p>
      </div>
      {article.concepts.length > 0 && (
        <div className="student-concepts">
          <h3>Key Concepts</h3>
          <div>
            {article.concepts.map((concept) => <span key={concept}>{concept}</span>)}
          </div>
        </div>
      )}
      <div className="student-reading">
        <h3>Read and Learn</h3>
        {article.sections.map((section, index) => (
          <section key={`${section.heading}-${index}`} className="student-reading-section">
            <h4>{section.heading}</h4>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
};

const ClassActivities = ({ lesson, topic, onOpenWhiteboard, onAwardPoints, onTrack }) => {
  const activities = buildClassActivities(lesson, topic);
  const [pollChoice, setPollChoice] = useState('');
  const [matched, setMatched] = useState({});
  const [exitText, setExitText] = useState('');
  const matchComplete = Object.keys(matched).length >= activities.matchGame.terms.length;

  const completeActivity = (activityType, points = 10) => {
    onTrack?.('activity_complete', { activityType, topic: lesson?.title || topic });
    onAwardPoints(points);
  };

  return (
    <section className="class-activities-panel">
      <div className="teacher-script-heading">
        <span>Class activities</span>
        <h2>Make this lesson interactive</h2>
        <p>Quick activities students can do in pairs, groups, on the whiteboard, or as an exit check.</p>
      </div>

      <div className="activity-grid">
        <article className="activity-card">
          <div className="activity-card-head">
            <Users size={18} />
            <h3>{activities.thinkPairShare.title}</h3>
          </div>
          <p>{activities.thinkPairShare.prompt}</p>
          <div className="activity-chip-row">
            {activities.thinkPairShare.steps.map((step) => <span key={step}>{step}</span>)}
          </div>
          <button type="button" onClick={() => { onOpenWhiteboard(activities.thinkPairShare.prompt); onTrack?.('activity_whiteboard_open', { activityType: 'think_pair_share', topic }); }}>
            Send to Whiteboard
          </button>
        </article>

        <article className="activity-card">
          <div className="activity-card-head">
            <BarChart3 size={18} />
            <h3>{activities.quickPoll.title}</h3>
          </div>
          <p>{activities.quickPoll.question}</p>
          <div className="quick-poll-options">
            {activities.quickPoll.options.map((option) => (
              <button
                key={option}
                type="button"
                className={pollChoice === option ? 'is-active' : ''}
                onClick={() => {
                  setPollChoice(option);
                  onTrack?.('activity_poll_vote', { option, topic: lesson?.title || topic });
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </article>

        <article className="activity-card">
          <div className="activity-card-head">
            <Copy size={18} />
            <h3>{activities.matchGame.title}</h3>
          </div>
          <div className="match-game">
            {activities.matchGame.terms.map((item, index) => (
              <button
                key={item.term}
                type="button"
                className={matched[item.term] ? 'is-matched' : ''}
                onClick={() => {
                  setMatched((current) => ({ ...current, [item.term]: true }));
                  if (index === activities.matchGame.terms.length - 1) completeActivity('vocabulary_match', 15);
                }}
              >
                <strong>{item.term}</strong>
                <span>{item.definition}</span>
              </button>
            ))}
          </div>
          {matchComplete && <small>Matched. Nice work.</small>}
        </article>

        <article className="activity-card">
          <div className="activity-card-head">
            <CheckCircle size={18} />
            <h3>{activities.exitTicket.title}</h3>
          </div>
          <p>{activities.exitTicket.prompt}</p>
          <textarea
            value={exitText}
            onChange={(event) => setExitText(event.target.value)}
            placeholder="Write the exit ticket response..."
          />
          <button type="button" onClick={() => completeActivity('exit_ticket', 10)} disabled={!exitText.trim()}>
            Save Exit Ticket
          </button>
        </article>

        <article className="activity-card">
          <div className="activity-card-head">
            <Trophy size={18} />
            <h3>{activities.challenge.title}</h3>
          </div>
          <p>{activities.challenge.prompt}</p>
          <button type="button" onClick={() => { onOpenWhiteboard(activities.challenge.prompt); onTrack?.('activity_whiteboard_open', { activityType: 'mini_challenge', topic }); }}>
            Build on Whiteboard
          </button>
        </article>
      </div>
    </section>
  );
};

const LessonVideoPlayer = ({ lesson, topic, lessonImages }) => {
  const title = lesson?.title || topic || '';
  const grade = lesson?.grade || '';
  const course = lesson?.course || '';
  const country = lesson?.country || '';
  const language = lesson?.language || 'English';
  const prebakedVideoId = lesson?.media?.videoId || extractYouTubeVideoId(lesson?.media?.video);
  const studentSections = buildStudentReadingSections(lesson, topic);
  const segments = [
    {
      eyebrow: 'Introduction',
      heading: title,
      body: cleanLessonText(lesson?.hook || `Let's explore ${title} together. This lesson will walk you through the key ideas, real-world connections, and ways to show what you know.`)
    },
    ...studentSections.slice(0, 5).map((s) => ({ eyebrow: 'Key Concept', heading: s.heading, body: s.body }))
  ];

  // YouTube embed state
  const [videoId, setVideoId] = useState(null);
  const [videoState, setVideoState] = useState('loading'); // 'loading' | 'ready' | 'error' | 'unavailable'
  const [tab, setTab] = useState('watch'); // 'watch' | 'videos' | 'narrate'

  // TTS state
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [segIdx, setSegIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [voicesReady, setVoicesReady] = useState(false);
  const utteranceRef = useRef(null);
  const progressAnimRef = useRef(null);
  const progressStartRef = useRef(null);
  const keepAliveRef = useRef(null);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Fetch YouTube video ──────────────────────────────────────
  useEffect(() => {
    if (!title) return;
    if (prebakedVideoId) {
      setVideoId(prebakedVideoId);
      setVideoState('ready');
      return;
    }
    const q = `${grade} ${course} ${title} explained for students`.trim();
    const cacheKey = `lvp_yt_v2_${language}_${country}_${grade}_${course}_${title}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { id, ts } = JSON.parse(raw);
        if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) {
          setVideoId(id); setVideoState('ready'); return;
        }
      }
    } catch (_) { /* ignore */ }

    const params = new URLSearchParams({
      q,
      topic: title,
      course,
      grade,
      country,
      language
    });
    fetch(`${API_BASE}/api/youtube-video?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.videoId) {
          setVideoId(data.videoId);
          setVideoState('ready');
          try { localStorage.setItem(cacheKey, JSON.stringify({ id: data.videoId, ts: Date.now() })); } catch (_) { /* ignore */ }
        } else {
          setVideoState('unavailable');
          setTab('narrate');
        }
      })
      .catch(() => { setVideoState('unavailable'); setTab('narrate'); });
  }, [title, grade, course, country, language, prebakedVideoId]);

  // ── TTS helpers ──────────────────────────────────────────────
  useEffect(() => {
    if (!canSpeak) return;
    const load = () => setVoicesReady(window.speechSynthesis.getVoices().length > 0);
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [canSpeak]);

  const stopAnimation = () => { if (progressAnimRef.current) cancelAnimationFrame(progressAnimRef.current); };
  const clearKeepAlive = () => { if (keepAliveRef.current) clearInterval(keepAliveRef.current); };

  const animateProgress = (startPct, endPct, durationMs) => {
    stopAnimation();
    progressStartRef.current = performance.now();
    const tick = (now) => {
      const t = Math.min((now - progressStartRef.current) / durationMs, 1);
      setProgress(startPct + (endPct - startPct) * t);
      if (t < 1) progressAnimRef.current = requestAnimationFrame(tick);
    };
    progressAnimRef.current = requestAnimationFrame(tick);
  };

  const speakSegment = (index) => {
    if (!canSpeak || index >= segments.length) {
      stopAnimation(); clearKeepAlive(); setPlaying(false); setPaused(false); return;
    }
    window.speechSynthesis.cancel();
    setSegIdx(index);
    const text = cleanLessonText(`${segments[index].heading}. ${segments[index].body}`);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.88;
    utterance.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const engVoice = voices.find((v) => v.lang.startsWith('en-') && !v.name.toLowerCase().includes('zira'))
      || voices.find((v) => v.lang.startsWith('en')) || voices[0];
    if (engVoice) utterance.voice = engVoice;
    const estimatedMs = (text.split(/\s+/).length / 2.4) * 1000;
    utteranceRef.current = utterance;
    utterance.onstart = () => {
      animateProgress((index / segments.length) * 100, ((index + 1) / segments.length) * 100, estimatedMs);
      clearKeepAlive();
      keepAliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
      }, 10000);
    };
    utterance.onend = () => {
      clearKeepAlive();
      if (index + 1 < segments.length) { speakSegment(index + 1); }
      else { stopAnimation(); setProgress(100); setPlaying(false); setPaused(false); setSegIdx(0); setTimeout(() => setProgress(0), 2200); }
    };
    utterance.onerror = (e) => { if (e.error === 'interrupted') return; clearKeepAlive(); stopAnimation(); setPlaying(false); setPaused(false); };
    setTimeout(() => window.speechSynthesis.speak(utterance), 50);
  };

  const handlePlay = () => { setPlaying(true); setPaused(false); speakSegment(segIdx); };
  const handlePause = () => { if (canSpeak) window.speechSynthesis.pause(); clearKeepAlive(); stopAnimation(); setPlaying(false); setPaused(true); };
  const handleResume = () => { if (canSpeak) window.speechSynthesis.resume(); setPlaying(true); setPaused(false); animateProgress(progress, ((segIdx + 1) / segments.length) * 100, Math.max(((segIdx + 1) / segments.length) * 100 - progress, 1) * 600); };
  const handleStop = () => { if (canSpeak) window.speechSynthesis.cancel(); clearKeepAlive(); stopAnimation(); setPlaying(false); setPaused(false); setSegIdx(0); setProgress(0); };
  const jumpTo = (index) => { if (canSpeak) window.speechSynthesis.cancel(); clearKeepAlive(); stopAnimation(); setPaused(false); setSegIdx(index); setProgress((index / segments.length) * 100); if (playing) speakSegment(index); };

  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); stopAnimation(); clearKeepAlive(); }, []);

  const cur = segments[segIdx] || segments[0];
  const imgSrc = (lessonImages && lessonImages.length > 0)
    ? lessonImages[segIdx % lessonImages.length]
    : 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&q=80';
  const totalWords = segments.reduce((sum, s) => sum + s.body.split(/\s+/).length, 0);
  const totalSecs = Math.round(totalWords / 2.4);
  const durationLabel = `~${Math.floor(totalSecs / 60)}:${String(totalSecs % 60).padStart(2, '0')}`;

  return (
    <div className="lvp-shell">
      {/* Tab bar */}
      <div className="lvp-tabs">
        <button type="button" className={`lvp-tab${tab === 'watch' ? ' is-active' : ''}`} onClick={() => setTab('watch')}>
          <Video size={14} /> Watch
          {videoState === 'loading' && <span className="lvp-tab-badge">…</span>}
          {videoState === 'ready' && <span className="lvp-tab-badge is-live">●</span>}
        </button>
        <button type="button" className={`lvp-tab${tab === 'narrate' ? ' is-active' : ''}`} onClick={() => setTab('narrate')}>
          <Volume2 size={13} /> Listen
        </button>
      </div>

      {/* ── Watch tab ── */}
      {tab === 'watch' && (
        <div className="lvp-embed-wrap">
          {videoState === 'loading' && (
            <div className="lvp-embed-placeholder">
              <span className="lvp-spinner" />
              <p>Finding the best video for this lesson…</p>
            </div>
          )}
          {videoState === 'ready' && videoId && (
            <iframe
              className="lvp-yt-iframe"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&color=white`}
              title={`Video: ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
          {videoState === 'unavailable' && (
            <div className="lvp-embed-placeholder">
              <p>No pre-baked video is available yet. Use the <strong>Listen</strong> tab for the in-course narrated lesson.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Listen tab ── */}
      {tab === 'narrate' && (
        <>
          <div className="lvp-screen">
            <img src={imgSrc} alt="" className="lvp-bg-img"
              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1200&q=80'; }} />
            <div className="lvp-dim" />
            <div className="lvp-captions">
              <span className="lvp-eyebrow">{cur.eyebrow} · {segIdx + 1} of {segments.length}</span>
              <h3 className="lvp-title">{cur.heading}</h3>
              <p className="lvp-body">{cur.body}</p>
            </div>
            <div className="lvp-controls">
              <div className="lvp-progress-bar"><div className="lvp-progress-fill" style={{ width: `${progress}%` }} /></div>
              <div className="lvp-buttons">
                <button type="button" className="lvp-icon-btn" onClick={handleStop} title="Stop"><Square size={13} /></button>
                {playing
                  ? <button type="button" className="lvp-play-btn" onClick={handlePause}><Pause size={17} /> Pause</button>
                  : paused
                    ? <button type="button" className="lvp-play-btn" onClick={handleResume}><Play size={17} /> Resume</button>
                    : <button type="button" className="lvp-play-btn" onClick={handlePlay}><Play size={17} /> {durationLabel} · Play</button>
                }
                <button type="button" className="lvp-icon-btn" onClick={() => jumpTo((segIdx + 1) % segments.length)} title="Next"><ChevronRight size={16} /></button>
                {canSpeak && !voicesReady && <span className="lvp-no-speech">Loading voices…</span>}
                {!canSpeak && <span className="lvp-no-speech">Use Chrome or Edge for audio</span>}
              </div>
            </div>
          </div>
          <div className="lvp-chapters">
            {segments.map((seg, index) => (
              <button key={`lvp-seg-${index}`} type="button"
                className={`lvp-chapter${index === segIdx ? ' is-active' : ''}`} onClick={() => jumpTo(index)}>
                <span className="lvp-chapter-num">{index + 1}</span>
                <span className="lvp-chapter-title">{seg.heading}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const LessonView = ({ topic, lesson, shareUrl, onBack, error, onAwardPoints, onTrack, onPurchase }) => {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [writtenAnswers, setWrittenAnswers] = useState({});
  const [workLoaded, setWorkLoaded] = useState(false);
  const [showMedia, setShowMedia] = useState(true);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [whiteboardPrompt, setWhiteboardPrompt] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [isLessonCastPlaying, setIsLessonCastPlaying] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const lessonCastSlides = createLessonCastSlides(lesson);
  const lessonCastTranscript = lessonCastSlides
    .map((slide, index) => `Slide ${index + 1}. ${slide.title}. ${slide.narration}`)
    .join(' ');
  const lessonFileBase = slugifyFileName(lesson?.title || topic || 'global-lms-lesson');
  const lessonWorkKey = `globalLmsLessonWork:${lessonFileBase}`;
  const lessonWhiteboardKey = `globalLmsWhiteboard:${lessonFileBase}`;
  const teacherScriptSections = buildTeacherScriptSections(lesson, topic);
  const lessonImages = getLessonImages(lesson, topic);
  const knowledgeCheckQuestions = getHighValueKnowledgeCheck(lesson, topic);
  const copyPortableLesson = () => {
    if (!lesson) return;
    navigator.clipboard.writeText(buildPortableLessonText(lesson, topic));
    alert('Editable Google Classroom / LMS package copied to clipboard.');
  };
  const downloadLessonTxt = () => {
    if (!lesson) return;
    downloadTextFile(`${lessonFileBase}-low-bandwidth.txt`, buildPortableLessonText(lesson, topic));
  };
  const downloadLessonHtml = () => {
    if (!lesson) return;
    downloadTextFile(`${lessonFileBase}-offline.html`, buildOfflineLessonHtml(lesson, topic), 'text/html;charset=utf-8');
  };
  const downloadLessonJson = () => {
    if (!lesson) return;
    downloadTextFile(`${lessonFileBase}-portable.json`, JSON.stringify(lesson, null, 2), 'application/json;charset=utf-8');
  };
  const copyLessonLink = async () => {
    await navigator.clipboard.writeText(shareUrl || buildShareUrl({}, lesson, topic));
    setShareStatus('Link copied');
    window.setTimeout(() => setShareStatus(''), 1600);
  };

  useEffect(() => {
    setActiveSlide(0);
    setIsLessonCastPlaying(false);
  }, [lesson?.title]);

  useEffect(() => {
    setWorkLoaded(false);
    try {
      const saved = JSON.parse(localStorage.getItem(lessonWorkKey) || '{}');
      setSelectedAnswers(saved.selectedAnswers || {});
      setWrittenAnswers(saved.writtenAnswers || {});
    } catch {
      setSelectedAnswers({});
      setWrittenAnswers({});
    }
    setWorkLoaded(true);
  }, [lessonWorkKey]);

  useEffect(() => {
    if (!workLoaded) return;
    localStorage.setItem(lessonWorkKey, JSON.stringify({
      selectedAnswers,
      writtenAnswers,
      savedAt: new Date().toISOString()
    }));
  }, [lessonWorkKey, selectedAnswers, writtenAnswers, workLoaded]);

  useEffect(() => {
    if (!isLessonCastPlaying || lessonCastSlides.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % lessonCastSlides.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [isLessonCastPlaying, lessonCastSlides.length]);

  const handleAnswer = (qIdx, oIdx, isCorrect) => {
    if (selectedAnswers[qIdx] !== undefined) return;
    setSelectedAnswers({...selectedAnswers, [qIdx]: oIdx});
    onTrack?.('quiz_answer', { topic: lesson?.title || topic, questionIndex: qIdx, correct: isCorrect });
    if (isCorrect) onAwardPoints(50);
  };
  const openWhiteboardWithPrompt = (prompt = '') => {
    setShowWhiteboard(true);
    setWhiteboardPrompt(`${Date.now()}|${prompt}`);
  };
  const knowledgeCheck = knowledgeCheckQuestions.length ? (
    <div className="quiz-container">
       <div className="quiz-heading">
         <Trophy className="text-amber-500" size={24} />
         <h3>Knowledge Check</h3>
         <p>10-question DOK 3 check: analyze, justify, compare, transfer, and apply.</p>
       </div>
       {knowledgeCheckQuestions.map((q, qIdx) => (
         <div key={qIdx} className="quiz-question">
           <p className="quiz-question-title">
             {q.question.match(/^\d+\./) ? q.question : `${qIdx + 1}. ${q.question}`}
           </p>
           
           {q.type === 'choice' ? (
             <div className="quiz-options">
               {(Array.isArray(q.options) ? q.options : String(q.options || '').split(/\s{2,}|(?=[A-D]\.\s)/).filter(Boolean)).map((opt, oIdx) => {
                 const isSelected = selectedAnswers[qIdx] === oIdx;
                 const cleanOption = String(opt).replace(/^[A-D]\.\s*/, '').trim();
                 const isCorrect = cleanOption === q.answer?.trim() || String(opt).trim() === q.answer?.trim();
                 let statusClass = "";
                 
                 if (selectedAnswers[qIdx] !== undefined) {
                   if (isCorrect) statusClass = "correct border-green-500 bg-green-50";
                   else if (isSelected) statusClass = "incorrect border-red-500 bg-red-50";
                 } else if (isSelected) {
                   statusClass = "selected border-primary bg-primary/5";
                 }

                 return (
                   <label 
                     key={oIdx} 
                     className={`quiz-option ${statusClass}`}
                   >
                     <input 
                       type="radio" 
                       name={`quiz-${qIdx}`} 
                       checked={isSelected}
                       onChange={() => handleAnswer(qIdx, oIdx, isCorrect)}
                       disabled={selectedAnswers[qIdx] !== undefined}
                     />
                     <span>{cleanOption}</span>
                     {isSelected && isCorrect && <div className="quiz-correct-icon"><CheckCircle size={12} /></div>}
                   </label>
                 );
               })}
             </div>
           ) : (
             <div className="quiz-written">
               <textarea 
                  className="quiz-textarea"
                  placeholder="Write your answer here..."
                  value={writtenAnswers[qIdx] || ''}
                  onChange={(event) => setWrittenAnswers({ ...writtenAnswers, [qIdx]: event.target.value })}
               ></textarea>
               <div className="quiz-submit-row">
                 <button 
                  className="btn-buy" 
                  onClick={() => {
                    onAwardPoints(25);
                    setSelectedAnswers({...selectedAnswers, [qIdx]: true});
                  }}
                  disabled={selectedAnswers[qIdx] !== undefined}
                 >
                  {selectedAnswers[qIdx] !== undefined ? 'Response Saved' : 'Submit Writing'}
                 </button>
               </div>
             </div>
           )}
         </div>
       ))}
    </div>
  ) : null;

  return (
    <div className="container lesson-container">
      <div className="flex justify-between items-center mb-8">
        <button id="btn-back-grid" aria-label="Back to Course Grid" className="lesson-nav-btn" onClick={onBack}>
          <ChevronLeft size={16} />
          Back to Course Grid
        </button>
        
        <div className="lesson-toolbar">
           <button 
            className={`lesson-tool-btn ${showMedia ? '' : 'is-active'}`}
            onClick={() => setShowMedia(!showMedia)}
          >
            {showMedia ? <MonitorOff size={16} /> : <Image size={16} />}
            {showMedia ? 'Hide Media (Print Mode)' : 'Show Media'}
          </button>
          <button className="lesson-tool-btn" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button className="lesson-tool-btn" onClick={copyLessonLink}>
            <Share2 size={16} /> {shareStatus || 'Share Link'}
          </button>
          <button className={`lesson-tool-btn ${showWhiteboard ? 'is-active' : ''}`} onClick={() => {
            setShowWhiteboard((value) => !value);
            onTrack?.('lesson_whiteboard_toggle', { topic: lesson?.title || topic, opening: !showWhiteboard });
          }}>
            <PenTool size={16} /> Whiteboard
          </button>
          {lesson && (
            <>
              <button className="lesson-tool-btn" onClick={downloadLessonTxt}>
                <Download size={16} /> TXT
              </button>
              <button className="lesson-tool-btn" onClick={downloadLessonHtml}>
                <Download size={16} /> Offline HTML
              </button>
            </>
          )}
        </div>
      </div>
      
      {!lesson ? (
        <div className="glass text-center py-20">
          {error ? (
            <div>
              <h2 className="text-2xl font-black mb-4">Continue with a preview or purchase</h2>
              <p className="font-bold mb-4">{error}</p>
              {onPurchase && (
                <GuestPaywall onPurchase={onPurchase} onSignIn={onBack} message={error} />
              )}
              <button className="btn-primary" onClick={onBack}>Back</button>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="font-bold text-slate-600">Retrieving lesson from Global Warehouse...</p>
            </>
          )}
        </div>
      ) : (
        <div className={`lesson-side-by-side ${showWhiteboard ? 'with-board' : ''}`}>
        <div className="glass !p-0 overflow-hidden shadow-2xl border-none lesson-main-panel">
          <div className="lesson-title-panel p-8">
            <div className="flex justify-between items-start mb-4">
              <span className="lesson-status-pill">
                Warehouse Ready | Standards: {lesson.export_metadata?.region || 'Global'}
              </span>
              <div className="flex gap-2">
                <button 
                  id="btn-export-lms"
                  aria-label="Export editable lesson to any LMS"
                  className="lesson-export-btn"
                  onClick={copyPortableLesson}
                >
                  Copy for Any LMS
                </button>
                <button
                  type="button"
                  className="lesson-export-btn"
                  onClick={downloadLessonTxt}
                >
                  Download TXT
                </button>
                <button
                  type="button"
                  className="lesson-export-btn"
                  onClick={downloadLessonJson}
                >
                  Download JSON
                </button>
              </div>
            </div>
            <h1 className="text-4xl font-black mb-2 tracking-tight">{lesson.title}</h1>
            <p className="text-white/80 italic text-lg">{lesson.hook}</p>
            <div className="lesson-portability-strip">
              <span>Editable after purchase</span>
              <span>Google Classroom ready</span>
              <span>Canvas, Moodle, Schoology friendly</span>
              <span>Copy, paste, adapt</span>
            </div>
          </div>

          <StudentLessonArticle lesson={lesson} topic={topic} />

          <LessonVideoPlayer lesson={lesson} topic={topic} lessonImages={lessonImages} />

          <details className="teacher-script-panel teacher-script-collapsible">
            <summary>
              <div className="teacher-script-heading">
                <span>Teacher instructions</span>
                <h2>Teacher Plan (click to open)</h2>
                <p>Closed by default so students see the lesson first. Open this for pacing, prompts, checks for understanding, and closure.</p>
              </div>
            </summary>
            <div className="teacher-script-sections">
              {teacherScriptSections.map((section) => (
                <section key={section.title} className="teacher-script-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>

          <ClassActivities
            lesson={lesson}
            topic={topic}
            onOpenWhiteboard={openWhiteboardWithPrompt}
            onAwardPoints={onAwardPoints}
            onTrack={onTrack}
          />

          {knowledgeCheck}
        </div>
        {showWhiteboard && (
          <aside className="lesson-whiteboard-panel" aria-label="Lesson whiteboard">
            <WhiteboardView compact storageKey={lessonWhiteboardKey} pendingText={whiteboardPrompt} />
          </aside>
        )}
        </div>
      )}
    </div>
  );
};

// --- Main App ---

const CLOUD_RUN_API_BASE = 'https://lms-global-682818593798.us-central1.run.app';
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || (() => {
  const { protocol, hostname, port } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return 'http://localhost:5188';
  if (port === '5173' || port === '4173' || port === '3000') return `${protocol}//${hostname}:5188`;
  if (hostname === 'www.global-lms.org' || hostname === 'global-lms.org' || hostname === 'globallms.org' || hostname === 'www.globallms.org' || hostname.endsWith('.vercel.app')) return CLOUD_RUN_API_BASE;
  return window.location.origin;
})();
const isRealEmail = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@global-lms.local');
const WORKSPACE_TYPES = [
  { value: 'Individual teacher', label: 'Individual teacher' },
  { value: 'Class', label: 'Class' },
  { value: 'Organization', label: 'Organization' }
];
const workspaceSummary = (workspaceType = 'Individual teacher', workspaceName = '') => {
  const name = String(workspaceName || '').trim();
  if (workspaceType === 'Class' && name) return `Class: ${name}`;
  if (workspaceType === 'Organization' && name) return `Organization: ${name}`;
  return workspaceType;
};
const formatCents = (amountCents = 0, currency = 'usd') => {
  const amount = Number(amountCents || 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase()
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};
const getVisitorId = () => {
  const existing = localStorage.getItem('globalLmsVisitorId');
  if (existing) return existing;
  const next = `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem('globalLmsVisitorId', next);
  return next;
};
const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('globalLmsUser')) || null;
  } catch {
    return null;
  }
};

export default function App() {
  const isOwnerMarketingSite = window.location.pathname.includes('owner-growth-desk');
  const [user, setUser] = useState(getStoredUser);
  const [view, setView] = useState(() => {
    if (isOwnerMarketingSite) return 'marketing';
    const fromPath = viewFromPath(window.location.pathname);
    if (fromPath !== 'onboarding') return fromPath;
    const storedUser = getStoredUser();
    return storedUser && isOwnerAdmin(storedUser) ? 'usage' : 'onboarding';
  });
  const [studentData, setStudentData] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [currentTopic, setCurrentTopic] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [planSaveStatus, setPlanSaveStatus] = useState('');
  const [aiBuildStatus, setAiBuildStatus] = useState('');
  const [aiDraftPackage, setAiDraftPackage] = useState(null);
  const [visitorId] = useState(getVisitorId);
  const [guestCheckout, setGuestCheckout] = useState(null);
  const [guestEmail, setGuestEmail] = useState('');
  const sharedPlanRef = useRef(readSharedPlanFromUrl());
  const skipPushRef = useRef(true);

  const saveUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem('globalLmsUser', JSON.stringify(nextUser));
  };

  const navigate = (nextView, { replace = false } = {}) => {
    const path = pathForView(nextView);
    const method = replace ? 'replaceState' : 'pushState';
    if (window.location.pathname !== path) {
      window.history[method]({ view: nextView }, '', path);
    }
    document.title = pageTitleFor(nextView);
    const description = document.querySelector('meta[name="description"]');
    if (description && nextView === 'pricing') {
      description.setAttribute('content', 'Global LMS pricing: $5 per lesson, $10 per unit, $100 per course. Stripe Checkout. 30-day money-back. K-12 warehouse curriculum.');
    }
    setView(nextView);
  };

  const postJson = async (path, body) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.error || 'Request failed');
    return data;
  };

  const trackUsage = async (type, payload = {}) => {
    try {
      await postJson('/api/usage/event', {
        type,
        visitorId,
        email: user?.email,
        role: user?.role,
        name: user?.name,
        path: window.location.pathname,
        ...payload
      });
    } catch (err) {
      console.warn('Usage tracking failed', err);
    }
  };

  useEffect(() => {
    trackUsage('page_view', { path: window.location.pathname });
    document.title = pageTitleFor(view);
    document.documentElement.dataset.build = BUILD_STAMP;
  }, []);

  useEffect(() => {
    const onPop = () => {
      skipPushRef.current = true;
      const next = isOwnerMarketingSite ? 'marketing' : viewFromPath(window.location.pathname);
      setView(next);
      document.title = pageTitleFor(next);
    };
    window.addEventListener('popstate', onPop);
    if (window.location.pathname === '/' && view !== 'onboarding' && !isOwnerMarketingSite) {
      window.history.replaceState({ view }, '', pathForView(view));
    }
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const openMarketplace = () => navigate('marketplace');
    window.addEventListener('global-lms-open-marketplace', openMarketplace);
    return () => window.removeEventListener('global-lms-open-marketplace', openMarketplace);
  }, []);

  const openReadingSample = () => {
    const sample = READING_SAMPLE_LESSON;
    const plan = findSampleCurriculum('Lesson', 'Reading Literature');
    setStudentData({
      country: sample.country,
      state: sample.state,
      language: sample.language,
      grade: sample.grade,
      course: sample.course,
      need: 'Lesson',
      role: 'Teacher'
    });
    setCurriculum(plan);
    setCurrentTopic({ name: sample.topic });
    setLesson(sample);
    navigate('sample');
  };

  useEffect(() => {
    if (view === 'sample' && !lesson?.isPublicSample) {
      openReadingSample();
    }
    if (view === 'path' && !curriculum) {
      const plan = findSampleCurriculum('Lesson', 'Reading Literature');
      setCurriculum(plan);
      setStudentData((current) => current || {
        country: 'USA', grade: 'Grade 5', course: 'Reading Literature', need: 'Lesson', role: 'Teacher', language: 'English'
      });
    }
  }, [view]);

  const handleOnboarding = async (data) => {
    const sharedTopic = data.topic || '';
    const identity = {
      email: data.email || user?.email || 'guest@global-lms.local',
      name: user?.name || data.name || 'Teacher',
      role: data.role || 'Teacher',
      workspaceType: data.workspaceType || user?.workspaceType || 'Individual teacher',
      workspaceName: data.workspaceName || user?.workspaceName || '',
      points: user?.points || 0,
      freeLessonLimit: user?.freeLessonLimit ?? FREE_LESSON_LIMIT,
      freeLessonRemaining: user?.freeLessonRemaining ?? FREE_LESSON_LIMIT
    };
    const curriculumRequest = {
      country: data.country,
      state: data.state,
      language: data.language,
      grade: data.grade,
      course: data.course,
      need: data.need,
      role: data.role || 'Teacher',
      workspaceType: data.workspaceType || 'Individual teacher',
      workspaceName: data.workspaceName || ''
    };
    setStudentData(curriculumRequest);
    setLesson(null);
    setCurrentTopic(null);
    saveUser(identity);
    setPlanSaveStatus('Preview is open without an account.');
    const sampleLesson = findSampleLesson(sharedTopic, data.course);
    const sampleCurriculum = findSampleCurriculum(data.need, data.course) || (sampleLesson ? findSampleCurriculum('Lesson', sampleLesson.course) : null);
    if (sampleLesson) {
      setLesson(sampleLesson);
      setCurrentTopic({ name: sampleLesson.topic });
      setCurriculum(sampleCurriculum || {
        country: sampleLesson.country,
        state: sampleLesson.state,
        grade: sampleLesson.grade,
        language: sampleLesson.language,
        course: sampleLesson.course,
        need: 'Lesson',
        isFree: false,
        isPublicSample: true,
        pricing: { lesson: 5, unit: 10, course: 100 },
        standardsBody: (sampleLesson.standards || []).map((item) => item.code).join(', '),
        subjects: [{ name: sampleLesson.course, topics: [sampleLesson.title] }],
        units: [{ title: sampleLesson.title, sequence: 1, lessons: [{ title: sampleLesson.title, sequence: 1, description: sampleLesson.hook }] }]
      });
      navigate(sampleLesson.id === 'sample-harbor-light' ? 'sample' : 'lesson');
      return;
    }
    if (sampleCurriculum) {
      setCurriculum(sampleCurriculum);
      if (sampleLesson) {
        setLesson(sampleLesson);
        setCurrentTopic({ name: sampleLesson.topic });
        navigate(data.need === 'Lesson' ? 'sample' : 'path');
        return;
      }
      if (data.need === 'Unit' && sampleCurriculum.units?.[0]) {
        setSelectedUnit({ unit: sampleCurriculum.units[0], unitIndex: 0 });
        navigate('unit');
        return;
      }
      navigate('path');
      return;
    }
    navigate('path');
    try {
      const res = await fetch(`${API_BASE}/api/curriculum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(curriculumRequest)
      });
      const result = await res.json();
      if (!res.ok || !result.subjects?.length) throw new Error(result.detail || result.error || 'Course plan could not be loaded.');
      if (
        result.course && result.course !== curriculumRequest.course ||
        result.grade && result.grade !== curriculumRequest.grade ||
        result.country && result.country !== curriculumRequest.country
      ) {
        throw new Error(`Course mismatch prevented: requested ${curriculumRequest.grade} ${curriculumRequest.course} for ${curriculumRequest.country}.`);
      }
      setCurriculum(result);
      if (sharedTopic) {
        await handleSelectTopic(sharedTopic, false, curriculumRequest, result);
      }
    } catch (err) {
      console.error(err);
      setCurriculum({ subjects: [], error: err.message });
    }
  };

  const handleBuildAiDraft = async (data) => {
    if (!isRealEmail(user?.email)) {
      setAiBuildStatus('AI Builder needs an email so credits can be stored. That is not a Student login wall for catalog previews.');
      navigate('auth');
      return;
    }
    const request = {
      country: data.country,
      state: data.state,
      language: data.language,
      grade: data.grade,
      course: data.course,
      need: data.need,
      role: data.role,
      idea: data.idea,
      email: user.email,
      visitorId,
      name: user?.name,
      path: window.location.pathname
    };
    setAiBuildStatus('Building draft...');
    try {
      const result = await postJson('/api/ai-builder', request);
      setAiDraftPackage({ ...result, request });
      const costLabel = result.usage.estimatedCost?.estimatedCost !== undefined
        ? ` Estimated AI cost: $${result.usage.estimatedCost.estimatedCost.toFixed(4)}.`
        : '';
      setAiBuildStatus(`${result.usage.remaining} free credits left this month.${costLabel}`);
      navigate('ai-builder-draft');
    } catch (err) {
      setAiBuildStatus(err.message || 'AI draft could not be built.');
    }
  };

  const handleBuyAiCredits = async (packId) => {
    if (!isRealEmail(user?.email)) {
      setAiBuildStatus('Enter an email to buy AI Builder credits. Catalog lessons do not require this.');
      navigate('auth');
      return;
    }
    try {
      setAiBuildStatus('Opening credit checkout...');
      const session = await postJson('/api/ai-builder/create-credit-checkout', {
        email: user.email,
        packId
      });
      if (session.url) {
        window.location.href = session.url;
        return;
      }
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe publishable key is not configured.');
      await stripe.redirectToCheckout({ sessionId: session.id });
    } catch (err) {
      setAiBuildStatus(err.message || 'Credit checkout is unavailable.');
    }
  };

  const handleSignIn = async (nextUser) => {
    let normalizedUser = {
      ...nextUser,
      email: normalizeLoginEmail(nextUser.email),
      role: roleForEmail(nextUser.email, nextUser.role),
      workspaceType: nextUser.workspaceType || 'Individual teacher',
      workspaceName: nextUser.workspaceName || '',
      freeLessonLimit: nextUser.freeLessonLimit ?? FREE_LESSON_LIMIT,
      freeLessonRemaining: nextUser.freeLessonRemaining ?? FREE_LESSON_LIMIT
    };
    saveUser(normalizedUser);
    try {
      const result = await postJson('/api/users/signin', {
        visitorId,
        email: normalizedUser.email,
        name: normalizedUser.name,
        role: normalizedUser.role,
        workspaceType: normalizedUser.workspaceType,
        workspaceName: normalizedUser.workspaceName,
        path: window.location.pathname
      });
      if (result.user) {
        normalizedUser = { ...normalizedUser, ...result.user };
        saveUser(normalizedUser);
      }
      setPlanSaveStatus(`Welcome, glad to have you. You can open ${normalizedUser.freeLessonRemaining ?? FREE_LESSON_LIMIT} lessons for free.`);
    } catch {
      setPlanSaveStatus(`Welcome, glad to have you. You can open ${FREE_LESSON_LIMIT} lessons for free, but cloud save failed.`);
    }
    setStudentData((current) => current || {
      country: 'USA',
      language: 'English',
      grade: 'Grade 5',
      course: 'General Education',
      need: 'Lesson',
      role: normalizedUser.role,
      workspaceType: normalizedUser.workspaceType,
      workspaceName: normalizedUser.workspaceName,
      email: normalizedUser.email
    });
    navigate(isOwnerAdmin(normalizedUser) ? 'usage' : (curriculum ? 'path' : 'onboarding'));
  };

  const handleSignOut = () => {
    setUser(null);
    localStorage.removeItem('globalLmsUser');
    setPlanSaveStatus('Signed out.');
    navigate('onboarding');
  };

  const handleSelectTopic = async (topic, isPremium = false, planOverride = studentData, curriculumOverride = curriculum) => {
    if (isPremium && !curriculumOverride?.isFree) {
      handlePurchase(topic);
      return;
    }
    const sample = findSampleLesson(topic, planOverride?.course || curriculumOverride?.course);
    if (sample) {
      setCurrentTopic({ name: sample.topic });
      setLesson(sample);
      navigate('sample');
      return;
    }
    setCurrentTopic({ name: topic });
    setLesson(null);
    navigate('lesson');
    try {
      const res = await fetch(`${API_BASE}/api/lesson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...planOverride,
          topic,
          email: user?.email,
          visitorId,
          preview: true
        })
      });
      const result = await res.json();
      if (!res.ok) {
        const error = new Error(result.detail || result.message || result.error || 'This preview is ready as a sample or purchase.');
        error.status = res.status;
        throw error;
      }
      if (result.access && user?.email) {
        saveUser({
          ...user,
          freeLessonLimit: result.access.freeLessonLimit ?? user.freeLessonLimit ?? FREE_LESSON_LIMIT,
          freeLessonRemaining: result.access.freeLessonRemaining ?? user.freeLessonRemaining ?? FREE_LESSON_LIMIT
        });
      }
      trackUsage('lesson_open', { topic, email: user?.email, plan: planOverride });
      setLesson(result);
    } catch (err) {
      console.error(err);
      if (err.status === 401 || err.status === 402) {
        setPlanSaveStatus(err.message || 'Buy a lesson, unit, or course to keep opening warehouse items. No Student account required.');
        setCurrentTopic({ name: topic, error: err.message || 'Paid access or another preview is available without signing in as a Student.' });
        return;
      }
      setCurrentTopic({ name: topic, error: err.message });
    }
  };

  const handleSelectUnit = (unit, unitIndex = 0) => {
    setSelectedUnit({ unit, unitIndex });
    navigate('unit');
  };

  useEffect(() => {
    if (isOwnerMarketingSite || !sharedPlanRef.current) return;
    const sharedPlan = sharedPlanRef.current;
    sharedPlanRef.current = null;
    handleOnboarding({
      ...sharedPlan,
      role: user?.role || sharedPlan.role || 'Teacher',
      email: user?.email || ''
    });
  }, []);

  const startCheckout = async (topicName, price, email) => {
    const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        successPath: '/pricing?success=true',
        cancelPath: '/pricing?canceled=true',
        items: [{ name: topicName, price, image: `${window.location.origin}/sample-reading.svg` }]
      })
    });
    const session = await res.json();
    if (!res.ok) throw new Error(session.detail || session.error || 'Unable to start checkout');
    if (session.url) {
      window.location.href = session.url;
      return;
    }
    const stripe = await stripePromise;
    if (!stripe) throw new Error('Stripe publishable key is not configured.');
    await stripe.redirectToCheckout({ sessionId: session.id });
  };

  const handlePurchase = async (topicName, price = '$5') => {
    try {
      const email = isRealEmail(user?.email) ? user.email : (isRealEmail(guestEmail) ? guestEmail : '');
      if (!email) {
        setGuestCheckout({ name: topicName, price });
        return;
      }
      await startCheckout(topicName, price, email);
    } catch (err) {
      setPlanSaveStatus(err.message || 'Payment checkout is unavailable right now.');
    }
  };

  const handleMarketplacePreview = (item) => {
    if (item.previewTopic) {
      handleSelectTopic(item.previewTopic, false, {
        country: item.country,
        grade: item.grade,
        course: item.course,
        need: 'Lesson',
        role: 'Teacher',
        language: 'English'
      });
      return;
    }
    if (item.previewNeed) {
      handleOnboarding({
        country: item.country || 'USA',
        grade: item.grade || 'Grade 5',
        course: item.previewCourse || item.course,
        need: item.previewNeed,
        role: 'Teacher',
        language: 'English'
      });
      return;
    }
    handleSelectTopic(item.title, false, {
      country: item.country,
      grade: item.grade,
      course: item.course,
      need: item.type || 'Lesson',
      role: 'Teacher',
      language: 'English'
    });
  };

  return (
    <div>
      {!isOwnerMarketingSite && <Navbar onNavigate={navigate} user={user} onOpenContact={() => setIsContactOpen(true)} onSignOut={handleSignOut} />}
      <ContactModal isOpen={isContactOpen} onClose={() => setIsContactOpen(false)} userEmail={user?.email} />
      {!isOwnerMarketingSite && <HelpBot onNavigate={navigate} />}
      {guestCheckout && (
        <div className="guest-checkout-overlay">
          <form
            className="guest-checkout-card"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await startCheckout(guestCheckout.name, guestCheckout.price, guestEmail);
              } catch (err) {
                setPlanSaveStatus(err.message || 'Checkout unavailable.');
              }
            }}
          >
            <h2>Buy {guestCheckout.name}</h2>
            <p>Stripe will charge {guestCheckout.price}. Enter an email for the receipt. Teacher/buyer checkout — no Student account.</p>
            <input
              className="form-control"
              type="email"
              required
              placeholder="teacher@school.org"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
            <button type="submit" className="initialize-btn">Continue to Stripe</button>
            <button type="button" className="nav-mini-btn" onClick={() => setGuestCheckout(null)}>Cancel</button>
          </form>
        </div>
      )}
      <main className={`app-main view-${isOwnerMarketingSite ? 'owner' : view}`}>
        <AnimatePresence mode="wait">
          {view === 'onboarding' && (
            <motion.div key="on" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <OnboardingView
                onComplete={handleOnboarding}
                onOpenLmsGuide={() => navigate('lms-guide')}
                onBuildAiDraft={handleBuildAiDraft}
                onBuyAiCredits={handleBuyAiCredits}
                onPurchase={handlePurchase}
                aiBuildStatus={aiBuildStatus}
                user={user}
                onTrack={trackUsage}
              />
            </motion.div>
          )}
          {view === 'pricing' && (
            <motion.div key="pricing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PricingView
                onPurchase={handlePurchase}
                onOpenSample={openReadingSample}
                onOpenMarketplace={() => navigate('marketplace')}
              />
            </motion.div>
          )}
          {view === 'about' && (
            <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AboutView onBack={() => navigate('onboarding')} onOpenContact={() => setIsContactOpen(true)} onNavigate={navigate} />
            </motion.div>
          )}
          {view === 'lms-guide' && (
            <motion.div key="lms-guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LmsCompatibilityView onBack={() => navigate('onboarding')} />
            </motion.div>
          )}
          {view === 'whiteboard' && (
            <motion.div key="whiteboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WhiteboardView />
            </motion.div>
          )}
          {view === 'path' && (
            <motion.div key="path" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PathView studentData={studentData} curriculum={curriculum} onSelectTopic={handleSelectTopic} onSelectUnit={handleSelectUnit} planSaveStatus={planSaveStatus} user={user} />
            </motion.div>
          )}
          {view === 'unit' && selectedUnit && (
            <motion.div key="unit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UnitOverviewView
                unit={selectedUnit.unit}
                unitIndex={selectedUnit.unitIndex}
                curriculum={curriculum}
                studentData={studentData}
                onSelectTopic={handleSelectTopic}
                onBack={() => navigate('path')}
              />
            </motion.div>
          )}
          {view === 'marketplace' && (
            <motion.div key="marketplace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CreatorMarketplaceView user={user} onPreview={handleMarketplacePreview} onPurchase={handlePurchase} />
            </motion.div>
          )}
          {view === 'sis' && (
            <motion.div key="sis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StudentInformationSystemView onBuildPlan={() => navigate('onboarding')} onOpenDashboard={() => navigate('teacher-dash')} />
            </motion.div>
          )}
          {view === 'marketing' && (
            <motion.div key="marketing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isOwnerMarketingSite ? <OwnerMarketingGate /> : <MarketingView />}
            </motion.div>
          )}
          {view === 'security' && (
            <motion.div key="sec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SecurityView />
            </motion.div>
          )}
          {view === 'safety' && (
            <motion.div key="safe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SafetyView />
            </motion.div>
          )}
          {view === 'usage' && (
            <motion.div key="usage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UsageView user={user} onNavigate={navigate} />
            </motion.div>
          )}
          {view === 'auth' && (
            <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AuthView onSignIn={handleSignIn} />
            </motion.div>
          )}
          {view === 'sample' && (
            <motion.div key="sample" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LessonView
                topic={currentTopic?.name || READING_SAMPLE_LESSON.topic}
                lesson={lesson || READING_SAMPLE_LESSON}
                shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/sample`}
                onBack={() => navigate('onboarding')}
                error={currentTopic?.error}
                onPurchase={handlePurchase}
                onAwardPoints={(pts) => saveUser({ ...(user || { email: 'guest@global-lms.local', role: 'Teacher' }), points: ((user && user.points) || 0) + pts })}
                onTrack={trackUsage}
              />
            </motion.div>
          )}
          {view === 'lesson' && (
            <motion.div key="less" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LessonView 
                topic={currentTopic?.name} 
                lesson={lesson} 
                shareUrl={buildShareUrl(studentData, curriculum, currentTopic?.name)}
                onBack={() => navigate('path')} 
                error={currentTopic?.error}
                onPurchase={handlePurchase}
                onAwardPoints={(pts) => saveUser({ ...(user || { email: 'guest@global-lms.local', role: 'Teacher' }), points: ((user && user.points) || 0) + pts })}
                onTrack={trackUsage}
              />
            </motion.div>
          )}
          {view === 'ai-builder-draft' && (
            <motion.div key="ai-builder-draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AiDraftView
                packageData={aiDraftPackage}
                onBack={() => navigate('onboarding')}
                onSelectTopic={handleSelectTopic}
                onAwardPoints={(pts) => saveUser({ ...(user || { email: 'guest@global-lms.local', role: 'Teacher' }), points: ((user && user.points) || 0) + pts })}
              />
            </motion.div>
          )}
          {view === 'teacher-dash' && (
            <motion.div key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TeacherDashboard curriculum={curriculum} studentData={studentData} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
