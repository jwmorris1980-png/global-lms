# Security Policy

## Reporting Security Issues

Please report security concerns to support@global-lms.org.

Do not publicly disclose vulnerabilities until the issue has been reviewed and a fix or mitigation plan is available.

## Sensitive Data

Global LMS should not commit:

- API keys or service account credentials
- Stripe secrets or webhook signing secrets
- Student, teacher, parent, or school records
- Private analytics exports
- Production `.env` files

Use local `.env` files for development and managed secret storage for production deployments.
