import { describe, it, expect } from 'vitest';
import { runCLI } from '../utils/integration-helpers.js';
import pkg from '../../package.json';

describe('CLI E2E', () => {
    it('should display help', async () => {
        const { stdout } = await runCLI(['--help'], process.cwd());
        expect(stdout).toContain('Usage:');
        expect(stdout).toContain('Commands:');
    });

    it('should display version', async () => {
        const { stdout } = await runCLI(['--version'], process.cwd());
        expect(stdout).toContain(pkg.version);
    });
});
