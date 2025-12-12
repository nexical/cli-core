#!/usr/bin/env node
import { CLI } from './src/CLI.js';

import { logger } from './src/utils/logger.js';

logger.debug('CLI ENTRY POINT HIT', process.argv);

const app = new CLI();
app.start();
