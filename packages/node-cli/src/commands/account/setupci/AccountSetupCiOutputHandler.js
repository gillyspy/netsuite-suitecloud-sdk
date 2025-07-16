/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const BaseOutputHandler = require('../../base/BaseOutputHandler');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const { COMMAND_SETUPACCOUNTCI, UTILS } = require('../../../services/TranslationKeys');
const { COMMAND_AUTHENTICATE_CI_REUSE } = require('../../../ApplicationConstants');

module.exports = class AccountSetupCiOutputHandler extends BaseOutputHandler {
	constructor(options) {
		super(options);
	}

	parse(actionResult) {
		const resultMessage = (actionResult.mode === COMMAND_AUTHENTICATE_CI_REUSE) ?
			NodeTranslationService.getMessage(
				COMMAND_SETUPACCOUNTCI.OUTPUT.SELECT_DEFAULT_ACCOUNT,
				actionResult.authId,
			) :
			NodeTranslationService.getMessage(
				COMMAND_SETUPACCOUNTCI.OUTPUT.NEW_OAUTH,
				actionResult.accountInfo.companyName,
				actionResult.accountInfo.roleName,
				actionResult.authId,
			);

		this._log.result(resultMessage);
		this._log.result(NodeTranslationService.getMessage(UTILS.AUTHENTICATION.SUCCESS_SETUP));
		return actionResult;
	}
};
