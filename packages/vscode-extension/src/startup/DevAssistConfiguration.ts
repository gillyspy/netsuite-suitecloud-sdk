import * as vscode from 'vscode';
import { VSCODE_PLATFORM } from '../ApplicationConstants';
import { getSdkPath } from '../core/sdksetup/SdkProperties';
import VSConsoleLogger from "../loggers/VSConsoleLogger";
import MessageService from '../service/MessageService';
import { REFRESH_AUTHORIZATION } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';
import type { SuiteCloudAuthProxyServiceInterface } from '../types/JavascriptNodeCli';
import { AuthenticationUtils, SuiteCloudAuthProxyService, ExecutionEnvironmentContext } from '../util/ExtensionUtil';


// CONSTANTS
const defaultSettings = {
    enableProxy: false,
    proxyPort: 8181,
    authID: 'authid-to-be-used-by-devassist'
}

const proxyServiceEvents = {
    reauthorize: 'authRefreshManual'
}

const proxyUrlParts = {
    scheme: 'http://',
    localhost: '127.0.0.1',
    path: '/api/internal/devassist'
}
const getProxyUrl = (port: number) => `${proxyUrlParts.scheme}${proxyUrlParts.localhost}:${port}${proxyUrlParts.path}`

// should be in sycn with vscode-extension package.json config properties
const configKeys = {
    devAssistSection: 'suitecloud.devAssist',
    enableProxy: 'enable',
    auhtID: 'authID',
    proxyPort: 'proxyPort'
}

const executionEnvironmentContext = new ExecutionEnvironmentContext({
    platform: VSCODE_PLATFORM,
    platformVersion: vscode.version,
});

let devAssistProxyService: SuiteCloudAuthProxyServiceInterface;
const vsLogger: VSConsoleLogger = new VSConsoleLogger();
const vsNotificationService = new MessageService('DevAssistService');
const translationService = new VSTranslationService();


export const startDevAssistProxyIfEnabled = async (devAssistStatusBar: vscode.StatusBarItem) => {
    const devAssistConfig = getDevAssistConfig();
    console.log('startDevAssistProxyIfEnabled', devAssistConfig);

    if (devAssistConfig.enableProxy) {
        try {
            initializeDevAssistService(devAssistStatusBar);
            await startDevAssistService(devAssistConfig.authID, devAssistConfig.localPort, devAssistStatusBar);
        } catch (error) {
            showStartDevAssistProblemNotification('startup', error as string, devAssistConfig, devAssistStatusBar);
        }
    } else {
        if (devAssistProxyService) {
            // this shouldn't happen
            vsLogger.info("Stoping DevAssist proxy. This shouldn't happen.");
            devAssistProxyService.stop()
        }
        // TODO: We might want to propose to configure and enable service
        vsLogger.log('DevAssist service is not enabled.')
    }
    // add extra line to differenciate logs
    vsLogger.info('');

    // just for testing purposes
    return devAssistProxyService;
}

export const devAssistConfigurationChangeHandler = async (configurationChangeEvent: vscode.ConfigurationChangeEvent, devAssistStatusBar: vscode.StatusBarItem) => {
    if (configurationChangeEvent.affectsConfiguration(configKeys.devAssistSection)) {
        const devAssistConfig = getDevAssistConfig();
        console.log('DevAssist Proxy enabled: ' + devAssistConfig.enableProxy);
        console.log(devAssistConfig);

        if (devAssistConfig.enableProxy === true) {
            if (devAssistProxyService) {
                await devAssistProxyService?.stop();
            } else {
                initializeDevAssistService(devAssistStatusBar);
            }

            try {
                await startDevAssistService(devAssistConfig.authID, devAssistConfig.localPort, devAssistStatusBar);
            } catch (error) {
                showStartDevAssistProblemNotification('settingsChange', error as string, devAssistConfig, devAssistStatusBar);
            }
        } else {
            await stopDevAssistService(devAssistStatusBar);
        }
        // add extra line to differenciate logs
        vsLogger.info('');
    }
};


const initializeDevAssistService = (devAssistStatusBar: vscode.StatusBarItem) => {
    const devAssistConfig = getDevAssistConfig()

    try {
        devAssistProxyService = new SuiteCloudAuthProxyService(getSdkPath(), executionEnvironmentContext);
        vsLogger.info(`DevAssist initialized using authID: ${devAssistConfig.authID} and port: ${devAssistConfig.localPort}`)

        // adding listener to trigger manual reauthentication from vscode
        devAssistProxyService.on(proxyServiceEvents.reauthorize, async (emitParams: { authId: string, message: string }) => {
            const devAssistConfigOnReauthorize = getDevAssistConfig();
            // TODO: not sure which authID we should use or if they could be different at all
            const refreshIsSuccessful = await refreshAuthorizationWithNotifications(emitParams.authId);
            // TODO: we could be using something like devAsssitProxy.reloadAccessToken() to avoid extra forceRefresh in next cline request
            if (refreshIsSuccessful) {
                try {
                    stopDevAssistService(devAssistStatusBar);
                    await startDevAssistService(emitParams.authId, devAssistConfigOnReauthorize.localPort, devAssistStatusBar);
                } catch (error) {
                    showStartDevAssistProblemNotification('afterManualRefresh', error as string, devAssistConfigOnReauthorize, devAssistStatusBar)
                }
            }
        })
    } catch (error) {
        vsLogger.error(`There was an error when initializing DevAssist service.\n${error}`)
    }
};

const startDevAssistService = async (devAssistAuthID: string, localPort: number, devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService.start(devAssistAuthID, localPort);

    const clineURLMessage = `Set Cline Base URL to: ${getProxyUrl(localPort)}`;
    const devAssistRunningAndClineURL = `DevAssist service is running.\n${clineURLMessage}`;

    devAssistStatusBar.text = `$(terminal-view-icon) DevAssist is running.`;
    devAssistStatusBar.backgroundColor = undefined;
    devAssistStatusBar.show();

    vsLogger.info(devAssistRunningAndClineURL)
    vsNotificationService.showCommandInfo(devAssistRunningAndClineURL);
}

const stopDevAssistService = async (devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService.stop();

    devAssistStatusBar.text = `$(ports-stop-forward-icon) DevAssist is stopped.`;
    devAssistStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    devAssistStatusBar.show();

    const stopMessage = 'DevAssist service has been stoped.';
    vsLogger.info(stopMessage)
    vsNotificationService.showCommandInfo(stopMessage);
}

const showStartDevAssistProblemNotification = (errorStage: string, error: string, devAssistConfig: devAssistConfig, devAssistStatusBar: vscode.StatusBarItem) => {
    vsLogger.error(`There was a problem when starting DevAssist service. (${errorStage})\n${error}`);
    // for debugging purposes
    // vsLogger.error(`Current DevAssist settings are: ${JSON.stringify({ devAssistConfig })}`);

    devAssistStatusBar.text = `$(ports-stop-forward-icon) DevAssist is stopped.`;
    devAssistStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
    devAssistStatusBar.show();

    vsNotificationService.showCommandErrorDevAssist('There was a problem when starting DevAssist service.');
}

type devAssistConfig = { enableProxy: boolean, authID: string, localPort: number };
const getDevAssistConfig = (): devAssistConfig => {
    const devAssistConfigSection = vscode.workspace.getConfiguration(configKeys.devAssistSection);

    const enableProxy = devAssistConfigSection.get<boolean>(configKeys.enableProxy) || defaultSettings.enableProxy;
    const authID = devAssistConfigSection.get<string>(configKeys.auhtID) || defaultSettings.authID;
    const localPort = devAssistConfigSection.get<number>(configKeys.proxyPort) || defaultSettings.proxyPort;

    return { enableProxy, authID, localPort }
}

// refresh authorization with notification popups 
const refreshAuthorizationWithNotifications = async (authID: string) => {
    const executionEnvironmentContext = new ExecutionEnvironmentContext({
        platform: VSCODE_PLATFORM,
        platformVersion: vscode.version,
    });
    vsNotificationService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.CREDENTIALS_NEED_TO_BE_REFRESHED, authID
        )
    );
    const refreshAuthzOperationResult = await AuthenticationUtils.refreshAuthorization(
        authID,
        getSdkPath(),
        executionEnvironmentContext
    );

    // TODO remove debbugging logs
    console.log('log from refreshAuthorization DevAssistConfiguration.', { refreshAuthzOperationResult });
    vsLogger.info('log from refreshAuthorization DevAssistConfiguration.')
    vsLogger.info(JSON.stringify(refreshAuthzOperationResult))

    if (!refreshAuthzOperationResult.isSuccess()) {
        // throw refreshAuthzOperationResult.errorMessages;
        // vsLogger.error(refreshAuthzOperationResult.)
        vsNotificationService.showCommandError(refreshAuthzOperationResult.errorMessages.join('\n'), false);
        return false;
    }
    vsNotificationService.showInformationMessage(
        translationService.getMessage(
            REFRESH_AUTHORIZATION.AUTHORIZATION_REFRESH_COMPLETED
        )
    );
    return true;
}

