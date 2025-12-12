import { logger } from './utils/logger.js';
import { CommandDefinition, CommandInterface } from './CommandInterface.js';
import { findProjectRoot, loadConfig } from './utils/config.js';
import process from 'node:process';
import pc from 'picocolors';
import { consola } from 'consola';

export abstract class BaseCommand implements CommandInterface {
    static usage = '';
    static description = '';
    static args: CommandDefinition = {};

    // Configurable flags
    static requiresProject = false;

    protected projectRoot: string | null = null;
    protected config: any = {};
    protected globalOptions: any = {};
    protected cli: any = null;


    constructor(cli: any, globalOptions: any = {}) {
        this.globalOptions = globalOptions;
        this.cli = cli;
    }

    async init() {
        // 1. Root detection strategy
        if (this.globalOptions.rootDir) {
            this.projectRoot = this.globalOptions.rootDir;
        } else {
            this.projectRoot = await findProjectRoot(this.cli.name, process.cwd());
        }

        const requiresProject = (this.constructor as any).requiresProject;

        if (requiresProject && !this.projectRoot) {
            this.error('This command requires to be run within an app project (app.yml not found).', 1);
            return; // TS doesn't know error exits
        }

        if (this.projectRoot) {
            this.config = await loadConfig(this.cli.name, this.projectRoot);
            // logger.debug(`Loaded config from ${this.projectRoot}`);
        }
    }

    abstract run(options: any): Promise<void>;

    // Helpers
    success(msg: string) {
        console.log(pc.green('✔ ' + msg));
    }

    notice(msg: string) {
        console.log(pc.blue('📢 ' + msg));
    }

    input(msg: string) {
        console.log(pc.cyan('? ' + msg));
    }

    info(msg: string) {
        console.log(msg);
    }

    warn(msg: string) {
        console.log(pc.yellow('⚠ ' + msg));
    }

    error(msg: string | Error, code = 1) {
        if (msg instanceof Error) {
            console.log(pc.red('✖ ' + msg.message));
            if (this.globalOptions.debug) {
                logger.error(msg.stack);
            }
        } else {
            console.log(pc.red('✖ ' + msg));
        }
        process.exit(code);
    }

    async prompt(msg: string): Promise<string> {
        const response = await consola.prompt(msg, { type: 'text' });
        return response as string;
    }
}
