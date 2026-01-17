'use strict';

const path = require('path');

// Mock dependencies before requiring the service
jest.mock('../../../src/utils/FileUtils');
jest.mock('../../../src/services/FileSystemService');

const CLIConfigurationService = require('../../../src/core/extensibility/CLIConfigurationService');
const FileUtils = require('../../../src/utils/FileUtils');
const FileSystemService = require('../../../src/services/FileSystemService');
const { ENV_VARS, FILES } = require('../../../src/ApplicationConstants');

describe('CLIConfigurationService', () => {
	let service;
	let originalEnv;
	let mockFileSystemInstance;

	beforeAll(() => {
		// Save original env vars
		originalEnv = {
			[ENV_VARS.SUITECLOUD_AUTHID]: process.env[ENV_VARS.SUITECLOUD_AUTHID],
			[ENV_VARS.SUITECLOUD_PROJECT_FOLDER]: process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER],
		};
	});

	afterAll(() => {
		// Restore original env vars
		Object.keys(originalEnv).forEach((key) => {
			if (originalEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = originalEnv[key];
			}
		});
	});

	beforeEach(() => {
		service = new CLIConfigurationService();
		jest.clearAllMocks();

		// Clear relevant env vars
		delete process.env[ENV_VARS.SUITECLOUD_AUTHID];
		delete process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER];

		// Default mock implementations
		mockFileSystemInstance = {
			getFirstAncestorByName: jest.fn().mockReturnValue(null),
			getFoldersFromDirectoryRecursively: jest.fn().mockReturnValue([]),
		};
		FileSystemService.mockImplementation(() => mockFileSystemInstance);
		FileUtils.exists = jest.fn().mockReturnValue(false);
		FileUtils.readAsJson = jest.fn().mockReturnValue({});
	});

	describe('constructor', () => {
		it('should initialize with default config', () => {
			const newService = new CLIConfigurationService();
			expect(newService._cliConfig).toEqual({
				defaultProjectFolder: '',
				defaultAuthId: null,
				commands: {},
			});
		});
	});

	describe('initialize', () => {
		it('should set executionPath to process.cwd() in noconfig mode when override=true and no executionPath', () => {
			const originalCwd = process.cwd();
			service.initialize(null, true);
			expect(service._executionPath).toBe(originalCwd);
		});

		it('should set executionPath to process.cwd() in noconfig mode when override=true and executionPath is empty', () => {
			const originalCwd = process.cwd();
			service.initialize('', true);
			expect(service._executionPath).toBe(originalCwd);
		});

		it('should find config file from ancestor directories', () => {
			const mockConfigPath = '/project/suitecloud.config.js';
			mockFileSystemInstance.getFirstAncestorByName.mockReturnValue(mockConfigPath);
			FileUtils.exists.mockReturnValue(true);

			// We can't easily mock require() so we test that it attempts to load
			// and throws the expected error when module doesn't exist
			expect(() => service.initialize('/project/src')).toThrow();
		});

		it('should fallback to project directories when no config file found', () => {
			mockFileSystemInstance.getFirstAncestorByName
				.mockReturnValueOnce(null) // no config file first call
				.mockReturnValueOnce('/project'); // found project dir

			service.initialize('/project/src');
			expect(service._executionPath).toBe('/project');
		});

		it('should not set executionPath when no config file and no project directory found', () => {
			mockFileSystemInstance.getFirstAncestorByName.mockReturnValue(null);

			service.initialize('/some/random/path');
			expect(service._executionPath).toBeUndefined();
		});

		it('should set executionPath to dirname of config file when found', () => {
			const mockConfigPath = '/project/suitecloud.config.js';
			mockFileSystemInstance.getFirstAncestorByName.mockReturnValue(mockConfigPath);
			FileUtils.exists.mockReturnValue(false); // File doesn't actually exist, so skip loading

			service.initialize('/project/src');
			expect(service._executionPath).toBe('/project');
		});

		it.todo('should handle @netsuite-acs scoped package paths');

		it('should handle explicit .js config file path', () => {
			const configPath = '/project/custom.config.js';
			mockFileSystemInstance.getFirstAncestorByName.mockReturnValue(configPath);
			FileUtils.exists.mockReturnValue(false);

			service.initialize(configPath);
			expect(mockFileSystemInstance.getFirstAncestorByName).toHaveBeenCalledWith(
				['custom.config.js'],
				'/project',
				false
			);
		});

		it('should handle explicit .json config file path', () => {
			const configPath = '/project/custom.config.json';
			mockFileSystemInstance.getFirstAncestorByName.mockReturnValue(configPath);
			FileUtils.exists.mockReturnValue(false);

			service.initialize(configPath);
			expect(mockFileSystemInstance.getFirstAncestorByName).toHaveBeenCalledWith(
				['custom.config.json'],
				'/project',
				false
			);
		});
	});

	describe('getAuthId', () => {
		const projectPath = '/project';

		it('should return authId from command config first (highest priority)', () => {
			service._cliConfig = {
				commands: {
					deploy: { authId: 'command-auth' },
				},
				defaultAuthId: 'default-auth',
			};
			process.env[ENV_VARS.SUITECLOUD_AUTHID] = 'env-auth';

			const result = service.getAuthId('deploy', projectPath, 'adhoc-auth');
			expect(result).toBe('command-auth');
		});

		it('should return adhoc authId when command config has no authId', () => {
			service._cliConfig = {
				commands: {
					deploy: {},
				},
				defaultAuthId: 'default-auth',
			};

			const result = service.getAuthId('deploy', projectPath, 'adhoc-auth');
			expect(result).toBe('adhoc-auth');
		});

		it('should return adhoc authId when no command config exists', () => {
			service._cliConfig = {
				commands: {},
				defaultAuthId: 'default-auth',
			};

			const result = service.getAuthId('deploy', projectPath, 'adhoc-auth');
			expect(result).toBe('adhoc-auth');
		});

		it('should return authId from environment variable when no adhoc', () => {
			service._cliConfig = { commands: {} };
			process.env[ENV_VARS.SUITECLOUD_AUTHID] = 'env-auth';

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('env-auth');
		});

		it('should return authId from project.json when no env var', () => {
			service._cliConfig = { commands: {} };
			FileUtils.exists.mockReturnValue(true);
			FileUtils.readAsJson.mockReturnValue({ defaultAuthId: 'project-auth' });

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('project-auth');
		});

		it('should return defaultAuthId from cliConfig when no project.json authId', () => {
			service._cliConfig = {
				commands: {},
				defaultAuthId: 'default-auth',
			};
			FileUtils.exists.mockReturnValue(false);

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('default-auth');
		});

		it('should throw when no authId found anywhere', () => {
			service._cliConfig = { commands: {} };
			FileUtils.exists.mockReturnValue(false);

			expect(() => service.getAuthId('deploy', projectPath, null)).toThrow();
		});

		it('should handle undefined commands in cliConfig', () => {
			service._cliConfig = { defaultAuthId: 'default-auth' };

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('default-auth');
		});

		it('should silently handle errors reading project.json and continue to next source', () => {
			service._cliConfig = {
				commands: {},
				defaultAuthId: 'default-auth',
			};
			FileUtils.exists.mockReturnValue(true);
			FileUtils.readAsJson.mockImplementation(() => {
				throw new Error('Invalid JSON');
			});

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('default-auth');
		});
	});

	describe('getProjectFolder', () => {
		it('should return projectFolder from command config (highest priority)', () => {
			service._cliConfig = {
				commands: {
					deploy: { projectFolder: 'cmd-folder' },
				},
				defaultProjectFolder: 'default-folder',
			};
			process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER] = 'env-folder';

			const result = service.getProjectFolder('deploy', 'adhoc-folder');
			expect(result).toBe('cmd-folder');
		});

		it('should return empty string projectFolder from command config', () => {
			service._cliConfig = {
				commands: {
					deploy: { projectFolder: '' },
				},
				defaultProjectFolder: 'default-folder',
			};

			const result = service.getProjectFolder('deploy', 'adhoc-folder');
			expect(result).toBe('');
		});

		it('should return adhoc folder when no command projectFolder', () => {
			service._cliConfig = {
				commands: {
					deploy: {},
				},
			};

			const result = service.getProjectFolder('deploy', 'adhoc-folder');
			expect(result).toBe('adhoc-folder');
		});

		it('should return folder from environment variable', () => {
			service._cliConfig = { commands: {} };
			process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER] = 'env-folder';

			const result = service.getProjectFolder('deploy', undefined);
			expect(result).toBe('env-folder');
		});

		it('should return defaultProjectFolder from cliConfig', () => {
			service._cliConfig = {
				commands: {},
				defaultProjectFolder: 'default-folder',
			};

			const result = service.getProjectFolder('deploy', undefined);
			expect(result).toBe('default-folder');
		});

		it('should search for FileCabinet folder as last resort', () => {
			service._cliConfig = { commands: {} };
			service._executionPath = '/project';
			mockFileSystemInstance.getFoldersFromDirectoryRecursively.mockReturnValue([
				'/project/src/FileCabinet/SuiteScripts',
				'/project/other',
			]);

			const result = service.getProjectFolder('deploy', undefined);
			expect(result).toBe('src');
		});

		it('should handle undefined commands in cliConfig', () => {
			service._cliConfig = { defaultProjectFolder: 'default-folder' };

			const result = service.getProjectFolder('deploy', undefined);
			expect(result).toBe('default-folder');
		});
	});

	describe('getCommandUserExtension', () => {
		it('should return CommandUserExtension with command config', () => {
			const beforeExecutingFn = jest.fn();
			service._cliConfig = {
				commands: {
					deploy: { beforeExecuting: beforeExecutingFn },
				},
			};

			const extension = service.getCommandUserExtension('deploy');
			expect(extension).toBeDefined();
			expect(extension._cliConfig).toEqual({ beforeExecuting: beforeExecutingFn });
		});

		it('should return CommandUserExtension with empty config for unknown command', () => {
			service._cliConfig = { commands: {} };

			const extension = service.getCommandUserExtension('unknown');
			expect(extension).toBeDefined();
			expect(extension._cliConfig).toEqual({});
		});

		it('should return CommandUserExtension with empty config when commands is undefined', () => {
			service._cliConfig = {};

			const extension = service.getCommandUserExtension('deploy');
			expect(extension).toBeDefined();
			expect(extension._cliConfig).toEqual({});
		});

		it('should return CommandUserExtension with empty config when cliConfig is undefined', () => {
			service._cliConfig = undefined;

			const extension = service.getCommandUserExtension('deploy');
			expect(extension).toBeDefined();
			expect(extension._cliConfig).toEqual({});
		});
	});

	describe('setAuthId', () => {
		it('should set authId and return true on first call', () => {
			const result = service.setAuthId('new-auth');
			expect(result).toBe(true);
			expect(service._authId).toBe('new-auth');
		});

		it('should not override and return false on subsequent calls', () => {
			service.setAuthId('first-auth');
			const result = service.setAuthId('second-auth');
			expect(result).toBe(false);
			expect(service._authId).toBe('first-auth');
		});

		it('should allow setting authId after it was set to falsy value', () => {
			// First call with empty string
			service._authId = '';
			const result = service.setAuthId('new-auth');
			expect(result).toBe(true);
		});
	});

	describe('getProjectPath', () => {
		it('should join executionPath with projectFolder', () => {
			service._executionPath = '/base/path';
			const result = service.getProjectPath('subfolder');
			expect(result).toBe(path.join('/base/path', 'subfolder'));
		});

		it('should handle empty projectFolder', () => {
			service._executionPath = '/base/path';
			const result = service.getProjectPath('');
			expect(result).toBe('/base/path');
		});

		it('should handle nested projectFolder', () => {
			service._executionPath = '/base/path';
			const result = service.getProjectPath('sub/nested/folder');
			expect(result).toBe(path.join('/base/path', 'sub/nested/folder'));
		});
	});

	describe('__getPropertyFromFile (private method via getAuthId)', () => {
		const projectPath = '/project';

		it('should read property from JSON file', () => {
			service._cliConfig = { commands: {} };
			FileUtils.exists.mockReturnValue(true);
			FileUtils.readAsJson.mockReturnValue({
				defaultAuthId: 'file-auth',
				otherProp: 'other-value',
			});

			const result = service.getAuthId('deploy', projectPath, null);
			expect(FileUtils.readAsJson).toHaveBeenCalledWith(path.join(projectPath, FILES.PROJECT_JSON));
			expect(result).toBe('file-auth');
		});

		it('should return undefined when file does not exist', () => {
			service._cliConfig = { commands: {}, defaultAuthId: 'fallback' };
			FileUtils.exists.mockReturnValue(false);

			const result = service.getAuthId('deploy', projectPath, null);
			expect(result).toBe('fallback');
			expect(FileUtils.readAsJson).not.toHaveBeenCalled();
		});
	});
});
