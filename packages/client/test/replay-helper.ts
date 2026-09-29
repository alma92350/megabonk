export { replay } from '@megabonk/sim';
import { makeRunConfig } from '@megabonk/content';
import type { RunConfig } from '@megabonk/sim';
export const makeRunConfigSafe = (seed: number): RunConfig => makeRunConfig(seed);
