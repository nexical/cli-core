import { BaseCommand } from '../BaseCommand.js';
import pc from 'picocolors';

export default class HelpCommand extends BaseCommand {
    static description = 'Display help for commands.';

    static args = {
        args: [
            { name: 'command...', required: false, description: 'Command name to get help for' }
        ],
        options: []
    };

    async run(options: any) {
        const commandParts = options.command || [];
        const query = commandParts.join(' ');

        if (!query) {
            // General help
            this.printGlobalHelp();
            return;
        }

        // Search for specific command or namespace
        const commands = this.cli.getCommands();

        // Exact match?
        const exactMatch = commands.find((c: any) => c.command === query);
        if (exactMatch) {
            // Try to find CAC command if it exists (e.g. top-level commands like 'init')
            // For subcommands (e.g. 'module add'), CAC might only have 'module <subcommand>', 
            // so cacCmd will be undefined for the exact query.
            const cacCmd = this.cli.getRawCLI().commands.find((c: any) => c.name === query);

            this.printCommandHelp(exactMatch, cacCmd);
            return;
        }

        // Namespace match? (e.g. "module" matches "module add", "module remove")
        const namespaceMatches = commands.filter((c: any) => c.command.startsWith(query + ' '));

        if (namespaceMatches.length > 0) {
            console.log(`\n  Commands for ${pc.bold(query)}:\n`);
            for (const cmd of namespaceMatches) {
                const name = cmd.command;
                const desc = cmd.class.description || '';
                console.log(`  ${pc.cyan(name.padEnd(20))} ${desc}`);
            }
            console.log('');
            return;
        }

        this.error(`Unknown command: ${query}`);
    }

    private printGlobalHelp() {
        const commands = this.cli.getCommands();
        const bin = this.cli.name;

        console.log('');
        console.log(`  Usage: ${pc.cyan(bin)} <command> [options]`);
        console.log('');
        console.log('  Commands:');
        console.log('');

        for (const cmd of commands) {
            const name = cmd.command;
            const desc = cmd.class.description || '';
            console.log(`    ${pc.cyan(name.padEnd(25))} ${desc}`);
        }

        console.log('');
        console.log('  Options:');
        console.log('');
        console.log(`    ${pc.yellow('--help'.padEnd(25))} Display this message`);
        console.log(`    ${pc.yellow('--version'.padEnd(25))} Display version number`);
        console.log(`    ${pc.yellow('--root-dir <path>'.padEnd(25))} Override project root`);
        console.log(`    ${pc.yellow('--debug'.padEnd(25))} Enable debug mode`);
        console.log('');
    }

    private printCommandHelp(loadedCommand: any, cacCmd?: any) {
        const CommandClass = loadedCommand.class;

        let usage = CommandClass.usage;
        if (!usage && cacCmd) usage = cacCmd.rawName;

        // Fallback: construct usage from args definition if usage is missing
        if (!usage) {
            let tempUsage = loadedCommand.command;
            const args = CommandClass.args?.args || [];
            args.forEach((arg: any) => {
                const isVariadic = arg.name.endsWith('...');
                const cleanName = isVariadic ? arg.name.slice(0, -3) : arg.name;
                if (arg.required) tempUsage += isVariadic ? ` <...${cleanName}>` : ` <${cleanName}>`;
                else tempUsage += isVariadic ? ` [...${cleanName}]` : ` [${cleanName}]`;
            });
            usage = tempUsage;
        }

        console.log('');
        console.log(`  Usage: ${pc.cyan(usage)}`);
        console.log('');

        const description = CommandClass.description || (cacCmd && cacCmd.description) || '';
        console.log(`  ${description}`);
        console.log('');

        // Arguments
        // Prefer class definition (or cacCmd definition if we wanted, but class is source of truth for our commands)
        const argsDef = CommandClass.args?.args;
        if (argsDef && Array.isArray(argsDef) && argsDef.length > 0) {
            console.log('  Arguments:');
            for (const arg of argsDef) {
                const name = arg.name;
                const desc = arg.description || '';
                const required = arg.required ? ' (required)' : '';
                console.log(`    ${pc.cyan(name.padEnd(25))} ${desc}${pc.dim(required)}`);
            }
            console.log('');
        }

        // Options
        const optionsList = [];

        if (cacCmd) {
            // If CAC command exists, use its parsed options (includes globals)
            optionsList.push(...cacCmd.options);
        } else {
            // Reconstruct options from Class + Globals
            const classOptions = CommandClass.args?.options || [];

            for (const opt of classOptions) {
                optionsList.push({
                    rawName: opt.name, // e.g. '--repo <url>'
                    description: opt.description,
                    config: { default: opt.default }
                });
            }

            // Append Global Options manually since they are always available
            optionsList.push({ rawName: '--help', description: 'Display this message', config: {} });
            optionsList.push({ rawName: '--version', description: 'Display version number', config: {} });
            optionsList.push({ rawName: '--root-dir <path>', description: 'Override project root', config: {} });
            optionsList.push({ rawName: '--debug', description: 'Enable debug mode', config: {} });
        }

        if (optionsList.length > 0) {
            console.log('  Options:');
            for (const opt of optionsList) {
                const flags = opt.rawName.padEnd(25);
                const desc = opt.description || '';
                const def = opt.config?.default ? ` (default: ${opt.config.default})` : '';
                console.log(`    ${pc.yellow(flags)} ${desc}${pc.dim(def)}`);
            }
            console.log('');
        }
    }
}
