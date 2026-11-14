// Turns recorded screencast frames into a constant-30fps H.264 MP4.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";

const dir = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const vf = process.argv[4] ?? "scale=1920:1080:flags=lanczos,format=yuv420p";
const { frames, endTs } = JSON.parse(fs.readFileSync(path.join(dir, "frames.json")));
let list = "";
frames.forEach((f, i) => {
  const next = i + 1 < frames.length ? frames[i + 1].ts : endTs;
  list += `file '${f.file}'\nduration ${Math.max(0.001, next - f.ts).toFixed(4)}\n`;
});
list += `file '${frames.at(-1).file}'\n`;
fs.writeFileSync(path.join(dir, "list.txt"), list);
execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
  "-vf", `${vf}`, "-r", "30", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
