#!/usr/bin/env bash
# Rebuilds public/borders/*.json: simplified world borders for the Explored map
# (counting countries and states/regions on the phone). Natural Earth data,
# public domain (https://www.naturalearthdata.com). Run by hand when updating.
set -euo pipefail
work=$(mktemp -d)
base=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -sf -o "$work/countries.geojson" "$base/ne_50m_admin_0_countries.geojson"
curl -sf -o "$work/regions.geojson" "$base/ne_10m_admin_1_states_provinces.geojson"
# Simplified by distance (borders move at most ~1-2 km), not by share of points:
# that keeps thin coasts like lower Manhattan or Colaba. TopoJSON stores each
# shared border once. The app treats squares within 3 km of a coast as land.
npx -y mapshaper@0.6.102 "$work/countries.geojson" -filter-fields ADM0_A3,NAME -rename-fields code=ADM0_A3,name=NAME \
  -simplify interval=2000 keep-shapes -o format=topojson quantization=100000 public/borders/countries.json
npx -y mapshaper@0.6.102 "$work/regions.geojson" -filter-fields adm1_code,name,adm0_a3 -rename-fields code=adm1_code,country=adm0_a3 \
  -simplify interval=1000 keep-shapes -o format=topojson quantization=200000 public/borders/regions.json
# After changing them, bump BORDERS_VERSION in src/services/explored.ts (phones cache them).
rm -rf "$work"
