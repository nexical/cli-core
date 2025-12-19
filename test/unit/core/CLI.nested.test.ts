import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { BaseCommand } from '../../../src/BaseCommand.js';
import { cac } from 'cac';

// Mock CAC to capture command registration
vi.mock('cac');

class MockNestedCommand extends BaseCommand {
    static usage = 'nested command';
    static description = 'A nested command with defaults';

    // Define args/options
    static args = {
        options: [
            {
                name: '--repo <url>',
                description: 'Repository URL',
                default: 'https://github.com/default/repo'
            },
            {
                name: '--force',
                description: 'Force action',
                default: false
            },
            {
                name: '--dry-run',
                description: 'Dry run',
                default: false
            }
        ]
    };

    async run(options: any) { }
}

describe('CLI Nested Command Defaults', () => {
    let cli: CLI;
    let mockCac: any;
    let mockCommand: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCommand = {
            option: vi.fn().mockReturnThis(),
            action: vi.fn(),
            allowUnknownOptions: vi.fn().mockReturnThis(),
        };

        mockCac = {
            command: vi.fn().mockReturnValue(mockCommand),
            help: vi.fn(),
            version: vi.fn(),
            parse: vi.fn(),
            option: vi.fn().mockReturnThis(),
            outputHelp: vi.fn(),
        };
        (cac as any).mockReturnValue(mockCac);

        cli = new CLI({ commandName: 'test-cli' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should apply default option values for nested subcommands', async () => {
        const runCommandSpy = vi.spyOn(cli as any, 'runCommand');
        vi.spyOn(MockNestedCommand.prototype, 'init').mockResolvedValue(undefined);

        // Mock loader
        vi.spyOn((cli as any).loader, 'load').mockResolvedValue(undefined);
        vi.spyOn((cli as any).loader, 'getCommands').mockReturnValue([
            {
                command: 'nested command',
                class: MockNestedCommand
            }
        ]);

        // Start to register commands
        await cli.start();

        // Expect command to be registered
        // "nested" is root, "nested [subcommand] [...args]" is registered
        const commandCall = mockCac.command.mock.calls.find((call: any) => call[0].startsWith('nested'));
        expect(commandCall).toBeDefined();

        // Get the action handler
        const actionFn = mockCommand.action.mock.calls[0][0];

        // Simulate invocation: nested command (subcommand="command")
        // options undefined/empty implies defaults should be applied
        await actionFn('command', {});

        expect(runCommandSpy).toHaveBeenCalled();
        const calledOptions = runCommandSpy.mock.calls[0][1];

        expect(calledOptions).toHaveProperty('repo', 'https://github.com/default/repo');
        expect(calledOptions).toHaveProperty('force', false);
        expect(calledOptions).toHaveProperty('dryRun', false);
    });

    it('should allow overriding default values', async () => {
        const runCommandSpy = vi.spyOn(cli as any, 'runCommand');
        vi.spyOn(MockNestedCommand.prototype, 'init').mockResolvedValue(undefined);

        vi.spyOn((cli as any).loader, 'load').mockResolvedValue(undefined);
        vi.spyOn((cli as any).loader, 'getCommands').mockReturnValue([
            {
                command: 'nested command',
                class: MockNestedCommand
            }
        ]);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        // Simulate invocation with custom options
        await actionFn('command', { repo: 'custom-repo' });

        expect(runCommandSpy).toHaveBeenCalled();
        const calledOptions = runCommandSpy.mock.calls[0][1];

        expect(calledOptions).toHaveProperty('repo', 'custom-repo');
    });
});
