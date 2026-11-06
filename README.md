# EchoRead Contribution — YouTube Transcript Pipeline

**Contribution to [xoriors/echo-read](https://github.com/xoriors/echo-read)**  
Open-source contribution made in the framework of **CDL**.

This repository contains the implementation of a reliable, serverless YouTube transcript extraction pipeline and the corresponding refactoring of the Gemini analysis layer for the EchoRead project.

---

## Context

EchoRead turns articles, PDFs, web pages and YouTube videos into natural spoken audio (full content or short/long summaries) using Google Gemini.

Previous YouTube handling relied on a browser-side CORS proxy to fetch transcripts. That approach proved unstable and frequently failed, causing the model to fall back to incomplete web-search results and produce hallucinations.

This contribution replaces that fragile client-side solution with a clean server-side (serverless) endpoint and simplifies the client logic.

---

## What was implemented

### 1. Serverless transcript endpoint (`api/transcript.ts`)
- Vercel serverless function that uses the `youtube-transcript` library
- Accepts a `videoId` query parameter
- Returns a clean, concatenated transcript string
- Proper error handling for private, age-restricted or caption-less videos
- Runs on the server → no CORS issues

### 2. Gemini service refactoring (`services/geminiService.ts`)
- Removed the external CORS proxy logic
- Added `extractYouTubeVideoId()` helper that supports multiple YouTube URL formats
- Added `fetchYouTubeTranscript()` that calls the new internal `/api/transcript` endpoint with a timeout
- When a transcript is available, Gemini analyses the actual spoken content
- Graceful fallback to Google Search grounding only when no usable transcript can be obtained
- Significantly reduces hallucinations on YouTube content

### 3. Development configuration
- Vite proxy (`vite.config.ts`) so `/api/*` requests are forwarded correctly during local development
- Cleaner separation between client and server concerns

---

## Key benefits

| Before | After |
|--------|-------|
| Unstable CORS proxy in the browser | Stable serverless function |
| Frequent transcript failures → hallucinations | Reliable transcript → accurate analysis |
| Complex proxy logic mixed with Gemini code | Clean, focused service layer |
| Hard to run outside Google AI Studio | Works locally and on Vercel |

---

## Project structure (relevant parts)

```
api/
  transcript.ts          # Serverless YouTube transcript endpoint
services/
  geminiService.ts       # Refactored Gemini analysis (YouTube path)
vite.config.ts           # Dev proxy for /api
```

---

## How to run locally

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

The Vite proxy forwards `/api/transcript` requests so the serverless function can be exercised during development.

---

## Related links

- Upstream project: [https://github.com/xoriors/echo-read](https://github.com/xoriors/echo-read)
- This contribution: [https://github.com/miruna-dev/echo-read-contribution](https://github.com/miruna-dev/echo-read-contribution)

---

## Author

Contribution by **Miruna Enache** ([@miruna-dev](https://github.com/miruna-dev)) as part of the **CDL** open-source programme.
```
