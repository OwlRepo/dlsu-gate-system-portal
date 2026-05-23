"use client";
import React, { useEffect, useMemo, useState } from 'react';
// import { Download } from "lucide-react";
// import axios from 'axios';
import axios from '@/lib/axios-interceptor';
import Cookies from 'js-cookie';
import { Input } from '../ui/input';
// import { Button } from "../ui/button";
import CustomTable from './CustomTable';
import ViewProfileDialog from './ViewProfileDialog';
import EditDetailsDialog from './EditDetailsDialog';
import { debounce } from 'lodash';
import CustomFilter, { FilterItem } from '../custom/CustomFilter';
import { useToast } from '@/hooks/use-toast';
import CustomExport from '../custom/CustomExport';
// import { Button } from "../ui/button";
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import CustomDropdownButton from '../custom/CustomDropdown';
import SuperAdminForm from './SuperAdminForm';
import AdminForm from './AdminForm';
import EmployeeForm from './EmployeeForm';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation'
// import { ViewProfileDialog } from './view-profile-dialog';

interface User {
  id: string;
  username: string;
  userType: string;
  first_name: string;
  last_name: string;
  created_at: string;
  email?: string;
  is_active?: boolean;
}

export interface UserHeader {
  // ID: string;
  EMPLOYEE_ID: string;
  USERNAME: string;
  FIRST_NAME: string;
  LAST_NAME: string;
  EMAIL?: string;
  ROLE: string;
  STATUS: string;
  DATE_ADDED: string;
}

const roleOptions = [
  { id: 'super-admin', label: 'Super Admin' },
  { id: 'admin', label: 'Admin' },
  { id: 'employee', label: 'Operator' },
];

const UserManagementPageContainer = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [search, setSearch] = useState<string>('');
  const [userList, setUserList] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserHeader | null>(null);
  const [isViewProfileOpen, setIsViewProfileOpen] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [limit, setLimit] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isReactivateOpen, setIsReactivateOpen] = useState(false);

  const usersHeaders: {
    header: string;
    accessor: keyof UserHeader | '';
    cell?: (row: UserHeader) => React.ReactNode;
  }[] = [
    { header: 'User ID', accessor: 'EMPLOYEE_ID' },
    { header: 'Username', accessor: 'USERNAME' },
    { header: 'First Name', accessor: 'FIRST_NAME' },
    { header: 'Last Name', accessor: 'LAST_NAME' },
    { header: 'Role', accessor: 'ROLE' },
    { header: 'Status', accessor: 'STATUS' },
    { header: 'Date Added', accessor: 'DATE_ADDED' },
  ];

  const data = userList.map((row) => ({
    EMPLOYEE_ID: row.id ? row.id : 'N/A',
    USERNAME: row.username ? row.username : 'N/A',
    FIRST_NAME: row.first_name ? row.first_name : 'N/A',
    LAST_NAME: row.last_name ? row.last_name : 'N/A',
    ROLE: row.userType ? row.userType : 'N/A',
    STATUS: row.is_active !== undefined ? (row.is_active ? 'Active' : 'Inactive') : 'N/A',
    DATE_ADDED: row.created_at ? row.created_at : 'N/A',
    EMAIL: row.email ? row.email : 'N/A',
  }));

  const roleColors: Record<string, string> = {
    admin: 'bg-green-100 text-green-600',
    employee: 'bg-purple-100 text-purple-600',
  };

  const typeOptions = ['super-admin', 'admin', 'employee'];

  const handleCloseView = () => {
    setSelectedUser(null);
    setIsViewProfileOpen(false);
  };

  const handleCloseEdit = () => {
    setSelectedUser(null);
    setIsEditDetailsOpen(false);
  };

  const handleCloseCreate = () => {
    setSelectedRole(null);
    setIsCreateOpen(false);
    refetchUserList();
  };

  const handleView = (user: UserHeader) => {
    setSelectedUser(user);
    setIsViewProfileOpen(true);
  };

  const handleEdit = (user: UserHeader) => {
    setSelectedUser(user);
    setIsEditDetailsOpen(true);
  };

  const handleDeactivate = async (user: UserHeader) => {
    try {
      let token = null;
      if (typeof window !== 'undefined') {
        const user = Cookies.get('user');
        if (user) {
          try {
            token = JSON.parse(user).token;
          } catch (e) {
            console.error('Error parsing user cookie:', e);
          }
        }
      }

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/users/bulk-deactivate`,
        { userIds: [user.EMPLOYEE_ID],
          userType: user.ROLE,
         },
        {
          headers: {
            Authorization: `${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data) {
        toast({
          title: 'Success',
          description: 'User has been deactivated successfully',
          duration: 3000,
        });
        refetchUserList();
      }
    } catch (error) {
      console.error('Error deactivating user:', error);
      toast({
        title: 'Error',
        description: 'User could not be deactivated',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  const handleReactivate = async (user: UserHeader) => {
    try {
      let token = null;
      if (typeof window !== 'undefined') {
        const user = Cookies.get('user');
        if (user) {
          try {
            token = JSON.parse(user).token;
          } catch (e) {
            console.error('Error parsing user cookie:', e);
          }
        }
      }

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/users/bulk-reactivate`,
        { userIds: [user.EMPLOYEE_ID],
          userType: user.ROLE,
         },
        {
          headers: {
            Authorization: `${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (res.data) {
        toast({
          title: 'Success',
          description: 'User has been reactivated successfully',
          duration: 3000,
        });
        refetchUserList();
      }
    } catch (error) {
      console.error('Error reactivating user:', error);
      toast({
        title: 'Error',
        description: 'User could not be reactivated',
        variant: 'destructive',
        duration: 3000,
      });
    }
  }

  const fetchUserList = async (
    searchTerm: string,
    newLimit?: number,
    newPage?: number,
    filters?: FilterItem[],
  ) => {
    try {
      setIsLoading(true);
      let token = null;
      if (typeof window !== 'undefined') {
        const user = Cookies.get('user');
        if (user && user !== 'undefined') {
          try {
            const parsedUser = JSON.parse(user);
            token = parsedUser && parsedUser.token ? parsedUser.token : null;
          } catch (e) {
            console.error('Error parsing user cookie:', e);
          }
        }
      }

      if (!token) {
        toast({
          title: 'Authentication Error',
          description: 'Error parsing user token',
          variant: 'destructive',
          duration: 5000,
        });
        setIsLoading(false);
        setTimeout(() => {
          router.push('/dashboard');
        }, 1000);

        return; // Exit early if no token
      }

      // Use new values if provided, otherwise use state values
      const currentLimit = newLimit ?? limit;
      const currentPage = newPage ?? page;
      const currentFilters = filters ?? activeFilters;

      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (currentLimit) params.append('limit', currentLimit.toString());
      if (currentPage) params.append('page', currentPage.toString());
      // Add filter parameters only if they have complete values
      currentFilters.forEach((filter) => {
        if (filter.type === 'type' && filter.value.type) {
          params.append('type', filter.value.type);
        }

        if (filter.type === 'dateRange') {
          // Only append date parameters if BOTH dates are provided
          if (filter.value.dateFrom && filter.value.dateTo) {
            params.append('startDate', filter.value.dateFrom);
            params.append('endDate', filter.value.dateTo);
          }
        }
      });

      const queryString = params.toString();
      const url = `${process.env.NEXT_PUBLIC_API_URL}/users${
        queryString ? `?${queryString}` : ''
      }`;

      const res = await axios.get(url, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `${token}`,
        },
      });

      if (res.data) {
        setUserList(res.data.items);
        setTotal(res.data.total);
        // toast({
        //   title: 'Success',
        //   description: 'User list has been fetched successfully',
        //   duration: 3000,
        // });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'User list could not be fetched',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (settings: {
    types?: string[] | null;
    dateFrom: string;
    dateTo: string;
  }) => {
    setExportLoading(true);
    try {
      let token = null;
      if (typeof window !== 'undefined') {
        const user = Cookies.get('user');
        if (user) {
          try {
            token = JSON.parse(user).token;
          } catch (e) {
            console.error('Error parsing user cookie:', e);
          }
        }
      }

      // Check if required fields are provided
      if (!settings.dateFrom || !settings.dateTo) {
        toast({
          title: 'Export Error',
          description: 'Date range is required for export',
          variant: 'destructive',
          duration: 5000,
        });
        setExportLoading(false);
        return;
      }

      // Build URL with query parameters
      const params = new URLSearchParams();

      // Add types parameter if any types are selected
      if (settings.types && settings.types.length > 0) {
        settings.types.forEach((type) => {
          params.append('types', type);
        });
      }

      // Add date parameters
      params.append('startDate', settings.dateFrom);
      params.append('endDate', settings.dateTo);

      const url = `${
        process.env.NEXT_PUBLIC_API_URL
      }/users/generate-csv?${params.toString()}`;

      const res = await axios.get(url, {
        responseType: 'blob',
        headers: {
          Authorization: `${token}`,
        },
      });

      // Create a blob from the response data
      const blob = new Blob([res.data], { type: 'text/csv' });

      // Create a download link and trigger the download
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(blob);

      // Generate filename including selected types if available
      const typeString =
        settings.types && settings.types.length > 0
          ? `_${settings.types.join('-')}`
          : '';
      downloadLink.download = `users${typeString}_${settings.dateFrom}_to_${settings.dateTo}.csv`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      toast({
        title: 'Export Successful',
        description: 'User data has been exported successfully',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: 'Export Error',
        description: 'An error occurred while exporting data',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleFiltersChange = (newFilters: FilterItem[]) => {
    // Only consider filters that have valid values
    const validFilters = newFilters.filter((filter) => {
      if (filter.type === 'type') {
        return !!filter.value.type; // Only include if userType is set
      }

      if (filter.type === 'dateRange') {
        // Include only if BOTH dates are set
        return !!filter.value.dateFrom && !!filter.value.dateTo;
      }

      return false; // Ignore other filter types
    });

    setActiveFilters(validFilters);
    // Reset to page 1 when filters change
    setPage(1);
    // Apply the filters
    fetchUserList(search, limit, 1, validFilters);
  };

  // Create memoized debounced search function
  const debouncedSearch = useMemo(
    () =>
      debounce((searchTerm: string) => {
        setPage(1); // Reset to first page on new search
        fetchUserList(searchTerm);
      }, 500),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Add handlers for pagination
  const handlePageChange = async (newPage: number) => {
    await fetchUserList(search, limit, newPage); // Call API first
    setPage(newPage); // Update page state after successful API call
  };

  const handleLimitChange = async (newLimit: number) => {
    await fetchUserList(search, newLimit, 1); // Call API first with page 1
    setLimit(newLimit);
    setPage(1);
  };

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    debouncedSearch(value);
  };

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setIsCreateOpen(true);
  };

  const refetchUserList = () => {
    fetchUserList(search, limit, page, activeFilters);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  useEffect(() => {
    // Only fetch data on the client side
      fetchUserList(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="flex items-center justify-between mb-8">
        <div className="w-[500px]">
          <Input
            placeholder="Search..."
            value={search}
            onChange={handleSearch}
          />
        </div>

        <div className="flex items-center gap-4">
          <CustomFilter
            onFiltersChange={handleFiltersChange}
            typeOptions={typeOptions}
          />
          <CustomDropdownButton
            buttonText="Create"
            buttonIcon={<Plus className="h-4 w-4" />}
            options={roleOptions}
            onSelect={handleRoleSelect}
          />
          <CustomExport
            onExport={handleExport}
            loading={exportLoading}
            typeOptions={typeOptions}
          />
        </div>
      </div>

      <CustomTable
        columns={usersHeaders}
        data={data}
        onView={(user) => handleView(user)}
        onEdit={(user) => handleEdit(user)}
        onDeactivate={(user) => {
          setIsDeactivateOpen(true)
          setSelectedUser(user)
        }}
        onActivate={(user) => {
          setIsReactivateOpen(true)
          setSelectedUser(user)
        }}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
        currentPage={page}
        total={total}
        limit={limit}
        isLoading={isLoading}
      />

      <ViewProfileDialog
        isOpen={isViewProfileOpen}
        onClose={handleCloseView}
        user={selectedUser}
        roleColors={roleColors}
      />

      <EditDetailsDialog
        isOpen={isEditDetailsOpen}
        onClose={handleCloseEdit}
        user={selectedUser}
        refetchUserList={refetchUserList}
      />

      <Dialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate this user?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='mt-2'>
            <Button
              variant="outline"
              onClick={() => setIsDeactivateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleDeactivate(selectedUser as UserHeader);
                setIsDeactivateOpen(false);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReactivateOpen} onOpenChange={setIsReactivateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Activate User</DialogTitle>
            <DialogDescription>
              Are you sure you want to activate this user?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='mt-2'>
            <Button
              variant="outline"
              onClick={() => setIsReactivateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleReactivate(selectedUser as UserHeader);
                setIsReactivateOpen(false);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedRole === 'super-admin'
                ? 'Create Super Admin'
                : selectedRole === 'admin'
                ? 'Create Admin'
                : 'Create Operator'}
            </DialogTitle>
            <DialogDescription>
              Fill in the details to create a new{' '}
              {selectedRole?.replace('-', ' ')}.
            </DialogDescription>
          </DialogHeader>

          {selectedRole === 'super-admin' && (
            <SuperAdminForm onClose={handleCloseCreate} />
          )}
          {selectedRole === 'admin' && (
            <AdminForm onClose={handleCloseCreate} />
          )}
          {selectedRole === 'employee' && (
            <EmployeeForm onClose={handleCloseCreate} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagementPageContainer;
