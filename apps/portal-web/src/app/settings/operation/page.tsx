import { SettingsNav } from '@/components/settings/settings-nav';
import { OperationSettings } from '@/components/settings/operation-settings';

export default function SettingsOperationPage() {
  return (
    <div className="flex gap-8">
      <SettingsNav />
      <div className="w-full">
        <OperationSettings />
      </div>
    </div>
  );
}
