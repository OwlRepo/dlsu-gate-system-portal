export const headers = [
  { header: 'Status', accessor: 'STATUS' as const }, // Use 'as const' to infer the literal type
  { header: 'ID', accessor: 'ID' as const },
  { header: 'Name', accessor: 'NAME' as const },
  // { header: 'Type', accessor: 'TYPE' as const },
  // { header: 'Gate', accessor: 'GATE' as const },
  { header: 'Activity', accessor: 'ACTIVITY' as const },
  { header: 'Date/Time', accessor: 'DATETIME' as const },
];

export const liveDataHeaders = [
  { header: 'Status', accessor: 'STATUS' as const }, // Use 'as const' to infer the literal type
  { header: 'ID', accessor: 'ID' as const },
  { header: 'Name', accessor: 'NAME' as const },
  // { header: 'Type', accessor: 'TYPE' as const },
  // { header: 'Gate', accessor: 'GATE' as const },
  { header: 'Activity', accessor: 'ACTIVITY' as const },
  { header: 'Date/Time', accessor: 'DATETIME' as const }
];
