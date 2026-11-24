import { zip } from 'fflate';

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Photos come from the API server (another port), where <a download> is ignored,
// so the file is fetched first and then saved.
async function fetchPhoto(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download the photo.');
  return res.blob();
}

export async function downloadPhoto({ url, fileName }) {
  saveBlob(await fetchPhoto(url), fileName);
}

/** Saves the photos as one ZIP file. Returns how many could not be downloaded. */
export async function downloadPhotosZip(photos, zipName) {
  const entries = {};
  let failed = 0;

  // One at a time, so a long list does not flood the server.
  for (const { url, fileName } of photos) {
    try {
      const blob = await fetchPhoto(url);
      entries[fileName] = new Uint8Array(await blob.arrayBuffer());
    } catch {
      failed += 1;
    }
  }

  if (failed === photos.length) throw new Error('Could not download the photos.');

  // level 0: JPG/PNG are already compressed, so just pack them.
  const data = await new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (err, result) => (err ? reject(err) : resolve(result)));
  });
  saveBlob(new Blob([data], { type: 'application/zip' }), zipName);
  return failed;
}
