// script.js — Builds IGDB links via igdb-map.json or slug fallback,
// and shows a hover preview if igdb-covers.json provides an image URL.

let games = {};
let linkMap = {};
let coverMap = {};

function normalizeKey(s) {
  return s
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// --- Slug fallback (no API) in case some entries are missing in igdb-map.json ---
const aliasSlugMap = {
  "unsquadron": "u-n-squadron",
  "area88": "u-n-squadron",
  "mariokart8": "mario-kart-8",
};
function preCleanTitle(title) {
  let t = title.split(" / ")[0];
  t = t.replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, " ");
  t = t.replace(/[™®©]/g, "");
  return t.replace(/\s+/g, " ").trim();
}
function slugifyIGDB(title) {
  const cleaned = preCleanTitle(title);
  const key = normalizeKey(cleaned);
  if (aliasSlugMap[key]) return aliasSlugMap[key];
  return cleaned
    .replace(/&/g, " and ").replace(/\+/g, " plus ")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

async function loadJSON(url, fallback = {}) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return fallback;
  }
}

async function init() {
  [games, linkMap, coverMap] = await Promise.all([
    loadJSON("games.json", {}),
    loadJSON("igdb-map.json", {}),
    loadJSON("igdb-covers.json", {}), // optional; may not exist on first run
  ]);

  populatePlatforms();
  bindControls();
  render();
}

function populatePlatforms() {
  const platformSelect = document.getElementById("platform");
  platformSelect.innerHTML = "";
  const keys = Object.keys(games).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    platformSelect.appendChild(opt);
  }
}

function getIGDBUrl(platform, title) {
  const m = linkMap?.[platform]?.[title];
  if (m) return m;
  // fallback from slug if missing
  return `https://www.igdb.com/games/${slugifyIGDB(title)}`;
}

function getCoverUrl(platform, title) {
  const u = coverMap?.[platform]?.[title];
  // treat empty string/undefined as missing; null means "attempted but not found" — still skip
  return typeof u === "string" && u ? u : null;
}

function bindControls() {
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("platform").addEventListener("change", render);
}

function render() {
  const searchTerm = document.getElementById("search").value.toLowerCase().trim();
  const selectedPlatform = document.getElementById("platform").value;
  const container = document.getElementById("game-list");
  container.innerHTML = "";

  const platforms = selectedPlatform ? [selectedPlatform] : Object.keys(games).sort((a, b) => a.localeCompare(b));

  for (const p of platforms) {
    const titles = (games[p] || []).filter(g => !searchTerm || g.toLowerCase().includes(searchTerm));
    if (!titles.length) continue;

    const h2 = document.createElement("h2");
    h2.textContent = p;
    container.appendChild(h2);

    for (const title of titles) {
      const url = getIGDBUrl(p, title);
      const cover = getCoverUrl(p, title);

      const row = document.createElement("div");
      row.className = "game-item";

      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "igdb-link";
      a.textContent = title;

      if (cover) {
        const tip = document.createElement("span");
        tip.className = "hover-card";
        const img = document.createElement("img");
        img.alt = `${title} cover`;
        img.loading = "lazy";
        img.src = cover;
        tip.appendChild(img);
        a.appendChild(tip);
      } else {
        // Optional: simple URL tooltip fallback
        a.title = url;
      }

      row.appendChild(a);
      container.appendChild(row);
    }
  }
}

init();
