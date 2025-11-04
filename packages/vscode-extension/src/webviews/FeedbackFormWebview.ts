import * as vscode from 'vscode';
import * as path from 'path';
import MessageService from '../service/MessageService';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST_SERVICE } from '../service/TranslationKeys';
import { getDevAssistCurrentSettings } from '../startup/DevAssistConfiguration';

const messageService = new MessageService();
const translationService = new VSTranslationService();
const cssFileName = 'feedbackForm.css';
const cssFilePath = './src/webviews/' + cssFileName;

let feedbackFormPanel: vscode.WebviewPanel | undefined;

export const openDevAssistFeedbackForm = (context: vscode.ExtensionContext) => {

	// if one FeedbackForm is already open, reveal it instead of creating a new one
	if (feedbackFormPanel) {
		feedbackFormPanel.reveal(vscode.ViewColumn.One);
		return;
	}

	feedbackFormPanel = vscode.window.createWebviewPanel(
		'devassistfeedbackform', // viewtype (used internally by vscode)
		translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.WEBVIEW_TITLE),
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(context.extensionPath, 'src/webviews')),
			],
		},
	);

	// Read HTML and inject the correct webview resource URIs for the CSS file
	const cssUri = feedbackFormPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, cssFilePath)));
	feedbackFormPanel.webview.html = getFeedbackFormHTMLContent(cssUri);

	// Clean up the reference when the panel is closed
	feedbackFormPanel.onDidDispose(
		() => {
			feedbackFormPanel = undefined;
		},
		null,
		context.subscriptions,
	);

	// Handle messages sent from the webview
	feedbackFormPanel.webview.onDidReceiveMessage(
		async (webviewMessage) => {
			switch (webviewMessage.type) {
				case 'submit':
					console.log(webviewMessage);
					feedbackFormPanel?.webview.postMessage({ type: 'status', value: 'success' });

					const currentProxySettings = getDevAssistCurrentSettings();
					try {
						const response = await fetch(`http://127.0.0.1:$${currentProxySettings.localPort}/api/internal/devassist`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: webviewMessage.data
						});
						if (response.ok) {
							feedbackFormPanel?.webview.postMessage({ type: 'status', value: 'success' });
						} else {
							feedbackFormPanel?.webview.postMessage({ type: 'status', value: 'error' });
						}
					} catch (e) {
						feedbackFormPanel?.webview.postMessage({ type: 'status', value: 'error' });
					}
					// Handle/store feedback as needed
					// feedbackFormPanel?.dispose();
					break;
				case 'cancel':
					feedbackFormPanel?.dispose();
					break;
			}
		},
		undefined,
		context.subscriptions,
	);
};

// TODO: define a FormData structure instead of using 'any'
const validateFormData = (formData : any) => {


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

const getCheckboxesHTMLContent = () => {
	const optionsList = Object.values(DEVASSIST_SERVICE.FEEDBACK_FORM.CHECKBOX_LIST_OPTIONS);
	return optionsList.map(option => {
		const optionValue = translationService.getMessage(option);
		const optionID = optionValue.toLowerCase().replace(/\s+/g, '-');
		return `<label><input type="checkbox" name="topics" value="${optionID}"> ${optionValue} </label>`;
	}).join('');
};

// Submitting feedback

// Thank you for your feedback! You can close this window\n [Close Window, write another feedback BUTTON]
// Woah! Something went wrong when submitting your feedback.\n Please try again later

const getFeedbackFormHTMLContent = (cssUri: any) => {

	return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>DevAssist Feedback</title>
			<link rel="stylesheet" href="${cssUri}">
		</head>
		<body>
		<div class="card" role="region" aria-labelledby="title">
			<header>
				<h1 id="title">${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.TITLE)}</h1>
				<p class="note">${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.SUBTITLE)}</p>
			</header>
			<form class="content" id="feedbackForm">
				<div class="row">
					<label
						for="feedback">${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.TEXTAREA_SUBTITLE)}</label>
					<textarea id="feedback" name="feedback"
							  placeholder="${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.TEXTAREA_HINT)}"
							  required></textarea>
				</div>
		
				<fieldset>
					<legend>${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.CHECKBOX_LIST_SUBTITLE)}</legend>
					<div class="checks">
						${getCheckboxesHTMLContent()}
					</div>
				</fieldset>
		
				<div class="row" aria-labelledby="ratingLabel">
					<label id="ratingLabel">
						${translationService.getMessage(DEVASSIST_SERVICE.FEEDBACK_FORM.RATING_SUBTITLE)} </label>
					<div class="stars" role="radiogroup" aria-label="Star rating">
						<!-- 5 on the left down to 1 on the right for natural fill effect -->
						<input type="radio" id="star5" name="rating" value="5" required>
						<label class="star" for="star5" aria-label="5 stars"></label>
						<input type="radio" id="star4" name="rating" value="4">
						<label class="star" for="star4" aria-label="4 stars"></label>
						<input type="radio" id="star3" name="rating" value="3">
						<label class="star" for="star3" aria-label="3 stars"></label>
						<input type="radio" id="star2" name="rating" value="2">
						<label class="star" for="star2" aria-label="2 stars"></label>
						<input type="radio" id="star1" name="rating" value="1">
						<label class="star" for="star1" aria-label="1 star"></label>
					</div>
				</div>
		
				<div class="actions">
					<button type="reset" class="secondary">Reset</button>
					<button type="button" class="secondary" id="cancelBtn" title="Close this Feedback form page without sending feedback">Cancel</button>
					<button type="submit">Submit</button>
				</div>
		
				<details>
					<summary class="note">See payload</summary>
					<pre id="result" class="hidden" aria-live="polite"></pre>
				</details>
			</form>
		</div>
		<div id="alert-container"></div>
		<script>
			console.log("Hello World");
			const form = document.getElementById('feedbackForm');
			const result = document.getElementById('result');
			const cancelBtn = document.getElementById('cancelBtn');
		
			function collect() {
				const data = {
					feedback: document.getElementById('feedback').value.trim(),
					topics: Array.from(document.querySelectorAll('input[name="topics"]:checked')).map(el => el.value),
					rating: Number((document.querySelector('input[name="rating"]:checked') || {}).value || 0),
					timestamp: new Date().toISOString(),
				};
				return data;
			}
			
			function spawnAlert(message, type = "info", timeout = 4000) {
				const container = document.getElementById('alert-container');
				if (!container) return;
				const alertDiv = document.createElement('div');
				alertDiv.className = "toast-alert toast-" + type;
				alertDiv.setAttribute('role', 'alert');
				alertDiv.setAttribute('aria-live', 'polite');
				alertDiv.innerHTML =
					\`<span style="flex:1">\${message}</span>
					<button class="toast-close" aria-label="Close" tabindex="0">&times;</button>\`;
				const closeBtn = alertDiv.querySelector('.toast-close');
				let dismissed = false;
				function removeAlert() {
					if (dismissed) return;
					dismissed = true;
					alertDiv.style.transition = "opacity 180ms";
					alertDiv.style.opacity = 0;
					setTimeout(() => container.removeChild(alertDiv), 180);
				}
				closeBtn.addEventListener('click', removeAlert);
				alertDiv.addEventListener('keydown', e => {
					if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') removeAlert();
				});
				container.appendChild(alertDiv);
				setTimeout(removeAlert, timeout);
			}
		
			// VS Code API
			const vscode = acquireVsCodeApi();
			
			form.addEventListener('submit', (e) => {
				e.preventDefault();

				const checkedTopics = document.querySelectorAll('input[name="topics"]:checked');
				const ratingChecked = document.querySelector('input[name="rating"]:checked');

				const data = collect();
				const json = JSON.stringify(data, null, 2);
				result.textContent = json;
				result.classList.remove('hidden');
				
				// TODO: VSCode Security forbids FETCHing content directly from within the Webview.
				// const response = await fetch("http://127.0.0.1:8181/api/internal/devassist", {
				//    method: "POST",
				//    headers: { "Content-Type": "application/json" },
				//    body: json
				// });
				
				vscode.postMessage({ type: 'submit', data: json });
			});
			
			cancelBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'cancel' });
			});
			
			// Listen to VSCode Events
			window.addEventListener('message', event => {
				const { type, value, message } = event.data;
				if (type === 'spawnAlertEvent') {
					if (value === 'info') spawnAlert(message, 'info', 10000);
					else if (value === 'error') spawnAlert(message, 'error', 10000);
				}
			});
		</script>
		</body>
		</html>`;
};