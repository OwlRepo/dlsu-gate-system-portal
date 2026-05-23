import { faker } from '@faker-js/faker';

export const defaultSuperAdmin = {
  email: faker.internet.email(),
  password: 'superadmin123',
  username: 'defaultsuperadmin',
  name: faker.person.fullName(),
  role: 'super-admin',
};

export const defaultAdmin = {
  email: faker.internet.email(),
  password: 'admin123',
  username: 'defaultadmin',
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  name: faker.person.fullName(),
  role: 'admin',
};
