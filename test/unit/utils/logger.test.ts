import { describe, it, expect } from 'vitest';
import { logger, setDebugMode } from '../../../src/utils/logger.js';
import { LogLevels } from 'consola';

describe('Logger', () => {
    it('should be defined', () => {
        expect(logger).toBeDefined();
    });

    it('should have standard methods', () => {
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.success).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
    });

    it('should allows toggling debug mode', () => {
        // Default is info (3)
        expect(logger.level).toBe(LogLevels.info);

        setDebugMode(true);
        expect(logger.level).toBe(LogLevels.debug);

        setDebugMode(false);
        expect(logger.level).toBe(LogLevels.info);
    });
});
