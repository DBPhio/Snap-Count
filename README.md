# Snap Count

NFL player statistics for every active-roster offensive player and kicker —
weekly box scores, season totals, and a filter workbench for questions like
"who scored a touchdown in week 3" or "every 100-yard rushing game this season."

## Running it

`index.html` is self-contained. Open it in a browser and it works — it ships
with a bundled data snapshot.

## Weekly auto-refresh

The bundled snapshot goes stale. To keep it current:

1. Push this folder to a GitHub repo and enable GitHub Pages.
2. In `index.html`, set `DATA_BASE` near the top of the script to your repo's
   data folder:

   ```js
   const DATA_BASE = "https://raw.githubusercontent.com/USER/REPO/main/data";
   ```

3. The included Action (`.github/workflows/update-data.yml`) runs every Tuesday
   morning, rebuilds `data/*.json` from nflverse, and commits the result. The
   app picks it up on next load. You can also trigger it manually from the
   Actions tab.

Why not fetch nflverse directly from the browser? GitHub release assets don't
send CORS headers, so a page can't read them. `raw.githubusercontent.com` does,
which is why the data lands in your repo first.

## Rebuilding data by hand

```bash
python build_data.py     # writes data/players.json, data/weekly_*.json
```

## Data

[nflverse](https://github.com/nflverse/nflverse-data) — rosters and weekly
player stats. Players are limited to `status == ACT` (53-man active rosters).
