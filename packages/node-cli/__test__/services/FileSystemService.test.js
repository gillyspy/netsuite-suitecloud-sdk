'use strict';

const path = require('path');

// Mock fs functions
const mockReaddirSync = jest.fn();
const mockLstatSync = jest.fn();

jest.mock('fs', () => {
	const originalFs = jest.requireActual('fs');
	return {
		...originalFs,
		readdirSync: (...args) => mockReaddirSync(...args),
		lstatSync: (...args) => mockLstatSync(...args),
	};
});

const FileSystemService = require('../../src/services/FileSystemService');

describe('FileSystemService', () => {
	let fileSystemService;

	beforeEach(() => {
		fileSystemService = new FileSystemService();
		jest.clearAllMocks();
	});

	describe('getFirstAncestorByName()', () => {
		describe('when searching for files', () => {
			it('should find a config file in the starting directory', () => {
				// given
				const startingPath = '/project/src/scripts';
				mockReaddirSync.mockReturnValue(['script.js', 'suitecloud.config.js']);
				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => true,
					isDirectory: () => false,
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBe(path.resolve('/project/src/scripts/suitecloud.config.js'));
			});

			it('should find a config file in a parent directory', () => {
				// given
				const startingPath = '/project/src/scripts';
				mockReaddirSync
					.mockReturnValueOnce(['script.js', 'other.js']) // /project/src/scripts
					.mockReturnValueOnce(['utils.js']) // /project/src
					.mockReturnValueOnce(['suitecloud.config.js', 'package.json']); // /project

				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => !filePath.includes('scripts') || !filePath.endsWith('scripts'),
					isDirectory: () => filePath.endsWith('scripts') || filePath.endsWith('src'),
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBe(path.resolve('/project/suitecloud.config.js'));
			});

			it('should return undefined when file is not found', () => {
				// given
				const startingPath = '/project/src';
				mockReaddirSync
					.mockReturnValueOnce(['script.js']) // /project/src
					.mockReturnValueOnce(['package.json']); // /project - stops here due to package.json

				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => true,
					isDirectory: () => false,
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBeUndefined();
			});

			it('should stop at package.json boundary', () => {
				// given
				const startingPath = '/project/node_modules/some-package/lib';
				mockReaddirSync
					.mockReturnValueOnce(['index.js']) // /project/node_modules/some-package/lib
					.mockReturnValueOnce(['package.json', 'lib']); // /project/node_modules/some-package

				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => filePath.endsWith('.js') || filePath.endsWith('.json'),
					isDirectory: () => filePath.endsWith('lib'),
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBeUndefined();
				// Should not traverse past package.json
				expect(mockReaddirSync).toHaveBeenCalledTimes(2);
			});

			it('should find the first matching file from multiple names', () => {
				// given
				const startingPath = '/project';
				mockReaddirSync.mockReturnValue(['sdf.config.js', 'suitecloud.config.js']);
				mockLstatSync.mockImplementation(() => ({
					isFile: () => true,
					isDirectory: () => false,
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js', 'sdf.config.js'],
					startingPath,
					false
				);

				// then
				// Should find the first one that appears in directory listing that matches
				expect(result).toBe(path.resolve('/project/sdf.config.js'));
			});
		});

		describe('when searching for directories', () => {
			it('should find a directory in the starting path', () => {
				// given
				const startingPath = '/project';
				mockReaddirSync.mockReturnValue(['src', 'Objects', 'node_modules']);
				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => false,
					isDirectory: () => true,
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['src', 'Objects'],
					startingPath,
					true
				);

				// then
				expect(result).toBe(path.resolve('/project/src'));
			});

			it('should find a directory in a parent path', () => {
				// given
				const startingPath = '/project/src/scripts';
				mockReaddirSync
					.mockReturnValueOnce(['script.js']) // /project/src/scripts
					.mockReturnValueOnce(['scripts']) // /project/src
					.mockReturnValueOnce(['src', 'Objects']); // /project

				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => filePath.endsWith('.js'),
					isDirectory: () => !filePath.endsWith('.js'),
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['Objects'],
					startingPath,
					true
				);

				// then
				expect(result).toBe(path.resolve('/project/Objects'));
			});

			it('should not match files when searching for directories', () => {
				// given
				const startingPath = '/project';
				mockReaddirSync.mockReturnValue(['src.txt', 'config']);
				mockLstatSync.mockImplementation((filePath) => ({
					isFile: () => filePath.endsWith('.txt'),
					isDirectory: () => !filePath.endsWith('.txt'),
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['src'],
					startingPath,
					true
				);

				// then
				expect(result).toBeUndefined();
			});
		});

		describe('edge cases', () => {
			it('should return undefined when directory cannot be read', () => {
				// given
				const startingPath = '/nonexistent/path';
				mockReaddirSync.mockImplementation(() => {
					throw new Error('ENOENT: no such file or directory');
				});

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBeUndefined();
			});

			it('should stop at root directory', () => {
				// given
				const startingPath = '/';
				mockReaddirSync.mockReturnValue(['bin', 'usr', 'etc']);
				mockLstatSync.mockImplementation(() => ({
					isFile: () => false,
					isDirectory: () => true,
				}));

				// when
				const result = fileSystemService.getFirstAncestorByName(
					['suitecloud.config.js'],
					startingPath,
					false
				);

				// then
				expect(result).toBeUndefined();
				// quits early for root path
				expect(mockReaddirSync).toHaveBeenCalledTimes(0);
			});
		});
	});
});
