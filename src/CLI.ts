import { cac } from 'cac';
import { CommandLoader } from './CommandLoader.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import pkg from '../package.json';
import { logger, setDebugMode } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CLIConfig {
    version?: string;
    commandName?: string;
    searchDirectories?: string[];
}

export class CLI {
    public name: string;
    public version: string;
    private cli: ReturnType<typeof cac>;
    private loader: CommandLoader;
    private HelpCommandClass: any;
    private config: CLIConfig;

    constructor(config: CLIConfig = {}) {
        this.config = config;
        this.name = this.config.commandName || 'app';
        this.version = this.config.version || pkg.version;
        this.cli = cac(this.name);
        this.loader = new CommandLoader(this);
    }

    private loadedCommands: any[] = [];

    getCommands() {
        return this.loadedCommands;
    }

    getRawCLI() {
        return this.cli;
    }

    async start() {
        if (process.argv.includes('--debug')) {
            setDebugMode(true);
            logger.debug('Debug mode enabled via --debug flag');
        }

        let commandsDirs: string[] = [];

        if (this.config.searchDirectories && this.config.searchDirectories.length > 0) {
            commandsDirs = [...this.config.searchDirectories];
        } else {
            const possibleDirs = [
                path.resolve(__dirname, './src/commands'),
                path.resolve(process.cwd(), 'commands')    // Fallback relative to cwd
            ];

            for (const dir of possibleDirs) {
                if (fs.existsSync(dir)) {
                    commandsDirs.push(dir);
                }
            }
        }

        // Always add core commands directory (where help command lives)
        const coreCommandsDir = path.resolve(__dirname, './commands');
        const coreCommandsDirSrc = path.resolve(__dirname, './src/commands');

        if (fs.existsSync(coreCommandsDir)) {
            commandsDirs.push(coreCommandsDir);
        } else if (fs.existsSync(coreCommandsDirSrc)) {
            // Fallback for tsup chunking which puts CLI in dist/ but keeps src/commands in dist/src/commands
            commandsDirs.push(coreCommandsDirSrc);
        }

        // Fallback or error
        if (commandsDirs.length === 0) {
            logger.debug("No commands directory found.");
        }

        for (const dir of commandsDirs) {
            // Loader accumulates commands
            await this.loader.load(dir);
        }
        this.loadedCommands = this.loader.getCommands();

        // Group commands by root command name
        const commandGroups: Record<string, any[]> = {};
        // Locate HelpCommand for fallback usage
        const helpCmd = this.loadedCommands.find(c => c.command === 'help');
        if (helpCmd) {
            this.HelpCommandClass = helpCmd.class;
        }

        for (const cmd of this.loadedCommands) {
            const root = cmd.command.split(' ')[0];
            if (!commandGroups[root]) commandGroups[root] = [];
            commandGroups[root].push(cmd);
        }

        for (const [root, cmds] of Object.entries(commandGroups)) {
            // Case 1: Single command, no subcommands (e.g. 'init')
            if (cmds.length === 1 && cmds[0].command === root) {
                const cmd = cmds[0];
                const CommandClass = cmd.class;
                // Original logic for single command
                let commandName = cmd.command;
                const argsDef = CommandClass.args || {};
                if (argsDef.args) {
                    argsDef.args.forEach((arg: any) => {
                        const isVariadic = arg.name.endsWith('...');
                        const cleanName = isVariadic ? arg.name.slice(0, -3) : arg.name;
                        // Always use optional brackets [] for CAC to allow --help to pass validation
                        // We will enforce 'required' manually in the action handler
                        commandName += isVariadic ? ` [...${cleanName}]` : ` [${cleanName}]`;
                    });
                }
                const cacCommand = this.cli.command(commandName, CommandClass.description || '');

                // Register options
                if (argsDef.options) {
                    argsDef.options.forEach((opt: any) => {
                        cacCommand.option(opt.name, opt.description, { default: opt.default });
                    });
                }
                this.registerGlobalOptions(cacCommand);

                cacCommand.action(async (...args: any[]) => {
                    const options = args.pop();

                    if (options.help) {
                        await this.runHelp([cmd.command]);
                        return;
                    }

                    const positionalArgs = args;

                    if (argsDef.args) {
                        argsDef.args.forEach((arg: any, index: number) => {
                            const isVariadic = arg.name.endsWith('...');
                            const name = isVariadic ? arg.name.slice(0, -3) : arg.name;
                            const val = positionalArgs[index];

                            if (val !== undefined) {
                                options[name] = val;
                            } else if (arg.required) {
                                console.error(pc.red(`Missing required argument: ${name}`));
                                this.runHelp([cmd.command]).then(() => process.exit(1));
                                return;
                            }
                        });
                    }
                    await this.runCommand(CommandClass, options, [cmd.command]);
                });
            } else {
                // Case 2: Command with subcommands (e.g. 'module add')
                // Register 'module <subcommand>' catch-all
                const commandName = `${root} [subcommand] [...args]`;
                const cacCommand = this.cli.command(commandName, `Manage ${root} commands`);

                cacCommand.allowUnknownOptions(); // Pass options to subcommand
                this.registerGlobalOptions(cacCommand);

                cacCommand.action(async (subcommand: string, ...args: any[]) => {
                    const options = args.pop(); // last is options

                    if (!subcommand || options.help) {
                        await this.runHelp([root, subcommand].filter(Boolean));
                        return;
                    }


                    // Find matching command
                    // Match against "root subcommand"
                    const fullCommandName = `${root} ${subcommand}`;
                    const cmd = cmds.find(c => c.command === fullCommandName);

                    if (!cmd) {
                        console.error(pc.red(`Unknown subcommand '${subcommand}' for '${root}'`));
                        process.exit(1);
                    }

                    const CommandClass = cmd.class;
                    const argsDef = CommandClass.args || {};
                    const positionalArgs = (args.length > 0 && Array.isArray(args[0])) ? args[0] : args;

                    const childOptions = { ...options }; // Copy options

                    const cmdParts = [root, subcommand];

                    if (argsDef.args) {
                        argsDef.args.forEach((arg: any, index: number) => {
                            const isVariadic = arg.name.endsWith('...');
                            const name = isVariadic ? arg.name.slice(0, -3) : arg.name;
                            const val = positionalArgs[index];

                            if (val !== undefined) {
                                if (isVariadic) {
                                    childOptions[name] = positionalArgs.slice(index);
                                } else {
                                    childOptions[name] = val;
                                }
                            } else if (arg.required) {
                                console.error(pc.red(`Missing required argument: ${name}`));
                                this.runHelp(cmdParts).then(() => process.exit(1));
                                return;
                            }
                        });
                    }

                    if (argsDef.options) {
                        argsDef.options.forEach((opt: any) => {
                            const name = opt.name.replace(/^-+/, ''); // remove leading dashes
                            const camelName = name.split(' ')[0].replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());

                            // Check both raw name and camelCase name
                            // CAC usually provides camelCase options
                            if (childOptions[camelName] === undefined && opt.default !== undefined) {
                                childOptions[camelName] = opt.default;
                            }
                        });
                    }

                    await this.runCommand(CommandClass, childOptions, cmdParts);
                });
            }
        }

        // Manually register global help to ensure it's allowed
        this.cli.option('--help, -h', 'Display help');

        this.cli.version(this.version);

        if (process.argv.includes('--help') || process.argv.includes('-h')) {
            // Inspect non-option args to see if there's a command?
            const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
            if (args.length === 0) {
                await this.runHelp([]);
                process.exit(0);
            }
        }

        try {
            this.cli.parse();
        } catch (e: any) {
            console.error(pc.red(e.message));

            // Try to provide helpful context
            console.log('');
            // Simple heuristic: find first non-flag arg as command
            const args = process.argv.slice(2);
            const potentialCommand = args.find(a => !a.startsWith('-'));
            const helpArgs = potentialCommand ? [potentialCommand] : [];
            await this.runHelp(helpArgs);

            process.exit(1);
        }
    }

    private registerGlobalOptions(cacCommand: any) {
        cacCommand.option('--root-dir <path>', 'Override project root');
        cacCommand.option('--debug', 'Enable debug mode');
        cacCommand.option('--help, -h', 'Display help message');
    }

    private async runHelp(commandParts: string[]) {
        if (this.HelpCommandClass) {
            const helpInstance = new this.HelpCommandClass(this);
            await helpInstance.run({ command: commandParts });
        } else {
            // Fallback if HelpCommand not loaded (shouldn't happen)
            this.cli.outputHelp();
        }
    }

    private async runCommand(CommandClass: any, options: any, commandParts: string[] = []) {
        try {
            const instance = new CommandClass(this, options);
            await instance.init();
            await instance.runInit(options);
        } catch (e: any) {
            console.error(pc.red(e.message));
            if (options.debug) console.error(e.stack);

            console.log(''); // spacer
            await this.runHelp(commandParts);

            process.exit(1);
        }
    }
}
