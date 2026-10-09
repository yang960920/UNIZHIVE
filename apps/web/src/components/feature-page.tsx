import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Badge, EmptyState, PageHeader } from "@uniz/ui";
import { Logo } from "./logo";

export function FeaturePage({
  eyebrow,
  title,
  description,
  features,
  detail = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  detail?: boolean;
}) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={<Badge>COMING NEXT</Badge>}
      />
      <div className="feature-shell">
        <div className="shell-features">
          {features.map((feature) => (
            <Badge key={feature}>{feature}</Badge>
          ))}
        </div>
        <EmptyState
          title="다음 이야기를 준비하고 있습니다"
          description="시즌과 하이브 운영의 기반을 먼저 다듬고 있습니다. 이 공간은 다음 개발 단계에서 열립니다."
          action={
            <Link href={detail ? "/" : "/season"} className="button">
              <ArrowUpRight size={15} />
              {detail ? "대시보드로 돌아가기" : "현재 시즌 확인하기"}
            </Link>
          }
        />
      </div>
      <div className="shell-phase">
        <span>시즌이 바뀌어도, 우리의 기록은 계속됩니다.</span>
        <span className="mono">PHASE 0 · FOUNDATION</span>
      </div>
    </>
  );
}
export function MemberAccessRequired() {
  return (
    <>
      <PageHeader
        eyebrow="HIVE MEMBERS"
        title="함께하는 사람들"
        description="UNIZ의 승인된 멤버에게 공개되는 공간입니다."
      />
      <div className="feature-shell">
        <EmptyState
          title="하이브 멤버로 로그인해 주세요"
          description="Discord로 로그인하고 프로필을 등록한 뒤 운영진의 승인을 받으면 멤버 목록과 프로필을 확인할 수 있습니다."
          action={
            <Link className="button button-primary" href="/login">
              로그인하기 <ArrowUpRight size={15} />
            </Link>
          }
        />
      </div>
    </>
  );
}
export function AboutContent() {
  return (
    <>
      <PageHeader
        eyebrow="ABOUT UNIZ HIVE"
        title="시즌이 바뀌어도, 하이브는 남는다."
        description="Once Human 공식 서버에서 함께 다음 시즌으로 이동하는 한국 하이브."
      />
      <div className="about-panel panel">
        <Logo variant="detail" size="lg" />
        <div>
          <Badge tone="primary">ONE HIVE · MANY SEASONS</Badge>
          <h2>다음 서버에서도, 같은 동료와.</h2>
          <p>
            UNIZ HIVE는 한 시즌에 머무르지 않습니다. 함께 시나리오를 선택하고, 작전을 준비하며,
            쌓아온 경험을 다음 시즌으로 이어갑니다.
          </p>
          <p>
            현재는 HOME Dashboard와 SEASON Hub의 Foundation 데모입니다. 실제 게임·Discord 데이터
            연결과 추가 기능은 다음 단계에서 진행합니다.
          </p>
          <Link href="/season" className="button button-primary">
            시즌 허브 둘러보기 <ArrowUpRight size={15} />
          </Link>
          <Link href="/" className="button button-quiet">
            <ArrowLeft size={15} />
            홈으로
          </Link>
        </div>
      </div>
    </>
  );
}
