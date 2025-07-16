const {
	showValidationResults,
	validateFieldIsNotEmpty,
	validateFieldHasNoSpaces,
	validateAlphanumericHyphenUnderscore,
	validateMaximumLength,
} = require('../../../validation/InteractiveAnswersValidator');
const ProjectInfoService = require('../../../services/ProjectInfoService');
const assert = require('assert');
const { throwValidationException } = require('../../../utils/ExceptionUtils');
const NodeTranslationService = require('../../../services/NodeTranslationService');

const COMMAND = {
	OPTIONS: {
		ACCOUNT: 'account',
		AUTHID: 'authid',
		CERTIFCATEID: 'certificateid',
		PRIVATEKEYPATH: 'privatekeypath',
		DOMAIN: 'domain',

	},
	SDK_COMMAND: 'authenticateci',
};
//url is a not mandatory parameter for setup mode
const URL_PARAM = 'url';
//Select indicator, the action behaves in two different ways depending on select parameter is selected or not
const SELECT_PARAM = 'select';
//not mandatory params in setup (not select) mode, all the other parameters are mandatory
const NOT_MANDATORY_STANDARD_MODE_PARAMS = [COMMAND.OPTIONS.DOMAIN, URL_PARAM];
const { COMMAND_OPTIONS : { IS_MANDATORY, IS_MANDATORY_SELECT_MODE, IS_NOT_ALLOWED_SELECT_MODE} } = require('../../../services/TranslationKeys');

class AccountSetupCiValidation {
	constructor(commandMetadata, runInInteractiveMode) {
		this._commandMetadata = commandMetadata;
		this._runInInteractiveMode = runInInteractiveMode;
	}

	validateAuthID(authId) {
		const validateResult = showValidationResults(
			authId,
			validateFieldIsNotEmpty,
			validateFieldHasNoSpaces,
			validateAlphanumericHyphenUnderscore,
			validateMaximumLength,
		);
		if (typeof validateResult === 'string') {
			throw validateResult;
		}
	}

	/**
	 * There are 2 options, select mode --select --authid <authI> all mandatory and nothing else allowed
	 * and the standard --authid <authI> --certificateid <certId>--privatekeypath <privatekeypath> -account <account> mandatories
	 * with url and domain as optional
	 * @param params
	 */
	validateActionParametersByMode(params) {
		assert(this._commandMetadata);
		assert(this._commandMetadata.options);
		const validationErrors = this._isDefaultMode(params) ?
			this._validateActionParametersSetupMode(params) :
			this._validateActionParametersSelectMode(params);

		if (validationErrors.length > 0) {
			throwValidationException(validationErrors, this._runInInteractiveMode, this._commandMetadata);
		}
	}
	_validateActionParametersSetupMode(params) {
		const validationErrors = [];
		//all the params except authId are set as not mandatory in the setup validation to be able
		//to work with the select/setup mode, for this reason the mandatory validation of select
		//mode is done here.
		for (const optionId in this._getOptions()) {
			if (NOT_MANDATORY_STANDARD_MODE_PARAMS.includes(optionId) || optionId === SELECT_PARAM) {
				continue;
			}

			const aliasId = this._getOptions()[optionId].alias;
			if (this._getOptions().hasOwnProperty(optionId) && (!this._isOptionPresent(optionId, aliasId, params))) {
				validationErrors.push(NodeTranslationService.getMessage(IS_MANDATORY, this._getOptions()[optionId].name));
			}
		}
		return validationErrors;
	}

	_validateActionParametersSelectMode(params) {
		//authId parameter, it is mandatory both in default and select mode
		const AUTH_ID_PARAM = COMMAND.OPTIONS.AUTHID;
		const validationErrors = [];
		//it is going to be rejected anyway by the standard CommandOptionsValidator since it is mandatory
		//it is validated also here for consistency reasons and to be able to customize the message
		if (params[AUTH_ID_PARAM] === null || params[AUTH_ID_PARAM] === undefined) {
			validationErrors.push(NodeTranslationService.getMessage(IS_MANDATORY_SELECT_MODE, this._getOptions()[AUTH_ID_PARAM].name));
		}

		//Other parameters which are not select and auth_id are not allowed
		for (const optionId in this._getOptions()) {
			const aliasId = this._getOptions()[optionId].alias;
			if (this._getOptions().hasOwnProperty(optionId) &&
				optionId !== SELECT_PARAM && optionId !== AUTH_ID_PARAM &&
				this._isOptionPresent(optionId, aliasId, params)) {
				validationErrors.push(NodeTranslationService.getMessage(IS_NOT_ALLOWED_SELECT_MODE, this._getOptions()[optionId].name))
			}
		}
		return validationErrors;
	}


	_isOptionPresent(optionId, aliasId, args) {
		return args[optionId] || args[aliasId];
	}

	_getOptions() {
		return this._commandMetadata.options;
	}

	_isDefaultMode(params) {
		return (params[SELECT_PARAM] === null || params[SELECT_PARAM] === undefined);
	}

}
module.exports = AccountSetupCiValidation;

