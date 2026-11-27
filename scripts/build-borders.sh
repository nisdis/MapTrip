#!/usr/bin/env bash
# Rebuilds public/borders/*.json: simplified world borders for the Explored map
# (counting countries and states/regions on the phone). Natural Earth data,
# public domain (https://www.naturalearthdata.com). Run by hand when updating.
set -euo pipefail
work=$(mktemp -d)
base=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -sf -o "$work/countries.geojson" "$base/ne_50m_admin_0_countries.geojson"
curl -sf -o "$work/regions.geojson" "$base/ne_10m_admin_1_states_provinces.geojson"
npx -y mapshaper@0.6.102 "$work/countries.geojson" -filter-fields ADM0_A3,NAME -rename-fields code=ADM0_A3,name=NAME \
  -simplify 8% keep-shapes -o precision=0.001 format=geojson public/borders/countries.json
npx -y mapshaper@0.6.102 "$work/regions.geojson" -filter-fields adm1_code,name,adm0_a3 -rename-fields code=adm1_code,country=adm0_a3 \
  -simplify 2% keep-shapes -o precision=0.001 format=geojson public/borders/regions.json
rm -rf "$work"
