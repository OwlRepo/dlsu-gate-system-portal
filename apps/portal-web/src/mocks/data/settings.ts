export const mockSchedules = [
  {
    scheduleNumber: 1,
    time: "09:00",
    isActive: true,
    lastSyncTime: new Date(Date.now() - 3600000).toISOString(),
    nextRun: new Date(Date.now() + 3600000).toISOString(),
    timezone: "Asia/Manila",
  },
  {
    scheduleNumber: 2,
    time: "21:00",
    isActive: true,
    lastSyncTime: new Date(Date.now() - 7200000).toISOString(),
    nextRun: new Date(Date.now() + 7200000).toISOString(),
    timezone: "Asia/Manila",
  },
];
