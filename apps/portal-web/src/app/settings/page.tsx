import { AccountForm } from '@/components/settings/account-form';
import { SettingsNav } from '@/components/settings/settings-nav';

export default function SettingsAccountPage() {
  return (
    <div className="flex gap-8">
      <SettingsNav />
      <div className="rounded-lg border p-6 w-full">
        <AccountForm />
      </div>
    </div>
  );
}
