# Build Lab

2026-10-07 기준 신규 **Build Planner V2**는 게임 장비창 형태의 슬롯·원본 아이콘·선택 모달로 구성을 기록한다. 3D 렌더링은 없으며 기존 V1의 직접 입력 화면과 저장본을 유지한다. `/lab`은 실제 빌드 목록, `/lab/new`는 신규 V2 입력, `/lab/b/[id]`는 버전 상세, `/lab/b/[id]/edit`는 선택한 기록의 형식으로 새 버전을 만드는 화면이다. 고정 버전 링크·공개 범위·구성표 복사를 지원한다. Compare, Static Stats, Damage Pipeline, Event-driven Combat Simulator, Community Tested DPS는 후속 단계다. 상세 입력·접근 계약은 [Build Planner](build-planner.md)에 있다.

V2는 주·보조·근접 무기, 방어구 6부위, 전투 감염물과 크래들 8칸을 제공한다. 무기 부속품·탄약·신규 모듈을 연결하고 모듈 접미사·레벨, 감염물 개체 등급·특성을 별도로 기록한다. 추천도 1~5점·추천 콘텐츠·태그·메모는 사용자의 추천 기록이며 실제 장비 등급이나 계산 결과가 아니다.

## Build와 BuildVersion

`Build`는 identity, ownership, title, description, visibility 같은 메타데이터다. 실제 Loadout은 `BuildVersion`의 immutable snapshot에 저장한다.

```text
Build
  ├─ BuildVersion v1
  ├─ BuildVersion v2
  └─ BuildVersion v3
```

저장하면 기존 버전 행을 덮어쓰지 않고 새 버전을 추가한다. 공유 authorization gate와 사용자 공유 잠금으로 역할·가입 상태의 배타 변경을 조정하고, 해당 Build 한 행의 수정 잠금과 `(build_id, version)` unique constraint로 번호 충돌을 다룬다. `expectedUpdatedAt`으로 다른 창의 선행 저장을 감지한다. 초기 migration의 PostgreSQL trigger는 버전 행 수정·삭제를 거부한다. 보관은 `Build.archivedAt`으로 처리하고, 승인된 작성자만 과거 기록을 읽고 복원할 수 있다. 공개 범위·제목·설명은 Build 단위로 모든 버전에 적용된다. UI 입력은 저장 전까지 컴포넌트에만 있으며 별도 클라우드 초안은 없다.

목록은 내 빌드·하이브 공유·전체 공개를 각각 9개씩 keyset cursor로 조회하며 공개 범위와 현재 승인 역할을 필터한다. 검색은 제목·설명과 최신 V2의 추천 콘텐츠·태그·추천 메모만 확인한다. 상세는 선택한 snapshot 하나와 버전 메타데이터 20개를 조회한다. 다음 페이지 판단을 위한 추가 1개 이외에 전체 버전의 장비 JSON을 불러오지 않는다.

Community Post는 향후 `buildVersionId`를 참조한다. Post에 v3을 연결한 뒤 원본 빌드에 v4가 생겨도 Post는 v3을 계속 참조한다. 최신 빌드 링크와 고정된 버전 공유 링크는 구분한다. Compare와 Simulator도 정확한 BuildVersion과 engine/data/benchmark 버전을 결과에 기록해야 한다.

Planner는 `uniz-gear.v2`와 기존 `uniz-planner.v1`을 별도 계약으로 읽고 저장한다. V2는 장비 종류·슬롯·현재 목록 ID·확인된 부속품 호환·신규 모듈·접미사·개체 특성을 검사하고 선택한 이름을 버전에 고정한다. V1은 현재 참고 항목의 ID·SHA-256 revision·분류·이름을 확인한다. 과거 snapshot은 구조를 검증해 당시 ID·이름·reference를 보존하고 자동 변환하지 않는다. 지원하지 않는 schemaVersion은 원본을 유지하고 안전한 안내를 표시한다. UID·token·raw JSON을 공개 응답에 넣지 않는다.

## V2 선별 목록과 미확인 조건

V2 장비 목록은 공식 자료·사용자 게임 캡처·개별 커뮤니티 자료를 대조한 이름·부위·연결 관계만 선별한다. 실재 여부나 슬롯 근거가 없는 장비, 확인되지 않은 부속품 호환 관계를 임의로 추가하지 않는다. 원본 아이콘·희귀도·옵션 수치가 미확인이면 빈 상태로 유지한다. 신규 모듈의 확인된 고정 옵션 이름을 보여주되 캡처의 특정 레벨 수치를 다른 레벨에 적용하거나 합산하지 않는다. 모든 장비·최신 패치·시나리오별 능력치를 완성한 카탈로그는 아니다.

크래들의 시나리오별 가용 여부와 캐릭터 해금 조건은 미확인이다. 시나리오 목록이 비어 있는 항목은 구성 기록으로 저장할 수 있으며 전 시나리오에서 사용 가능하다는 뜻이 아니다. 8칸도 제공된 화면을 따른 기록 위치다. 편집·선택·저장 구성표와 복사 결과에서 이 제한을 안내한다. 저장된 선택을 게임에서 장착할 수 있다는 보증으로 해석하지 않는다.

## 데이터 사양 v0.1

Weapon, Armor, Mods, Calibration, Cradle Override, Deviation, Ammo, Food, Drink, Effect, Target Profile, Benchmark Profile의 필드 계약을 작성하고 공개 공식 자료를 조사했다. 자세한 정의와 미확인 범위는 [Data Specification v0.1](build-data-spec-v0.1.md), [장비 조사](build-data-research-equipment.md), [효과 조사](build-data-research-effects.md)에 있다. 현재 패치 전체 카탈로그를 완성한 것은 아니며 표본의 현재 적용은 검증 대기다.

| 출처 상태            | 의미                           |
| -------------------- | ------------------------------ |
| `OFFICIAL`           | 확인된 공식 자료               |
| `COMMUNITY VERIFIED` | 재현 가능한 커뮤니티 실측      |
| `UNVERIFIED`         | 검증 전 자료                   |
| `ESTIMATED`          | 가정과 오차 범위를 명시한 추정 |

수집 출처, 게임 버전, 확인 날짜와 실측 조건을 유지한다. 공개되지 않은 API, 게임 패킷·메모리 분석이나 OnceHumanDB scraping으로 데이터를 얻지 않는다. Steam 연결로 Once Human 캐릭터의 장착 장비를 조회할 수 있다고 가정하지 않는다.

기존 V1은 역사적 공식 근거 21개 중 개별 장비 12개만 참고 항목으로 사용한다. 현재 패치 적용은 모두 `UNVERIFIED`다. 직접 입력한 값·호환성도 검증된 게임 규칙으로 취급하지 않는다. 두 형식 모두 모르는 숫자는 `null`이다. V1은 입력한 0을 보존하며 V2의 레벨·개체 등급은 양의 정수만 받는다. 저장 범위를 게임의 정확한 최대 수치로 주장하지 않는다.

다음 단계는 현재 패치의 스탯·effect/target·stacking/rounding 근거를 검증한 뒤 Static Stat Engine → Damage Pipeline → Event Driven Simulator → Community Validation 순서다. `packages/build-engine`은 Next.js, React, DB와 독립된 브라우저용 TypeScript/Zod 계약을 유지한다. V2까지 기존 Build 테이블을 사용하여 추가 migration이 필요하지 않았다. 정적 스탯 집계·전투 이벤트·피해 공식은 구현하지 않았다. 명령별 최신 검증 결과는 [Planner 검증 기록](verification-build-planner.md)에 별도로 기록한다.
