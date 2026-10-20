import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import heicConvert from "heic-convert";
import sharp from "sharp";

// ffmpeg-static is CommonJS exporting the binary's path; its typings don't match that under NodeNext.
const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as string | null;

// Turns what people send over iMessage into something Claude can read:
// photos become small JPEGs, voice memos become text via Deepgram.

/** Claude's recommended max edge; bigger images cost more and don't read better. */
const MAX_EDGE = 1568;

/** Any photo (including iPhone HEIC) -> base64 JPEG, at most 1568px on the long edge. */
export async function prepareImage(data: Buffer, mimeType: string): Promise<string> {
  let input = data;
  if (/hei[cf]/i.test(mimeType)) {
    input = Buffer.from(await heicConvert({ buffer: data, format: "JPEG", quality: 0.9 }));
  }
  const jpeg = await sharp(input, { animated: false })
    .rotate() // honor EXIF orientation from phone cameras
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return jpeg.toString("base64");
}

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

/**
 * Converts any audio (iMessage sends .caf) to 16kHz mono Ogg/Opus. The input
 * goes through a temp file because ffmpeg can't read CAF from a pipe (it
 * needs to seek); the output streams back in memory.
 */
async function toOggOpus(data: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available on this platform");
  const dir = await mkdtemp(join(tmpdir(), "bardie-voice-"));
  try {
    const input = join(dir, "in");
    await writeFile(input, data);
    return await runFfmpeg(ffmpegPath, input);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(binary: string, input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, [
      "-hide_banner", "-loglevel", "error",
      "-i", input,
      "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k",
      "-f", "ogg", "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err)}`)),
    );
  });
}

/** Voice memo -> text via Deepgram. Returns "" if nothing was said. */
export async function transcribe(data: Buffer): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
  const audio = await toOggOpus(data);
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "audio/ogg" },
    body: new Uint8Array(audio),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Deepgram failed (${res.status}): ${body}`);
  const json = JSON.parse(body) as {
    results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
  };
  return json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
}
