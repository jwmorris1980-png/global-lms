require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const z = require('zod/v4');
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const hasStripeSecret = /^sk_(test|live)_/.test(STRIPE_SECRET_KEY) && !/placeholder|000000/i.test(STRIPE_SECRET_KEY);
const stripe = hasStripeSecret ? require('stripe')(STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' }) : null;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://www.global-lms.org').trim().slice(0, 120);
const CHATGPT_APP_WIDGET_URI = 'ui://widget/quick-draft.html';
const CHATGPT_APP_WIDGET_PATH = path.join(__dirname, 'public', 'chatgpt-app.html');
const ALLOWED_ORIGINS = new Set([
    PUBLIC_APP_URL,
    'https://global-lms.org',
    'https://www.global-lms.org',
    'http://localhost:5188',
    'http://127.0.0.1:5188',
    'http://[::1]:5188',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:3000',
    'http://[::1]:5173',
    'http://[::1]:4173',
    'http://[::1]:3000',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
]);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.OWNER_ADMIN_TOKEN || '';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 180);
const rateLimitBuckets = new Map();
const AI_BUILDER_COSTS = { Lesson: 1, Unit: 3, Course: 10 };
const AI_BUILDER_FREE_SIGNED_CREDITS = Number(process.env.AI_BUILDER_FREE_SIGNED_CREDITS || 5);
const FREE_LESSON_LIMIT = Number(process.env.FREE_LESSON_LIMIT || 6);
const GUEST_FREE_LESSON_LIMIT = Number(process.env.GUEST_FREE_LESSON_LIMIT || 1);
const GEMINI_25_FLASH_INPUT_PER_MILLION = Number(process.env.GEMINI_25_FLASH_INPUT_PER_MILLION || 0.30);
const GEMINI_25_FLASH_OUTPUT_PER_MILLION = Number(process.env.GEMINI_25_FLASH_OUTPUT_PER_MILLION || 2.50);
const OLLAMA_BASE_URL = String(process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
const AI_CREDIT_PACKS = {
    starter: { id: 'starter', label: 'Starter AI credits', credits: 20, amountCents: 500 },
    builder: { id: 'builder', label: 'Builder AI credits', credits: 45, amountCents: 1000 }
};

// --- 🗄️ DATABASE INITIALIZATION ---
const db = new Firestore({
    projectId: 'gen-lang-client-0007979237',
    ignoreUndefinedProperties: true,
});
const studentsCol = db.collection('students');
const usageEventsCol = db.collection('usage_events');
const lessonsCol = db.collection('lessons');
const curriculumCol = db.collection('curriculums');
const marketplaceCol = db.collection('marketplace_items');
const aiBuilderUsageCol = db.collection('ai_builder_usage');
const aiBuilderGenerationsCol = db.collection('ai_builder_generations');
const aiCreditPurchasesCol = db.collection('ai_credit_purchases');
const paymentOrdersCol = db.collection('payment_orders');
const newsletterSubscribersCol = db.collection('newsletter_subscribers');
const guestLessonUsageCol = db.collection('guest_lesson_usage');
const WAREHOUSE_DIR = path.join(__dirname, 'warehouse');
const CURRICULUM_DIR = path.join(WAREHOUSE_DIR, 'curriculums');
const LESSONS_DIR = path.join(WAREHOUSE_DIR, 'lessons');
const PACKAGES_DIR = path.join(WAREHOUSE_DIR, 'packages');
const APPROVED_LESSONS_DIR = path.join(__dirname, 'data', 'approved-lessons');
const WORKSPACE_ROOT = path.resolve(process.env.LOCAL_WORKSPACE_ROOT || path.join(__dirname, 'scratch', 'agent-workspace'));

[WAREHOUSE_DIR, CURRICULUM_DIR, LESSONS_DIR, PACKAGES_DIR, WORKSPACE_ROOT].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function loadCuratedLessonById(id) {
    const safeId = String(id || '').trim().toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(safeId)) return null;
    const file = path.join(APPROVED_LESSONS_DIR, `${safeId}.json`);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error('[Curated lesson read error]', err.message);
        return null;
    }
}

function findCuratedLesson(body = {}) {
    const byId = loadCuratedLessonById(body.approvedLessonId);
    if (byId) return byId;
    if (!fs.existsSync(APPROVED_LESSONS_DIR)) return null;
    const topic = cleanString(body.topic, 180).toLowerCase();
    const course = cleanString(body.course, 160).toLowerCase();
    if (!topic) return null;
    for (const fileName of fs.readdirSync(APPROVED_LESSONS_DIR)) {
        if (!fileName.endsWith('.json')) continue;
        const lesson = loadCuratedLessonById(fileName.replace(/\.json$/i, ''));
        if (!lesson) continue;
        const lessonTopic = String(lesson.topic || '').trim().toLowerCase();
        const lessonCourse = String(lesson.course || '').trim().toLowerCase();
        if (lessonTopic === topic && (!course || lessonCourse === course)) return lesson;
    }
    return null;
}

const firestoreReady = () => Boolean(
    process.env.K_SERVICE
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIRESTORE_EMULATOR_HOST
);

function isPublicMarketplaceItem(item = {}) {
    const title = String(item.title || '').trim();
    const normalized = title.toLowerCase();
    if (!title || title.length < 4) return false;
    if (String(item.id || '').startsWith('sample-')) return false;
    if (/^(test|untitled|demo|sample|asdf|xxx|tbd|n\/a|na)\b/i.test(normalized)) return false;
    if (normalized.includes('untitled')) return false;
    const summary = String(item.summary || '').trim().toLowerCase();
    const content = String(item.content || '').trim().toLowerCase();
    if (summary === 'test' || content === 'test' || summary === 'asdf' || content === 'asdf') return false;
    return true;
}

const cleanString = (value = '', maxLength = 5000) => (
    String(value || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, maxLength)
);
const resolveWorkspacePath = (inputPath = '') => {
    const safeInput = String(inputPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(WORKSPACE_ROOT, safeInput);
    const relative = path.relative(WORKSPACE_ROOT, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        const err = new Error('Invalid workspace path');
        err.statusCode = 400;
        throw err;
    }
    return resolved;
};
const workspaceStats = (entryPath) => {
    const stat = fs.statSync(entryPath);
    return {
        name: path.basename(entryPath),
        path: path.relative(WORKSPACE_ROOT, entryPath).replace(/\\/g, '/'),
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString()
    };
};
const readWorkspaceTree = (dirPath = WORKSPACE_ROOT) => {
    const entries = fs.existsSync(dirPath) ? fs.readdirSync(dirPath, { withFileTypes: true }) : [];
    return entries
        .map((entry) => {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, '/');
            if (entry.isDirectory()) {
                return {
                    ...workspaceStats(fullPath),
                    children: readWorkspaceTree(fullPath)
                };
            }
            const stat = fs.statSync(fullPath);
            return {
                name: entry.name,
                path: relativePath,
                type: 'file',
                size: stat.size,
                modifiedAt: stat.mtime.toISOString()
            };
        })
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
};
const cleanEmail = (value = '') => {
    const email = cleanString(value, 254)
        .replace(/\s*@\s*/g, '@')
        .replace(/@gmail\s+com$/i, '@gmail.com')
        .replace(/\s*\.\s*/g, '.')
        .toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};
const OWNER_EMAILS = new Set(['jwmorris1980@gmail.com', 'support@global-lms.org'].map(cleanEmail));
const isOwnerAdminEmail = (email = '') => OWNER_EMAILS.has(cleanEmail(email));
const publicAccountRole = (role = 'Student') => cleanString(role, 40) === 'Teacher' ? 'Teacher' : 'Student';
const roleForEmail = (email = '', requestedRole = 'Student') => (
    isOwnerAdminEmail(email) ? 'Admin' : publicAccountRole(requestedRole)
);
const amountCentsFromPrice = (value, fallbackCents = 500) => {
    const normalized = String(value || '').replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackCents;
    return Math.max(100, Math.round(parsed * 100));
};
const userIdForEmail = (email) => crypto.createHash('sha256').update(email).digest('hex').slice(0, 32);
const usageIdForIdentity = (identity) => crypto.createHash('sha256').update(identity).digest('hex').slice(0, 40);
const estimateGeminiCost = (usage = {}) => {
    const inputTokens = Number(usage.promptTokenCount || usage.inputTokenCount || 0);
    const outputTokens = Number(usage.candidatesTokenCount || usage.outputTokenCount || 0);
    const totalTokens = Number(usage.totalTokenCount || inputTokens + outputTokens || 0);
    const estimatedInputCost = (inputTokens / 1000000) * GEMINI_25_FLASH_INPUT_PER_MILLION;
    const estimatedOutputCost = (outputTokens / 1000000) * GEMINI_25_FLASH_OUTPUT_PER_MILLION;
    const estimatedCost = estimatedInputCost + estimatedOutputCost;
    return {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedInputCost: Number(estimatedInputCost.toFixed(6)),
        estimatedOutputCost: Number(estimatedOutputCost.toFixed(6)),
        estimatedCost: Number(estimatedCost.toFixed(6)),
        pricing: {
            model: 'gemini-2.5-flash',
            inputPerMillion: GEMINI_25_FLASH_INPUT_PER_MILLION,
            outputPerMillion: GEMINI_25_FLASH_OUTPUT_PER_MILLION
        }
    };
};
const publicStudent = (doc) => {
    const data = doc.data();
    const lessonOpenCount = data.lessonOpenCount || 0;
    const toIso = (value) => value?.toDate ? value.toDate().toISOString() : value || null;
    return {
        id: doc.id,
        email: data.email || '',
        name: data.name || '',
        role: data.role || '',
        workspaceType: data.workspaceType || '',
        workspaceName: data.workspaceName || '',
        planCount: data.planCount || 0,
        lessonOpenCount,
        freeLessonLimit: FREE_LESSON_LIMIT,
        freeLessonRemaining: Math.max(FREE_LESSON_LIMIT - lessonOpenCount, 0),
        lastPlan: data.lastPlan || null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        lastSeenAt: toIso(data.lastSeenAt)
    };
};
const toIso = (value) => value?.toDate ? value.toDate().toISOString() : value || null;
const dayKey = (value) => {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};
const publicUsageSummary = async () => {
    const [studentsCount, eventsCount, plansCount, lessonsCount, newsletterCount, paymentOrdersCount, aiCreditCount] = await Promise.all([
        studentsCol.count().get(),
        usageEventsCol.count().get(),
        curriculumCol.count().get(),
        lessonsCol.count().get(),
        newsletterSubscribersCol.count().get(),
        paymentOrdersCol.count().get(),
        aiCreditPurchasesCol.count().get()
    ]);
    const eventsSnapshot = await usageEventsCol.orderBy('timestamp', 'desc').limit(500).get();
    const events = eventsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const today = new Date().toISOString().slice(0, 10);
    const pageViews = events.filter((event) => event.type === 'page_view');
    const lessonOpens = events.filter((event) => event.type === 'lesson_open');
    const interactiveEvents = events.filter((event) => (
        String(event.type || '').startsWith('activity_') ||
        ['quiz_answer', 'lesson_whiteboard_toggle', 'instant_demo_click', 'build_plan_click', 'builder_field_change', 'catalog_search_select'].includes(event.type)
    ));
    const uniqueCount = (items) => new Set(items.map((item) => item.visitorId).filter(Boolean)).size;
    const countBy = (items, getter, limit = 10) => (
        Object.entries(items.reduce((acc, item) => {
            const key = getter(item);
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}))
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit)
    );
    const dailyMap = events.reduce((acc, event) => {
        const day = dayKey(event.timestamp);
        if (!day) return acc;
        if (!acc[day]) acc[day] = { date: day, events: 0, pageViews: 0, lessonOpens: 0, interactiveEvents: 0, visitors: new Set() };
        acc[day].events += 1;
        if (event.type === 'page_view') acc[day].pageViews += 1;
        if (event.type === 'lesson_open') acc[day].lessonOpens += 1;
        if (interactiveEvents.includes(event)) acc[day].interactiveEvents += 1;
        if (event.visitorId) acc[day].visitors.add(event.visitorId);
        return acc;
    }, {});
    const daily = Object.values(dailyMap)
        .map((item) => ({ ...item, uniqueVisitors: item.visitors.size, visitors: undefined }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 14);
    const todayEvents = events.filter((event) => dayKey(event.timestamp) === today);
    return {
        generatedAt: new Date().toISOString(),
        counts: {
            users: studentsCount.data().count,
            usageEvents: eventsCount.data().count,
            savedCurriculums: plansCount.data().count,
            lessons: lessonsCount.data().count,
            newsletterSubscribers: newsletterCount.data().count,
            totalPurchases: paymentOrdersCount.data().count + aiCreditCount.data().count,
            recentEventsSampled: events.length,
            pageViews: pageViews.length,
            uniqueVisitors: uniqueCount(events),
            lessonOpens: lessonOpens.length,
            interactiveEvents: interactiveEvents.length,
            signIns: events.filter((event) => event.type === 'sign_in').length,
            savedPlans: events.filter((event) => event.type === 'save_plan').length
        },
        today: {
            date: today,
            events: todayEvents.length,
            pageViews: todayEvents.filter((event) => event.type === 'page_view').length,
            uniqueVisitors: uniqueCount(todayEvents),
            lessonOpens: todayEvents.filter((event) => event.type === 'lesson_open').length,
            interactiveEvents: todayEvents.filter((event) => interactiveEvents.includes(event)).length
        },
        daily,
        topLessons: countBy(lessonOpens, (event) => event.topic),
        topCourses: countBy(events, (event) => event.plan?.course),
        eventTypes: countBy(events, (event) => event.type, 12),
        recentActivity: events.slice(0, 20).map((event) => ({
            type: event.type || '',
            topic: event.topic || '',
            path: event.path || '',
            course: event.plan?.course || '',
            timestamp: toIso(event.timestamp)
        }))
    };
};
const newsletterSubscriberIdForEmail = (email) => crypto.createHash('sha256').update(`newsletter:${email}`).digest('hex').slice(0, 32);
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
const rateLimiter = (req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return next();
    const key = `${clientIp(req)}:${req.path}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    if (now > bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);
    if (bucket.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
    }
    next();
};
const requireAdmin = (req, res, next) => {
    if (!ADMIN_TOKEN) return next();
    const provided = req.get('x-admin-token') || req.query.token || '';
    const providedBuffer = Buffer.from(provided);
    const tokenBuffer = Buffer.from(ADMIN_TOKEN);
    if (providedBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(providedBuffer, tokenBuffer)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};
const appUrlForRequest = (req) => {
    const origin = req.get('origin') || '';
    try {
        if (origin && (ALLOWED_ORIGINS.has(origin) || /\.vercel\.app$/.test(new URL(origin).hostname))) return origin;
    } catch {}
    return PUBLIC_APP_URL;
};

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
    const camelotPreview = req.path === '/camelot-rpg-preview.html';
    const contentSecurityPolicy = camelotPreview
        ? "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; media-src 'self' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://lms-global-682818593798.us-central1.run.app https://api.stripe.com; frame-src https://js.stripe.com https://www.youtube-nocookie.com;"
        : "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; media-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://lms-global-682818593798.us-central1.run.app https://api.stripe.com; frame-src https://js.stripe.com https://www.youtube-nocookie.com;";
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    if (camelotPreview) res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use(cors({
    origin(origin, callback) {
        try {
            if (!origin || ALLOWED_ORIGINS.has(origin) || /\.vercel\.app$/.test(new URL(origin).hostname)) {
                return callback(null, true);
            }
        } catch {
            return callback(new Error('CORS origin blocked'));
        }
        return callback(new Error('CORS origin blocked'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
    maxAge: 86400
}));
app.use((err, req, res, next) => {
    if (err?.message === 'CORS origin blocked') {
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    next(err);
});
app.use(rateLimiter);
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe webhook is not configured.' });
        const signature = req.get('stripe-signature');
        const event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.metadata?.type === 'ai_credits') {
                const safeEmail = cleanEmail(session.metadata.email);
                const pack = AI_CREDIT_PACKS[session.metadata.packId];
                if (safeEmail && pack) {
                    const purchaseRef = aiCreditPurchasesCol.doc(session.id);
                    const userRef = studentsCol.doc(userIdForEmail(safeEmail));
                    await db.runTransaction(async (transaction) => {
                        const purchaseDoc = await transaction.get(purchaseRef);
                        if (purchaseDoc.exists) return;
                        transaction.set(purchaseRef, {
                            email: safeEmail,
                            packId: pack.id,
                            credits: pack.credits,
                            amountCents: pack.amountCents,
                            stripeSessionId: session.id,
                            paymentStatus: session.payment_status,
                            createdAt: new Date()
                        });
                        transaction.set(userRef, {
                            email: safeEmail,
                            aiCreditBalance: FieldValue.increment(pack.credits),
                            aiCreditsPurchased: FieldValue.increment(pack.credits),
                            lastSeenAt: new Date(),
                            updatedAt: new Date(),
                            createdAt: new Date()
                        }, { merge: true });
                    });
                }
            }
            if (session.metadata?.type === 'marketplace_order') {
                await paymentOrdersCol.doc(session.id).set({
                    stripeSessionId: session.id,
                    paymentStatus: session.payment_status || '',
                    customerEmail: cleanEmail(session.customer_details?.email || session.customer_email || session.metadata.buyerEmail),
                    marketplaceItemId: cleanString(session.metadata.marketplaceItemId, 120),
                    itemName: cleanString(session.metadata.itemName, 180),
                    creatorEmail: cleanEmail(session.metadata.creatorEmail),
                    creatorShare: cleanString(session.metadata.creatorShare, 20),
                    platformFee: cleanString(session.metadata.platformFee, 20),
                    amountTotal: Number(session.amount_total || 0),
                    currency: cleanString(session.currency || 'usd', 10),
                    createdAt: new Date()
                }, { merge: true });
            }
        }
        res.json({ received: true });
    } catch (err) {
        console.error('[Stripe Webhook Error]:', err);
        res.status(400).json({ error: 'Webhook handling failed' });
    }
});
app.use(express.json({ limit: '2mb' }));

// Serve static files from the 'dist' directory
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.get(['/health', '/api/health'], (req, res) => {
    res.json({ status: 'healthy', time: new Date().toISOString() });
});

app.get('/api/version', (req, res) => {
    res.json({
        version: 'ai-builder-2026-05-11',
        aiBuilder: true,
        creditPacks: Object.keys(AI_CREDIT_PACKS)
    });
});

// ── YouTube static map (pre-baked, zero API cost) ───────────────
let ytStaticMap = {};
try {
  const mapPath = path.join(__dirname, 'video-map.json');
  if (fs.existsSync(mapPath)) {
    ytStaticMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    console.log(`[youtube] Loaded static map: ${Object.keys(ytStaticMap).length} entries`);
  }
} catch (e) { console.warn('[youtube] Could not load video-map.json:', e.message); }

// ── YouTube video search ────────────────────────────────────────
const ytVideoCache = new Map(); // key → { videoId, ts }
const YT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in-process
const ALLOW_LIVE_YOUTUBE_LOOKUP = String(process.env.ALLOW_LIVE_YOUTUBE_LOOKUP || '').toLowerCase() === 'true';
const normalizeVideoText = (value = '') => cleanString(value, 600)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*\*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const looksSpanishText = (value = '') => /[ñáéíóúü¿¡]|\b(el|la|los|las|una|unas|que|con|para|como|estudiantes|grado|matematicas|ciencias|espanol|palabras|leccion|aprendizaje)\b/i.test(String(value || ''));
const isSpanishVideoContext = ({ language = '', course = '', country = '' } = {}) => (
    /spanish|español/i.test(`${language} ${course}`) ||
    (SPANISH_COUNTRIES.includes(country) && !/english/i.test(language))
);
const videoMatchScore = (haystack = '', needles = []) => {
    const text = normalizeVideoText(haystack);
    return needles.filter((token) => token.length >= 4 && text.includes(token)).length;
};
app.get('/api/youtube-video', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 300);
    const course = cleanString(req.query.course, 120);
    const grade = cleanString(req.query.grade, 40);
    const country = cleanString(req.query.country, 80);
    const language = cleanString(req.query.language, 40) || 'English';
    const topic = cleanString(req.query.topic, 220) || q;
    if (!q) return res.status(400).json({ error: 'query required' });
    const spanishContext = isSpanishVideoContext({ language, course, country });
    const langCode = spanishContext ? 'es' : 'en';
    const matchTokens = normalizeVideoText(`${grade} ${course} ${topic}`)
        .split(' ')
        .filter((token) => token.length >= 4 && !['grade', 'lesson', 'students', 'explained', 'course', 'investigate', 'model', 'explain', 'practice', 'apply', 'introduction', 'understanding', 'exploring'].includes(token))
        .slice(0, 12);
    const requiredScore = Math.min(2, Math.max(1, matchTokens.length));
    const cacheKey = normalizeVideoText(`${langCode} ${country} ${grade} ${course} ${topic} ${q}`);

    // 1. Check static pre-baked map first (free — no API call)
    const staticEntry = Object.entries(ytStaticMap).find(([key, id]) => {
        if (!id) return false;
        const normalizedKey = normalizeVideoText(key);
        const keyIsSpanish = looksSpanishText(key);
        if (!spanishContext && keyIsSpanish) return false;
        if (spanishContext && /spanish|espanol/i.test(`${language} ${course}`) && !keyIsSpanish && !/spanish|espanol/i.test(key)) return false;
        const gradeOk = !grade || normalizedKey.includes(normalizeVideoText(grade));
        // Older manually-added videos may be keyed by grade + lesson title only.
        // The topic score below still has to match, so we allow missing course
        // text while rejecting wrong-topic and wrong-language entries.
        const courseOk = true;
        return gradeOk && courseOk && videoMatchScore(key, matchTokens) >= requiredScore;
    });
    if (staticEntry) {
      return res.json({ videoId: staticEntry[1], cached: true, source: 'static-map', language: langCode });
    }

    // Pre-baked IDs are the normal production path. Keep live search opt-in so
    // an uncovered lesson cannot unexpectedly consume API quota.
    if (!ALLOW_LIVE_YOUTUBE_LOOKUP) {
        return res.status(404).json({ error: 'No pre-baked video available', fallback: 'narration' });
    }

    const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
    if (!YOUTUBE_API_KEY) return res.status(503).json({ error: 'YouTube API not configured' });

    // 2. Serve from in-process cache
    const cached = ytVideoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < YT_CACHE_TTL) {
        return res.json({ videoId: cached.videoId, cached: true, language: langCode });
    }

    try {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        const searchQuery = spanishContext
            ? `${grade} ${course} ${topic} leccion para estudiantes`
            : `${grade} ${course} ${topic} lesson for students English`;
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('q', searchQuery);
        url.searchParams.set('type', 'video');
        url.searchParams.set('videoEmbeddable', 'true');
        url.searchParams.set('maxResults', '8');
        url.searchParams.set('relevanceLanguage', langCode);
        url.searchParams.set('regionCode', spanishContext ? 'MX' : 'US');
        url.searchParams.set('safeSearch', 'strict');
        url.searchParams.set('key', YOUTUBE_API_KEY);
        const resp = await fetch(url.toString());
        if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            return res.status(resp.status).json({ error: 'YouTube API error', details: errBody });
        }
        const data = await resp.json();
        const candidates = (data.items || []).filter((item) => {
            const text = `${item.snippet?.title || ''} ${item.snippet?.description || ''}`;
            if (!item.id?.videoId) return false;
            if (!spanishContext && looksSpanishText(text)) return false;
            return videoMatchScore(text, matchTokens) >= requiredScore;
        });
        const videoId = candidates[0]?.id?.videoId;
        if (!videoId) return res.status(404).json({ error: 'No exact matching embeddable video found' });
        ytVideoCache.set(cacheKey, { videoId, ts: Date.now() });
        res.json({ videoId, language: langCode, matchedTitle: candidates[0]?.snippet?.title || '' });
    } catch (err) {
        console.error('[youtube-video]', err.message);
        res.status(500).json({ error: 'YouTube lookup failed' });
    }
});

app.get('/api/payments/config', (req, res) => {
    res.json({
        configured: Boolean(stripe),
        mode: stripe ? (STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test') : 'not_configured',
        checkout: 'stripe_hosted',
        webhookConfigured: Boolean(stripe && STRIPE_WEBHOOK_SECRET)
    });
});

const normalizeOllamaMessages = (messages = []) => (
    Array.isArray(messages)
        ? messages
            .map((message) => ({
                role: ['system', 'user', 'assistant', 'tool'].includes(message?.role) ? message.role : 'user',
                content: cleanString(message?.content, 120000)
            }))
            .filter((message) => message.content)
        : []
);

app.get('/api/ollama/models', async (req, res) => {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || data.message || `Ollama returned ${response.status}`);
        }

        const models = Array.isArray(data.models)
            ? data.models.map((model) => ({
                name: model?.name || '',
                modified_at: model?.modified_at || null,
                size: model?.size || null,
                digest: model?.digest || '',
                details: model?.details || {}
            })).filter((model) => model.name)
            : [];

        res.json({
            baseUrl: OLLAMA_BASE_URL,
            count: models.length,
            models
        });
    } catch (err) {
        res.status(503).json({
            error: 'Ollama unavailable',
            detail: err.message || 'Could not reach the local Ollama instance.',
            baseUrl: OLLAMA_BASE_URL
        });
    }
});

app.post('/api/ollama/chat', async (req, res) => {
    const body = req.body || {};
    const modelName = cleanString(body.model, 128);
    const messages = normalizeOllamaMessages(body.messages);
    if (!modelName) {
        return res.status(400).json({ error: 'A model is required.' });
    }
    if (!messages.length) {
        return res.status(400).json({ error: 'At least one message is required.' });
    }

    const controller = new AbortController();
    const abortOnClose = () => controller.abort();
    req.on('close', abortOnClose);

    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/x-ndjson'
            },
            body: JSON.stringify({
                model: modelName,
                messages,
                stream: body.stream !== false,
                options: body.options && typeof body.options === 'object' ? body.options : undefined
            }),
            signal: controller.signal
        });

        if (body.stream === false) {
            const text = await response.text().catch(() => '');
            if (!response.ok) {
                return res.status(response.status).json({
                    error: 'Ollama request failed',
                    detail: text || `Ollama returned ${response.status}`
                });
            }
            try {
                return res.json(text ? JSON.parse(text) : {});
            } catch {
                return res.status(502).json({
                    error: 'Unable to parse Ollama response',
                    detail: 'The local model returned malformed JSON.'
                });
            }
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            return res.status(response.status).json({
                error: 'Ollama request failed',
                detail: errorText || `Ollama returned ${response.status}`
            });
        }

        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        if (!response.body) {
            return res.end();
        }

        const reader = response.body.getReader();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        res.end();
    } catch (err) {
        const statusCode = err.name === 'AbortError' ? 499 : 502;
        if (!res.headersSent) {
            res.status(statusCode).json({
                error: err.name === 'AbortError' ? 'Request aborted' : 'Ollama proxy failed',
                detail: err.message || 'Could not proxy the chat request.'
            });
        } else {
            res.end();
        }
    } finally {
        req.removeListener('close', abortOnClose);
    }
});

app.get('/api/workspace', (req, res) => {
    try {
        res.json({
            root: path.relative(__dirname, WORKSPACE_ROOT).replace(/\\/g, '/'),
            items: readWorkspaceTree(WORKSPACE_ROOT)
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            error: 'Failed to read workspace',
            detail: err.message || 'Could not inspect the local workspace.'
        });
    }
});

app.get('/api/workspace/file', (req, res) => {
    try {
        const filePath = String(req.query.path || '');
        const resolved = resolveWorkspacePath(filePath);
        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            return res.status(400).json({ error: 'Path is a directory' });
        }
        res.json({
            path: filePath.replace(/\\/g, '/'),
            name: path.basename(resolved),
            content: fs.readFileSync(resolved, 'utf8'),
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            error: 'Failed to open file',
            detail: err.message || 'Could not read the selected file.'
        });
    }
});

app.put('/api/workspace/file', (req, res) => {
    try {
        const filePath = cleanString(req.body?.path, 500);
        if (!filePath) return res.status(400).json({ error: 'A file path is required.' });
        const content = String(req.body?.content ?? '');
        const resolved = resolveWorkspacePath(filePath);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf8');
        const stat = fs.statSync(resolved);
        res.json({
            ok: true,
            path: filePath.replace(/\\/g, '/'),
            name: path.basename(resolved),
            modifiedAt: stat.mtime.toISOString(),
            size: stat.size
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            error: 'Failed to save file',
            detail: err.message || 'Could not save the file.'
        });
    }
});

app.post('/api/workspace/folder', (req, res) => {
    try {
        const folderPath = cleanString(req.body?.path, 500);
        if (!folderPath) return res.status(400).json({ error: 'A folder path is required.' });
        const resolved = resolveWorkspacePath(folderPath);
        fs.mkdirSync(resolved, { recursive: true });
        res.json({
            ok: true,
            path: folderPath.replace(/\\/g, '/')
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            error: 'Failed to create folder',
            detail: err.message || 'Could not create the folder.'
        });
    }
});

app.delete('/api/workspace/file', (req, res) => {
    try {
        const filePath = cleanString(req.body?.path || req.query.path || '', 500);
        if (!filePath) return res.status(400).json({ error: 'A file path is required.' });
        const resolved = resolveWorkspacePath(filePath);
        if (!fs.existsSync(resolved)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            return res.status(400).json({ error: 'Use the folder endpoint to create or remove folders.' });
        }
        fs.unlinkSync(resolved);
        res.json({ ok: true, path: filePath.replace(/\\/g, '/') });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            error: 'Failed to delete file',
            detail: err.message || 'Could not delete the file.'
        });
    }
});

// --- 📚 CURRICULUM ENGINE ---
const GLOBAL_COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
    "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
    "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
    "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
    "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
    "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
    "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
    "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
    "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo",
    "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
    "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius",
    "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
    "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway",
    "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland",
    "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
    "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
    "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland",
    "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia",
    "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "UK", "USA", "Uruguay", "Uzbekistan",
    "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];
const GLOBAL_COURSES = [
    "General Education", "English Language Arts", "Reading Literature", "Writing and Communication", "Mathematics", "Pre-Algebra", "Algebra I", "Geometry", "Algebra II", "Precalculus", "Calculus", "Statistics",
    "Science", "Earth Science", "Life Science", "Physical Science", "Biology", "Chemistry", "Physics", "Environmental Science", "World History", "US History", "European History", "Civics and Government", "Geography", "Psychology", "Sociology",
    "Global Economics", "Personal Finance", "Financial Literacy", "Law and Legal Literacy", "Computer Science", "Programming and App Development", "Coding and Robotics", "Robotics", "Game Development", "Digital Citizenship", "Engineering Design", "Career and Technical Education", "Job Skills", "Resume and Cover Letter Writing", "Interview Skills", "Business and Entrepreneurship", "Marketing", "Agriculture", "Media Arts",
    "Creative Writing", "Journalism", "Speech and Debate", "World Languages", "Spanish", "French", "German", "Mandarin Chinese", "Arabic", "ESL / English Learners", "Art History", "Visual Arts", "Music Theory", "Theater", "Dance",
    "Physical Education", "Health", "First Aid and Safety", "Nutrition and Wellness", "Life Skills", "Study Skills", "Exam Prep", "College and Career Readiness", "Media Literacy", "Consumer Skills", "Home and Independent Living", "Social Emotional Learning", "Special Education Support",
    "Behavior Management", "Teaching Methods and Pedagogy", "Online and Blended Learning", "Philosophy of Education",
    "AP English Language", "AP English Literature", "AP Calculus AB", "AP Calculus BC", "AP Statistics", "AP Biology", "AP Chemistry", "AP Physics", "AP Environmental Science", "AP Computer Science Principles", "AP Computer Science A",
    "AP World History", "AP US History", "AP Government and Politics", "AP Macroeconomics", "AP Microeconomics", "AP Psychology", "AP Human Geography", "AP Spanish Language", "AP French Language", "AP Art and Design"
];
const STATE_OPTIONS = ["California", "Texas", "New York", "Florida", "Mississippi", "Illinois", "Washington", "Georgia", "Ohio", "Pennsylvania"];
const FREE_COUNTRIES = ["Pakistan", "Zimbabwe", "Afghanistan", "South Sudan", "Yemen", "Somalia", "Ethiopia", "Ukraine", "Palestine", "Sudan", "Haiti"];
const TIER1_COUNTRIES = ["Mexico", "Brazil", "India", "Vietnam", "Egypt", "Indonesia", "Philippines", "Nigeria", "Kenya", "South Africa"];
const SPANISH_COUNTRIES = ["Argentina", "Bolivia", "Chile", "Colombia", "Costa Rica", "Cuba", "Dominican Republic", "Ecuador", "El Salvador", "Guatemala", "Honduras", "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru", "Spain", "Uruguay", "Venezuela"];
const PORTUGUESE_COUNTRIES = ["Brazil", "Portugal", "Angola", "Mozambique"];
const FRENCH_COUNTRIES = ["France", "Belgium", "Benin", "Burkina Faso", "Burundi", "Cameroon", "Canada", "Chad", "Congo", "Gabon", "Guinea", "Haiti", "Luxembourg", "Madagascar", "Mali", "Monaco", "Niger", "Rwanda", "Senegal", "Switzerland", "Togo"];
const COURSE_BLUEPRINTS = {
    "English Language Arts": ["Reading comprehension and vocabulary", "Writing process and conventions", "Speaking, listening, and discussion", "Research, media literacy, and presentation"],
    "Mathematics": ["Number sense and operations", "Algebraic thinking and patterns", "Geometry and measurement", "Data, probability, and modeling"],
    "Pre-Algebra": ["Ratios, integers, and expressions", "Equations and inequalities", "Functions and graphing", "Geometry, data, and probability"],
    "Algebra I": ["Linear expressions and equations", "Functions and graphs", "Systems, inequalities, and modeling", "Quadratic and exponential relationships"],
    "Geometry": ["Lines, angles, and transformations", "Triangles, proof, and congruence", "Similarity, right triangles, and trigonometry", "Circles, area, volume, and modeling"],
    "Algebra II": ["Polynomial, rational, and radical functions", "Exponential and logarithmic models", "Trigonometry and periodic functions", "Statistics, sequences, and advanced modeling"],
    "Precalculus": ["Functions and transformations", "Trigonometry and analytic geometry", "Exponential, logarithmic, and rational models", "Limits, vectors, and readiness for calculus"],
    "Calculus": ["Limits and continuity", "Derivatives and applications", "Integrals and accumulation", "Differential equations and modeling"],
    "Statistics": ["Data collection and displays", "Probability and simulation", "Inference and confidence", "Regression, modeling, and interpretation"],
    "Science": ["Scientific inquiry and engineering design", "Life systems and ecosystems", "Matter, energy, and forces", "Earth, space, and environmental systems"],
    "Earth Science": ["Earth systems and geology", "Weather, climate, and water", "Space systems and astronomy", "Human impact and natural hazards"],
    "Life Science": ["Cells, organisms, and body systems", "Genetics and heredity", "Ecosystems and energy flow", "Evolution, adaptation, and biodiversity"],
    "Physical Science": ["Matter and chemical interactions", "Motion, forces, and energy", "Waves, light, and sound", "Engineering design and applications"],
    "Biology": ["Cells and molecular processes", "Genetics and evolution", "Ecology and biodiversity", "Human systems and biotechnology"],
    "Chemistry": ["Atomic structure and periodic trends", "Bonding, reactions, and stoichiometry", "Energy, equilibrium, and solutions", "Chemistry in society and the environment"],
    "Physics": ["Motion, forces, and momentum", "Energy, work, and power", "Waves, electricity, and magnetism", "Modern physics and engineering applications"],
    "Reading Literature": ["Foundational reading and vocabulary", "Literary elements and theme", "Informational text and media literacy", "Discussion, evidence, and interpretation"],
    "Writing and Communication": ["Grammar, conventions, and style", "Narrative and descriptive writing", "Informative and explanatory writing", "Argument, research, and presentation"],
    "World History": ["Local and ancient civilizations", "Belief systems, culture, and exchange", "Government, conflict, and change", "Modern global connections"],
    "US History": ["Founding, government, and early republic", "Expansion, conflict, and reform", "Industrialization, migration, and world power", "Modern America and civic change"],
    "European History": ["Classical and medieval Europe", "Renaissance, Reformation, and exploration", "Revolution, nationalism, and empire", "Modern Europe and global impact"],
    "Civics and Government": ["Rights, responsibilities, and community", "Institutions and rule of law", "Participation, elections, and media", "Public policy and global citizenship"],
    "Geography": ["Maps, location, and spatial thinking", "Physical systems and climate", "Human systems and culture", "Resources, regions, and sustainability"],
    "Computer Science": ["Computing systems and digital citizenship", "Algorithms and programming", "Data, networks, and cybersecurity", "Creative computing and impact"],
    "Creative Writing": ["Voice, detail, and imagination", "Character, setting, and plot", "Poetry, dialogue, and genre", "Revision, publication, and audience"],
    "Art History": ["Visual analysis and media", "Ancient and indigenous art", "Regional traditions and global exchange", "Modern, contemporary, and community art"],
    "Music Theory": ["Rhythm, melody, and notation", "Harmony, texture, and form", "Listening across cultures", "Composition, rehearsal, and performance"],
    "Physical Education": ["Movement skills and body control", "Fitness, endurance, and strength", "Team strategy and fair play", "Personal wellness plans"],
    "Health": ["Body systems and healthy choices", "Mental health and relationships", "Safety, nutrition, and prevention", "Community health and advocacy"],
    "Global Economics": ["Needs, wants, and resources", "Markets, money, and trade", "Work, enterprise, and innovation", "Economic systems and global development"],
    "Personal Finance": ["Budgeting, saving, and banking", "Credit, debt, and consumer choices", "Investing, taxes, and insurance", "Career income and financial planning"],
    "Financial Literacy": ["Money basics, budgeting, and saving", "Banking, credit, debt, and consumer protection", "Taxes, insurance, investing, and risk", "Career income, entrepreneurship, and long-term planning"],
    "Law and Legal Literacy": ["Rules, rights, responsibilities, and fairness", "Civic law, courts, contracts, and evidence", "Digital law, consumer rights, and school/community scenarios", "Advocacy, conflict resolution, and legal decision-making"],
    "Environmental Science": ["Ecosystems and biodiversity", "Climate, water, and land systems", "Human impact and environmental justice", "Solutions, design, and stewardship"],
    "Career and Technical Education": ["Career exploration and workplace skills", "Technical literacy and safety", "Project planning and production", "Portfolio, certification, and employability"],
    "Job Skills": ["Workplace communication and professionalism", "Resume, cover letter, and job search tools", "Interviewing, networking, and digital presence", "Work habits, rights, payroll, and career growth"],
    "Resume and Cover Letter Writing": ["Strengths, experience, and transferable skills", "Resume sections, action verbs, and formatting", "Cover letters, applications, and references", "Revision, feedback, and job-ready portfolio"],
    "Interview Skills": ["Research, preparation, and first impressions", "Common questions and evidence-based answers", "Mock interviews, follow-up, and professionalism", "Workplace scenarios, rights, and expectations"],
    "Business and Entrepreneurship": ["Business models and markets", "Finance, operations, and management", "Marketing, customers, and communication", "Entrepreneurship pitch and launch planning"],
    "Programming and App Development": ["Computational thinking and problem decomposition", "Programming fundamentals and debugging", "Web, app, data, and automation projects", "Portfolio projects, collaboration, and responsible technology"],
    "Robotics": ["Robot systems, sensors, and actuators", "Programming movement, logic, and control", "Engineering design challenges and troubleshooting", "Autonomous missions, ethics, and showcase projects"],
    "Game Development": ["Game design thinking and player experience", "Programming mechanics, input, and feedback", "2D worlds, art, audio, and level design", "Playtesting, iteration, publishing, and responsible game communities"],
    "Exam Prep": ["Study planning, memory, and test-taking strategies", "Reading directions, time management, and error analysis", "Subject practice, constructed responses, and evidence", "Mock tests, reflection, and confidence routines"],
    "Media Literacy": ["Source evaluation, bias, and misinformation", "Digital research, citation, and responsible sharing", "Advertising, algorithms, and persuasive media", "Creating ethical media for real audiences"],
    "Consumer Skills": ["Smart shopping, needs versus wants, and comparison", "Contracts, subscriptions, scams, and consumer rights", "Transportation, housing, utilities, and basic services", "Decision-making, records, and problem solving"],
    "Home and Independent Living": ["Organization, routines, and personal responsibility", "Food, cleaning, laundry, and household basics", "Scheduling, transportation, appointments, and paperwork", "Emergency planning, community resources, and self-advocacy"],
    "First Aid and Safety": ["Personal safety, emergencies, and help-seeking", "Basic first aid, prevention, and health decisions", "Digital, home, school, and community safety", "Preparedness plans and responsible response"],
    "World Languages": ["Foundational vocabulary and pronunciation", "Conversation and interpersonal communication", "Reading, writing, and culture", "Presentation, comparison, and real-world tasks"],
    "ESL / English Learners": ["Academic vocabulary and listening", "Speaking frames and classroom communication", "Reading comprehension and language structures", "Writing, revision, and presentation"],
    "Social Emotional Learning": ["Self-awareness and identity", "Self-management and goal setting", "Relationships and responsible decisions", "Community, belonging, and reflection"],
    "Special Education Support": ["Accessible vocabulary and routines", "Guided practice and accommodations", "Executive function and learning strategies", "Progress monitoring and student reflection"],
    "AP English Language": ["Rhetorical situation and claims", "Evidence, reasoning, and style", "Synthesis and argument writing", "Exam practice and timed analysis"],
    "AP English Literature": ["Close reading and literary elements", "Poetry, prose, and drama analysis", "Theme, interpretation, and evidence", "Essay writing and exam practice"],
    "AP Calculus AB": ["Limits and continuity", "Differentiation and applications", "Integration and accumulation", "Differential equations and AP review"],
    "AP Calculus BC": ["Advanced integration and series", "Parametric, polar, and vector functions", "Differential equations and modeling", "AP free-response and multiple-choice review"],
    "AP Statistics": ["Exploring data", "Sampling, experimentation, and probability", "Inference for proportions and means", "Regression, chi-square, and AP review"],
    "AP Biology": ["Chemistry of life and cells", "Genetics, evolution, and information transfer", "Energetics, ecology, and systems", "Science practices and AP lab analysis"],
    "AP Chemistry": ["Atomic structure and bonding", "Reactions, kinetics, and thermodynamics", "Equilibrium, acids, bases, and electrochemistry", "AP labs, calculations, and review"],
    "AP Physics": ["Kinematics, forces, and energy", "Momentum, rotation, and gravitation", "Waves, electricity, and circuits", "AP problem solving and lab analysis"],
    "AP Environmental Science": ["Ecosystems, biodiversity, and populations", "Earth systems and resources", "Pollution, energy, and land use", "Global change and AP review"],
    "AP Computer Science Principles": ["Creative development and algorithms", "Data, internet, and cybersecurity", "Programming and abstraction", "Impact of computing and create task"],
    "AP Computer Science A": ["Java fundamentals and objects", "Boolean logic, loops, and arrays", "ArrayLists, inheritance, and recursion", "FRQ patterns and AP review"],
    "AP World History": ["Networks, belief systems, and states", "Exchange, empire, and transformation", "Revolutions, industry, and imperialism", "Global conflict, decolonization, and AP writing"],
    "AP US History": ["Colonial America and founding", "Expansion, Civil War, and reconstruction", "Industrialization, reform, and global power", "Modern America and AP writing"],
    "AP Government and Politics": ["Constitutional foundations", "Institutions and policymaking", "Civil liberties, rights, and participation", "Political behavior and AP review"],
    "AP Macroeconomics": ["Basic economic concepts", "National income and price determination", "Financial sector and stabilization policy", "Open economy and AP review"],
    "AP Microeconomics": ["Supply, demand, and elasticity", "Consumer choice and production", "Market structures and factor markets", "Market failure and AP review"],
    "AP Psychology": ["Research methods and biological bases", "Sensation, cognition, and development", "Learning, motivation, and personality", "Disorders, treatment, and AP review"],
    "AP Human Geography": ["Population, migration, and culture", "Political and agricultural patterns", "Cities, development, and industry", "Spatial analysis and AP writing"],
    "AP Spanish Language": ["Interpersonal communication", "Interpretive reading and listening", "Presentational speaking and writing", "Culture, comparison, and AP practice"],
    "AP French Language": ["Interpersonal communication", "Interpretive reading and listening", "Presentational speaking and writing", "Culture, comparison, and AP practice"],
    "AP Art and Design": ["Sustained investigation", "Materials, processes, and experimentation", "Portfolio documentation and critique", "Selected works and artist statement"],
    "Behavior Management": ["Understanding student behavior and classroom dynamics", "Proactive strategies, rules, and routines", "De-escalation, restorative practices, and interventions", "Supporting students with challenging behaviors and building positive relationships"],
    "Teaching Methods and Pedagogy": ["Foundations of learning theory and instructional design", "Direct instruction, inquiry, and differentiated teaching", "Assessment, feedback, and formative strategies", "Inclusive classrooms, student engagement, and reflective practice"],
    "Online and Blended Learning": ["Designing and structuring online learning environments", "Digital tools, platforms, and engagement strategies", "Supporting student motivation, communication, and equity online", "Assessing learning, feedback loops, and blended course design"],
    "Philosophy of Education": ["Foundations: what education is for and who it serves", "Classical and modern educational philosophies", "Ethics, equity, and the purpose of schooling", "Applying educational philosophy to curriculum and classroom practice"],
    "General Education": ["Literacy and communication", "Mathematics and problem solving", "Science and inquiry", "Society, creativity, and wellbeing"]
};
Object.assign(COURSE_BLUEPRINTS, {
    "Coding and Robotics": COURSE_BLUEPRINTS["Computer Science"],
    "Robotics": COURSE_BLUEPRINTS["Robotics"],
    "Game Development": COURSE_BLUEPRINTS["Game Development"],
    "Programming and App Development": COURSE_BLUEPRINTS["Programming and App Development"],
    "Digital Citizenship": COURSE_BLUEPRINTS["Computer Science"],
    "Engineering Design": COURSE_BLUEPRINTS["Science"],
    "Marketing": COURSE_BLUEPRINTS["Business and Entrepreneurship"],
    "Agriculture": COURSE_BLUEPRINTS["Career and Technical Education"],
    "Media Arts": COURSE_BLUEPRINTS["Visual Arts"] || COURSE_BLUEPRINTS["Art History"],
    "Journalism": COURSE_BLUEPRINTS["Writing and Communication"],
    "Speech and Debate": COURSE_BLUEPRINTS["Writing and Communication"],
    "Spanish": COURSE_BLUEPRINTS["World Languages"],
    "French": COURSE_BLUEPRINTS["World Languages"],
    "German": COURSE_BLUEPRINTS["World Languages"],
    "Mandarin Chinese": COURSE_BLUEPRINTS["World Languages"],
    "Arabic": COURSE_BLUEPRINTS["World Languages"],
    "Visual Arts": COURSE_BLUEPRINTS["Art History"],
    "Theater": COURSE_BLUEPRINTS["Creative Writing"],
    "Dance": COURSE_BLUEPRINTS["Physical Education"],
    "Nutrition and Wellness": COURSE_BLUEPRINTS["Health"],
    "Life Skills": COURSE_BLUEPRINTS["Social Emotional Learning"],
    "Study Skills": COURSE_BLUEPRINTS["Social Emotional Learning"],
    "College and Career Readiness": COURSE_BLUEPRINTS["Job Skills"],
    "Career and Technical Education": COURSE_BLUEPRINTS["Career and Technical Education"],
    "Financial Literacy": COURSE_BLUEPRINTS["Financial Literacy"]
});
const slug = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const getLanguageForCountry = (country, requested) => requested || (SPANISH_COUNTRIES.includes(country) ? 'Spanish' : PORTUGUESE_COUNTRIES.includes(country) ? 'Portuguese' : FRENCH_COUNTRIES.includes(country) ? 'French' : 'English');
const getGradeNumber = (grade = 'Grade 5') => Number(String(grade).match(/\d+/)?.[0] || 5);
const getBand = (grade) => getGradeNumber(grade) <= 2 ? 'foundational' : getGradeNumber(grade) <= 5 ? 'elementary' : getGradeNumber(grade) <= 8 ? 'middle' : 'secondary';
const getPricing = (country) => FREE_COUNTRIES.includes(country) ? { isFree: true, pricing: { lesson: 0, unit: 0, month: 0, course: 0 } } : TIER1_COUNTRIES.includes(country) ? { isFree: false, pricing: { lesson: 2, unit: 8, month: 20, course: 50 } } : { isFree: false, pricing: { lesson: 5, unit: 10, month: 39, course: 100 } };
const getStandardsBody = (country, state) => {
    if (country === 'USA') return state ? `${state} state academic standards with Common Core, C3, or NGSS alignment where applicable` : 'United States state academic standards with Common Core, C3, and NGSS alignment where applicable';
    if (country === 'UK') return 'UK National Curriculum and exam-board readiness benchmarks';
    if (country === 'Canada') return state ? `${state} provincial learning standards` : 'Canadian provincial and territorial curriculum expectations';
    if (country === 'Australia') return 'Australian Curriculum achievement standards';
    if (country === 'India') return 'NCERT/CBSE learning outcomes with state-board equivalence';
    if (country === 'Mexico') return 'SEP aprendizajes esperados and national curriculum standards';
    if (country === 'Brazil') return 'BNCC competencies and learning objectives';
    if (country === 'Spain') return 'LOMLOE curriculum competencies and evaluation criteria';
    return `${country} national ministry standards with UNESCO ISCED-aligned global equivalence`;
};
const getCacheId = ({ country, state, grade, language, course, need }) => slug(`${country}_${state || 'no_state'}_${grade}_${language}_${course || 'General Education'}_${need || 'Daily Lesson'}`);
const getLegacyCacheId = ({ country, state, grade, language, course }) => slug(`${country}_${state || 'no_state'}_${grade}_${language}_${course || 'General Education'}`);
const getLessonId = ({ country, state, grade, course, topic, language }) => crypto.createHash('md5').update(`${country}_${state || ''}_${grade}_${course || 'General Education'}_${topic}_${language}`).digest('hex');
function buildUnitLessons(unitTitle, grade, course, unitIndex) {
    const verbs = { foundational: ["Explore", "Name", "Sort", "Practice", "Share"], elementary: ["Investigate", "Model", "Explain", "Practice", "Apply"], middle: ["Analyze", "Compare", "Design", "Argue", "Reflect"], secondary: ["Evaluate", "Synthesize", "Model", "Debate", "Transfer"] }[getBand(grade)];
    return verbs.map((verb, index) => ({ title: `${verb}: ${unitTitle}`, sequence: (unitIndex * 5) + index + 1, standards: [`${slug(course).toUpperCase()}.${getGradeNumber(grade)}.${unitIndex + 1}.${index + 1}`], objectives: [`Explain ${unitTitle.toLowerCase()} using grade-level vocabulary.`, `Apply ${course.toLowerCase()} practices to a local or global example.`, 'Show understanding through discussion, written work, and a short mastery check.'] }));
}
function buildDepthOfKnowledgeQuiz({ topic = 'the lesson topic', grade = 'Grade 5', course = 'General Education', region = 'your community' }) {
    const title = cleanString(topic, 180) || 'the lesson topic';
    const gradeLabel = cleanString(grade, 40) || 'the selected grade';
    const courseLabel = cleanString(course, 120) || 'General Education';
    const localContext = cleanString(region, 80) || 'your community';
    return [
        {
            type: 'choice',
            question: `Which response best analyzes why ${title.toLowerCase()} matters in ${courseLabel}?`,
            options: ['It repeats one definition from the lesson.', 'It connects the idea to evidence, consequences, and a new example.', 'It lists unrelated facts without explaining them.', 'It says the topic is important without support.'],
            answer: 'It connects the idea to evidence, consequences, and a new example.'
        },
        {
            type: 'choice',
            question: `A student gives two possible explanations for ${title.toLowerCase()}. What should they do next to strengthen the answer?`,
            options: ['Choose the shorter explanation because it is faster.', 'Ignore evidence and rely on opinion.', 'Compare both explanations against evidence or examples from the lesson.', 'Rewrite the question as a yes-or-no answer.'],
            answer: 'Compare both explanations against evidence or examples from the lesson.'
        },
        {
            type: 'choice',
            question: `Which task best shows transfer of ${title.toLowerCase()} to a new situation?`,
            options: [`Use the concept to solve or explain a related problem in ${localContext}.`, 'Copy the vocabulary list exactly.', 'Circle the longest paragraph.', 'Say whether the lesson felt easy or hard.'],
            answer: `Use the concept to solve or explain a related problem in ${localContext}.`
        },
        {
            type: 'choice',
            question: `When evaluating a classmate's claim about ${title.toLowerCase()}, which feedback is most useful?`,
            options: ['I agree because it sounds right.', 'Add evidence, explain your reasoning, and address another possible interpretation.', 'Make it shorter so nobody has to read it.', 'Use more colorful words even if the reasoning is unclear.'],
            answer: 'Add evidence, explain your reasoning, and address another possible interpretation.'
        },
        {
            type: 'choice',
            question: `Which question would push the class beyond recall during this ${gradeLabel} lesson?`,
            options: ['What is one word from the title?', 'What page are we on?', `How would changing one condition affect the outcome or meaning of ${title.toLowerCase()}?`, 'Are you ready to continue?'],
            answer: `How would changing one condition affect the outcome or meaning of ${title.toLowerCase()}?`
        },
        {
            type: 'short',
            question: `Explain ${title.toLowerCase()} in 4-6 sentences. Use at least two pieces of evidence, examples, data points, or lesson details to support your reasoning.`
        },
        {
            type: 'short',
            question: `Compare two strategies, interpretations, models, or examples from the lesson. Which is stronger for understanding ${title.toLowerCase()}, and why?`
        },
        {
            type: 'short',
            question: `Design a short real-world task in ${localContext} where someone would need to apply ${title.toLowerCase()}. Explain the goal, evidence needed, and success criteria.`
        },
        {
            type: 'short',
            question: `Identify one possible misconception about ${title.toLowerCase()}. Explain why it is incorrect and how you would help another student fix it.`
        },
        {
            type: 'short',
            question: `Make a claim about ${title.toLowerCase()}, support it with reasoning, and explain one limitation or counterexample that should be considered.`
        }
    ];
}
function isWeakQuizItem(item = {}) {
    const question = cleanString(item.question || '', 300).toLowerCase();
    const hasDepthSignal = /dok 3|analyz|evidence|justify|compare|evaluat|design|transfer|misconception|claim|counterexample|reasoning|interpretation|solution|consequence|apply|real-world|new situation/.test(question);
    return !question
        || /\bready\b|\bare you\b|\bis this lesson ready\b|\byes\b.*\bno\b/.test(question)
        || question.length < 35
        || !hasDepthSignal;
}
function ensureDepthOfKnowledgeQuiz(lesson = {}, fallback = {}) {
    const baseQuiz = buildDepthOfKnowledgeQuiz({
        topic: lesson.topic || lesson.title || fallback.topic || fallback.idea,
        grade: lesson.grade || fallback.grade,
        course: lesson.course || fallback.course,
        region: lesson.state || lesson.country || fallback.state || fallback.country
    });
    const existing = Array.isArray(lesson.quiz) ? lesson.quiz : [];
    const cleaned = existing
        .filter((item) => item && !isWeakQuizItem(item))
        .map((item) => ({
            type: item.type === 'short' ? 'short' : 'choice',
            question: cleanString(item.question, 500),
            ...(item.type === 'short' ? {} : {
                options: Array.isArray(item.options) && item.options.length >= 4 ? item.options.slice(0, 4).map((option) => cleanString(option, 180)) : baseQuiz[0].options,
                answer: cleanString(item.answer, 220) || ''
            })
        }));
    const merged = [...cleaned, ...baseQuiz].slice(0, 10);
    const choiceQuestions = merged.filter((item) => item.type === 'choice').length;
    const finalQuiz = choiceQuestions >= 5 ? merged : baseQuiz;
    return {
        ...lesson,
        quiz: finalQuiz,
        assessmentDepth: 'DOK 3',
        knowledgeCheckQuestionCount: finalQuiz.length
    };
}
function buildCurriculumFromTemplate({ country = 'USA', state = '', language, grade = 'Grade 5', course = 'General Education', need = 'Daily Lesson' }) {
    language = getLanguageForCountry(country, language);
    const { isFree, pricing } = getPricing(country);
    const standardsBody = getStandardsBody(country, state);
    const units = (COURSE_BLUEPRINTS[course] || COURSE_BLUEPRINTS["General Education"]).map((unitTitle, unitIndex) => ({ id: slug(`${course}-${grade}-unit-${unitIndex + 1}`), title: unitTitle, sequence: unitIndex + 1, duration: need === 'Full Course' ? '4-6 weeks' : need === 'Monthly Plan' ? '1 week' : '3-5 class periods', standardsFocus: `${standardsBody}: ${course} strand ${unitIndex + 1}`, lessons: buildUnitLessons(unitTitle, grade, course, unitIndex) }));
    return { isFree, pricing, need, standardsBody, country, state: state || null, grade, language, course, includedMaterials: ["LessonCast", "Teacher plan", "Worksheet", "Quiz", "Answer key", "Mix-and-match activity", "LMS export package"], subjects: [{ name: course, topics: units.flatMap((unit) => unit.lessons.map((lesson) => lesson.title)) }], units, metadata: { source: 'local-global-standards-template', lms_ready: true, standards_aligned: true, global_equivalence: 'UNESCO ISCED K-12 progression', generatedAt: new Date().toISOString() } };
}
function buildStudentLessonBody({ topic, course, grade, region }) {
    const title = String(topic || 'today\'s topic');
    const lowerTitle = title.toLowerCase();
    if (/decimal/.test(lowerTitle)) {
        return [
            'Student Lesson:',
            'What decimals show: Decimals describe parts of a whole. The digits to the right of the decimal point have place values such as tenths, hundredths, and thousandths. In money, $4.75 means 4 whole dollars and 75 hundredths of a dollar.',
            'Adding and subtracting decimals: Line up decimal points so each place value is matched correctly. This keeps tenths with tenths, hundredths with hundredths, and whole numbers with whole numbers.',
            'Multiplying decimals: Multiplication can show equal groups, repeated addition, or scaling. Estimate first, multiply carefully, and then decide whether the answer is reasonable for the situation.',
            'Dividing decimals: Division can show equal sharing, equal groups, or rates. Connect the equation to a real problem so the answer has meaning, such as cost per item, distance per lap, or liters per container.',
            'Showing mastery: Explain which operation fits the situation, use place-value language, check whether the answer is reasonable, and describe what the number means in context.',
            ''
        ];
    }
    return [
        'Student Lesson:',
        `Big idea: ${title} is the main idea for this lesson. In ${grade}, students should understand the vocabulary, explain the concept in their own words, and use evidence, models, examples, or text details to show understanding.`,
        `What to notice: As students study ${title.toLowerCase()}, they should look for patterns, important details, relationships, and examples. Strong learners do not only memorize a definition; they explain how the idea works and when it applies.`,
        `How to use it: To apply ${title.toLowerCase()}, identify the situation, choose the strategy or evidence that fits, and explain the reasoning step by step. The explanation matters because it shows the thinking behind the answer.`,
        `Example in context: A useful example should connect this lesson to something real in ${region}. Students should describe the situation, name the concept, show the steps or evidence, and explain what the example proves.`,
        `How to show mastery: By the end, students should answer a new question about ${title.toLowerCase()}, support the answer with evidence or a model, compare it with another example, and explain one mistake someone might make.`,
        ''
    ];
}
function buildLessonFromTemplate({ country = 'USA', state = '', language, grade = 'Grade 5', topic = 'Learning Goal', course = 'General Education', need = 'Daily Lesson' }) {
    language = getLanguageForCountry(country, language);
    const standardsBody = getStandardsBody(country, state);
    const region = state || country;
    const code = `${slug(country).toUpperCase()}.${slug(course).toUpperCase()}.G${getGradeNumber(grade)}.${crypto.createHash('md5').update(topic).digest('hex').slice(0, 4).toUpperCase()}`;
    return ensureDepthOfKnowledgeQuiz({ title: topic, hook: `Students connect ${topic.toLowerCase()} to a real classroom, community, or global problem in ${region}.`, content: [`Grade Level: ${grade}`, `Course: ${course}`, `Standards Alignment: ${standardsBody}`, `Standard Code: ${code}`, '', 'Learning Objectives:', `1. Define and use the key vocabulary connected to ${topic}.`, `2. Explain the concept with evidence, models, examples, or text details appropriate for ${grade}.`, '3. Complete a short performance task that shows independent mastery.', '', ...buildStudentLessonBody({ topic, course, grade, region }), 'Teacher Plan:', `Opening: Present a familiar ${region} example and ask students what they notice, wonder, and predict.`, `Direct Instruction: Model the central skill for ${topic.toLowerCase()} with one worked example and one non-example.`, 'Guided Practice: Students work in pairs while the teacher checks for misconceptions.', 'Independent Practice: Students complete a short worksheet task aligned to the same standard.', 'Differentiation: Offer sentence frames, manipulatives, translated vocabulary, audio reading, challenge extensions, and small-group reteach.', 'Assessment: Use the DOK 3 knowledge check and a one-minute exit ticket to decide whether to reteach, extend, or move to the next lesson.', '', 'Worksheet:', `A. Vocabulary: Write a student-friendly definition for ${topic}.`, 'B. Practice: Complete three grade-level tasks that move from supported to independent.', `C. Transfer: Create one example from ${region} or another global context.`, '', 'Mix-and-Match Activity:', 'Match each vocabulary term, visual example, and explanation. Students justify one match aloud or in writing.', '', 'Answer Key:', 'Answers should show accurate vocabulary, evidence from the lesson, and a clear explanation of the reasoning process.'].join('\n'), media: { images: [`https://images.unsplash.com/featured/?${encodeURIComponent(`${course} classroom`)}`, `https://images.unsplash.com/featured/?${encodeURIComponent(`${topic} education`)}`, `https://images.unsplash.com/featured/?${encodeURIComponent(`${region} students learning`)}`], video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${topic} ${grade} educational lesson`)}` }, topic, country, state: state || '', grade, language, need, course, standards: [{ code, body: standardsBody, description: `${grade} ${course} standard mapped to national or globally equivalent expectations.` }], export_metadata: { lms_ready: true, standards_aligned: true, region, package_type: 'lesson', includes: ["student lesson", "teacher plan", "worksheet", "DOK 3 quiz", "answer key", "activity", "media links"] } }, { country, state, grade, topic, course });
}
function normalizeChatgptKind(kind = 'lesson') {
    const normalized = String(kind || 'lesson').trim().toLowerCase();
    return ['lesson', 'quiz', 'unit', 'course'].includes(normalized) ? normalized : 'lesson';
}
function buildChatgptQuickDraft({ country, state, grade = 'Grade 5', subject = 'General Education', kind = 'lesson' }) {
    const normalizedKind = normalizeChatgptKind(kind);
    const safeSubject = cleanString(subject, 120) || 'General Education';
    const quickTopic = normalizedKind === 'course' ? `${safeSubject} Course` : normalizedKind === 'quiz' ? `${safeSubject} Quick Check` : normalizedKind === 'unit' ? `${safeSubject} Unit` : `${safeSubject} Quick Start`;
    const lesson = buildLessonFromTemplate({
        country,
        state,
        grade,
        course: safeSubject,
        topic: quickTopic,
        need: normalizedKind === 'unit' ? 'Weekly Unit' : 'Daily Lesson'
    });
    const unit = buildCurriculumFromTemplate({
        country,
        state,
        grade,
        course: safeSubject,
        need: normalizedKind === 'unit' ? 'Weekly Unit' : 'Daily Lesson'
    });
    const quiz = (lesson.quiz || []).map((item, index) => ({
        number: index + 1,
        question: item.question || '',
        options: item.options || [],
        answer: item.answer || ''
    }));
    const quizLines = quiz.map((item) => {
        const choices = Array.isArray(item.options) && item.options.length ? `\n  Choices: ${item.options.map((choice, index) => `${String.fromCharCode(65 + index)}. ${choice}`).join(' | ')}` : '';
        return `${item.number}. ${item.question}${choices}`;
    });
    const answerLines = quiz.map((item) => `${item.number}. ${item.answer || 'Student response'}`);
    const quizText = [
        `${grade} ${safeSubject} Quiz`,
        `Topic: ${quickTopic}`,
        `Country/State: ${country}${state ? ` / ${state}` : ''}`,
        '',
        'Questions:',
        ...quizLines,
        '',
        'Answer Key:',
        ...answerLines
    ].join('\n');
    const lessonText = [
        `Lesson Title: ${lesson.title}`,
        `Grade: ${grade}`,
        `Subject: ${safeSubject}`,
        '',
        Array.isArray(lesson.content) ? lesson.content.join('\n') : String(lesson.content || ''),
        '',
        'Quiz:',
        quizText
    ].join('\n');
    const unitText = [
        `Unit Title: ${unit?.course || safeSubject}`,
        `Grade: ${grade}`,
        `Country/State: ${country}${state ? ` / ${state}` : ''}`,
        '',
        `Includes ${unit?.units?.length || 0} unit blocks and classroom-ready lesson sequences.`
    ].join('\n');
    const course = {
        title: `${grade} ${safeSubject} Course`,
        overview: `A fast classroom-ready course for ${grade} students in ${country}${state ? ` / ${state}` : ''}.`,
        outcomes: [
            `Build understanding of key ${safeSubject.toLowerCase()} concepts.`,
            `Practice the skills through short daily lessons and checks for understanding.`,
            `Show mastery with a final task that fits the local curriculum.`
        ],
        pacing: '4 weeks',
        region: `${country}${state ? ` / ${state}` : ''}`,
        grade,
        subject: safeSubject,
        units: [
            { week: 1, title: `${safeSubject} Foundations`, focus: `Introduce the core ideas, vocabulary, and expectations for ${safeSubject.toLowerCase()}.` },
            { week: 2, title: `Guided Practice in ${safeSubject}`, focus: `Model the main skills with examples from ${state || country} and the wider world.` },
            { week: 3, title: 'Independent Application', focus: 'Use reading, writing, discussion, problem-solving, or hands-on tasks to show mastery.' },
            { week: 4, title: `${safeSubject} Performance Task`, focus: 'Complete a culminating project, quiz, or presentation with a simple rubric.' }
        ],
        assessments: [
            'Daily exit tickets',
            'One short quiz each week',
            'A final performance task or exam'
        ],
        teacherNotes: [
            `Start with the default region, then adjust examples for ${state || country}.`,
            'Use the same course for substitute teachers, tutors, or parents who need a quick plan.',
            'Swap in local standards, texts, or examples when needed.'
        ]
    };
    const courseText = [
        `${grade} ${safeSubject} Course`,
        `Country/State: ${country}${state ? ` / ${state}` : ''}`,
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
    return {
        kind: normalizedKind,
        country,
        state: state || '',
        grade,
        subject: safeSubject,
        title: quickTopic,
        summary: normalizedKind === 'course' ? `${grade} ${safeSubject} course for ${country}${state ? `, ${state}` : ''}.` : `${grade} ${safeSubject} ${normalizedKind} for ${country}${state ? `, ${state}` : ''}.`,
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
const buildChatgptAppMcpServer = () => {
    const server = new McpServer({
        name: 'global-lms-chatgpt-app',
        version: '1.0.0',
        title: 'Global LMS Quick Draft',
        websiteUrl: PUBLIC_APP_URL,
        icons: [{ src: `${PUBLIC_APP_URL}/favicon.svg`, sizes: ['512x512'], mimeType: 'image/svg+xml' }]
    }, {
        capabilities: { logging: {} }
    });

    server.registerResource('quick-draft-widget', CHATGPT_APP_WIDGET_URI, {
        title: 'Quick Draft Widget',
        description: 'Fast lesson, quiz, unit, and course preview for teachers, tutors, and parents.',
        mimeType: 'text/html',
        _meta: {
            'openai/widgetDescription': 'Fast lesson, quiz, unit, and course preview for teachers, tutors, and parents.',
            'openai/widgetPrefersBorder': true,
            'openai/widgetDomain': PUBLIC_APP_URL,
            'openai/widgetCSP': {
                connect_domains: [PUBLIC_APP_URL],
                resource_domains: [PUBLIC_APP_URL]
            }
        }
    }, async () => ({
        contents: [{
            uri: CHATGPT_APP_WIDGET_URI,
            mimeType: 'text/html',
            text: fs.readFileSync(CHATGPT_APP_WIDGET_PATH, 'utf8')
        }]
    }));

    server.registerTool('create_quick_draft', {
        title: 'Create Quick Draft',
        description: 'Create a fast lesson, quiz, unit, or course draft for a country, state, grade, and subject.',
        inputSchema: {
            country: z.string().optional().describe('Default country, usually USA.'),
            state: z.string().optional().describe('Default state, usually California.'),
            grade: z.string().min(1).describe('Grade level to use.'),
            subject: z.string().min(1).describe('Subject to use.'),
            kind: z.enum(['lesson', 'quiz', 'unit', 'course']).default('lesson').describe('Draft type to create.')
        },
        outputSchema: {
            kind: z.enum(['lesson', 'quiz', 'unit', 'course']),
            country: z.string(),
            state: z.string(),
            grade: z.string(),
            subject: z.string(),
            title: z.string(),
            summary: z.string(),
            quizText: z.string(),
            lessonText: z.string(),
            unitText: z.string(),
            courseText: z.string(),
            copyReadyText: z.string(),
            lesson: z.any(),
            unit: z.any(),
            course: z.any(),
            quiz: z.array(z.any()),
            answerKey: z.array(z.any()),
            readyForChatGPT: z.boolean(),
            generatedAt: z.string()
        },
        _meta: {
            'openai/outputTemplate': CHATGPT_APP_WIDGET_URI
        },
        annotations: {
            title: 'Quick Draft Generator',
            readOnlyHint: true,
            openWorldHint: false
        }
    }, async ({ country, state, grade, subject, kind }) => {
        const payload = buildChatgptQuickDraft({
            country: cleanString(country, 80) || 'USA',
            state: cleanString(state, 80) || 'California',
            grade: cleanString(grade, 40) || 'Grade 5',
            subject: cleanString(subject, 120) || 'General Education',
            kind
        });
        return {
            content: [{
                type: 'text',
                text: payload.copyReadyText || payload.summary
            }],
            structuredContent: payload
        };
    });

    return server;
};

app.post('/mcp', async (req, res) => {
    try {
        const mcpServer = buildChatgptAppMcpServer();
        let body;
        try {
            body = req.body;
        } catch (parseError) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32700,
                    message: 'Invalid JSON.'
                },
                id: null
            });
            return;
        }
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
        res.on('close', () => {
            transport.close();
            mcpServer.close();
        });
    } catch (err) {
        console.error('[ChatGPT MCP Error]:', err);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

app.get('/mcp', (req, res) => {
    res.status(405).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Method not allowed.'
        },
        id: null
    });
});

app.get(['/chatgpt', '/chatgpt-app'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chatgpt-app.html'));
});
function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function readJsonOrGzipIfExists(filePath) {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const gzipPath = `${filePath}.gz`;
    if (fs.existsSync(gzipPath)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(gzipPath)).toString('utf8'));
    return null;
}
function loadPackageIfExists(payload) {
    const normalized = { ...payload, language: getLanguageForCountry(payload.country, payload.language) };
    const candidates = [
        normalized,
        { ...normalized, need: 'Daily Lesson' }
    ];
    if (normalized.country === 'USA' && !normalized.state) {
        candidates.push(
            { ...normalized, state: 'California' },
            { ...normalized, state: 'California', need: 'Daily Lesson' }
        );
    }
    for (const candidate of candidates) {
        const data = readJsonOrGzipIfExists(path.join(PACKAGES_DIR, `${getCacheId(candidate)}.json`));
        if (data) return data;
    }
    return null;
}
function loadOrCreateLocalCurriculum(payload) {
    const normalized = { ...payload, language: getLanguageForCountry(payload.country, payload.language) };
    const prebuiltPackage = loadPackageIfExists(normalized);
    if (prebuiltPackage?.curriculum) return { ...prebuiltPackage.curriculum, ...getPricing(payload.country) };
    const files = [path.join(CURRICULUM_DIR, `${getCacheId(normalized)}.json`), path.join(CURRICULUM_DIR, `${getLegacyCacheId(normalized)}.json`)];
    for (const file of files) {
        const data = readJsonIfExists(file);
        if (data) return { ...data, ...getPricing(payload.country), country: data.country || data.metadata?.country || payload.country, state: data.state ?? data.metadata?.state ?? payload.state ?? null, grade: data.grade || data.metadata?.grade || payload.grade, language: data.language || data.metadata?.language || normalized.language, course: data.course || data.metadata?.course || payload.course, need: data.need || payload.need || 'Daily Lesson', standardsBody: data.standardsBody || getStandardsBody(payload.country, payload.state), includedMaterials: data.includedMaterials || ["LessonCast", "Teacher plan", "Worksheet", "Quiz", "Answer key", "Mix-and-match activity"], units: data.units || null };
    }
    if (process.env.WAREHOUSE_PREBUILT_ONLY !== 'false') throw new Error(`Prebuilt curriculum package not found: ${getCacheId(normalized)}`);
    const generated = buildCurriculumFromTemplate(normalized);
    fs.writeFileSync(files[0], JSON.stringify(generated, null, 2));
    return generated;
}
function loadOrCreateLocalLesson(payload) {
    const normalized = { ...payload, language: getLanguageForCountry(payload.country, payload.language) };
    const prebuiltPackage = loadPackageIfExists(normalized);
    if (prebuiltPackage?.lessons?.[payload.topic]) return ensureDepthOfKnowledgeQuiz(prebuiltPackage.lessons[payload.topic], normalized);
    const file = path.join(LESSONS_DIR, `${getLessonId(normalized)}.json`);
    const cached = readJsonIfExists(file);
    if (cached && cached.media && cached.quiz?.length) {
        const enhanced = ensureDepthOfKnowledgeQuiz(cached, normalized);
        if ((cached.quiz || []).length < 10 || (cached.quiz || []).some(isWeakQuizItem)) {
            fs.writeFileSync(file, JSON.stringify(enhanced, null, 2));
        }
        return enhanced;
    }
    if (process.env.WAREHOUSE_PREBUILT_ONLY !== 'false') throw new Error(`Prebuilt lesson package not found: ${getCacheId(normalized)} / ${payload.topic}`);
    const generated = buildLessonFromTemplate(normalized);
    fs.writeFileSync(file, JSON.stringify(generated, null, 2));
    return generated;
}

async function hasPaidContentAccess(email) {
    const safeEmail = cleanEmail(email);
    if (!safeEmail) return false;
    const snapshot = await paymentOrdersCol
        .where('customerEmail', '==', safeEmail)
        .limit(1)
        .get();
    return !snapshot.empty;
}

const ipUsageId = (ip) => crypto.createHash('sha256').update(`guest-ip:${ip || 'unknown'}`).digest('hex').slice(0, 40);

async function reserveGuestLessonAccess({ ip, topic }) {
    const usageRef = guestLessonUsageCol.doc(ipUsageId(ip));
    return db.runTransaction(async (transaction) => {
        const usageDoc = await transaction.get(usageRef);
        const currentCount = Number(usageDoc.exists ? usageDoc.data().lessonOpenCount || 0 : 0);
        if (currentCount >= GUEST_FREE_LESSON_LIMIT) {
            return {
                allowed: false,
                status: 401,
                error: 'Sign in required',
                detail: `You used your free guest lesson. Sign in to get ${FREE_LESSON_LIMIT} more free lessons.`,
                guestLessonLimit: GUEST_FREE_LESSON_LIMIT,
                guestLessonRemaining: 0,
                requiresSignIn: true
            };
        }

        const nextCount = currentCount + 1;
        transaction.set(usageRef, {
            ipHash: usageRef.id,
            lessonOpenCount: FieldValue.increment(1),
            lastLessonTopic: cleanString(topic, 180),
            firstSeenAt: usageDoc.exists ? usageDoc.data().firstSeenAt || new Date() : new Date(),
            lastSeenAt: new Date(),
            updatedAt: new Date()
        }, { merge: true });

        return {
            allowed: true,
            guestAccess: true,
            guestLessonLimit: GUEST_FREE_LESSON_LIMIT,
            guestLessonRemaining: Math.max(GUEST_FREE_LESSON_LIMIT - nextCount, 0),
            lessonOpenCount: nextCount
        };
    });
}

async function reserveLessonAccess({ email, country, topic, ip }) {
    const pricing = getPricing(country);
    if (pricing.isFree) {
        return {
            allowed: true,
            isFreeRegion: true,
            freeLessonLimit: FREE_LESSON_LIMIT,
            freeLessonRemaining: FREE_LESSON_LIMIT
        };
    }

    const safeEmail = cleanEmail(email);
    if (!safeEmail) {
        return reserveGuestLessonAccess({ ip, topic });
    }

    if (await hasPaidContentAccess(safeEmail)) {
        return {
            allowed: true,
            paidAccess: true,
            freeLessonLimit: FREE_LESSON_LIMIT,
            freeLessonRemaining: FREE_LESSON_LIMIT
        };
    }

    const userRef = studentsCol.doc(userIdForEmail(safeEmail));
    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const currentCount = Number(userDoc.exists ? userDoc.data().lessonOpenCount || 0 : 0);
        if (currentCount >= FREE_LESSON_LIMIT) {
            return {
                allowed: false,
                status: 402,
                error: 'Free lessons used',
                detail: `You have used your ${FREE_LESSON_LIMIT} free lessons. Buy access to keep opening lessons.`,
                freeLessonLimit: FREE_LESSON_LIMIT,
                freeLessonRemaining: 0
            };
        }

        const nextCount = currentCount + 1;
        transaction.set(userRef, {
            email: safeEmail,
            lessonOpenCount: FieldValue.increment(1),
            lastLessonTopic: cleanString(topic, 180),
            lastSeenAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date()
        }, { merge: true });

        return {
            allowed: true,
            freeLessonLimit: FREE_LESSON_LIMIT,
            freeLessonRemaining: Math.max(FREE_LESSON_LIMIT - nextCount, 0),
            lessonOpenCount: nextCount
        };
    });
}

const currentMonthKey = () => new Date().toISOString().slice(0, 7);
const aiBuilderCostFor = (need = 'Lesson') => AI_BUILDER_COSTS[need] || 1;
const aiBuilderLimitFor = () => AI_BUILDER_FREE_SIGNED_CREDITS;
const aiBuilderUsageRef = ({ email = '', visitorId = '', ip = '' }) => {
    const identity = `email:${email}`;
    return aiBuilderUsageCol.doc(`${currentMonthKey()}_${usageIdForIdentity(identity)}`);
};
async function getAiBuilderUsage(payload) {
    const ref = aiBuilderUsageRef(payload);
    const doc = await ref.get();
    return {
        ref,
        creditsUsed: doc.exists ? Number(doc.data().creditsUsed || 0) : 0,
        generations: doc.exists ? Number(doc.data().generations || 0) : 0
    };
}
function normalizeGeneratedDraft(data, fallback) {
    const need = fallback.need || 'Lesson';
    if (need === 'Lesson') {
        return {
            ...buildLessonFromTemplate(fallback),
            ...data,
            title: cleanString(data.title || fallback.idea || fallback.topic, 180),
            topic: cleanString(data.topic || data.title || fallback.idea || fallback.topic, 180),
            content: cleanString(data.content || '', 20000) || buildLessonFromTemplate(fallback).content,
            quiz: ensureDepthOfKnowledgeQuiz({ ...data, title: data.title || fallback.idea, topic: data.topic || fallback.topic }, fallback).quiz,
            standards: Array.isArray(data.standards) && data.standards.length ? data.standards.slice(0, 8) : buildLessonFromTemplate(fallback).standards,
            export_metadata: {
                ...(data.export_metadata || {}),
                lms_ready: true,
                standards_aligned: true,
                region: fallback.state || fallback.country,
                package_type: 'ai-draft-lesson',
                human_review_required: true
            }
        };
    }
    const base = buildCurriculumFromTemplate(fallback);
    return {
        ...base,
        ...data,
        isAiDraft: true,
        humanReviewRequired: true,
        country: fallback.country,
        state: fallback.state || null,
        grade: fallback.grade,
        language: fallback.language,
        course: fallback.course,
        need,
        standardsBody: cleanString(data.standardsBody || base.standardsBody, 800),
        subjects: Array.isArray(data.subjects) && data.subjects.length ? data.subjects.slice(0, 4) : base.subjects,
        units: Array.isArray(data.units) && data.units.length ? data.units.slice(0, need === 'Course' ? 10 : 3) : base.units.slice(0, need === 'Course' ? 10 : 3),
        metadata: {
            ...(data.metadata || {}),
            source: 'ai-builder-draft',
            lms_ready: true,
            standards_aligned: true,
            human_review_required: true,
            generatedAt: new Date().toISOString()
        }
    };
}

app.get('/api/ai-builder/credit-packs', (req, res) => {
    res.json({
        packs: Object.values(AI_CREDIT_PACKS).map((pack) => ({
            ...pack,
            price: pack.amountCents / 100
        })),
        costs: AI_BUILDER_COSTS,
        freeMonthlyCredits: AI_BUILDER_FREE_SIGNED_CREDITS
    });
});

app.post('/api/ai-builder/create-credit-checkout', async (req, res) => {
    try {
        if (!stripe) return res.status(503).json({ error: 'Payments are not configured for this deployment.' });
        const safeEmail = cleanEmail(req.body.email);
        if (!safeEmail) return res.status(401).json({ error: 'Sign in required', detail: 'Sign in before buying AI Builder credits.' });
        const pack = AI_CREDIT_PACKS[cleanString(req.body.packId, 40)];
        if (!pack) return res.status(400).json({ error: 'Unknown credit pack.' });
        const baseUrl = appUrlForRequest(req);
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: safeEmail,
            allow_promotion_codes: true,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    unit_amount: pack.amountCents,
                    product_data: {
                        name: pack.label,
                        description: `${pack.credits} AI Builder credits for lessons, units, and courses`
                    }
                },
                quantity: 1
            }],
            success_url: `${baseUrl}/?ai_credits=success`,
            cancel_url: `${baseUrl}/?ai_credits=cancelled`,
            ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true } } : {}),
            metadata: {
                type: 'ai_credits',
                packId: pack.id,
                credits: String(pack.credits),
                email: safeEmail
            }
        });
        res.json({ id: session.id, url: session.url });
    } catch (err) {
        console.error('[AI Credit Checkout Error]:', err);
        res.status(500).json({ error: 'Failed to create credit checkout', detail: err.message });
    }
});

app.post('/api/ai-builder', async (req, res) => {
    try {
        const safeEmail = cleanEmail(req.body.email);
        if (!safeEmail) {
            return res.status(401).json({
                error: 'Sign in required',
                detail: 'Please sign in with a real email before using AI Builder credits.'
            });
        }
        const visitorId = cleanString(req.body.visitorId, 80);
        const need = ['Lesson', 'Unit', 'Course'].includes(req.body.need) ? req.body.need : 'Lesson';
        const cost = aiBuilderCostFor(need);
        const limit = aiBuilderLimitFor(safeEmail);
        const usage = await getAiBuilderUsage({ email: safeEmail, visitorId, ip: clientIp(req) });
        const remaining = Math.max(limit - usage.creditsUsed, 0);
        const userRef = studentsCol.doc(userIdForEmail(safeEmail));
        const userDoc = await userRef.get();
        const paidBalance = Number(userDoc.exists ? userDoc.data().aiCreditBalance || 0 : 0);
        const paidCreditsNeeded = Math.max(cost - remaining, 0);
        if (paidCreditsNeeded > paidBalance) {
            return res.status(402).json({
                error: 'Free AI Builder credits used',
                detail: 'This account needs more AI Builder credits before creating this draft.',
                usage: { creditsUsed: usage.creditsUsed, limit, remaining, paidBalance, cost, month: currentMonthKey() }
            });
        }
        const freeCreditsUsed = Math.min(cost, remaining);

        const idea = cleanString(req.body.idea, 1200);
        if (idea.length < 8) return res.status(400).json({ error: 'Tell the AI Builder what to create.' });

        const payload = {
            country: cleanString(req.body.country, 80) || 'USA',
            state: cleanString(req.body.state, 80),
            language: cleanString(req.body.language, 80) || 'English',
            grade: cleanString(req.body.grade, 40) || 'Grade 5',
            course: cleanString(req.body.course, 120) || 'General Education',
            need,
            topic: idea,
            idea
        };

        let draft;
        let tokenUsage = null;
        let estimatedCost = estimateGeminiCost();
        if (process.env.USE_AI_GENERATION === 'true' && process.env.GOOGLE_API_KEY) {
            const prompt = `Create a human-review draft for Global LMS.
Return only valid JSON. No markdown.
Request: ${idea}
Region: ${payload.country}${payload.state ? `, ${payload.state}` : ''}
Grade: ${payload.grade}
Course: ${payload.course}
Build type: ${need}
Language: ${payload.language}
Use official regional standards when known; otherwise use a clearly labeled closest national, state, provincial, ministry, or UNESCO ISCED equivalent.
Keep the draft useful but concise to control generation cost.
For Lesson JSON: title, hook, content, quiz [{type, question, options, answer}], standards [{code, body, description}], media, export_metadata.
Lesson quiz must contain at least 10 high-value Depth of Knowledge 3 questions. Avoid "ready", yes/no, recall-only, or one-word questions. Include analysis, evidence, comparison, justification, transfer, design, and misconception prompts.
For Unit or Course JSON: standardsBody, subjects [{name, topics}], units [{title, sequence, duration, standardsFocus, lessons [{title, sequence, objectives}]}], includedMaterials.
Every draft must say it needs teacher review before classroom use.`;
            const result = await model.generateContent(prompt);
            const response = result.response;
            tokenUsage = response.usageMetadata || result.usageMetadata || null;
            estimatedCost = estimateGeminiCost(tokenUsage || {});
            draft = normalizeGeneratedDraft(cleanAIJSON(response.text()), payload);
        } else {
            draft = need === 'Lesson'
                ? buildLessonFromTemplate(payload)
                : { ...buildCurriculumFromTemplate(payload), units: buildCurriculumFromTemplate(payload).units.slice(0, need === 'Course' ? 10 : 3) };
            draft.isAiDraft = true;
            draft.humanReviewRequired = true;
        }

        await usage.ref.set({
            email: safeEmail,
            visitorId,
            creditsUsed: FieldValue.increment(freeCreditsUsed),
            generations: FieldValue.increment(1),
            lastNeed: need,
            lastIdea: idea,
            month: currentMonthKey(),
            updatedAt: new Date(),
            createdAt: new Date()
        }, { merge: true });
        if (paidCreditsNeeded > 0) {
            await userRef.set({
                aiCreditBalance: FieldValue.increment(-paidCreditsNeeded),
                aiCreditsSpent: FieldValue.increment(paidCreditsNeeded),
                lastSeenAt: new Date(),
                updatedAt: new Date()
            }, { merge: true });
        }
        await aiBuilderGenerationsCol.add({
            email: safeEmail,
            visitorId,
            need,
            creditCost: cost,
            freeCreditsUsed,
            paidCreditsUsed: paidCreditsNeeded,
            idea,
            country: payload.country,
            state: payload.state,
            grade: payload.grade,
            course: payload.course,
            language: payload.language,
            usedAiGeneration: process.env.USE_AI_GENERATION === 'true' && Boolean(process.env.GOOGLE_API_KEY),
            tokenUsage: tokenUsage || null,
            costEstimate: estimatedCost,
            month: currentMonthKey(),
            createdAt: new Date()
        });
        await recordUsageEvent({
            type: 'ai_builder_generate',
            email: safeEmail,
            visitorId,
            role: roleForEmail(safeEmail, req.body.role),
            name: req.body.name,
            plan: payload,
            topic: idea,
            pathName: req.body.path,
            userAgent: req.get('user-agent') || '',
            ip: clientIp(req)
        });

        res.json({
            draft,
            usage: {
                creditsUsed: usage.creditsUsed + cost,
                limit,
                remaining: Math.max(limit - usage.creditsUsed - freeCreditsUsed, 0),
                paidBalance: Math.max(paidBalance - paidCreditsNeeded, 0),
                cost,
                month: currentMonthKey(),
                tokenUsage,
                estimatedCost
            }
        });
    } catch (err) {
        console.error('[AI Builder Error]:', err);
        res.status(500).json({ error: 'Failed to build AI draft', detail: err.message });
    }
});
app.get('/api/catalog', (req, res) => {
    res.json({ countries: GLOBAL_COUNTRIES, courses: GLOBAL_COURSES, grades: Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`), states: STATE_OPTIONS, needs: ["Sub Lesson", "Daily Lesson", "Weekly Unit", "Monthly Plan", "Full Course"], standardsModel: 'National, state, provincial, or ministry standards with UNESCO ISCED-aligned global equivalence', warehouse: { curriculums: fs.readdirSync(CURRICULUM_DIR).filter((f) => f.endsWith('.json')).length, lessons: fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json')).length, packages: fs.readdirSync(PACKAGES_DIR).filter((f) => f.endsWith('.json') || f.endsWith('.json.gz')).length } });
});

app.post('/api/chatgpt/quick-draft', async (req, res) => {
    try {
        const country = cleanString(req.body.country, 80) || 'USA';
        const state = cleanString(req.body.state, 80) || 'California';
        const payload = buildChatgptQuickDraft({
            country,
            state,
            grade: cleanString(req.body.grade, 40) || 'Grade 5',
            subject: cleanString(req.body.subject, 120) || 'General Education',
            kind: req.body.kind
        });
        res.json(payload);
    } catch (err) {
        console.error('[ChatGPT Quick Draft Error]:', err);
        res.status(500).json({ error: 'Failed to build ChatGPT draft', detail: err.message });
    }
});

async function recordUsageEvent({ type, email = '', visitorId = '', role = '', name = '', plan = null, topic = '', pathName = '', userAgent = '', ip = '' }) {
    if (!firestoreReady()) return;
    const safeEmail = cleanEmail(email);
    const safeVisitorId = cleanString(visitorId, 80);
    const event = {
        type: cleanString(type, 80),
        email: safeEmail,
        visitorId: safeVisitorId,
        role: cleanString(role, 40),
        name: cleanString(name, 100),
        plan,
        topic: cleanString(topic, 180),
        path: cleanString(pathName, 300),
        userAgent: cleanString(userAgent, 500),
        ip: cleanString(ip, 80),
        timestamp: new Date()
    };
    await usageEventsCol.add(event);
    if (safeEmail) {
        const ref = studentsCol.doc(userIdForEmail(safeEmail));
        await ref.set({
            email: safeEmail,
            name: cleanString(name, 100) || safeEmail.split('@')[0],
            role: roleForEmail(safeEmail, role),
            visitorId: safeVisitorId,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date()
        }, { merge: true });
    }
}

app.post('/api/users/signin', async (req, res) => {
    try {
        const safeEmail = cleanEmail(req.body.email);
        if (!safeEmail) return res.status(400).json({ error: 'A valid email is required to save an account.' });
        const safeRole = roleForEmail(safeEmail, req.body.role);
        if (!firestoreReady()) {
            return res.json({
                user: {
                    email: safeEmail,
                    name: cleanString(req.body.name, 100) || safeEmail.split('@')[0],
                    role: safeRole,
                    workspaceType: cleanString(req.body.workspaceType, 80) || 'Individual teacher',
                    workspaceName: cleanString(req.body.workspaceName, 120) || '',
                    freeLessonLimit: FREE_LESSON_LIMIT,
                    freeLessonRemaining: FREE_LESSON_LIMIT
                },
                accessCheck: 'local-unchecked'
            });
        }
        await recordUsageEvent({
            type: 'sign_in',
            email: safeEmail,
            visitorId: req.body.visitorId,
            role: safeRole,
            name: req.body.name,
            workspaceType: req.body.workspaceType,
            workspaceName: req.body.workspaceName,
            pathName: req.body.path,
            userAgent: req.get('user-agent') || '',
            ip: clientIp(req)
        });
        const ref = studentsCol.doc(userIdForEmail(safeEmail));
        const doc = await ref.get();
        res.json({ user: publicStudent(doc) });
    } catch (err) {
        console.error('[User SignIn Error]:', err);
        res.status(500).json({ error: 'Failed to save user' });
    }
});

app.post('/api/users/save-plan', async (req, res) => {
    try {
        const safeEmail = cleanEmail(req.body.email);
        if (!safeEmail) return res.status(400).json({ error: 'A valid email is required to save a plan.' });
        const plan = {
            country: cleanString(req.body.plan?.country, 80),
            state: cleanString(req.body.plan?.state, 80),
            language: cleanString(req.body.plan?.language, 80),
            grade: cleanString(req.body.plan?.grade, 40),
            course: cleanString(req.body.plan?.course, 120),
            need: cleanString(req.body.plan?.need, 80),
            savedAt: new Date()
        };
        const ref = studentsCol.doc(userIdForEmail(safeEmail));
        const safeRole = roleForEmail(safeEmail, req.body.role);
        await ref.set({
            email: safeEmail,
            name: cleanString(req.body.name, 100) || safeEmail.split('@')[0],
            role: safeRole,
            workspaceType: cleanString(req.body.workspaceType, 80) || 'Individual teacher',
            workspaceName: cleanString(req.body.workspaceName, 120) || '',
            visitorId: cleanString(req.body.visitorId, 80),
            lastPlan: plan,
            planCount: FieldValue.increment(1),
            lastSeenAt: new Date(),
            updatedAt: new Date(),
            createdAt: new Date()
        }, { merge: true });
        await ref.collection('plans').add(plan);
        await recordUsageEvent({
            type: 'save_plan',
            email: safeEmail,
            visitorId: req.body.visitorId,
            role: safeRole,
            name: req.body.name,
            workspaceType: req.body.workspaceType,
            workspaceName: req.body.workspaceName,
            plan,
            pathName: req.body.path,
            userAgent: req.get('user-agent') || '',
            ip: clientIp(req)
        });
        const doc = await ref.get();
        res.json({ user: publicStudent(doc) });
    } catch (err) {
        console.error('[Save Plan Error]:', err);
        res.status(500).json({ error: 'Failed to save plan' });
    }
});

app.post('/api/usage/event', async (req, res) => {
    try {
        const type = cleanString(req.body.type, 80);
        if (!type) return res.status(400).json({ error: 'Event type is required.' });
        const safeEmail = cleanEmail(req.body.email);
        await recordUsageEvent({
            type,
            email: safeEmail,
            visitorId: req.body.visitorId,
            role: roleForEmail(safeEmail, req.body.role),
            name: req.body.name,
            plan: req.body.plan || null,
            topic: req.body.topic,
            pathName: req.body.path,
            userAgent: req.get('user-agent') || '',
            ip: clientIp(req)
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[Usage Event Error]:', err);
        res.status(500).json({ error: 'Failed to record event' });
    }
});

app.get('/api/usage/summary', async (req, res) => {
    try {
        res.json(await publicUsageSummary());
    } catch (err) {
        console.error('[Usage Summary Error]:', err);
        res.status(500).json({ error: 'Failed to fetch usage summary' });
    }
});

app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
        const safeEmail = cleanEmail(req.body.email);
        if (!safeEmail) return res.status(400).json({ error: 'A valid email is required.' });
        const ref = newsletterSubscribersCol.doc(newsletterSubscriberIdForEmail(safeEmail));
        const existing = await ref.get();
        const now = new Date();
        await ref.set({
            email: safeEmail,
            name: cleanString(req.body.name, 100) || '',
            source: cleanString(req.body.source, 80) || 'homepage',
            active: true,
            consentAt: existing.exists ? (existing.data().consentAt || existing.data().updatedAt || now) : now,
            updatedAt: now
        }, { merge: true });
        res.json({ ok: true });
    } catch (err) {
        console.error('[Newsletter Subscribe Error]:', err);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

app.get('/api/admin/usage', requireAdmin, async (req, res) => {
    try {
        const [studentsCount, eventsCount, plansCount, lessonsCount, newsletterCount, paymentOrdersCount, aiCreditPurchasesCount] = await Promise.all([
            studentsCol.count().get(),
            usageEventsCol.count().get(),
            curriculumCol.count().get(),
            lessonsCol.count().get(),
            newsletterSubscribersCol.count().get(),
            paymentOrdersCol.count().get(),
            aiCreditPurchasesCol.count().get()
        ]);
        const studentsSnapshot = await studentsCol.orderBy('lastSeenAt', 'desc').limit(50).get();
        const eventsSnapshot = await usageEventsCol.orderBy('timestamp', 'desc').limit(100).get();
        const newsletterSnapshot = await newsletterSubscribersCol.orderBy('updatedAt', 'desc').limit(100).get();
        const paymentOrdersSnapshot = await paymentOrdersCol.orderBy('createdAt', 'desc').limit(100).get();
        const aiCreditPurchasesSnapshot = await aiCreditPurchasesCol.orderBy('createdAt', 'desc').limit(100).get();
        const toIso = (value) => value?.toDate ? value.toDate().toISOString() : value || null;
        res.json({
            counts: {
                users: studentsCount.data().count,
                usageEvents: eventsCount.data().count,
                savedCurriculums: plansCount.data().count,
                lessons: lessonsCount.data().count,
                newsletterSubscribers: newsletterCount.data().count,
                paymentOrders: paymentOrdersCount.data().count,
                aiCreditPurchases: aiCreditPurchasesCount.data().count,
                totalPurchases: paymentOrdersCount.data().count + aiCreditPurchasesCount.data().count
            },
            users: studentsSnapshot.docs.map(publicStudent),
            events: eventsSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: data.type || '',
                    email: data.email || '',
                    role: data.role || '',
                    name: data.name || '',
                    topic: data.topic || '',
                    path: data.path || '',
                    plan: data.plan || null,
                    timestamp: toIso(data.timestamp)
                };
            }),
            newsletter: newsletterSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    email: data.email || '',
                    name: data.name || '',
                    source: data.source || '',
                    active: Boolean(data.active),
                    consentAt: toIso(data.consentAt),
                    updatedAt: toIso(data.updatedAt)
                };
            }),
            purchases: paymentOrdersSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'Marketplace',
                    paymentStatus: data.paymentStatus || '',
                    customerEmail: data.customerEmail || '',
                    itemName: data.itemName || '',
                    marketplaceItemId: data.marketplaceItemId || '',
                    creatorEmail: data.creatorEmail || '',
                    amountTotal: Number(data.amountTotal || 0),
                    currency: data.currency || 'usd',
                    createdAt: toIso(data.createdAt)
                };
            }),
            aiCreditPurchases: aiCreditPurchasesSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    type: 'AI Credits',
                    paymentStatus: data.paymentStatus || '',
                    customerEmail: data.email || '',
                    packId: data.packId || '',
                    credits: Number(data.credits || 0),
                    amountTotal: Number(data.amountCents || 0),
                    currency: 'usd',
                    createdAt: toIso(data.createdAt)
                };
            })
        });
    } catch (err) {
        console.error('[Admin Usage Error]:', err);
        res.status(500).json({ error: 'Failed to fetch usage' });
    }
});

app.post('/api/curriculum', async (req, res) => {
    const { country, state, language, grade, course, need } = req.body;
    const planNeed = need || 'Daily Lesson';
    const cacheId = `${country}_${state || 'no_state'}_${grade}_${language}_${course || 'general'}_${planNeed}`.toLowerCase();

    try {
        const exactRequest = { country, state, language, grade, course: course || 'General Education', need: planNeed };
        const localCurriculum = loadOrCreateLocalCurriculum(exactRequest);
        // Production must never reuse a cached/generated plan from another course,
        // grade, or region. Live AI is opt-in only.
        if (process.env.WAREHOUSE_PREBUILT_ONLY !== 'false' || process.env.LIVE_AI_CURRICULUM_GENERATION !== 'true') return res.json(localCurriculum);

        const cached = await curriculumCol.doc(cacheId).get();
        if (cached.exists) {
            console.log(`[Curriculum] Cache hit: ${cacheId}`);
            const cachedData = cached.data();
            if (
                cachedData?.course === exactRequest.course &&
                cachedData?.grade === exactRequest.grade &&
                cachedData?.country === exactRequest.country
            ) {
                return res.json(cachedData);
            }
            console.warn(`[Curriculum] Ignoring mismatched cache for ${cacheId}`);
        }

        console.log(`[Curriculum] Generating new path: ${cacheId}`);
        // --- TIERED PRICING ENGINE ---
        const freeCountries = ["Pakistan", "Zimbabwe", "Afghanistan", "South Sudan", "Yemen", "Somalia", "Ethiopia", "Ukraine", "Palestine", "Sudan", "Haiti"];
        const tier1Countries = ["Mexico", "Brazil", "India", "Vietnam", "Egypt"]; // $2 Lessons
        
        let pricing = { lesson: 5, unit: 15, month: 39, course: 100 }; // Default (USA/UK/Standard)
        let isFree = false;

        if (freeCountries.includes(country)) {
            pricing = { lesson: 0, unit: 0, month: 0, course: 0 };
            isFree = true;
        } else if (tier1Countries.includes(country)) {
            pricing = { lesson: 2, unit: 8, month: 20, course: 50 };
        }

        console.log(`[Curriculum] Generating path for ${country} (Tier: ${isFree ? 'Free' : (pricing.lesson < 5 ? 'Tier 1' : 'Standard')})`);

        const prompt = `You are a world-class Global Curriculum Architect and Standards Expert. 
        Create a "Mind Map" curriculum for a student in ${country}${state ? ` (${state} State)` : ''} at the ${grade} level. 
        Focus on: "${course || 'General Education'}".
        Teacher need: "${planNeed}".
        
        CRITICAL MANDATES:
        1. STANDARDS ALIGNMENT: Every topic MUST be strictly aligned with ${country}${state ? ` (${state})` : ''}'s official educational standards (e.g., Common Core for CA, etc.).
        2. GLOBAL EQUIVALENCE: If exact standards are not available, map to the closest official national, state, provincial, or internationally equivalent K-12 standard for that country.
        3. TEACHER DELIVERABLES: Include substitute-ready lessons, teacher plan, student worksheet, quiz, answer key, LessonCast, and one game/mix-and-match activity where useful.
        4. CULTURAL INFUSION: Infuse local context (traditions, landmarks) from ${state || country}.
        5. REVENUE MODEL: This platform takes a 20% cut of all sales and remains free in high-need regions.
        
        Return a JSON object in ${language}:
        {
          "isFree": ${isFree},
          "pricing": ${JSON.stringify(pricing)},
          "need": "${planNeed}",
          "standardsBody": "${state ? state + ' Board of Ed' : country + ' Ministry of Ed'}",
          "includedMaterials": ["LessonCast", "Teacher plan", "Worksheet", "Quiz", "Answer key", "Mix-and-match activity"],
          "subjects": [
            {
              "name": "Subject Name",
              "topics": ["Topic 1", "Topic 2", "Topic 3"]
            }
          ]
        }
        Only return JSON.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];
        
        const curriculumData = JSON.parse(text);
        await curriculumCol.doc(cacheId).set(curriculumData);
        res.json(curriculumData);
    } catch (err) {
        console.error("[Curriculum Error]:", err);
        if (String(err.message || '').startsWith('Prebuilt curriculum package not found:')) {
            return res.status(404).json({ error: 'Prebuilt curriculum unavailable', detail: err.message });
        }
        res.status(500).json({ error: "Failed to generate curriculum", detail: err.message });
    }
});

// --- 📝 LESSON GENERATOR ---
// --- Utility: Robust JSON Cleaner ---
function cleanAIJSON(text) {
    try {
        // Find the first { and the last }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("No JSON object found in response");
        
        let jsonStr = text.substring(start, end + 1);
        
        // Remove common AI formatting artifacts
        jsonStr = jsonStr.replace(/\\n/g, ' ').replace(/\\r/g, ' ');
        
        return JSON.parse(jsonStr);
    } catch (e) {
        // Attempt to fix trailing commas or unclosed braces
        try {
            const fixed = text.match(/\{[\s\S]*\}/)[0];
            return JSON.parse(fixed);
        } catch (inner) {
            throw new Error(`AI returned malformed JSON: ${e.message}`);
        }
    }
}

// --- 🏭 LMS FACTORY (ADMIN ONLY) ---
app.post('/api/admin/pregen', requireAdmin, async (req, res) => {
    if (process.env.ALLOW_ADMIN_PREGEN !== 'true') {
        return res.status(403).json({ error: 'Pre-generation factory is disabled in production.' });
    }
    const { auth } = req.body;
    if (auth !== 'pregen-secret-123') return res.status(403).send('Unauthorized');

    res.json({ message: "Factory started in background" });

    // Background process
    (async () => {
        // --- THE GLOBAL WAREHOUSE FACTORY ---
        // Goal: 100% Coverage of K-12 Standards across all major regions.
        const countries = ["USA", "UK", "Canada", "Mexico", "India", "Australia", "Pakistan", "Ethiopia", "Spain", "Brazil"];
        const states = ["California", "Texas", "New York", "Florida", "Mississippi", "Illinois"];
        const grades = Array.from({length: 12}, (_, i) => `Grade ${i + 1}`);
        const courses = [
            "Mathematics", "Science", "World History", "Reading Literature", 
            "Creative Writing", "Computer Science", "Art History", "Physical Education",
            "Music Theory", "Global Economics", "Environmental Science"
        ];

        for (const country of countries) {
            const stateList = country === 'USA' ? states : [null];
            for (const state of stateList) {
                for (const grade of grades) {
                    for (const course of courses) {
                        try {
                            const language = (country === 'Mexico' || country === 'Spain') ? 'Spanish' : 'English';
                            const cacheId = `${country}_${state || 'no_state'}_${grade}_${language}_${course}`.toLowerCase();
                            
                            // Check if already exists to save quota
                            const exists = (await curriculumCol.doc(cacheId).get()).exists;
                            if (exists) continue;

                            console.log(`[Factory] Generating: ${cacheId}`);
                            const prompt = `Create a standards-aligned curriculum for ${country} ${state ? '('+state+')' : ''} at ${grade} level for ${course}. Return ONLY JSON: {"subjects": [{"name": "Name", "topics": ["T1", "T2"]}]}`;
                            const result = await model.generateContent(prompt);
                            const curriculumData = cleanAIJSON(result.response.text());
                            
                            await curriculumCol.doc(cacheId).set({
                                ...curriculumData,
                                country, state, grade, language, course,
                                pricing: { lesson: 5, unit: 15, course: 100 },
                                lastUpdated: new Date().toISOString()
                            });

                            // AUTO-PRINT ALL LESSONS FOR THIS CURRICULUM (PARALLEL)
                            const lessonPromises = curriculumData.subjects.flatMap(sub => 
                                sub.topics.map(async (t) => {
                                    const lId = crypto.createHash('md5').update(`${country}_${state || ''}_${grade}_${t}_${language}`).digest('hex');
                                    const lExists = (await lessonsCol.doc(lId).get()).exists;
                                    if (!lExists) {
                                        console.log(`[Factory] Printing Lesson: ${t}`);
                                        const lRes = await model.generateContent(`Detailed lesson for ${country} ${grade} Topic: ${t}. Language: ${language}. Use ===TITLE===, ===HOOK===, ===CONTENT===, ===QUIZ=== markers.`);
                                        const lText = lRes.response.text();
                                        
                                        // Use same parsing logic as /api/lesson
                                        const lTitle = (lText.match(/===TITLE===([\s\S]*?)===HOOK===/) || [null, t])[1]?.trim();
                                        const lHook = (lText.match(/===HOOK===([\s\S]*?)===CONTENT===/) || [null, "Learn about " + t])[1]?.trim();
                                        const lContent = (lText.match(/===CONTENT===([\s\S]*?)===QUIZ===/) || [null, lText.substring(0, 1000)])[1]?.trim();
                                        const lQuizText = (lText.match(/===QUIZ===([\s\S]*)$/) || [null, ""])[1]?.trim();
                                        const lQuizLines = lQuizText.split('\n').filter(l => l.includes('|'));
                                        const lQuiz = lQuizLines.map(line => {
                                            const parts = line.split('|');
                                            return { question: parts[0], options: parts.slice(1, -1), answer: parts[parts.length-1] };
                                        });

                                        await lessonsCol.doc(lId).set({
                                            title: lTitle, hook: lHook, content: lContent, quiz: lQuiz,
                                            topic: t, country, state, grade, language,
                                            export_metadata: { lms_ready: true, region: state || country }
                                        });
                                    }
                                })
                            );
                            await Promise.all(lessonPromises.slice(0, 5)); // Batch of 5 at a time to avoid rate limits
                        } catch (e) {
                            console.error(`[Factory Error] ${country}:`, e.message);
                        }
                    }
                }
            }
        }
        console.log("--- FACTORY BATCH COMPLETE ---");
    })();
});

app.post('/api/lesson', async (req, res) => {
    const { country, grade, topic, language, need, course } = req.body;
    const state = req.body.state || '';
    const lessonId = crypto.createHash('md5').update(`${country}_${state || ''}_${grade}_${topic}_${language}`).digest('hex');

    try {
        const curatedLesson = findCuratedLesson(req.body);
        if (curatedLesson) {
            let access;
            if (!firestoreReady()) {
                access = {
                    allowed: true,
                    guestAccess: true,
                    guestLessonLimit: GUEST_FREE_LESSON_LIMIT,
                    guestLessonRemaining: GUEST_FREE_LESSON_LIMIT,
                    accessCheck: 'local-unchecked'
                };
            } else {
            try {
                access = await reserveLessonAccess({
                    email: req.body.email,
                    country: curatedLesson.country || country,
                    topic: curatedLesson.topic || topic,
                    ip: clientIp(req)
                });
            } catch (accessErr) {
                const message = String(accessErr.message || accessErr);
                const missingCreds = /Could not load the default credentials|UNAUTHENTICATED|getApplicationDefault|Could not refresh access token/i.test(message);
                if (!missingCreds) throw accessErr;
                access = {
                    allowed: true,
                    guestAccess: true,
                    guestLessonLimit: GUEST_FREE_LESSON_LIMIT,
                    guestLessonRemaining: GUEST_FREE_LESSON_LIMIT,
                    accessCheck: 'local-unchecked'
                };
            }
            }
            if (!access.allowed) {
                return res.status(access.status || 402).json(access);
            }
            return res.json({ ...curatedLesson, access });
        }

        const exactRequest = { country, state, grade, topic, language, need, course: course || 'General Education' };
        const localLesson = loadOrCreateLocalLesson(exactRequest);
        if (!firestoreReady()) {
            return res.json({
                ...localLesson,
                access: {
                    allowed: true,
                    guestAccess: true,
                    guestLessonLimit: GUEST_FREE_LESSON_LIMIT,
                    guestLessonRemaining: GUEST_FREE_LESSON_LIMIT,
                    accessCheck: 'local-unchecked'
                }
            });
        }
        const access = await reserveLessonAccess({
            email: req.body.email,
            country,
            topic,
            ip: clientIp(req)
        });
        if (!access.allowed) {
            return res.status(access.status || 402).json(access);
        }

        // Student lessons should open immediately and exactly match the selected
        // course/grade/region. Live AI generation can be enabled separately for
        // reviewed refresh work without slowing or cross-contaminating the flow.
        if (process.env.WAREHOUSE_PREBUILT_ONLY !== 'false' || process.env.LIVE_AI_LESSON_GENERATION !== 'true') return res.json({ ...localLesson, access });

        const cached = await lessonsCol.doc(lessonId).get();
        if (cached.exists) {
            const data = cached.data();
            // If it has the new multimedia and a strong DOK 3 quiz, serve it. Otherwise, upgrade it.
            if (data.media && data.media.images && data.quiz && data.quiz[0].type) {
                const enhanced = ensureDepthOfKnowledgeQuiz(data, { country, state, grade, topic, language, need, course });
                if ((data.quiz || []).length < 10 || (data.quiz || []).some(isWeakQuizItem)) {
                    await lessonsCol.doc(lessonId).set(enhanced, { merge: true });
                }
                return res.json({ ...enhanced, access });
            }
            console.log(`[Warehouse Sync] Upgrading legacy lesson: ${topic}`);
        }

        const prompt = `Generate a world-class, standards-aligned lesson for ${country} ${state || ''}, ${grade}. 
        Topic: "${topic}".
        Language: ${language}.
        Teacher need: "${need || 'Daily Lesson'}".
        
        MANDATE: Follow strict spelling and grammatical conventions.
        MANDATE: Include teacher-ready structure: objective, materials, direct instruction, guided practice, independent practice, differentiation, assessment, answer key, and one game or mix-and-match activity where useful.
        MANDATE: Align to the official or closest equivalent ${country}${state ? ` (${state})` : ''} standard for this grade and topic.
        MANDATE: The quiz must be a high-value Depth of Knowledge 3 knowledge check with at least 10 questions. Do not ask if students are ready. Do not use yes/no questions. Ask students to analyze, justify with evidence, compare, evaluate, transfer to a new case, identify misconceptions, and design/apply a solution.
        
        Format your response EXACTLY like this:
        ===TITLE===
        Lesson Title
        ===HOOK===
        1-sentence hook
        ===MEDIA===
        3 Image Keywords | 1 Educational Video Topic
        ===CONTENT===
        Detailed lesson body...
        ===QUIZ===
        CHOICE | 1. Question? | Opt1 | Opt2 | Opt3 | Opt4 | CorrectOpt
        CHOICE | 2. Question? | Opt1 | Opt2 | Opt3 | Opt4 | CorrectOpt
        CHOICE | 3. Question? | Opt1 | Opt2 | Opt3 | Opt4 | CorrectOpt
        CHOICE | 4. Question? | Opt1 | Opt2 | Opt3 | Opt4 | CorrectOpt
        CHOICE | 5. Question? | Opt1 | Opt2 | Opt3 | Opt4 | CorrectOpt
        SHORT | 6. Writing Prompt
        SHORT | 7. Writing Prompt
        SHORT | 8. Writing Prompt
        SHORT | 9. Writing Prompt
        SHORT | 10. Writing Prompt
        ===END===`;

        const result = await model.generateContent(prompt);
        const text = result.response.text() || "";
        
        const title = (text.match(/===TITLE===([\s\S]*?)===HOOK===/) || [null, "Lesson Content"])[1]?.trim();
        const hook = (text.match(/===HOOK===([\s\S]*?)===MEDIA===/) || [null, "Exploring " + topic])[1]?.trim();
        const mediaText = (text.match(/===MEDIA===([\s\S]*?)===CONTENT===/) || [null, "education | " + topic])[1]?.trim();
        const content = (text.match(/===CONTENT===([\s\S]*?)===QUIZ===/) || [null, text.substring(0, 1000)])[1]?.trim();
        const quizText = (text.match(/===QUIZ===([\s\S]*?)===END===/) || [null, ""])[1]?.trim();

        const mediaParts = mediaText.split('|');
        const imageKeywords = (mediaParts[0] || "").split(',').map(k => k.trim());
        const videoTerm = (mediaParts[1] || topic).trim();

        const quiz = quizText.split('\n').filter(l => l.includes('|')).map(line => {
            const parts = line.split('|').map(p => p.trim());
            if (parts[0] === 'CHOICE') {
                return { type: 'choice', question: parts[1], options: parts.slice(2, 6), answer: parts[6] };
            } else {
                return { type: 'short', question: parts[1] };
            }
        });

        const lessonData = {
            title, hook, content, 
            quiz: ensureDepthOfKnowledgeQuiz({ title, topic, course, grade, country, state, quiz }).quiz,
            media: {
                images: imageKeywords.map(k => `https://images.unsplash.com/featured/?${k.replace(/ /g, '+')}`),
                video: `https://www.youtube.com/results?search_query=${videoTerm.replace(/ /g, '+')}+educational+lesson+for+kids`
            },
            topic, country, state, grade, language, course,
            export_metadata: { lms_ready: true, standards_aligned: true, region: state || country }
        };

        const enhancedLessonData = ensureDepthOfKnowledgeQuiz(lessonData, { country, state, grade, topic, language, need, course });
        await lessonsCol.doc(lessonId).set(enhancedLessonData);
        res.json({ ...enhancedLessonData, access });
    } catch (err) {
        console.error("[Lesson Error]:", err);
        if (String(err.message || '').startsWith('Prebuilt lesson package not found:')) {
            return res.status(404).json({ error: 'Prebuilt lesson unavailable', detail: err.message });
        }
        // Fallback "Quick-Start" Lesson instead of 500
        res.json({
            title: `Introduction to ${topic}`,
            hook: "Instant access to global standards.",
            content: "We are currently synchronizing this specific lesson from the global curriculum database. This usually takes 5-10 seconds. Please refresh this page to see the full content.",
            quiz: buildDepthOfKnowledgeQuiz({ topic, grade, course, region: state || country }),
            topic, country, state, grade, language, course,
            is_loading: true
        });
    }
});

// --- Creator Marketplace ---

const MARKETPLACE_TYPES = ['Lesson', 'Unit', 'Course'];
const MARKETPLACE_STATUS = ['published', 'pending_review'];
const creatorShareFor = (price) => Number((price * 0.8).toFixed(2));
const platformFeeFor = (price) => Number((price * 0.2).toFixed(2));
const sanitizePrice = (value, fallback = 5) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Number(parsed.toFixed(2));
};
const defaultPriceForType = (type) => type === 'Course' ? 100 : type === 'Unit' ? 10 : 5;

const sampleMarketplaceItems = [
    {
        id: 'sample-phonics-fluency-lesson',
        title: 'Phonics Fluency Mini-Lesson',
        type: 'Lesson',
        creatorName: 'Global LMS Studio',
        creatorEmail: 'studio@global-lms.local',
        price: 5,
        creatorShare: 4,
        platformFee: 1,
        grade: 'Grade 2',
        country: 'USA',
        course: 'Reading Literature',
        summary: 'A paid creator marketplace sample with teacher plan, worksheet, fluency check, and answer key.',
        content: 'Students practice phonics fluency with a short explicit lesson, guided reading practice, and a quick mastery check.',
        standards: 'Foundational reading standards aligned to grade-level decoding, fluency, and comprehension expectations.',
        remixOf: '',
        certificationStatus: 'Certified teacher for this subject/grade',
        contributionMode: 'paid-marketplace',
        license: 'Creator marketplace license. Buyers may use in class. Remix/resale requires meaningful improvement and attribution.',
        status: 'published'
    },
    {
        id: 'sample-ecosystems-unit',
        title: 'Local Ecosystems Investigation Unit',
        type: 'Unit',
        creatorName: 'Global LMS Studio',
        creatorEmail: 'studio@global-lms.local',
        price: 10,
        creatorShare: 8,
        platformFee: 2,
        grade: 'Grade 5',
        country: 'USA',
        course: 'Science',
        summary: 'A five-lesson paid unit that helps students investigate ecosystems, food webs, and human impact.',
        content: 'Includes five lessons, a field observation activity, vocabulary practice, quiz, answer key, and culminating task.',
        standards: 'NGSS-style life science and ecosystem performance expectations.',
        remixOf: '',
        certificationStatus: 'Certified teacher for this subject/grade',
        contributionMode: 'paid-marketplace',
        license: 'Creator marketplace license. Buyers may use in class. Remix/resale requires meaningful improvement and attribution.',
        status: 'published'
    }
];

app.get('/api/marketplace', async (req, res) => {
    try {
        if (!firestoreReady()) {
            return res.json({ items: [], emptyState: 'coming_soon' });
        }
        const snapshot = await marketplaceCol.limit(100).get();
        const items = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((item) => MARKETPLACE_STATUS.includes(item.status))
            .filter(isPublicMarketplaceItem)
            .sort((a, b) => {
                const left = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const right = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return right - left;
            })
            .slice(0, 60);
        res.json({ items, emptyState: items.length ? null : 'coming_soon' });
    } catch (err) {
        console.error('[Marketplace List Error]:', err);
        res.json({ items: [], emptyState: 'coming_soon' });
    }
});

app.post('/api/marketplace', async (req, res) => {
    try {
        const {
            title,
            type,
            creatorName,
            creatorEmail,
            price,
            grade,
            country,
            course,
            summary,
            content,
            standards,
            remixOf,
            certificationStatus,
            contributionMode
        } = req.body;

        const cleanType = MARKETPLACE_TYPES.includes(type) ? type : 'Lesson';
        const isVolunteer = contributionMode === 'free-country-expansion';
        const cleanPrice = isVolunteer ? 0 : sanitizePrice(price, defaultPriceForType(cleanType));
        const safeCreatorEmail = cleanEmail(creatorEmail);
        const item = {
            title: cleanString(title, 160) || `Untitled ${cleanType}`,
            type: cleanType,
            creatorName: cleanString(creatorName, 100) || 'Creator',
            creatorEmail: safeCreatorEmail || 'unknown@global-lms.local',
            price: cleanPrice,
            creatorShare: isVolunteer ? 0 : creatorShareFor(cleanPrice),
            platformFee: isVolunteer ? 0 : platformFeeFor(cleanPrice),
            grade: cleanString(grade, 40) || 'Grade 5',
            country: cleanString(country, 80) || 'USA',
            course: cleanString(course, 120) || 'General Education',
            summary: cleanString(summary, 700),
            content: cleanString(content, 20000),
            standards: cleanString(standards, 1200),
            remixOf: cleanString(remixOf, 180),
            certificationStatus: cleanString(certificationStatus, 120) || 'Certification not provided',
            contributionMode: isVolunteer ? 'free-country-expansion' : 'paid-marketplace',
            license: isVolunteer
                ? 'Volunteer free-access contribution. Not paid. May be used to expand free country libraries.'
                : 'Creator marketplace license. Buyers may use in class. Remix/resale requires meaningful improvement and attribution.',
            status: cleanString(content, 20000).length > 120 ? 'published' : 'pending_review',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const doc = await marketplaceCol.add(item);
        res.json({ id: doc.id, ...item });
    } catch (err) {
        console.error('[Marketplace Create Error]:', err);
        res.status(500).json({ error: 'Failed to save marketplace item' });
    }
});

// --- 💳 PAYMENT & CONTACT ENGINE ---

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet.', detail: 'Add STRIPE_SECRET_KEY on the server, then redeploy.' });
        const { email, items } = req.body;
        const safeEmail = cleanEmail(email);
        const safeItems = Array.isArray(items) ? items.slice(0, 10).map((item) => ({
            name: cleanString(item.name, 180) || 'Global LMS resource',
            image: /^https:\/\//.test(String(item.image || '')) ? String(item.image).slice(0, 500) : '',
            price: cleanString(item.price, 20),
            amountCents: amountCentsFromPrice(item.price),
            marketplaceItemId: cleanString(item.marketplaceItemId, 120),
            creatorEmail: cleanEmail(item.creatorEmail),
            creatorShare: cleanString(item.creatorShare, 20),
            platformFee: cleanString(item.platformFee, 20)
        })) : [];
        if (!safeEmail || !safeItems.length) return res.status(400).json({ error: 'A valid email and checkout item are required.' });
        const metadataItem = safeItems[0] || {};
        const safeOrigin = ALLOWED_ORIGINS.has(req.headers.origin) ? req.headers.origin : PUBLIC_APP_URL;
        const session = await stripe.checkout.sessions.create({
            customer_email: safeEmail,
            allow_promotion_codes: true,
            line_items: safeItems.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: { name: item.name, images: item.image ? [item.image] : [] },
                    unit_amount: item.amountCents,
                },
                quantity: 1,
            })),
            mode: 'payment',
            ...(process.env.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true } } : {}),
            metadata: {
                type: 'marketplace_order',
                buyerEmail: safeEmail,
                itemName: metadataItem.name || '',
                marketplaceItemId: metadataItem.marketplaceItemId || '',
                creatorEmail: metadataItem.creatorEmail || '',
                creatorShare: metadataItem.creatorShare || '',
                platformFee: metadataItem.platformFee || '',
                revenueSplit: metadataItem.creatorEmail ? 'creator_80_platform_20' : 'platform'
            },
            success_url: `${safeOrigin}/?success=true`,
            cancel_url: `${safeOrigin}/?canceled=true`,
        });
        res.json({ id: session.id, url: session.url });
    } catch (err) {
        console.error("Stripe Session Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { email, message } = req.body;
        const safeEmail = cleanEmail(email);
        const safeMessage = cleanString(message, 2500);
        if (!safeEmail || !safeMessage) return res.status(400).json({ error: 'A valid email and message are required.' });
        await db.collection('messages').add({
            email: safeEmail,
            message: safeMessage,
            timestamp: new Date()
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to send message" });
    }
});

app.get('/api/admin/messages', requireAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('messages').orderBy('timestamp', 'desc').get();
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR:", err);
    res.status(500).json({ 
        error: "Internal Server Error", 
        message: "Something went wrong on our end. We've logged the error."
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
