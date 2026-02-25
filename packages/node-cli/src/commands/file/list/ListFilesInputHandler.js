/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';

const { default: { prompt} } = require('inquirer');
const CommandUtils = require('../../../utils/CommandUtils');
const AccountFileCabinetService = require('../../../services/AccountFileCabinetService');
const { getProjectDefaultAuthId } = require('../../../utils/AuthenticationUtils');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const BaseInputHandler = require('../../base/BaseInputHandler');
const SdkExecutor = require('../../../SdkExecutor');
const {
	COMMAND_LISTFILES: { ERRORS, SELECT_FOLDER },
} = require('../../../services/TranslationKeys');

const SUITE_SCRIPTS_FOLDER = '/SuiteScripts';

module.exports = class ListFilesInputHandler extends BaseInputHandler {
	constructor(options) {
		super(options);

		// TODO input handlers shouldn't execute actions. rework this
		this._sdkExecutor = new SdkExecutor(this._sdkPath, this._executionEnvironmentContext);
		this._accountFileCabinetService = new AccountFileCabinetService(
			this._sdkPath,
			this._executionEnvironmentContext,
			 this._authId
		);
	}

	async getParameters(params) {
		const accountFileCabinetFolders = await this._accountFileCabinetService.getAccountFileCabinetFolders();
		if (accountFileCabinetFolders.length === 0) {
			throw NodeTranslationService.getMessage(ERRORS.NO_FOLDERS_FOUND);
		}

		const fileCabinetFolders = new Set();
		fileCabinetFolders.add(SUITE_SCRIPTS_FOLDER);
		let defaultValue = SUITE_SCRIPTS_FOLDER;
		accountFileCabinetFolders.forEach((folderPath) => {
			// only return folder that match the filter
			if( folderPath === params.folder ) defaultValue = folderPath;
			if(
				(typeof params.folder === 'string' && folderPath.includes(params.folder)) ||
				typeof params.folder !== 'string'
			){
				return fileCabinetFolders.add({
					name: folderPath,
					value: folderPath,
				});
			}
		});
		if( fileCabinetFolders.has(defaultValue)) fileCabinetFolders.delete(defaultValue);
		return prompt([
			{
				type: CommandUtils.INQUIRER_TYPES.LIST,
				name: this._commandMetadata.options.folder.name,
				message: NodeTranslationService.getMessage(SELECT_FOLDER),
				default: defaultValue,
				choices: [...fileCabinetFolders],
			},
		]);
	}
};
