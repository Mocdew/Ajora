// Deterministic 1080 × 1350, 30 fps silent MP4. Uses the repo's Playwright.
// FFMPEG_PATH=/path/to/ffmpeg node render.mjs [--preview]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from '../../../web/node_modules/playwright-core/index.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes('--preview');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--force-color-profile=srgb', '--allow-file-access-from-files'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => { throw error; });
  await page.goto(pathToFileURL(path.join(dir, 'motion.html')).href + '?render');
  await page.evaluate(() => window.videoReady);
  const getFrame = async (time) => {
    const data = await page.evaluate((seconds) => {
      window.renderAt(seconds);
      return document.getElementById('stage').toDataURL('image/png').split(',')[1];
    }, time);
    return Buffer.from(data, 'base64');
  };
  if (preview) {
    await fs.mkdir(path.join(dir, 'qa'), { recursive: true });
    for (const time of [0, 2, 4.7, 6.5, 9.7, 11.5, 14.7, 16.5, 19.7, 21.5, 24.7, 27.5, 29.9666667]) {
      await fs.writeFile(path.join(dir, 'qa', `${String(time).replace('.', '-')}.png`), await getFrame(time));
    }
    console.log('Preview frames saved to qa/');
  } else {
    const out = path.join(dir, 'ajora-30s-motion.mp4');
    const encoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'warning',
      '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', 'pipe:0',
      '-an', '-frames:v', '900', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-color_range', 'tv',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => {
      encoder.once('error', reject);
      encoder.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`)));
      encoder.stdin.on('error', reject);
    });
    // Attach the rejection handler immediately while the encoder runs.
    done.catch(() => {});
    for (let frame = 0; frame < 900; frame++) {
      if (!encoder.stdin.write(await getFrame(frame / 30))) await once(encoder.stdin, 'drain');
      if (frame % 150 === 0) console.log(`Rendered ${frame}/900 frames`);
    }
    encoder.stdin.end();
    await done;
    await fs.writeFile(path.join(dir, 'ajora-cover.png'), await getFrame(27.5));
    console.log(`Created ${out}`);
  }
} finally {
  await browser.close();
}
