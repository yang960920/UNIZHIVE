// Offline generation from reviewed static research artifacts. No runtime network or game access.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const research = path.join(root, "artifacts/research-2026-10-09/food-drink");
const audit = path.join(root, "artifacts/research-2026-10-10/food-drink-audit");
const local = path.join(root, "artifacts/research-2026-10-07/local");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const table = (name) =>
  read(path.join(research, name + ".json")).decodedBuffers.flatMap((b) => b.rows);
const previousCandidate = read(path.join(research, "candidate-report.json"));
const inventory = read(path.join(audit, "inventory.json"));
const iconManifest = read(path.join(audit, "icon-manifest.json"));
const webAudit = read(path.join(audit, "web-sources.json"));
const verifiedAt = inventory.reviewedAt;
if (
  inventory.basisGameBuildId !== iconManifest.basisGameBuildId ||
  iconManifest.installedGameBuildId !== inventory.basisGameBuildId ||
  previousCandidate.basisGameBuildId !== inventory.basisGameBuildId ||
  verifiedAt !== iconManifest.reviewedAt
)
  throw Error("Consumable audit and native icons use different reviewed builds");
const namedDishes = inventory.records.filter(
  (r) =>
    r.classification === "FIXED_GAMEPLAY_BUFF" &&
    r.family === "NAMED_DISH" &&
    r.sourceItemId >= 30110000 &&
    r.sourceItemId < 30111000,
);
const dishesById = new Map(namedDishes.map((r) => [r.sourceItemId, r]));
if (dishesById.size !== namedDishes.length) throw Error("Duplicate audited consumable identity");
// The reviewed prior snapshot preserves existing selection order; candidate coverage
// comes from the complete audit rather than the former handpicked item set.
const previousIds = previousCandidate.records.map((r) => r.sourceItemId);
if (
  new Set(previousIds).size !== previousIds.length ||
  previousIds.some((id) => !dishesById.has(id))
)
  throw Error("A previously selectable consumable is missing from the complete audit");
const previousIdSet = new Set(previousIds);
const selectedIds = [
  ...previousIds,
  ...namedDishes
    .map((r) => r.sourceItemId)
    .filter((id) => !previousIdSet.has(id))
    .sort((a, b) => a - b),
];
const iconsById = new Map(iconManifest.records.map((r) => [r.sourceItemId, r]));
if (iconsById.size !== iconManifest.records.length)
  throw Error("Duplicate native icon item identity");
const selectedAssets = selectedIds.map((id) => {
  const icon = iconsById.get(id);
  const dish = dishesById.get(id);
  if (!icon || icon.nameKo !== dish.nameKo || icon.iconKey !== dish.iconKey)
    throw Error("Missing exact audited consumable icon: " + id);
  return icon;
});
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
const consumptionSource = read(path.join(audit, "buff__buff_data.json"));
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
aliasEvidence.push({
  sourceId: 30110389,
  currentName: "갤럭시 페스츄리",
  aliases: ["은하 천층", "Layered Galaxy", "갤럭시 패스츄리", "갤럭시 페이스트리"],
  url: "https://www.oncehuman.game/kr/news/update/20250617/40776_1241073.html",
  publishedAt: "2025-06-17",
  verifiedAt,
  evidence:
    "한국어 공식 밸런스 공지의 은하 천층과 연결 업데이트 공지의 갤럭시 페스츄리, 동일 영어 공지의 Layered Galaxy를 대조. 패스츄리는 한국 커뮤니티 표기, 페이스트리는 같은 이름의 검색용 표기 변형이며 별도 아이템을 의미하지 않음.",
  sources: [
    {
      url: "https://www.oncehuman.game/kr/news/update/20250618/40776_1241448.html",
      supports: "갤럭시 페스츄리라는 현재 한국어 이름",
    },
    {
      url: "https://www.oncehuman.game/news/update/20250617/40780_1241054.html",
      supports: "Layered Galaxy라는 동일 음식의 영어 이름",
    },
    {
      url: "https://gall.dcinside.com/mgallery/board/view/?id=oncehumankor&no=218352",
      supports: "갤럭시 패스츄리라는 검색 표기",
    },
  ],
});
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
  if (buffId === 442010630) {
    // Both positions reference {1}, while the original row contains [10, 15].
    // Keep the supplied Korean text and expose the unresolved value explicitly.
    verified = false;
    notes.push(
      "뽀송뽀송 솜사탕의 한국어 원본 설명은 두 수치에 같은 치환값을 사용합니다. 원본 값 10·15의 적용 관계가 미확정이므로 설명을 임의로 보정하지 않았습니다.",
    );
  }
  if (buffId === 403134700)
    notes.push(
      "반중력 셰이크는 원본 설명에 30초로 표기되지만 실제 버프 표의 지속시간 값은 -1입니다. 지속시간 수치를 임의로 확정하지 않았습니다.",
    );
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

const sourceIconFiles = new Map();
const catalogItems = selectedAssets.map((r) => {
  const id = r.sourceItemId,
    item = items.get(id),
    use = uses[id];
  const type = cuisine.get(id)?.row.cuisine_type;
  const kind = type === 1 ? "FOOD" : type === 2 ? "DRINK" : null;
  const expectedTag = kind === "FOOD" ? "2" : "3";
  if (
    !kind ||
    item.type !== 3 ||
    item.sub_type !== 7 ||
    use?.related_func !== "food" ||
    item.name.nameKo !== r.nameKo ||
    item.icon !== r.iconKey ||
    dishesById.get(id).cuisineType !== type ||
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
      recipe.variants?.length
        ? "현재 지원 시나리오의 기본 제작 재료 조합은 확인하지 못했습니다. 원본에서 확인한 재료 조합을 함께 표시합니다."
        : "원본 제작표에서 이 음식의 제작 재료를 확인하지 못했습니다. 현재 획득 및 제작 방법은 미확인입니다.",
    );
  if ([30110313, 30110318].includes(id))
    notes.push(
      "버프 설명의 분류 문구와 달리 실제 소비 그룹 및 요리 분류에서 음료로 확인되었습니다.",
    );
  notes.push("현재 시나리오의 획득·레시피 해제 조건은 미확인입니다.");
  if (id === 30110414)
    notes.push("멘탈 회복과 오염 내성은 요리할 때 넣은 해산물 개수에 따라 달라집니다.");
  if (id === 30110385)
    notes.push(
      "공식 2025년 11월 27일 업데이트에서 무작위 효과 수치는 섭취 시 한 번 결정되고 효과가 끝날 때까지 유지된다고 안내했습니다.",
    );
  if (id === 30110354)
    notes.push(
      "추출한 기본 설명은 오염 내성 +105입니다. 공식 2026년 1월 22일 업데이트의 +100 안내와 달라, 원본 수치를 유지하며 현재 게임 적용값은 별도 확인이 필요합니다.",
    );
  const sourceFile = path.resolve(audit, r.pngRelativePath);
  const expectedFile = path.join(audit, "icons", r.iconKey);
  if (
    !/^[a-zA-Z0-9_.-]+\.png$/.test(r.iconKey) ||
    sourceFile !== expectedFile ||
    hash(fs.readFileSync(sourceFile)) !== r.pngSha256 ||
    !r.pixelRoundtripVerified ||
    r.resized !== false ||
    r.cropped !== false ||
    r.width !== r.nativeWidth ||
    r.height !== r.nativeHeight
  )
    throw Error("Unverified consumable icon");
  const png = fs.readFileSync(sourceFile);
  if (
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    png.readUInt32BE(16) !== r.nativeWidth ||
    png.readUInt32BE(20) !== r.nativeHeight
  )
    throw Error("Native PNG dimensions differ from extraction manifest");
  const previousIcon = sourceIconFiles.get(r.iconKey);
  if (previousIcon && previousIcon.sha256 !== r.pngSha256)
    throw Error("Shared consumable icon key has conflicting pixels");
  sourceIconFiles.set(r.iconKey, { sourceFile, sha256: r.pngSha256 });
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
        inventory.basisGameBuildId +
        "의 정적 기본 기록이며 현재 획득 조건과 재료·셰프 강화 수치는 별도입니다.",
      verifiedAt,
    },
  };
});
const output = {
  schemaVersion: "uniz.consumables.v1",
  verifiedAt,
  basisGameBuildId: inventory.basisGameBuildId,
  items: catalogItems,
};
// Promote only after every identity, effect, recipe and icon has been validated.
for (const [iconKey, { sourceFile, sha256 }] of sourceIconFiles) {
  const target = path.join(outputIcons, iconKey);
  fs.copyFileSync(sourceFile, target);
  if (hash(fs.readFileSync(target)) !== sha256) throw Error("Copied icon hash mismatch");
}
fs.writeFileSync(
  path.join(root, "packages/build-engine/data/consumables-catalog.json"),
  JSON.stringify(output, null, 2) + "\n",
);
const provenance = {
  schemaVersion: "uniz.consumables.assets.v1",
  verifiedAt: output.verifiedAt,
  basisGameBuildId: output.basisGameBuildId,
  installedGameBuildId: iconManifest.installedGameBuildId,
  classificationCorrection: previousCandidate.classificationCorrection,
  auditSelection: {
    source: "artifacts/research-2026-10-10/food-drink-audit/inventory.json",
    sourceSha256: hash(fs.readFileSync(path.join(audit, "inventory.json"))),
    selection:
      "FIXED_GAMEPLAY_BUFF named dishes with source IDs 30110000–30110999; excludes raw ingredients, DIY dishes, RaidZone dishes, custom/test variants and consumption-slot conflicts.",
    previousOrderSource: "artifacts/research-2026-10-09/food-drink/candidate-report.json",
    previousSourceIds: previousIds,
    selectedSourceIds: selectedIds,
    excludedClassificationCounts: inventory.summary.byClassification,
  },
  iconExtraction: {
    source: "artifacts/research-2026-10-10/food-drink-audit/icon-manifest.json",
    sourceSha256: hash(fs.readFileSync(path.join(audit, "icon-manifest.json"))),
    iconChoice: iconManifest.iconChoice,
    selectedAssetCount: selectedAssets.length,
    uniquePromotedIconCount: sourceIconFiles.size,
    originalPixelsRetained: true,
  },
  aliasEvidence,
  classificationBasis:
    "cuisine_common_data.cuisine_type 1/2 confirmed against actual consumption buff_data.unique_tag 2/3; display buff_type is not the consumption-slot authority.",
  supportedScenarioRecipeEvidence: scenarioEvidence,
  recipeSources: read(path.join(research, "recipe-static-extraction-manifest.json")),
  recipeEvidence,
  effectSources: { buffLevels: buffLevelsSource.source, consumption: consumptionSource.source },
  effectEvidence,
  webSources: {
    checkedAt: webAudit.checkedAt,
    primarySources: webAudit.primarySources,
  },
  assets: selectedAssets.map(({ pngPath, ...r }) => ({
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
    uniqueIcons: sourceIconFiles.size,
    verifiedEffects: catalogItems.flatMap((r) => r.effects).filter((e) => e.verified).length,
    unverifiedEffects: catalogItems.flatMap((r) => r.effects).filter((e) => !e.verified).length,
    seasonalRecipes: catalogItems.filter((r) => r.recipe.basisLabel === "시즌 시나리오 기준")
      .length,
    variantsOnly: catalogItems.filter((r) => !r.recipe.ingredients.length).map((r) => r.name),
  }),
);
