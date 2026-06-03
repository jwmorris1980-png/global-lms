import { readFileSync } from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod/v4';
import { buildChatgptQuickDraft } from './chatgptDraft.js';

const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || 'https://www.global-lms.org').trim().slice(0, 120);
const WIDGET_URI = 'ui://widget/quick-draft.html';
const transports = new Map();

function buildServer() {
  const server = new McpServer({
    name: 'global-lms-chatgpt-app',
    version: '1.0.0',
    title: 'Global LMS',
    websiteUrl: PUBLIC_APP_URL,
    icons: [{ src: `${PUBLIC_APP_URL}/favicon.svg`, sizes: ['512x512'], mimeType: 'image/svg+xml' }]
  }, { capabilities: { logging: {} } });

  server.registerResource('quick-draft-widget', WIDGET_URI, {
    title: 'Global LMS',
    description: 'Fast lesson, quiz, worksheet, unit, and course drafts for teachers, tutors, and parents.',
    mimeType: 'text/html',
    _meta: {
      'openai/widgetDescription': 'Fast lesson, quiz, worksheet, unit, and course drafts for teachers, tutors, and parents.',
      'openai/widgetPrefersBorder': true,
      'openai/widgetDomain': PUBLIC_APP_URL,
      'openai/widgetCSP': {
        connect_domains: [PUBLIC_APP_URL],
        resource_domains: [PUBLIC_APP_URL]
      }
    }
  }, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: 'text/html',
      text: readFileSync(new URL('../public/chatgpt-app.html', import.meta.url), 'utf8')
    }]
  }));

  server.registerTool('create_quick_draft', {
    title: 'Create Quick Draft',
    description: 'Create a fast lesson, quiz, worksheet, unit, or course draft for any country, state, grade, and subject.',
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
      'openai/outputTemplate': WIDGET_URI
    },
    annotations: {
      title: 'Quick Draft Generator',
      readOnlyHint: true,
      openWorldHint: false
    }
  }, async ({ country, state, grade, subject, kind }) => {
    const draft = buildChatgptQuickDraft({
      country,
      state,
      grade,
      subject,
      kind
    });

    return {
      content: [{
        type: 'text',
        text: draft.copyReadyText || draft.summary
      }],
      structuredContent: draft
    };
  });

  return server;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null
      });
      return;
    }

    const server = buildServer();
    const sessionId = req.headers['mcp-session-id'];
    let body;

    try {
      body = req.body;
    } catch (parseError) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Invalid JSON.' },
        id: null
      });
      return;
    }
    let transport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else if (req.method === 'POST' && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports.set(newSessionId, transport);
        }
      });
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid) transports.delete(sid);
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    } else if (req.method === 'GET' && sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
      return;
    }

    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error('[Vercel MCP Error]:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
}
