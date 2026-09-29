import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

const CAPABILITY_META = {
  "health": {
    title: "System Health",
    description:
      "Live, non-secret health signal for the production API. No credentials, hostnames, or environment values are shown.",
  },
  "integrations": {
    title: "Integration Status",
    description:
      "Status of the integrations this ERP actually supports today. File-upload channels only - there is no live third-party API link to probe.",
  },
  "audit-logs": {
    title: "Audit Logs",
    description:
      "Audit trail visibility for platform-level events.",
  },
  "support-tools": {
    title: "Support Tools",
    description:
      "Operational support utilities for the platform administrator.",
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

const HealthPanel = () => {
  const [state, setState] = useState({ loading: true, ok: false, message: "", timestamp: "", latencyMs: null });

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    api
      .get("/health")
      .then((res) => {
        if (cancelled) return;
        setState({
          loading: false,
          ok: Boolean(res.data?.success),
          message: res.data?.message || "OK",
          timestamp: res.data?.timestamp || "",
          latencyMs: Math.round(performance.now() - started),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, ok: false, message: "Unreachable", timestamp: "", latencyMs: null });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <StatusRow label="API health (/api/health)" ok={state.ok} detail={state.loading ? "Checking..." : state.message} />
      <StatusRow label="Response latency" ok={state.ok} detail={state.latencyMs !== null ? `${state.latencyMs} ms` : "-"} />
      <StatusRow label="API timestamp" ok={state.ok} detail={state.timestamp ? new Date(state.timestamp).toLocaleString() : "-"} />
      <p className="mt-4 text-[12.5px] text-[#A8AAAE]">
        Database connectivity, hostnames, credentials and environment values are intentionally not displayed.
      </p>
    </div>
  );
};

const IntegrationsPanel = () => (
  <div>
    <StatusRow label="PetPooja - Daily Sales" ok detail="Configured - file-upload channel (Sales -> Daily Sales)" />
    <StatusRow label="PetPooja - Item Tax" ok detail="Configured - file-upload channel (Sales -> Item Tax)" />
    <StatusRow label="Live third-party API links" ok={false} detail="None configured" />
    <p className="mt-4 text-[12.5px] text-[#A8AAAE]">
      Read-only status view. Integration credentials are managed outside the ERP and are never shown here.
    </p>
  </div>
);

const GapPanel = ({ children }) => (
  <div className="rounded-lg border border-dashed border-[#DBDADE] bg-[#FAF9FC] p-5">
    <p className="text-[14px] font-medium text-[#2F2B3D]">Not available yet</p>
    <div className="mt-2 text-[13px] leading-relaxed text-[#6F6B7D]">{children}</div>
  </div>
);

const SystemSupport = () => {
  const { capability } = useParams();
  const roleName = useAuthStore((s) => s.user?.role_name || s.user?.role || "");
  const meta = CAPABILITY_META[capability] || CAPABILITY_META.health;

  if (roleName !== "Super Admin") {
    return (
      <div className="rounded-xl border border-[#DBDADE] bg-white p-6">
        <h1 className="text-[18px] font-semibold text-[#2F2B3D]">System / Support</h1>
        <p className="mt-2 text-[13.5px] text-[#6F6B7D]">
          This section is restricted to the Super Admin role.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#DBDADE] bg-white p-6">
      <h1 className="text-[18px] font-semibold text-[#2F2B3D]">{meta.title}</h1>
      <p className="mt-1 mb-5 text-[13.5px] text-[#6F6B7D]">{meta.description}</p>

      {capability === "health" && <HealthPanel />}
      {capability === "integrations" && <IntegrationsPanel />}
      {capability === "audit-logs" && (
        <GapPanel>
          An audit log store exists in the schema, but there is no authenticated read API or UI for it yet.
          Frontend pages never query the database directly - an audit read API is a documented platform gap.
        </GapPanel>
      )}
      {capability === "support-tools" && (
        <GapPanel>
          No safe support utilities are implemented yet. Destructive operations (data repair, resets,
          shell access) are deliberately not provided through the ERP. This is a documented platform gap.
        </GapPanel>
      )}
      {capability !== "health" && capability !== "integrations" && capability !== "audit-logs" && capability !== "support-tools" && (
        <GapPanel>This capability is not configured in the current production ERP.</GapPanel>
      )}

      <p className="mt-6 text-[12.5px] text-[#A8AAAE]">
        Configuration is managed under{" "}
        <Link to="/warehouse/settings" className="font-medium text-[#7367F0] hover:underline">
          Administration → Configuration
        </Link>{" "}
        (Warehouse Settings) and{" "}
        <Link to="/masters" className="font-medium text-[#7367F0] hover:underline">
          Master Data
        </Link>
        .
      </p>
    </div>
  );
};

export default SystemSupport;
