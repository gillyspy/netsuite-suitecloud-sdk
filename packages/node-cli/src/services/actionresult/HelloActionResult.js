
const { ActionResult,
	ActionResultBuilder,
	STATUS
} = require('./ActionResult');

class HelloActionResult extends ActionResult {
	constructor(parameters) {
		super(parameters);
	}
}

module.exports.HelloActionResult = HelloActionResult;