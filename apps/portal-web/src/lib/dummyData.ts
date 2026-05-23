import { cache } from 'react';

export interface StudentEntry {
  id: string;
  name: string;
  timestamp: string;
  imageUrl: string | null;
}

export interface LogEntry extends StudentEntry {
  turnstile: number;
}

const generateStudentEntry = (index: number): StudentEntry => ({
  id: `S${1000 + index}`,
  name: `Student ${index}`,
  timestamp: 'test', // Consistent timestamps
  imageUrl: null,
});

export const getStudentEntries = cache((count: number): StudentEntry[] => {
  return Array.from({ length: count }, (_, i) => generateStudentEntry(i + 1));
});

export const getLogEntries = cache((count: number): LogEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    ...generateStudentEntry(i + 1),
    turnstile: (i % 10) + 1,
  }));
});
