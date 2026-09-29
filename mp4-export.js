export function mp4MimeType(withAudio) {
  if (!globalThis.MediaRecorder) return null;
  const codecs = withAudio
    ? ['video/mp4;codecs="avc1.42E028,mp4a.40.2"', 'video/mp4;codecs="avc1,mp4a.40.2"']
    : ['video/mp4;codecs="avc1.42E028"', 'video/mp4;codecs="avc1"'];
  return [...codecs, "video/mp4"].find(type => MediaRecorder.isTypeSupported(type)) || null;
}

export async function recordMp4({ canvas, renderFrame, audio, view, duration, onProgress, signal }) {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("MP4 duration must match the calendar playback duration.");
  }
  const mimeType = mp4MimeType(Boolean(audio));
  if (!mimeType || !canvas.captureStream) {
    throw new Error("MP4 recording is unavailable in this browser. Try a current Chrome, Edge or Safari.");
  }
  signal.throwIfAborted();
  const firstEvents = renderFrame(0, 0, false);
  const stream = canvas.captureStream(30);
  try {
    if (audio) {
      for (const track of audio.captureStream().getAudioTracks()) stream.addTrack(track);
    }
    const recorder = new MediaRecorder(stream, {
      mimeType, videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000,
    });
    if (!recorder.mimeType.toLowerCase().startsWith("video/mp4")) {
      throw new Error("This browser did not select an MP4 encoder.");
    }
    return await new Promise((resolve, reject) => {
      const chunks = [];
      let frameRequest, started, finishing = false, failure = null, lastFrame = -1;
      const hold = 3;
      const cleanup = () => {
        cancelAnimationFrame(frameRequest);
        signal.removeEventListener("abort", onAbort);
        document.removeEventListener("visibilitychange", onVisibility);
        audio?.setPlaying(false);
      };
      const stop = error => {
        if (finishing) return;
        finishing = true;
        failure = error;
        cleanup();
        if (recorder.state !== "inactive") recorder.stop();
        else reject(error || new Error("MP4 recording stopped unexpectedly."));
      };
      const onAbort = () => stop(new DOMException("MP4 export cancelled.", "AbortError"));
      const onVisibility = () => {
        if (document.hidden) stop(new Error("MP4 export interrupted. Keep this tab visible while recording and retry."));
      };
      const tick = now => {
        if (finishing) return;
        try {
          const elapsed = (now - started) / 1000;
          const frame = Math.floor(elapsed * 30);
          if (frame !== lastFrame) {
            lastFrame = frame;
            const rendered = renderFrame(Math.min(1, elapsed / duration), Math.min(duration, elapsed), elapsed >= duration);
            audio?.playEvents(rendered.events ?? rendered, view.lon, view.zoom, rendered.timing);
            onProgress(Math.min(99, Math.floor(elapsed / (duration + hold) * 100)));
          }
          if (elapsed >= duration + hold) { stop(); return; }
          frameRequest = requestAnimationFrame(tick);
        } catch (error) { stop(error); }
      };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => stop(new Error("The MP4 encoder failed. Please retry."));
      recorder.onstop = () => {
        cleanup();
        if (failure) { reject(failure); return; }
        if (!finishing) { reject(new Error("MP4 recording ended before completion.")); return; }
        const blob = new Blob(chunks, { type: "video/mp4" });
        if (!blob.size) { reject(new Error("The MP4 encoder produced no video.")); return; }
        onProgress(100);
        resolve(blob);
      };
      recorder.onstart = () => {
        started = performance.now();
        audio?.setPlaying(true);
        audio?.playEvents(firstEvents.events ?? firstEvents, view.lon, view.zoom, firstEvents.timing);
        frameRequest = requestAnimationFrame(tick);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      document.addEventListener("visibilitychange", onVisibility);
      if (signal.aborted || document.hidden) {
        cleanup();
        reject(new Error("Keep the preview visible to start the MP4 export."));
        return;
      }
      try { recorder.start(1000); }
      catch (error) { cleanup(); reject(error); }
    });
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
