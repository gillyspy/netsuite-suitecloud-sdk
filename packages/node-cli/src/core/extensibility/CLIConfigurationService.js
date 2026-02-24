/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const { lineBreak } = require('../../loggers/LoggerOsConstants');
const FileUtils = require('../../utils/FileUtils');
const path = require('path');
const NodeTranslationService = require('./../../services/NodeTranslationService');
const { ERRORS } = require('./../../services/TranslationKeys');
const FileService = require('../../services/FileSystemService');
const { getProjectDefaultAuthId } = require('../../utils/AuthenticationUtils');
const CommandUserExtension = require('./CommandUserExtension');
const { ENV_VARS, FILES, FOLDERS } = require('../../ApplicationConstants');
const CLI_CONFIG_FILES = [...FILES.CLI_CONFIG_FILE_JS, ...FILES.CLI_CONFIG_FILE_JSON];
const PROJECT_DIRS = [FOLDERS.FILE_CABINET, FOLDERS.OBJECTS];
const DEFAULT_AUTH_ID_PROPERTY = 'defaultAuthId';
const DEFAULT_CONFIG = {
	defaultProjectFolder: '',
	[DEFAULT_AUTH_ID_PROPERTY]: null,
	commands: {},
};

const isString = (str) => typeof str === 'string' || str instanceof String;

module.exports = class CLIConfigurationService {
	constructor() {
		this._cliConfig = DEFAULT_CONFIG;
	}

	initialize(executionPath, override = false) {
		let cliConfigFile;
		const fileServiceInstance = new FileService();

		if (!override) {
			cliConfigFile = fileServiceInstance.getFirstAncestorByName(CLI_CONFIG_FILES, executionPath, false);
			// try by directory
		} else if (!executionPath) {
			// noconfig mode
			this._executionPath = process.cwd();
			return;
		}

		// it might be something like @suitegeezus/cool-package/sdf.config.js
		if(/^@\w\b/.test(executionPath)){
			cliConfigFile = require.resolve(executionPath);
		} else if (!/[.]js(on)?$/.test(executionPath)) {
			cliConfigFile = fileServiceInstance.getFirstAncestorByName(CLI_CONFIG_FILES, executionPath, false);
		} else if (typeof executionPath === 'string') {
			cliConfigFile = fileServiceInstance.getFirstAncestorByName(
				[path.basename(executionPath)],
				path.dirname(executionPath),
				false,
			);
		}
		if (!cliConfigFile) {
			const candidateDir = fileServiceInstance.getFirstAncestorByName(PROJECT_DIRS, executionPath, true);
			if (candidateDir) this._executionPath = candidateDir;
			else this._executionPath = executionPath;
		} else {
			this._executionPath = path.dirname(cliConfigFile);
		}

		if (!FileUtils.exists(cliConfigFile)) {
			return;
		}

		try {
			this._cliConfig = require(cliConfigFile);
		} catch (error) {
			throw NodeTranslationService.getMessage(ERRORS.CLI_CONFIG_ERROR_LOADING_CONFIGURATION_MODULE, cliConfigFile, lineBreak, error);
		}
	}

	getCommandUserExtension(commandName) {
		const commandExtension =
			this._cliConfig && this._cliConfig.commands && this._cliConfig.commands[commandName] ? this._cliConfig.commands[commandName] : {};
		return new CommandUserExtension(commandExtension);
	}

	/**
	 * @private
	 * @param {string} projectFolder
	 * @param {string} file
	 * @param {string} property
	 * @returns {*}
	 * @private
	 */
	__getPropertyFromFile(projectFolder, file, property) {
		const projectFilePath = path.join(projectFolder, file);

		if (FileUtils.exists(projectFilePath)) {
			try {
				const fileContentJson = FileUtils.readAsJson(projectFilePath);
				return fileContentJson[property];
			} catch (error) {
				// if( throwError === false ) return;
				throw NodeTranslationService.getMessage(ERRORS.WRONG_JSON_FILE, projectFilePath, error) +
				lineBreak + NodeTranslationService.getMessage(ERRORS.RUN_SETUP_ACCOUNT);
			}
		}
	}

	getAuthId(command, projectPath, adhoc) {
		// how do we determine which project.json to use if the folder was specified?
		const lookInConfig = () => {
			try {
				return this.__getPropertyFromFile(projectPath, FILES.PROJECT_JSON, DEFAULT_AUTH_ID_PROPERTY);
			} catch {
				//
			}
		};

		const commandConfig = this._cliConfig && this._cliConfig.commands && this._cliConfig.commands[command];
		switch (true) {
			// look in the command
			case Boolean(commandConfig && commandConfig.authId):
				return commandConfig.authId;

			case Boolean(adhoc):
				return adhoc;

			case Boolean(process.env[ENV_VARS.SUITECLOUD_AUTHID]):
				return process.env[ENV_VARS.SUITECLOUD_AUTHID];

			case Boolean(lookInConfig()):
				return lookInConfig();

			// look in fixed config
			case  Boolean(this._cliConfig.defaultAuthId):
				return this._cliConfig.defaultAuthId;

			default:
				throw NodeTranslationService.getMessage(ERRORS.MISSING_DEFAULT_AUTH_ID, DEFAULT_AUTH_ID_PROPERTY);

		}
	}

	setAuthId(value) {
		if (!this._authId) {
			this._authId = value;
			return true;
		}
		return false;
	}

	getProjectFolder(command, adhoc) {
		// recall that empty string is a value projectFolder so we use undefined here
		const pathBits = { projectFolder: undefined };

		const commandConfig = this._cliConfig && this._cliConfig.commands && this._cliConfig.commands[command];
		/** @todo look in process.cwd()/project.json */
		switch (true) {

			// look in the command
			case Boolean(commandConfig && isString(commandConfig.projectFolder)):
				pathBits.projectFolder = commandConfig.projectFolder;
				break;

			// adhoc
			case  typeof pathBits.projectFolder !== 'string' && typeof adhoc === 'string' :
				pathBits.projectFolder = adhoc;
				break;

			// look in env
			case typeof pathBits.projectFolder !== 'string' && typeof process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER] === 'string':
				pathBits.projectFolder = process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER];
				break;

			// look in fixed config
			case isString(this._cliConfig.defaultProjectFolder):
				pathBits.projectFolder = this._cliConfig.defaultProjectFolder;
				break;

			// default
			default: {
				// attempt to resolve
				const files = (new FileService()).getFoldersFromDirectoryRecursively(this._executionPath);
				const firstFc = files.find((f) => /\bFileCabinet\b/.test(f));
				pathBits.projectFolder = path.relative(this._executionPath, firstFc.replace(/^(.*).\bFileCabinet\b.*$/, '$1'));
				break;
			}
		}

		return pathBits.projectFolder;
	}

	getProjectPath(projectFolder) {
		return path.join(this._executionPath, projectFolder);
	}
};
