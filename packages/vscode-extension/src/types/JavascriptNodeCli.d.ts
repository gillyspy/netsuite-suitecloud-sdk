import { EventEmitter } from 'node:stream';

// This file contains types for javascript @oracle/suitecloud-cli code
// Most of this types/interfaces will be used in ExtentionUtil.ts

type SdkOperationResult<T> = {
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

interface ExecutionEnvironmentContextInterface {
	getPlatform(): string;
	getPlatformVersion(): string;
}
interface ExecutionEnvironmentContextConstructor {
	new(params?: { platform?: string, platformVersion?: string }): ExecutionEnvironmentContextInterface;
}

interface SuiteCloudAuthProxyServiceInterface extends EventEmitter {
	start(authId: string, localProxyPort: number): Promise<void>;
	stop(): Promise<void>;
	reloadAccessToken(): Promise<void>
}
interface SuiteCloudAuthProxyServiceConstructor {
	new(sdkPath: string, executionEnvironmentContext: ExecutionEnvironmentContextInterface): SuiteCloudAuthProxyServiceInterface;
}