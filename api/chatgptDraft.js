const cleanString = (value = '', maxLength = 5000) => (
  String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength)
);

const normalizeChatgptKind = (kind = 'lesson') => {
  const normalized = String(kind || 'lesson').trim().toLowerCase();
  return ['lesson', 'quiz', 'unit', 'course'].includes(normalized) ? normalized : 'lesson';
};

const buildQuizItems = ({ title, grade, subject, region }) => ([
  {
    number: 1,
    question: `Which choice best shows understanding of ${title}?`,
    options: [
      'Memorizing one isolated fact',
      'Explaining the idea with evidence and applying it',
      'Skipping the practice task',
      'Copying without checking meaning'
    ],
    answer: 'Explaining the idea with evidence and applying it'
  },
  {
    number: 2,
    question: `Why does this quiz include a local or global example from ${region}?`,
    options: [
      'To replace the standard',
      'To make the standard meaningful and transferable',
      'To avoid assessment',
      'To make the task unrelated'
    ],
    answer: 'To make the standard meaningful and transferable'
  },
  {
    number: 3,
    question: `In 3-5 sentences, explain ${subject.toLowerCase()} and give one example.`,
    options: [],
    answer: ''
  }
]);

export function buildChatgptQuickDraft({ country, state, grade = 'Grade 5', subject = 'General Education', kind = 'lesson' }) {
  const normalizedKind = normalizeChatgptKind(kind);
  const safeCountry = cleanString(country, 80) || 'USA';
  const safeState = cleanString(state, 80) || 'California';
  const safeGrade = cleanString(grade, 40) || 'Grade 5';
  const safeSubject = cleanString(subject, 120) || 'General Education';
  const region = `${safeCountry}${safeState ? `, ${safeState}` : ''}`;
  const title = normalizedKind === 'course'
    ? `${safeSubject} Course`
    : normalizedKind === 'quiz'
      ? `${safeSubject} Quick Check`
      : normalizedKind === 'unit'
        ? `${safeSubject} Unit`
        : `${safeSubject} Quick Start`;
  const quiz = buildQuizItems({ title, grade: safeGrade, subject: safeSubject, region: safeState || safeCountry });

  const lesson = {
    title,
    hook: `Students connect ${title.toLowerCase()} to a real classroom, community, or global problem in ${safeState || safeCountry}.`,
    content: [
      `Grade Level: ${safeGrade}`,
      `Course: ${safeSubject}`,
      `Region: ${region}`,
      '',
      'Learning Objectives:',
      `1. Define and use the key vocabulary connected to ${title}.`,
      `2. Explain the concept with evidence, models, examples, or text details appropriate for ${safeGrade}.`,
      '3. Complete a short performance task that shows independent mastery.',
      '',
      'Teacher Plan:',
      `Opening: Present a familiar ${safeState || safeCountry} example and ask students what they notice, wonder, and predict.`,
      `Direct Instruction: Model the central skill for ${title.toLowerCase()} with one worked example and one non-example.`,
      'Guided Practice: Students work in pairs while the teacher checks for misconceptions.',
      'Independent Practice: Students complete a short worksheet task aligned to the same standard.',
      'Assessment: Use the quiz and a one-minute exit ticket to decide whether to reteach, extend, or move to the next lesson.',
      '',
      'Worksheet:',
      `A. Vocabulary: Write a student-friendly definition for ${title}.`,
      'B. Practice: Complete three grade-level tasks that move from supported to independent.',
      `C. Transfer: Create one example from ${safeState || safeCountry} or another global context.`,
      '',
      'Answer Key:',
      'Answers should show accurate vocabulary, evidence from the lesson, and a clear explanation of the reasoning process.'
    ].join('\n'),
    quiz,
    topic: title,
    country: safeCountry,
    state: safeState,
    grade: safeGrade,
    language: 'English',
    need: normalizedKind === 'unit' ? 'Weekly Unit' : 'Daily Lesson',
    export_metadata: {
      lms_ready: true,
      standards_aligned: true,
      region,
      package_type: 'lesson',
      includes: ['teacher plan', 'worksheet', 'quiz', 'answer key', 'activity', 'media links']
    }
  };

  const unit = {
    isFree: false,
    pricing: { lesson: 5, unit: 10, month: 39, course: 100 },
    need: normalizedKind === 'unit' ? 'Weekly Unit' : 'Daily Lesson',
    standardsBody: `${safeState || safeCountry} academic standards and local curriculum alignment`,
    country: safeCountry,
    state: safeState,
    grade: safeGrade,
    language: 'English',
    course: safeSubject,
    includedMaterials: ['LessonCast', 'Teacher plan', 'Worksheet', 'Quiz', 'Answer key', 'Mix-and-match activity', 'LMS export package'],
    subjects: [{ name: safeSubject, topics: [title] }],
    units: [{ id: `${safeSubject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-unit-1`, title, sequence: 1, duration: '3-5 class periods', standardsFocus: `${safeSubject} strand`, lessons: [{ title, sequence: 1, standards: [`${safeSubject.toUpperCase()}.1.1`], objectives: [`Explain ${safeSubject.toLowerCase()} using grade-level vocabulary.`, `Apply ${safeSubject.toLowerCase()} practices to a local or global example.`] }] }],
    metadata: {
      source: 'chatgpt-draft',
      lms_ready: true,
      standards_aligned: true,
      generatedAt: new Date().toISOString()
    }
  };
  const courseUnits = [
    {
      week: 1,
      title: `${safeSubject} Foundations`,
      focus: `Introduce the core ideas, vocabulary, and expectations for ${safeSubject.toLowerCase()}.`
    },
    {
      week: 2,
      title: `Guided Practice in ${safeSubject}`,
      focus: `Model the main skills with examples from ${safeState || safeCountry} and the wider world.`
    },
    {
      week: 3,
      title: `Independent Application`,
      focus: `Use reading, writing, discussion, problem-solving, or hands-on tasks to show mastery.`
    },
    {
      week: 4,
      title: `${safeSubject} Performance Task`,
      focus: `Complete a culminating project, quiz, or presentation with a simple rubric.`
    }
  ];
  const course = {
    title: `${safeGrade} ${safeSubject} Course`,
    overview: `A fast classroom-ready course for ${safeGrade} students in ${region}.`,
    outcomes: [
      `Build understanding of key ${safeSubject.toLowerCase()} concepts.`,
      `Practice the skills through short daily lessons and checks for understanding.`,
      `Show mastery with a final task that fits the local curriculum.`,
    ],
    pacing: '4 weeks',
    region,
    grade: safeGrade,
    subject: safeSubject,
    units: courseUnits,
    assessments: [
      'Daily exit tickets',
      'One short quiz each week',
      'A final performance task or exam'
    ],
    teacherNotes: [
      `Start with the default region, then adjust examples for ${safeState || safeCountry}.`,
      'Use the same course for substitute teachers, tutors, or parents who need a quick plan.',
      'Swap in local standards, texts, or examples when needed.'
    ]
  };
  const courseText = [
    `${safeGrade} ${safeSubject} Course`,
    `Region: ${region}`,
    '',
    `Overview: ${course.overview}`,
    '',
    'Outcomes:',
    ...course.outcomes.map((item) => `- ${item}`),
    '',
    '4-Week Outline:',
    ...course.units.map((item) => `${item.week}. ${item.title} - ${item.focus}`),
    '',
    'Assessments:',
    ...course.assessments.map((item) => `- ${item}`),
    '',
    'Teacher Notes:',
    ...course.teacherNotes.map((item) => `- ${item}`)
  ].join('\n');

  const quizLines = quiz.map((item) => {
    const choices = Array.isArray(item.options) && item.options.length ? `\n  Choices: ${item.options.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join(' | ')}` : '';
    return `${item.number}. ${item.question}${choices}`;
  });
  const answerLines = quiz.map((item) => `${item.number}. ${item.answer || 'Student response'}`);
  const quizText = [
    `${safeGrade} ${safeSubject} Quiz`,
    `Topic: ${title}`,
    `Country/State: ${region}`,
    '',
    'Questions:',
    ...quizLines,
    '',
    'Answer Key:',
    ...answerLines
  ].join('\n');
  const lessonText = `${lesson.content}\n\nQuiz:\n${quizText}`;
  const unitText = [
    `Unit Title: ${safeSubject}`,
    `Grade: ${safeGrade}`,
    `Country/State: ${region}`,
    '',
    `Includes ${unit.units.length} unit block with a classroom-ready sequence.`
  ].join('\n');

  return {
    kind: normalizedKind,
    country: safeCountry,
    state: safeState,
    grade: safeGrade,
    subject: safeSubject,
    title,
    summary: normalizedKind === 'course'
      ? `${safeGrade} ${safeSubject} course for ${region}.`
      : `${safeGrade} ${safeSubject} ${normalizedKind} for ${region}.`,
    quizText,
    lessonText,
    unitText,
    courseText,
    copyReadyText: normalizedKind === 'quiz' ? quizText : normalizedKind === 'unit' ? unitText : normalizedKind === 'course' ? courseText : lessonText,
    lesson,
    unit,
    course,
    quiz,
    answerKey: quiz.map((item) => ({ number: item.number, answer: item.answer })),
    readyForChatGPT: true,
    generatedAt: new Date().toISOString()
  };
}
