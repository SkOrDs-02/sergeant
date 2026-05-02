# Security Policy

> **Last validated:** 2026-04-29 by @devin-ai. **Next review:** 2026-07-29.
> **Status:** Active

## Supported Versions

Only the latest version on the `main` branch is actively maintained and receives security fixes.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report vulnerabilities via [GitHub Security Advisories](https://github.com/skords-01/sergeant/security/advisories/new).

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You can expect an acknowledgement within 7 days and a resolution timeline within 30 days for confirmed issues.

## Data

This is a personal life-management platform. Data stored includes:

- User account information (email, hashed password)
- Financial data (transactions, budgets, debts)
- Fitness data (workouts, measurements)
- Nutrition data (meals, recipes, pantry)
- Habit and routine data

Data is stored in a PostgreSQL database hosted on Railway. Monobank API tokens are encrypted at rest with AES-256-GCM.

## Security Measures

- Session-based authentication (Better Auth)
- Rate limiting on all API endpoints
- Parameterized SQL queries throughout
- Helmet security headers
- Strict CORS allowlist
- Input validation with Zod schemas
- Sentry error monitoring with PII scrubbing
