export function shortPlainText(value: string, maxLength: number, preserveBrackets = false): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
  };
  let text = preserveBrackets ? value.replace(/\\(?=[\[\]])/g, "") : value;
  for (let pass = 0; pass < 2; pass++) {
    text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity;
      const numeric = name.toLowerCase().startsWith("#x")
        ? Number.parseInt(name.slice(2), 16)
        : Number.parseInt(name.slice(1), 10);
      return numeric >= 32 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
        ? String.fromCodePoint(numeric)
        : " ";
    });
  }
  text = text
    .replace(
      /<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?(?:<\/\s*\1\s*>|$)/gi,
      " ",
    )
    .replace(/\[(img|video|previewyoutube|youtube)\b[^\]]*\][\s\S]*?(?:\[\/\1\]|$)/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]*(?:>|$)/g, " ")
    .replace(
      preserveBrackets
        ? /\[\/?(?:h[1-6]|b|i|u|s|p|url|list|olist|table|tr|td|th|quote|code|spoiler|color|size|center|right|left|\*)(?:=[^\]\r\n]{0,500})?\]/gi
        : /\[[^\]\r\n]{0,500}\]/g,
      " ",
    )
    .replace(/\{STEAM_[A-Z_]+\}\S*/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(text).slice(0, maxLength).join("");
}
