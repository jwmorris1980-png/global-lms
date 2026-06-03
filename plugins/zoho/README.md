# Zoho Connector

This plugin connects Global LMS to Zoho CRM, Zoho Mail, Zoho Books, and Zoho Desk.

## What it can do

- Create CRM leads from LMS contacts
- Add CRM notes to records
- Create Books contacts and invoices
- Open Desk tickets from support requests
- Send mail through a Zoho Mail account

## One-time setup

You need a Zoho OAuth app and a refresh token.

Required environment variables:

- `ZOHO_DC` - `com`, `eu`, `in`, `au`, `ca`, `jp`, `sa`, or `cn`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_BOOKS_ORG_ID`
- `ZOHO_DESK_ORG_ID`
- `ZOHO_MAIL_ACCOUNT_ID`
- `ZOHO_MAIL_FROM_ADDRESS`

Optional:

- `ZOHO_ACCESS_TOKEN` - temporary access token if you want to test without refresh
- `ZOHO_REDIRECT_URI` - used by the auth helper
- `ZOHO_SCOPES` - override the default OAuth scopes

## Consent flow

1. Register an OAuth client in Zoho API Console.
2. Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_DC`, and `ZOHO_REDIRECT_URI`.
3. Run:

```bash
node ./scripts/zoho-auth.cjs consent
```

4. Open the generated consent URL and approve access.
5. Copy the returned authorization code.
6. Exchange it for tokens:

```bash
node ./scripts/zoho-auth.cjs exchange <authorization-code>
```

7. Save the returned `refresh_token`.

## MCP server

The local MCP server reads the env vars above and exposes tools for CRM, Mail, Books, and Desk actions.

```bash
node ./scripts/zoho-mcp-server.cjs
```

## Suggested Zoho scopes

- `ZohoCRM.modules.ALL`
- `ZohoBooks.settings.READ`
- `ZohoBooks.contacts.CREATE`
- `ZohoBooks.invoices.CREATE`
- `Desk.tickets.CREATE`
- `ZohoMail.messages.CREATE`
