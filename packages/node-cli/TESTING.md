# INTELLIJ example

To debug in IntelliJ IDEA, create a Node.js Run/Debug configuration:

IntelliJ Setup

1. Run → Edit Configurations → + → Node.js
2. Configure these settings:
   - Name: Debug SuiteCloud CLI
   - Node interpreter: Your node path (e.g., /usr/local/bin/node)
   - Working directory: /Users/gerald.gillespie/code/fs-suitecloud-sdk/packages/node-cli
   - JavaScript file: src/suitecloud.js
   - Application parameters: custom:hello --prompt hi
3. Click OK to save

Now you can set breakpoints anywhere in the code and hit Debug (the bug icon) to run with breakpoints active.

# Node Debugger

If you prefer to start from terminal and attach:

1. Run from terminal:
   cd /Users/gerald.gillespie/code/fs-suitecloud-sdk/packages/node-cli
   node --inspect-brk src/suitecloud.js custom:hello --prompt hi
2. In IntelliJ: Run → Attach to Node.js/Chrome and connect to the default port 9229

The --inspect-brk flag pauses execution on the first line, giving you time to attach and set breakpoints before the command runs.