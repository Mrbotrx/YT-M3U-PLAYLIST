// ============================================
// YT-M3U-PLAYLIST
// KB PRO TV - SECURE EDITION
// DENO PLAYLIST GENERATOR
// ============================================

const CONFIG = Object.freeze({

  OUTPUT_FILE: "YT-M3U-PLAYLIST.m3u",

  GROUP_TITLE: "YT M3U PLAYLIST",

  MAX_RETRIES: 3,

  RETRY_DELAY: 5000,

  LOGO_URL:
    "https://raw.githubusercontent.com/Mrbotrx/Mrbotrx/refs/heads/main/IPTV_LINKS_LOGO.jpg",

  LOGO_FILE: "logo.jpg",

  LOGO_POSITION: "4:4",

  LOGO_SIZE: 35,

  MAX_LOGO_SIZE: 5 * 1024 * 1024,

});

// ============================================
// SECRET
// ============================================

const PLAYLIST_URL = Deno.env.get("YT_PLAYLIST_URL");

const decoder = new TextDecoder();

// ============================================
// LOGGER
// ============================================

function log(message: string) {

  console.log(
    `[YT-M3U] ${new Date().toISOString()} ${message}`,
  );

}

// ============================================
// VALIDATE PLAYLIST
// ============================================

function validatePlaylistURL(url: string) {

  try {

    const parsed = new URL(url);

    const allowedHosts = [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ];

    if (
      parsed.protocol !== "https:" ||
      !allowedHosts.includes(parsed.hostname) ||
      !parsed.searchParams.has("list")
    ) {

      throw new Error("Invalid playlist URL");

    }

  } catch {

    throw new Error("Playlist URL validation failed");

  }

}

// ============================================
// CLEAN TEXT
// ============================================

function cleanText(value: unknown): string {

  return String(value || "YouTube Video")
    .replace(/[\r\n\t"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

}

// ============================================
// THUMBNAIL VALIDATION
// ============================================

function validateThumbnail(url: string): string {

  try {

    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" ||
      ![
        "i.ytimg.com",
        "img.youtube.com",
      ].includes(parsed.hostname)
    ) {

      return "";

    }

    return parsed.href;

  } catch {

    return "";

  }

}

// ============================================
// FETCH PLAYLIST
// ============================================

async function fetchPlaylist() {

  if (!PLAYLIST_URL) {

    throw new Error(
      "YT_PLAYLIST_URL secret missing. Check GitHub Actions Secrets.",
    );

  }

  validatePlaylistURL(PLAYLIST_URL);

  for (
    let attempt = 1;
    attempt <= CONFIG.MAX_RETRIES;
    attempt++
  ) {

    try {

      log(
        `Fetching playlist ${attempt}/${CONFIG.MAX_RETRIES}`,
      );

      const command = new Deno.Command("yt-dlp", {

        args: [

          "--flat-playlist",

          "--dump-single-json",

          "--ignore-errors",

          "--no-warnings",

          "--socket-timeout",
          "30",

          PLAYLIST_URL,

        ],

        stdout: "piped",

        stderr: "piped",

      });

      const result = await command.output();

      if (!result.success) {

        throw new Error("yt-dlp extraction failed");

      }

      const output = decoder.decode(result.stdout);

      const data = JSON.parse(output);

      if (!Array.isArray(data.entries)) {

        throw new Error("Invalid playlist data");

      }

      const entries = data.entries.filter(
        (video: any) =>
          video &&
          typeof video.id === "string" &&
          /^[a-zA-Z0-9_-]{11}$/.test(video.id),
      );

      if (entries.length === 0) {

        throw new Error("No valid videos found");

      }

      log(`Videos fetched: ${entries.length}`);

      return entries;

    } catch (error) {

      log(
        error instanceof Error
          ? error.message
          : "Playlist request failed",
      );

      if (attempt === CONFIG.MAX_RETRIES) {

        throw new Error("Playlist extraction failed");

      }

      await new Promise(
        (resolve) =>
          setTimeout(resolve, CONFIG.RETRY_DELAY),
      );

    }

  }

  throw new Error("Playlist fetch failed");

}

// ============================================
// GENERATE M3U
// ============================================

function generateM3U(entries: any[]) {

  const lines = ["#EXTM3U"];

  const seen = new Set<string>();

  let total = 0;

  for (const video of entries) {

    const id = video.id;

    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{11}$/.test(id) ||
      seen.has(id)
    ) {

      continue;

    }

    seen.add(id);

    const title = cleanText(video.title);

    const thumbnail =
      validateThumbnail(
        video.thumbnails?.at(-1)?.url || "",
      ) ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const videoURL =
      `https://www.youtube.com/watch?v=${id}`;

    lines.push(
      `#EXTINF:-1 tvg-name="${title}" tvg-logo="${thumbnail}" group-title="${CONFIG.GROUP_TITLE}",${title}`,
    );

    lines.push(videoURL);

    total++;

  }

  if (total === 0) {

    throw new Error("No valid playlist entries");

  }

  Deno.writeTextFileSync(
    CONFIG.OUTPUT_FILE,
    lines.join("\n") + "\n",
  );

  log(`M3U generated: ${total} videos`);

}

// ============================================
// DOWNLOAD LOGO
// ============================================

async function downloadLogo() {

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    15000,
  );

  try {

    const response = await fetch(CONFIG.LOGO_URL, {

      signal: controller.signal,

      headers: {
        "User-Agent": "KB-PRO-TV",
      },

    });

    if (!response.ok) {

      throw new Error("Logo download failed");

    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {

      throw new Error("Invalid logo format");

    }

    const image = new Uint8Array(
      await response.arrayBuffer(),
    );

    if (
      image.length === 0 ||
      image.length > CONFIG.MAX_LOGO_SIZE
    ) {

      throw new Error("Invalid logo size");

    }

    Deno.writeFileSync(
      CONFIG.LOGO_FILE,
      image,
    );

    log("Logo downloaded successfully");

  } finally {

    clearTimeout(timeout);

  }

}

// ============================================
// MAIN
// ============================================

async function main() {

  log("YT-M3U-PLAYLIST STARTED");

  try {

    const entries = await fetchPlaylist();

    generateM3U(entries);

    await downloadLogo();

    log("YT-M3U-PLAYLIST COMPLETED");

  } catch (error) {

    log(
      error instanceof Error
        ? error.message
        : "Unknown error",
    );

    Deno.exitCode = 1;

  }

}

// ============================================
// START
// ============================================

await main();
