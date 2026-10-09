# BUILD LAB DATA SPECIFICATION v0.1

상태: **데이터 계약 및 출처 조사 완료 / 현재 패치 전체 수치 카탈로그는 검증 대기**. 작성·확인일은 2026-10-06입니다. PostgreSQL Foundation migration 적용을 완료한 뒤 이 Phase를 진행했습니다.

이번 결과는 12개 데이터 영역의 필드 계약, 출처 등급, 버전·단위 정책, 공식 근거 표본, 검증기입니다. Planner, Static Stats, Damage Pipeline, Simulator 또는 게임 데이터 DB migration은 아직 구현하지 않습니다. 공식 공지의 과거 수치를 현재 수치로 취급하지 않습니다.

## 핵심 결정

1. Catalog Definition, Player Instance, BuildVersion Snapshot, Benchmark Observation을 분리합니다. 같은 무기 이름만으로 tier/blueprint stars/실제 roll/조건을 결정하지 않습니다.
2. 모든 값은 필드별 출처 등급과 source ID를 갖습니다. 문서 전체가 공식 자료여도 해당 문서에 없는 필드까지 OFFICIAL로 올리지 않습니다.
3. 누락 값은 `null` + `UNVERIFIED` + 이유입니다. 누락 방어/저항/계수/시간을 0이나 1로 채우지 않습니다.
4. `OFFICIAL`은 공식 발표 당시의 근거라는 뜻입니다. 현재 게임에 그대로 적용되는지는 별도 검증입니다. 이 Phase의 모든 표본은 `currentValidity: UNVERIFIED`입니다.
5. 공개되지 않은 내부 ID를 만들지 않습니다. UNIZ의 `recordId`는 내부 연구 식별자이며 game ID와 구분합니다. 한국어 번역명도 실제 UI 근거가 없으면 미확인입니다.
6. 시나리오, 모드, 플랫폼, 패치, class, 데이터 revision을 입력 조건으로 보존합니다. 지역/서버 배포 시차도 별도 기록합니다.

## 버전과 범위

검토한 최근 공식 기준 공지 중 하나는 [Version 3.0.7, 2026-09-28](https://www.oncehuman.game/news/update/20260924/40780_1315053.html)입니다. 이는 조사 기준이며 모든 표본의 현재 적용을 보증하지 않습니다. 공지 URL의 날짜와 화면 표시 날짜가 다를 때는 화면 표시 게시일을 저장합니다.

`BuildDataContext`는 `gamePatchId`, `dataRevision`, `scenarioId`, `mode`, `platform`, `locale`, `observedAt`를 갖습니다. 과거 자료와 현 패치 자료는 같은 행을 덮어쓰지 않고 별도 revision으로 보존합니다. 공식 변경 예고와 적용 완료 공지가 충돌하면 적용 공지를 우선하며 기존 근거도 남깁니다.

## 출처 계약

| 등급                 | 값이 갖춰야 할 근거                                    | 사용 정책                                                |
| -------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| `OFFICIAL`           | 공식 자료 URL, 게시일, 확인일, 필드와 연결된 source ID | 발표 당시 의미로만 사용; 현재 적용과 조건은 별도 확인    |
| `COMMUNITY VERIFIED` | 재현 절차, 원본 증거, 반복 실측, 독립 검토자           | 같은 패치·조건에서 재현된 범위만 사용                    |
| `UNVERIFIED`         | 누락/불명확/상충 이유, 발견한 출처가 있으면 연결       | 계산 결과를 확정할 수 없으며 불완전 입력으로 표시        |
| `ESTIMATED`          | 추정 가정과 불확실성                                   | 추정 결과로 명시; 검증 수치나 Tested DPS로 표시하지 않음 |

COMMUNITY VERIFIED의 v0.1 채택 정책은 최소 3회 반복과 서로 다른 2명 검토입니다. **이는 UNIZ 검증 정책이며 게임 규칙이 아닙니다.** 이 Phase에서 해당 등급으로 승인한 실제 데이터는 없습니다. 추정 수치도 임의 생성하지 않았습니다.

`EvidenceField`는 `path`, `value`, `unit`, `status`, `sourceIds`, `note`를 갖습니다. COMMUNITY VERIFIED에는 `verification`, ESTIMATED에는 `estimate`가 추가됩니다. 출처와 이름 참조, 중복 ID/필드, 날짜 순서, 값·단위, 범위 순서를 Zod로 검사합니다. `parseEvidenceCatalog(input, reviewedAsOf)`는 호출자가 지정한 기준일까지 자료가 확인되었는지도 검사하므로 검증기에 숨은 clock 의존성이 없습니다. 구조 검증 통과가 자료의 사실성을 자동 인증하지는 않습니다. OFFICIAL URL은 게임 공식 도메인 또는 Once Human 앱의 공식 Steam 공지 경로로 제한합니다. 원문 내용과 게시자의 검토는 별도 절차입니다.

## 단위와 값

- `PERCENT`: 원문의 50%는 값 `50`으로 보존합니다. 비율 `0.5`로 조용히 바꾸지 않습니다.
- `PERCENTAGE_POINT`: 확률이 몇 %p 변하는지 분명히 확인된 경우에만 사용합니다. 비율 증가와 구분합니다.
- 시간은 `SECONDS`, 거리는 `METERS`, 개수는 `COUNT`입니다. 실제 원문이 연사 속도의 단위를 확인해 주는 경우에만 `ROUNDS_PER_MINUTE`를 사용합니다.
- 표시 숫자의 단위가 불명확하면 `UNSPECIFIED`로 보관합니다. 해당 값은 정적 집계/계산용 quantity로 승격할 수 없습니다.
- 범위 `[min, max]`는 양 끝을 포함한 원문 범위입니다. 최소가 최대보다 커서는 안 됩니다. 확률의 범위 제약과 100%를 넘을 수 있는 피해 보너스는 별도 stat 정의에서 다룹니다.
- `Attack`, `Weapon DMG`, `Status DMG`, `Elemental DMG`, `Psi Intensity`를 서로 바꿔 사용하지 않습니다. 증가량의 합산/곱산/반올림 순서는 확인 전 `UNVERIFIED`입니다.

## 12개 영역의 필드 계약

아래는 **UNIZ 저장 계약 제안**입니다. 내부 게임 API 필드명이 아닙니다. 실제 값의 기본 등급은 UNVERIFIED이며, 개별 필드 근거가 확인된 값만 등급을 올립니다. TypeScript registry는 `packages/build-engine/src/model/field-contracts.ts`입니다.

| 영역              | 주요 필드와 타입/단위                                                                                                                                                          | 이번 조사 결과와 미확인 범위                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Weapon            | name/class/rarity:string, tier/stars:LEVEL, baseStats:분류된 quantity, keyword/effect/mod/attachment refs                                                                      | 실제 이름·일부 효과·공식 표시 수치 근거 확보. 현재 tier/star별 전체 기초 스탯은 미확인    |
| Armor             | equipSlot/setId:string, baseStats, setThresholdEffects:{count:COUNT,effectRef}, keyEffectRefs                                                                                  | 실제 세트·부위·조건 예시 확보. HP/방어/Psi와 현재 강화 규칙은 추가 수집                   |
| Mods              | compatibleSlots:string[], mainEffectRef, suffix, rolls:{stat,value,unit}, enhancementLevel, rollRanges                                                                         | 과거 시스템과 개편 구분. 현재 전체 affix pool/roll 범위/강화 분포는 미확인                |
| Calibration       | ruleSetId/method:string, compatibleWeaponClasses, rarity, styleEffectRef, attack/secondary ranges:PERCENT, legacyRetention                                                     | 2026 변경 전후를 구분. 모든 스타일·희귀도별 현재 범위를 단정하지 않음                     |
| Cradle Override   | scenarioScope, unlockConditions, selectionRules, effectRefs, exclusionGroup                                                                                                    | 시나리오별 선택 및 효과 근거를 저장. 슬롯 수와 상호 배타 규칙을 전역 상수로 고정하지 않음 |
| Deviation         | role/variant:string, skill/stability:LEVEL, traits, skillEffectRefs, activation/energyRules                                                                                    | 이름과 특정 시나리오의 변경 예시 확보. 개체별 level/traits와 현재 계수는 별도 실측        |
| Ammo              | caliberFamily/material:string, compatibleWeaponClasses, damageBonus, effectRefs, craftingConditions                                                                            | 탄약 통합 공지 반영. 재료별 현재 피해 보너스 및 모든 특수 탄약은 미확인                   |
| Food              | ingredients, energyRestore, duration:SECONDS, effectRefs, buffGroup, classExceptions, spoilageRules                                                                            | 실제 음식 예시 확보. 레시피 재료가 수치에 미치는 영향과 현재 전체 충돌표는 미확인         |
| Drink             | ingredients, hydrationRestore, duration:SECONDS, effectRefs, buffGroup, classExceptions, spoilageRules                                                                         | 실제 음료/예외 및 직업별 동시 적용 정책 구분. 이름 유사 자료를 임의 병합하지 않음         |
| Effect            | trigger/target/stat/operation/scalingBasis:string, quantity, duration/cooldown:SECONDS, stacks:COUNT, application/tick interval, stackGroup, resolutionOrder                   | 원문 조건과 확인된 계수만 저장. 상태 적용 간격이 피해 Tick 간격을 뜻한다고 가정하지 않음  |
| Target Profile    | name/class/scenario/difficulty, level:LEVEL, hp:HP, defense/resistances, hitZones, phaseRules, mutations, dummyLimitations                                                     | 보스·더미의 과거 분류와 Phase 조건 근거 확보. 방어 0/약점 계수 같은 수치는 미확인         |
| Benchmark Profile | patch/data/engine/buildVersion refs, targetRef, duration:SECONDS, distance:METERS, hit/crit/reload/buff policies, class/team/start/warmup conditions, trials/results/reviewers | 아래 재현성 프로토콜 정의. 실제 플레이 측정값은 아직 없음                                 |

장비 상세 근거는 [장비 조사](build-data-research-equipment.md), Deviation/Ammo/Food/Drink/Effect 근거는 [효과 조사](build-data-research-effects.md)에 필드별로 정리합니다.

## 바뀐 규칙을 반영하는 방법

장비 조사에서 확인한 Calibration 변경은 기존 workbench 보정과 제작 시 blueprint 적용을 별도 rule set으로 분리하도록 요구합니다. 탄약 통합과 소비 버프 예외는 Weapon class별 고정 탄약 또는 전역 음식 1개·음료 1개 규칙을 사용하지 않도록 요구합니다. 구체적 공식 근거와 적용일은 위 두 조사 문서에서 확인할 수 있습니다.

이러한 조건은 effect와 eligibility 데이터로 표현합니다. 현재 Phase에서 조건을 실행하는 combat event나 계산식을 구현하지 않습니다. 새 규칙이 생겨도 기존 BuildVersion의 참조 revision은 자동으로 교체하지 않습니다.

## Target와 Benchmark

[공식 1.1 공지](https://www.oncehuman.game/news/update/20240814/40780_1174319.html)는 Great Ones와 Deviants를 구분하고 더미에 대한 효과 차이를 설명합니다. [공식 1.3.2 공지](https://www.oncehuman.game/news/update/20241120/40780_1195018.html)는 Secret Servitor의 특정 Phase 조건을 다룹니다. 이를 근거로 이름·역사적 분류·조건만 표본에 저장했습니다. 현재 HP/방어/저항/약점 배율은 `null`이며, 더미 결과를 보스 DPS로 일반화하지 않습니다.

UNIZ Benchmark v0.1은 고정된 숫자 preset 대신 다음을 명시하는 **프로토콜**입니다.

1. 정확한 BuildVersion ID, loadout/data revision, 실제 게임 patch, Scenario/모드/플랫폼을 기록합니다.
2. 대상 ID/난이도/레벨/Phase/변이/피격 부위와 거리를 기록합니다. 미확인 대상 수치는 미확인으로 남깁니다.
3. 측정 시간의 시작·종료 기준, warmup 포함 여부, 재장전 포함 여부, 탄약과 시작 자원을 기록합니다.
4. 음식/음료/Deviation/Cradle/class/팀 버프와 시작 stack 상태를 기록합니다. 외부 효과가 있으면 제외했다고 주장하지 않습니다.
5. 치명타·약점 정책과 조준/명중 조건을 기록합니다. 실측과 향후 RNG 기반 결과는 구분합니다.
6. 원본 영상/스크린샷 등 증거 URL, 각 trial의 관찰값·오차, 독립 검토자를 기록합니다. UID와 개인 credential은 넣지 않습니다.

기간·거리·대상·버프가 다르면 같은 benchmark로 비교하지 않습니다. DPS 산출 공식과 통계 집계는 추후 확정하며 이번에는 측정값을 만들지 않습니다.

## Loadout와 DB 경계

`BuildLoadoutSnapshotV01`은 `schemaVersion: uniz-loadout.v0.1`, context, 동적 selections, target/benchmark revision 참조를 갖습니다. selection은 slotKey, category, recordId/revision, instanceFields를 보존합니다. 이는 타입 계약이며 아직 Planner 입력이나 계산 가능한 complete loadout으로 승인하는 validator는 아닙니다.

현재 `build_versions.loadout_snapshot` 저장 경계와 immutable trigger는 유지합니다. 게임 항목 DB 테이블을 추가하지 않았습니다. 다음 migration 전에 Definition/Revision/Instance 분리와 effect/source relations, immutable data revision, 안정 ID, revision 호환 정책을 확정해야 합니다.

## 산출물과 검증

```text
packages/build-engine/
├─ data/
│  ├─ equipment-evidence.json
│  ├─ effects-evidence.json
│  └─ target-evidence.json
├─ src/model/
│  ├─ evidence.ts
│  └─ field-contracts.ts
├─ scripts/verify-data.mjs
└─ tests/evidence.test.ts
```

`pnpm data:verify`로 표본의 구조/출처 연결을 검사합니다. `pnpm test`는 unknown 보존, 등급 상승 차단, 단위·범위, source 참조, 날짜, 표본 이름, 중복, 검토/추정 조건을 검사합니다. 데이터는 문서 조사 표본이며 웹 Dashboard의 Mock 값을 실제 운영 데이터로 바꾸지 않습니다.

## 다음 단계의 입력 조건

Build Planner는 비계산 선택 UI부터 진행할 수 있지만, 정적 스탯/피해 계산은 현재 패치의 tier/star별 기초 스탯, mod roll, effect stacking/순서/반올림, 대상 조건을 검증한 뒤에 시작합니다. 게임 내 직접 확인 자료와 재현 가능한 커뮤니티 측정을 수집해야 합니다. 현재 상태로 추정 DPS를 검증된 값처럼 표시하지 않습니다.
