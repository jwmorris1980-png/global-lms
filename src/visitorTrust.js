export const SITE_CANONICAL = 'https://www.global-lms.org';
export const BUILD_STAMP = 'trust-20260921';
export const STANDARD_PRICING = {
  lesson: 5,
  unit: 10,
  course: 100,
  guarantee: '30-day money-back',
  processor: 'Stripe Checkout'
};

export const VIEW_PATHS = {
  onboarding: '/',
  pricing: '/pricing',
  marketplace: '/marketplace',
  about: '/about',
  safety: '/safety',
  security: '/security',
  sample: '/sample',
  path: '/courses',
  unit: '/unit',
  lesson: '/lesson',
  auth: '/sign-in',
  'lms-guide': '/lms-guide',
  whiteboard: '/whiteboard',
  sis: '/sis',
  marketing: '/marketing',
  usage: '/admin',
  'teacher-dash': '/dashboard',
  'ai-builder-draft': '/ai-draft'
};

export const PAGE_TITLES = {
  onboarding: 'Global LMS | K-12 warehouse lessons, units, and courses',
  pricing: 'Pricing | Global LMS — $5 lesson, $10 unit, $100 course',
  marketplace: 'Marketplace | Ready-to-teach K-12 catalog',
  about: 'About | Global LMS warehouse curriculum',
  safety: 'Safety | Packaged classroom lessons, not an open chatbot',
  security: 'Security & student privacy | Global LMS',
  sample: 'Free sample lesson | Grade 5 story elements',
  path: 'Courses | Global LMS catalog',
  unit: 'Unit | Global LMS',
  lesson: 'Lesson | Global LMS',
  auth: 'Sign in | Global LMS',
  'lms-guide': 'LMS export guide | Global LMS',
  whiteboard: 'Whiteboard | Global LMS',
  sis: 'Student information | Global LMS',
  marketing: 'Marketing | Global LMS',
  usage: 'Admin | Global LMS',
  'teacher-dash': 'Teacher dashboard | Global LMS',
  'ai-builder-draft': 'AI draft | Global LMS'
};

export const viewFromPath = (pathname = '/') => {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return 'onboarding';
  const entry = Object.entries(VIEW_PATHS).find(([, route]) => route === path);
  if (entry) return entry[0];
  if (path.startsWith('/sample')) return 'sample';
  if (path.startsWith('/lesson')) return 'lesson';
  if (path.startsWith('/courses')) return 'path';
  if (path.startsWith('/unit')) return 'unit';
  if (path.startsWith('/pricing')) return 'pricing';
  if (path.startsWith('/marketplace')) return 'marketplace';
  return 'onboarding';
};

export const pathForView = (view = 'onboarding', extra = '') => {
  const base = VIEW_PATHS[view] || '/';
  return extra ? `${base}${extra}` : base;
};

export const pageTitleFor = (view = 'onboarding') => PAGE_TITLES[view] || PAGE_TITLES.onboarding;

const booksImg = '/sample-reading.svg';
const physicsImg = '/sample-physics.svg';
const moneyImg = '/sample-finance.svg';
const robotImg = '/sample-robotics.svg';
const codingImg = '/sample-coding.svg';

export const CURATED_TOPIC_IMAGES = {
  reading: [booksImg, '/sample-reading-plot.svg', '/sample-reading-figurative.svg'],
  physics: [physicsImg, '/sample-physics-inquiry.svg', '/sample-physics-forces.svg'],
  finance: [moneyImg, '/sample-finance-budget.svg', '/sample-finance-needs.svg'],
  robotics: [robotImg, '/sample-robotics-loop.svg', '/sample-robotics-sensors.svg'],
  coding: [codingImg, '/sample-coding-loop.svg', '/sample-coding-level.svg'],
  science: [physicsImg, robotImg, booksImg],
  default: [booksImg, physicsImg, moneyImg]
};

export const imageSetForTopic = (title = '', course = '') => {
  const text = `${title} ${course}`.toLowerCase();
  if (/read|literature|story|figurative|character|plot/.test(text)) return CURATED_TOPIC_IMAGES.reading;
  if (/physics|force|motion|inquiry|energy/.test(text)) return CURATED_TOPIC_IMAGES.physics;
  if (/money|financ|budget|credit|saving/.test(text)) return CURATED_TOPIC_IMAGES.finance;
  if (/robot/.test(text)) return CURATED_TOPIC_IMAGES.robotics;
  if (/game development|coding|programming|computer/.test(text)) return CURATED_TOPIC_IMAGES.coding;
  if (/science|ecosystem/.test(text)) return CURATED_TOPIC_IMAGES.science;
  return CURATED_TOPIC_IMAGES.default;
};

export const isJunkMarketplaceItem = (item = {}) => {
  const title = String(item.title || '').trim();
  const body = String(item.summary || item.content || '').replace(/\s+/g, ' ').trim();
  if (!title) return true;
  if (/^(untitled|test|testing|asdf|foo|bar)(\s|$)/i.test(title)) return true;
  if (/untitled/i.test(title) && body.length < 80) return true;
  if (body.length < 40) return true;
  if (item.status === 'pending_review' && body.length < 120) return true;
  return false;
};

const readingQuiz = [
  {
    type: 'choice',
    question: 'Which sentence from “The Harbor Light” is a metaphor, not a simile?',
    options: [
      'The rain hit the windows like thrown pebbles.',
      'The lighthouse was a stubborn spine against the dark.',
      'The wind howled as if it had lost something.',
      'Mira’s boots were as heavy as wet rope.'
    ],
    answer: 'The lighthouse was a stubborn spine against the dark.'
  },
  {
    type: 'choice',
    question: 'How does the stormy harbor setting change Mira’s choice in the middle of the story?',
    options: [
      'It makes the plot comic because storms are funny.',
      'It raises the stakes, so keeping the lamp lit becomes urgent rather than routine.',
      'It proves the lighthouse is imaginary.',
      'It replaces character with setting, so Mira no longer matters.'
    ],
    answer: 'It raises the stakes, so keeping the lamp lit becomes urgent rather than routine.'
  },
  {
    type: 'choice',
    question: 'What is the turning point of the plot?',
    options: [
      'Mira eats breakfast before school.',
      'Mira decides to climb the stairs and oil the lamp herself when the wick sputters.',
      'A tourist takes a photograph of the harbor.',
      'The author lists vocabulary words.'
    ],
    answer: 'Mira decides to climb the stairs and oil the lamp herself when the wick sputters.'
  },
  {
    type: 'choice',
    question: 'Which detail best supports the claim that Mira is responsible, not just brave?',
    options: [
      'She likes the color of the lantern glass.',
      'She checks the oil, trims the wick, and waits to confirm the beam lands on the channel markers.',
      'She shouts at the storm.',
      'She wishes her grandfather were still the keeper.'
    ],
    answer: 'She checks the oil, trims the wick, and waits to confirm the beam lands on the channel markers.'
  },
  {
    type: 'choice',
    question: 'Why does the personification “the wind clawed at the door” matter to interpretation?',
    options: [
      'It names a scientific weather measurement.',
      'It makes the storm feel like an opponent, which helps readers evaluate Mira’s courage in context.',
      'It proves the door is alive.',
      'It is only decoration and cannot be analyzed.'
    ],
    answer: 'It makes the storm feel like an opponent, which helps readers evaluate Mira’s courage in context.'
  },
  {
    type: 'short',
    question: 'Analyze how setting and plot work together in “The Harbor Light.” Use two text details as evidence.'
  },
  {
    type: 'short',
    question: 'Compare the metaphor of the lighthouse as a “stubborn spine” with the simile of rain like “thrown pebbles.” Which image better shows danger, and why?'
  },
  {
    type: 'short',
    question: 'Identify one possible misconception: that figurative language is “just extra description.” Explain why that interpretation is weak using a line from the story.'
  },
  {
    type: 'short',
    question: 'Design a real-world transfer: write three sentences a harbor radio operator might say during the same storm, using one metaphor and one simile on purpose.'
  },
  {
    type: 'short',
    question: 'Make a claim about Mira’s character. Support it with reasoning and one counterexample a classmate might raise from the text.'
  }
];

const physicsQuiz = [
  {
    type: 'choice',
    question: 'A student claims a cart sped up “because it wanted to.” Which response best evaluates that claim with scientific reasoning?',
    options: [
      'Agree, because motion always has feelings.',
      'Reject it: unbalanced forces change motion; objects do not choose to accelerate.',
      'Ignore evidence and keep the original sentence.',
      'Replace the claim with a yes/no vote.'
    ],
    answer: 'Reject it: unbalanced forces change motion; objects do not choose to accelerate.'
  },
  {
    type: 'choice',
    question: 'In the classroom inquiry, which measurement best supports a claim about a change in motion?',
    options: [
      'How colorful the cart is.',
      'Time and distance used to compare speed before and after a force is applied.',
      'Whether the group liked the lab.',
      'Copying the title of the lesson.'
    ],
    answer: 'Time and distance used to compare speed before and after a force is applied.'
  },
  {
    type: 'choice',
    question: 'Which task best shows transfer of Newton’s first-law thinking to a new situation?',
    options: [
      'Explain why a soccer ball keeps rolling on wet grass until friction and air resistance slow it.',
      'Recite the vocabulary list.',
      'Circle the longest paragraph in the notes.',
      'Say whether the lab felt easy.'
    ],
    answer: 'Explain why a soccer ball keeps rolling on wet grass until friction and air resistance slow it.'
  },
  {
    type: 'choice',
    question: 'Two groups get different speed values for the same ramp. What should they do next?',
    options: [
      'Pick the larger number because bigger looks better.',
      'Compare procedures, units, and sources of error, then remeasure.',
      'Delete the data.',
      'Average in a random guess.'
    ],
    answer: 'Compare procedures, units, and sources of error, then remeasure.'
  },
  {
    type: 'choice',
    question: 'Which question pushes beyond recall during this inquiry?',
    options: [
      'What is one word from the title?',
      'How would doubling the unbalanced force change the cart’s change in motion if mass stays the same?',
      'What page are we on?',
      'Are you ready?'
    ],
    answer: 'How would doubling the unbalanced force change the cart’s change in motion if mass stays the same?'
  },
  { type: 'short', question: 'Analyze a before/after motion graph from the cart lab. Cite evidence for whether the force was balanced or unbalanced.' },
  { type: 'short', question: 'Compare two explanations of friction: “it stops things” versus “it is a force that opposes sliding.” Which is stronger, and why?' },
  { type: 'short', question: 'Identify the misconception that “no force means no motion.” Explain why it is incorrect using a coasting bicycle example.' },
  { type: 'short', question: 'Design a real-world task: a district bus pulling away from a stop. List the force pairs and the evidence a student would collect.' },
  { type: 'short', question: 'Make a claim about Newton’s second law using F = ma. Support it with reasoning and one limitation of a classroom cart model.' }
];

export const topicSpecificQuiz = (lesson = {}, topic = '') => {
  const text = `${lesson.title || ''} ${topic || ''} ${lesson.course || ''}`.toLowerCase();
  if (/story|figurative|character|plot|reading literature|harbor light/.test(text)) return readingQuiz;
  if (/physics|scientific inquiry|force|motion|newton/.test(text)) return physicsQuiz;
  return null;
};

const harborStory = `Read this classroom text.

The Harbor Light

Mira wiped salt from the lantern glass and listened. The rain hit the windows like thrown pebbles. Below the cliff, the channel markers blinked, then vanished in spray. Grandfather was in town with a fever. The harbor still needed the beam.

The lighthouse was a stubborn spine against the dark. Mira had watched the keeper’s checklist a hundred times: oil, wick, glass, logbook. Tonight the steps felt taller. The wind clawed at the door as she climbed.

Halfway up, the wick sputtered. The beam stuttered across the water like a cracked sentence. Mira did not freeze for long. She trimmed the wick, added oil, and waited until the light landed clean on the outer marker. In the logbook she wrote, “Storm. Lamp restored. Channel visible.”

By morning the rain had thinned. A fishing boat nosed into the harbor, its captain lifting two fingers toward the tower. Mira’s boots were as heavy as wet rope, but the markers were still there — and so was she.

Literary focus for Grade 5: character (Mira’s responsible choices), setting (storm, lighthouse, harbor), plot (routine → crisis → action → result), and figurative language (metaphor, simile, personification).`;

export const READING_SAMPLE_LESSON = {
  id: 'sample-harbor-light',
  title: 'Story Elements & Figurative Language: The Harbor Light',
  topic: 'Analyzing Story Elements: Characters, Setting, Plot Structure & Figurative Language',
  hook: 'A fishing boat is still out. The lamp upstairs just stuttered. What should Mira do first — and which words in the story make that moment feel dangerous?',
  grade: 'Grade 5',
  course: 'Reading Literature',
  country: 'USA',
  state: 'California',
  language: 'English',
  need: 'Lesson',
  isPublicSample: true,
  content: [
    'Grade Level: Grade 5',
    'Course: Reading Literature',
    'Standards Alignment: CCSS.ELA-LITERACY.RL.5.3, RL.5.4, RL.5.5 (character, setting, and plot; figurative language; story structure).',
    'Time: 45 minutes',
    '',
    'Learning Objectives:',
    '1. Name the character, setting, and plot beats in “The Harbor Light.”',
    '2. Quote a metaphor, a simile, and a personification and explain what each one does to the reader.',
    '3. Write a five-sentence analysis that uses text evidence, not a retell only.',
    '',
    harborStory,
    '',
    'Vocabulary:',
    'Metaphor — a comparison that says one thing is another: “The lighthouse was a stubborn spine.”',
    'Simile — a comparison using like or as: “rain hit the windows like thrown pebbles.”',
    'Personification — human action given to a nonhuman thing: “the wind clawed at the door.”',
    'Turning point — the moment the character’s action changes the outcome.',
    'Evidence — exact words or details from the text that support a claim.',
    '',
    'Teacher Plan:',
    'Opening (0–5): Project the first paragraph. Students mark one notice and one wonder on sticky notes.',
    'Model (5–12): Think-aloud the metaphor “stubborn spine.” Say: “This is not a real backbone. It shows the tower holding position in a storm, which matches Mira’s job.”',
    'Guided practice (12–28): Partners complete a three-column chart: Setting detail / How it raises stakes / Quote.',
    'Independent (28–40): Students answer quiz items 1–4 and the short analysis prompt.',
    'Close (40–45): Exit ticket: one claim about Mira + one quote.',
    '',
    'Worksheet:',
    'A. Underline one metaphor, one simile, and one personification.',
    'B. Sequence four plot cards: routine check, wick sputters, Mira restores the lamp, boat returns.',
    'C. Transfer: rewrite the last paragraph in a desert setting without losing Mira’s responsible character.',
    '',
    'Answer Key:',
    'Metaphor: stubborn spine. Simile: rain like thrown pebbles; beam like a cracked sentence; boots as heavy as wet rope. Personification: wind clawed. Turning point: Mira trims the wick and restores the beam. Character evidence: checklist, oil, wick, logbook, waiting until the marker is visible.'
  ].join('\n'),
  quiz: readingQuiz,
  media: {
    images: CURATED_TOPIC_IMAGES.reading,
    video: 'https://www.youtube.com/results?search_query=grade+5+figurative+language+metaphor+simile+story+elements',
    videoId: 'Z4eQSFdCqJ0'
  },
  standards: [
    { code: 'RL.5.3', description: 'Compare and contrast two or more characters, settings, or events in a story, drawing on specific details in the text.' },
    { code: 'RL.5.4', description: 'Determine the meaning of figurative language, including metaphors and similes, as used in a text.' },
    { code: 'RL.5.5', description: 'Explain how a series of chapters, scenes, or stanzas fits together to provide the overall structure of a particular story.' }
  ],
  teacherScript: [
    {
      title: 'Teacher Plan: 45-minute Grade 5 reading lesson',
      items: [
        'Goal: Students will analyze character, setting, plot, and figurative language in “The Harbor Light,” using quoted evidence.',
        'Standard focus: RL.5.3, RL.5.4, RL.5.5.',
        'Materials: printed story, three-column chart, highlighters, quiz, exit tickets.',
        'Do not summarize the story for them first. Let the text do the work, then model one metaphor.'
      ]
    },
    {
      title: '0–5 minutes: Hook',
      items: [
        'Say: “A boat is still in the channel and the lamp just sputtered. We are not guessing what we would do in real life yet. We are reading how Mira’s setting and choices are written.”',
        'Read paragraph 1 aloud. Students write one notice and one wonder.',
        'Collect two wonders. Park them on the board. Tell students we will return to them with evidence, not opinions only.'
      ]
    },
    {
      title: '5–14 minutes: Vocabulary in this text',
      items: [
        'Teach metaphor with “The lighthouse was a stubborn spine against the dark.” Non-example: “The lighthouse was tall.”',
        'Teach simile with “rain hit the windows like thrown pebbles.”',
        'Teach personification with “The wind clawed at the door.”',
        'Partners: classify three more lines from the story. Circulate for students who call every comparison a metaphor.'
      ]
    },
    {
      title: '14–28 minutes: Guided analysis',
      items: [
        'Chart: Character / Setting / Plot beat. Require a quote in each box.',
        'Ask: “Which setting detail makes Mira’s action urgent?” Look for spray hiding channel markers, sputting wick, storm.',
        'Name the turning point together: Mira trims the wick instead of waiting for Grandfather.'
      ]
    },
    {
      title: '28–40 minutes: Independent check',
      items: [
        'Students complete the multiple-choice items that quote the story, then the short evidence paragraph.',
        'Small-group option: reread paragraph 3 with a partner and mark the sequence of Mira’s actions.',
        'Extension: rewrite the climax in a new setting without changing Mira’s responsible character.'
      ]
    },
    {
      title: '40–45 minutes: Exit ticket',
      items: [
        'Prompt: “Mira is ________. My evidence is ________. This matters because ________.”',
        'Sort tickets: uses a quote / retells without a quote / off-prompt.',
        'Close: “Figurative language is not extra paint. It is how the author shows danger and character.”'
      ]
    }
  ],
  export_metadata: {
    lms_ready: true,
    standards_aligned: true,
    region: 'California',
    package_type: 'public-sample-lesson',
    includes: ['student text', 'teacher plan', 'worksheet', 'quiz', 'answer key']
  }
};

export const PHYSICS_SAMPLE_LESSON = {
  id: 'sample-cart-inquiry',
  title: 'Unbalanced Forces & Scientific Inquiry: The Classroom Cart',
  topic: 'Introduction to Physics & Scientific Inquiry (NGSS: Science & Engineering Practices, Crosscutting Concepts)',
  hook: 'The cart is already moving. If nobody pushes it again, does it “want” to stop — or is a force acting that we have not named yet?',
  grade: 'Grade 9',
  course: 'Physics',
  country: 'USA',
  state: 'California',
  language: 'English',
  need: 'Lesson',
  isPublicSample: true,
  content: [
    'Grade Level: Grade 9',
    'Course: Physics',
    'Standards Alignment: HS-PS2-1; Science & Engineering Practices (asking questions, planning investigations, analyzing data); Crosscutting concept: cause and effect.',
    '',
    'Phenomenon: A dynamics cart on a level track keeps rolling after a short push, then slows. Students often say “it ran out of force.”',
    '',
    'Investigation:',
    '1. Push the cart once. Record time to travel 1.00 m in three trials after the hand leaves the cart.',
    '2. Add a felt pad under the track (more friction). Repeat.',
    '3. Tilt the track slightly downhill so gravity provides a continuing unbalanced force. Compare.',
    '',
    'Core idea: A net (unbalanced) force changes motion. Balanced forces — including a coasting cart with very small friction — do not require a “go force” to keep existing motion. Slowing is evidence of an opposing force, not of motion dying of old age.',
    '',
    'Teacher Plan: safety goggles for moving carts; meter sticks clamped; no catching carts with feet.',
    'Worksheet: data table (trial, distance, time, speed), claim-evidence-reasoning paragraph, force diagram of the coasting cart.',
    'Answer key: higher friction → smaller coasting speed over the same distance; downhill unbalanced component → speed increases; “ran out of force” is a misconception.'
  ].join('\n'),
  quiz: physicsQuiz,
  media: {
    images: CURATED_TOPIC_IMAGES.physics,
    video: 'https://www.youtube.com/results?search_query=unbalanced+forces+newton+first+law+cart+inquiry+high+school',
    videoId: 'CQYELiTtUs8'
  },
  standards: [
    { code: 'HS-PS2-1', description: 'Analyze data to support the claim that Newton’s second law of motion describes the mathematical relationship among the net force on a macroscopic object, its mass, and its acceleration.' },
    { code: 'SEP-3', description: 'Plan and carry out investigations to produce data that serve as evidence.' }
  ],
  teacherScript: [
    {
      title: 'Teacher Plan: 45-minute physics inquiry',
      items: [
        'Goal: Students will collect motion data and evaluate the misconception that moving objects “run out of force.”',
        'Materials: dynamics carts, tracks, felt, stopwatches, meter sticks, CER sheets.',
        'Safety: standing clear of tracks; catch carts at the end with a book, not a foot.'
      ]
    },
    {
      title: '0–6 minutes: Phenomenon and claim',
      items: [
        'Push a cart once. Ask: “Where did the force go?” Collect three student sentences on the board without correcting yet.',
        'Say: “We will test whether slowing is missing force or an opposing force we can change.”'
      ]
    },
    {
      title: '6–28 minutes: Investigation',
      items: [
        'Groups run three conditions: low friction, added felt, slight downhill.',
        'Require units. Reject data tables that mix cm and m.',
        'Force diagrams: coasting cart should show friction opposite velocity, not a forward “go” arrow after the hand leaves.'
      ]
    },
    {
      title: '28–45 minutes: Reasoning and check',
      items: [
        'CER: claim about unbalanced force; evidence from two conditions; reasoning tied to Newton’s first/second laws.',
        'Quiz items that analyze claims, not “what is the title of this lesson.”',
        'Exit ticket: rewrite the “ran out of force” sentence scientifically.'
      ]
    }
  ],
  export_metadata: {
    lms_ready: true,
    standards_aligned: true,
    region: 'California',
    package_type: 'public-sample-lesson'
  }
};

const financeUnitLessons = [
  { title: 'Needs, Wants, and a $40 Week', sequence: 1, description: 'Sort family expenses, then defend which three are needs if income drops.' },
  { title: 'Income, Pay Stubs, and Gross vs Net', sequence: 2, description: 'Read a simplified pay stub and calculate what actually hits a checking account.' },
  { title: 'Track It: A Seven-Day Spending Log', sequence: 3, description: 'Log every spend, then group by category and look for leaks.' },
  { title: 'Saving Goals with a Number Line', sequence: 4, description: 'Set a 6-week goal, compute the weekly amount, and adjust when a surprise expense hits.' },
  { title: 'Consumer Choices at the Corner Store', sequence: 5, description: 'Compare unit prices and advertising claims using evidence, not slogans.' }
];

const roboticsUnitLessons = [
  { title: 'Inputs, Process, Outputs on a Classroom Bot', sequence: 1, description: 'Label sensors, controller decisions, and motors on a simple robot.' },
  { title: 'Sense the Line: Thresholds That Fail', sequence: 2, description: 'Test light sensors on tape vs tile and record false positives.' },
  { title: 'Program a Safe Stop', sequence: 3, description: 'Write a loop that stops before a barrier; debug the miss.' },
  { title: 'Iterate: Design Cycle After a Crash', sequence: 4, description: 'Change one variable at a time and log the result.' },
  { title: 'Showcase: Explain the System, Not the Trick', sequence: 5, description: 'Present the problem, the sensor data, and why the final program is safer.' }
];

const gameCourseUnits = [
  {
    title: 'Player Experience and Core Loops',
    sequence: 1,
    standardsFocus: 'Game design thinking: goals, feedback, and fair challenge.',
    lessons: [
      { title: 'What a Player Actually Does in 30 Seconds', sequence: 1, description: 'Map verbs, not features.' },
      { title: 'Feedback: Hit, Miss, and “I Get It”', sequence: 2, description: 'Design three feedback types for one mechanic.' },
      { title: 'Difficulty Without Cheap Tricks', sequence: 3, description: 'Tune a jump so it is readable.' }
    ]
  },
  {
    title: 'Programming Mechanics',
    sequence: 2,
    standardsFocus: 'Events, variables, and collision logic.',
    lessons: [
      { title: 'Events That Fire Once vs Every Frame', sequence: 4, description: 'Prevent a jump that rockets forever.' },
      { title: 'Variables as Game Memory', sequence: 5, description: 'Score, lives, and a cooldown.' },
      { title: 'Collision: Solid, Trigger, Ignore', sequence: 6, description: 'Debug a door that never opens.' }
    ]
  },
  {
    title: 'Levels, Art, and Playtest Notes',
    sequence: 3,
    standardsFocus: 'Iteration from real player evidence.',
    lessons: [
      { title: 'Build a Three-Room Tutorial', sequence: 7, description: 'Teach one verb per room.' },
      { title: 'Playtest Protocol', sequence: 8, description: 'Watch silently, log confusion, change one thing.' },
      { title: 'Publish Checklist and Credits', sequence: 9, description: 'Attribution, content rating, and a known-bugs list.' }
    ]
  },
  {
    title: 'Responsible Game Communities',
    sequence: 4,
    standardsFocus: 'Safety, chat norms, and player respect.',
    lessons: [
      { title: 'Chat Rules You Can Enforce', sequence: 10, description: 'Write three rules and the consequence ladder.' },
      { title: 'Loot, Fairness, and Predatory Patterns', sequence: 11, description: 'Evaluate a shop for dark patterns.' },
      { title: 'Capstone Pitch', sequence: 12, description: 'Pitch loop, evidence from playtests, and a safety plan.' }
    ]
  }
];

export const SAMPLE_CURRICULUMS = {
  finance: {
    country: 'USA',
    state: 'California',
    grade: 'Grade 6',
    language: 'English',
    course: 'Financial Literacy',
    need: 'Unit',
    isFree: false,
    isPublicSample: true,
    pricing: { lesson: 5, unit: 10, course: 100 },
    standardsBody: 'Jump$tart / state personal-finance expectations with CCSS mathematical practices for rates and unit price.',
    subjects: [{ name: 'Financial Literacy', topics: financeUnitLessons.map((lesson) => lesson.title) }],
    units: [
      {
        title: 'Money Decisions You Can Defend',
        sequence: 1,
        duration: '5 class periods',
        standardsFocus: 'Needs vs wants, income, tracking, saving, and unit price.',
        lessons: financeUnitLessons
      }
    ]
  },
  robotics: {
    country: 'USA',
    state: 'California',
    grade: 'Grade 7',
    language: 'English',
    course: 'Robotics',
    need: 'Unit',
    isFree: false,
    isPublicSample: true,
    pricing: { lesson: 5, unit: 10, course: 100 },
    standardsBody: 'CSTA / NGSS engineering design: sensors, control, and iteration.',
    subjects: [{ name: 'Robotics', topics: roboticsUnitLessons.map((lesson) => lesson.title) }],
    units: [
      {
        title: 'Sense, Decide, Move — Then Prove It',
        sequence: 1,
        duration: '5 class periods',
        standardsFocus: 'Robot systems, sensor thresholds, safe stop, iteration, explanation.',
        lessons: roboticsUnitLessons
      }
    ]
  },
  coding: {
    country: 'USA',
    state: 'California',
    grade: 'Grade 9',
    language: 'English',
    course: 'Game Development',
    need: 'Course',
    isFree: false,
    isPublicSample: true,
    pricing: { lesson: 5, unit: 10, course: 100 },
    standardsBody: 'CSTA 2-AP / 3A-AP: events, variables, testing, and responsible computing.',
    subjects: [{ name: 'Game Development', topics: gameCourseUnits.flatMap((unit) => unit.lessons.map((lesson) => lesson.title)) }],
    units: gameCourseUnits
  }
};

export const findSampleLesson = (topic = '', course = '') => {
  const text = `${topic} ${course}`.toLowerCase();
  if (/harbor|story elements|figurative|reading literature|characters, setting, plot/.test(text)) return READING_SAMPLE_LESSON;
  if (/physics|scientific inquiry|unbalanced|classroom cart/.test(text)) return PHYSICS_SAMPLE_LESSON;
  return null;
};

export const findSampleCurriculum = (need = '', course = '') => {
  const text = `${need} ${course}`.toLowerCase();
  if (/financial|money/.test(text)) return SAMPLE_CURRICULUMS.finance;
  if (/robot/.test(text)) return SAMPLE_CURRICULUMS.robotics;
  if (/game development|coding/.test(text)) return SAMPLE_CURRICULUMS.coding;
  if (/reading literature|story/.test(text)) {
    return {
      country: 'USA',
      state: 'California',
      grade: 'Grade 5',
      language: 'English',
      course: 'Reading Literature',
      need: 'Lesson',
      isFree: false,
      isPublicSample: true,
      pricing: { lesson: 5, unit: 10, course: 100 },
      standardsBody: 'CCSS ELA RL.5.3–RL.5.5 story structure and figurative language.',
      subjects: [{ name: 'Reading Literature', topics: [READING_SAMPLE_LESSON.title] }],
      units: [
        {
          title: 'Literary Elements in Narrative Text',
          sequence: 1,
          duration: '1 class period (sample) / 5-lesson unit available',
          standardsFocus: 'Character, setting, plot, metaphor, simile, personification.',
          lessons: [
            { title: READING_SAMPLE_LESSON.title, sequence: 1, description: 'Full 45-minute lesson with story, quiz, and teacher script.' },
            { title: 'Theme vs Topic in Harbor Stories', sequence: 2, description: 'Students separate “storms are scary” from “responsibility under pressure.”' },
            { title: 'Point of View: Mira’s Logbook', sequence: 3, description: 'Rewrite a scene in first person and evaluate what is lost.' },
            { title: 'Comparing Two Storm Poems', sequence: 4, description: 'Structure and figurative language across genres.' },
            { title: 'Performance Task: Write a One-Page Sequel', sequence: 5, description: 'Must include a turning point and two figurative devices used on purpose.' }
          ]
        }
      ]
    };
  }
  return null;
};

export const CATALOG_MARKETPLACE_ITEMS = [
  {
    id: 'catalog-harbor-light-lesson',
    title: 'Story Elements & Figurative Language: The Harbor Light',
    type: 'Lesson',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 5,
    creatorShare: 4,
    platformFee: 1,
    grade: 'Grade 5',
    country: 'USA',
    course: 'Reading Literature',
    summary: 'A complete 45-minute ELA lesson with an original narrative, RL.5.3–5.5 alignment, teacher script, worksheet, 10-item quiz, and answer key. Preview the full sample free.',
    content: READING_SAMPLE_LESSON.content,
    standards: 'CCSS RL.5.3, RL.5.4, RL.5.5',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    previewTopic: READING_SAMPLE_LESSON.topic,
    image: booksImg
  },
  {
    id: 'catalog-cart-inquiry-lesson',
    title: 'Unbalanced Forces Inquiry: The Classroom Cart',
    type: 'Lesson',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 5,
    creatorShare: 4,
    platformFee: 1,
    grade: 'Grade 9',
    country: 'USA',
    course: 'Physics',
    summary: 'Phenomenon-based HS-PS2 inquiry with data tables, force diagrams, CER, and a quiz that analyzes claims — not the lesson title.',
    content: PHYSICS_SAMPLE_LESSON.content,
    standards: 'HS-PS2-1, NGSS Science & Engineering Practices',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    previewTopic: PHYSICS_SAMPLE_LESSON.topic,
    image: physicsImg
  },
  {
    id: 'catalog-money-unit',
    title: 'Grade 6 Financial Literacy: Money Decisions You Can Defend',
    type: 'Unit',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 10,
    creatorShare: 8,
    platformFee: 2,
    grade: 'Grade 6',
    country: 'USA',
    course: 'Financial Literacy',
    summary: 'Five lessons on needs vs wants, pay stubs, spending logs, saving goals, and unit price. Includes quizzes and a family-budget performance task.',
    content: financeUnitLessons.map((lesson) => `${lesson.sequence}. ${lesson.title}: ${lesson.description}`).join('\n'),
    standards: 'Jump$tart / state personal finance + CCSS rates',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    previewNeed: 'Unit',
    previewCourse: 'Financial Literacy',
    image: moneyImg
  },
  {
    id: 'catalog-robotics-unit',
    title: 'Grade 7 Robotics: Sense, Decide, Move',
    type: 'Unit',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 10,
    creatorShare: 8,
    platformFee: 2,
    grade: 'Grade 7',
    country: 'USA',
    course: 'Robotics',
    summary: 'Five engineering lessons on sensors, thresholds, a safe-stop program, iteration, and a system explanation showcase.',
    content: roboticsUnitLessons.map((lesson) => `${lesson.sequence}. ${lesson.title}: ${lesson.description}`).join('\n'),
    standards: 'CSTA / NGSS engineering design',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    previewNeed: 'Unit',
    previewCourse: 'Robotics',
    image: robotImg
  },
  {
    id: 'catalog-game-dev-course',
    title: 'Grade 9 Game Development Course',
    type: 'Course',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 100,
    creatorShare: 80,
    platformFee: 20,
    grade: 'Grade 9',
    country: 'USA',
    course: 'Game Development',
    summary: 'Four units: player experience, programming mechanics, playtesting, and responsible game communities. 12 classroom-ready lessons with a capstone pitch.',
    content: gameCourseUnits.map((unit) => `${unit.title}: ${unit.lessons.map((lesson) => lesson.title).join('; ')}`).join('\n'),
    standards: 'CSTA 2-AP / 3A-AP',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    previewNeed: 'Course',
    previewCourse: 'Game Development',
    image: codingImg
  },
  {
    id: 'catalog-algebra-linear',
    title: 'Algebra I: Linear Relationships in a School Fundraiser',
    type: 'Lesson',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 5,
    creatorShare: 4,
    platformFee: 1,
    grade: 'Grade 8',
    country: 'USA',
    course: 'Algebra I',
    summary: 'Students model ticket sales with slope-intercept form, interpret intercepts in context, and compare two fundraising plans with evidence.',
    content: 'Context: a drama club needs $240. Students write y = mx + b for two price points, graph, and decide which plan hits the goal first. Includes misconception check on confusing slope with intercept.',
    standards: 'CCSS 8.F.B.4 / HSA-CED.A.2',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    image: '/sample-algebra.svg'
  },
  {
    id: 'catalog-biology-cells',
    title: 'Biology: Cell Membrane as a Gate, Not a Wall',
    type: 'Lesson',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 5,
    creatorShare: 4,
    platformFee: 1,
    grade: 'Grade 9',
    country: 'USA',
    course: 'Biology',
    summary: 'Osmosis demo, model, and CER. Quiz items ask students to evaluate “the cell wanted water” as a claim.',
    content: 'Students predict, observe a gummy-candy or potato osmosis demo, diagram the membrane, and write a CER that uses concentration language.',
    standards: 'HS-LS1-2 structure and function',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    image: '/sample-biology.svg'
  },
  {
    id: 'catalog-civics-rights',
    title: 'Civics: Rights, Responsibilities, and a School Policy Case',
    type: 'Unit',
    creatorName: 'Global LMS Warehouse',
    creatorEmail: 'studio@global-lms.org',
    price: 10,
    creatorShare: 8,
    platformFee: 2,
    grade: 'Grade 8',
    country: 'USA',
    course: 'Civics and Government',
    summary: 'Five lessons from the Bill of Rights to a mock hearing on a campus phone policy. Students must cite a clause, not a slogan.',
    content: 'Lessons: enumerated rights; limits and time/place/manner; majority vs minority protections; media literacy on civic claims; mock hearing.',
    standards: 'C3 D2.Civ.3.6-8 / D2.Civ.8.6-8',
    remixOf: '',
    certificationStatus: 'Certified teacher for this subject/grade',
    contributionMode: 'paid-marketplace',
    license: 'Classroom license. 30-day money-back.',
    status: 'published',
    image: '/sample-civics.svg'
  }
];

export const mergeMarketplaceCatalog = (remoteItems = []) => {
  const cleaned = (Array.isArray(remoteItems) ? remoteItems : []).filter((item) => !isJunkMarketplaceItem(item));
  const seen = new Set(CATALOG_MARKETPLACE_ITEMS.map((item) => item.title.toLowerCase()));
  const extras = cleaned.filter((item) => {
    const title = String(item.title || '').toLowerCase();
    if (seen.has(title)) return false;
    seen.add(title);
    return true;
  });
  return [...CATALOG_MARKETPLACE_ITEMS, ...extras];
};

export const SOCIAL_PROOF = [
  {
    quote: 'I built Global LMS because a $5 lesson should look like something I would actually teach tomorrow — script, text, quiz, and answer key — not a title stuffed into a template.',
    name: 'John Morris',
    role: 'Founder, classroom teacher'
  },
  {
    quote: 'Standard regions: $5 a lesson, $10 a unit, $100 a course. Stripe Checkout. 30-day money-back. High-need countries stay free.',
    name: 'Published pricing',
    role: 'Same numbers on Home, Pricing, and Checkout'
  },
  {
    quote: 'Warehouse lessons are packaged before a student sees them. That is not a live chatbot. Teachers still review before high-stakes use.',
    name: 'Safety promise',
    role: 'Aligned with the About page'
  }
];

export const PRODUCT_TOUR = [
  {
    id: 'tour-pick',
    title: '1. Pick grade and subject',
    description: 'Choose Grade 5 Reading, Grade 9 Physics, or another catalog course. No account needed to look.',
    action: 'Open the builder',
    href: '/'
  },
  {
    id: 'tour-sample',
    title: '2. Read a real sample',
    description: 'Open “The Harbor Light”: original story, 45-minute teacher script, worksheet, and a quiz about that text.',
    action: 'Preview the sample lesson',
    href: '/sample'
  },
  {
    id: 'tour-buy',
    title: '3. Buy in Stripe — $5 / $10 / $100',
    description: 'Checkout collects email. You do not have to create a Student account first. 30-day money-back.',
    action: 'See pricing',
    href: '/pricing'
  }
];
