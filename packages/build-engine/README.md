# UNIZ Build Engine

현재 상태: **Data Specification v0.1 + Planner V1/V2**. 이 패키지는 Next.js, React, UI, DB, Discord에 의존하지 않는 TypeScript 패키지다. 필드 계약과 Zod 기반 근거 검증기, 공식 자료의 역사적 표본 21개와 브라우저에서도 사용하는 Planner 입력 계약을 제공한다. 장비 기록에 필요한 확인된 명칭·아이콘·적용 범위를 제공하며 현재 패치의 계산 가능한 전체 스탯 카탈로그, 피해 공식, DPS, 전투 이벤트는 구현하지 않았다.

향후 파이프라인:

```text
Game Data
  → Stat Aggregation
  → Damage Pipeline
  → Event Driven Simulator
  → Community Validation
```

| 폴더             | 향후 책임                                     |
| ---------------- | --------------------------------------------- |
| `src/model`      | 검증된 게임 데이터와 버전 있는 입력·출력 계약 |
| `src/stats`      | 장비·효과의 정적 능력치 집계                  |
| `src/effects`    | 출처와 조건이 명확한 효과 모델                |
| `src/simulator`  | 결정적 이벤트 시뮬레이션, 시간 및 난수 주입   |
| `src/validation` | 입력 검증과 커뮤니티 실측 비교                |
| `tests`          | 확정된 규칙에 대한 회귀·재현성 검증           |

Data Specification v0.1은 [문서](../../docs/build-data-spec-v0.1.md)에 있다. 출처 등급은 `OFFICIAL`, `COMMUNITY VERIFIED`, `UNVERIFIED`, `ESTIMATED`다. 현재 공식 근거 표본도 발표 당시의 자료이며 모든 `currentValidity`는 `UNVERIFIED`다. `null`을 0으로 바꾸지 않으며 `UNSPECIFIED` 단위의 표시 숫자를 계산에 사용하지 않는다.

`pnpm data:verify`는 각 catalog의 날짜·source 참조·값/단위·등급 구조를 검사한다. `parseEvidenceCatalog(input, reviewedAsOf)`는 명시적인 검토 기준일을 받아 검증하며 clock은 CLI 호출자가 제공한다. 파일/네트워크/DB 접근은 모델에 없다. 전체 테스트는 `pnpm test`로 실행한다. COMMUNITY VERIFIED와 ESTIMATED 실데이터는 아직 없고, 실제 Benchmark 측정값도 없다.

`PlannerLoadout`은 `uniz-planner.v1` 계약이다. `createEmptyPlannerLoadout()`으로 빈 구성을 만들고 `parsePlannerLoadout(input)`으로 새 저장을 검증한다. `plannerLoadoutSchema`는 과거 snapshot의 구조를 읽는 경계다. `PLANNER_REFERENCE_CATALOG`의 12개 ITEM 참고 항목은 ID·이름·분류·SHA-256 revision을 고정하며 현재 적용은 미확인이다. 해시는 사전 생성하고 테스트에서 원래 근거와 일치를 검증한다. 상세한 입력 한계·버전·권한은 [Planner 문서](../../docs/build-planner.md)를 참조한다.

`PlannerGearLoadout`은 `uniz-gear.v2` 계약이다. `createEmptyGearLoadout()`과 `createGearSelection()`은 실제 보유 레벨·감염물 등급·특성·추천 점수를 만들지 않는다. `parseGearLoadout()`은 새 저장의 슬롯·아이템·정확한 적용 범위·접미사·확인된 특성 연결을 검증한다. `parseVersionedPlannerSnapshot(version, input)`은 V1과 V2의 과거 구조를 읽으며 저장된 `catalogNames`를 보존한다. 입출력 계약에 인증·소유자·UID·DB 필드를 넣지 않는다.

2026-10-07 장비 목록에는 신규 선택용 무기 85개, 방어구 181개, 신판 모듈 1,662변형, 전투 감염물 23개, 현대 크래들 25개가 있다. 모듈은 일반/섬광과 고정 접미사가 다른 ID를 갖고 `moduleShiny`·`moduleSuffixId`로 구분한다. 스탯이나 최고 보유 레벨을 합성하지 않는다. 근접 arm9와 일반 총기 적용 목록 밖의 arm11을 같은 무기 범위로 확장하지 않으며, 방어구 모듈은 원본 부위 코드 21/22/23/24/25/27에 연결한다.

전체 목록 2,079개에는 접미사 32개, 전투 특성 62개, 기존에 확인된 부속품 3개와 P90에 정확히 연결된 탄약 1개, 저장 호환용 항목도 포함한다. 기존 저장 ID 29개를 모두 보존한다. `legacyOnly` 5개는 새 선택 목록에서 숨기지만 기존 구성은 다시 저장할 수 있다. 전투 특성은 명시적 base→skin→trait 연결 60건과 사용자 나비 캡처 3개 특성에 한정하며, 공용 type 코드만으로 모든 감염물에 허용하지 않는다. 특성 그림은 `deviation_type_data.icon`의 공유 분류 그림이다. 나비의 이전 오표기는 `correctedNames`로 별도 기록하며 유효한 검색 별칭에 포함하지 않는다.

25개 크래들은 로컬 설정의 season_no 6001/6002 명시 참조를 따른 기록 옵션이다. 현재 세계의 사용·해제 조건과 전역 최신 핫픽스 적용은 미확인이다. 공개 설계도와 정확한 item/equip 연결을 선별했고, 디버그 방어구 2개·확인되지 않은 MK14/TEC9 기본형·내부/미션/투기장 감염물 레코드를 일괄 가져오지 않는다. 전체 7,709개 원시 장비 기록과 레거시 모듈 데이터는 허용 목록으로 사용하지 않는다. 현재 획득 가능 여부는 목록 전체에서 미확인으로 유지한다.

원본 아이콘은 343개 고유 key를 기준으로 정적 PNG에 연결하며 공유 그림을 아이템별 고유 그림으로 주장하지 않는다. 기존 아이콘 원본 기록은 `data/gear-asset-provenance.json`, 확장 기록은 `data/expanded-gear-asset-provenance.json`에 있다. `tests/gear-catalog.test.ts`와 `tests/catalog-expansion.test.ts`가 ID·참조·범위·저장 호환과 실제 PNG의 해시·치수·투명도 변환 근거를 확인한다. 정적 수집은 [오프라인 생성 스크립트](../../artifacts/research-2026-10-07/ingestion/build-curated-catalog.mjs)와 [선별·제외 기록](../../artifacts/research-2026-10-07/ingestion/catalog-ingestion-manifest.json)에 남긴다. 모델과 검증기의 실행 시점에는 파일·네트워크·게임 설치 경로를 읽지 않는다.

다음 개발 순서는 Static Stat Engine, Damage Pipeline, Simulator, Community Validation이다. 실제 계산에 앞서 현재 패치의 스탯·effect/target 조건과 stacking/rounding 근거를 확인해야 한다.

향후 검토할 이벤트 이름은 `Fire`, `Hit`, `Crit`, `Weakspot`, `Proc`, `StatusApply`, `StatusTick`, `ReloadStart`, `ReloadEnd`, `BuffExpire`다. 이번 단계에 이벤트 클래스나 피해 계산기를 추가하지 않는다.

입력 데이터와 엔진 버전을 결과에 기록하여 재현성을 확보한다. Discord Bot은 이 패키지를 직접 사용할 수 있으며, DB 저장과 UI 표시 및 외부 API 접근은 호출자 책임이다.
