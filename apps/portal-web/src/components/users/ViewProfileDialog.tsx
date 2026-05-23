import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { UserHeader } from './UserManagementPageContainer';

interface UserProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserHeader | null;
  roleColors: Record<string, string>;
}

const ViewProfileDialog: React.FC<UserProfileDialogProps> = ({
  isOpen,
  onClose,
  user,
  roleColors,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>View user details</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Username
              </p>
              <p className="text-sm">{user?.USERNAME}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                User ID
              </p>
              <p className="text-sm">{user?.EMPLOYEE_ID}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                First Name
              </p>
              <p className="text-sm">{user?.FIRST_NAME}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Last Name
              </p>
              <p className="text-sm">{user?.LAST_NAME}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Role</p>
              <Badge
                variant="outline"
                className={`mt-1 ${roleColors[user?.ROLE.toLowerCase() || '']}`}
              >
                {user?.ROLE.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Date Added
              </p>
              <p className="text-sm">{user?.DATE_ADDED}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewProfileDialog;
