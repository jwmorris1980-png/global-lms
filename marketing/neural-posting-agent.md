# Global LMS Neural Posting Agent

This agent opens social and directory targets, copies the right draft to your clipboard, and tries to fill obvious text boxes. It does not click final Post, Submit, Publish, or Create buttons for you. Review each page first.

## Run Everything

```powershell
cd "C:\Users\Yeyian PC\Desktop\LMS all languages"
npm run neural-agent
```

## Run A Smaller Batch

```powershell
npm run neural-agent -- --limit=3
```

## Run One Target

```powershell
npm run neural-agent -- --target=facebook
npm run neural-agent -- --target=linkedin
npm run neural-agent -- --target=youtube
```

## What It Opens

- Facebook Page setup
- LinkedIn Company Page setup
- YouTube Channel setup
- Facebook share
- LinkedIn share
- Facebook education group search
- LinkedIn education search
- eLearning Industry
- Capterra
- EdSurge
- TES Resources
- Product Hunt
- K12 Digest

## Safe Posting Rule

The agent prepares and fills. You approve the final click. This prevents accidental public posts, duplicate spam, or posting into groups where promotion is not allowed.
