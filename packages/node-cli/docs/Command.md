# Command.js Architecture

This document explains how the `Command.js` module works in the SuiteCloud Node CLI.

## Overview

The `Command` class (`src/commands/Command.js`) implements a **command pattern** with a **builder pattern** for constructing CLI commands. It orchestrates the execution of commands by coordinating three components:

1. **Action** - Executes the core business logic
2. **InputHandler** - Gathers and processes input parameters
3. **OutputHandler** - Formats and displays results

## Class Structure

### Command Class

The main `Command` class accepts four constructor arguments:

```javascript
constructor(options, action, inputHandler, outputHandler)
```

#### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `commandMetadata` | Object | Metadata about the command including name and options |
| `projectFolder` | String | Path to the project folder |
| `log` | Object | Logger instance for output |
| `interactiveSupport` | String | Interactive mode setting (NEVER, ALWAYS, DEFAULT) |
| `runInInteractiveMode` | Boolean | Whether to run in interactive mode |

#### Optional Options

| Option | Type | Description |
|--------|------|-------------|
| `executionPath` | String | Path where command is executed |
| `sdkPath` | String | Path to the SDK |
| `executionEnvironmentContext` | Object | Environment context for execution |

## Interactive Modes

The command supports three interactive modes:

```javascript
const INTERACTIVE_MODE = {
    NEVER: 'NEVER',      // Never prompt for input
    ALWAYS: 'ALWAYS',    // Always prompt for input
    DEFAULT: 'DEFAULT',  // Use runInInteractiveMode setting
};
```

## Execution Flow

The `run(inputParams)` method executes commands in this order:

```
┌─────────────────────────────────────────────────────────────┐
│                      run(inputParams)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. INPUT HANDLING                                           │
│     - If interactive mode enabled:                           │
│       inputHandler.getParameters(inputParams) → execParams   │
│     - Otherwise: use inputParams directly                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PRE-EXECUTE                                              │
│     action.preExecute(execParams) → preExec                  │
│     (Transform/validate params before execution)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VALIDATION                                               │
│     _validateActionParameters(preExec)                       │
│     (Checks mandatory options are present)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. EXECUTE                                                  │
│     action.execute(preExec) → exec                           │
│     (Core business logic)                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. POST-EXECUTE                                             │
│     action.postExecute(exec) → actionResult                  │
│     (Process/transform execution results)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. OUTPUT HANDLING                                          │
│     - If success: outputHandler.parse(actionResult)          │
│     - If error: outputHandler.parseError(actionResult)       │
└─────────────────────────────────────────────────────────────┘
```

## Builder Pattern

Commands are created using the `CommandBuilder` class accessed via `Command.Builder`:

```javascript
const command = Command.Builder
    .withOptions(options)
    .withAction(MyAction)
    .withInput(MyInputHandler)
    .withOutput(MyOutputHandler)
    .build();
```

### Builder Methods

| Method | Description |
|--------|-------------|
| `withOptions(options)` | Set command options |
| `withAction(action)` | Set the action class |
| `withInput(input)` | Set the input handler class |
| `withOutput(output)` | Set the output handler class |
| `neverInteractive()` | Disable interactive mode |
| `alwaysInteractive()` | Force interactive mode |
| `build()` | Create the Command instance |

## Base Classes

### BaseAction (`src/commands/base/BaseAction.js`)

Abstract base class for command actions.

```javascript
class BaseAction {
    constructor(options)       // Initialize with options
    async preExecute(params)   // Transform params before execution (default: passthrough)
    async execute(params)      // Core logic (must be overridden)
    async postExecute(result)  // Process results after execution (default: passthrough)
}
```

The `BaseAction` also initializes an `SdkExecutor` for executing SDK operations.

### BaseInputHandler (`src/commands/base/BaseInputHandler.js`)

Abstract base class for input handling.

```javascript
class BaseInputHandler {
    constructor(options)         // Initialize with options
    async getParameters(params)  // Gather/transform input params (default: passthrough)
}
```

### BaseOutputHandler (`src/commands/base/BaseOutputHandler.js`)

Abstract base class for output formatting.

```javascript
class BaseOutputHandler {
    constructor(options)          // Initialize with options
    parse(actionResult)           // Format success output (default: passthrough)
    parseError(actionResult)      // Format error output (logs error messages)
}
```

## ActionResult

All commands must return an `ActionResult` object from `services/actionresult/ActionResult.js`.

### Creating Success Results

```javascript
const { ActionResult } = require('../../services/actionresult/ActionResult');

return ActionResult.Builder
    .withData({ /* result data */ })
    .withResultMessage('Operation completed successfully')
    .build();
```

### Creating Error Results

```javascript
return ActionResult.Builder
    .withErrors(['Error message 1', 'Error message 2'])
    .build();
```

## Example: Creating a New Command

### 1. Create the Action

```javascript
// src/commands/example/ExampleAction.js
const BaseAction = require('../base/BaseAction');
const { ActionResult } = require('../../services/actionresult/ActionResult');

module.exports = class ExampleAction extends BaseAction {
    async preExecute(params) {
        // Optional: transform params before execution
        return { ...params, timestamp: Date.now() };
    }

    async execute(params) {
        // Core business logic
        try {
            const result = await this._sdkExecutor.execute(/* ... */);
            return ActionResult.Builder.withData(result).build();
        } catch (error) {
            return ActionResult.Builder.withErrors([error.message]).build();
        }
    }

    async postExecute(actionResult) {
        // Optional: post-process results
        return actionResult;
    }
};
```

### 2. Create the Input Handler

```javascript
// src/commands/example/ExampleInputHandler.js
const BaseInputHandler = require('../base/BaseInputHandler');

module.exports = class ExampleInputHandler extends BaseInputHandler {
    async getParameters(params) {
        // Prompt for missing parameters in interactive mode
        if (!params.name) {
            params.name = await this._promptForName();
        }
        return params;
    }
};
```

### 3. Create the Output Handler

```javascript
// src/commands/example/ExampleOutputHandler.js
const BaseOutputHandler = require('../base/BaseOutputHandler');

module.exports = class ExampleOutputHandler extends BaseOutputHandler {
    parse(actionResult) {
        this._log.info(`Success: ${actionResult.resultMessage}`);
        return actionResult;
    }
};
```

### 4. Create the Command Factory

```javascript
// src/commands/example/ExampleCommand.js
const Command = require('../Command');
const ExampleAction = require('./ExampleAction');
const ExampleInputHandler = require('./ExampleInputHandler');
const ExampleOutputHandler = require('./ExampleOutputHandler');

module.exports = {
    create(options) {
        return Command.Builder
            .withOptions(options)
            .withAction(ExampleAction)
            .withInput(ExampleInputHandler)
            .withOutput(ExampleOutputHandler)
            .build();
    }
};
```

## Validation

The `CommandOptionsValidator` (`src/core/CommandOptionsValidator.js`) validates that all mandatory options are present before command execution. Validation errors are thrown using `throwValidationException` from `utils/ExceptionUtils.js`.

Validation occurs after `preExecute` but before `execute`, allowing `preExecute` to set default values or derive parameters before validation.

## File Structure

```
src/commands/
├── Command.js                    # Main Command class with Builder
├── base/
│   ├── BaseAction.js            # Abstract action base class
│   ├── BaseInputHandler.js      # Abstract input handler base class
│   └── BaseOutputHandler.js     # Abstract output handler base class
└── <command-group>/
    └── <command-name>/
        ├── <Command>Action.js
        ├── <Command>Command.js
        ├── <Command>InputHandler.js
        └── <Command>OutputHandler.js
```
