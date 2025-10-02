import { EventEmitter } from 'node:stream';

// This file contains types for javascript @oracle/suitecloud-cli code
// Most of this types/interfaces will be used in ExtentionUtil.ts

export type SdkOperationResult<T> = {
	data: T;
	errorCode: undefined;
	errorMessages: string[];
	resultMessage?: string;
	status:'SUCCESS';
	isSuccess(): true;
} | {
	data: undefined;
	errorCode?: string;
	errorMessages: string[]
	resultMessage: undefined;
	status:'ERROR';
	isSuccess(): false;
}

export interface ConsoleLoggerInterface {
	info(message: string): void;
	result(message: string): void;
	warning(message: string): void;
	error(message: string): void;
}
export interface ConsoleLoggerConstructor {
	new(): ConsoleLoggerInterface
}

export interface ExecutionEnvironmentContextInterface {
	getPlatform(): string;
	getPlatformVersion(): string;
}
export interface ExecutionEnvironmentContextConstructor {
	new(params?: { platform?: string, platformVersion?: string }): ExecutionEnvironmentContextInterface;
}

export interface SuiteCloudAuthProxyServiceInterface extends EventEmitter {
	start(authId: string, localProxyPort: number): Promise<void>;
	stop(): void;
	reloadAccessToken(): Promise<void>
}
export interface SuiteCloudAuthProxyServiceConstructor {
	new(sdkPath: string, executionEnvironmentContext: ExecutionEnvironmentContextInterface): SuiteCloudAuthProxyServiceInterface;
}
