# Kumquat Sign Language

A hand-tracking sign-language-to-emoji translator you train yourself. Make up
your own signs, assign each one a word and an emoji, and Kumquat Sign Language
will pop it up live from your webcam — no accounts, no server, no retraining
each time you open it.

## Deploying it (GitHub Pages, Render, etc.)

This is a plain static site — no build step, no server code, no environment
variables — so it deploys as-is to any static host:

- **GitHub Pages**: push this folder to a repo and enable Pages (Settings →
  Pages → deploy from branch). Works whether the repo is served at the root
  of `username.github.io` or at a project subpath like
  `username.github.io/kumquat-sign-language/` — every link in this project is
  relative. A `.nojekyll` file is included so GitHub doesn't try to run its
  Jekyll processor over the files.
- **Render / Netlify / Vercel / Cloudflare Pages**: create a static site,
  point it at this folder, leave the build command empty and the publish
  directory as `.` (or this folder's root).

All of these serve over **HTTPS**, which is exactly what the browser requires
for camera access — so once deployed, the site works for camera + hand
tracking with zero extra configuration.

## Running it locally

Browsers only allow camera access on secure origins — HTTPS, or `localhost`.
They block it on plain `file://` pages, so for local development serve the
folder instead of double-clicking `index.html`. Easiest way, from this folder:

```
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

(Any other static server works too — `npx serve`, VS Code's "Live Server"
extension, etc.)

## Using it

1. Open the **Training Page** (top-right link), allow camera access.
2. Make a hand sign — one hand or two, whichever the sign needs — type in a
   word and an emoji for it, then hit **Capture Pose**. A 3-second countdown
   gives you time to get into position (useful for multi-step or two-hand
   signs), then it records for 5 seconds, shown right on the camera view.
3. Hit **Save Gesture**. You can capture more samples for the same word to
   make it more reliable — just capture again and save again. (A word is
   locked to however many hands it was first trained with — you can't mix a
   1-hand and a 2-hand version under the same word.)
4. Head back to the **Live Page** — making one of your trained signs will pop
   up its emoji and word. Everything is saved in your browser (`localStorage`),
   so it's still there next time you open the site.

## How the recognition works

There's no ML training step. Up to two hands are tracked at once (via
MediaPipe's handedness classification, so a sign that uses a specific left
and right hand shape stays consistent regardless of where each hand is on
screen). Each capture stores a normalized snapshot of the 21 landmark points
per visible hand, concatenated into one vector. Live detection finds the
nearest stored snapshot with a matching hand count and requires a majority
match over several frames before showing a result, which keeps it fast,
offline-friendly, and instantly re-usable across sessions.
