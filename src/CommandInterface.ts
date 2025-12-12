export interface CommandArg {
    name: string;
    required?: boolean;
    description?: string;
    default?: any;
}

export interface CommandOption {
    name: string; // e.g. '--dry-run'
    description?: string;
    default?: any;
    type?: any[];
}

export interface CommandDefinition {
    args?: CommandArg[];
    options?: CommandOption[];
}

export interface CommandInterface {
    run(options: any): Promise<void>;
}
