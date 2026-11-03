#!/usr/bin/env bash
# Search Sketchfab for downloadable CC-BY models (commercial use OK with credit).
#   bash scripts/sketchfab-search.sh "detective" "tiger"          # any model
#   ANIMATED=1 bash scripts/sketchfab-search.sh "walking man"      # rigged + animated, most liked first
# Prints: uid  faces  likes | name | author.  Then: node scripts/sketchfab.mjs <uid> <asset-folder>
extra=""; [ -n "$ANIMATED" ] && extra="&animated=true&sort_by=-likeCount"
for q in "$@"; do echo "== $q"; curl -s "https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=8&licenses=by${extra}&q=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$q")" | python3 -c '
import sys,json
for m in json.load(sys.stdin).get("results",[]): print(" ",m["uid"],m.get("faceCount"),m["likeCount"],"|",m["name"][:45],"|",m["user"]["displayName"][:18])'; done
