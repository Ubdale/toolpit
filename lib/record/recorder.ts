'use client';

/** Codec preferences, best first. Chrome and Firefox both land on one of these. */
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    pickMimeType() !== ''
  );
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Merges the tab/system audio the visitor shared with their microphone.
 *
 * MediaRecorder takes exactly one audio track, so anything beyond a single
 * source has to be summed through a WebAudio graph first. Returns null when
 * there is no audio at all, so the caller can record video only.
 */
export function mixAudio(sources: MediaStream[]): {
  track: MediaStreamTrack;
  context: AudioContext;
} | null {
  const withAudio = sources.filter((stream) => stream.getAudioTracks().length > 0);
  if (withAudio.length === 0) return null;

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();

  for (const stream of withAudio) {
    const input = new MediaStream(stream.getAudioTracks());
    context.createMediaStreamSource(input).connect(destination);
  }

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    void context.close();
    return null;
  }

  return { track, context };
}

export type Stroke = {
  color: string;
  width: number;
  /** Points in composite-canvas coordinates. */
  points: { x: number; y: number }[];
};

/** Replays the annotation strokes onto the composite canvas each frame. */
export function paintStrokes(
  context: CanvasRenderingContext2D,
  strokes: Stroke[],
): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const stroke of strokes) {
    const [first, ...rest] = stroke.points;
    if (!first) continue;

    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.beginPath();
    context.moveTo(first.x, first.y);

    if (rest.length === 0) {
      // A single tap still deserves a visible dot.
      context.lineTo(first.x + 0.1, first.y);
    } else {
      for (const point of rest) context.lineTo(point.x, point.y);
    }

    context.stroke();
  }
}

function once(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve) => target.addEventListener(event, () => resolve(), { once: true }));
}

/**
 * Trims a recording to [start, end] by replaying that span into a fresh
 * MediaRecorder.
 *
 * WebM has no seekable index that would let us cut the container directly, and
 * shipping ffmpeg.wasm to move two handles would cost the visitor a 25MB
 * download. The trade-off is that this runs in real time — a 30 second span
 * takes 30 seconds — so the UI reports progress and always offers the untrimmed
 * clip as well.
 */
export async function trimRecording(
  blob: Blob,
  start: number,
  end: number,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const mimeType = pickMimeType();
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;

  try {
    await once(video, 'loadedmetadata');
    video.currentTime = start;
    await once(video, 'seeked');

    const stream = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream?.();
    if (!stream) throw new Error('This browser cannot re-encode the clip for trimming.');

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const finished = new Promise<Blob>((resolve) => {
      recorder.addEventListener('stop', () =>
        resolve(new Blob(chunks, { type: mimeType || 'video/webm' })),
      );
    });

    const span = Math.max(0.1, end - start);
    const watch = () => {
      onProgress?.(Math.min(1, (video.currentTime - start) / span));
      if (video.currentTime >= end) {
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      requestAnimationFrame(watch);
    };

    recorder.start();
    await video.play();
    watch();

    video.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') recorder.stop();
    });

    return await finished;
  } finally {
    URL.revokeObjectURL(url);
  }
}
