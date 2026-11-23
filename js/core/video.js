/* ==========================================================================
   video.js — lectura, poster y compresión de videos a 720p vertical
   Las historias usan 720 × 1280 recortando el centro del video.
   La compresión se hace solamente sobre el fragmento elegido (máx. 60 s).
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
    // WebM/VP8 es el formato más estable para grabar en tiempo real en Chrome/Android.
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    // Safari suele ofrecer MP4.
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
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

function waitFor(video, event) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('No se pudo preparar el video.')); };
    const cleanup = () => {
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

async function loadVideo(url) {
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  await waitFor(video, 'loadeddata');
  return video;
}

/** Genera una miniatura JPEG del video en el segundo indicado. */
export async function makeVideoPoster(file, at = 0) {
  const info = await probeVideo(file);
  const video = await loadVideo(info.url);
  try {
    const time = Math.max(0, Math.min(Number(at) || 0, Math.max(0, (info.duration || 0) - 0.1)));
    if (time > 0) {
      video.currentTime = time;
      await waitFor(video, 'seeked');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    drawCover(canvas.getContext('2d', { alpha: false }), video, canvas);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return {
      blob,
      width: info.width,
      height: info.height,
      duration: info.duration,
    };
  } finally {
    URL.revokeObjectURL(info.url);
  }
}

/**
 * Comprime un fragmento a 720 × 1280. `startTime` y `endTime` eligen la parte
 * que se va a mostrar; nunca se codifica más de `maxDuration` segundos.
 * Devuelve { blob, poster, duration, width, height, mimeType, optimized }.
 */
export async function compressVideo(file, {
  maxDuration = 60, startTime = 0, endTime = null, onProgress = null, signal = null,
} = {}) {
  const info = await probeVideo(file);
  const total = info.duration || 0;
  let start = Math.max(0, Number(startTime) || 0);
  if (total > 0) start = Math.min(start, Math.max(0, total - 0.15));
  let end = endTime == null
    ? (total > 0 ? Math.min(total, start + maxDuration) : start + maxDuration)
    : Number(endTime);
  if (!Number.isFinite(end) || end <= start) end = start + (total > 0 ? Math.min(total - start, maxDuration) : maxDuration);
  end = Math.min(end, start + maxDuration);
  if (total > 0) end = Math.min(end, total);
  if (end - start < 0.4) {
    URL.revokeObjectURL(info.url);
    throw new Error('El fragmento es demasiado corto.');
  }

  const video = await loadVideo(info.url);

  async function seek(time) {
    if (Math.abs(video.currentTime - time) < 0.05) return;
    video.currentTime = time;
    await waitFor(video, 'seeked');
  }

  await seek(start);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d', { alpha: false });
  drawCover(ctx, video, canvas);
  const posterBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));

  const whole = start <= 0.08 && (total <= 0 || end >= total - 0.1);
  const shortSide = Math.min(info.width || 0, info.height || 0);
  if (whole && total > 0 && shortSide > 0 && shortSide <= 720
      && /^video\/(mp4|webm)/i.test(file.type || '') && file.size < 70 * 1024 * 1024) {
    URL.revokeObjectURL(info.url);
    return {
      blob: file,
      poster: posterBlob,
      duration: total || 0.5,
      width: info.width,
      height: info.height,
      mimeType: file.type,
      optimized: true,
    };
  }

  const mime = supportedMime();
  if (!mime) {
    URL.revokeObjectURL(info.url);
    throw new Error('Este navegador no puede comprimir videos.');
  }

  // Menos frames por segundo = menos carga de codificación y reproducción estable.
  const stream = canvas.captureStream(24);
  let audioCtx = null;
  let capturedStream = null;
  try {
    const capture = video.captureStream || video.webkitCaptureStream || video.mozCaptureStream;
    if (typeof capture === 'function') {
      capturedStream = capture.call(video);
      const audio = capturedStream.getAudioTracks?.() || [];
      for (const track of audio) stream.addTrack(track);
      // No usamos el video original: solo el canvas recodificado.
      for (const track of capturedStream.getVideoTracks?.() || []) track.stop();
    }
  } catch { capturedStream = null; }
  if (!stream.getAudioTracks().length) {
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaElementSource(video);
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(destination);
      for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
      await audioCtx.resume().catch(() => {});
    } catch { /* video sin audio */ }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 1_500_000,
    audioBitsPerSecond: 96_000,
  });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };

  let stopped = false;
  let raf = 0;
  let recordedAt = 0;
  let recordStart = 0;
  const selected = end - start;
  const draw = () => {
    if (stopped) return;
    drawCover(ctx, video, canvas);
    onProgress?.(Math.min(99, Math.round(((video.currentTime - start) / Math.max(0.1, selected)) * 100)));
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(draw);
    } else {
      raf = requestAnimationFrame(draw);
    }
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
        duration: Math.min(selected, Math.max(0.4, measured || selected)),
        width: canvas.width,
        height: canvas.height,
        mimeType: blob.type,
      });
    };
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    recordedAt = Math.max(0, (video.currentTime || start) - start);
    cancelAnimationFrame(raf);
    video.pause();
    try { recorder.stop(); } catch { /* noop */ }
    stream.getTracks().forEach((track) => track.stop());
    capturedStream?.getTracks?.().forEach((track) => track.stop());
    audioCtx?.close?.().catch?.(() => {});
  };
  signal?.addEventListener('abort', stop, { once: true });

  try {
    video.currentTime = start;
    recordStart = performance.now();
    recorder.start(500);
    await video.play();
    draw();
    const limit = () => {
      if (video.ended || video.currentTime >= end - 0.03) {
        video.removeEventListener('timeupdate', limit);
        stop();
      }
    };
    video.addEventListener('timeupdate', limit);
    video.addEventListener('ended', stop, { once: true });
    const safety = setTimeout(stop, selected * 1000 + 2600);
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
