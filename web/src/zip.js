// Builds a zip of press pack files here in the browser (the free server plan can't do it),
// adding each file as it downloads so big videos don't all sit in memory twice.
export async function zipFiles(files, onProgress) {
  const { Zip, ZipPassThrough } = await import('fflate');
  const chunks = [];
  const total = files.reduce((a, f) => a + (f.size || 0), 0) || 1;
  let loaded = 0;
  const finished = new Promise((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      chunks.push(chunk);
      if (final) resolve(new Blob(chunks, { type: 'application/zip' }));
    });
    (async () => {
      for (const f of files) {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`Couldn't download ${f.name}`);
        const entry = new ZipPassThrough(f.name); // stored as-is: photos and videos are already compressed
        zip.add(entry);
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          entry.push(value);
          loaded += value.length;
          onProgress?.(Math.min(1, loaded / total));
        }
        entry.push(new Uint8Array(0), true);
      }
      zip.end();
    })().catch(reject);
  });
  return finished;
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
