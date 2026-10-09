# BUILD LAB DATA SPECIFICATION v0.1 — Deviation / Ammo / Food / Drink / Effect 조사

확인일: **2026-10-06**. 공식 Once Human 개발팀의 공개 업데이트 공지만 사용했다. 이 문서는 UNIZ의 **저장 필드 제안과 역사적 근거**이며, 공식 게임 내부 스키마나 현재 버전의 완전한 아이템 DB가 아니다. 카탈로그 완성, 피해 공식, Simulator, 데이터 마이그레이션은 포함하지 않는다.

## 근거 판정과 저장 규칙

| 필드 근거 상태       | 이 조사에서의 의미                                                                   |
| -------------------- | ------------------------------------------------------------------------------------ |
| `OFFICIAL`           | 공식 공지에 그 이름·행동·수치가 직접 기재됨. 해당 공지의 패치와 조건으로 한정        |
| `COMMUNITY VERIFIED` | 조건·원자료·재현 절차가 있는 커뮤니티 실측. 이번 공식 자료 조사에는 해당 레코드 없음 |
| `UNVERIFIED`         | 미공개, 문맥 불명확, 또는 현재 유효성 미확인. 값은 `null`; 0/false로 대신하지 않음   |
| `ESTIMATED`          | 가정·불확실성 범위를 붙인 추정. 이번 조사에는 해당 레코드 없음                       |

각 필드에 출처를 연결한다. 같은 아이템의 이름이 OFFICIAL이어도 지속시간과 배율은 UNVERIFIED일 수 있다. 공식 공지의 예정 조정과 실제 클라이언트 동작은 별도로 검증해야 한다. **모든 JSON sample의 `currentValidity`는 `UNVERIFIED`**다. 최신 패치 전체를 대조하거나 현재 게임에서 실측한 데이터가 아니므로 현재 빌드 계산 입력으로 자동 승격하지 않는다.

단위는 `PERCENT`(180은 180%), `PERCENTAGE_POINT`(확률의 퍼센트포인트 변화), `COUNT`, `SECONDS`, `METERS`, `DAMAGE`, `HP`, `LEVEL`, `TEXT`, `BOOLEAN` 등을 구분한다. `+3%`를 공지에 근거 없이 `+3 percentage points`로 변환하지 않는다. `Attack` 같은 원문 스탯 명칭은 문자열로 보존하며, 어떤 플레이어/Deviation 스탯인지 불명확하면 별도 미확인 필드를 둔다. 내부 game ID, 수식, 합연산/곱연산 버킷을 추측하지 않는다.

## 공통 필드 매트릭스 — 제안 계약

| 제안 필드                             | 타입 / 단위           | 근거 판정                | 확인 내용 / 미확인 사항                                              |
| ------------------------------------- | --------------------- | ------------------------ | -------------------------------------------------------------------- |
| `recordId`                            | string / TEXT         | 설계 메타데이터          | UNIZ 자체 식별자. 공식 내부 ID로 표시하지 않음                       |
| `officialGameId`                      | string \| null / TEXT | UNVERIFIED               | 공식 ID 레지스트리를 확보하지 못함                                   |
| `name.en`                             | string / TEXT         | OFFICIAL, 개별 근거 필요 | sample의 이름은 공지에 있는 영문만 사용                              |
| `name.ko`                             | string \| null / TEXT | UNVERIFIED               | 이번 조사에서 한국어 클라이언트 명칭 미검증                          |
| `patchContext`, `publishedAt`         | string / TEXT         | OFFICIAL, 출처별         | 아래 출처 등록부의 버전과 공지 날짜                                  |
| `mode`, `scenario`, `vision`, `class` | string \| null / TEXT | OFFICIAL 또는 UNVERIFIED | 공지에서 명시한 조건만 저장. 미명시 조건은 전체 서버로 확대하지 않음 |
| `currentValidity`                     | enum / TEXT           | UNVERIFIED               | 역사적 공지 확인과 현재 패치 승인 상태를 분리                        |
| `sourceIds`, `checkedAt`              | string[] / date       | 설계 메타데이터          | 필드별 원문 연결, checkedAt=2026-10-06                               |

## Deviation 필드 매트릭스

| 제안 필드                                                  | 타입 / 단위                      | 근거 판정  | 확인 내용 / 제한                                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill.kindLabel`                                          | string \| null / TEXT            | OFFICIAL   | Dr. Teddy의 `Psi Skill`이라는 공지 명칭. 일반 전투 소환 스킬과 자동 동일시하지 않음. [E04](https://www.oncehuman.game/news/update/20251210/40780_1275885.html)             |
| `skill.scalingStatLabel`                                   | string \| null / TEXT            | OFFICIAL   | 위 스킬의 회복 기준을 `Attack`으로 표기. 스탯 소유자·스냅샷 규칙은 미확인. [E04](https://www.oncehuman.game/news/update/20251210/40780_1275885.html)                       |
| `skill.healingCoefficientPercent`                          | number \| null / PERCENT         | OFFICIAL   | Dr. Teddy 회복당 180%, 해당 공지의 Deviation: Survive, Capture, Preserve 문맥. 현재값 승인 아님. [E04](https://www.oncehuman.game/news/update/20251210/40780_1275885.html) |
| `skill.healCount`                                          | integer \| null / COUNT          | OFFICIAL   | 같은 문맥에서 회복 횟수 6. 총 회복 공식·회복 간격은 도출하지 않음. [E04](https://www.oncehuman.game/news/update/20251210/40780_1275885.html)                               |
| `skill.zoneDurationSeconds`                                | number \| null / SECONDS         | OFFICIAL   | Invincible Sun 화염 지대 8초. 적용 시나리오 전체 목록은 공지에 없음. [E05](https://www.oncehuman.game/m/news/update/20260311/40780_1290685.html)                           |
| `skill.appliesEffect`, `stacksPerApplication`              | string / TEXT, integer / COUNT   | OFFICIAL   | 같은 지대의 Burn 부여를 한 번에 2스택으로 설명. [E05](https://www.oncehuman.game/m/news/update/20260311/40780_1290685.html)                                                |
| `skill.applicationIntervalSeconds`                         | number \| null / SECONDS         | OFFICIAL   | 위 Burn 부여 간격 3초. **Burn 피해 tick 간격과 다른 필드**다. [E05](https://www.oncehuman.game/m/news/update/20260311/40780_1290685.html)                                  |
| `team.capacity`                                            | integer \| null / COUNT          | OFFICIAL   | Deviation: Survive, Capture, Preserve의 팀 최대 3. 일반 시즌의 소환 슬롯 수로 옮기지 않음. [E08](https://www.oncehuman.game/news/update/20251029/40780_1267745.html)       |
| `instance.level`, `grade`, `traits`                        | integer / LEVEL, string[] / TEXT | UNVERIFIED | 현재 범위·등급별 수치·trait 전체 목록과 기존/융합 인스턴스 차이 미확보                                                                                                     |
| `deviantPowerCost`, `recovery`, `cooldown`, `skillRank`    | number \| null / 각 전용 단위    | UNVERIFIED | 전체 비용·회복·재사용 대기·레벨 스케일 표 없음. 모두 별도 근거 필요                                                                                                        |
| `snapshotPolicy`, `ownerScaling`, `canCrit`, `canWeakspot` | enum/boolean \| null             | UNVERIFIED | 플레이어 장비 상속, 소환/타격 시점 계산, 치명타·약점 허용 여부 미검증                                                                                                      |

## Ammo 필드 매트릭스

| 제안 필드                                              | 타입 / 단위                              | 근거 판정  | 확인 내용 / 제한                                                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caliberLabel`, `compatibleWeaponFamilies`             | string / TEXT, string[]                  | OFFICIAL   | v2.3.6에서 rifle/SMG/LMG가 medium-caliber ammunition을 함께 사용하는 조정 발표. 이는 개별 탄약 내부 ID·모든 무기 호환표가 아니다. [E02](https://www.oncehuman.game/news/update/20260408/40780_1295195.html)     |
| `antiTypeTargetLabel`                                  | string \| null / TEXT                    | OFFICIAL   | Suppression AP Ammo는 Deviants, Penetration AP Ammo는 humanoids에 효과적이라는 v1.4.4 설명. 현재 유지 여부·추가 피해량은 별도 미확인. [E06](https://www.oncehuman.game/news/update/20250326/40780_1222452.html) |
| `recipeVersion`, `recipeInputs`, `yieldCount`          | string / TEXT, record[], integer / COUNT | UNVERIFIED | 고급 탄약 제작식·산출량 변경 사실만 있고 완전한 현재 레시피 수치는 없음. [E02](https://www.oncehuman.game/news/update/20260408/40780_1295195.html)                                                              |
| `damageModifier`, `armorPenetration`, `statusModifier` | number \| null / PERCENT 또는 전용 단위  | UNVERIFIED | AP라는 이름만으로 장갑 관통 수식이나 모든 적 대상 배율을 부여하지 않음                                                                                                                                          |
| `projectileCount`, `velocity`, `retrievable`           | integer/number/boolean \| null           | UNVERIFIED | 탄약별 검증 필요. 무기 패치의 Bullet Velocity를 탄약 공통값으로 복사하지 않음                                                                                                                                   |
| `modeAvailability`, `legacyConversion`                 | rule[] \| null                           | UNVERIFIED | 일반 시즌·RaidZone·구형 탄약 변환을 분리할 계약은 필요하지만 전체 매핑은 미확보                                                                                                                                 |

## Food / Drink 필드 매트릭스

| 제안 필드                                             | 타입 / 단위                                  | 근거 판정                      | 확인 내용 / 제한                                                                                                                                                                                                       |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemCategory`, `restoresResourceLabel`               | string \| null / TEXT                        | OFFICIAL                       | v3.0.4에서 Sparkling Pumpkin Soup를 Energy 회복으로 정정. 회복량·현재 분류 전체표는 없음. [E01](https://www.oncehuman.game/news/update/20260824/40780_1312014.html)                                                    |
| `combatBuffException`                                 | boolean \| null / BOOLEAN                    | OFFICIAL                       | 같은 공지는 일반적으로 음식이 전투 스탯 버프를 제공하며 Whimsy Drink/Whimsical Drink를 예외로 명시. 모든 음료의 버프 없음으로 단정하지 않음. [E01](https://www.oncehuman.game/news/update/20260824/40780_1312014.html) |
| `effect.stat`, `magnitude`, `durationSeconds`         | string/number \| null / TEXT·PERCENT·SECONDS | UNVERIFIED                     | 위 두 음료의 구체적인 현재 스탯·효과량·시간은 이 공지에 없음                                                                                                                                                           |
| `foodEffectsLimit`, `drinkEffectsLimit`               | integer \| null / COUNT                      | OFFICIAL                       | v2.3.8 Chef의 Glutton 조건에서 각각 최대 2. 모든 클래스의 기본 한도를 2로 두지 않음. [E03](https://www.oncehuman.game/m/news/official/20260513/40779_1300125.html)                                                     |
| `recipeIdentity`, `optionalIngredientEffects`         | string/record[] \| null                      | OFFICIAL(존재), UNVERIFIED(표) | Chef의 재료 선택과 반복 섭취가 효과에 영향을 주는 문맥이 있음. 실제 재료별 수치·증가 규칙은 미확보. [E03](https://www.oncehuman.game/m/news/official/20260513/40779_1300125.html)                                      |
| `classRequirements`, `conflictGroup`, `overwriteRule` | rule[]/string/enum \| null                   | UNVERIFIED                     | 음식/음료·클래스·같은 요리 식별을 구분해야 하지만 교체/연장/누적 알고리즘은 미검증                                                                                                                                     |
| `energy`, `hydration`, `sanity`, `spoilSeconds`       | number \| null / 전용 resource 단위·SECONDS  | UNVERIFIED                     | 개별 레시피 수치와 부패·보관·냉장고·제작 강화 차이 미확보                                                                                                                                                              |
| `cookSuccess`, `potencyProgression`                   | enum/record \| null                          | UNVERIFIED                     | 성공 확률과 반복 섭취 수치 progression을 추정하지 않음                                                                                                                                                                 |

v2.3.6의 신규 Weapon DMG 음료는 이름과 수치가 공개되지 않은 해당 문장만 확인했다. 이 문장을 Whimsical Drink의 이름·효과량 근거로 연결하거나 가짜 아이템 레코드를 만들지 않았다. [E02](https://www.oncehuman.game/news/update/20260408/40780_1295195.html)

## Effect 필드 매트릭스 — 실행 규칙 구현 전 계약

| 제안 필드                                                              | 타입 / 단위                                   | 근거 판정             | 확인 내용 / 제한                                                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `sourceEntityId`, `targetScope`                                | string / TEXT                                 | OFFICIAL(명시 부분)   | non-RaidZone Ghost Link의 Overload가 대상 자신과 주변 대상을 피해 대상으로 설명. 적에게 적용된 상태를 플레이어 자해로 오독하지 않음. [E07](https://www.oncehuman.game/news/update/20260709/40780_1307147.html) |
| `durationSeconds`, `damageTickIntervalSeconds`                         | number \| null / SECONDS                      | OFFICIAL              | 같은 공지의 Overload는 5초 동안 매초 피해. 시작/종료 경계 tick 개수와 피해량은 미확인. [E07](https://www.oncehuman.game/news/update/20260709/40780_1307147.html)                                               |
| `triggerCondition`, `requiredStacks`                                   | string / TEXT, integer / COUNT                | OFFICIAL              | 해당 4-piece 효과는 Synchronize 10스택 상태에서 적 공격이라는 조건. 장비 구성·버전 조건 보존. [E07](https://www.oncehuman.game/news/update/20260709/40780_1307147.html)                                        |
| `applicationIntervalSeconds`, `stacksPerApplication`                   | number / SECONDS, integer / COUNT             | OFFICIAL(개별 효과)   | Invincible Sun의 부여 간격을 피해 간격과 분리하여 기록. 범용 Burn 규칙은 아님. [E05](https://www.oncehuman.game/m/news/update/20260311/40780_1290685.html)                                                     |
| `stackLimit`, `chancePercent`, `cooldownSeconds`, `radiusMeters`       | number \| null / COUNT·PERCENT·SECONDS·METERS | UNVERIFIED            | 각 효과·레벨·버전의 값 필요. 확률 미공개를 100%/0%로 대체하지 않음                                                                                                                                             |
| `damageChannel`, `element`, `scalingStatLabel`                         | string \| null / TEXT                         | UNVERIFIED(범용 매핑) | Weapon/Status/Elemental 명칭을 알아도 모든 효과의 채널·계수·기준 스탯은 확정되지 않음                                                                                                                          |
| `magnitude`, `operation`, `bucket`, `roundingPolicy`                   | number/enum \| null                           | UNVERIFIED            | 퍼센트/고정량·가산/곱산·적용 순서·반올림 규칙 미확보                                                                                                                                                           |
| `canCrit`, `canWeakspot`, `inheritsBonuses`                            | boolean/rule[] \| null                        | UNVERIFIED            | 공식 설명 없는 기본 true/false를 만들지 않음                                                                                                                                                                   |
| `refreshPolicy`, `consumePolicy`, `perTargetCooldown`, `ownerStackKey` | enum/rule[] \| null                           | UNVERIFIED            | 갱신/소모·같은 소유자/다른 소유자·다중 대상 처리 미검증                                                                                                                                                        |
| `snapshotPolicy`, `procAlgorithm`, `eventPriority`                     | enum \| null                                  | UNVERIFIED            | 스냅샷·연속 확률·동시 사건 순서 없음. Bernoulli 독립 시행으로 가정하지 않음                                                                                                                                    |

## 시나리오·패치 분리와 후속 검증

1. **같은 이름, 다른 문맥:** Deviation: Survive, Capture, Preserve의 스킬·팀 구조를 Endless Dream/Manibus의 일반 소환 규칙에 적용하지 않는다. 일반 공식 서버가 UNIZ의 대상이며 RaidZone/Custom Server는 별도 profile이 필요하다.
2. **탄약 카탈로그 갱신:** v2.3.6 전후 자료를 혼합하지 않는다. 탄약 종류 통합과 제작 변경 이후 최신 UI·현재 제작식 확인이 필요하다. [E02](https://www.oncehuman.game/news/update/20260408/40780_1295195.html)
3. **효과의 패치 버전:** Ghost Link는 7월 소개 이후 8월에도 3-piece 발동 조건이 조정됐다. 7월의 Overload 설명에 8월 수치나 현재 동작을 임의 결합하지 않는다. [E07](https://www.oncehuman.game/news/update/20260709/40780_1307147.html), [E01](https://www.oncehuman.game/news/update/20260824/40780_1312014.html)
4. **계산 차단 항목:** 기준 스탯 소유자, 공격·상태·원소 채널, 치명타/약점, 버킷, 방어·저항, snapshot, 효과 충돌, tick 경계가 검증되기 전에는 sample로 DPS를 산출하지 않는다.
5. **다음 수집:** 패치/시나리오/모드/클래스/Deviation 인스턴스 조건이 보이는 게임 내 툴팁과 허가된 실측을 받는다. 커뮤니티 수치는 별도 원자료와 재현성을 심사한 뒤에만 COMMUNITY VERIFIED로 기록한다. 이번 조사에서 이를 승인한 것으로 표시하지 않는다.

이 조사에서는 공식 웹페이지를 사람이 읽는 범위로 확인했으며, 카탈로그 scraping·비공개 API·게임 패킷/메모리 분석을 하지 않았다.

## 출처 등록부

모든 출처의 `checkedAt`은 **2026-10-06**이다. 날짜는 페이지 본문의 발행일을 사용하며, 패치가 모든 서버에 실제 적용된 시각을 뜻하지 않는다.

| ID  | 제목 / 공식 URL                                                                                                       | publishedAt | 사용 범위                                  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------ |
| E01 | [Version 3.0.4 Update Announcement (August 24)](https://www.oncehuman.game/news/update/20260824/40780_1312014.html)   | 2026-08-24  | 음식 정정, 음료 예외, Ghost Link 변경 이력 |
| E02 | [Version 2.3.6 Update Announcement (April 8)](https://www.oncehuman.game/news/update/20260408/40780_1295195.html)     | 2026-04-08  | 탄약 계열 통합, 이름 미공개 음료           |
| E03 | [Version 2.3.8 Update Announcement (May 13)](https://www.oncehuman.game/m/news/official/20260513/40779_1300125.html)  | 2026-05-13  | Chef / Glutton / 선택 재료 조건            |
| E04 | [Version 2.2.3 Update Announcement (December 10)](https://www.oncehuman.game/news/update/20251210/40780_1275885.html) | 2025-12-10  | Deviation:SCP Dr. Teddy 스킬               |
| E05 | [Version 2.3.4 Update Announcement (March 11)](https://www.oncehuman.game/m/news/update/20260311/40780_1290685.html)  | 2026-03-11  | Invincible Sun의 지대·Burn 부여 간격       |
| E06 | [ONCE HUMAN VERSION 1.4.4 UPDATE ANNOUNCEMENT](https://www.oncehuman.game/news/update/20250326/40780_1222452.html)    | 2025-03-26  | Anti-Type 탄약 이름과 대상                 |
| E07 | [Version 3.0.1 Update Announcement (July 9)](https://www.oncehuman.game/news/update/20260709/40780_1307147.html)      | 2026-07-09  | non-RaidZone Ghost Link / Overload         |
| E08 | [Version 2.2.0 Update Announcement (October 29)](https://www.oncehuman.game/news/update/20251029/40780_1267745.html)  | 2025-10-29  | Deviation:SCP 팀 구조                      |

기계가 읽는 근거 표본은 `packages/build-engine/data/effects-evidence.json`에 있다. 파일의 sample ID와 path는 UNIZ의 개념적 식별자이며 게임 내부 키가 아니다.
