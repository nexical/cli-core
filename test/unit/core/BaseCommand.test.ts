import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { BaseCommand } from '../../../src/BaseCommand.js';
import * as ConfigUtils from '../../../src/utils/config.js';
import { logger } from '../../../src/utils/logger.js';
import process from 'node:process';
import pc from 'picocolors';
import { consola } from 'consola';

vi.mock('../../../src/utils/config.js');
vi.mock('../../../src/utils/logger.js');
vi.mock('consola', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        consola: {
            ...actual.consola,
            create: actual.consola?.create || actual.create || (() => ({})),
            prompt: vi.fn(),
        }
    };
});

class TestCommand extends BaseCommand {
    async run() { }
}

class ProjectRequiredCommand extends BaseCommand {
    static requiresProject = true;
    async run() { }
}

describe('BaseCommand', () => {
    let processExitSpy: any;
    let consoleLogSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();
        processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        processExitSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    it('should initialize with default options', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        expect((cmd as any).globalOptions).toEqual({});
        expect((cmd as any).projectRoot).toBeNull();
    });

    it('should use provided rootDir', async () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli, { rootDir: '/custom/root' });
        await cmd.init();
        expect((cmd as any).projectRoot).toBe('/custom/root');
        expect(ConfigUtils.findProjectRoot).not.toHaveBeenCalled();
    });

    it('should find project root if not provided', async () => {
        (ConfigUtils.findProjectRoot as any).mockResolvedValue('/found/root');
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli, {});
        await cmd.init();
        expect((cmd as any).projectRoot).toBe('/found/root');
    });

    it('should load config if project root exists', async () => {
        (ConfigUtils.findProjectRoot as any).mockResolvedValue('/found/root');
        (ConfigUtils.loadConfig as any).mockResolvedValue({ loaded: true });

        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli, {});
        await cmd.init();
        expect((cmd as any).config).toEqual({ loaded: true });
    });

    it('should error if project required but not found', async () => {
        (ConfigUtils.findProjectRoot as any).mockResolvedValue(null);

        const cli = new CLI({ commandName: 'app' });
        const cmd = new ProjectRequiredCommand(cli, {});
        await cmd.init();

        expect(consoleLogSpy).toHaveBeenCalledWith(pc.red('✖ This command requires to be run within an app project (app.yml not found).'));
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log success', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.success('test');
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.green('✔ test'));
    });

    it('should log notice', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.notice('test');
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.blue('📢 test'));
    });

    it('should log input', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.input('test');
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.cyan('? test'));
    });

    it('should log info using logger', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.info('test');
        expect(logger.info).toHaveBeenCalledWith('test');
    });

    it('should log warn', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.warn('test');
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.yellow('⚠ test'));
    });

    it('should log error string and exit', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        cmd.error('fail', 1);
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.red('✖ fail'));
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log error object and exit', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        const err = new Error('fail');
        cmd.error(err, 2);
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.red('✖ fail'));
        expect(process.exit).toHaveBeenCalledWith(2);
    });

    it('should log error object stack in debug mode', () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli, { debug: true });
        const err = new Error('fail');
        cmd.error(err);
        expect(consoleLogSpy).toHaveBeenCalledWith(pc.red('✖ fail'));
        expect(logger.error).toHaveBeenCalledWith(err.stack); // Stack is still logged via logger in debug
    });

    it('should skip config loading if project root is not found', async () => {
        (ConfigUtils.findProjectRoot as any).mockResolvedValue(null);
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli, {});
        await cmd.init();
        expect((cmd as any).projectRoot).toBeNull();
        expect(ConfigUtils.loadConfig).not.toHaveBeenCalled();
        expect((cmd as any).config).toEqual({});
    });

    it('should prompt user and return input', async () => {
        const cli = new CLI({ commandName: 'app' });
        const cmd = new TestCommand(cli);
        (consola.prompt as any).mockResolvedValue('user input');

        const res = await cmd.prompt('Enter value');

        expect(consola.prompt).toHaveBeenCalledWith('Enter value', { type: 'text' });
        expect(res).toBe('user input');
    });
});
