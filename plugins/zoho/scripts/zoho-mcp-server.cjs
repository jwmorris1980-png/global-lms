const { createZohoClient } = require('./zoho-client.cjs');

const client = createZohoClient(process.env);

const tools = [
  {
    name: 'zoho.connection_status',
    description: 'Show which Zoho credentials and organization IDs are configured.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'zoho.crm.create_lead',
    description: 'Create a lead in Zoho CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        lastName: { type: 'string' },
        firstName: { type: 'string' },
        company: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        leadSource: { type: 'string' },
        description: { type: 'string' }
      },
      required: ['lastName'],
      additionalProperties: false
    }
  },
  {
    name: 'zoho.crm.add_note',
    description: 'Add a note to an existing Zoho CRM record.',
    inputSchema: {
      type: 'object',
      properties: {
        parentId: { type: 'string' },
        moduleName: { type: 'string' },
        noteTitle: { type: 'string' },
        noteContent: { type: 'string' }
      },
      required: ['parentId', 'moduleName', 'noteContent'],
      additionalProperties: false
    }
  },
  {
    name: 'zoho.books.create_contact',
    description: 'Create a customer or vendor contact in Zoho Books.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        contactName: { type: 'string' },
        companyName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        website: { type: 'string' },
        notes: { type: 'string' }
      },
      required: ['contactName'],
      additionalProperties: false
    }
  },
  {
    name: 'zoho.books.create_invoice',
    description: 'Create an invoice in Zoho Books.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        customerId: { type: 'string' },
        referenceNumber: { type: 'string' },
        notes: { type: 'string' },
        itemName: { type: 'string' },
        amount: { type: 'number' },
        quantity: { type: 'number' },
        lineItems: { type: 'array' }
      },
      required: ['customerId'],
      additionalProperties: false
    }
  },
  {
    name: 'zoho.desk.create_ticket',
    description: 'Create a support ticket in Zoho Desk.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: { type: 'string' },
        subject: { type: 'string' },
        departmentId: { type: 'string' },
        contactId: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string' },
        status: { type: 'string' },
        email: { type: 'string' },
        channel: { type: 'string' }
      },
      required: ['subject', 'departmentId', 'contactId'],
      additionalProperties: false
    }
  },
  {
    name: 'zoho.mail.send_email',
    description: 'Send an email from a Zoho Mail account.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string' },
        fromAddress: { type: 'string' },
        toAddress: { type: 'string' },
        ccAddress: { type: 'string' },
        bccAddress: { type: 'string' },
        subject: { type: 'string' },
        content: { type: 'string' },
        mailFormat: { type: 'string' },
        askReceipt: { type: 'string' },
        encoding: { type: 'string' }
      },
      required: ['toAddress', 'subject', 'content'],
      additionalProperties: false
    }
  }
];

function jsonRpc(method, params, id) {
  return { jsonrpc: '2.0', method, params, id };
}

function send(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  process.stdout.write(payload);
}

function toContent(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

async function callTool(name, args) {
  switch (name) {
    case 'zoho.connection_status':
      return client.status();
    case 'zoho.crm.create_lead':
      return client.createLead(args);
    case 'zoho.crm.add_note':
      return client.addNote(args);
    case 'zoho.books.create_contact':
      return client.createBooksContact(args);
    case 'zoho.books.create_invoice':
      return client.createBooksInvoice(args);
    case 'zoho.desk.create_ticket':
      return client.createDeskTicket(args);
    case 'zoho.mail.send_email':
      return client.sendMail(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let buffer = Buffer.alloc(0);

function parseMessages() {
  while (true) {
    const separator = buffer.indexOf('\r\n\r\n');
    if (separator === -1) return;
    const headerText = buffer.slice(0, separator).toString('utf8');
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(separator + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = separator + 4;
    if (buffer.length < bodyStart + length) return;
    const body = buffer.slice(bodyStart, bodyStart + length).toString('utf8');
    buffer = buffer.slice(bodyStart + length);
    handleMessage(body);
  }
}

async function handleMessage(body) {
  let msg;
  try {
    msg = JSON.parse(body);
  } catch (err) {
    return send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error', data: err.message }
    });
  }

  const isRequest = Object.prototype.hasOwnProperty.call(msg, 'id');
  const respond = (result, error) => {
    if (!isRequest) return;
    send(error ? { jsonrpc: '2.0', id: msg.id, error } : { jsonrpc: '2.0', id: msg.id, result });
  };

  try {
    if (msg.method === 'initialize') {
      respond({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'zoho', version: '1.0.0' },
        capabilities: { tools: {} }
      });
      return;
    }

    if (msg.method === 'initialized') return;

    if (msg.method === 'tools/list') {
      respond({ tools });
      return;
    }

    if (msg.method === 'tools/call') {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      const output = await callTool(name, args);
      respond({ content: toContent(output) });
      return;
    }

    if (isRequest) {
      respond(null, { code: -32601, message: `Method not found: ${msg.method}` });
    }
  } catch (err) {
    if (isRequest) {
      respond(null, {
        code: -32000,
        message: err.message || 'Zoho tool failed',
        data: err.details || undefined
      });
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parseMessages();
});

process.stdin.on('end', () => process.exit(0));
