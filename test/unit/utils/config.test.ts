import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findProjectRoot, loadConfig } from '../../../src/utils/config.js';
import { lilconfig } from 'lilconfig';
import path from 'node:path';

// Mock lilconfig
vi.mock('lilconfig');

describe('Config Utilities', () => {
    const mockSearch = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (lilconfig as any).mockReturnValue({
            search: mockSearch,
        });
    });

    describe('findProjectRoot', () => {
        it('should return null if no config found', async () => {
            mockSearch.mockResolvedValue(null);
            const root = await findProjectRoot('app', '/some/path');
            expect(root).toBeNull();
        });

        it('should return directory path if config found', async () => {
            mockSearch.mockResolvedValue({
                filepath: '/abs/path/to/app.yml',
                config: {},
            });
            const root = await findProjectRoot('app', '/some/path');
            expect(root).toBe('/abs/path/to');
        });
    });

    describe('loadConfig', () => {
        it('should return empty object if no config found', async () => {
            mockSearch.mockResolvedValue(null);
            const config = await loadConfig('app', '/some/path');
            expect(config).toEqual({});
        });

        it('should return config object if found', async () => {
            const mockConfig = { project: 'test' };
            mockSearch.mockResolvedValue({
                filepath: '/abs/path/to/app.yml',
                config: mockConfig,
            });
            const config = await loadConfig('app', '/some/path');
            expect(config).toEqual(mockConfig);
        });
    });
    describe('loadYaml', () => {
        it('should parse yaml content', async () => {
            // Dynamic import to bypass potential mocking issues if we used static import earlier
            // or just verify if exported
            const { loadYaml } = await import('../../../src/utils/config.js');
            const content = 'foo: bar';
            const result = loadYaml('file.yml', content);
            expect(result).toEqual({ foo: 'bar' });
        });
    });
});
