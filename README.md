# StudyPlan

A small installable PWA for keeping track of lectures, exams and course materials — built for
my own semester, no framework, just DOM.

## What it does

- Calendar view of lectures and exams, color-coded by course
- Tracks which materials you still need to buy vs. already have
- Installable on desktop and mobile (manifest + service worker, works offline)
- Syncs automatically with Uni Wien's u:space calendar feed: a GitHub Action runs hourly,
  pulls the personal ICS feed server-side (avoids the CORS issue that would otherwise block a
  browser from reading it), converts it to compact JSON and writes it to a Gist that the PWA
  fetches client-side via `raw.githubusercontent.com`. Feed URL and Gist credentials are kept
  out of the repo as Action secrets.

## Stack

Vanilla JS, CSS, a service worker for offline support, and a small Node script
(`scripts/sync-uspace.mjs`) for the calendar sync job.

## Running it locally

Static site — serve the directory with anything (`npx serve .`, Python's `http.server`, …)
and open it in a browser.
