const fs = require("fs");

function normalizeFile(path, replacements) {
  let contents = fs.readFileSync(path, "utf8");
  for (const [from, to] of replacements) {
    contents = contents.split(from).join(to);
  }
  fs.writeFileSync(path, contents, "utf8");
}

const replacements = [
  ["ðŸª™", "🪙"],
  ["ðŸ¤–", "🤖"],
  ["ðŸ”¥", "🔥"],
  ["ðŸ§ ", "🧠"],
  ["ðŸª²", "🪲"],
  ["ðŸ¦„", "🦄"],
  ["ðŸ§¾", "🧾"],
  ["ðŸ’¸", "💸"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€™", "’"],
  ["â†’", "→"],
  ["Ã—", "×"],
  ["âˆ’", "−"],
];

for (const file of ["app.js", "index.html"]) {
  if (fs.existsSync(file)) normalizeFile(file, replacements);
}

