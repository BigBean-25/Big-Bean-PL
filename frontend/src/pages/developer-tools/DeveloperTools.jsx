import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import pkg from "../../../package.json";

const CAPABILITY_META = {
  "tools": {
    title: "Development Tools",
    description:
      "Read-only diagnostic metadata for the running application. No environment values, tokens, or credentials are exposed.",
  },
  "test-data": {
    title: "Test Data Management",
    description: "Non-production only.",
  },
  "staging": {
    title: "Staging / QA Environment",
    description: "Environment status.",
  },
  "deployment": {
    title: "Deployment",
    description:
      "Production deployment is an external, manual process (hosting panel + Node app restart). No deploy, redeploy, restart, SSH, or shell actions exist in this app.",
  },
  "debug-logs": {
    title: "Debug Logs",
    description: "Diagnostic log access.",
  },
  "api-tools": {
    title: "API & Integration Tools",
    description: "Safe, read-only API diagnostics.",
  },
  "feature-flags": {
    title: "Feature Flags",
    description: "Runtime feature toggles.",
  },
};

const StatusRow = ({ label, ok, detail }) => (
  <div className="flex items-start justify-between gap-4 border-b border-[#EBE9F1] py-3 last:border-0">
    <span className="text-[14px] font-medium text-[#2F2B3D]">{label}</span>
    <span className="flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 size={16} className="text-emerald-500" />
      ) : (
        <AlertCircle size={16} className="text-amber-500" />
      )}
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{detail}</span>
    </span>
  </div>
);

const ApiHealthPanel = () => {
  const [state, setState] = useState({ loading: true, ok: false, message: "", latencyMs: null });

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    api
      .get("/health")
      .then((res) => {
        if (!cancelled) {
          setState({
            loading: false,
            ok: Boolean(res.data?.success),
            message: res.data?.message || "OK",
            latencyMs: Math.round(performance.now() - started),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, ok: false, message: "Unreachable", latencyMs: null });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <StatusRow label="API health (/api/health)" ok={state.ok} detail={state.loading ? "Checking..." : state.message} />
      <StatusRow label="Response latency" ok={state.ok} detail={state.latencyMs !== null ? `${state.latencyMs} ms` : "-"} />
    </div>
  );
};

const GapPanel = ({ title, children }) => (
  <div className="rounded-lg border border-dashed border-[#DBDADE] bg-[#FAF9FC] p-5">
    <p className="text-[14px] font-medium text-[#2F2B3D]">{title}</p>
    <div className="mt-2 text-[13px] leading-relaxed text-[#6F6B7D]">{children}</div>
  </div>
);

const DeveloperTools = () => {
  const { capability } = useParams();
  const roleName = useAuthStore((s) => s.user?.role_name || s.user?.role || "");
  const meta = CAPABILITY_META[capability] || CAPABILITY_META.tools;

  if (roleName !== "Developer") {
    return (
      <div className="rounded-xl border border-[#DBDADE] bg-white p-6">
        <h1 className="text-[18px] font-semibold text-[#2F2B3D]">Development / Non-Production</h1>
        <p className="mt-2 text-[13.5px] text-[#6F6B7D]">
          This section is restricted to the Developer role.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#DBDADE] bg-white p-6">
      <h1 className="text-[18px] font-semibold text-[#2F2B3D]">{meta.title}</h1>
      <p className="mt-1 mb-5 text-[13.5px] text-[#6F6B7D]">{meta.description}</p>

      {capability === "tools" && (
        <div>
          <StatusRow label="Frontend" ok detail={`bigbean-cafe-frontend v${pkg.version}`} />
          <StatusRow label="Environment" ok detail="Production (diagnostic read/export access)" />
          <ApiHealthPanel />
        </div>
      )}
      {capability === "api-tools" && <ApiHealthPanel />}
      {capability === "test-data" && (
        <GapPanel title="Not available in production">
          Test-data management must never mutate production. No safe non-production mechanism is
          configured in this application, so no controls are offered here.
        </GapPanel>
      )}
      {capability === "staging" && (
        <GapPanel title="Not configured">
          No staging or QA environment is wired into this application. Staging is managed externally
          and intentionally not linked from production.
        </GapPanel>
      )}
      {capability === "deployment" && (
        <div>
          <StatusRow label="Frontend build" ok detail={`bigbean-cafe-frontend v${pkg.version}`} />
          <StatusRow label="Deployment channel" ok detail="External / manual (hosting panel)" />
          <p className="mt-4 text-[12.5px] text-[#A8AAAE]">
            This page is informational only - it cannot deploy, redeploy, or restart the production
            app, and it exposes no hosting credentials.
          </p>
        </div>
      )}
      {capability === "debug-logs" && (
        <GapPanel title="Not available through production ERP">
          There is no authenticated log-read API. Logs stay on the server; environment files, tokens,
          and request payloads are never surfaced here.
        </GapPanel>
      )}
      {capability === "feature-flags" && (
        <GapPanel title="No feature-flag system configured">
          The application has no feature-flag subsystem, so there is nothing to display or toggle.
          Any future flag system would remain read-only for Developer in production.
        </GapPanel>
      )}
    </div>
  );
};

export default DeveloperTools;
