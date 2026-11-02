// Approval snapshots keep their original grants. A profile upgrade needs a new
// host setup plan and fingerprint, not a retry of an already approved operation.
export const MARIA_STORED_OBJECT_PROFILE = "mariadb-stored-objects-v1" as const;
