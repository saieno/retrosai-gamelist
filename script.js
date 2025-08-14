// script.js — modern UI, efficient rendering, no external libs
// Uses games.json and (optionally) igdb-map.json for URLs.
// If a title isn't found in igdb-map.json, we fall back to a deterministic slug.

let GAMES = {};     // { Platform: [Title, ...] }
let LINKMAP = {};   // { Platform: { Title: "https://www.igdb.com/games/<slug>" } }

const state = {
  search: "",
  platform: "",
  letter: "",
  density: "cozy", // "cozy" | "compact"
  // rendering control
  chunk: 400,       // items per batch for "Load more" per platform
};

const els = {
  resultsMeta: null,
  search: null,
  platform: null,
  letter: null,
  gameList: null,
  expandAll: null,
  collapseAll: null,
  density: null,
};

// ---- utilities ----
function slugifyIGDB(title) {
  // minimal deterministic slug
  const cleaned = title
    .split(" / ")[0]
    .replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, " ")
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toURL(platform, title) {
  return LINKMAP?.[platform]?.[title] || `https://www.igdb.com/games/${slugifyIGDB(title)}`;
}
function firstLetterKey(title) {
  const ch = (title || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}
function platformKeys() {
  return Object.keys(GAMES).sort((a, b) => a.localeCompare(b));
}
function formatNumber(n) {
  return n.toLocaleString(undefined);
}

// ---- load data ----
async function loadJSON(url, fallback = {}) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url);
    return await res.json();
  } catch {
    return fallback;
  }
}

async function init() {
  els.resultsMeta = document.getElementById("results-meta");
  els.search = document.getElementById("search");
  els.platform = document.getElementById("platform");
  els.letter = document.getElementById("letter");
  els.gameList = document.getElementById("game-list");
  els.expandAll = document.getElementById("expandAll");
  els.collapseAll = document.getElementById("collapseAll");
  els.density = document.getElementById("density");

  [GAMES, LINKMAP] = await Promise.all([
    loadJSON("games.json", {}),
    loadJSON("igdb-map.json", {}),
  ]);

  populatePlatformSelect();
  bindEvents();
  render();
}

function populatePlatformSelect() {
  const options = platformKeys();
  for (const p of options) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    els.platform.appendChild(opt);
  }
}

// ---- filters ----
function titleMatchesFilters(title) {
  if (state.search) {
    const hay = title.toLowerCase();
    if (!hay.includes(state.search)) return false;
  }
  if (state.letter) {
    if (firstLetterKey(title) !== state.letter) return false;
  }
  return true;
}

// ---- rendering ----
function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

function render() {
  const allPlatforms = state.platform ? [state.platform] : platformKeys();

  // counts and metadata
  let totalTitles = 0;
  const filteredByPlatform = new Map(); // platform -> filtered list

  for (const p of allPlatforms) {
    const titles = (GAMES[p] || []);
    const filtered = titles.filter(titleMatchesFilters);
    if (filtered.length) filteredByPlatform.set(p, filtered);
    totalTitles += filtered.length;
  }

  els.resultsMeta.textContent =
    `${formatNumber(totalTitles)} title${totalTitles !== 1 ? "s" : ""}` +
    (state.platform ? ` • ${state.platform}` : " • all platforms") +
    (state.search ? ` • search "${state.search}"` : "") +
    (state.letter ? ` • ${state.letter}` : "");

  clearNode(els.gameList);

  // Render per platform as <details> accordion
  for (const [platform, titles] of filteredByPlatform) {
    const details = document.createElement("details");
    details.className = "platform";
    details.id = `p-${platform.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

    // auto-open single platform; otherwise collapsed by default
    if (state.platform) details.open = true;

    const summary = document.createElement("summary");
    const titleEl = document.createElement("span");
    titleEl.className = "title";
    titleEl.textContent = platform;

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = formatNumber(titles.length);

    summary.appendChild(titleEl);
    summary.appendChild(count);
    details.appendChild(summary);

    const section = document.createElement("div");
    section.className = "section";

    const grid = document.createElement("div");
    grid.className = "games";
    section.appendChild(grid);

    details.appendChild(section);
    els.gameList.appendChild(details);

    // batched render for large lists
    let start = 0;
    const step = state.chunk;

    function renderBatch() {
      const end = Math.min(start + step, titles.length);
      for (let i = start; i < end; i++) {
        grid.appendChild(makeGameRow(platform, titles[i]));
      }
      start = end;
      if (start >= titles.length) {
        // fully rendered
        const btn = section.querySelector(".load-more");
        if (btn) btn.remove();
      }
    }

    // initial chunk
    renderBatch();

    if (titles.length > start) {
      const more = document.createElement("button");
      more.className = "load-more";
      more.textContent = `Load more (${formatNumber(titles.length - start)} remaining)`;
      more.addEventListener("click", () => {
        renderBatch();
        if (titles.length > start) {
          more.textContent = `Load more (${formatNumber(titles.length - start)} remaining)`;
        } else {
          more.remove();
        }
      });
      section.appendChild(more);
    }
  }
}

function makeGameRow(platform, title) {
  const row = document.createElement("div");
  row.className = "game";
  if (state.density === "compact") row.classList.add("compact");

  const a = document.createElement("a");
  a.className = "game-link";
  a.href = toURL(platform, title);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = title;

  const copyBtn = document.createElement("button");
  copyBtn.className = "icon-btn";
  copyBtn.title = "Copy link";
  copyBtn.innerHTML = `<span class="icon">🔗</span>`;
  copyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(a.href);
      flash(copyBtn);
    } catch {
      // fallback: open prompt
      window.prompt("Copy URL", a.href);
    }
  });

  const openBtn = document.createElement("a");
  openBtn.className = "icon-btn";
  openBtn.title = "Open on IGDB";
  openBtn.href = a.href;
  openBtn.target = "_blank";
  openBtn.rel = "noopener";
  openBtn.innerHTML = `<span class="icon">↗</span>`;

  row.appendChild(a);
  row.appendChild(copyBtn);
  row.appendChild(openBtn);
  return row;
}

function flash(el) {
  const old = el.style.outline;
  el.style.outline = "2px solid var(--focus)";
  setTimeout(() => { el.style.outline = old || ""; }, 350);
}

// ---- events ----
function bindEvents() {
  const debounce = (fn, ms = 160) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  els.search.addEventListener("input", debounce((e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  }));

  els.platform.addEventListener("change", (e) => {
    state.platform = e.target.value;
    render();
  });

  els.letter.addEventListener("change", (e) => {
    state.letter = e.target.value.toUpperCase();
    render();
  });

  els.expandAll.addEventListener("click", () => {
    document.querySelectorAll(".platform").forEach(d => d.open = true);
  });
  els.collapseAll.addEventListener("click", () => {
    document.querySelectorAll(".platform").forEach(d => d.open = false);
  });

  els.density.addEventListener("click", () => {
    state.density = (state.density === "cozy") ? "compact" : "cozy";
    els.density.textContent = state.density === "compact" ? "Cozy" : "Compact";
    render();
  });
}

init();