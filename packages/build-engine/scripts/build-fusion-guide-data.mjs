// Read-only joins and bounded native UI-image extraction. Never executes game code.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const research = path.join(root, "artifacts/research-2026-10-07");
const local = path.join(research, "local");
const game = "D:/SteamLibrary/steamapps/common/Once Human";
const destination = path.join(root, "apps/web/public/game/fusion-guide");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fusion = read(
  path.join(root, "packages/build-engine/data/gear-trait-fusion-enrichment.json"),
);
const items = new Map(
  read(path.join(local, "normalized/item_data.json")).map((row) => [row.id, row]),
);
const bonuses = read(
  path.join(local, "tables/game_common/data/deviation_fusion_additive_material_data.json"),
);
const references = read(path.join(local, "icon-resource-matches.json"));
const materials = new Map();
for (const trait of fusion.fusionTraits) {
  for (const material of trait.materials) {
    materials.set(material.id, { ...material, type: trait.traitFusionMaterialType });
  }
}

function decodeLz4(input, length) {
  const output = Buffer.alloc(length);
  let from = 0;
  let to = 0;
  function extra() {
    let count = 0;
    let value = 255;
    while (value === 255) {
      if (from >= input.length) throw Error("LZ4 extended length bounds");
      value = input[from++];
      count += value;
    }
    return count;
  }
  while (from < input.length) {
    const token = input[from++];
    let literal = token >>> 4;
    if (literal === 15) literal += extra();
    if (from + literal > input.length || to + literal > length) throw Error("LZ4 literal bounds");
    input.copy(output, to, from, from + literal);
    from += literal;
    to += literal;
    if (from === input.length) break;
    if (from + 2 > input.length) throw Error("LZ4 offset bounds");
    const offset = input.readUInt16LE(from);
    from += 2;
    if (!offset || offset > to) throw Error("LZ4 invalid offset");
    let match = (token & 15) + 4;
    if ((token & 15) === 15) match += extra();
    if (to + match > length) throw Error("LZ4 match bounds");
    for (let i = 0; i < match; i++) output[to + i] = output[to + i - offset];
    to += match;
  }
  if (to !== length) throw Error("LZ4 output length mismatch");
  return output;
}

function decode(entry, stored) {
  if (entry.flag === 0) return stored;
  if (entry.flag === 2) return decodeLz4(stored, entry.raw);
  if (![3, 10].includes(entry.flag) || stored.readUInt32LE(0) !== 0xfd2fb528) {
    throw Error("Unsupported native compression");
  }
  const header = stored[4];
  const idBytes = [0, 1, 2, 4][header & 3];
  const idAt = header & 0x20 ? 5 : 6;
  const dictionaryId = idBytes ? stored.readUIntLE(idAt, idBytes) : 0;
  let dictionary;
  if (dictionaryId) {
    const probe = read(path.join(local, "dictionary-probes.json")).find(
      (row) => row.dictionaryId === dictionaryId,
    );
    if (!probe) throw Error("Unknown standard dictionary");
    dictionary = fs.readFileSync(path.join(local, probe.output));
  }
  return zlib.zstdDecompressSync(stored, { dictionary, maxOutputLength: 16 * 1024 * 1024 });
}

const extraction = [];
for (const material of materials.values()) {
  const item = items.get(material.id);
  if (item?.name?.nameKo !== material.name || !/^[a-zA-Z0-9_.-]+\.png$/.test(item.icon)) {
    throw Error("Missing exact Korean item/icon reference: " + material.id);
  }
  let candidates = references
    .filter((row) => row.table === "item_data" && row.id === material.id && row.field === "icon")
    .flatMap((row) => row.matches)
    .filter((row) => row.internalPath.startsWith("ui/") && row.internalPath.endsWith(".pvr"));
  candidates = [...new Map(candidates.map((row) => [row.archive + ":" + row.index, row])).values()];
  if (candidates.length > 1 && material.type === "FURNITURE") {
    candidates = candidates.filter((row) => row.internalPath.includes("/bld_icon/"));
  }
  if (candidates.length !== 1) throw Error("Missing/ambiguous material icon: " + material.id);
  const entry = candidates[0];
  if (entry.stored > 8 * 1024 * 1024 || entry.raw > 16 * 1024 * 1024) {
    throw Error("Native image exceeds extraction bound");
  }
  const fd = fs.openSync(path.join(game, entry.archive), "r");
  const stored = Buffer.alloc(entry.stored);
  try {
    if (fs.readSync(fd, stored, 0, stored.length, entry.offset) !== stored.length) {
      throw Error("Incomplete archive read");
    }
  } finally {
    fs.closeSync(fd);
  }
  const pvr = decode(entry, stored);
  if (pvr.length !== entry.raw || pvr.readUInt32LE(0) !== 0x03525650) throw Error("Invalid PVR v3");
  const pixelFormat = Number(pvr.readBigUInt64LE(8));
  const codec = { 7: ["DXT1", 8], 9: ["DXT3", 16], 11: ["DXT5", 16] }[pixelFormat];
  if (!codec) throw Error("Unsupported native image pixel format");
  const height = pvr.readUInt32LE(24);
  const width = pvr.readUInt32LE(28);
  if (
    [32, 36, 40].some((offset) => pvr.readUInt32LE(offset) !== 1) ||
    !width ||
    !height ||
    width > 4096 ||
    height > 4096
  ) {
    throw Error("Invalid native image dimensions");
  }
  const bodyAt = 52 + pvr.readUInt32LE(48);
  const size = Math.ceil(width / 4) * Math.ceil(height / 4) * codec[1];
  if (bodyAt + size > pvr.length) throw Error("Invalid native image body");
  const dds = Buffer.alloc(128);
  dds.write("DDS ");
  dds.writeUInt32LE(124, 4);
  dds.writeUInt32LE(0x81007, 8);
  dds.writeUInt32LE(height, 12);
  dds.writeUInt32LE(width, 16);
  dds.writeUInt32LE(size, 20);
  dds.writeUInt32LE(32, 76);
  dds.writeUInt32LE(4, 80);
  dds.write(codec[0], 84);
  dds.writeUInt32LE(0x1000, 108);
  const bonus = bonuses[material.id];
  if (
    !bonus ||
    !Number.isFinite(bonus.up_rate) ||
    bonus.up_rate <= 0 ||
    !Array.isArray(bonus.deviation_lst)
  ) {
    throw Error("Missing verified material trait bonus: " + material.id);
  }
  extraction.push({
    ...material,
    sourceId: String(material.id),
    icon: "/game/fusion-guide/" + item.icon,
    iconKey: item.icon,
    sourceTable: "item_data",
    sourceNodeOffset: item.nodeOffset,
    nativeSource: entry,
    storedSha256: hash(stored),
    pvrSha256: hash(pvr),
    nativeWidth: width,
    nativeHeight: height,
    pixelFormat,
    bonusTraitSourceId: String(bonus.skill_no),
    bonusDeviantSourceIds: bonus.deviation_lst.map(String),
    ddsBase64: Buffer.concat([dds, pvr.subarray(bodyAt, bodyAt + size)]).toString("base64"),
  });
}

const conversion = spawnSync(
  "python",
  [
    "-c",
    `import base64, hashlib, io, json, pathlib, sys
from PIL import Image
payload=json.load(sys.stdin)
destination=pathlib.Path(payload['destination'])
destination.mkdir(parents=True,exist_ok=True)
records=[]
for row in payload['rows']:
    image=Image.open(io.BytesIO(base64.b64decode(row.pop('ddsBase64')))).convert('RGBA')
    if image.size!=(row['nativeWidth'],row['nativeHeight']):raise ValueError('Native dimension mismatch')
    bounds=image.getchannel('A').getbbox()
    if not bounds:raise ValueError('Empty native material icon')
    image=image.crop(bounds)
    image.thumbnail((256,256),Image.Resampling.LANCZOS)
    output=destination/row['iconKey']
    if output.resolve().parent!=destination.resolve():raise ValueError('Unsafe output path')
    image.save(output,optimize=True)
    reopened=Image.open(output).convert('RGBA')
    if reopened.tobytes()!=image.tobytes():raise ValueError('PNG roundtrip mismatch')
    records.append({**row,'width':image.width,'height':image.height,'alphaBounds':list(bounds),'pngSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'pixelRoundtripVerified':True})
print(json.dumps(records,ensure_ascii=False))`,
  ],
  {
    input: JSON.stringify({ destination, rows: extraction }),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  },
);
if (conversion.status !== 0) throw Error(conversion.stderr || "Native icon conversion failed");
const assets = JSON.parse(conversion.stdout);
const runtime = {
  schemaVersion: "uniz.fusion-material-guide.v1",
  verifiedAt: "2026-10-07",
  materials: assets.map((row) => ({
    id: "fusion-material-" + row.sourceId,
    sourceId: row.sourceId,
    name: row.name,
    type: row.type,
    icon: row.icon,
    bonusTraitSourceId: row.bonusTraitSourceId,
    bonusDeviantSourceIds: row.bonusDeviantSourceIds,
  })),
  traits: fusion.traitMetadata.map((metadata) => {
    const recipe = fusion.fusionTraits.find((trait) => trait.id === metadata.id);
    return {
      id: metadata.id,
      typeCode: metadata.typeCode,
      materialRecipes: (recipe?.materials ?? []).map((material) => ({
        materialSourceId: String(material.id),
        bodyRecipeDeviantSourceIds: [
          ...new Set(
            recipe.recipes
              .filter((row) => row.materialId === material.id)
              .map((row) => String(row.baseId)),
          ),
        ],
        bodyRecipeDeviantNames: [
          ...new Set(
            recipe.recipes
              .filter((row) => row.materialId === material.id)
              .map((row) => row.baseName)
              .filter(Boolean),
          ),
        ],
      })),
    };
  }),
};
fs.writeFileSync(
  path.join(root, "packages/build-engine/data/fusion-guide-materials.json"),
  JSON.stringify(runtime, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "packages/build-engine/data/fusion-guide-material-provenance.json"),
  JSON.stringify(
    {
      schemaVersion: "uniz.fusion-material-assets.v1",
      verifiedAt: runtime.verifiedAt,
      gameBuildId: "25590224",
      source:
        "Exact item_data icon references and static deviation_fusion_additive_material_data joins; bounded native UI textures from the user-authorized local installation.",
      materialBonusProof: {
        sourceTable: "deviation_fusion_additive_material_data",
        function: "get_fusion_skill_total_weight",
        emptyDeviantList: "UNRESTRICTED_MATERIAL_TRAIT_SOURCE",
        bodyRecipes:
          "Separate appearance/body transformations; not a general trait inheritance whitelist.",
      },
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    materials: assets.length,
    animalMaterials: assets.filter((row) => row.type === "ANIMAL").length,
    furnitureMaterials: assets.filter((row) => row.type === "FURNITURE").length,
    traits: runtime.traits.length,
  }),
);
