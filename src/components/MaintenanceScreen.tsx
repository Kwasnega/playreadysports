import { Trophy } from "lucide-react";

export function MaintenanceScreen() {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "#070B14",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        minHeight: "100dvh",
      }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center",
          gap: "20px", padding: "0 32px",
          maxWidth: "360px", width: "100%",
          margin: "0 auto",
        }}
      >
        <div style={{ color: "#FBBF24" }}><Trophy size={64} /></div>
        <h1 style={{ color: "#F8FAFC", fontSize: "22px", fontWeight: 700, letterSpacing: "0.05em", margin: 0, textAlign: "center" }}>
          PLAYREADYSPORTS
        </h1>
        <div
          style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em",
            textTransform: "uppercase", padding: "6px 16px", borderRadius: "999px",
            backgroundColor: "rgba(251,191,36,0.12)", color: "#FBBF24",
            border: "1px solid rgba(251,191,36,0.25)", textAlign: "center",
          }}
        >
          UNDER MAINTENANCE
        </div>
        <p style={{ color: "#94A3B8", fontSize: "14px", lineHeight: 1.6, margin: 0, textAlign: "center" }}>
          We&apos;re making improvements. Check back soon.
        </p>
      </div>
    </div>
  );
}
