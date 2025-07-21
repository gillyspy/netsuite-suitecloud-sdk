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
const { ACCOUNT_SETUP_CI: { COMMAND: {OPTIONS, OPTIONAL_IN_SETUP_MODE}}} = require('../../../ApplicationConstants');

//Select indicator, the action behaves in two different ways depending on select parameter is selected or not

//not mandatory params in setup (not select) mode, all the other parameters are mandatory
const { COMMAND_SETUPACCOUNTCI : {ERRORS} } = require('../../../services/TranslationKeys');

class AccountSetupCiValidation {
	constructor(commandMetadata, runInInteractiveMode) {
		this._commandMetadata = commandMetadata;
		this._runInInteractiveMode = runInInteractiveMode;
	}

	validateAuthIDFormat(authId) {
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
	 * There are 2 options, select mode --select <authI> and nothing else allowed.
	 * and the setup mode --authid <authI> --certificateid <certId>--privatekeypath <privatekeypath> -account <account> -domain <domain>
	 * all mandatory except domain which is optional.
	 * @param params
	 */
	validateActionParametersByMode(params) {
		assert(this._commandMetadata);
		assert(this._commandMetadata.options);
		const validationErrors = this._isSetupMode(params) ?
			this._validateActionParametersSetupMode(params) :
			this._validateActionParametersSelectMode(params);

		if (validationErrors.length > 0) {
			throwValidationException(validationErrors, this._runInInteractiveMode, this._commandMetadata);
		}
	}
	_validateActionParametersSetupMode(params) {
		const validationErrors = [];
		//All the parameters are set as non-mandatory in the configuration because the setup mode [account:setup:ci] mode
		//is shared with the [account:setup:ci] select mode where these parameters are not used.
		//The validation of the mandatory setup mode parameters is done here instead of being done here, instead
		//of being handled automatically by the library
		for (const optionId in this._getOptions()) {
			//Exclude optional parameters from the validation, select should not be included either.
			if (OPTIONAL_IN_SETUP_MODE.includes(optionId) ||  optionId === OPTIONS.SELECT || this._getOptions()[optionId].disableInIntegrationMode) {
				continue;
			}

			//Validate all the (mandatory) parameters are present
			if (this._getOptions().hasOwnProperty(optionId) && (!this._isOptionPresent(optionId, params))) {
				validationErrors.push(NodeTranslationService.getMessage(ERRORS.IS_MANDATORY_SETUP_MODE, this._getOptions()[optionId].name));
			}
		}
		return validationErrors;
	}

	_validateActionParametersSelectMode(params) {

		const validationErrors = [];
		//Loop through all [account:setup:ci] parameters except select. If any of them are present, show the message
		//<param> is not allowed in setup mode. Any other parameter will show the generic unknown option message.
		for (const optionId in this._getOptions()) {
			if (optionId === OPTIONS.SELECT) continue;

			if (this._getOptions().hasOwnProperty(optionId) &&
				//the parameter is present in the current command line
				this._isOptionPresent(optionId, params)) {
				validationErrors.push(NodeTranslationService.getMessage(ERRORS.IS_NOT_ALLOWED_SELECT_MODE, this._getOptions()[optionId].name));
			}
		}
		return validationErrors;
	}


	_isOptionPresent(optionId, args) {
		return args[optionId];
	}

	_getOptions() {
		return this._commandMetadata.options;
	}

	_isSetupMode(params) {
		return (!params[OPTIONS.SELECT]);
	}

}
module.exports = AccountSetupCiValidation;