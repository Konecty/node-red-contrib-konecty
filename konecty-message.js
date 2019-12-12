const api = require('./api');
const STANDARD_TYPES = ['str', 'num', 'json', 're', 'date', 'bin', 'msg', 'flow', 'global', 'bool', 'jsonata', 'env'];

module.exports = function(RED) {
	function KonectyMessageNode(config) {
		RED.nodes.createNode(this, config);
		const node = this;
		node.server = RED.nodes.getNode(config.server);
		node.on('input', function(msg) {
			const { host, key } = node.server;

			let token = key;
			if (config.token && config.tokenType) {
				const userToken = RED.util.evaluateNodeProperty(config.token, config.tokenType, this, msg);
				if (/[^ ]+/.test(userToken)) {
					token = userToken;
				}
			}

			const apiInstance = api({ host, key: token });

            var data = JSON.parse(config.extraFields) || msg.payload;

			node.status({});
			if (!Array.isArray(data) || data.length === 0) {
				node.warn(RED._('konecty-message.errors.invalid-data'));
				node.status({ fill: 'red', shape: 'ring', text: 'konecty-message.errors.invalid-data' });
				return;
            }
            
            data.unshift({ n: "type", t: "picklist", vt: config.originType, v: config.origin, il: false });
            data.unshift({ n: "subject", t: "text", vt: config.subjectType, v: config.subject, il: false });
            data.unshift({ n: "body", t: "richText", vt: config.messageType, v: config.message, il: false });

            if (config.to && config.to.length > 0) {
				data.unshift({ n: "to", t: "text", vt: config.toType, v: config.to, il: false });
				data.unshift({ n: "status", t: "picklist", vt: 'opt', v: 'Send', il: false });
			}

			let body = data.reduce((acc, { n, t, vt, v, il }) => {
				let value;
				switch (t) {
					case 'email':
						if (STANDARD_TYPES.includes(vt)) {
							value = JSON.parse(RED.util.evaluateNodeProperty(v, vt, this, msg));
						} else {
							value = {
								type: vt,
								address: v
							};
						}
						break;
					case 'date':
					case 'dateTime':
						value = Date.parse(RED.util.evaluateNodeProperty(v, vt, this, msg));
						break;
					case 'lookup':
						if (vt === 'form') {
							value = { _id: v.i };
						} else {
							value = { _id: RED.util.evaluateNodeProperty(v, vt, this, msg) };
						}
						break;
					case 'richText':
						if (STANDARD_TYPES.includes(vt)) {
							value = RED.util.evaluateNodeProperty(v, vt, this, msg);
						} else {
							value = v;
						}
						break;
					case 'money':
						if (STANDARD_TYPES.includes(vt)) {
							value = { value: Number(RED.util.evaluateNodeProperty(v, vt, this, msg)) };
						} else {
							value = {
								currency: vt,
								value: Number(v)
							};
						}
						break;
					case 'boolean':
						value = /^true$/i.test(RED.util.evaluateNodeProperty(v, vt, this, msg));
						break;
					case 'picklist':
						if (STANDARD_TYPES.includes(vt)) {
							value = RED.util.evaluateNodeProperty(v, vt, this, msg);
						} else {
							value = v;
						}
						break;
					case 'address':
					case 'personName':
						if (vt === 'form') {
							const result = Object.keys(v).reduce(
								(acc, k) => ({
									...acc,
									[k]: RED.util.evaluateNodeProperty(v[k].v, v[k].vt, this, msg)
								}),
								{}
							);
							value = result;
						} else {
							value = JSON.parse(RED.util.evaluateNodeProperty(v, vt, this, msg));
						}
						break;
					default:
						value = RED.util.evaluateNodeProperty(v, vt, this, msg);
						break;
				}
				if (/true/i.test(il) && !Array.isArray(value)) {
					return { ...acc, [n]: [value] };
				}
				return { ...acc, [n]: value };
			}, {});
			
			// Remove null-like values from body
			body = Object.keys(body).reduce((accum, key) => {
				const item = body[key];
				if (item == null) {
					return accum;
				}
				if (Array.isArray(item)) {
					const first = item[0];
					if (first == null || (first.__proto__ === Object.prototype && first.hasOwnProperty('_id') && first._id == null)) {
						return accum;
					}
				}
				if (item.__proto__ === Object.prototype) {
					if (item.hasOwnProperty('_id') && item._id == null) {
						return accum;
					}
				}
				return Object.assign(accum, { [key]: item });
            }, {});

			const handleKonectyResponse = ({ success, data, errors }) => {
				if (success) {
					node.send([
						{
							...msg,
							payload: data
						}
					]);
					node.status({});
				} else {
					node.send([
						null,
						{
							...msg,
							payload: errors
						}
					]);
					const errMessages = errors.map(({ message }) => message).join('\n');
					node.error(RED._('konecty-message.errors.error-processing', { message: errMessages }));
					node.status({
						fill: 'red',
						shape: 'ring',
						text: RED._('konecty-message.errors.error-processing', { message: errMessages })
					});
				}
			};

            apiInstance.create('Message', body).then(handleKonectyResponse);			
		});
	}
	RED.nodes.registerType('konecty-message', KonectyMessageNode);
};
