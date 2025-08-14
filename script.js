let games = {};

// --- Aliases for titles whose IGDB slug doesn't match a naive slug ---
// Keys are normalized (lowercased, no punctuation/diacritics).
const aliasSlugMap = {
  // U.N. Squadron / Area 88 -> u-n-squadron
  "unsquadron": "u-n-squadron",
  "area88": "u-n-squadron",

  // Examples (keep or remove as you like):
  "mariokart8": "mario-kart-8",
};

// Normalize for alias keys: remove diacritics, punctuation, and spaces.
function normalizeKey(s) {
  return s
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Clean obvious suffixes/variants to better match IGDB slugs.
// - keep left side of " / " combos
// - drop bracketed/parenthetical descriptors
// - strip ™/®/© etc.
function preCleanTitle(title) {
  let t = title;
  t = t.split(" / ")[0];
  t = t.replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, " ");
  t = t.replace(/[™®©]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

// Final slug maker:
// - & -> "and", + -> "plus"
// - remove diacritics
// - non-alphanumerics -> hyphen
// - collapse/trim hyphens
function slugifyIGDB(title) {
  const cleaned = preCleanTitle(title);
  const key = normalizeKey(cleaned);
  if (aliasSlugMap[key]) return aliasSlugMap[key];

  let s = cleaned
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ");

  s = s
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return s;
}

async function loadGames() {
  const response = await fetch("games.json");
  games = await response.json();
  populatePlatforms();
  displayGames();
}

function populatePlatforms() {
  const platformSelect = document.getElementById("platform");
  Object.keys(games)
    .sort((a, b) => a.localeCompare(b))
    .forEach(platform => {
      const option = document.createElement("option");
      option.value = platform;
      option.textContent = platform;
      platformSelect.appendChild(option);
    });
}

function displayGames() {
  const searchTerm = document.getElementById("search").value.toLowerCase().trim();
  const selectedPlatform = document.getElementById("platform").value;
  const gameList = document.getElementById("game-list");
  gameList.innerHTML = "";

  const platforms = selectedPlatform ? [selectedPlatform] : Object.keys(games).sort((a,b)=>a.localeCompare(b));

  platforms.forEach(platform => {
    const filtered = (games[platform] || []).filter(g =>
      !searchTerm || g.toLowerCase().includes(searchTerm)
    );
    if (filtered.length === 0) return;

    const header = document.createElement("h2");
    header.textContent = platform;
    gameList.appendChild(header);

    filtered.forEach(game => {
      const gameItem = document.createElement("div");
      gameItem.className = "game-item";

      const a = document.createElement("a");
      a.className = "igdb-link";
      a.href = `https://www.igdb.com/games/${slugifyIGDB(game)}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = game;

      gameItem.appendChild(a);
      gameList.appendChild(gameItem);
    });
  });
}

document.getElementById("search").addEventListener("input", displayGames);
document.getElementById("platform").addEventListener("change", displayGames);
loadGames();