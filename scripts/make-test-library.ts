// Writes a device test library of sine-tone MP3s for the Plan 4 checklist:
// ~300 tagged tracks across 30 artists and 40 albums, with accented and
// NFD-decomposed names, CBR 128/320, VBR with and without a Xing header, a
// mono 22.05 kHz file, ID3 v2.3 / v2.4 / v1-only tags, JPEG and PNG covers
// (one too large to decode, two at the 1500 px limit: a progressive 4:4:4 JPEG
// and an RGBA PNG, the decoder's largest allocations), a 65-minute track and a
// file of random bytes.
//
//   bun scripts/make-test-library.ts [outdir]     (default dist/test-music)
//
// Needs ffmpeg, lame and ImageMagick (magick) on PATH. Copy the folder's contents to sdmc:/music/.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { prepareLibraryDir } from "./test-library-dir.ts";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist/test-music");
const work = join(out, ".work");
prepareLibraryDir(out);
mkdirSync(work, { recursive: true });

for (const tool of ["ffmpeg", "lame", "magick"]) if (!Bun.which(tool)) throw new Error(`make-test-library: ${tool} is not on PATH`);

async function run(cmd: string[]): Promise<void> {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd[0]} failed: ${await new Response(proc.stderr).text()}`);
}

/** Runs jobs with bounded concurrency. */
async function pool(jobs: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(2, availableParallelism()) }, async () => {
    while (next < jobs.length) await jobs[next++]!();
  });
  await Promise.all(lanes);
}

// Covers: square JPEG, square PNG, a wide JPEG (centre-cropped on device), and one over the 1500 px limit.
const covers = {
  jpeg: join(work, "cover-500.jpg"),
  png: join(work, "cover-300.png"),
  wide: join(work, "cover-640x400.jpg"),
  huge: join(work, "cover-1600.jpg"),
  bigProgressive: join(work, "cover-1500-progressive.jpg"),
  bigPng: join(work, "cover-1500-rgba.png"),
};
await pool([
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=500x500:rate=1", "-frames:v", "1", covers.jpeg]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=300x300:rate=1", "-frames:v", "1", covers.png]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "smptehdbars=size=640x400:rate=1", "-frames:v", "1", covers.wide]),
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=1600x1600:rate=1", "-frames:v", "1", covers.huge]),
  async () => {
    const baseline = join(work, "cover-1500-baseline.jpg");
    await run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "mandelbrot=size=1500x1500:rate=1", "-frames:v", "1", "-pix_fmt", "yuvj444p", baseline]);
    await run(["magick", baseline, "-interlace", "JPEG", "-sampling-factor", "1x1", covers.bigProgressive]);
  },
  () => run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1500x1500:rate=1", "-frames:v", "1", "-pix_fmt", "rgba", covers.bigPng]),
]);

const ARTISTS = [
  "Aurora Lín", "Björn & the Fjords", "Les Étoiles", "Mötorcycle Club", "Zoë Hart", "Café Society", "Niño Bravo",
  "The Ångström Units", "Señorita Luz", "Rêve Électrique", "Dvořák Tapes", "Øresund Drive", "Ça Va Ensemble",
  "Glass Lantern", "Paper Satellites", "Northern Static", "Velvet Arcade", "Low Tide Choir", "Kite Engine",
  "Marble Bloom", "Echo Parlor", "Silver Fern", "Dune Radio", "Copper Moth", "Saffron Wires", "Atlas Hum",
  "José Peña", "Amélie Roux", "Clément Duval", "Inès Morel",
];
const WORDS = ["Night", "Signal", "Harbor", "Glow", "Static", "Summer", "Atlas", "Velvet", "Echo", "Neon", "Paper", "River",
  "Crystal", "Orbit", "Lantern", "Fever", "Ghost", "Garden", "Mirror", "Satellite", "Café", "Rêverie", "Señal", "Été"];

interface Job { file: string; title: string; artist: string; album: string; track: number; seconds: number;
  kind: "cbr128" | "cbr320" | "vbr" | "vbr-plain" | "mono22"; tag: "v23" | "v24" | "v1"; cover?: keyof typeof covers }

const jobs: Job[] = [];
let n = 0;
for (let a = 0; a < ARTISTS.length; a++) {
  const albums = a < 10 ? 2 : 1; // 40 albums
  for (let b = 0; b < albums; b++) {
    const album = `${WORDS[(a * 3 + b * 7) % WORDS.length]} ${WORDS[(a * 5 + b * 11 + 3) % WORDS.length]}`;
    const tracks = a < 10 ? 6 : 10; // 10×2×6 + 20×10 = 320
    for (let t = 1; t <= tracks; t++) {
      n++;
      const kinds: Job["kind"][] = ["cbr128", "cbr128", "cbr320", "vbr", "vbr-plain"];
      const tags: Job["tag"][] = ["v23", "v23", "v24", "v1"];
      const coverKinds: (keyof typeof covers | undefined)[] = ["jpeg", "png", "wide", undefined, "jpeg", "huge", "bigProgressive", "bigPng"];
      jobs.push({
        file: `${String(n).padStart(3, "0")} ${ARTISTS[a]!.replace(/[&/]/g, "and")} - ${WORDS[(n * 7) % WORDS.length]}.mp3`,
        title: `${WORDS[(n * 7) % WORDS.length]} ${WORDS[(n * 13 + 5) % WORDS.length]}`,
        artist: ARTISTS[a]!,
        album,
        track: t,
        seconds: 20 + ((n * 37) % 70), // 20 s .. 90 s
        kind: kinds[n % kinds.length]!,
        tag: tags[n % tags.length]!,
        cover: coverKinds[b % 2 === 0 ? a % coverKinds.length : (a + 3) % coverKinds.length],
      });
    }
  }
}
jobs.push({ file: "Mono Field Recording.mp3", title: "Mono Field Recording", artist: "Atlas Hum", album: "Field Notes", track: 1, seconds: 45, kind: "mono22", tag: "v23" });
jobs.push({ file: "The Long One.mp3", title: "The Long One (65 minutes)", artist: "Low Tide Choir", album: "Endurance", track: 1, seconds: 65 * 60, kind: "cbr128", tag: "v24", cover: "jpeg" });

async function encode(job: Job): Promise<void> {
  const wav = join(work, `${job.file}.wav`);
  const mono = job.kind === "mono22";
  const freq = 220 + (job.track * 55) % 660;
  await run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${job.seconds}:sample_rate=${mono ? 22050 : 44100}`,
    "-af", "volume=0.4", "-ac", mono ? "1" : "2", wav]);
  const target = join(out, job.file);
  const quality = { cbr128: ["-b", "128"], cbr320: ["-b", "320"], vbr: ["-V", "2"], "vbr-plain": ["-V", "2", "-t"], mono22: ["-m", "m", "-b", "64"] }[job.kind];
  if (job.tag === "v24") {
    const raw = join(work, `${job.file}.raw.mp3`);
    await run(["lame", "--quiet", "--noreplaygain", ...quality, wav, raw]);
    const art = job.cover ? ["-i", covers[job.cover], "-map", "0:a", "-map", "1:v", "-metadata:s:v", "comment=Cover (front)"] : [];
    await run(["ffmpeg", "-v", "error", "-y", "-i", raw, ...art, "-c", "copy", "-id3v2_version", "4",
      "-metadata", `title=${job.title}`, "-metadata", `artist=${job.artist}`, "-metadata", `album=${job.album}`, "-metadata", `track=${job.track}`, target]);
  } else {
    const tagFlags = job.tag === "v1" ? ["--id3v1-only"] : ["--id3v2-only"];
    const art = job.cover && job.tag === "v23" ? ["--ti", covers[job.cover]] : [];
    await run(["lame", "--quiet", "--noreplaygain", ...quality, ...tagFlags, "--tt", job.title, "--ta", job.artist, "--tl", job.album,
      "--tn", String(job.track), ...art, wav, target]);
  }
  rmSync(wav, { force: true });
}

const started = Date.now();
await pool(jobs.map((job) => () => encode(job)));
// A file that is not MP3 at all.
writeFileSync(join(out, "Not Really Audio.mp3"), new Uint8Array(200_000).map((_, i) => (i * 2654435761) >>> 24));
rmSync(work, { recursive: true, force: true });
console.log(`make-test-library: ${jobs.length + 1} files in ${out} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
console.log("Copy the folder's contents to sdmc:/music/ on the console's SD card.");
console.log("Azahar (macOS): ~/Library/Application Support/Azahar/sdmc/music/");
