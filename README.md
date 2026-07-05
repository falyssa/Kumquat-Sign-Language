# Kumquat Sign Language

A hand-tracking sign-language-to-emoji translator you train yourself. Make up
your own signs, assign each one a word and an emoji, and Kumquat Sign Language
will pop it up live from your webcam — no accounts, no server, no retraining
each time you open it.

It's named after (and made for) my autistic brother Kumquat, to help him
practice sign language — when he signs something correctly, he gets to see it
right away as an emoji on screen, with a little sound to go with it. It's also
where we keep every sign we've invented together as siblings, so none of them
get forgotten.

**Live site:** https://falyssa.github.io/Kumquat-Sign-Language/

## Deploying it

Hosted on GitHub Pages, deployed straight from the `main` branch (Settings →
Pages → Deploy from a branch). It's a plain static site — no build step, no
server code — so a `.nojekyll` file is included so GitHub doesn't try to run
its Jekyll processor over the files, and every link in the project is
relative so it works at the `/Kumquat-Sign-Language/` subpath. GitHub Pages
serves over **HTTPS**, which is exactly what the browser requires for camera
access.

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
3. Hit **Save Gesture**. You can capture more takes for the same word to
   cover natural variation in how you perform it — just capture again and
   save again. (A word is locked to however many hands it was first trained
   with — you can't mix a 1-hand and a 2-hand version under the same word.)
4. Head back to the **Live Page** — making one of your trained signs will pop
   up its emoji and word, with a short chime to confirm it was recognized.
   Everything is saved in your browser (`localStorage`), so it's still there
   next time you open the site.
5. Made a mistake, or want to retrain a sign? Hit the ✏️ next to any saved
   gesture — it pre-fills the word/emoji so you can rename it on the spot, or
   hit **Capture Pose** again to add another take to it, all without losing
   the sign's existing training data.

## How the recognition works

There's no ML training step. Up to two hands are tracked at once (via
MediaPipe's handedness classification, so a sign that uses a specific left
and right hand shape stays consistent regardless of where each hand is on
screen). Each capture records an ordered *sequence* of frames rather than
independent poses, so a sign is recognized by its motion through space *and*
its handshape — not just handshape alone, which is what makes two
similar-looking signs with different movements distinguishable. A still
pose still works fine too — it's simply a take with little to no motion, no
special-casing needed.

Each frame combines a position/scale-invariant handshape vector with a
motion vector (each hand's path relative to where it started that take).
Live matching compares the last couple of seconds of tracked motion against
every stored take using Dynamic Time Warping (DTW), which elastically
aligns in time so the same sign performed a bit faster or slower still
matches. Fingertip landmarks — the least reliable points MediaPipe reports,
especially once one hand blocks the other in a two-hand sign — count for
less in that comparison, so occlusion noise can't tank an otherwise-correct
match. All of this runs fast enough to re-check several times a second,
fully offline and instantly re-usable across sessions.

## Future updates / ideas

- Instead of the chime, have it say the word out loud when a sign is
  recognized — with a choice of voice.

---

Created by: Falyssa, with love.
