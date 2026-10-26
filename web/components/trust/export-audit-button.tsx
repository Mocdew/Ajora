"use client";

import { FileArrowDown } from "@phosphor-icons/react/dist/ssr";
import { usePersona } from "@/components/persona-context";
import { useAudit } from "@/lib/api/trust";

/** Saves the persona's append-only access log, exactly as served, as JSON. */
export function ExportAuditButton() {
  const { userId } = usePersona();
  const { data, isLoading, isError } = useAudit(userId);

  const onExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ajora-audit-${data.user_id}.json`;
    // Attached and revoked a tick later: Safari and older Firefox drop the
    // download if the anchor is detached or the URL is revoked synchronously.
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={isLoading || isError || !data}
      className="btn-secondary"
    >
      <FileArrowDown className="h-4 w-4 text-accent" aria-hidden />
      Export audit log
    </button>
  );
}
