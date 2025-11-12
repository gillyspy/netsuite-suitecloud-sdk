import * as vscode from 'vscode';
import * as path from 'path';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST_SERVICE } from '../service/TranslationKeys';
import { getDevAssistCurrentSettings } from '../startup/DevAssistConfiguration';
import { ApplicationConstants, FileUtils } from '../util/ExtensionUtil';
import VSConsoleLogger from '../loggers/VSConsoleLogger';
import {
	validateIntegerWithinInterval,
	validateMultipleOptionField,
	validateTextAreaField,
} from './WebviewFieldValidationUtils';
import { DEVASSIST } from '../ApplicationConstants';

const translationService = new VSTranslationService();
const vsLogger = new VSConsoleLogger();

const MEDIA_DIR = 'resources/media'
const PROXY_URL = DEVASSIST.PROXY_URL;

const WEBVIEW_FILE_NAMES = {
	FEEDBACK_FORM : {
		HTML : 'FeedbackForm.html',
		CSS : 'FeedbackForm.css'
	},
	SUBMITTING_HTML : 'FeedbackFormSubmitting.html',
	SUCCESS_HTML : 'FeedbackFormSuccess.html',
	FAILURE_HTML : 'FeedbackFormFailure.html',
}

const WEBVIEW_EVENTS = {
	CLOSE : "CLOSE_WEBVIEW",
	SUBMIT_FEEDBACK : "SUBMIT_FEEDBACK",
	OPEN_NEW_FEEDBACK_FORM : "OPEN_NEW_FEEDBACK_FORM",
}

type FeedbackFormData = {
	feedback: string;
	topics: string[];
	rating: number;
};

const VALID_FEEDBACK_TOPICS = [
	"CodeExplanation",
	"SDFObjectGeneration",
	"SuiteScriptCodeGeneration",
	"UnitTesting",
	"Other"
]

let feedbackFormPanel: vscode.WebviewPanel | undefined;
let vscodeExtensionMediaPath : string;
export const openDevAssistFeedbackForm = (context: vscode.ExtensionContext) => {

	// if one FeedbackForm is already open, reveal it instead of creating a new one
	if (feedbackFormPanel) {
		feedbackFormPanel.reveal();
		return;
	}

	vscodeExtensionMediaPath = path.join(context.extensionPath, MEDIA_DIR);
	feedbackFormPanel = vscode.window.createWebviewPanel(
		'devassistfeedbackform',
		'SuiteCloud Developer Assistant Feedback',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(vscodeExtensionMediaPath),
			],
		},
	);

	// Read HTML and inject the correct webview resource URIs for the CSS file
    const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
    const feedbackFormCSSFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.CSS);
	feedbackFormPanel.webview.html = generateWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);

	// Clean up the reference when the WebviewPanel is closed
	feedbackFormPanel.onDidDispose(
		() => {
			feedbackFormPanel = undefined;
		},
		null,
		context.subscriptions,
	);

	// Handle messages/events sent from the webview
	feedbackFormPanel.webview.onDidReceiveMessage(
		(webviewMessage) => handleWebviewMessage(webviewMessage, feedbackFormCSSFilePath),
		undefined,
		context.subscriptions,
	);
};

const validateFormData = (formData : FeedbackFormData) => {

	// validate feedback field (textArea)
	let validationResult = validateTextAreaField("Your feedback (text area)", formData.feedback, 1000);
	if (typeof validationResult === 'string') {
		return validationResult;
	}

	// validate selectedTopic field
	validationResult = validateMultipleOptionField("Your feedback (topic multi-choice selector)", formData.topics, VALID_FEEDBACK_TOPICS);
	if (typeof validationResult === 'string') {
		return validationResult;
	}

	// validate rating field (integer 0 < x <= 5)
	validationResult = validateIntegerWithinInterval("Rating", formData.rating, 1, 5);
	if (typeof validationResult === 'string') {
		return validationResult;
	}

	return true;
}

const handleWebviewMessage = async (webviewMessage : any, feedbackFormCSSFilePath : string) : Promise<void> => {
	switch (webviewMessage.type) {
		case WEBVIEW_EVENTS.SUBMIT_FEEDBACK:
			console.log(webviewMessage);

			// validate Feedback Form Data
			const validationResult = validateFormData(webviewMessage.data);
			if (typeof validationResult === 'string') {
				feedbackFormPanel!.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.GENERIC_VALIDATION_ERROR_WRAPPER, validationResult)});
				return;
			}

			const submittingHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.SUBMITTING_HTML);
			feedbackFormPanel!.webview.html = generateWebviewHTMLContent(submittingHTMLFilePath, feedbackFormCSSFilePath);

			// Send request to NetSuite Backend through Proxy
			try {
				const currentProxySettings = getDevAssistCurrentSettings();
				const response = await fetch(`${PROXY_URL.SCHEME}${PROXY_URL.LOCALHOST_IP}:${currentProxySettings.localPort}${PROXY_URL.FEEDBACK_PATH}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: webviewMessage.data
				});
				if (response.ok) {
					vsLogger.printTimestamp();
					vsLogger.info("Feedback Form Success: " + response.status + ' ' + response.statusText);
					vsLogger.info('');
					const successHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.SUCCESS_HTML);
					feedbackFormPanel!.webview.html = generateWebviewHTMLContent(successHTMLFilePath, feedbackFormCSSFilePath);
				}
				else {
					vsLogger.printTimestamp();
					vsLogger.error("Feedback Form External Failure: " + response.status + ' ' + response.statusText);
					vsLogger.error('');

					// "Manual reauthentication is needed" proxy event
					if (response.status === ApplicationConstants.HTTP_RESPONSE_CODE.FORBIDDEN) {
						const responseBody : any = await response.json();
						const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
						feedbackFormPanel!.webview.html = generateWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);
						feedbackFormPanel!.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: `Error 403: "${responseBody.error}"`});
					}
					else {
						const failureHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FAILURE_HTML);
						feedbackFormPanel!.webview.html = generateWebviewHTMLContent(failureHTMLFilePath, feedbackFormCSSFilePath);
					}
				}
			} catch (e) {
				vsLogger.printTimestamp();
				vsLogger.error("Feedback Form Internal Failure: " + e);
				vsLogger.error('');

				// TODO: Find a way to not delete the user input when swaping HTML / clicking out
				// 	-> https://code.visualstudio.com/api/extension-guides/webview#getstate-and-setstate
				const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
				feedbackFormPanel!.webview.html = generateWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);
				feedbackFormPanel!.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.SUBMITTING_ERROR)});
			}
			break;

		case WEBVIEW_EVENTS.OPEN_NEW_FEEDBACK_FORM:
			const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
			feedbackFormPanel!.webview.html = generateWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);
			break;

		case WEBVIEW_EVENTS.CLOSE:
			feedbackFormPanel?.dispose();
			break;
	}
}

const generateWebviewHTMLContent = (htmlFilePath : string, cssFilePath : string): string  => {
	let htmlFileContent = FileUtils.readAsString(htmlFilePath);
	const cssUri = feedbackFormPanel?.webview.asWebviewUri(vscode.Uri.file(cssFilePath));
	htmlFileContent = htmlFileContent.replace('{{CSS_FILE.css}}', cssUri!.toString());

	return htmlFileContent;
}