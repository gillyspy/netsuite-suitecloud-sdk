/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const NodeTranslationService = require('./../services/NodeTranslationService');
const { ERRORS, CLI, COMMAND_REFRESH_AUTHORIZATION } = require('../services/TranslationKeys');
const { ActionResult } = require('../services/actionresult/ActionResult');
const { lineBreak } = require('../loggers/LoggerOsConstants');
const ActionResultUtils = require('../utils/ActionResultUtils');
const { unwrapExceptionMessage, unwrapInformationMessage } = require('../utils/ExceptionUtils');
const { getProjectDefaultAuthId } = require('../utils/AuthenticationUtils');
const ExecutionEnvironmentContext = require('../ExecutionEnvironmentContext');
const { checkIfReauthorizationIsNeeded, refreshAuthorization } = require('../utils/AuthenticationUtils');
const { AUTHORIZATION_PROPERTIES_KEYS, AUTHORIZATION_FORCE_PROMPTS, ENV_VARS } = require('../ApplicationConstants');
const ManageAccountInputHandler = require('../commands/account/manageauth/ManageAccountInputHandler');

/** @type {CommandActionExecutor} */
module.exports = class CommandActionExecutor {
	constructor(dependencies) {
		assert(dependencies);
		assert(dependencies.cliConfigurationService);
		assert(dependencies.commandsMetadataService);
		assert(dependencies.log);
		assert(dependencies.sdkPath);

		this._cliConfigurationService = dependencies.cliConfigurationService;
		this._commandsMetadataService = dependencies.commandsMetadataService;
		this._log = dependencies.log;
		this._sdkPath = dependencies.sdkPath;

		if (!dependencies.executionEnvironmentContext) {
			this._executionEnvironmentContext = new ExecutionEnvironmentContext();
		} else {
			this._executionEnvironmentContext = dependencies.executionEnvironmentContext;
		}
	}
	get _executionPath(){
		return this._cliConfigurationService?._executionPath ?? process.cwd();
	}

	async executeAction(context) {
		assert(context);
		assert(context.arguments);
		assert(context.commandName);
		assert(typeof context.runInInteractiveMode === 'boolean');

		let commandUserExtension;
		const commandName = context.commandName;
		const debugFilePath = this._getDebugFilePath(context.arguments.debug, commandName);
		try {
			const commandMetadata = this._commandsMetadataService.getCommandMetadataByName(commandName);
			if (context.arguments.config) {
				this._cliConfigurationService.initialize(context.arguments.config, true);
			} else if (context.arguments.noconfig) {
				//do nothing;
				this._cliConfigurationService.initialize(undefined, true);
			} else {
				// location of suitecloud.config
				this._cliConfigurationService.initialize(process.cwd());
			}

			commandUserExtension = this._cliConfigurationService.getCommandUserExtension(commandName);
			const runInInteractiveMode = context.runInInteractiveMode;
			const commandArguments = this._extractOptionValuesFromArguments(commandMetadata.options, context.arguments);

			// need the
			const projectFolder = this._cliConfigurationService.getProjectFolder(commandName, commandArguments?.project);
			const projectPath = this._cliConfigurationService.getProjectPath(projectFolder);
			let authId;
			// allow an override via --authid
			if (commandArguments?.authid) {
				if (!runInInteractiveMode) {
					// this might throw -- it could also be semi-interactive
					try{
						authId = this._cliConfigurationService.getAuthId(commandName, projectPath, commandArguments?.authid);
					}catch(e){
						if( commandMetadata.isSetupRequired ) throw e;
					}

				} else {
					[authId] = AUTHORIZATION_FORCE_PROMPTS;
				}
			}
			// in interactive mode we can prompt for the authid
			if (AUTHORIZATION_FORCE_PROMPTS.includes(authId)) {
				const interactiveAuthIdHandler = new ManageAccountInputHandler({
					projectFolder: projectPath,
					commandMetadata,
					log: this._log,
					// force it
					runInInteractiveMode: true,
					executionEnvironmentContext: this._executionEnvironmentContext,
					sdkPath: this._sdkPath,
				});
				const { selected_auth_id: chosenAuth } = await interactiveAuthIdHandler.getAuthId(authId);
				if (chosenAuth?.authId) authId = chosenAuth.authId;
			}

			this._checkCanExecuteCommand({ runInInteractiveMode, commandMetadata, defaultAuthId: authId });

			const commandArgumentsWithDefaultContext = this._applyDefaultContextParams(
				commandArguments,
				{
					project: projectPath,
					authid: authId,
				},
				commandMetadata,
			);
			const beforeExecutingOptions = {
				commandName: commandName,
				// the path of the config for teh service
				projectFolder: projectFolder, // this._cliConfigurationService._executionPath,
				projectPath: projectPath,
				// probably cwd
				executionPath: this._executionPath,
				// do not pass reference
				arguments: { ...commandArgumentsWithDefaultContext },
			};
			if (commandMetadata.isSetupRequired) {
				// run beforeExecute(args) from suitecloud.config.js
				beforeExecutingOptions.authId = authId;
				beforeExecutingOptions.arguments = {
					...commandArgumentsWithDefaultContext,
					authid: authId,
				};
			}

			if (context.runInInteractiveMode){
				beforeExecutingOptions.arguments.interactive = true
			}

			// establish these prior to calling the hooks so they have the available in their environment as well
			process.env[ENV_VARS.SUITECLOUD_PROJECT_FOLDER] = projectFolder;
			process.env[ENV_VARS.SUITECLOUD_PROJECT_PATH] = projectPath;
			process.env[ENV_VARS.SUITECLOUD_PROJECT_ROOT] = this._executionPath;
			// this might modified but we need the user's hooks to take advantage of their current values
			process.env[ENV_VARS.SUITECLOUD_AUTHID] = authId;
			this._dumpDebugFile(debugFilePath, undefined, 'FIRST');
			this._dumpDebugFile(debugFilePath, 'beforeExecuting', beforeExecutingOptions);
			const beforeExecutingOutput = await commandUserExtension.beforeExecuting(beforeExecutingOptions);
			const overriddenArguments = beforeExecutingOutput.arguments;

			// do not allow this argument to be overwritten (i.e. change it back)
			if (Reflect.has(commandArgumentsWithDefaultContext, 'project'))
				overriddenArguments.project = commandArgumentsWithDefaultContext.project;

			// update the authid as well (not recommended but possible) -- should this be in the isSetupRequired check?
			// EXPERIMENTAL: ALLOW UPDATE OF THE AUTHID AT THIS TIME
			if (commandMetadata.isSetupRequired)
				authId = beforeExecutingOutput?.arguments?.authid || authId;

			if (commandMetadata.isSetupRequired && !context.arguments[AUTHORIZATION_PROPERTIES_KEYS.SKIP_AUHTORIZATION_CHECK]) {
				// check if reauthz is needed to show proper message before continuing with the execution
				// check after the beforeExecute() has been performed because for instance some unit-test failed and we won't continue the execution
				await this._refreshAuthorizationIfNeeded(authId);
			}
			// AT THIS POINT THE AUTHID IS NOW LOCKED IN SO WE CAN UPDATE THE (TEMP) ENVIRONMENT AGAIN
			process.env[ENV_VARS.SUITECLOUD_AUTHID] = authId;

			// command creation
			// src/commands/{noun}/{verb}/{verb}{noun}Command.js => specific implementation creation for a given command
			const command = this._getCommand(runInInteractiveMode, projectPath, commandMetadata, authId);

			// command execution
			// src/commands/Command.js, run(inputParams) => execution flow for all commands
			const actionResult = await command.run(overriddenArguments);

			if (context.runInInteractiveMode) {
				// generate non-interactive equivalent
				const notInteractiveCommand = ActionResultUtils.extractNotInteractiveCommand(commandName, commandMetadata, actionResult);
				this._log.info(NodeTranslationService.getMessage(CLI.SHOW_NOT_INTERACTIVE_COMMAND_MESSAGE, notInteractiveCommand));
			}

			if (actionResult.isSuccess() && commandUserExtension.onCompleted) {
				// run onCompleted(output) from suitecloud.config.js
				this._dumpDebugFile(debugFilePath, 'onCompleted', actionResult);
				commandUserExtension.onCompleted(actionResult);
			} else if (!actionResult.isSuccess() && commandUserExtension.onError) {
				// run onError(error) from suitecloud.config.js
				const errorData = ActionResultUtils.getErrorMessagesString(actionResult);
				this._dumpDebugFile(debugFilePath, 'onError', errorData);
				commandUserExtension.onError(errorData);
			}
			return actionResult;

		} catch (error) {
			let errorMessage = this._logGenericError(error);
			if (commandUserExtension && commandUserExtension.onError) {
				// run onError(error) from suitecloud.config.js
				this._dumpDebugFile(debugFilePath, 'onError', error);
				commandUserExtension.onError(error);
			}
			return ActionResult.Builder.withErrors(Array.isArray(errorMessage) ? errorMessage : [errorMessage]).build();
		}
	}

	async _refreshAuthorizationIfNeeded(defaultAuthId) {
		const inspectAuthzOperationResult = await checkIfReauthorizationIsNeeded(defaultAuthId, this._sdkPath, this._executionEnvironmentContext);

		if (!inspectAuthzOperationResult.isSuccess()) {
			throw inspectAuthzOperationResult.errorMessages;
		}
		const inspectAuthzData = inspectAuthzOperationResult.data;
		if (inspectAuthzData[AUTHORIZATION_PROPERTIES_KEYS.NEEDS_REAUTHORIZATION]) {
			await this._log.info(NodeTranslationService.getMessage(COMMAND_REFRESH_AUTHORIZATION.MESSAGES.CREDENTIALS_NEED_TO_BE_REFRESHED, defaultAuthId));
			const refreshAuthzOperationResult = await refreshAuthorization(defaultAuthId, this._sdkPath, this._executionEnvironmentContext);

			if (!refreshAuthzOperationResult.isSuccess()) {
				throw refreshAuthzOperationResult.errorMessages;
			}
			await this._log.info(NodeTranslationService.getMessage(COMMAND_REFRESH_AUTHORIZATION.MESSAGES.AUTHORIZATION_REFRESH_COMPLETED));
		}
	}

	_logGenericError(error) {
		let errorMessage = unwrapExceptionMessage(error);
		this._log.error(errorMessage);
		const informativeMessage = unwrapInformationMessage(error);

		if (informativeMessage) {
			this._log.info(`${lineBreak}${informativeMessage}`);
			errorMessage += lineBreak + informativeMessage;
		}
		return errorMessage;
	}

	_checkCanExecuteCommand({ commandMetadata, defaultAuthId, runInInteractiveMode }) {
		if (commandMetadata.isSetupRequired && !defaultAuthId) {
			throw NodeTranslationService.getMessage(ERRORS.SETUP_REQUIRED);
		}
		if (runInInteractiveMode && !commandMetadata.supportsInteractiveMode) {
			throw NodeTranslationService.getMessage(ERRORS.COMMAND_DOES_NOT_SUPPORT_INTERACTIVE_MODE, commandMetadata.name);
		}
	}

	_extractOptionValuesFromArguments(options, args) {
		const optionValues = {};
		for (const optionId in options) {
			if (options.hasOwnProperty(optionId) && args.hasOwnProperty(optionId)) {
				optionValues[optionId] = args[optionId];
			}
		}

		return optionValues;
	}

	/**
	 *
	 * @param runInInteractiveMode
	 * @param projectFolder
	 * @param commandMetadata
	 * @param {string} authId
	 * @returns {import('../commands/Command')}
	 * @private
	 */
	_getCommand(runInInteractiveMode, projectFolder, commandMetadata, authId) {
		const commandPath = commandMetadata.generator;
		const commandGenerator = require(commandPath);
		if (!commandGenerator) {
			throw `Path ${commandPath} doesn't contain any command`;
		}
		return commandGenerator.create({
			authId: authId,
			commandMetadata: commandMetadata,
			projectFolder: projectFolder,
			executionPath: this._executionPath,
			runInInteractiveMode: runInInteractiveMode,
			log: this._log,
			sdkPath: this._sdkPath,
			executionEnvironmentContext: this._executionEnvironmentContext,
		});
	}

	/**
	 * Assign default context params IF they apply
	 */
	_applyDefaultContextParams(args, any, meta) {
		return Object.keys(any)
			.filter((k1) => Object.keys(meta).includes(k1))
			.reduce((args, filteredKey) => {
				return {
					...args,
					[filteredKey]: any[filteredKey],
				};
			}, args);
	}

	_getDebugFilePath(debugDir, commandName) {
		if (!debugDir) return null;
		const sanitizedCommandName = commandName.replace(/:/g, '-');
		const datetime = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${sanitizedCommandName}.${datetime}.json`;
		return path.join(debugDir, filename);
	}

	/**
	 *
	 * @param debugFilePath
	 * @param hookName
	 * @param {'FIRST'|'LAST'|*} data
	 * @private
	 */
	_dumpDebugFile(debugFilePath, hookName, data) {
		if (!debugFilePath || !data ) return;
		if (data === 'FIRST') {
			fs.writeFileSync(debugFilePath, '[]');
			return;
		}

		const envVars = {};
		Object.keys(process.env)
			.filter(key => key.startsWith('SUITECLOUD_'))
			.forEach(key => { envVars[key] = process.env[key]; });
		const entry = {
			hook: hookName,
			timestamp: new Date().toISOString(),
			env: envVars,
			data: data
		};

		let entries = [];
		try {
			const contents = fs.readFileSync(debugFilePath, 'utf8');
			entries = JSON.parse(contents);
		} catch (e) {
			// If file doesn't exist or can't be parsed, start with empty array
		}
		entries.push(entry);
		fs.writeFileSync(debugFilePath, JSON.stringify(entries, null, 2));
	}
};
