const dcMap = {
  com: {
    accounts: 'https://accounts.zoho.com',
    api: 'https://www.zohoapis.com',
    desk: 'https://desk.zoho.com',
    mail: 'https://mail.zoho.com'
  },
  eu: {
    accounts: 'https://accounts.zoho.eu',
    api: 'https://www.zohoapis.eu',
    desk: 'https://desk.zoho.eu',
    mail: 'https://mail.zoho.eu'
  },
  in: {
    accounts: 'https://accounts.zoho.in',
    api: 'https://www.zohoapis.in',
    desk: 'https://desk.zoho.in',
    mail: 'https://mail.zoho.in'
  },
  au: {
    accounts: 'https://accounts.zoho.com.au',
    api: 'https://www.zohoapis.com.au',
    desk: 'https://desk.zoho.com.au',
    mail: 'https://mail.zoho.com.au'
  },
  cn: {
    accounts: 'https://accounts.zoho.com.cn',
    api: 'https://www.zohoapis.com.cn',
    desk: 'https://desk.zoho.com.cn',
    mail: 'https://mail.zoho.com.cn'
  },
  ca: {
    accounts: 'https://accounts.zohocloud.ca',
    api: 'https://www.zohoapis.ca',
    desk: 'https://desk.zoho.ca',
    mail: 'https://mail.zoho.ca'
  },
  jp: {
    accounts: 'https://accounts.zoho.jp',
    api: 'https://www.zohoapis.jp',
    desk: 'https://desk.zoho.jp',
    mail: 'https://mail.zoho.jp'
  },
  sa: {
    accounts: 'https://accounts.zoho.sa',
    api: 'https://www.zohoapis.sa',
    desk: 'https://desk.zoho.sa',
    mail: 'https://mail.zoho.sa'
  }
};

const normalizeDc = (value = '') => String(value || 'com').trim().toLowerCase();
const resolveDc = (value = '') => dcMap[normalizeDc(value)] || dcMap.com;
const trim = (value = '') => String(value || '').trim();
const toJson = async (response, fallbackMessage) => {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || data?.raw || fallbackMessage || 'Zoho request failed';
    const error = new Error(detail);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
};

function createZohoClient(env = process.env) {
  const dc = resolveDc(env.ZOHO_DC);
  const state = {
    accessToken: trim(env.ZOHO_ACCESS_TOKEN),
    accessTokenExpiresAt: 0
  };

  const requiresOAuth = () => Boolean(trim(env.ZOHO_REFRESH_TOKEN));

  const getScopeAdvice = () => ({
    crm: 'ZohoCRM.modules.ALL',
    books: 'ZohoBooks.contacts.CREATE ZohoBooks.invoices.CREATE ZohoBooks.settings.READ',
    desk: 'Desk.tickets.CREATE',
    mail: 'ZohoMail.messages.CREATE'
  });

  async function refreshAccessToken() {
    const refreshToken = trim(env.ZOHO_REFRESH_TOKEN);
    const clientId = trim(env.ZOHO_CLIENT_ID);
    const clientSecret = trim(env.ZOHO_CLIENT_SECRET);
    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error('Zoho OAuth refresh token, client ID, and client secret are required.');
    }
    const url = new URL('/oauth/v2/token', dc.accounts);
    url.searchParams.set('refresh_token', refreshToken);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);
    url.searchParams.set('grant_type', 'refresh_token');
    const response = await fetch(url, { method: 'POST' });
    const data = await toJson(response, 'Failed to refresh Zoho access token.');
    if (!data.access_token) throw new Error('Zoho did not return an access token.');
    state.accessToken = data.access_token;
    state.accessTokenExpiresAt = Date.now() + Math.max(60000, (Number(data.expires_in || 3600) - 60) * 1000);
    return state.accessToken;
  }

  async function getAccessToken() {
    if (state.accessToken && (!requiresOAuth() || Date.now() < state.accessTokenExpiresAt)) {
      return state.accessToken;
    }
    if (!requiresOAuth() && state.accessToken) return state.accessToken;
    if (requiresOAuth()) return refreshAccessToken();
    throw new Error('Zoho access token is missing. Set ZOHO_ACCESS_TOKEN or configure refresh token OAuth.');
  }

  async function zohoFetch(service, path, { method = 'GET', query = {}, headers = {}, body } = {}) {
    const accessToken = await getAccessToken();
    const base = service === 'crm' || service === 'books'
      ? dc.api
      : service === 'desk'
        ? dc.desk
        : service === 'mail'
          ? dc.mail
          : dc.api;
    const url = new URL(path, base);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return toJson(response, `Zoho ${service} request failed.`);
  }

  return {
    status() {
      return {
        dc: normalizeDc(env.ZOHO_DC || 'com'),
        hasAccessToken: Boolean(trim(env.ZOHO_ACCESS_TOKEN)),
        hasRefreshToken: Boolean(trim(env.ZOHO_REFRESH_TOKEN)),
        hasClientId: Boolean(trim(env.ZOHO_CLIENT_ID)),
        hasClientSecret: Boolean(trim(env.ZOHO_CLIENT_SECRET)),
        hasBooksOrgId: Boolean(trim(env.ZOHO_BOOKS_ORG_ID)),
        hasDeskOrgId: Boolean(trim(env.ZOHO_DESK_ORG_ID)),
        hasMailAccountId: Boolean(trim(env.ZOHO_MAIL_ACCOUNT_ID)),
        requiredScopes: getScopeAdvice()
      };
    },
    async createLead(input) {
      const lastName = trim(input.lastName);
      if (!lastName) throw new Error('Last name is required for Zoho CRM leads.');
      const record = {
        Last_Name: lastName,
        First_Name: trim(input.firstName),
        Company: trim(input.company) || 'Global LMS',
        Email: trim(input.email),
        Phone: trim(input.phone),
        Lead_Source: trim(input.leadSource),
        Description: trim(input.description)
      };
      Object.keys(record).forEach((key) => {
        if (!record[key]) delete record[key];
      });
      return zohoFetch('crm', '/crm/v8/Leads', {
        method: 'POST',
        body: { data: [record] }
      });
    },
    async addNote(input) {
      const parentId = trim(input.parentId);
      const moduleName = trim(input.moduleName);
      const noteContent = trim(input.noteContent);
      if (!parentId || !moduleName || !noteContent) throw new Error('parentId, moduleName, and noteContent are required.');
      return zohoFetch('crm', '/crm/v8/Notes', {
        method: 'POST',
        body: {
          data: [{
            Parent_Id: parentId,
            $se_module: moduleName,
            Note_Title: trim(input.noteTitle) || 'Global LMS note',
            Note_Content: noteContent
          }]
        }
      });
    },
    async createBooksContact(input) {
      const orgId = trim(input.organizationId || env.ZOHO_BOOKS_ORG_ID);
      const contactName = trim(input.contactName);
      if (!orgId) throw new Error('Zoho Books organization ID is required.');
      if (!contactName) throw new Error('contactName is required.');
      return zohoFetch('books', '/books/v3/contacts', {
        method: 'POST',
        query: { organization_id: orgId },
        body: {
          contact_name: contactName,
          company_name: trim(input.companyName),
          email: trim(input.email),
          phone: trim(input.phone),
          website: trim(input.website),
          notes: trim(input.notes)
        }
      });
    },
    async createBooksInvoice(input) {
      const orgId = trim(input.organizationId || env.ZOHO_BOOKS_ORG_ID);
      const customerId = trim(input.customerId);
      if (!orgId) throw new Error('Zoho Books organization ID is required.');
      if (!customerId) throw new Error('customerId is required.');
      const lineItems = Array.isArray(input.lineItems) && input.lineItems.length ? input.lineItems : [{
        name: trim(input.itemName) || 'Global LMS service',
        rate: Number(input.amount || 0),
        quantity: Number(input.quantity || 1)
      }];
      return zohoFetch('books', '/books/v3/invoices', {
        method: 'POST',
        query: { organization_id: orgId },
        body: {
          customer_id: customerId,
          line_items: lineItems,
          notes: trim(input.notes),
          reference_number: trim(input.referenceNumber)
        }
      });
    },
    async createDeskTicket(input) {
      const orgId = trim(input.organizationId || env.ZOHO_DESK_ORG_ID);
      const subject = trim(input.subject);
      const departmentId = trim(input.departmentId);
      const contactId = trim(input.contactId);
      if (!orgId) throw new Error('Zoho Desk organization ID is required.');
      if (!subject || !departmentId || !contactId) throw new Error('subject, departmentId, and contactId are required.');
      return zohoFetch('desk', '/api/v1/tickets', {
        method: 'POST',
        headers: { orgId },
        body: {
          subject,
          departmentId,
          contactId,
          description: trim(input.description),
          priority: trim(input.priority) || 'Medium',
          status: trim(input.status) || 'Open',
          channel: trim(input.channel) || 'Email',
          email: trim(input.email)
        }
      });
    },
    async sendMail(input) {
      const accountId = trim(input.accountId || env.ZOHO_MAIL_ACCOUNT_ID);
      const fromAddress = trim(input.fromAddress || env.ZOHO_MAIL_FROM_ADDRESS);
      const toAddress = trim(input.toAddress);
      const subject = trim(input.subject);
      const content = trim(input.content);
      if (!accountId) throw new Error('Zoho Mail account ID is required.');
      if (!fromAddress || !toAddress || !subject || !content) throw new Error('fromAddress, toAddress, subject, and content are required.');
      return zohoFetch('mail', `/api/accounts/${accountId}/messages`, {
        method: 'POST',
        body: {
          fromAddress,
          toAddress,
          ccAddress: trim(input.ccAddress),
          bccAddress: trim(input.bccAddress),
          subject,
          content,
          mailFormat: trim(input.mailFormat) || 'html',
          askReceipt: trim(input.askReceipt) || 'no',
          encoding: trim(input.encoding) || 'UTF-8'
        }
      });
    },
  };
}

module.exports = { createZohoClient };
