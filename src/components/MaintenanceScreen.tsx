export function MaintenanceScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4 px-6">
        <div className="text-6xl">⚽</div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          PLAYREADYSPORTS
        </h1>
        <p className="text-lg font-semibold text-muted-foreground">
          UNDER MAINTENANCE
        </p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          We&apos;re making improvements. Check back soon.
        </p>
      </div>
    </div>
  );
}
