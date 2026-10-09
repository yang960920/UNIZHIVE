import { ArrowRight, CircleDot } from "lucide-react";
import { seasonLifecycle } from "@/lib/mocks/current-season";

export function SeasonLifecycle() {
  return (
    <section className="season-lifecycle panel" aria-labelledby="lifecycle-title">
      <div className="season-section-header">
        <h2 id="lifecycle-title" className="panel-title">
          SEASON LIFECYCLE
        </h2>
        <span>우리의 다음 여정</span>
      </div>
      <ol>
        {seasonLifecycle.map((step, index) => (
          <li
            key={step.id}
            className={step.status === "CURRENT" ? "is-current" : ""}
            aria-current={step.status === "CURRENT" ? "step" : undefined}
          >
            <div className="lifecycle-step-top">
              <span className="lifecycle-index mono">
                {step.status === "CURRENT" ? (
                  <CircleDot size={15} aria-hidden="true" />
                ) : (
                  (index + 1).toString().padStart(2, "0")
                )}
              </span>
              {index < seasonLifecycle.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
            </div>
            <strong>{step.label}</strong>
            <span>{step.description}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
