// Offline static-data generation. Python/game code is never imported or executed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const local = path.join(root, "artifacts/research-2026-10-07/local");
const foodResearch = path.join(root, "artifacts/research-2026-10-09/food-drink");
const require = createRequire(import.meta.url);
const { Reader } = require(path.join(local, "marshal38.cjs"));
const { Decoder } = require(path.join(local, "decode-bindict-tables.cjs"));
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const inputs = [];
function sourced(file) {
  inputs.push({
    path: path.relative(root, file).replaceAll("\\", "/"),
    sha256: hash(fs.readFileSync(file)),
  });
  return read(file);
}
const rawItems = new Map(
  sourced(path.join(local, "normalized/item_data.json")).map((r) => [r.id, r]),
);
const equipment = sourced(path.join(local, "normalized/equip_data.json"));
const gear = sourced(path.join(root, "packages/build-engine/src/model/gear-catalog.json"));
const food = sourced(path.join(root, "packages/build-engine/data/consumables-catalog.json")).items;
const buffLevels = new Map(
  sourced(
    path.join(
      root,
      "artifacts/research-2026-10-07/enrichment/game_common__data__buff_level_data.json",
    ),
  )
    .decodedBuffers.flatMap((buffer) => buffer.rows)
    .map((row) => [JSON.stringify(row.id), row]),
);
const table = (name) =>
  sourced(path.join(foodResearch, name + ".json")).decodedBuffers.flatMap((b) => b.rows);
const forge = table("forge_data").filter((r) => typeof r.id === "number" || Array.isArray(r.id));
const choiceRows = table("forge_choice_material_data").filter((r) => typeof r.id === "number");
const choiceGroups = new Map();
for (const r of choiceRows) {
  const group = choiceGroups.get(r.row.identity) ?? [];
  group.push(r);
  choiceGroups.set(r.row.identity, group);
}
for (const rows of choiceGroups.values()) rows.sort((a, b) => a.id - b.id);

const leatherNames = [
  "사슴 가죽",
  "고원 사슴 가죽",
  "숲 사슴 가죽",
  "이끼 평원 사슴 가죽",
  "늑대 가죽",
  "황야 늑대 가죽",
  "초원 늑대 가죽",
  "정글 늑대 가죽",
  "토끼 가죽",
  "드림 토끼 가죽",
  "럭키 토끼 가죽",
  "양모",
  "암벽 토끼 가죽",
  "고산 양털",
  "황금 양털",
  "생가죽",
  "곰 가죽",
  "유빙 곰 가죽",
  "설원 곰 가죽",
  "깊은 동굴 곰 가죽",
  "악어 가죽",
  "백사장 악어 가죽",
  "베이 악어 가죽",
  "여우 가죽",
  "극지 여우 가죽",
  "사막 여우 가죽",
  "가죽",
  "거위 털",
  "물범 가죽",
  "순록 가죽",
  "소가죽",
  "군산 소가죽",
  "골짜기 소가죽",
  "달의 징조 사슴 가죽",
  "달의 징조 늑대 가죽",
  "달의 징조 토끼 가죽",
  "달의 징조 양모",
  "꿈의 사슴 가죽",
  "꿈의 늑대 가죽",
  "꿈의 토끼 가죽",
  "꿈의 양모",
  "꿈의 소 가죽",
  "별빛 여우 가죽",
  "별빛 거위 털",
  "별빛 악어 가죽",
  "별빛 소 가죽",
  "구식 군용 헬멧",
];
const leatherIds = new Set(
  leatherNames.map((name) => {
    const matches = [...rawItems.values()].filter(
      (r) => r.name?.nameKo === name && r.type === 3 && r.id < 90000000,
    );
    if (matches.length !== 1) throw Error("Ambiguous requested crafting material " + name);
    return matches[0].id;
  }),
);
const rarities = { 1: "NORMAL", 2: "RARE", 3: "EPIC", 4: "LEGENDARY" };
const materials = new Map();
function material(id, category = "MATERIAL") {
  const r = rawItems.get(id);
  if (!r?.name?.nameKo) throw Error("Unknown material identity " + id);
  const key = "material-" + id;
  if (!materials.has(key))
    materials.set(key, {
      id: key,
      sourceId: String(id),
      name: r.name.nameKo,
      rarity: rarities[r.quality] ?? null,
      category: leatherIds.has(id) ? "LEATHER" : category,
    });
  return key;
}
for (const id of leatherIds) material(id);
const cleanText = (s) =>
  typeof s === "string" ? s.replace(/#\d+#|#\[k=[^\]]+\]|#l/g, "").trim() : "";
const recipeEvidence = [];
const tuningEffectEvidence = [];
function ingredients(row, kind) {
  const r = row.row;
  if (kind === "CONSUMABLE" && r.item_num !== 1)
    throw Error("Unreviewed food batch output " + JSON.stringify(row.id));
  if (kind === "GEAR" && (r.item_num !== 0 || r.forge_heap_max_num !== 1))
    throw Error("Unreviewed equipment output " + JSON.stringify(row.id));
  if (
    row.fieldErrors.length ||
    !Array.isArray(r.cost_item_list) ||
    r.cost_item_list.length !== r.cost_num_list?.length
  )
    throw Error("Incomplete crafting recipe " + JSON.stringify(row.id));
  const evidence = [];
  const occurrences = new Map();
  const parsed = r.cost_item_list.map((id, index) => {
    const amount = r.cost_num_list[index];
    const occurrence = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, occurrence);
    const suffix = occurrence === 1 ? "" : "-" + occurrence;
    if (!Number.isInteger(amount) || amount < 1) throw Error("Invalid material quantity");
    if (rawItems.has(id)) {
      const mat = material(id, kind === "CONSUMABLE" ? "INGREDIENT" : "MATERIAL");
      evidence.push({ key: "item-" + id + suffix, sourceId: id, quantity: amount });
      return {
        key: "item-" + id + suffix,
        label: rawItems.get(id).name.nameKo,
        kind: "FIXED",
        quantity: amount,
        defaultMaterialId: mat,
        options: [{ materialId: mat, quantity: amount, effects: [] }],
      };
    }
    const source = choiceGroups.get(id);
    if (!source?.length) throw Error("Unknown crafting group " + id);
    if (
      source.some(
        (r) =>
          r.fieldErrors.length ||
          !Number.isInteger(r.row.item_num) ||
          r.row.item_num < 1 ||
          !rawItems.has(r.row.item_id),
      )
    )
      throw Error("Incomplete crafting choice " + id);
    const isLeather =
      kind === "GEAR" &&
      source.some((r) => leatherIds.has(r.row.item_id)) &&
      id >= 8010 &&
      id < 8070;
    const selected = isLeather ? source.filter((r) => leatherIds.has(r.row.item_id)) : source;
    const uniform = new Set(selected.map((r) => r.row.item_num)).size === 1;
    const options = [
      ...new Map(
        selected.map((r) => {
          // Gear replacement rows contain the actual recipe count. Food recipes retain
          // their explicit requirement when alternatives use a uniform group unit.
          const quantity = !isLeather && uniform ? amount : r.row.item_num;
          const mat = material(r.row.item_id, kind === "CONSUMABLE" ? "INGREDIENT" : "MATERIAL");
          const description = cleanText(r.row.describe?.nameKo);
          const option = { materialId: mat, quantity, effects: description ? [description] : [] };
          return [mat, option];
        }),
      ).values(),
    ];
    if (!options.length) throw Error("No reviewed choices in " + id);
    evidence.push({
      key: "group-" + id + suffix,
      groupSourceId: id,
      costQuantity: amount,
      choiceEntryIds: selected.map((r) => r.id),
    });
    return {
      key: "group-" + id + suffix,
      label: isLeather
        ? "가죽·제작 소재"
        : options.length === 1
          ? materials.get(options[0].materialId).name
          : "선택 재료",
      kind: options.length === 1 ? "FIXED" : "CHOICE",
      quantity: amount,
      defaultMaterialId: isLeather || options.length === 1 ? options[0].materialId : null,
      options,
    };
  });
  return { parsed, evidence };
}
function makeRecipes(itemId, rows, kind, tier) {
  const grouped = new Map();
  for (const row of rows) {
    const decoded = ingredients(row, kind);
    // Empty legacy semi-product recipes cannot provide a bill of materials.
    if (!decoded.parsed.length) continue;
    const signature = JSON.stringify(decoded.parsed);
    const group = grouped.get(signature) ?? { parsed: decoded.parsed, evidence: [], rows: [] };
    group.rows.push(row);
    group.evidence.push(decoded.evidence);
    grouped.set(signature, group);
  }
  const groups = [...grouped.values()].sort((a, b) => {
    const seasonal = (r) => r.rows.some((s) => Array.isArray(s.id) && s.id[1] === 222);
    return (
      Number(seasonal(b)) - Number(seasonal(a)) ||
      JSON.stringify(a.rows[0].id).localeCompare(JSON.stringify(b.rows[0].id))
    );
  });
  return groups.map((g, index) => {
    const keys = g.rows.map((r) => JSON.stringify(r.id)).sort();
    const seasonal = g.rows.some((r) => Array.isArray(r.id) && r.id[1] === 222);
    const key =
      (kind === "GEAR" ? "gear" : "food") +
      ":" +
      itemId +
      ":" +
      (tier ?? "dish") +
      ":" +
      hash(Buffer.from(keys.join(";"))).slice(0, 12);
    recipeEvidence.push({
      recipeKey: key,
      sourceKeys: keys,
      sourceOutputQuantities: [...new Set(g.rows.map((row) => row.row.item_num))],
      outputKind:
        kind === "GEAR" ? "ONE_UNIQUE_EQUIPMENT_PER_CRAFT" : "ONE_STACKABLE_ITEM_PER_CRAFT",
      ingredients: g.evidence,
    });
    return {
      key,
      itemId,
      tier,
      label: index === 0 ? "기본 제작표" : "다른 제작표 " + index,
      basisLabel: seasonal ? "시즌 시나리오 기준" : "원본 제작표 기준",
      isDefault: index === 0,
      ingredients: g.parsed,
      outputQuantity: 1,
      sourceKeys: keys,
    };
  });
}
const gearRecipes = [];
for (const item of gear.filter((r) => ["ARMOR", "WEAPON"].includes(r.kind))) {
  const representative = equipment.find((r) => String(r.id) === item.sourceId);
  if (!representative) continue;
  for (let tier = 1; tier <= 5; tier++) {
    const sourceEquipment = equipment.filter(
      (r) =>
        r.blueprint_no === representative.blueprint_no &&
        r.art_lv === tier &&
        r.equip_quality === representative.equip_quality,
    );
    const sourceIds = new Set(sourceEquipment.map((r) => r.id));
    const rows = forge.filter((r) => sourceIds.has(r.row.item_no));
    gearRecipes.push(...makeRecipes(item.id, rows, "GEAR", tier));
  }
}
const consumableRecipes = food.flatMap((item) =>
  makeRecipes(
    item.id,
    forge.filter((r) => r.row.item_no === Number(item.sourceId)),
    "CONSUMABLE",
    null,
  ),
);

const index = sourced(path.join(local, "script-file-index.json"));
const dictionary = fs.readFileSync(path.join(local, "script_dict.zdict"));
const archivePath =
  process.env.ONCE_HUMAN_SCRIPT_ARCHIVE ?? "D:/SteamLibrary/steamapps/common/Once Human/script.npk";
const archive = fs.openSync(archivePath, "r");
const staticEvidence = [];
function staticTable(name) {
  const internalPath = "game_common/data/" + name + ".pyc";
  const entry = index.find((r) => r.internalPath === internalPath);
  if (!entry || entry.flag !== 10 || entry.stored > 8 * 1024 * 1024 || entry.raw > 16 * 1024 * 1024)
    throw Error("Static table bounds " + internalPath);
  const header = Buffer.alloc(24);
  fs.readSync(archive, header, 0, 24, 0);
  const current = Buffer.alloc(28);
  fs.readSync(archive, current, 0, 28, header.readUInt32LE(20) + entry.index * 28);
  for (const [field, offset] of [
    ["offset", 4],
    ["stored", 8],
    ["raw", 12],
    ["flag", 24],
  ])
    if (current.readUInt32LE(offset) !== entry[field])
      throw Error("Archive table changed " + internalPath);
  const bytes = Buffer.alloc(entry.stored);
  if (fs.readSync(archive, bytes, 0, bytes.length, entry.offset) !== bytes.length)
    throw Error("Short archive read");
  const decoded = zlib.zstdDecompressSync(bytes, { dictionary, maxOutputLength: 16 * 1024 * 1024 });
  if (decoded.length !== entry.raw || decoded.readUInt32LE(0) !== 0x0a0d0da8)
    throw Error("Static identity mismatch");
  const reader = new Reader(decoded),
    code = reader.obj();
  if (!code.__code || reader.at !== decoded.length) throw Error("Incomplete static constants");
  const rows = code.consts
    .filter((c) => c?.__bytes?.length > 20)
    .flatMap((c) => {
      const decoder = new Decoder(c.__bytes);
      return decoder
        .rootIndex()
        .map((r) => ({ id: r.id, ...decoder.projectedRow(r.nodeOffset, null) }));
    });
  if (rows.some((r) => r.fieldErrors.length)) throw Error("Incomplete static row " + name);
  staticEvidence.push({
    internalPath,
    archiveIndex: entry.index,
    storedSha256: hash(bytes),
    sha256: hash(decoded),
    rows: rows.length,
  });
  return rows;
}
let prints, terms;
try {
  prints = staticTable("gun_correct_print_data");
  terms = new Map(staticTable("gun_correct_common_terms_data").map((r) => [r.id, r.row]));
} finally {
  fs.closeSync(archive);
}
const families = {
  1: "PISTOL",
  2: "SHOTGUN",
  3: "SMG",
  4: "AR",
  5: "SNIPER",
  6: "LMG",
  7: "CROSSBOW",
  8: "ARM-TYPE-8",
  9: "MELEE",
  10: "ARM-TYPE-10",
  11: "ARM-TYPE-11",
};
const secondaryKinds = {
  E0100: "CRIT_RATE",
  E0200: "WEAKSPOT_DAMAGE",
  E0300: "CRIT_DAMAGE",
  E3200: "ELEMENTAL_DAMAGE",
};
const scenarioPatterns = {
  DEVIATION: /^비정상 수용/,
  MANIBUS: /^터치 오브 스카이/,
  WINTER: /^혹독한 겨울/,
  ENDLESS_DREAM: /^무한한 꿈/,
};
const scripts = sourced(path.join(local, "normalized/season_script_data.json"));
const templates = new Map(
  sourced(path.join(local, "normalized/season_template_data.json")).map((r) => [r.id, r]),
);
const scenarioGroups = Object.fromEntries(
  Object.entries(scenarioPatterns).map(([key, pattern]) => {
    const groups = scripts
      .filter((r) => pattern.test(r.script_name?.nameKo ?? ""))
      .map((r) => templates.get(r.id)?.gun_print_group_list)
      .filter(Boolean);
    const common = groups.length
      ? groups[0].filter((id) => groups.every((g) => g.includes(id)))
      : [];
    return [key, common];
  }),
);
const tuningBlueprints = prints
  .filter((r) => r.row.is_valid === 1)
  .sort((a, b) => a.id - b.id)
  .map((r) => {
    const row = r.row,
      item = rawItems.get(r.id);
    const effect = buffLevels.get(JSON.stringify(row.buff_id));
    let description = effect?.row.buff_desc?.nameKo;
    let effectVerified = Boolean(description && !effect?.fieldErrors.length);
    if (description)
      description = cleanText(
        description.replace(/\{(\d+)\}/g, (token, index) => {
          const value = effect.row.desc_value?.[Number(index) - 1];
          if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) {
            effectVerified = false;
            return token;
          }
          return value;
        }),
      );
    tuningEffectEvidence.push({
      sourceId: r.id,
      buffId: row.buff_id,
      rawDescription: effect?.row.buff_desc?.nameKo ?? null,
      values: effect?.row.desc_value ?? [],
      verified: effectVerified,
    });
    const secondaryOptions = row.affix_ids.map((id) => {
      const term = terms.get(id)?.terms?.[0];
      const kind = secondaryKinds[term?.affix_ids?.[0]];
      if (!kind) throw Error("Unknown current tuning option " + id);
      return {
        kind,
        min: Math.round(term.min_val * 10000) / 100,
        max: Math.round(term.max_val * 10000) / 100,
      };
    });
    return {
      id: "tuning-" + r.id,
      sourceId: String(r.id),
      name: item.name.nameKo,
      rarity: rarities[item.quality],
      style: row.correct_style.nameKo,
      weaponFamilies: row.weapon_type_lst.map((type) => families[type]),
      scenarioKeys: Object.entries(scenarioGroups)
        .filter(([, groups]) => groups.includes(row.group_id))
        .map(([key]) => key),
      groupId: row.group_id,
      seasonal: row.season_state === 1,
      attackRange: {
        min: Math.round(row.affix_val_range[0] * 10000) / 100,
        max: Math.round(row.affix_val_range[1] * 10000) / 100,
      },
      secondaryOptions,
      description:
        description || "제작할 때 사용하는 튜닝 설계도입니다. 실제 보유 수치를 입력하세요.",
    };
  });
if (leatherIds.size !== 47 || tuningBlueprints.length !== 94)
  throw Error("Reviewed crafting coverage changed");
const ingredientPool = new Map();
function compactRecipe(recipe) {
  const ingredientRefs = recipe.ingredients.map((ingredient) => {
    const ref = "ingredient-" + hash(Buffer.from(JSON.stringify(ingredient))).slice(0, 16);
    ingredientPool.set(ref, ingredient);
    return ref;
  });
  const record = { ...recipe };
  delete record.ingredients;
  return { ...record, ingredientRefs };
}
const compactGear = gearRecipes.map(compactRecipe);
const compactFood = consumableRecipes.map(compactRecipe);
const output = {
  verifiedAt: "2026-10-10",
  gameBuildId: "25590224",
  materials: [...materials.values()].sort((a, b) => Number(a.sourceId) - Number(b.sourceId)),
  leatherIds: [...leatherIds].map((id) => "material-" + id),
  ingredientPool: Object.fromEntries(ingredientPool),
  gearRecipes: compactGear,
  consumableRecipes: compactFood,
  tuningBlueprints,
};
const provenance = {
  verifiedAt: output.verifiedAt,
  gameBuildId: output.gameBuildId,
  inputs,
  staticTables: staticEvidence,
  recipeEvidence,
  tuningEffectEvidence,
  scenarioGroups,
  exclusions: {
    legacyTuningBlueprints: prints.filter((r) => r.row.is_valid === 0).map((r) => r.id),
    unsupportedSeasonalTuning: tuningBlueprints
      .filter((r) => !r.scenarioKeys.length)
      .map((r) => r.id),
    leatherScope:
      "The 47 user-requested materials only; unrequested fish skins are excluded from new choices.",
    tierRestriction:
      "No sourced Tier V-only restriction. Crafting tier is independent from recorded equipment level.",
  },
};
for (const [name, value] of [
  ["crafting-catalog.json", output],
  ["crafting-provenance.json", provenance],
])
  fs.writeFileSync(
    path.join(root, "packages/build-engine/data", name),
    JSON.stringify(value, null, 2) + "\n",
  );
console.log(
  JSON.stringify({
    materials: output.materials.length,
    leather: output.leatherIds.length,
    gearRecipes: gearRecipes.length,
    consumableRecipes: consumableRecipes.length,
    tuningBlueprints: tuningBlueprints.length,
  }),
);
