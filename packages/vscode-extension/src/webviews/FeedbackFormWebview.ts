import * as vscode from 'vscode';
import * as path from 'path';
import MessageService from '../service/MessageService';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST_SERVICE } from '../service/TranslationKeys';

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
		async (message) => {
			switch (message.type) {
				case 'submit':
					console.log(message);
					vscode.window.showInformationMessage('Thanks for your feedback!');
					feedbackFormPanel?.webview.postMessage({ type: 'status', value: 'success' });
					try {
						const response = await fetch('http://127.0.0.1:8181/api/internal/devassist', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: message.data
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

export const debugCall = () => {
	if (!feedbackFormPanel) {
		return;
	}

	// Send a message to our webview.
	// You can send any JSON serializable data.
	feedbackFormPanel.webview.postMessage({ type: 'status', value: 'success' });
};

const getCheckboxesHTMLContent = () => {
	const optionsList = Object.values(DEVASSIST_SERVICE.FEEDBACK_FORM.CHECKBOX_LIST_OPTIONS);
	return optionsList.map(option => {
		const optionValue = translationService.getMessage(option);
		const optionID = optionValue.toLowerCase().replace(/\s+/g, '-');
		return `<label><input type="checkbox" name="topics" value="${optionID}"> ${optionValue} </label>`;
	}).join('');
};

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
					<button type="button" class="secondary" id="copyBtn" title="Copy JSON to clipboard">Copy JSON</button>
					<button type="reset" class="secondary">Reset</button>
					<!--button type="button" class="secondary" id="cancelBtn" title="Close this Feedback form page without sending feedback">Cancel</button-->
					<button type="submit">Preview</button>
				</div>
		
				<details>
					<summary class="note">See payload</summary>
					<pre id="result" class="hidden" aria-live="polite"></pre>
				</details>
			</form>
		</div>
		<script>
			console.log("Hello World");
			const form = document.getElementById('feedbackForm');
			const result = document.getElementById('result');
			const copyBtn = document.getElementById('copyBtn');
			// const cancelBtn = document.getElementById('cancelBtn');
		
			function collect() {
				const data = {
					feedback: document.getElementById('feedback').value.trim(),
					topics: Array.from(document.querySelectorAll('input[name="topics"]:checked')).map(el => el.value),
					rating: Number((document.querySelector('input[name="rating"]:checked') || {}).value || 0),
					timestamp: new Date().toISOString(),
				};
				return data;
			}
		
			// VS Code API
			const vscode = acquireVsCodeApi();
			
			form.addEventListener('submit', (e) => {
				e.preventDefault();

				const checkedTopics = document.querySelectorAll('input[name="topics"]:checked');
				const ratingChecked = document.querySelector('input[name="rating"]:checked');

				if (checkedTopics.length === 0) {
					alert('Please select at least one topic.');
					// If you want, focus the first checkbox (optional):
					document.querySelector('input[name="topics"]')?.focus();
					return;
				}
				if (!ratingChecked) {
					alert('Please select a rating.');
					// Focus first radio button (optional):
					document.querySelector('input[name="rating"]')?.focus();
					return;
				}

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
		
			copyBtn.addEventListener('click', async () => {
				const data = collect();
				const json = JSON.stringify(data, null, 2);
				try {
					await navigator.clipboard.writeText(json);
					copyBtn.textContent = 'Copied!';
					setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1200);
				} catch (err) {
					// Fallback: show in pane if clipboard blocked
					result.textContent = json + '\\n\\n(Clipboard blocked by browser)';
					result.classList.remove('hidden');
				}
			});
			
			// cancelBtn.addEventListener('click', () => {
			// 	vscode.postMessage({ type: 'cancel' });
			// });
			
			// TODO: It would be nice to recieve callbacks from VSCode but unfortunately this doesn't work either. window is null
			window.addEventListener('message', event => {
				const { type, value } = event.data;
				if (type === 'status') {
					if (value === 'sending') alert('Sending feedback to server...');
					else if (value === 'success') alert('Feedback was received successfully!');
					else if (value === 'error') alert('An unexpected error occurred. Please try again later');
				}
			});
		</script>
		</body>
		</html>`;
};