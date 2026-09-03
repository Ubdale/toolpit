'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Slider } from '@/components/ui/Slider';
import { downloadBlob } from '@/lib/download';
import { formatBytes } from '@/lib/format';
import {
  formatClock,
  isRecordingSupported,
  mixAudio,
  paintStrokes,
  pickMimeType,
  stopStream,
  trimRecording,
  type Stroke,
} from '@/lib/record/recorder';

type Phase = 'idle' | 'recording' | 'review';

const PEN_COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff'];

export default function ScreenRecorderTool() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [withMic, setWithMic] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const [penColor, setPenColor] = useState(PEN_COLORS[0]!);
  const [penWidth, setPenWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  const [recording, setRecording] = useState<{ blob: Blob; url: string; duration: number } | null>(
    null,
  );
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [trimProgress, setTrimProgress] = useState<number | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reviewRef = useRef<HTMLVideoElement>(null);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const frameRef = useRef<number | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  useEffect(() => setSupported(isRecordingSupported()), []);

  const teardown = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    stopStream(displayStreamRef.current);
    stopStream(micStreamRef.current);
    displayStreamRef.current = null;
    micStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    videoRef.current?.remove();
    videoRef.current = null;
  }, []);

  // Releasing the capture on unmount matters more here than anywhere else on
  // Toolpit: a leaked display track leaves the browser's "sharing" indicator up.
  const recordingUrlRef = useRef<string | null>(null);
  recordingUrlRef.current = recording?.url ?? null;
  useEffect(
    () => () => {
      teardown();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    },
    [teardown],
  );

  async function start() {
    setError(null);
    setStrokes([]);

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
    } catch (cause) {
      // A cancelled picker is a normal outcome, not a failure worth shouting at.
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') return;
      setError('Could not start screen capture. Your browser may not allow it here.');
      return;
    }

    displayStreamRef.current = display;

    if (withMic) {
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError('Recording without the microphone — permission was refused.');
      }
    }

    const track = display.getVideoTracks()[0];
    const settings = track?.getSettings() ?? {};
    const width = Math.round(settings.width ?? 1280);
    const height = Math.round(settings.height ?? 720);

    const video = document.createElement('video');
    video.srcObject = display;
    video.muted = true;
    await video.play();
    videoRef.current = video;

    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('This browser could not open a 2D canvas.');
      teardown();
      return;
    }

    // The recorded stream is the composite canvas, not the raw display track,
    // so annotations are burned into the video rather than living only in the
    // preview.
    const draw = () => {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      paintStrokes(context, strokesRef.current);
      frameRef.current = requestAnimationFrame(draw);
    };
    draw();

    const composite = canvas.captureStream(30);
    const audio = mixAudio([display, ...(micStreamRef.current ? [micStreamRef.current] : [])]);
    if (audio) {
      composite.addTrack(audio.track);
      audioContextRef.current = audio.context;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(composite, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    const startedAt = Date.now();

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      const duration = (Date.now() - startedAt) / 1000;
      setRecording({ blob, url: URL.createObjectURL(blob), duration });
      setRange({ start: 0, end: duration });
      setPhase('review');
      teardown();
    });

    // Stopping the share from the browser's own bar has to end the recording
    // too, or the visitor is left staring at a frozen frame.
    track?.addEventListener('ended', () => {
      if (recorder.state !== 'inactive') recorder.stop();
    });

    recorderRef.current = recorder;
    recorder.start(1000);
    setElapsed(0);
    setPhase('recording');
  }

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function discard() {
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setStrokes([]);
    setPhase('idle');
    setError(null);
    setTrimProgress(null);
  }

  async function applyTrim() {
    if (!recording) return;
    setError(null);
    setTrimProgress(0);
    try {
      const trimmed = await trimRecording(
        recording.blob,
        range.start,
        range.end,
        setTrimProgress,
      );
      URL.revokeObjectURL(recording.url);
      const duration = range.end - range.start;
      setRecording({ blob: trimmed, url: URL.createObjectURL(trimmed), duration });
      setRange({ start: 0, end: duration });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trim the clip.');
    } finally {
      setTrimProgress(null);
    }
  }

  // --- annotation input ----------------------------------------------------

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = previewRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function beginStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (phase !== 'recording') return;
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStrokes((current) => [
      ...current,
      // Scale the pen with the capture so a 4px nib looks the same on a 4K
      // screen as on a laptop.
      { color: penColor, width: penWidth * ((previewRef.current?.width ?? 1280) / 1280), points: [point] },
    ]);
  }

  function extendStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (phase !== 'recording' || event.buttons === 0) return;
    const point = canvasPoint(event);
    if (!point) return;
    setStrokes((current) => {
      const last = current[current.length - 1];
      if (!last) return current;
      return [...current.slice(0, -1), { ...last, points: [...last.points, point] }];
    });
  }

  if (supported === false) {
    return (
      <ToolSurface>
        <ToolSectionHeading>This browser can&rsquo;t record the screen</ToolSectionHeading>
        <p className="mt-2 text-muted">
          Screen recording needs the <code className="font-mono text-sm">getDisplayMedia</code> API,
          which desktop Chrome, Edge and Firefox all support. It is unavailable on iOS Safari and
          in most in-app browsers. Nothing is uploaded either way — the recording is built on your
          device.
        </p>
      </ToolSurface>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {phase === 'idle' ? (
          <>
            <div>
              <ToolSectionHeading>Ready when you are</ToolSectionHeading>
              <p className="mt-2 text-sm text-muted">
                Your browser will ask which screen, window or tab to share. Annotations you draw
                while recording are burned into the video.
              </p>
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={withMic}
                onChange={(event) => setWithMic(event.target.checked)}
                className="size-4 accent-accent"
              />
              Record my microphone as well
            </label>

            <Button size="lg" onClick={start} className="w-fit">
              Choose a screen and record
            </Button>
          </>
        ) : null}

        {phase === 'recording' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-display text-heading">
                <span
                  aria-hidden="true"
                  className="size-3 animate-pulse rounded-full bg-danger"
                />
                Recording {formatClock(elapsed)}
              </p>
              <Button onClick={stop}>Stop recording</Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-sunken p-3">
              <fieldset className="flex items-center gap-2">
                <legend className="sr-only">Pen colour</legend>
                {PEN_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Pen colour ${color}`}
                    aria-pressed={penColor === color}
                    onClick={() => setPenColor(color)}
                    style={{ background: color }}
                    className={`size-7 rounded-full border-2 transition-transform ${
                      penColor === color ? 'scale-110 border-text' : 'border-line'
                    }`}
                  />
                ))}
              </fieldset>

              <label className="flex items-center gap-2 text-sm">
                Size
                <Slider
                  value={penWidth}
                  min={2}
                  max={16}
                  step={1}
                  valueLabel="none"
                  onInput={(next) => setPenWidth(next as number)}
                  onChange={(next) => setPenWidth(next as number)}
                />
              </label>

              <Button size="sm" variant="secondary" onClick={() => setStrokes([])}>
                Clear drawing
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStrokes((current) => current.slice(0, -1))}
                disabled={strokes.length === 0}
              >
                Undo
              </Button>
            </div>
          </>
        ) : null}

        <ErrorMessage>{error}</ErrorMessage>

        <canvas
          ref={previewRef}
          onPointerDown={beginStroke}
          onPointerMove={extendStroke}
          className={`w-full rounded-xl border border-line bg-black ${
            phase === 'recording' ? 'cursor-crosshair' : 'hidden'
          }`}
          aria-label="Live capture preview. Draw on it to annotate the recording."
        />
      </ToolSurface>

      {phase === 'review' && recording ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">screen-recording.webm</p>
              <p className="text-sm text-muted">
                {formatBytes(recording.blob.size)} · {formatClock(recording.duration)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => downloadBlob(recording.blob, 'screen-recording.webm')}>
                Download
              </Button>
              <Button variant="secondary" onClick={discard}>
                Record another
              </Button>
            </div>
          </div>

          <video
            ref={reviewRef}
            src={recording.url}
            controls
            className="mt-5 w-full rounded-xl border border-line bg-black"
          />

          <div className="mt-5 flex flex-col gap-3">
            <ToolSectionHeading>Trim</ToolSectionHeading>
            {/* One dual-handle slider rather than two independent ones: the
                two values describe a single span, and a range control makes the
                clip you are keeping visible as the filled section between them. */}
            <Slider
              label="Keep from / to"
              value={[range.start, range.end]}
              min={0}
              max={Math.max(0.1, recording.duration)}
              step={0.1}
              precision={1}
              format={formatClock}
              onInput={(value) => {
                const [start, end] = value as [number, number];
                // Never let the handles cross or meet — a zero-length clip
                // cannot be encoded.
                if (end - start < 0.5) return;
                setRange({ start, end });
                // Seek to whichever handle the visitor actually moved.
                const moved = start !== range.start ? start : end;
                if (reviewRef.current) reviewRef.current.currentTime = moved;
              }}
              onChange={(value) => {
                const [start, end] = value as [number, number];
                if (end - start >= 0.5) setRange({ start, end });
              }}
            />

            {trimProgress !== null ? (
              <ProgressBar value={trimProgress} label="Re-encoding the trimmed clip…" />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={applyTrim}
                  disabled={range.start === 0 && range.end >= recording.duration}
                >
                  Apply trim ({formatClock(range.end - range.start)})
                </Button>
                <p className="text-xs text-muted">
                  Trimming replays the clip to re-encode it, so it takes about as long as the
                  span you kept. The untrimmed download above stays available.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
