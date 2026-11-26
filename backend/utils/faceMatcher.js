// Compares the face printed on an ID photo with the face in a selfie.
// Runs fully on this server (no cloud service); neither image leaves the machine.
const path = require('path');
const jpeg = require('jpeg-js');

// Euclidean distance between face descriptors: 0 = identical, higher = less alike.
// 0.6 is the library's general default; lower is stricter. Override in backend/.env.
const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD) || 0.55;
const MAX_SIDE = 1600;

const ID_NO_FACE_MSG =
  'No face was found on your ID. Retake the ID photo so the picture on the card is clear.';
const SELFIE_NO_FACE_MSG =
  'No face was found in your selfie. Face the camera in good light and try again.';
const SELFIE_MANY_FACES_MSG =
  'More than one face is in your selfie. Make sure only your face is in the frame.';
const MISMATCH_MSG =
  'Your face does not match the photo on the ID. Retake your selfie in good light, or use your own ID.';
const UNAVAILABLE_MSG =
  'Face check is not available. Restart the RapidRescue backend and try again.';

let enginePromise = null;
let queue = Promise.resolve();

/** Load TensorFlow (WASM) and the face models once per server process. */
function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const tf = require('@tensorflow/tfjs');
      const wasm = require('@tensorflow/tfjs-backend-wasm');
      const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
      const wasmDir = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm'));
      wasm.setWasmPaths(wasmDir + path.sep);
      await tf.setBackend('wasm');
      await tf.ready();

      const modelDir = path.join(
        path.dirname(require.resolve('@vladmandic/face-api/package.json')),
        'model'
      );
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
      return { tf, faceapi };
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

function warmUp() {
  return loadEngine().catch((err) => console.warn('[face] engine not loaded:', err.message));
}

/** base64 / data URL JPEG → RGB pixels, shrunk if very large */
function decodeImage(image) {
  const base64 = String(image || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  const { width, height, data } = jpeg.decode(Buffer.from(base64, 'base64'), {
    useTArray: true,
    maxMemoryUsageInMB: 256,
  });
  const step = Math.max(1, Math.ceil(Math.max(width, height) / MAX_SIDE));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const rgb = new Int32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * step * width + x * step) * 4;
      const dst = (y * w + x) * 3;
      rgb[dst] = data[src];
      rgb[dst + 1] = data[src + 1];
      rgb[dst + 2] = data[src + 2];
    }
  }
  return { rgb, width: w, height: h };
}

async function findFaces({ tf, faceapi }, picture, minConfidence) {
  const tensor = tf.tensor3d(picture.rgb, [picture.height, picture.width, 3], 'int32');
  try {
    return await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();
  } finally {
    tensor.dispose();
  }
}

/** Rotate 90° clockwise */
function rotate({ rgb, width, height }) {
  const out = new Int32Array(rgb.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = (x * height + (height - 1 - y)) * 3;
      out[dst] = rgb[src];
      out[dst + 1] = rgb[src + 1];
      out[dst + 2] = rgb[src + 2];
    }
  }
  return { rgb: out, width: height, height: width };
}

/** People often shoot the card sideways, so try the other orientations before giving up */
async function findIdFaces(engine, picture) {
  let current = picture;
  for (let turn = 0; turn < 4; turn++) {
    if (turn) current = rotate(current);
    // Faces printed on ID cards are small and faded, so accept weaker detections there
    const faces = await findFaces(engine, current, 0.3);
    if (faces.length) return faces;
  }
  return [];
}

const area = (face) => face.detection.box.width * face.detection.box.height;
const largestFirst = (faces) => [...faces].sort((a, b) => area(b) - area(a));

function result(match, reason, message, distance = null) {
  return { match, reason, message, distance };
}

async function runComparison(idImage, selfieImage) {
  let engine;
  try {
    engine = await loadEngine();
  } catch (err) {
    console.warn('[face] engine not loaded:', err.message);
    return result(false, 'unavailable', UNAVAILABLE_MSG);
  }

  try {
    // Cards often carry a second "ghost" portrait — the largest face is the main one
    const idFaces = largestFirst(await findIdFaces(engine, decodeImage(idImage)));
    if (!idFaces.length) return result(false, 'id_no_face', ID_NO_FACE_MSG);

    const selfieFaces = largestFirst(await findFaces(engine, decodeImage(selfieImage), 0.5));
    if (!selfieFaces.length) return result(false, 'selfie_no_face', SELFIE_NO_FACE_MSG);
    // Small faces far in the background are ignored; a second prominent face is rejected
    if (selfieFaces.length > 1 && area(selfieFaces[1]) > area(selfieFaces[0]) * 0.35) {
      return result(false, 'selfie_many_faces', SELFIE_MANY_FACES_MSG);
    }

    const distance = engine.faceapi.euclideanDistance(
      idFaces[0].descriptor,
      selfieFaces[0].descriptor
    );
    const rounded = Math.round(distance * 1000) / 1000;
    if (distance > MATCH_THRESHOLD) return result(false, 'mismatch', MISMATCH_MSG, rounded);
    return result(true, 'match', 'Your face matches the photo on your ID.', rounded);
  } catch (err) {
    console.warn('[face] comparison failed:', err.message);
    return result(false, 'error', 'Could not check your face. Please retake both photos.');
  }
}

/**
 * Returns { match, reason, message, distance }. Never throws.
 * Comparisons run one at a time so parallel sign-ups cannot exhaust memory.
 */
function compareFaces(idImage, selfieImage) {
  const job = queue.then(() => runComparison(idImage, selfieImage));
  queue = job.catch(() => {});
  return job;
}

module.exports = { compareFaces, warmUp, MATCH_THRESHOLD };
