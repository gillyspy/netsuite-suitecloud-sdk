import * as vscode from 'vscode';
import { DEVASSIST_CONFIG, VSCODE_PLATFORM } from '../ApplicationConstants';
import { getSdkPath } from '../core/sdksetup/SdkProperties';
import VSConsoleLogger from "../loggers/VSConsoleLogger";
import MessageService from '../service/MessageService';
import { REFRESH_AUTHORIZATION } from '../service/TranslationKeys';
import { VSTranslationService } from '../service/VSTranslationService';
import { DEVASSIST } from '../service/TranslationKeys';
import type { SuiteCloudAuthProxyServiceInterface } from '../types/JavascriptNodeCli';
import { AuthenticationUtils, SuiteCloudAuthProxyService, ExecutionEnvironmentContext } from '../util/ExtensionUtil';


type devAssistConfig = {
    proxyEnabled: boolean,
    authID: string,
    localPort: number,
    startupNotificationEnabled: boolean
};

const devAssistConfigStatus: { current: devAssistConfig, previous: devAssistConfig } = {
    current: {
        proxyEnabled: false,
        authID: '',
        localPort: 0,
        startupNotificationEnabled: true,
    },
    previous: {
        proxyEnabled: false,
        authID: '',
        localPort: 0,
        startupNotificationEnabled: true
    }
}

const proxyServiceEvents = {
    reauthorize: 'authRefreshManual',
    serverError: 'serverError'
}

const proxyUrlParts = {
    scheme: 'http://',
    localhost: '127.0.0.1',
    path: '/api/internal/devassist'
}
const getProxyUrl = (port: number) => `${proxyUrlParts.scheme}${proxyUrlParts.localhost}:${port}${proxyUrlParts.path}`;
const getProyUrlWithoutPath = (port: number) => `${proxyUrlParts.scheme}${proxyUrlParts.localhost}:${port}`;

const executionEnvironmentContext = new ExecutionEnvironmentContext({
    platform: VSCODE_PLATFORM,
    platformVersion: vscode.version,
});

let devAssistProxyService: SuiteCloudAuthProxyServiceInterface;
const vsLogger: VSConsoleLogger = new VSConsoleLogger();
const vsNotificationService = new MessageService('DevAssistService');
const translationService = new VSTranslationService();


export const startDevAssistProxyIfEnabled = async (devAssistStatusBar: vscode.StatusBarItem) => {
    updateDevAssistConfigStatus();

    if (devAssistConfigStatus.current.startupNotificationEnabled && !devAssistConfigStatus.current.proxyEnabled) {
        vsNotificationService.showDevAssistStartUpMessage(translationService.getMessage(DEVASSIST.STARTUP.MESSAGE))
    }

    if (devAssistConfigStatus.current.proxyEnabled) {
        try {
            initializeDevAssistService(devAssistStatusBar);
            await startDevAssistService(devAssistConfigStatus.current.authID, devAssistConfigStatus.current.localPort, devAssistStatusBar);
        } catch (error) {
            showStartDevAssistProblemNotification('startup', error as string, devAssistStatusBar);
        }
    } else {
        // TODO: We might want to propose to configure and enable service
        vsLogger.log(translationService.getMessage(DEVASSIST.SERVICE_IS_DISABLED.OUTPUT));
    }
    // add extra line to differenciate logs
    vsLogger.info('');

    // just for testing purposes
    return devAssistProxyService;
}

export const devAssistConfigurationChangeHandler = async (configurationChangeEvent: vscode.ConfigurationChangeEvent, devAssistStatusBar: vscode.StatusBarItem) => {
    if (configurationChangeEvent.affectsConfiguration(DEVASSIST_CONFIG.KEYS.devAssistSection)) {
        updateDevAssistConfigStatus();

        if (!devAssistConfigStatusHasEffectivelyChanged()) {
            // if configuration has not effectively changed do not perform any action
            return;
        }

        if (devAssistConfigStatus.current.proxyEnabled === true) {
            try {
                if (devAssistProxyService) {
                    await devAssistProxyService?.stop();
                } else {
                    initializeDevAssistService(devAssistStatusBar);
                }

                await startDevAssistService(devAssistConfigStatus.current.authID, devAssistConfigStatus.current.localPort, devAssistStatusBar);
                devAssistStatusBar.show();
            } catch (error) {
                showStartDevAssistProblemNotification('settingsChange', error as string, devAssistStatusBar);
            }
        } else { // devAssistConfigStatus.current.proxyEnabled === false
            await stopDevAssistService(devAssistStatusBar);
            devAssistStatusBar.hide()
        }
        // add extra line to differenciate logs
        vsLogger.info('');
    }
};


const initializeDevAssistService = (devAssistStatusBar: vscode.StatusBarItem) => {
    devAssistProxyService = new SuiteCloudAuthProxyService(getSdkPath(), executionEnvironmentContext);

    // adding listener to trigger manual reauthentication from vscode
    devAssistProxyService.on(proxyServiceEvents.reauthorize, async (emitParams: { authId: string, message: string }) => {
        // trigger refresh on emited authID 
        const refreshIsSuccessful = await refreshAuthorizationWithNotifications(emitParams.authId);
        if (refreshIsSuccessful) {
            // although very rare case, user might have changed configured authid while waiting for the manual refresh to complete
            updateDevAssistConfigStatus();
            try {
                // TODO: we could be using something like devAsssitProxy.reloadAccessToken() to avoid extra forceRefresh in next cline request
                stopDevAssistService(devAssistStatusBar);
                await startDevAssistService(devAssistConfigStatus.current.authID, devAssistConfigStatus.current.localPort, devAssistStatusBar);
            } catch (error) {
                showStartDevAssistProblemNotification('afterManualRefresh', error as string, devAssistStatusBar)
            }
        }
    });

    // adding listener to forward ServerError from SutieCloudAuthProxy to vscode suitecloud output
    devAssistProxyService.on(proxyServiceEvents.serverError, (emitParams: { authId: string, message: string }) => {
        // just forwarding info into suitecloud output for now
        vsLogger.error(`ServerError has occured when running DevAssist service.\nError: ${emitParams.message}`);
        vsLogger.error('');
    });
};

const startDevAssistService = async (devAssistAuthID: string, localPort: number, devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService.start(devAssistAuthID, localPort);

    setSuccessDevAssistStausBarMessage(devAssistStatusBar)
    const proxyUrl = getProxyUrl(localPort);
    vsNotificationService.showCommandInfo(translationService.getMessage(DEVASSIST.SERVICE_IS_RUNNING.NOTIFICATION, proxyUrl));
    vsLogger.info(translationService.getMessage(DEVASSIST.SERVICE_IS_RUNNING.OUTPUT, getProyUrlWithoutPath(localPort), devAssistAuthID, proxyUrl));
}

const stopDevAssistService = async (devAssistStatusBar: vscode.StatusBarItem) => {
    await devAssistProxyService?.stop();
    
    setErrorDevAssistStausBarMessage(devAssistStatusBar);
    // only notify that devassist service has been disabled in the transition from enabled to disabled
    if (!devAssistConfigStatus.current.proxyEnabled && devAssistConfigStatus.previous.proxyEnabled) {
        vsLogger.info(translationService.getMessage(DEVASSIST.SERVICE_IS_DISABLED.NOTIFICATION))
        vsNotificationService.showCommandInfo(translationService.getMessage(DEVASSIST.SERVICE_IS_DISABLED.OUTPUT));
    }
}

const showStartDevAssistProblemNotification = (errorStage: string, error: string, devAssistStatusBar: vscode.StatusBarItem) => {
    // console.log(`There was a problem when starting DevAssist service. (${errorStage})\n${error}`)
    setErrorDevAssistStausBarMessage(devAssistStatusBar)
    vsLogger.error(translationService.getMessage(DEVASSIST.SERVICE_IS_STOPPED.OUTPUT, error));
    vsNotificationService.showCommandErrorDevAssist(translationService.getMessage(DEVASSIST.SERVICE_IS_STOPPED.NOTIFICATION));
}

const updateDevAssistConfigStatus = (): void => {

    const previousConfig: devAssistConfig = devAssistConfigStatus.current;
    const currentConfig: devAssistConfig = getDevAssistCurrentSettings();

    // update saved status
    devAssistConfigStatus.current = currentConfig;
    devAssistConfigStatus.previous = previousConfig;
}

const getDevAssistCurrentSettings = (): devAssistConfig => {
    const devAssistConfigSection = vscode.workspace.getConfiguration(DEVASSIST_CONFIG.KEYS.devAssistSection);

    //  * The *effective* value (returned by {@linkcode WorkspaceConfiguration.get get}) is computed by overriding or merging the values in the following order:
    //  *
    //  * 1. `defaultValue` (if defined in `package.json` otherwise derived from the value's type)
    //  * 2. `globalValue` (if defined)
    //  * 3. `workspaceValue` (if defined)
    //  * 4. `workspaceFolderValue` (if defined)
    //  * 5. `defaultLanguageValue` (if defined)
    //  * 6. `globalLanguageValue` (if defined)
    //  * 7. `workspaceLanguageValue` (if defined)
    //  * 8. `workspaceFolderLanguageValue` (if defined)
    //  * Refer to [Settings](https://code.visualstudio.com/docs/getstarted/settings) for more information.

    const proxyEnabled = devAssistConfigSection.get<boolean>(DEVASSIST_CONFIG.KEYS.proxyEnabled, DEVASSIST_CONFIG.DEFAULT_VALUES.proxyEnabled);
    const authID = devAssistConfigSection.get<string>(DEVASSIST_CONFIG.KEYS.auhtID, DEVASSIST_CONFIG.DEFAULT_VALUES.authID);
    const localPort = devAssistConfigSection.get<number>(DEVASSIST_CONFIG.KEYS.localPort, DEVASSIST_CONFIG.DEFAULT_VALUES.localPort);
    const startupNotificationEnabled = devAssistConfigSection.get<boolean>(DEVASSIST_CONFIG.KEYS.startupNotificationEnabled, DEVASSIST_CONFIG.DEFAULT_VALUES.startupNotificationEnabled);

    return { proxyEnabled, authID, localPort, startupNotificationEnabled }
}

const devAssistConfigStatusHasEffectivelyChanged = (): boolean => {
    // we don't know exaclty were configuration change comes from when devAssistConfigurationChangeHandler is called
    // it could be that configuration has changed from globalValue (user) and there is workspaceValue that has left intact
    // this is not 100% sure but configuration could have been changed even in different vscode editor instance
    // we should not be performing any action in the case devAssist settings haven't effectivelly changed 

    // intentionally omiting to compare startupNotificationEnabled status
    if (devAssistConfigStatus.current.authID === devAssistConfigStatus.previous.authID &&
        devAssistConfigStatus.current.localPort === devAssistConfigStatus.previous.localPort &&
        devAssistConfigStatus.current.proxyEnabled === devAssistConfigStatus.previous.proxyEnabled
    ) {
        return false
    }
    return true;
}

const setSuccessDevAssistStausBarMessage = (devAssistStatusBar: vscode.StatusBarItem): void => {
    devAssistStatusBar.text = `$(terminal-view-icon) ${translationService.getMessage(DEVASSIST.SERVICE_IS_RUNNING.STATUSBAR)}`;
    devAssistStatusBar.backgroundColor = undefined;
}
const setErrorDevAssistStausBarMessage = (devAssistStatusBar: vscode.StatusBarItem): void => {
    devAssistStatusBar.text = `$(ports-stop-forward-icon) ${translationService.getMessage(DEVASSIST.SERVICE_IS_STOPPED.STATUSBAR)}`;
    devAssistStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground')
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

