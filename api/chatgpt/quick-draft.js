import { buildChatgptQuickDraft } from '../chatgptDraft.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const data = buildChatgptQuickDraft({
      country: req.body?.country,
      state: req.body?.state,
      grade: req.body?.grade,
      subject: req.body?.subject,
      kind: req.body?.kind
    });
    res.status(200).json(data);
  } catch (error) {
    console.error('[Quick Draft Proxy Error]:', error);
    res.status(500).json({ error: 'Failed to build ChatGPT draft', detail: error.message });
  }
}
