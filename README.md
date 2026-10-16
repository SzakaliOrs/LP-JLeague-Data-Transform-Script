# Liquipedia Schedule Converter

A small static web page that converts a football league's schedule
export into Liquipedia Matchlist wikitext for a single round.

Live at **[j-league-converter.centaur-projects.uk](https://j-league-converter.centaur-projects.uk/)**.

## Leagues

- `index.html` — landing page, pick a league.
- `jleague.html?league=J1|J2|J3` — J-League converter (shared page, `league` set via URL).
- `csl.html` — Chinese Super League converter (file upload; parsing not yet implemented).

More leagues will be added as buttons on the landing page over time.

## Usage (J1/J2/J3)

Data is pulled manually from the [J-League Data Site](https://data.j-league.or.jp/) — there's no automated fetching or API integration.

1. Open the [live site](https://j-league-converter.centaur-projects.uk/) and pick J1, J2, or J3.
2. On the J-League schedule search results page (data.j-league.or.jp),
   select the results table — from the **Season** column through the
   **Away** column, including the header row — and copy it.
3. Paste it into the left box.
4. Pick the **Season**.
5. Click **Convert**, then **Copy** to grab the generated wikitext.

Notes:
- Generates code for one round (matchweek) at a time — paste rows for
  a single round only.
- Currently supports J1, J2, and J3 Matchlists only.

## Adding a team

Short names that aren't in `TEAM_NAMES` (in `jleague.js`) are used
as-is in the output, and the page flags them after conversion. Add
new short-name → full-name pairs to that dictionary as new clubs show
up in the schedule export.

## Code layout

- `common.js` — shared helpers (date parsing/formatting, season-list
  builders, score parsing, copy-to-clipboard) used by every league page.
- `jleague.js` — J1/J2/J3-specific team list, parsing, and matchlist id
  format (`{league}L{season}R{round}`, split-year seasons).
- `csl.js` — Chinese Super League page logic (calendar-year seasons;
  conversion itself is a stub pending a sample export and club list).

## Development

The pages are plain HTML/CSS/JS with no build step or dependencies —
open `index.html` directly, or serve the folder locally, e.g.:

```
python -m http.server 8000
```

## Hosting

Deployed via GitHub Pages (Settings → Pages → Deploy from branch →
`main` / root).
