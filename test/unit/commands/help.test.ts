import { describe, it, expect, vi, beforeEach } from 'vitest';
import HelpCommand from '../../../src/commands/help.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
    logger: {
        success: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

import { logger } from '../../../src/utils/logger.js';

// Mock picocolors to return strings as-is for easy assertion
vi.mock('picocolors', () => ({
    default: {
        bold: (s: string) => s,
        cyan: (s: string) => s,
        yellow: (s: string) => s,
        dim: (s: string) => s,
        red: (s: string) => s,
    }
}));

describe('HelpCommand', () => {
    let mockCli: any;
    let mockRawCli: any;
    let consoleLogSpy: any;
    let processExitSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();

        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });

        mockRawCli = {
            outputHelp: vi.fn(),
            commands: []
        };

        mockCli = {
            name: 'app',
            getCommands: vi.fn(),
            getRawCLI: vi.fn().mockReturnValue(mockRawCli)
        };
    });

    it('should display global help if no args provided', async () => {
        const cmd = new HelpCommand(mockCli);

        // Mock commands for global list
        mockCli.getCommands.mockReturnValue([
            { command: 'init', class: { description: 'Init desc' } },
            { command: 'undocumented', class: { description: undefined } } // No desc
        ]);

        await cmd.run({ command: [] }); // No args

        // expect(mockRawCli.outputHelp).toHaveBeenCalled(); // No longer called
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: app'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('init'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Init desc'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('undocumented'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--help'));
    });

    it('should handle undefined command option safely', async () => {
        const cmd = new HelpCommand(mockCli);

        // Mock commands
        mockCli.getCommands.mockReturnValue([]);

        await cmd.run({}); // No options object keys

        // expect(mockRawCli.outputHelp).toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: app'));
    });

    it('should display exact command help if matched', async () => {
        const cmd = new HelpCommand(mockCli);

        // Mock loaded commands with args definition
        mockCli.getCommands.mockReturnValue([
            {
                command: 'init',
                class: {
                    description: 'Initialize project',
                    args: {
                        args: [
                            { name: 'name', description: 'Project Name', required: true },
                            { name: 'optional', description: undefined, required: false }
                        ]
                    }
                }
            }
        ]);

        // Mock CAC commands structure
        mockRawCli.commands = [
            {
                name: 'init',
                rawName: 'init <name>',
                description: 'Initialize project',
                options: [
                    { name: 'force', rawName: '--force', description: 'Force overwrite', config: { default: false } }
                ]
            }
        ];

        await cmd.run({ command: ['init'] });

        // Should not call global help
        expect(mockRawCli.outputHelp).not.toHaveBeenCalled();

        // Should print usage
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: init <name>'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Initialize project'));
        // Arguments
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Arguments:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Project Name'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(required)'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('optional'));
        // Options
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--force'));
    });

    it('should display subcommand help when CAC command is missing (fallback to LoadedCommand)', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'module add',
            class: {
                usage: 'module add <url>',
                description: 'Add a module',
                args: {
                    args: [{ name: 'url', required: true, description: 'Module URL' }]
                }
            }
        }]);
        mockRawCli.commands = []; // CAC doesn't know about it

        await cmd.run({ command: ['module', 'add'] });

        // Should print usage using the fallback logic
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: module add <url>'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Add a module'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Arguments:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module URL'));
    });

    it('should display subcommand help with options when CAC command is missing', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'module custom',
            class: {
                usage: 'module custom',
                description: 'Custom module cmd',
                args: {
                    options: [
                        { name: '--flag', description: 'A flag', default: false }
                    ]
                }
            }
        }]);
        mockRawCli.commands = [];

        await cmd.run({ command: ['module', 'custom'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--flag'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('A flag'));
    });

    it('should display command help with options having defaults', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{ command: 'build', class: {} }]);
        mockRawCli.commands = [{
            name: 'build',
            rawName: 'build',
            description: 'Build project',
            options: [
                { name: 'out', rawName: '--out', description: 'Output', config: { default: 'dist' } },
                { name: 'quiet', rawName: '--quiet', description: undefined, config: {} } // No description option
            ]
        }];

        await cmd.run({ command: ['build'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(default: dist)'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('--quiet'));
    });

    it('should display command help without options', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{ command: 'info', class: {} }]);
        mockRawCli.commands = [{
            name: 'info',
            rawName: 'info',
            description: 'Info',
            options: [] // No options
        }];

        await cmd.run({ command: ['info'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Info'));
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Options:'));
    });

    it('should display namespace commands', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([
            { command: 'module add', class: { description: 'Add module' } },
            { command: 'module remove', class: { description: 'Remove module' } },
            { command: 'module secret', class: {} }, // No description
            { command: 'init', class: {} }
        ]);

        await cmd.run({ command: ['module'] });

        expect(mockRawCli.outputHelp).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands for module:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('module add'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('module add'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('module remove'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('module secret'));
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('init'));
    });

    it('should auto-generate usage if static usage is missing and CAC command is missing', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'test cmd',
            class: {
                description: 'Test command',
                args: {
                    args: [
                        { name: 'arg1', required: true },
                        { name: 'arg2', required: false },
                        { name: 'variadic...', required: false }
                    ]
                }
            }
        }]);
        mockRawCli.commands = [];

        await cmd.run({ command: ['test', 'cmd'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: test cmd <arg1> [arg2] [...variadic]'));
    });

    // NEW TEST CASES FOR 100% COVERAGE

    it('should generate usage correctly for command with no args definitions', async () => {
        const cmd = new HelpCommand(mockCli);

        // Class has no 'args' property at all
        mockCli.getCommands.mockReturnValue([{
            command: 'simple',
            class: {}
        }]);
        mockRawCli.commands = [];

        await cmd.run({ command: ['simple'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: simple'));
    });

    it('should fallback to CAC description if Class description is missing', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'mixed',
            class: { usage: 'mixed' } // has usage, no desc
        }]);
        mockRawCli.commands = [{
            name: 'mixed',
            description: 'CAC Description',
            options: []
        }];

        await cmd.run({ command: ['mixed'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('CAC Description'));
    });

    it('should default to empty description if both Class and CAC descriptions are missing', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'nodesc',
            class: { usage: 'nodesc' }
        }]);
        // CAC command undefined scenario or CAC command with no desc
        mockRawCli.commands = [{ name: 'nodesc', options: [] }]; // no desc

        await cmd.run({ command: ['nodesc'] });

        // Cannot easily check for "empty line" specific to description unless we check call order or strict output
        // But verifying it doesn't crash is good.
        // We can check valid output presence
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: nodesc'));
    });

    it('should handle required variadic arguments in usage generation', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([{
            command: 'variadic',
            class: {
                args: {
                    args: [
                        { name: 'files...', required: true }
                    ]
                }
            }
        }]);
        mockRawCli.commands = [];

        await cmd.run({ command: ['variadic'] });

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: variadic <...files>'));
    });

    it('should error on unknown command', async () => {
        const cmd = new HelpCommand(mockCli);

        mockCli.getCommands.mockReturnValue([]);

        try {
            await cmd.run({ command: ['unknown'] });
        } catch (e: any) {
            expect(e.message).toBe('EXIT');
        }

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown command: unknown'));
    });
});
