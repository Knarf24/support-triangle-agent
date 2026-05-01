export interface MigrationStatus {
  failed: boolean;
  error: string | null;
  failedAt: string | null;
}

let status: MigrationStatus = {
  failed: false,
  error: null,
  failedAt: null,
};

export function setMigrationFailed(err: unknown): void {
  status = {
    failed: true,
    error: err instanceof Error ? err.message : String(err),
    failedAt: new Date().toISOString(),
  };
}

export function getMigrationStatus(): MigrationStatus {
  return status;
}
