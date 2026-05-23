export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 space-y-4 px-8 py-4">
        <div className="space-y-0.5">
          <p className="text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
