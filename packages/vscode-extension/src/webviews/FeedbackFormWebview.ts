import * as vscode from 'vscode';
import * as path from 'path';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST_SERVICE, STATUS_BARS } from '../service/TranslationKeys';

const translationService = new VSTranslationService();

let feedbackFormPanel: vscode.WebviewPanel | undefined;

export const openDevAssistFeedbackForm = (context : vscode.ExtensionContext) => {

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
				vscode.Uri.file(path.join(context.extensionPath, 'media'))
			]
		}
	);

	// Read HTML and inject the correct webview resource URIs for the CSS file
	feedbackFormPanel.webview.html = getFeedbackFormHTMLContent();

	// Clean up the reference when the panel is closed
	feedbackFormPanel.onDidDispose(
		() => { feedbackFormPanel = undefined; },
		null,
		context.subscriptions
	);

	// Handle messages sent from the webview
	feedbackFormPanel.webview.onDidReceiveMessage(
		message => {
			switch (message.type) {
				case 'submit':
					vscode.window.showInformationMessage('Thanks for your feedback!');
					// Handle/store feedback as needed
					feedbackFormPanel?.dispose();
					break;
				case 'cancel':
					feedbackFormPanel?.dispose();
					break;
			}
		},
		undefined,
		context.subscriptions
	);
}

const getCheckboxesHTMLContent = () => {
	const optionsList = Object.values(DEVASSIST_SERVICE.FEEDBACK_FORM.CHECKBOX_LIST_OPTIONS);
	return optionsList.map(option => {
		const optionValue = translationService.getMessage(option);
		const optionID = optionValue.toLowerCase().replace(/\s+/g, '-');
		return `<div>
           <input type="checkbox" id="${optionID}" name="topics" value="${optionValue}">
           <label for="${optionID}">${optionValue}</label>
        </div>`; }).join('');
}

const getFeedbackFormHTMLContent = () => {
	return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<title>DevAssist Feedback</title>
			<link rel="stylesheet" href="./feedbackForm.css">
		</head>
		<body>
			<div class="container">
				<h1>${DEVASSIST_SERVICE.FEEDBACK_FORM.TITLE}</h1>
				<h2>${DEVASSIST_SERVICE.FEEDBACK_FORM.SUBTITLE}</h2>
				<form id="feedback-form">
					<label for="feedback-text">${DEVASSIST_SERVICE.FEEDBACK_FORM.TEXTAREA_SUBTITLE}</label>
					<textarea id="feedback-text" name="feedback" rows="4" required></textarea>
					
					<div class="checkbox-group">
						<label>${DEVASSIST_SERVICE.FEEDBACK_FORM.CHECKBOX_LIST_SUBTITLE}</label>
						${getCheckboxesHTMLContent}
					</div>
					
					<div class="rating-group">
						<label>${DEVASSIST_SERVICE.FEEDBACK_FORM.RATING_SUBTITLE}</label>
						<div class="stars" id="star-rating">
							<span data-value="1">&#9733;</span>
							<span data-value="2">&#9733;</span>
							<span data-value="3">&#9733;</span>
							<span data-value="4">&#9733;</span>
							<span data-value="5">&#9733;</span>
						</div>
					</div>
					
					<div class="button-group">
						<button type="button" id="cancel-button">${DEVASSIST_SERVICE.FEEDBACK_FORM.BUTTON.CANCEL}</button>
						<button type="submit" id="send-button">${DEVASSIST_SERVICE.FEEDBACK_FORM.BUTTON.SEND}</button>
					</div>
				</form>
			</div>
			<script>
				// Star rating functionality
				const stars = document.querySelectorAll('#star-rating span');
				let rating = 0;
		
				stars.forEach(star => {
					star.addEventListener('click', () => {
						rating = parseInt(star.getAttribute('data-value'));
						stars.forEach((s, i) => {
							s.classList.toggle('selected', i < rating);
						});
					});
				});
		
				// submit button
				document.getElementById('feedback-form').addEventListener('submit', event => {
					event.preventDefault();
					const feedback = document.getElementById('feedback-text').value;
					const topics = Array.from(document.querySelectorAll('input[name="topics"]:checked')).map(cb => cb.value);
					// Send data to extension host
					vscode.postMessage({ type: 'submit', feedback, topics, rating });
				});
		
				// cancel button
				document.getElementById('cancel-button').addEventListener('click', () => {
					vscode.postMessage({ type: 'cancel' });
				});
		
				// VS Code API communication
				const vscode = acquireVsCodeApi();
			</script>
		</body>
		</html>`;
}