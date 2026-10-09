import { FeaturePage } from "@/components/feature-page";
export default function ComparePage() {
  return (
    <FeaturePage
      eyebrow="BUILD COMPARE"
      title="빌드의 차이를 명확하게"
      description="검증된 데이터가 준비되면 버전별 스탯과 구성을 비교할 수 있습니다."
      features={["버전 비교", "출처 표시", "검증된 스탯"]}
      detail
    />
  );
}
