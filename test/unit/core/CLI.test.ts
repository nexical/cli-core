import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLI } from '../../../src/CLI.js';
import { CommandLoader } from '../../../src/CommandLoader.js';
import { BaseCommand } from '../../../src/BaseCommand.js';
import { cac } from 'cac';
import fs from 'node:fs';
import path from 'node:path';

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

import { setDebugMode, logger } from '../../../src/utils/logger.js';

class MockCommand extends BaseCommand {
    static description = 'Mock Desc';
    static args = {
        args: [{ name: 'arg1', required: true }, { name: 'arg2', required: false }],
        options: [{ name: '--opt', description: 'desc', default: 'val' }]
    };
    async run() { }
}

describe('CLI', () => {
    let mockCac: any;
    let mockCommand: any;
    let mockLoad: any;
    let mockGetCommands: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCommand = {
            option: vi.fn().mockReturnThis(),
            action: vi.fn(),
            allowUnknownOptions: vi.fn().mockReturnThis(), // Added this
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

        mockGetCommands = vi.fn().mockReturnValue([]);
        mockLoad = vi.fn().mockImplementation(async () => mockGetCommands());

        // Fix: mockImplementation must return a class or function that returns an object
        (CommandLoader as any).mockImplementation(function () {
            return {
                load: mockLoad,
                getCommands: mockGetCommands
            };
        });
    });

    it('should start and load commands', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockLoad).toHaveBeenCalled();
        // expect(mockCac.help).toHaveBeenCalled(); // Default help disabled
        expect(mockCac.version).toHaveBeenCalled();
        expect(mockCac.parse).toHaveBeenCalled();
    });

    it('should enable debug mode if --debug flag is present', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const originalArgv = process.argv;
        process.argv = [...originalArgv, '--debug'];

        await cli.start();

        expect(setDebugMode).toHaveBeenCalledWith(true);
        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'));

        process.argv = originalArgv;
    });

    it('should search for commands in multiple directories', async () => {
        const cli = new CLI();
        (fs.existsSync as any)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true); // second path found

        await cli.start();
        expect(fs.existsSync).toHaveBeenCalledTimes(2);
        expect(mockLoad).toHaveBeenCalled();
    });

    it('should register loaded commands', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockCac.command).toHaveBeenCalledWith(
            expect.stringContaining('test [arg1] [arg2]'), // Changed to optional brackets
            'Mock Desc'
        );
        expect(mockCommand.option).toHaveBeenCalledWith('--opt', 'desc', { default: 'val' });
        expect(mockCommand.action).toHaveBeenCalled();
    });

    it('should handle command execution', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        const initSpy = vi.spyOn(MockCommand.prototype, 'init');
        const runSpy = vi.spyOn(MockCommand.prototype, 'run');

        // simulate cac calling action
        await actionFn('val1', 'val2', { opt: 'custom' });

        expect(initSpy).toHaveBeenCalled();
        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            arg1: 'val1',
            arg2: 'val2',
            opt: 'custom'
        }));
    });

    it('should handle command execution errors', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        vi.spyOn(MockCommand.prototype, 'init').mockRejectedValue(new Error('Init failed'));
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await actionFn('arg1', {}, {});

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Init failed'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should print stack trace in debug mode', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        vi.spyOn(MockCommand.prototype, 'init').mockRejectedValue(new Error('Init failed'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        await actionFn('arg1', { debug: true });

        expect(consoleSpy).toHaveBeenCalledTimes(2); // message + stack
    });

    it('should handle parse errors', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);
        mockCac.parse.mockImplementation(() => { throw new Error('Parse error'); });

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        await cli.start();

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Parse error'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should show help for detected command on global error', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) },
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        // Mock parse to throw
        mockCac.parse.mockImplementation(() => { throw new Error('Global error'); });

        // Mock process.argv to simulate 'test' command
        const originalArgv = process.argv;
        process.argv = ['node', 'cli', 'test', '--error'];

        try {
            await cli.start();
        } finally {
            process.argv = originalArgv;
        }

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Global error'));
        expect(mockHelpRun).toHaveBeenCalledWith({ command: ['test'] });
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
    it('should handle positional arguments mapping', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        // Mock init to prevent real execution issues
        vi.spyOn(MockCommand.prototype, 'init').mockResolvedValue(undefined);
        const runSpy = vi.spyOn(MockCommand.prototype, 'run');

        // simulate cac calling action with positional args
        await actionFn('val1', 'val2', { opt: 'custom' });

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            arg1: 'val1',
            arg2: 'val2',
            opt: 'custom'
        }));
    });

    it('should map positional args correctly when fewer provided', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        // Mock init here too
        vi.spyOn(MockCommand.prototype, 'init').mockResolvedValue(undefined);
        const runSpy = vi.spyOn(MockCommand.prototype, 'run');

        // Provide only 1 arg
        await actionFn('val1', { opt: 'default' });

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            arg1: 'val1',
            opt: 'default'
        }));
        // arg2 should be undefined in options if not provided
    });

    it('should handle missing commands directory gracefully', async () => {
        (fs.existsSync as any).mockReturnValue(false);
        const cli = new CLI();
        // Should not throw
        await cli.start();
        expect(mockLoad).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith('No commands directory found.');
    });

    it('should register command without args or options', async () => {
        const cli = new CLI();
        class SimpleCommand extends BaseCommand {
            static description = undefined as unknown as string; // Cover missing description
            async run() { }
        }

        mockGetCommands.mockReturnValue([
            { command: 'simple', class: SimpleCommand, instance: new SimpleCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockCac.command).toHaveBeenCalledWith('simple', '');
    });
    it('should register command with options but no positional args', async () => {
        const cli = new CLI();
        class NoArgsCommand extends BaseCommand {
            static args = {
                options: [{ name: '--flag', description: 'flag', default: false }]
            }; // No 'args' array
            async run() { }
        }

        mockGetCommands.mockReturnValue([
            { command: 'noargs', class: NoArgsCommand, instance: new NoArgsCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        // This should trigger the line 85 check (argsDef.args is undefined)
        await actionFn({}, { flag: true });

        expect(mockCommand.option).toHaveBeenCalledWith('--flag', 'flag', { default: false });
    });
    it('should register command with absolutely no metadata', async () => {
        const cli = new CLI();
        class NoMetadataCommand extends BaseCommand {
            // No static args at all
            async run() { }
        }
        // Force args to be undefined if it was inherited or defaulted
        (NoMetadataCommand as any).args = undefined;

        mockGetCommands.mockReturnValue([
            { command: 'nometadata', class: NoMetadataCommand, instance: new NoMetadataCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        // Should register with empty description and no options/args
        expect(mockCac.command).toHaveBeenCalledWith(expect.stringContaining('nometadata'), '');
    });

    it('should map variadic arguments correctly', async () => {
        // Test class with variadic args
        class VariadicCommand extends BaseCommand {
            static args = {
                args: [{ name: 'items...', required: true }]
            };
            async run() { }
        }
        mockGetCommands.mockReturnValue([{
            command: 'list',
            class: VariadicCommand,
            path: '/path/to/list.ts'
        }]);

        const cli = new CLI();
        await cli.start();

        // Simulate execution: list a b c
        const action = mockCommand.action.mock.calls[0][0]; // First registered cmd action
        // args: [['a', 'b', 'c'], options] - CAC passes variadic as array
        const options: any = {};
        await action(['a', 'b', 'c'], options);

        // Expect options.items to be ['a', 'b', 'c']
        expect(options.items).toEqual(['a', 'b', 'c']);

        // Case 2: Empty variadic
        const optionsEmpty: any = {};
        await action(optionsEmpty);
        expect(optionsEmpty.items).toBeUndefined();
    });

    it('should expose commands and raw CLI instance', async () => {
        const cli = new CLI();
        // Just verify they return what we expect (even if empty/mocked)
        expect(cli.getRawCLI()).toBeDefined();
        expect(cli.getCommands()).toEqual([]);

        // After start, commands should be populated
        mockGetCommands.mockReturnValue([]);
        (fs.existsSync as any).mockReturnValue(false);
        await cli.start();

        expect(cli.getCommands()).toEqual([]);
    });

    it('should register optional variadic command', async () => {
        const cli = new CLI();
        class OpVarCommand extends BaseCommand {
            static args = {
                args: [{ name: 'files...', required: false }],
                options: [{ name: '--verbose', description: 'Verbose' }] // No default
            };
            async run() { }
        }

        mockGetCommands.mockReturnValue([
            { command: 'opvar', class: OpVarCommand, instance: new OpVarCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        expect(mockCac.command).toHaveBeenCalledWith(
            expect.stringContaining('opvar [...files]'),
            expect.anything()
        );
        expect(mockCommand.option).toHaveBeenCalledWith('--verbose', 'Verbose', { default: undefined });
    });
    it('should register and run grouped subcommands', async () => {
        const cli = new CLI();
        class GroupCommand extends BaseCommand {
            static args = {
                args: [{ name: 'arg1', required: true }],
                options: [{ name: '--force', description: 'Force' }]
            };
            async run() { }
        }

        mockGetCommands.mockReturnValue([
            { command: 'group add', class: GroupCommand, instance: new GroupCommand(cli) },
            { command: 'group remove', class: GroupCommand, instance: new GroupCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        // Should register the group root
        expect(mockCac.command).toHaveBeenCalledWith(
            expect.stringContaining('group [subcommand] [...args]'),
            expect.anything()
        );

        // Find the action for the group command
        // Since we registered multiple commands, find the call for 'group ...'
        const groupCall = mockCac.command.mock.calls.find((call: any) => call[0].startsWith('group'));
        expect(groupCall).toBeDefined();

        // The processed command object (mockCommand) was returned by mockCac.command
        // So mockCommand.action was called. We need to know WHICH action call corresponds to this.
        // But our mockCac.command always returns the SAME mockCommand object.
        // So mockCommand.action has been called multiple times (for 'test', 'opvar', etc from other tests if we didn't clear mocks properly, but beforeEach does clear).
        // In THIS test, it's called for 'group ...'.

        const actionFn = mockCommand.action.mock.calls[0][0];

        const runSpy = vi.spyOn(GroupCommand.prototype, 'run');
        vi.spyOn(GroupCommand.prototype, 'init').mockResolvedValue(undefined);

        // Simulate running: group add val1 --force
        // Args passed to action: subcommand, ...args, options
        // subcommand = 'add'
        // args = [['val1']] (variadic)
        // options = { force: true }
        await actionFn('add', ['val1'], { force: true });

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            arg1: 'val1',
            force: true
        }));
    });

    it('should handle unknown subcommand', async () => {
        const cli = new CLI();
        mockGetCommands.mockReturnValue([
            { command: 'group add', class: MockCommand, instance: new MockCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('EXIT'); }) as any);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Run unknown subcommand
        await expect(actionFn('unknown', [], {})).rejects.toThrow('EXIT');

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should map positional args in subcommand', async () => {
        const cli = new CLI();
        class SubArgsCommand extends BaseCommand {
            static args = {
                args: [{ name: 'p1', required: true }, { name: 'p2', required: false }]
            };
            async run() { }
        }
        mockGetCommands.mockReturnValue([
            { command: 'sys config', class: SubArgsCommand, instance: new SubArgsCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];
        const runSpy = vi.spyOn(SubArgsCommand.prototype, 'run');
        vi.spyOn(SubArgsCommand.prototype, 'init').mockResolvedValue(undefined);

        // sys config a b
        await actionFn('config', ['a', 'b'], {});

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            p1: 'a',
            p2: 'b'
        }));
    });

    it('should map variadic args in subcommand', async () => {
        const cli = new CLI();
        class SubVarCommand extends BaseCommand {
            static args = {
                args: [{ name: 'files...', required: true }]
            };
            async run() { }
        }
        mockGetCommands.mockReturnValue([
            { command: 'sys add', class: SubVarCommand, instance: new SubVarCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];
        const runSpy = vi.spyOn(SubVarCommand.prototype, 'run');
        vi.spyOn(SubVarCommand.prototype, 'init').mockResolvedValue(undefined);

        await actionFn('add', ['f1', 'f2'], {});

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            files: ['f1', 'f2']
        }));
    });

    it('should handle subcommand without metadata', async () => {
        const cli = new CLI();
        class NoMetaSubCommand extends BaseCommand {
            async run() { }
        }
        (NoMetaSubCommand as any).args = undefined;

        mockGetCommands.mockReturnValue([
            { command: 'sys plain', class: NoMetaSubCommand, instance: new NoMetaSubCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];
        const runSpy = vi.spyOn(NoMetaSubCommand.prototype, 'run');
        vi.spyOn(NoMetaSubCommand.prototype, 'init').mockResolvedValue(undefined);

        await actionFn('plain', {});

        expect(runSpy).toHaveBeenCalled();
    });

    it('should map positional args in subcommand when fewer provided', async () => {
        const cli = new CLI();
        class SubOptCommand extends BaseCommand {
            static args = {
                args: [{ name: 'r1', required: true }, { name: 'o1', required: false }]
            };
            async run() { }
        }
        mockGetCommands.mockReturnValue([
            { command: 'sys opt', class: SubOptCommand, instance: new SubOptCommand(cli) }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];
        const runSpy = vi.spyOn(SubOptCommand.prototype, 'run');
        vi.spyOn(SubOptCommand.prototype, 'init').mockResolvedValue(undefined);

        // Provides 1 arg, expects 2 slots
        await actionFn('opt', ['val1'], {});

        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            r1: 'val1'
        }));
        expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
            r1: 'val1'
        }));
        // o1 should be undefined
    });

    it('should intercept --help flag and run HelpCommand', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) },
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        await cli.start();


        // 'help' is registered first (index 0), 'test' is second (index 1)
        const actionFn = mockCommand.action.mock.calls[1][0]; // test command action

        // Call action with help: true options AND NO positional args (args=[{help:true}])
        // This ensures validation (which requires arg1) is skipped
        await actionFn({ help: true });

        expect(mockHelpRun).toHaveBeenCalledWith({ command: ['test'] });
    });

    it('should handle help for valid subcommand without crashing', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        class SubCmd extends BaseCommand { async run() { } }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) },
            { command: 'mod sub', class: SubCmd, instance: new SubCmd(cli) }
        ]);

        await cli.start();

        // Find action for 'mod <subcommand>'
        // It should be the second registered command after help
        const actionFn = mockCommand.action.mock.calls[1][0];

        // Call action with subcommand='sub' and help: true
        await actionFn('sub', [], { help: true });

        expect(mockHelpRun).toHaveBeenCalledWith({ command: ['mod', 'sub'] });
    });

    it('should handle help for module root (subcommand undefined)', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) },
            { command: 'mod sub', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        await cli.start();
        const actionFn = mockCommand.action.mock.calls[1][0];

        // Call action with subcommand=undefined (simulating 'module --help')
        await actionFn(undefined, [], { help: true });

        // Should call with just ['mod']
        // Should call with just ['mod']
        expect(mockHelpRun).toHaveBeenCalledWith({ command: ['mod'] });
    });

    it('should validate required arguments for subcommands manually', async () => {
        // Setup a subcommand with a required argument
        const MockSubCommandClass = class {
            static args = {
                args: [{ name: 'reqArg', required: true }]
            };
            static description = 'Subcommand Desc';
            setCli() { }
            init() { return Promise.resolve(); }
            run() { return Promise.resolve(); }
        };

        mockGetCommands.mockReturnValue([
            { command: 'module sub', class: MockSubCommandClass, instance: new MockSubCommandClass() }
        ]);
        (fs.existsSync as any).mockReturnValue(true);

        const cli = new CLI();
        await cli.start();

        // The action handler for 'module sub'
        // 'module' is root, 'sub' is subcommand. 
        // We find the action handler registered for 'module [subcommand] [...args]'
        // It should be the first one since we only loaded one command group
        const actionFn = mockCac.command.mock.results[0].value.action.mock.calls[0][0];

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const helpSpy = vi.spyOn(cli as any, 'runHelp').mockResolvedValue(undefined as any);

        // Call action validation failure: subcommand='sub', options={}
        // Missing 'reqArg' which is the first arg after subcommand
        await actionFn('sub', {});

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing required argument: reqArg'));
        expect(helpSpy).toHaveBeenCalledWith(['module', 'sub']);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should show help when subcommand is missing (no help flag)', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) },
            { command: 'sys info', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        await cli.start();
        const actionFn = mockCommand.action.mock.calls[1][0];

        // Call action with subcommand=undefined and NO help flag
        await actionFn(undefined, [], {});

        expect(mockHelpRun).toHaveBeenCalledWith({ command: ['sys'] });
    });

    it('should handle global --help flag with no command', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run(opts: any) { mockHelpRun(opts); }
        }

        mockGetCommands.mockReturnValue([
            { command: 'help', class: MockHelpCommand, instance: new MockHelpCommand(cli) }
        ]);

        const originalArgv = process.argv;
        process.argv = ['node', 'app', '--help'];

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code: any) => {
            // throw to stop execution flow if needed, but the code calls it at the end
        }) as any);

        await cli.start();

        expect(mockHelpRun).toHaveBeenCalledWith({ command: [] });
        expect(exitSpy).toHaveBeenCalledWith(0);

        process.argv = originalArgv;
    });

    it('should fallback to native help output if HelpCommand is missing', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        // Load commands but NO help command
        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        await cli.start();

        const actionFn = mockCommand.action.mock.calls[0][0];

        // Access private method to force the fallback path? 
        // Or just trigger help via action options

        await actionFn({}, { help: true });


        expect(mockCac.outputHelp).toHaveBeenCalled();
    });

    it('should NOT run global help if command args are present with --help', async () => {
        const cli = new CLI();
        (fs.existsSync as any).mockReturnValue(true);

        mockGetCommands.mockReturnValue([
            { command: 'test', class: MockCommand, instance: new MockCommand(cli) }
        ]);

        const mockHelpRun = vi.fn();
        class MockHelpCommand extends BaseCommand {
            async run() { mockHelpRun(); }
        }
        (cli as any).HelpCommandClass = MockHelpCommand;

        const originalArgv = process.argv;
        // Simulate: app test --help
        process.argv = ['node', 'app', 'test', '--help'];

        await cli.start();

        // Should NOT call global help run
        expect(mockHelpRun).not.toHaveBeenCalled();

        // Should fall through to parse
        expect(mockCac.parse).toHaveBeenCalled();

        process.argv = originalArgv;
    });
});
