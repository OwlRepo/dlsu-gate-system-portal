export const checkExpiry = (expiryDate: string | undefined): boolean => {
    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const today = new Date();
      return today > expiry;
    }
    return false;
  };