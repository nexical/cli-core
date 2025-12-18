
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { BaseCommand } from '../../../src/BaseCommand.js';
import * as ConfigUtils from '../../../src/utils/config.js';
import pc from 'picocolors';
import process from 'node:process';

vi.mock('../../../src/utils/config.js');

class TestProjectRequiredCommand extends BaseCommand {
    static requiresProject = true;
    async run() { }
}

describe('Config Loading & Error Messaging', () => {
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

    it('should propagate command name to config loading', async () => {
        const cli = new CLI({ commandName: 'astrical' });
        const command = new TestProjectRequiredCommand(cli);

        // Mock finding root so we don't error out immediately on missing root check logic if we want to proceed,
        // but wait, we want to verify findProjectRoot call.
        (ConfigUtils.findProjectRoot as any).mockResolvedValue('/some/path');
        (ConfigUtils.loadConfig as any).mockResolvedValue({});

        await command.init();
        // project root finding happens in init, verification happens in runInit
        // but this test marks requiresProject=true, so if we don't call runInit, we only verify init logic.
        // The original test verified init logic calling loadConfig.

        expect(ConfigUtils.findProjectRoot).toHaveBeenCalledWith('astrical', expect.any(String));
        // loadConfig is called in init if root is found
        expect(ConfigUtils.loadConfig).toHaveBeenCalledWith('astrical', '/some/path');
    });

    it('should show correct error message when project root is missing for named command', async () => {
        const cli = new CLI({ commandName: 'astrical' });
        const command = new TestProjectRequiredCommand(cli);

        (ConfigUtils.findProjectRoot as any).mockResolvedValue(null);

        await command.init();
        await command.runInit({});

        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining(pc.red('✖ This command requires to be run within an app project (astrical.yml not found).'))
        );
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should show default error message when using default name', async () => {
        const cli = new CLI(); // default 'app'
        const command = new TestProjectRequiredCommand(cli);

        (ConfigUtils.findProjectRoot as any).mockResolvedValue(null);

        await command.init();
        await command.runInit({});

        expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringContaining(pc.red('✖ This command requires to be run within an app project (app.yml not found).'))
        );
    });
});
