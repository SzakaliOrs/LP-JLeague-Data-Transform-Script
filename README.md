# J-League Schedule → Liquipedia Converter

A small static web page that converts a J-League schedule export into
Liquipedia Matchlist wikitext for a single round.

Live at **[j-league-converter.centaur-projects.uk](https://j-league-converter.centaur-projects.uk/)**.

## Usage

Data is pulled manually from the [J-League Data Site](https://data.j-league.or.jp/) — there's no automated fetching or API integration.

1. Open the [live site](https://j-league-converter.centaur-projects.uk/) (or `index.html` locally).
2. On the J-League schedule search results page (data.j-league.or.jp),
   select the results table — from the **Season** column through the
   **Away** column, including the header row — and copy it.
3. Paste it into the left box.
4. Pick the **League** (J1/J2/J3) and **Season**.
5. Click **Convert**, then **Copy** to grab the generated wikitext.

Notes:
- Generates code for one round (matchweek) at a time — paste rows for
  a single round only.
- Currently supports J1, J2, and J3 Matchlists only.

## Adding a team

Short names that aren't in `TEAM_NAMES` (in `script.js`) are used
as-is in the output, and the page flags them after conversion. Add
new short-name → full-name pairs to that dictionary as new clubs show
up in the schedule export.

## Development

The page is plain HTML/CSS/JS with no build step or dependencies —
open `index.html` directly, or serve the folder locally, e.g.:

```
python -m http.server 8000
```
