// Thin wrapper around MediaPipe's HandLandmarker (runs fully in-browser via
// WASM, no server) plus webcam setup. Shared by the live page and training page.

import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * Starts the webcam into `videoEl` and begins running hand-landmark
 * detection on every new frame. Calls `onResults(landmarksOrNull)` each
 * time a frame is processed, where landmarksOrNull is either the 21-point
 * array for the first detected hand, or null if no hand is visible.
 *
 * If `canvasEl` is given, the tracked hand skeleton (nodes + connecting
 * lines) is drawn onto it every frame, matched to the video's native size.
 *
 * Returns { stop() } to tear down the camera stream and detection loop.
 */
export async function startHandTracking({ videoEl, canvasEl, onResults, numHands = 1 }) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands,
  });

  const canvasCtx = canvasEl ? canvasEl.getContext('2d') : null;
  const drawingUtils = canvasCtx ? new DrawingUtils(canvasCtx) : null;

  let stopped = false;
  let lastVideoTime = -1;

  function drawSkeleton(landmarks) {
    if (!canvasCtx) return;
    if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
    }
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!landmarks) return;
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: '#EFE561',
      lineWidth: 3,
    });
    drawingUtils.drawLandmarks(landmarks, {
      color: '#FFA948',
      fillColor: '#FFA948',
      lineWidth: 1,
      radius: 4,
    });
  }

  function loop() {
    if (stopped) return;
    if (videoEl.currentTime !== lastVideoTime) {
      lastVideoTime = videoEl.currentTime;
      const results = handLandmarker.detectForVideo(videoEl, performance.now());
      const landmarks = results.landmarks && results.landmarks[0] ? results.landmarks[0] : null;
      drawSkeleton(landmarks);
      onResults(landmarks);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      handLandmarker.close();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
