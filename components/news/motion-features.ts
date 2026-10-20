// Motion's DOM animation + drag features, code-split so they load after hydration instead of
// blocking first paint. Until they arrive, the sheet renders in its final position (no animation).
import { domMax } from 'motion/react';

export default domMax;
