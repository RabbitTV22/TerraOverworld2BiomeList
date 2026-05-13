import {
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";

const THUMB_DIR = "public/thumbs";
const DATA_FILE = "public/data/index.json";
const THUMB_WIDTH = 400;
const CONCURRENCY = 6;

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function getRawBase() {
  if (process.env.GITHUB_REPOSITORY) {
    const ref = process.env.GITHUB_REF_NAME || "main";
    return `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/${ref}`;
  }

  try {
    const remote = execSync("git remote get-url origin", {
      encoding: "utf8",
    }).trim();
    const m = remote.match(/github\.com[/:](.+)\.git$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/main`;
  } catch {}
  return null;
}

function findPNGs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.png$/i.test(e.name))
    .map((e) => join(dir, e.name))
    .sort();
}

async function generateThumb(srcPath, thumbRel) {
  const thumbPath = join(THUMB_DIR, thumbRel);
  ensureDir(dirname(thumbPath));
  if (
    !existsSync(thumbPath) ||
    statSync(srcPath).mtimeMs > statSync(thumbPath).mtimeMs
  ) {
    await sharp(srcPath)
      .resize(THUMB_WIDTH)
      .webp({ quality: 80 })
      .toFile(thumbPath);
  }
}

async function main() {
  const start = Date.now();
  console.log("Scanning directories...");

  const skip = new Set([".git", "node_modules", "dist", "public"]);
  const topDirs = readdirSync(".", { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name),
    )
    .map((e) => e.name);

  const biomeGroups = []; // { name, images: [{filename, thumb, original}] }
  const specialGroups = [];

  for (const topDir of topDirs) {
    if (topDir === "Biome Images") {
      const subs = readdirSync(topDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      for (const sub of subs) {
        const pngs = findPNGs(join(topDir, sub));
        if (!pngs.length) continue;
        const results = [];
        for (let i = 0; i < pngs.length; i += CONCURRENCY) {
          const batch = pngs.slice(i, i + CONCURRENCY);
          const processed = await Promise.all(
            batch.map(async (png) => {
              const base = basename(png);
              const thumbRel = `${sub}/${base.replace(/\.png$/i, ".webp")}`;
              try {
                await generateThumb(png, thumbRel);
              } catch (err) {
                console.error(`  ERROR: ${png}: ${err.message}`);
              }
              return {
                filename: base,
                thumb: `thumbs/${thumbRel}`,
                original: png,
              };
            }),
          );
          results.push(...processed);
        }
        biomeGroups.push({ name: sub, images: results });
        console.log(`  ${sub}: ${results.length} images`);
      }
    } else {
      const pngs = findPNGs(topDir);
      if (!pngs.length) continue;
      const results = [];
      for (let i = 0; i < pngs.length; i += CONCURRENCY) {
        const batch = pngs.slice(i, i + CONCURRENCY);
        const processed = await Promise.all(
          batch.map(async (png) => {
            const base = basename(png);
            const thumbRel = `_special/${topDir}/${base.replace(/\.png$/i, ".webp")}`;
            try {
              await generateThumb(png, thumbRel);
            } catch (err) {
              console.error(`  ERROR: ${png}: ${err.message}`);
            }
            return {
              filename: base,
              thumb: `thumbs/${thumbRel}`,
              original: png,
            };
          }),
        );
        results.push(...processed);
      }
      specialGroups.push({ name: topDir, images: results });
      console.log(`  [special] ${topDir}: ${results.length} images`);
    }
  }

  const totalImages =
    biomeGroups.reduce((s, g) => s + g.images.length, 0) +
    specialGroups.reduce((s, g) => s + g.images.length, 0);

  console.log(
    `\nDone in ${Date.now() - start}ms — ${biomeGroups.length} biomes, ${specialGroups.length} special groups, ${totalImages} total images`,
  );

  const rawBase = getRawBase();
  if (rawBase) console.log(`Raw base: ${rawBase}`);

  ensureDir(dirname(DATA_FILE));
  writeFileSync(
    DATA_FILE,
    JSON.stringify({ rawBase, biomes: biomeGroups, special: specialGroups }),
  );
  console.log(`Index → ${DATA_FILE}`);

  // .nojekyll for GH Pages
  writeFileSync("public/.nojekyll", "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
