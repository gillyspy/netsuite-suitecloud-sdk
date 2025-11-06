import * as vscode from 'vscode';
import * as path from 'path';
import MessageService from '../service/MessageService';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST_SERVICE } from '../service/TranslationKeys';
import { getDevAssistCurrentSettings } from '../startup/DevAssistConfiguration';
import { FileUtils, InteractiveAnswersValidator } from '../util/ExtensionUtil';
import VSConsoleLogger from '../loggers/VSConsoleLogger';

const translationService = new VSTranslationService();
const vsLogger = new VSConsoleLogger();

const MEDIA_DIR = 'resources/media'

const WEBVIEW_FILE_NAMES = {
	FEEDBACK_FORM : {
		HTML : 'FeedbackForm.html',
		CSS : 'FeedbackForm.css'
	},
	SUBMITTING_HTML : 'FeedbackFormSubmitting.html',
	SUCCESS_HTML : 'FeedbackFormSucess.html',
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
		feedbackFormPanel.reveal(vscode.ViewColumn.One);
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
	feedbackFormPanel.webview.html = getWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);


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
	if (!formData.feedback || formData.feedback.trim().length === 0) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			"Your Feedback TextArea",
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	} else if (formData.feedback.length > 1000) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			"Your Feedback TextArea",
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_TOO_LONG, "1000"));
	}

	// validate selectedTopic field
	if (!formData.topics || !Array.isArray(formData.topics) || formData.topics.length === 0) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			"Your Feedback Topic",
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	} else {
		const uniqueTopics = new Set(formData.topics);
		if (uniqueTopics.size !== formData.topics.length) {
			return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
				"Your Feedback Topic",
				translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_HAVE_REPEATED_VALUES, formData.topics.toString()));
		}
		for (const topic of formData.topics) {
			if (VALID_FEEDBACK_TOPICS.includes(topic)) {
				return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
					"Your Feedback Topic",
					translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.MUST_HAVE_SPECIFIC_VALUES, VALID_FEEDBACK_TOPICS.toString()));
			}
		}
	}

	// validate rating field (integer 0 < x <= 5)
	if (!formData.rating || formData.rating === 0) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			"Rating Field",
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.CANNOT_BE_EMPTY));
	}
	if (!Number.isInteger(formData.rating) || formData.rating < 1 || formData.rating > 5) {
		return translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.VALIDATION_ERROR,
			"Rating Field",
			translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.FIELD.MUST_HAVE_SPECIFIC_VALUES, "1", "5"));
	}

	return true;
}


export const debugCall = () => {
	if (!feedbackFormPanel) {
		return;
	}

	// Send a message to our webview.
	// You can send any JSON serializable data.
	feedbackFormPanel.webview.postMessage({ type: 'spawnAlertEvent', value: 'info', message: 'Random test message info / error' });
	feedbackFormPanel.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: 'Random test message info / error'});
};

// Submitting feedback

// Thank you for your feedback! You can close this window\n [Close Window, write another feedback BUTTON]
// Woah! Something went wrong when submitting your feedback.\n Please try again later

const handleWebviewMessage = async (webviewMessage : any, feedbackFormCSSFilePath : string) : Promise<void> => {
	switch (webviewMessage.type) {
		case WEBVIEW_EVENTS.SUBMIT_FEEDBACK:
			console.log(webviewMessage);

			// validate Feedback Form Data
			const validationResult = validateFormData(webviewMessage.data);
			if (typeof validationResult === 'string') {
				feedbackFormPanel!.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.VALIDATION_ERROR, validationResult)});
				return;
			}

			const submittingHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.SUBMITTING_HTML);
			feedbackFormPanel!.webview.html = getWebviewHTMLContent(submittingHTMLFilePath, feedbackFormCSSFilePath);

			// Send request to NetSuite Backend through Proxy
			const currentProxySettings = getDevAssistCurrentSettings();
			try {
				const response = await fetch(`http://127.0.0.1:${currentProxySettings.localPort}/api/internal/devassist/feedback`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: webviewMessage.data
				});
				// TODO: this 404 shouldn't be here, so remove it once development/testing is finished
				if (response.ok) {
					vsLogger.printTimestamp();
					vsLogger.info("Feedback Form Success: " + response.status + ' ' + response.statusText);
					vsLogger.info('');
					const successHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.SUCCESS_HTML);
					feedbackFormPanel!.webview.html = getWebviewHTMLContent(successHTMLFilePath, feedbackFormCSSFilePath);
				}
				else {
					vsLogger.printTimestamp();
					vsLogger.error("Feedback Form External Failure: " + response.status + ' ' + response.statusText);
					vsLogger.error('');
					const failureHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FAILURE_HTML);
					feedbackFormPanel!.webview.html = getWebviewHTMLContent(failureHTMLFilePath, feedbackFormCSSFilePath);
				}
			} catch (e) {
				vsLogger.printTimestamp();
				vsLogger.error("Feedback Form Internal Failure: " + e);
				vsLogger.error('');

				// TODO: Find a way to not delete the user input when
				const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
				feedbackFormPanel!.webview.html = getWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);
				feedbackFormPanel!.webview.postMessage({ type: 'spawnAlertEvent', value: 'error', message: translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.SUBMITTING_ERROR)});
				// const failureHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FAILURE_HTML);
				// feedbackFormPanel!.webview.html = getWebviewHTMLContent(failureHTMLFilePath, feedbackFormCSSFilePath);
			}
			break;

		case WEBVIEW_EVENTS.OPEN_NEW_FEEDBACK_FORM:
			const feedbackFormHTMLFilePath = path.join(vscodeExtensionMediaPath, WEBVIEW_FILE_NAMES.FEEDBACK_FORM.HTML);
			feedbackFormPanel!.webview.html = getWebviewHTMLContent(feedbackFormHTMLFilePath, feedbackFormCSSFilePath);
			break;

		case WEBVIEW_EVENTS.CLOSE:
			feedbackFormPanel?.dispose();
			break;
	}
}

const getWebviewHTMLContent = (htmlFilePath : string, cssFilePath : string): string  => {
	let htmlFileContent = FileUtils.readAsString(htmlFilePath);
	const cssUri = feedbackFormPanel?.webview.asWebviewUri(vscode.Uri.file(cssFilePath));
	htmlFileContent = htmlFileContent.replace('{{CSS_FILE.css}}', cssUri!.toString());

	return htmlFileContent;
}