#!/bin/bash

# Directory containing the per-platform game list .txt files.
# (Override by passing a path as the 1st argument; default is the live folder.)
GAMES_DIR="${1:-D:\VTuber Assets\Wheel of Nostalgia\Platforms}"

# Output JSON file (override with the 2nd argument).
OUTPUT_JSON="${2:-./games.json}"

# Files in GAMES_DIR that are NOT real platforms and must be left out of the
# site's games.json. These mirror the previous script's "keep/skip" files plus
# the wheel's runtime files:
#   Platforms.txt / All_Completed_Games.txt - curated, not platform game lists
#   winner.txt                              - last wheel winner
#   Twitch_Chat_Giveaway.txt                - raffle/giveaway entrants
# Everything else is treated as a valid platform, so new platforms are picked up
# automatically. Add a filename here if another non-platform file ever appears.
EXCLUDE=(
    "Platforms.txt"
    "winner.txt"
    "Twitch_Chat_Giveaway.txt"
)

is_excluded() {
    local name="$1"
    for ex in "${EXCLUDE[@]}"; do
        [ "$name" = "$ex" ] && return 0
    done
    return 1
}

echo "{" > "$OUTPUT_JSON"

first_platform=true

for file in "$GAMES_DIR"/*.txt; do
    fname=$(basename "$file")

    # Only organize the valid platforms - skip curated/runtime files.
    if is_excluded "$fname"; then
        continue
    fi

    platform="${fname%.txt}"

    # Handle commas between platforms
    if [ "$first_platform" = false ]; then
        echo "," >> "$OUTPUT_JSON"
    fi

    echo "  \"$platform\": [" >> "$OUTPUT_JSON"

    # Strip CR (lists are CRLF), drop blank lines, and escape double quotes so
    # no stray carriage returns end up as invalid control chars in the JSON.
    game_lines=$(tr -d '\r' < "$file" | sed '/^[[:space:]]*$/d;s/"/\\"/g')

    first_game=true
    while IFS= read -r game; do
        if [ "$first_game" = true ]; then
            printf "    \"%s\"" "$game" >> "$OUTPUT_JSON"
            first_game=false
        else
            printf ",\n    \"%s\"" "$game" >> "$OUTPUT_JSON"
        fi
    done <<< "$game_lines"

    echo -e "\n  ]" >> "$OUTPUT_JSON"
    first_platform=false
done

echo "}" >> "$OUTPUT_JSON"

echo "✅ games.json successfully regenerated (valid platforms only)!"
