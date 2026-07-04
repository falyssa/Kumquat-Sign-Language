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
2. Make a hand sign, type in a word and an emoji for it, then hit
   **Capture Pose** and hold the sign steady for the ~1.5s capture.
3. Hit **Save Gesture**. You can capture more samples for the same word to
   make it more reliable — just capture again and save again.
4. Head back to the **Live Page** — making one of your trained signs will pop
   up its emoji and word. Everything is saved in your browser (`localStorage`),
   so it's still there next time you open the site.

## How the recognition works

There's no ML training step. Each capture stores a normalized snapshot of the
21 MediaPipe hand-landmark points (translated to the wrist, scaled by hand
size). Live detection just finds the nearest stored snapshot to the current
frame and requires a majority match over several frames before showing a
result, which keeps it fast, offline-friendly, and instantly re-usable across
sessions.
