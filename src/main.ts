// ============================================
// YT-M3U-PLAYLIST
// DENO PLAYLIST GENERATOR
// ============================================

const PLAYLIST_URL = Deno.env.get("YT_PLAYLIST_URL");

const OUTPUT_FILE = "YT-M3U-PLAYLIST.m3u";

const GROUP_TITLE = "YT M3U PLAYLIST";

const MAX_RETRIES = 3;

// =====================================
// LOGO CONFIGURATION
// =====================================

const LOGO_URL =
  "https://raw.githubusercontent.com/Mrbotrx/Mrbotrx/refs/heads/main/IPTV_LINKS_LOGO.jpg";

const LOGO_FILE = "logo.jpg";

const LOGO_POSITION = "4:4";

const LOGO_SIZE = 35;

// =====================================
// LOGGER
// =====================================

function log(message: string) {
  console.log(`[YT-M3U] ${new Date().toISOString()} ${message}`);
}

// =====================================
// PLAYLIST FETCH
// =====================================

async function fetchPlaylist() {
  if (!PLAYLIST_URL) {
    throw new Error("YT_PLAYLIST_URL secret missing");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Fetching playlist: ${attempt}/${MAX_RETRIES}`);

      const process = new Deno.Command("yt-dlp", {
        args: [
          "--flat-playlist",
          "--dump-single-json",
          "--ignore-errors",
          "--no-warnings",
          PLAYLIST_URL,
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const result = await process.output();

      if (!result.success) {
        throw new Error(
          new TextDecoder().decode(result.stderr),
        );
      }

      const output = new TextDecoder().decode(result.stdout);

      const data = JSON.parse(output);

      const entries = data.entries ?? [];

      if (entries.length === 0) {
        throw new Error("No videos found");
      }

      log(`Videos fetched: ${entries.length}`);

      return entries;
    } catch (error) {
      log(`Error: ${error}`);

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error("Playlist fetch failed");
}

// =====================================
// CLEAN TEXT
// =====================================

function cleanText(value: string): string {
  return value
    .replace(/[\r\n\t"]/g, " ")
    .trim();
}

// =====================================
// GENERATE M3U
// =====================================

function generateM3U(entries: any[]) {
  const lines = ["#EXTM3U"];

  const seen = new Set<string>();

  let total = 0;

  for (const video of entries) {
    const id = video.id;

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);

    const title = cleanText(video.title || "YouTube Video");

    const thumbnail =
      video.thumbnails?.at(-1)?.url ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const videoURL = `https://www.youtube.com/watch?v=${id}`;

    lines.push(
      `#EXTINF:-1 tvg-name="${title}" tvg-logo="${thumbnail}" group-title="${GROUP_TITLE}",${title}`,
    );

    lines.push(videoURL);

    total++;
  }

  if (total === 0) {
    throw new Error("No valid entries");
  }

  Deno.writeTextFileSync(
    OUTPUT_FILE,
    lines.join("\n") + "\n",
  );

  log(`M3U generated: ${total} videos`);
}

// =====================================
// DOWNLOAD LOGO
// =====================================

async function downloadLogo() {
  const response = await fetch(LOGO_URL);

  if (!response.ok) {
    throw new Error("Logo download failed");
  }

  const image = new Uint8Array(
    await response.arrayBuffer(),
  );

  Deno.writeFileSync(LOGO_FILE, image);

  log("Logo downloaded");
}

// =====================================
// MAIN
// =====================================

async function main() {
  log("YT-M3U-PLAYLIST STARTED");

  const entries = await fetchPlaylist();

  generateM3U(entries);

  await downloadLogo();

  log("YT-M3U-PLAYLIST COMPLETED");
}

await main();
