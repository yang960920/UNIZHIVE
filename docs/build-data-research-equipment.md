# BUILD LAB DATA SPECIFICATION v0.1 — 장비 근거 조사

조사일: **2026-10-06, Asia/Seoul**. 범위는 Weapon, Armor, Mods, Calibration, Cradle Override의 필드 초안과 공식 근거 샘플이다. 모든 숫자는 발표 당시의 역사적 근거이며 **현재 게임의 기본 능력치로 채택하지 않는다**. 웹, Planner, Stat Engine, Simulator, DB migration은 변경하지 않았다.

공식 웹사이트의 공개 가이드·개발 블로그·패치 공지만 읽었다. 외부 DB 복제, 스크래핑, 비공개 API, 패킷·메모리 조사와 피해 공식 역산은 수행하지 않았다. 검색에 등장한 일반 게임 매체와 커뮤니티 내용은 확정 근거에서 제외했다.

## 필드별 출처와 현재성

`OFFICIAL`은 공식 문서가 해당 이름·효과·표시값을 뒷받침한다는 뜻이다. 출시 전 시험 제안도 공식 발표이지만 적용된 수치라는 뜻은 아니다. `COMMUNITY VERIFIED`는 조건·반복 측정·원자료가 검증된 커뮤니티 근거에만 사용한다. 이번 조사에는 해당 레코드가 없다. 미확인 값은 `null / UNVERIFIED`이며 추정값도 생성하지 않아 `ESTIMATED` 레코드는 없다.

필드명은 **UNIZ가 제안하는 계약**이다. 공식 내부 API/게임 파일 필드명이나 공식 ID가 아니다. JSON의 모든 `currentValidity`는 `UNVERIFIED`다. `sourceIds`는 아래 등록부와 연결되며, `patchContext`와 `scenarioContext` 없이 숫자만 떼어 사용할 수 없다. 퍼센트 표시값 50%는 `50`으로 기록한다. `[min,max]`는 포함 범위다. 표시된 +20%를 +20 퍼센트포인트나 전체 DPS +20%로 바꾸지 않는다.

단위가 없는 숫자 표시값은 `unit: UNSPECIFIED`로 보존하며 계산에 사용할 수 없다. 이름과 숫자의 공식 근거가 있어도 계산 단위와 적용 조건이 확인되어야 한다.

## 공통 계약 초안

| 제안 필드                         | 타입 / 단위        | 근거 상태와 현재 확인 범위                             | 미확인 사항                             |
| --------------------------------- | ------------------ | ------------------------------------------------------ | --------------------------------------- |
| `id`                              | string / 로컬 ID   | UNVERIFIED: UNIZ 내부 식별자                           | 공식 게임 ID와 동일시 금지              |
| `name`, `localizedNames`          | string, map / TEXT | OFFICIAL: 공개 영문 이름만 해당 sourceIds로 확인       | 한국어명·이름 변경·번역 별칭            |
| `patchContext`, `scenarioContext` | string / TEXT      | 공식 공지 버전·모드 범위를 기록                        | 모드/플랫폼 전체에 공통이라는 가정 금지 |
| `fields[].status`, `sourceIds`    | enum, string[]     | OFFICIAL / COMMUNITY VERIFIED / UNVERIFIED / ESTIMATED | 문서 출처와 현재 적용 여부는 별개       |
| `currentValidity`, `checkedAt`    | enum, ISO date     | 전체 샘플 UNVERIFIED, 확인일 2026-10-06                | 후속 수정 공지와 현재 게임 UI 대조      |

## Weapon

| 제안 필드                                               | 타입 / 단위                         | 공식 근거가 뒷받침하는 것                                                                                                                 | 상태 / 제한                                                |
| ------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `equipSlot`                                             | string / TEXT                       | 주무기·보조·근접 구분 [EQ01](https://www.oncehuman.game/wiki/20240516/37492_1155622.html)                                                 | OFFICIAL 역사적 구조; 현재 예외 미확인                     |
| `weaponType`                                            | string / TEXT                       | 장비 분류 가이드와 특정 EBR 계열의 저격총 분류 [EQ08](https://www.oncehuman.game/banner/20260226/41906_1288020.html)                      | OFFICIAL 해당 이름의 분류; 닫힌 enum 개수 미확정           |
| `tier`, `blueprintStars`                                | integer / LEVEL                     | 제작 티어 선택과 파편 기반 블루프린트 개선 [EQ01](https://www.oncehuman.game/wiki/20240516/37492_1155622.html)                            | 개념 OFFICIAL; 최대 티어·별·상승 곡선 UNVERIFIED           |
| `baseDamage`, `magazineCapacity`, `fireRate`            | number / DAMAGE, COUNT, UNSPECIFIED | Nail Gun의 당시 RaidZone 표가 피해·탄수·발사속도 표시값을 제시 [EQ10](https://www.oncehuman.game/news/update/20250924/40780_1261275.html) | OFFICIAL 역사적 표시값; 발사속도 단위가 없어 RPM 확정 금지 |
| `damageClass`, `element`, `keyword`                     | string / TEXT                       | 충전 상태 Additional Rules의 피해 분류가 2.3.3에서 Status로 변경 [EQ08](https://www.oncehuman.game/banner/20260226/41906_1288020.html)    | OFFICIAL 당시 변경; 키워드와 피해 분류를 별도 보관         |
| `procChance`, `cooldown`, `duration`                    | number / PERCENT, SECONDS           | 소개마다 일부 조건만 기재                                                                                                                 | 미기재 값 UNVERIFIED; 확률을 임의 채우지 않음              |
| `attackCoefficient`, `critEligible`, `weakspotEligible` | number, boolean / PERCENT, BOOLEAN  | 2월 시험 표와 후속 변경 방향 [EQ07](https://www.oncehuman.game/news/devBlog/20260212/40781_1287008.html)                                  | 시험 제안은 OFFICIAL 역사적 값; 피해 계산 순서 UNVERIFIED  |

공식 2024 가이드는 무기 종류가 아홉이라고 쓰면서 본문 열거 수는 여덟이다. 따라서 해당 문장을 최신 전체 taxonomy의 개수 제한으로 채택하지 않는다. [EQ01](https://www.oncehuman.game/wiki/20240516/37492_1155622.html)

## Armor

| 제안 필드                           | 타입 / 단위                       | 공식 근거가 뒷받침하는 것                                                                                                    | 상태 / 제한                                              |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `slot`                              | string / TEXT                     | Helmet, Mask, Tops, Bottoms, Gloves, Shoes의 역사적 분류 [EQ01](https://www.oncehuman.game/wiki/20240516/37492_1155622.html) | OFFICIAL 구조; 이름만 보고 개별 장비 슬롯 자동 확정 금지 |
| `baseHp`, `psiIntensity`, `defense` | number / HP, 별도 스탯 단위       | 제작 재료가 HP/Psi Intensity에 영향을 줄 수 있음 [EQ04](https://www.oncehuman.game/news/devBlog/20260113/40781_1281545.html) | 기본값·티어/별/재료별 분해 UNVERIFIED                    |
| `setId`, `requiredPieces`           | string, integer / COUNT           | 세트 효과는 조각 수 조건을 가짐                                                                                              | OFFICIAL 개념; 공식 set ID는 없음                        |
| `effectConditions`, `effectValues`  | 조건 목록, 표시값 / TEXT, PERCENT | Treacherous Tides 최종 2·3조각 표 [EQ13](https://www.oncehuman.game/news/devBlog/20260916/40781_1314019.html)                | OFFICIAL 해당 패치; 경계값 사이의 보간·중첩 UNVERIFIED   |
| `keyEffect`, `critScope`            | string / TEXT                     | Gilded Gauntlets가 Burn 치명타를 허용 [EQ06](https://www.oncehuman.game/news/devBlog/20260116/40781_1282292.html)            | OFFICIAL 소개; 2월 추가 숫자는 시험 제안 구분 필요       |

## Mods

| 제안 필드                      | 타입 / 단위                    | 공식 근거가 뒷받침하는 것                                                                                                                                                                                 | 상태 / 제한                                               |
| ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `systemGeneration`             | LEGACY / FIELD_GUIDE / UNKNOWN | 기존 모드와 신형 모드가 공존 [EQ05](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html)                                                                                                 | OFFICIAL 당시 전환; 같은 이름을 같은 레코드로 합치지 않음 |
| `level`, `subAttributeLevels`  | integer, integer[] / LEVEL     | 발표는 1–17 및 고정 부옵션 네 개를 설명 [EQ03](https://www.oncehuman.game/news/devBlog/20251212/40781_1276354.html)                                                                                       | OFFICIAL 설계; 현재 cap·각 모드 세부값 UNVERIFIED         |
| `mainEffect`, `slot`, `suffix` | string / TEXT                  | Against All Odds의 변경 설명과 업데이트 이름 확인 [EQ09](https://www.oncehuman.game/news/devBlog/20250922/40781_1260687.html), [EQ10](https://www.oncehuman.game/news/update/20250924/40780_1261275.html) | OFFICIAL 정성 효과; 최신 슬롯·숫자 UNVERIFIED             |
| `subAttributes`, `isShiny`     | 근거 필드 목록, boolean        | 신형 고정 부옵션 및 Shiny 구분 소개 [EQ03](https://www.oncehuman.game/news/devBlog/20251212/40781_1276354.html)                                                                                           | 개념 OFFICIAL; Shiny 전체 대상/수치표 UNVERIFIED          |
| `enhancementHistory`           | 레거시 전용 기록               | 신형과 레거시 강화 흐름을 분리해야 함                                                                                                                                                                     | 최신 개별 규칙 재확인 전 범용 강화 버튼 계약 금지         |

## Calibration

| 제안 필드                                 | 타입 / 단위                      | 공식 근거가 뒷받침하는 것                                                                                                                  | 상태 / 제한                                          |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `systemGeneration`                        | LEGACY / CRAFTING_2026 / UNKNOWN | 2.3.1에서 무기 작업대 교정·교체 제거, 제작 시 블루프린트 적용 [EQ05](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html) | OFFICIAL 전환; 기존 교정 무기 보존과 신규 제작 분리  |
| `legacyCalibrationLevel`                  | nullable integer / LEVEL         | 예전 개선 시스템의 존재만 확인                                                                                                             | 최대 +10을 기본값으로 두지 않음; 상한 UNVERIFIED     |
| `style`, `rarity`                         | string / TEXT                    | 신규 교정 블루프린트는 스타일 유지 [EQ04](https://www.oncehuman.game/news/devBlog/20260113/40781_1281545.html)                             | OFFICIAL 개념; 모든 스타일·희귀도 enum과 값 미확인   |
| `attackBonusRange`, `secondaryBonusRange` | number[2] / PERCENT              | Legendary 예시 Attack 33–50%, Elemental 15–20% [EQ05](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html)                | OFFICIAL 예시; 전체 범위 표로 일반화 금지            |
| `reloadEfficiencyBonus`                   | number / PERCENT                 | Rapid-Shot의 공식 예시 +15% [EQ05](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html)                                   | OFFICIAL 예시; +15%를 재장전 시간 -15%로 바꾸지 않음 |

1월 공지의 재장전 예시는 AWS.338 - Bullseye에 한정된다. 3.16초를 다른 무기의 시간으로 복사하거나 숫자 하나에서 재장전 공식을 만들지 않는다. 보상에서 특정 시나리오를 제외했다는 문구를 기능 적용 제외로 해석하지 않는다. [EQ05](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html)

## Cradle Override

| 제안 필드                                       | 타입 / 단위                        | 공식 근거가 뒷받침하는 것                                                                                                            | 상태 / 제한                                            |
| ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `maxUnlockedNodes`                              | integer / COUNT                    | 2024 가이드 최대 8노드 [EQ02](https://www.oncehuman.game/wiki/20240520/37492_1156112.html)                                           | OFFICIAL 역사적 값; 최신 공통 UI 8칸 고정 계약 아님    |
| `availability`                                  | 패치·시나리오·태그 목록            | 시즌별 변경 및 일부 Super Anomaly 관련 노드 제거 [EQ11](https://www.oncehuman.game/news/update/20260325/40780_1292938.html)          | OFFICIAL 변경; 전체 선택 풀 UNVERIFIED                 |
| `replaces`, `conditions`, `targetScope`         | string / TEXT                      | Shield Protection의 교체명·보호막 조건·Deviant 대상 효과 [EQ09](https://www.oncehuman.game/news/devBlog/20250922/40781_1260687.html) | OFFICIAL 발표; 정확한 임계값·현재 가용성 UNVERIFIED    |
| `magnitude`, `duration`, `cooldown`, `stacking` | nullable number / PERCENT, SECONDS | 본문에 수치가 없으면 비워 둠                                                                                                         | UNVERIFIED; 수치가 없는 조건은 계산 가능한 효과가 아님 |

## 서로 다른 버전의 근거를 합치지 않는 사례

- **교정:** 2024 가이드의 재료 기반 개선을 2026 제작 시스템에 덮어쓰지 않는다.
- **모드:** 레거시 랜덤 롤과 신형 고정 부옵션은 구분이 필요하다.
- **방어구:** 9월 10일 Treacherous Tides 시험 제안 2조각 10%는 최종 9월 16일 공지의 12%와 다르다. 최종 공지의 3조각 경계는 8–28%다. [EQ12](https://www.oncehuman.game/news/devBlog/20260910/40781_1313572.html), [EQ13](https://www.oncehuman.game/news/devBlog/20260916/40781_1314019.html)
- **Cradle:** 2026년 3월 특정 노드 제거를 전체 Cradle 제거로 확대 해석하지 않는다.
- **최신성:** 9월 28일 3.0.7 공지를 함께 확인했으나 해당 항목이 없다는 사실은 10월 6일 전 모드에서 값이 동일하다는 증거가 아니다. [EQ14](https://www.oncehuman.game/news/update/20260924/40780_1315053.html)

## 근거 데이터와 공백

`packages/build-engine/data/equipment-evidence.json`은 11개 소규모 역사적 샘플이다. 세 종류의 무기, 방어구 두 종류, 모드·교정·Cradle의 이름 및 시스템 근거를 담는다. 공식 명칭을 확인한 이름만 사용했고, 모든 표기 이름은 별도 `name` 필드의 `sourceIds`로 연결했다. 시스템 근거 레코드는 아이템 카탈로그와 혼동하지 않도록 notes에 표시했다. 실행 엔진은 이 JSON을 읽어 능력치를 계산하지 않는다.

현재 채워야 할 공백은 시나리오별 최신 아이템 명단, 공식/게임 UI 식별자, 한국어명, 별·티어·제작 조건이 고정된 기본값, 신형/레거시 상세 부옵션, 교정 스타일 전체 표, Cradle 가용 풀이다. 출처가 없는 확률·임계값·지속시간·보간·중첩을 0이나 기본값으로 대체하지 않는다. `null`은 미확인이고 `0`은 검증된 실제 값이다.

## 공식 출처 등록부

표시된 문서 발행일을 사용했다. URL 경로 날짜와 발행일이 다를 수 있으며, 패치 적용일(PT)과 한국 날짜(KST)도 다르다. 이번 조사에서는 확인일만 KST 기준으로 통일하고 공지의 적용일 표기를 유지했다.

| ID   | 공식 제목 / URL                                                                                                                             | 발행일     | 확인일     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| EQ01 | [Weapon & Gear Guide](https://www.oncehuman.game/wiki/20240516/37492_1155622.html)                                                          | 2024-05-16 | 2026-10-06 |
| EQ02 | [Memetic & Cradle Guide](https://www.oncehuman.game/wiki/20240520/37492_1156112.html)                                                       | 2024-05-21 | 2026-10-06 |
| EQ03 | [Dev Blog \| Mod System Overhaul and Compensation Plan](https://www.oncehuman.game/news/devBlog/20251212/40781_1276354.html)                | 2025-12-12 | 2026-10-06 |
| EQ04 | [Dev Blog丨Comprehensive Optimization of Calibration & Accessories](https://www.oncehuman.game/news/devBlog/20260113/40781_1281545.html)    | 2026-01-13 | 2026-10-06 |
| EQ05 | [Version 2.3.1 Update Announcement (January 21)](https://www.oncehuman.game/m/news/update/20260121/40780_1282991.html)                      | 2026-01-21 | 2026-10-06 |
| EQ06 | [Dev Blog丨New Combat Weapons, Armor, Sets, and Mods Coming Soon](https://www.oncehuman.game/news/devBlog/20260116/40781_1282292.html)      | 2026-01-17 | 2026-10-06 |
| EQ07 | [Dev Blog \| Feb. Combat Balance Adjustments](https://www.oncehuman.game/news/devBlog/20260212/40781_1287008.html)                          | 2026-02-23 | 2026-10-06 |
| EQ08 | [Version 2.3.3 Update Announcement (February 25)](https://www.oncehuman.game/banner/20260226/41906_1288020.html)                            | 2026-02-25 | 2026-10-06 |
| EQ09 | [Dev Blog \| New Weapons and Combat Balance Adjustments for September](https://www.oncehuman.game/news/devBlog/20250922/40781_1260687.html) | 2025-09-22 | 2026-10-06 |
| EQ10 | [Version 2.1.4 Update Announcement (September 24)](https://www.oncehuman.game/news/update/20250924/40780_1261275.html)                      | 2025-09-24 | 2026-10-06 |
| EQ11 | [Version 2.3.5 Update Announcement (March 25)](https://www.oncehuman.game/news/update/20260325/40780_1292938.html)                          | 2026-03-25 | 2026-10-06 |
| EQ12 | [Dev Blog \| September Combat Balance Adjustment](https://www.oncehuman.game/news/devBlog/20260910/40781_1313572.html)                      | 2026-09-10 | 2026-10-06 |
| EQ13 | [Version 3.0.6 Update Announcement (September 16)](https://www.oncehuman.game/news/devBlog/20260916/40781_1314019.html)                     | 2026-09-16 | 2026-10-06 |
| EQ14 | [Version 3.0.7 Update Announcement (September 28)](https://www.oncehuman.game/news/update/20260924/40780_1315053.html)                      | 2026-09-28 | 2026-10-06 |

직접 인용문은 넣지 않았다. 각 문서의 근거를 필요한 이름·표시값·변경 방향으로 요약했으며, 자료 원문이나 이미지 전체를 복제하지 않았다.
