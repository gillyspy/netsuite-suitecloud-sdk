/*
 ** Copyright (c) 2024 Oracle and/or its affiliates.  All rights reserved.
 ** Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
'use strict';
const BaseOutputHandler = require('../../base/BaseOutputHandler');
const NodeTranslationService = require('../../../services/NodeTranslationService');

const tranKeys = require('../../../services/TranslationKeys');

module.exports = class HelloOutputHandler extends BaseOutputHandler {
	constructor(options) {
		super(options);
	}

	parse(actionResult) {
		const resultMessage = NodeTranslationService.getMessage(
			tranKeys.COMMAND_HELLO.TEST,
			actionResult.commandParameters.phrase
		);

		this._log.result(resultMessage);
		this._log.result(NodeTranslationService.getMessage(tranKeys.COMMAND_HELLO.TEST2));
		return actionResult;
	}
};
