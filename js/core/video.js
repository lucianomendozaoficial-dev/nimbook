/* ==========================================================================
   video.js — lectura y compresión de videos a 720p vertical
   Las historias y Reels usan 720 × 1280, recortando el centro del video.
   ========================================================================== */

const MAX_BYTES = 220 * 1024 * 1024;

export async function probeVideo(file) {
  if (!file) throw new Error('Elegí un video.');
  if (!/^video\//i.test(file.type || '')) throw new Error('El archivo no es un video.');
  if (file.size > MAX_BYTES) throw new Error('El video es demasiado grande (máximo 220 MB).');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('No se pudo leer el video.'));
    });
    return {
      url,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function supportedMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function drawCover(ctx, video, canvas) {
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const target = canvas.width / canvas.height;
  const source = vw / vh;
  let sx = 0; let sy = 0; let sw = vw; let sh = vh;
  if (source > target) {
    sw = vh * target;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / target;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

/**
 * Comprime a 720 × 1280 (vertical) y devuelve un WebM/MP4 + poster.
 * La compresión se hace en tiempo real (dura lo que el video).
 */
export async function compressVideo(file, { maxDuration = 60, onProgress = null, signal = null } = {}) {
  const info = await probeVideo(file);
  if (info.duration > maxDuration + 0.6) {
    URL.revokeObjectURL(info.url);
    throw new Error(`El video dura ${Math.ceil(info.duration)} s; el máximo es ${maxDuration} s.`);
  }
  const mime = supportedMime();
  if (!mime) {
    URL.revokeObjectURL(info.url);
    throw new Error('Este navegador no puede comprimir videos.');
  }

  const video = document.createElement('video');
  video.src = info.url;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve;
    video.onerror = () => reject(new Error('No se pudo preparar el video.'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d', { alpha: false });
  drawCover(ctx, video, canvas);
  const posterBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  video.currentTime = 0;
  const stream = canvas.captureStream(30);
  let audioCtx = null;
  try {
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    await audioCtx.resume().catch(() => {});
  } catch { /* video sin audio */ }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_400_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };

  let stopped = false;
  let raf = 0;
  let recordedAt = 0;
  let recordStart = 0;

  const draw = () => {
    if (stopped) return;
    drawCover(ctx, video, canvas);
    onProgress?.(Math.min(99, Math.round((video.currentTime / Math.max(0.1, info.duration || 1)) * 100)));
    raf = requestAnimationFrame(draw);
  };

  const result = new Promise((resolve, reject) => {
    recorder.onerror = () => reject(new Error('No se pudo comprimir el video.'));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime.includes('mp4') ? 'video/mp4' : 'video/webm' });
      if (!blob.size) { reject(new Error('El video comprimido quedó vacío.')); return; }
      const measured = recordedAt || ((performance.now() - recordStart) / 1000);
      resolve({
        blob,
        poster: posterBlob,
        duration: Math.min(maxDuration, Math.max(0.5, info.duration || measured || maxDuration)),
        width: canvas.width,
        height: canvas.height,
        mimeType: blob.type,
      });
    };
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    recordedAt = Math.max(recordedAt, video.currentTime || 0);
    cancelAnimationFrame(raf);
    video.pause();
    try { recorder.stop(); } catch { /* noop */ }
    stream.getTracks().forEach((track) => track.stop());
    audioCtx?.close?.().catch?.(() => {});
  };
  signal?.addEventListener('abort', stop, { once: true });

  try {
    recordStart = performance.now();
    recorder.start(500);
    await video.play();
    draw();
    const limit = () => {
      const known = info.duration > 0;
      if (video.ended || (known && video.currentTime >= Math.min(maxDuration, info.duration))) {
        video.removeEventListener('timeupdate', limit);
        stop();
      }
    };
    video.addEventListener('timeupdate', limit);
    video.addEventListener('ended', stop, { once: true });
    const knownLimit = info.duration > 0 ? Math.min(maxDuration, info.duration) : maxDuration;
    const safety = setTimeout(stop, knownLimit * 1000 + 1800);
    const output = await result;
    clearTimeout(safety);
    return { ...output, poster: posterBlob };
  } catch (err) {
    stop();
    throw err;
  } finally {
    URL.revokeObjectURL(info.url);
  }
}
