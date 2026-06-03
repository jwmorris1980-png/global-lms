const { createZohoClient } = require('./zoho-client.cjs');

const dcMap = {
  com: 'https://accounts.zoho.com',
  eu: 'https://accounts.zoho.eu',
  in: 'https://accounts.zoho.in',
  au: 'https://accounts.zoho.com.au',
  cn: 'https://accounts.zoho.com.cn',
  ca: 'https://accounts.zohocloud.ca',
  jp: 'https://accounts.zoho.jp',
  sa: 'https://accounts.zoho.sa'
};

const env = process.env;
const dc = String(env.ZOHO_DC || 'com').toLowerCase();
const accountsBase = dcMap[dc] || dcMap.com;
const redirectUri = env.ZOHO_REDIRECT_URI || 'https://lms-all-languages.vercel.app/';
const scope = env.ZOHO_SCOPES || [
  'ZohoCRM.modules.ALL',
  'ZohoBooks.settings.READ',
  'ZohoBooks.contacts.CREATE',
  'ZohoBooks.invoices.CREATE',
  'Desk.tickets.CREATE',
  'ZohoMail.messages.CREATE'
].join(',');

async function exchangeCode(code) {
  const clientId = String(env.ZOHO_CLIENT_ID || '').trim();
  const clientSecret = String(env.ZOHO_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new Error('ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are required.');
  const url = new URL('/oauth/v2/token', accountsBase);
  url.searchParams.set('code', code);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('grant_type', 'authorization_code');
  const response = await fetch(url, { method: 'POST' });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data?.error_description || data?.message || data?.raw || 'Zoho token exchange failed.');
  }
  return data;
}

async function main() {
  const [, , command, arg] = process.argv;
  if (command === 'consent') {
    const clientId = String(env.ZOHO_CLIENT_ID || '').trim();
    if (!clientId) throw new Error('ZOHO_CLIENT_ID is required.');
    const url = new URL('/oauth/v2/auth', accountsBase);
    url.searchParams.set('scope', scope);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('redirect_uri', redirectUri);
    console.log(url.toString());
    return;
  }

  if (command === 'exchange') {
    if (!arg) throw new Error('Provide the authorization code to exchange.');
    const token = await exchangeCode(arg);
    console.log(JSON.stringify(token, null, 2));
    return;
  }

  const client = createZohoClient(env);
  console.log(JSON.stringify(client.status(), null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
