import { getUser } from '../actions/auth';
import { Dashboard } from './dashboard';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const data = await getUser();

  if (data === null) {
    redirect('/login');
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <Dashboard />
      </div>
    </div>
  );
}
