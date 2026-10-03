import { CORE_PACKAGE } from '@ball-knowledge/core';

/** Identifies this package; replaced by the retention engine in Phase 3. */
export const RETENTION_PACKAGE = '@ball-knowledge/retention';

/** The domain package this engine is built on (proves workspace resolution works). */
export const RETENTION_DEPENDS_ON = CORE_PACKAGE;
