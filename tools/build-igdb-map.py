#!/usr/bin/env python3
# tools/build_igdb_map.py
# Usage (Windows):
#   set TWITCH_CLIENT_ID=your_client_id
#   set TWITCH_CLIENT_SECRET=your_client_secret
#   python tools\build_igdb_map.py
#
# Usage (macOS/Linux):
#   export TWITCH_CLIENT_ID=your_client_id
#   export TWITCH_CLIENT_SECRET=your_client_secret
#   python3 tools/build_igdb_map.py
#
# Reads ./games.json and writes ./igdb-map.json
# No third-party libraries required.

import os, json, time, re, sys, pathlib, urllib.request, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]  # repo root (../.. from tools/)
GAMES_JSON = ROOT / "games.json"
OUTPUT_JSON = ROOT / "igdb-map.json"
CACHE_JSON  = ROOT / ".igdb-cache.json"  # local cache to avoid re-querying

# ---- Platform normalization (expand as needed) ----
PLATFORM_SYNONYMS = {
    "NES": "Nintendo Entertainment System",
    "SNES": "Super Nintendo Entertainment System",
    "Super Nintendo": "Super Nintendo Entertainment System",
    "N64": "Nintendo 64",
    "GameCube": "Nintendo GameCube",
    "Wii U": "Wii U",
    "Wii": "Wii",
    "Switch": "Nintendo Switch",
    "Nintendo Switch": "Nintendo Switch",
    "Nintendo DS": "Nintendo DS",
    "Nintendo 3DS": "Nintendo 3DS",
    "3DS": "Nintendo 3DS",
    "Game Boy": "Game Boy",
    "Game Boy Color": "Game Boy Color",
    "Game Boy Advance": "Game Boy Advance",
    "GBA": "Game Boy Advance",
    "Mega Drive": "Sega Mega Drive/Genesis",
    "Genesis": "Sega Mega Drive/Genesis",
    "Sega Genesis": "Sega Mega Drive/Genesis",
    "Sega Saturn": "Sega Saturn",
    "Dreamcast": "Dreamcast",
    "PS1": "PlayStation",
    "PlayStation 1": "PlayStation",
    "PS2": "PlayStation 2",
    "PS3": "PlayStation 3",
    "PS4": "PlayStation 4",
    "PS5": "PlayStation 5",
    "PSP": "PSP",
    "PS Vita": "PlayStation Vita",
    "PC": "PC (Microsoft Windows)",
    "Windows": "PC (Microsoft Windows)",
    "Arcade": "Arcade",
    "TurboGrafx-16": "TurboGrafx-16/PC Engine",
    "PC Engine": "TurboGrafx-16/PC Engine",
}

def norm_platform(p: str) -> str:
    return PLATFORM_SYNONYMS.get(p.strip(), p.strip())

def norm_name(s: str) -> str:
    return re.sub(r"[^\w]+", " ", s.lower()).strip()

def strip_noise(title: str) -> str:
    """Fallback cleaner: remove region tags/parentheses/etc."""
    t = re.sub(r"\s*[\(\[].*?[\)\]]\s*", " ", title)  # remove (...) or [...]
    t = re.sub(r"\s+-\s+.*$", "", t)                  # strip trailing " - Something"
    return re.sub(r"\s+", " ", t).strip()

def http_post_json(url: str, data: bytes, headers: dict) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw.decode("utf-8"))

def get_twitch_app_token() -> tuple[str, str]:
    cid = os.environ.get("TWITCH_CLIENT_ID", "").strip()
    secret = os.environ.get("TWITCH_CLIENT_SECRET", "").strip()
    if not cid or not secret:
        print("ERROR: Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET env vars.", file=sys.stderr)
        sys.exit(1)
    qs = urllib.parse.urlencode({
        "client_id": cid,
        "client_secret": secret,
        "grant_type": "client_credentials",
    })
    tok = http_post_json(f"https://id.twitch.tv/oauth2/token?{qs}", b"", {})
    return tok["access_token"], cid

def igdb_query(query_text: str, token: str, client_id: str) -> list:
    body = query_text.encode("utf-8")
    headers = {
        "Client-ID": client_id,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "text/plain",
    }
    url = "https://api.igdb.com/v4/games"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as e:
            # Handle rate limit gently
            if e.code == 429:
                time.sleep(1.2)
                continue
            # Print server message for debugging
            try:
                msg = e.read().decode("utf-8")
            except Exception:
                msg = str(e)
            print(f"[IGDB] HTTP {e.code}: {msg}", file=sys.stderr)
            return []
        except Exception as ex:
            print(f"[IGDB] Error: {ex}", file=sys.stderr)
            time.sleep(0.6)
    return []

def score_candidate(result: dict, game_name: str, igdb_platform: str) -> int:
    score = 0
    want = norm_name(game_name)
    got = norm_name(result.get("name") or "")

    if got == want:
        score += 70
    elif want in got or got in want:
        score += 35

    # Prefer platform match
    plats = [ (p.get("name") or "").lower() for p in (result.get("platforms") or []) ]
    if any(igdb_platform.lower() in p for p in plats):
        score += 80

    # Prefer main game (category 0), remaster (10), remake (8), enhanced (9)
    if result.get("category") in (0, 8, 9, 10, 11):
        score += 10

    # Prefer entries with a cover
    cover = (result.get("cover") or {}).get("image_id")
    if cover:
        score += 10

    return score

def build():
    if not GAMES_JSON.exists():
        print(f"Missing {GAMES_JSON}", file=sys.stderr)
        sys.exit(1)

    games = json.loads(GAMES_JSON.read_text(encoding="utf-8"))
    out   = json.loads(OUTPUT_JSON.read_text(encoding="utf-8")) if OUTPUT_JSON.exists() else {}
    cache = json.loads(CACHE_JSON.read_text(encoding="utf-8")) if CACHE_JSON.exists() else {}

    token, cid = get_twitch_app_token()

    for platform, titles in games.items():
        igdb_platform = norm_platform(platform)
        out.setdefault(platform, {})

        for title in titles:
            if out[platform].get(title):
                continue
            cache_key = f"{platform}:::{title}"
            if cache.get(cache_key):
                out[platform][title] = cache[cache_key]
                continue

            q_title = title.replace('"', r'\"')
            query = (
                f'search "{q_title}";'
                " fields name,slug,category,platforms.name,cover.image_id,first_release_date;"
                " limit 40;"
            )

            results = igdb_query(query, token, cid)

            # Fallback search with a cleaned title if nothing returned
            if not results:
                cleaned = strip_noise(title)
                if cleaned != title:
                    q2 = cleaned.replace('"', r'\"')
                    query2 = (
                        f'search "{q2}";'
                        " fields name,slug,category,platforms.name,cover.image_id,first_release_date;"
                        " limit 40;"
                    )
                    results = igdb_query(query2, token, cid)

            if not results:
                print(f"[WARN] No IGDB match for: [{platform}] {title}")
                continue

            best, best_score = None, -10**9
            for r in results:
                sc = score_candidate(r, title, igdb_platform)
                if sc > best_score:
                    best, best_score = r, sc

            if not best:
                print(f"[WARN] No best candidate for: [{platform}] {title}")
                continue

            mapped = {
                "id": best["id"],
                "slug": best.get("slug"),
                "coverImageId": (best.get("cover") or {}).get("image_id"),
            }
            out[platform][title] = mapped
            cache[cache_key] = mapped

            # Be gentle with rate limits (≈2 req/sec)
            time.sleep(0.5)

    OUTPUT_JSON.write_text(json.dumps(out, indent=2), encoding="utf-8")
    CACHE_JSON.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    print(f"✅ Wrote {OUTPUT_JSON}")

if __name__ == "__main__":
    build()
