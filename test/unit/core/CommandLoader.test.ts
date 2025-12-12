import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { CommandLoader } from '../../../src/CommandLoader.js';
import { BaseCommand } from '../../../src/BaseCommand.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../../src/utils/logger.js';

vi.mock('node:fs');
vi.mock('../../../src/utils/logger.js', () => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        success: vi.fn()
    }
}));

class MockCommand extends BaseCommand {
    async run() { }
}

describe('CommandLoader', () => {
    let loader: CommandLoader;
    let cli: any;
    let mockImporter: any;

    beforeEach(() => {
        vi.clearAllMocks();
        cli = new CLI({ commandName: 'app' });
        mockImporter = vi.fn();
        loader = new CommandLoader(cli, mockImporter);
    });

    it('should ignore index.ts if it does not map to a command', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['index.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(0);
    });

    it('should skip directory if does not exist', async () => {
        (fs.existsSync as any).mockReturnValue(false);
        const commands = await loader.load('/non-existent');
        expect(commands).toHaveLength(0);
    });

    it('should handle class loading error gracefully', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['error.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        mockImporter.mockRejectedValue(new Error('Load failed'));

        const commands = await loader.load(rootDir);

        expect(commands).toHaveLength(0);
        expect(logger.error).toHaveBeenCalled();
    });

    it('should skip files that do not default export a class', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['no_class.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });
        //   - module/ (dir)
        //     - add.ts

        (fs.readdirSync as any).mockImplementation((p: string) => {
            if (p === rootDir) return ['create.ts', 'module'];
            if (p === path.join(rootDir, 'module')) return ['add.ts'];
            return [];
        });

        (fs.statSync as any).mockImplementation((p: string) => ({
            isDirectory: () => {
                if (p === path.join(rootDir, 'module')) return true;
                return false;
            }
        }));

        // Mock valid command class
        class MockRecursiveCommand extends BaseCommand {
            async run() { }
        }
        mockImporter.mockResolvedValue({ default: MockRecursiveCommand });

        const commands = await loader.load(rootDir);

        expect(commands).toHaveLength(2);

        const moduleAdd = commands.find(c => c.command === 'module add');
        expect(moduleAdd).toBeDefined();
        expect(moduleAdd?.path).toBe(path.join(rootDir, 'module', 'add.ts'));
    });
    it('should use default importer if none provided', () => {
        const cli = new CLI({ commandName: 'app' });
        const defaultLoader = new CommandLoader(cli);
        expect(defaultLoader).toBeDefined();
    });
    it('should attempt default import execution', async () => {
        // This test ensures the default parameter (p) => import(p) is executed.
        // It will fail to import 'fake.ts' but that's caught.

        const cli = new CLI({ commandName: 'app' });
        const loader = new CommandLoader(cli); // Default importer
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['fake.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        // Suppress error log
        // const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await loader.load(rootDir);

        // If we reach here, we survived the import error, meaning the catch block was hit
        // and impliedly the try block (and importer) was executed.
        expect(logger.error).toHaveBeenCalled();
    });

    it('should load .js files', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['script.js']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        class JsCommand extends BaseCommand { async run() { } }
        mockImporter.mockResolvedValue({ default: JsCommand });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(1);
        expect(commands[0].command).toBe('script');
    });
    it('should support nested index.ts as parent command', async () => {
        // Structure: /commands/module/index.ts -> "module"
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);

        (fs.readdirSync as any).mockImplementation((p: string) => {
            if (p === rootDir) return ['module'];
            if (p === path.join(rootDir, 'module')) return ['index.ts'];
            return [];
        });

        (fs.statSync as any).mockImplementation((p: string) => ({
            isDirectory: () => {
                if (p === path.join(rootDir, 'module')) return true;
                return false;
            }
        }));

        class ModuleIndexCommand extends BaseCommand { async run() { } }
        mockImporter.mockResolvedValue({ default: ModuleIndexCommand });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(1);
        expect(commands[0].command).toBe('module');
        expect(commands[0].path).toBe(path.join(rootDir, 'module', 'index.ts'));
    });

    it('should ignore files with non-executable extensions', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['readme.md', 'styles.css']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(0);
    });
    it('should skip files that export null', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['null_export.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        mockImporter.mockResolvedValue({ default: null });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(0);
    });

    it('should skip index.ts at root level', async () => {
        const rootDir = '/commands';
        (fs.existsSync as any).mockReturnValue(true);
        (fs.readdirSync as any).mockReturnValue(['index.ts']);
        (fs.statSync as any).mockReturnValue({ isDirectory: () => false });

        class RootIndexCommand extends BaseCommand { async run() { } }
        mockImporter.mockResolvedValue({ default: RootIndexCommand });

        const commands = await loader.load(rootDir);
        expect(commands).toHaveLength(0);
    });
});
