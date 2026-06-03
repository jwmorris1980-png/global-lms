# Contributing to Global LMS

Global LMS welcomes contributions that improve access to high-quality K-12 learning materials.

## Good First Contributions

- Improve lesson quality, clarity, accessibility, and age appropriateness.
- Add curriculum alignment notes for countries, states, standards, grades, or courses.
- Improve localization, translation support, and language accessibility.
- Strengthen tests, deployment checks, and content QA scripts.
- Improve teacher, family, and student-facing usability.

## Local Setup

```bash
npm install
npm run build
npm run server
```

Copy `.env.example` to `.env` and provide only the keys required for the feature you are testing.

## Contribution Standards

- Do not commit API keys, payment secrets, user data, student data, or private deployment credentials.
- Keep educational content safe, age-appropriate, and culturally respectful.
- Prefer clear, reviewable changes over large unrelated rewrites.
- Run `npm run build` before submitting changes when possible.

## Educational Safety

Human review is expected before content is used with students. Contributions should make it easier for teachers and families to understand, verify, adapt, and safely use lessons.
