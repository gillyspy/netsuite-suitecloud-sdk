const {
	showValidationResults,
	validateFieldIsNotEmpty,
	validateFieldHasNoSpaces,
	validateAlphanumericHyphenUnderscore,
	validateMaximumLength,
} = require('../../../validation/InteractiveAnswersValidator');
const assert = require('assert');
const { throwValidationException } = require('../../../utils/ExceptionUtils');
const NodeTranslationService = require('../../../services/NodeTranslationService');
const {
	ACCOUNT_SETUP_CI: {
		COMMAND: {
			OPTIONS,
			MANDATORY_PARAMS_FOR_SETUP_MODE,
		},
	},
} = require('./AccountSetupCiConstants');
const { COMMAND_SETUPACCOUNTCI: { ERRORS } } = require('../../../services/TranslationKeys');

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

	/**
	 * All the parameters are set as non-mandatory in the configuration because the setup mode [account:setup:ci] mode
	 * is shared with the [account:setup:ci] select mode where these parameters are not used.
	 * The validation of the mandatory setup mode parameters is done here, instead
	 * of being handled automatically by the library
	 * @param params
	 * @returns {*[]}
	 * @private
	 */
	_validateActionParametersSetupMode(params) {
		const validationErrors = [];
		const metadataOptions = this._commandMetadata.options;

		MANDATORY_PARAMS_FOR_SETUP_MODE.filter(item => !params[item]).forEach((missingParam) =>
			validationErrors.push(NodeTranslationService.getMessage(ERRORS.IS_MANDATORY_SETUP_MODE, metadataOptions[missingParam].name)));

		return validationErrors;
	}

	/**
	 * All the parameters are set as non-mandatory in the configuration because the select mode [account:setup:ci] mode
	 * is shared with the [account:setup:ci] setup mode where these parameters are not used.
	 * in select mode all the parameters except select are not allowed.
	 * @param params
	 * @returns {*[]}
	 * @private
	 */
	_validateActionParametersSelectMode(params) {
		const validationErrors = [];
		const metadataOptions = this._commandMetadata.options;

		Object.values(OPTIONS).filter(item => params[item] && item !== OPTIONS.SELECT).forEach((notAllowedParam) =>
			validationErrors.push(NodeTranslationService.getMessage(ERRORS.IS_MANDATORY_SETUP_MODE, metadataOptions[notAllowedParam].name)));
		return validationErrors;
	}


	_isSetupMode(params) {
		return (!params[OPTIONS.SELECT]);
	}

}

module.exports = AccountSetupCiValidation;