export interface MockUser {
  id: string;
  username: string;
  userType: string;
  first_name: string;
  last_name: string;
  created_at: string;
  email?: string;
  is_active?: boolean;
}

export const mockUsers: MockUser[] = [
  {
    id: "A-0001",
    username: "admin1",
    userType: "admin",
    first_name: "Alice",
    last_name: "Santos",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    email: "alice@dlsu.edu.ph",
    is_active: true,
  },
  {
    id: "E-0002",
    username: "operator2",
    userType: "employee",
    first_name: "Bob",
    last_name: "Reyes",
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    email: "bob@dlsu.edu.ph",
    is_active: true,
  },
  {
    id: "S-0003",
    username: "super3",
    userType: "super-admin",
    first_name: "Carla",
    last_name: "Lim",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    email: "carla@dlsu.edu.ph",
    is_active: false,
  },
];

export const mockDevices = [
  { id: "538203430", name: "Turnstile 1" },
  { id: "538203431", name: "Turnstile 2" },
  { id: "538203432", name: "Turnstile 3" },
];
