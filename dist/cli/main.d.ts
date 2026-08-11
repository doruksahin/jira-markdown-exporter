#!/usr/bin/env node
export interface CliOptions {
    readonly issueKeys?: readonly string[];
    readonly jql?: string;
    readonly outputDir: string;
    readonly downloadAttachments: boolean;
    readonly json: boolean;
}
export declare function parseArguments(argv: readonly string[]): CliOptions;
export declare function main(argv?: readonly string[], env?: NodeJS.ProcessEnv): Promise<number>;
