// Offline generation from reviewed static research artifacts. No runtime network or game access.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const research = path.join(root, "artifacts/research-2026-10-09/food-drink");
const local = path.join(root, "artifacts/research-2026-10-07/local");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const table = (name) =>
  read(path.join(research, name + ".json")).decodedBuffers.flatMap((b) => b.rows);
const candidate = read(path.join(research, "candidate-report.json"));
const items = new Map(read(path.join(local, "normalized/item_data.json")).map((r) => [r.id, r]));
const uses = read(path.join(local, "tables/game_common/data/item_use_para_data.json"));
const buffLevelsSource = read(
  path.join(
    root,
    "artifacts/research-2026-10-07/enrichment/game_common__data__buff_level_data.json",
  ),
);
const buffLevels = new Map(
  buffLevelsSource.decodedBuffers
    .flatMap((b) => b.rows)
    .filter((r) => r.id[1] === 1)
    .map((r) => [r.id[0], r]),
);
const consumptionSource = read(path.join(research, "buff__buff_data.json"));
const consumptionBuffs = new Map(
  consumptionSource.decodedBuffers.flatMap((b) => b.rows).map((r) => [r.id[0], r]),
);
const cuisine = new Map(table("cuisine_common_data").map((r) => [r.id, r]));
const forge = table("forge_data");
const choices = table("forge_choice_material_data");
const scripts = read(path.join(local, "normalized/season_script_data.json"));
const templates = new Map(
  read(path.join(local, "normalized/season_template_data.json")).map((r) => [r.id, r]),
);
const scenarioEvidence = scripts
  .filter(
    (r) =>
      /^(터치 오브 스카이|혹독한 겨울|무한한 꿈|비정상 수용)/.test(r.script_name?.nameKo ?? "") &&
      templates.get(r.id)?.forge_season_no?.includes(222),
  )
  .map((r) => ({
    sourceId: r.id,
    name: r.script_name.nameKo,
    forgeSeasonKeys: templates.get(r.id).forge_season_no,
  }));
const outputIcons = path.join(root, "apps/web/public/game/consumables");
const aliasEvidence = [
  { sourceId: 30110328, currentName: "스타더스트 커틀릿", aliases: ["고기튀김", "고기 튀김"] },
  { sourceId: 30110324, currentName: "변이된 소시지", aliases: ["상한 고기", "상한고기"] },
].map((row) => ({
  ...row,
  url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=289259",
  publishedAt: "2026-06-20",
  verifiedAt: "2026-10-09",
  evidence:
    "한국 커뮤니티 도핑 목록에서 현재 이름과 이전에 쓰던 이름을 직접 병기. 공백 변형은 검색 별칭으로만 추가.",
}));
fs.mkdirSync(outputIcons, { recursive: true });
const recipeEvidence = [];
const effectEvidence = [];

function ingredientRows(recipe) {
  const r = recipe.row;
  if (
    recipe.fieldErrors.length ||
    !Array.isArray(r.cost_item_list) ||
    r.cost_item_list.length !== r.cost_num_list?.length ||
    r.item_num !== 1
  )
    throw Error("Incomplete or non-unit recipe: " + JSON.stringify(recipe.id));
  const evidence = [];
  const ingredients = r.cost_item_list.map((id, i) => {
    const quantity = r.cost_num_list[i];
    if (!Number.isInteger(quantity) || quantity < 1) throw Error("Invalid recipe quantity");
    const named = items.get(id)?.name?.nameKo;
    if (named) {
      evidence.push({ sourceId: id, costQuantity: quantity, kind: "REQUIRED_ITEM" });
      return { label: named, quantity };
    }
    const alternatives = choices.filter((c) => c.row.identity === id);
    if (
      !alternatives.length ||
      alternatives.some(
        (c) =>
          c.fieldErrors.length ||
          !Number.isInteger(c.row.item_num) ||
          c.row.item_num < 1 ||
          !items.get(c.row.item_id)?.name?.nameKo,
      )
    )
      throw Error("Unresolved recipe ingredient group: " + id);
    const distinctQuantities = new Set(alternatives.map((c) => c.row.item_num));
    // Keep the explicit recipe group requirement for uniform alternatives. A varying
    // choice row carries its own required item count; never multiply two counts blindly.
    const options = [
      ...new Map(
        alternatives.map((c) => {
          const label = items.get(c.row.item_id).name.nameKo;
          const amount = distinctQuantities.size === 1 ? quantity : c.row.item_num;
          return [label + ":" + amount, { label, quantity: amount }];
        }),
      ).values(),
    ];
    evidence.push({
      groupSourceId: id,
      costQuantity: quantity,
      kind: "CHOICE_GROUP",
      quantityRule:
        distinctQuantities.size === 1 ? "EXPLICIT_RECIPE_REQUIREMENT" : "EXPLICIT_CHOICE_ITEM_NUM",
      choices: alternatives.map((c) => ({
        entryId: c.id,
        itemSourceId: c.row.item_id,
        itemNum: c.row.item_num,
      })),
    });
    return { label: "선택 재료", quantity: null, options };
  });
  return { ingredients, evidence };
}

function recipesFor(id) {
  const sourced = forge.filter(
    (r) => r.row.item_no === id && (typeof r.id === "number" || Array.isArray(r.id)),
  );
  const grouped = new Map();
  for (const row of sourced) {
    const parsed = ingredientRows(row);
    const fingerprint = JSON.stringify(parsed.ingredients);
    const group = grouped.get(fingerprint) ?? {
      ingredients: parsed.ingredients,
      sourceKeys: [],
      rowEvidence: [],
    };
    group.sourceKeys.push(row.id);
    group.rowEvidence.push({
      sourceKey: row.id,
      ingredients: parsed.evidence,
      forgeMethods: row.row.forge_method,
    });
    grouped.set(fingerprint, group);
  }
  const groups = [...grouped.values()];
  const seasonal = groups.find((g) =>
    g.sourceKeys.some((key) => Array.isArray(key) && key[1] === 222),
  );
  const chosen = seasonal ?? (groups.length === 1 ? groups[0] : null);
  const other = groups.filter((g) => g !== chosen);
  const variants = other.map((g, i) => ({
    label: (chosen ? "다른 서버의 재료 조합 " : "제작 재료 조합 ") + String.fromCharCode(65 + i),
    sourceKey: g.sourceKeys.map((key) => JSON.stringify(key)).join(";"),
    ingredients: g.ingredients,
  }));
  recipeEvidence.push({
    itemSourceId: id,
    selectedSourceKeys: chosen?.sourceKeys ?? [],
    selectedForSupportedSeasonalScenarios: Boolean(seasonal),
    groups: groups.map((g) => ({ sourceKeys: g.sourceKeys, evidence: g.rowEvidence })),
    liveServerSelection: "UNVERIFIED",
  });
  return {
    status: groups.length ? "VERIFIED_LOCAL_STATIC" : "UNVERIFIED",
    ...(seasonal
      ? { basisLabel: "시즌 시나리오 기준" }
      : chosen
        ? { basisLabel: "원본 제작표 기준" }
        : {}),
    ingredients: chosen?.ingredients ?? [],
    ...(variants.length ? { variants } : {}),
  };
}

function formattedEffect(buffId, notes) {
  const source = buffLevels.get(buffId);
  const runtime = consumptionBuffs.get(buffId);
  const row = source?.row;
  const uniqueTag = runtime?.row.buff_params?.unique_tag;
  if (!["2", "3"].includes(uniqueTag)) return null;
  const raw = row?.buff_desc?.nameKo;
  if (!raw) {
    notes.push("추가 효과의 원본 설명을 아직 확인하지 못했습니다.");
    effectEvidence.push({ buffSourceId: buffId, verified: false, uniqueTag });
    return null;
  }
  let verified = !source.fieldErrors.length && !runtime.fieldErrors.length;
  let description = raw
    .replace(/\{(\d+)\}/g, (token, index) => {
      const value = row.desc_value?.[Number(index) - 1];
      if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) {
        verified = false;
        return token;
      }
      return value;
    })
    .replace(/#\d+#/g, "")
    .replace(/#\[k=[^\]]+\]/g, "")
    .trim();
  if (/\{\d+\}/.test(description)) verified = false;
  if (buffId === 442010640 && /최대 HP %/.test(description)) {
    // Preserve the flawed Korean text instead of filling in a number from inference.
    verified = false;
    notes.push(
      "별빛 버블 밀크티의 한국어 원본 설명에는 실드 획득 수치가 누락되어 있습니다. 수치 계산에 사용하지 않습니다.",
    );
  }
  const duration = runtime.row.buff_params.life_time;
  const durationSeconds = Number.isFinite(duration) && duration > 0 ? duration : null;
  effectEvidence.push({
    buffSourceId: buffId,
    uniqueTag,
    rawDescription: raw,
    descValues: row.desc_value ?? [],
    buffLevelDuration: row.life_time ?? null,
    consumptionDuration: duration,
    verified,
  });
  return { description, durationSeconds, verified };
}

const catalogItems = candidate.records.map((r) => {
  const id = r.sourceItemId,
    item = items.get(id),
    use = uses[id];
  const type = cuisine.get(id)?.row.cuisine_type;
  const kind = type === 1 ? "FOOD" : type === 2 ? "DRINK" : null;
  const expectedTag = kind === "FOOD" ? "2" : "3";
  if (
    !kind ||
    item.name.nameKo !== r.nameKo ||
    !use.buff_effect_list.some(
      (b) => consumptionBuffs.get(b)?.row.buff_params.unique_tag === expectedTag,
    )
  )
    throw Error("Missing food/drink consumption identity");
  const notes = ["원본 기본 수치이며 재료·요리 품질·셰프 강화는 반영하지 않았습니다."];
  const effects = use.buff_effect_list.map((b) => formattedEffect(b, notes)).filter(Boolean);
  if (!effects.length) throw Error("No sourced consumable effect: " + id);
  const recipe = recipesFor(id);
  if (recipe.variants?.length)
    notes.push(
      "서버·시나리오에 따라 제작 재료가 다를 수 있습니다. 게임 제작 화면의 조합을 확인해주세요.",
    );
  if (!recipe.ingredients.length)
    notes.push(
      "현재 지원 시나리오의 기본 제작 재료 조합은 확인하지 못했습니다. 원본에서 확인한 재료 조합을 함께 표시합니다.",
    );
  if ([30110313, 30110318].includes(id))
    notes.push(
      "버프 설명의 분류 문구와 달리 실제 소비 그룹 및 요리 분류에서 음료로 확인되었습니다.",
    );
  notes.push("현재 시나리오의 획득·레시피 해제 조건은 미확인입니다.");
  const sourceFile = path.join(research, "icons", r.iconKey);
  if (
    !/^[a-zA-Z0-9_.-]+\.png$/.test(r.iconKey) ||
    hash(fs.readFileSync(sourceFile)) !== r.pngSha256 ||
    !r.pixelRoundtripVerified
  )
    throw Error("Unverified consumable icon");
  const target = path.join(outputIcons, r.iconKey);
  fs.copyFileSync(sourceFile, target);
  if (hash(fs.readFileSync(target)) !== r.pngSha256) throw Error("Copied icon hash mismatch");
  return {
    id: "consumable-" + id,
    sourceId: String(id),
    name: r.nameKo,
    aliases: aliasEvidence.find((evidence) => evidence.sourceId === id)?.aliases ?? [],
    kind,
    icon: "/game/consumables/" + r.iconKey,
    effects,
    recipe,
    notes: [...new Set(notes)],
    source: {
      url: null,
      evidence:
        "로컬 item_data " +
        id +
        " → item_use_para_data.buff_effect_list → buff_level_data/실제 buff_data 소비 그룹, cuisine_common_data 및 forge_data/forge_choice_material_data를 아이템 ID로 연결. 기준 빌드 " +
        candidate.basisGameBuildId +
        "의 정적 기본 기록이며 현재 획득 조건과 재료·셰프 강화 수치는 별도입니다.",
      verifiedAt: "2026-10-09",
    },
  };
});
const output = {
  schemaVersion: "uniz.consumables.v1",
  verifiedAt: "2026-10-09",
  basisGameBuildId: candidate.basisGameBuildId,
  items: catalogItems,
};
fs.writeFileSync(
  path.join(root, "packages/build-engine/data/consumables-catalog.json"),
  JSON.stringify(output, null, 2) + "\n",
);
const provenance = {
  schemaVersion: "uniz.consumables.assets.v1",
  verifiedAt: output.verifiedAt,
  basisGameBuildId: output.basisGameBuildId,
  installedGameBuildId: candidate.installedGameBuildId,
  classificationCorrection: candidate.classificationCorrection,
  aliasEvidence,
  classificationBasis:
    "cuisine_common_data.cuisine_type 1/2 confirmed against actual consumption buff_data.unique_tag 2/3; display buff_type is not the consumption-slot authority.",
  supportedScenarioRecipeEvidence: scenarioEvidence,
  recipeSources: read(path.join(research, "recipe-static-extraction-manifest.json")),
  recipeEvidence,
  effectSources: { buffLevels: buffLevelsSource.source, consumption: consumptionSource.source },
  effectEvidence,
  assets: candidate.records.map(({ pngPath, ...r }) => ({
    ...r,
    icon: "/game/consumables/" + r.iconKey,
    researchPath: path.relative(root, pngPath).replaceAll("\\", "/"),
  })),
};
fs.writeFileSync(
  path.join(root, "packages/build-engine/data/consumables-asset-provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    items: catalogItems.length,
    food: catalogItems.filter((r) => r.kind === "FOOD").length,
    drink: catalogItems.filter((r) => r.kind === "DRINK").length,
    icons: catalogItems.length,
    verifiedEffects: catalogItems.flatMap((r) => r.effects).filter((e) => e.verified).length,
    unverifiedEffects: catalogItems.flatMap((r) => r.effects).filter((e) => !e.verified).length,
    seasonalRecipes: catalogItems.filter((r) => r.recipe.basisLabel === "시즌 시나리오 기준")
      .length,
    variantsOnly: catalogItems.filter((r) => !r.recipe.ingredients.length).map((r) => r.name),
  }),
);
