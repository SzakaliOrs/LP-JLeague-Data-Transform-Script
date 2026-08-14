using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

// Usage: LP J2 script.exe [inputPath] [outputPath]
// Defaults to input.txt / output.txt next to the executable's working directory.
string inputPath = args.Length > 0 ? args[0] : "input.txt";
string outputPath = args.Length > 1 ? args[1] : "output.txt";

if (!File.Exists(inputPath))
{
    Console.WriteLine($"Input file not found: {inputPath}");
    return;
}

// Short name (as it appears in the schedule export) -> full name used by {{TeamOpponent|...}}.
// Add/adjust entries here as new clubs show up in the input.
Dictionary<string, string> teamNames = new()
{
    // J2 2026/27
    ["Kashima"] = "Kashima Antlers",
    ["Kashiwa"] = "Kashiwa Reysol",
    ["Kyoto"] = "Kyoto Sanga FC",
    ["Hiroshima"] = "Sanfrecce Hiroshima",
    ["Kobe"] = "Vissel Kobe",
    ["FC Machida"] = "FC Machida Zelvia",
    ["Urawa"] = "Urawa Red Diamonds",
    ["Kawasaki-F"] = "Kawasaki Frontale",
    ["G-Osaka"] = "Gamba Osaka",
    ["C-Osaka"] = "Cerezo Osaka",
    ["FC TOKYO"] = "FC Tokyo",
    ["Fukuoka"] = "Avispa Fukuoka",
    ["Okayama"] = "Fagiano Okayama",
    ["Shimizu"] = "Shimizu S-Pulse",
    ["Yokohama F･M"] = "Yokohama F. Marinos",
    ["Nagoya"] = "Nagoya Grampus",
    ["Tokyo-V"] = "Tokyo Verdy",
    ["Mito"] = "Mito HollyHock",
    ["Nagasaki"] = "V-Varen Nagasaki",
    ["Chiba"] = "JEF United Chiba",

    // J2 2026/27
    ["Yokohama FC"] = "Yokohama FC",
    ["Shonan"] = "Shonan Bellmare",
    ["Niigata"] = "Albirex Niigata",
    ["Tokushima"] = "Tokushima Vortis",
    ["Iwata"] = "Júbilo Iwata",
    ["Omiya"] = "Omiya Ardija",
    ["Sendai"] = "Vegalta Sendai",
    ["Tosu"] = "Sagan Tosu",
    ["Iwaki"] = "Iwaki FC",
    ["Yamagata"] = "Montedio Yamagata",
    ["Imabari"] = "FC Imabari",
    ["Sapporo"] = "Hokkaido Consadole Sapporo",
    ["Kofu"] = "Ventforet Kofu",
    ["Akita"] = "Blaublitz Akita",
    ["Fujieda"] = "Fujieda MYFC",
    ["Oita"] = "Oita Trinita",
    ["Toyama"] = "Kataller Toyama",
    ["TOCHIGI-C"] = "Tochigi City FC",
    ["Hachinohe"] = "Vanraure Hachinohe",
    ["Miyazaki"] = "Tegevajaro Miyazaki",

    // J3 2026/27
    ["Yamaguchi"] = "Renofa Yamaguchi",
    ["Kumamoto"] = "Roasso Kumamoto",
    ["Ehime FC"] = "Ehime FC",
    ["FC Osaka"] = "FC Osaka",
    ["Kagoshima"] = "Kagoshima United",
    ["Kanazawa"] = "Zweigen Kanazawa",
    ["Tochigi SC"] = "Tochigi SC",
    ["Kitakyushu"] = "Giravanz Kitakyushu",
    ["Nara"] = "Nara Club",
    ["Fukushima"] = "Fukushima United",
    ["Tottori"] = "Gainare Tottori",
    ["Sagamihara"] = "SC Sagamihara",
    ["FC Gifu"] = "FC Gifu",
    ["Gunma"] = "Thespa Gunma",
    ["Matsumoto"] = "Matsumoto Yamaga",
    ["RYUKYU"] = "FC Ryukyu",
    ["Sanuki"] = "Kamatamare Sanuki",
    ["Kochi"] = "Kochi United",
    ["Nagano"] = "Nagano Parceiro",
    ["Shiga"] = "Reilac Shiga",
};

var lines = File.ReadAllLines(inputPath)
    .Where(l => !string.IsNullOrWhiteSpace(l))
    .ToList();

if (lines.Count > 0 && lines[0].StartsWith("Season", StringComparison.OrdinalIgnoreCase))
{
    lines.RemoveAt(0);
}

var matches = new List<MatchRow>();
foreach (var line in lines)
{
    var cols = line.Split('\t');
    if (cols.Length < 8) continue;

    matches.Add(new MatchRow(
        Sec: cols[2].Trim(),
        DateRaw: cols[3].Trim(),
        Kickoff: cols[4].Trim(),
        Home: cols[5].Trim(),
        Score: cols[6].Trim(),
        Away: cols[7].Trim()));
}

if (matches.Count == 0)
{
    Console.WriteLine("No match rows found in input file.");
    return;
}

int matchweek = ExtractMatchweek(matches[0].Sec);
var dates = matches.Select(m => ParseDate(m.DateRaw)).ToList();
var unmapped = new HashSet<string>();

var sb = new StringBuilder();
sb.AppendLine($"|title=Matchweek {matchweek}");
sb.AppendLine($"|matchsection=Matchweek {matchweek}");

string? lastDateKey = null;
for (int i = 0; i < matches.Count; i++)
{
    string dateKey = dates[i].ToString("yyyy-MM-dd");
    if (dateKey != lastDateKey)
    {
        sb.AppendLine($"|M{i + 1}header={dates[i]:MMMM d, yyyy}");
        lastDateKey = dateKey;
    }
}

for (int i = 0; i < matches.Count; i++)
{
    var m = matches[i];
    string date = dates[i].ToString("yyyy-MM-dd");
    string home = ResolveTeam(m.Home);
    string away = ResolveTeam(m.Away);

    bool hasScore = TryParseScore(m.Score, out int homeScore, out int awayScore);
    string finished = hasScore ? "true" : "";
    string homeScoreStr = hasScore ? homeScore.ToString() : "";
    string awayScoreStr = hasScore ? awayScore.ToString() : "";

    sb.AppendLine($"|{{{{Match|finished={finished}");
    sb.AppendLine($"    |date={date} - {m.Kickoff}{{{{Abbr/JST}}}}");
    sb.AppendLine("    |comment=");
    sb.AppendLine($"    |opponent1={{{{TeamOpponent|{home}|score={homeScoreStr}}}}}");
    sb.AppendLine($"    |opponent2={{{{TeamOpponent|{away}|score={awayScoreStr}}}}}");
    sb.AppendLine("    }}");
}

File.WriteAllText(outputPath, sb.ToString().TrimEnd('\r', '\n'));

Console.WriteLine($"Wrote {matches.Count} matches to {outputPath}.");
if (unmapped.Count > 0)
{
    Console.WriteLine("Unmapped team names (used as-is — add them to teamNames in Program.cs):");
    foreach (var t in unmapped.OrderBy(x => x))
        Console.WriteLine($"  - {t}");
}

string ResolveTeam(string shortName)
{
    if (teamNames.TryGetValue(shortName, out var full))
        return full;

    unmapped.Add(shortName);
    return shortName;
}

static int ExtractMatchweek(string sec)
{
    var match = Regex.Match(sec, @"(\d+)\w*\s+Sec\s*$");
    return match.Success ? int.Parse(match.Groups[1].Value) : 0;
}

static DateTime ParseDate(string raw)
{
    // e.g. "Fri 09/18/26" -> the date part after the weekday abbreviation
    var parts = raw.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
    string datePart = parts.Length > 1 ? parts[1] : parts[0];
    return DateTime.ParseExact(datePart, "MM/dd/yy", CultureInfo.InvariantCulture);
}

static bool TryParseScore(string raw, out int homeScore, out int awayScore)
{
    // Real scores look like "2-1", "2 - 1", "2:1"; unplayed matches show "vs".
    var match = Regex.Match(raw, @"^(\d+)\s*[-–:]\s*(\d+)$");
    if (match.Success)
    {
        homeScore = int.Parse(match.Groups[1].Value);
        awayScore = int.Parse(match.Groups[2].Value);
        return true;
    }

    homeScore = 0;
    awayScore = 0;
    return false;
}

record MatchRow(string Sec, string DateRaw, string Kickoff, string Home, string Score, string Away);
