import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { CommandLoader } from '../../../src/CommandLoader.js';
import { cac } from 'cac';
import fs from 'node:fs';

vi.mock('cac');
vi.mock('../../../src/CommandLoader.js');
vi.mock('node:fs');
vi.mock('../../../src/utils/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
    setDebugMode: vi.fn()
}));

describe('CLI Configuration', () => {
    let mockCac: any;
    let mockLoad: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCac = {
            command: vi.fn().mockReturnThis(),
            action: vi.fn().mockReturnThis(),
            allowUnknownOptions: vi.fn().mockReturnThis(),
            option: vi.fn().mockReturnThis(),
            help: vi.fn(),
            version: vi.fn(),
            parse: vi.fn(),
        };
        (cac as any).mockReturnValue(mockCac);

        mockLoad = vi.fn().mockResolvedValue([]);
        (CommandLoader as any).mockImplementation(function () {
            return {
                load: mockLoad,
                getCommands: () => []
            };
        });
        (fs.existsSync as any).mockReturnValue(true);
    });

    it('should use default command name "app" if no config provided', () => {
        new CLI();
        expect(cac).toHaveBeenCalledWith('app');
    });

    it('should use configured command name', () => {
        new CLI({ commandName: 'my-cli' });
        expect(cac).toHaveBeenCalledWith('my-cli');
    });

    it('should search in configured search directories', async () => {
        const cli = new CLI({ searchDirectories: ['/custom/path/1', '/custom/path/2'] });
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockLoad).toHaveBeenCalledTimes(2);
        expect(mockLoad).toHaveBeenCalledWith('/custom/path/1');
        expect(mockLoad).toHaveBeenCalledWith('/custom/path/2');
    });

    it('should fallback to default logic if searchDirectories is empty', async () => {
        const cli = new CLI({ searchDirectories: [] });
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        // Should try default paths. Since we mock existsSync to true, it stops at the first one.
        expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it('should fallback to default logic if searchDirectories is undefined', async () => {
        const cli = new CLI({});
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockLoad).toHaveBeenCalledTimes(1);
    });
});
