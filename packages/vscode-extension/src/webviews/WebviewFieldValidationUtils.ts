import { DEVASSIST_SERVICE } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';

const translationService = new VSTranslationService();

export const validateTextAreaField = (fieldName : string, textContent : string, maxLength : number) => {
	if (!textContent || textContent.trim().length === 0)
	{
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			fieldName,
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	}
	else if (textContent.length > maxLength) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			fieldName,
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_TOO_LONG, maxLength.toString()));
	}

	return true;
}

export const validateMultipleOptionField = (fieldName : string, selectedOptions : string[], acceptableOptions : string[]) => {
	if (!selectedOptions || selectedOptions.length === 0) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			fieldName,
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	}
	else {
		const uniqueSelectedOptions = new Set(selectedOptions);
		if (uniqueSelectedOptions.size !== selectedOptions.length) {
			return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
				fieldName,
				translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_HAVE_REPEATED_VALUES, selectedOptions.toString()));
		}
		for (const option of selectedOptions) {
			if (acceptableOptions.includes(option)) {
				return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
					fieldName,
					translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.MUST_HAVE_SPECIFIC_VALUES, acceptableOptions.toString()));
			}
		}
	}

	return true;
}

export const validateIntegerWithinInterval = (fieldName : string, nValue : number, lowerBound : number, upperBound : number) => {
	if (!nValue || nValue === 0) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			fieldName,
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	}
	else if (!Number.isInteger(nValue) || nValue < lowerBound || nValue > upperBound) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			fieldName,
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.MUST_HAVE_SPECIFIC_VALUES, lowerBound.toString(), upperBound.toString()));
	}

	return true;
}