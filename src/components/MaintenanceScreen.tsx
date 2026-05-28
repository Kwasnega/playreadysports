export function MaintenanceScreen() {
  return (
    <div
      style={{ backgroundColor: "#070B14", color: "#F8FAFC" }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
    >
      <div className="flex flex-col items-center text-center space-y-5 px-8 max-w-sm w-full">
        <div className="text-6xl leading-none select-none">⚽</div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#F8FAFC" }}>
          PLAYREADYSPORTS
        </h1>
        <div
          className="text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full"
          style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.25)" }}
        >
          UNDER MAINTENANCE
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
          We&apos;re making improvements. Check back soon.
        </p>
      </div>
    </div>
  );
}
