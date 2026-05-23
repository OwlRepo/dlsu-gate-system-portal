// 'use client'
// import UserManagementPageContainer from '@/components/users/UserManagementPageContainer';
// import React from 'react';

// const page = () => {
//   return (
//     <div className="py-8 px-6">
//       <UserManagementPageContainer />
//     </div>
//   );
// };

// export default page;

'use client';

import dynamic from 'next/dynamic';

// Import the component with SSR disabled
const UserManagementPageContainer = dynamic(
  () => import('@/components/users/UserManagementPageContainer'),
  { ssr: false }
);

export default function UserManagementPage() {
  return <UserManagementPageContainer />;
}
