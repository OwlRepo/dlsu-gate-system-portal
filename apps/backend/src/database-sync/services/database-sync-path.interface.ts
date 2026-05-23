/**
 * Contract for schema-specific sync path implementations.
 * Facade delegates to MainPathService or DasmaPathService based on schemaEnv.
 */
export interface IDatabaseSyncPath {
  executeDatabaseSync(jobName: string): Promise<{
    success: boolean;
    message: string;
    recordsProcessed: number;
  } | void>;

  syncFromBiostar(jobKey: string, jobName?: string): Promise<void>;
}
